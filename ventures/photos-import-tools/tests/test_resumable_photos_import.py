import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from resumable_photos_import import (
    ImportState,
    PhotosImporter,
    build_manifest,
    bulk_preflight_pending,
    discover_importable_photos,
    file_is_ready,
    recover_interrupted,
)


def _make_fake_photos_db(path: Path, filenames: set[str]) -> None:
    with sqlite3.connect(path) as connection:
        connection.execute("CREATE TABLE ZASSET (ZFILENAME TEXT)")
        connection.execute("CREATE TABLE ZADDITIONALASSETATTRIBUTES (ZORIGINALFILENAME TEXT)")
        connection.executemany(
            "INSERT INTO ZASSET (ZFILENAME) VALUES (?)",
            [(name,) for name in filenames],
        )
        connection.commit()


class ResumablePhotosImportTests(unittest.TestCase):
    def test_build_manifest_marks_confirmed_imports(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            first = root / "2026-01-01" / "photos" / "first.JPG"
            second = root / "2026-01-01" / "photos" / "second.jpg"
            third = root / "2026-01-01" / "photos" / "third.jpeg"
            for path in (first, second, third):
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b"jpeg")

            state = ImportState(root / "state.sqlite3")
            build_manifest(state, root, confirmed_imported_count=2, uncertain_count=1, media_type="jpeg")

            self.assertEqual(state.summary()["total"], 3)
            self.assertEqual(state.get_status(first), "imported")
            self.assertEqual(state.get_status(second), "imported")
            self.assertEqual(state.get_status(third), "uncertain")

    def test_discover_importable_photos_includes_jpeg_and_raw(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            jpeg = root / "photo.JPG"
            raw = root / "photo.ARW"
            other = root / "notes.txt"
            jpeg.write_bytes(b"jpeg")
            raw.write_bytes(b"raw")
            other.write_text("skip")

            discovered = discover_importable_photos(root)

            self.assertEqual(discovered, sorted([jpeg, raw]))

    def test_build_manifest_includes_raw_files_only_for_raw_type(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            jpeg = root / "photo.JPG"
            raw = root / "photo.ARW"
            jpeg.write_bytes(b"jpeg")
            raw.write_bytes(b"raw")

            state = ImportState(root / "raw.sqlite3")
            build_manifest(state, root, confirmed_imported_count=0, uncertain_count=0, media_type="raw")

            self.assertEqual(state.summary()["total"], 1)
            self.assertEqual(state.get_status(raw), "pending")
            self.assertIsNone(state.get_status(jpeg))

    def test_next_importable_batch_returns_pending_items(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            first = root / "a.JPG"
            second = root / "b.JPG"
            for path in (first, second):
                path.write_bytes(b"jpeg")
            state = ImportState(root / "state.sqlite3")
            state.upsert(first, "imported")
            state.upsert(second, "pending")

            batch = state.next_importable_batch(5, 8)

            self.assertEqual(len(batch), 1)
            self.assertEqual(batch[0].path, second)

    def test_recover_interrupted_marks_importing_pending(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "state.sqlite3"
            state = ImportState(db_path)
            photo = Path(temp_dir) / "photo.JPG"
            photo.write_bytes(b"jpeg")
            state.upsert(photo, "importing")

            recovered = recover_interrupted(state)

            self.assertEqual(recovered, 1)
            self.assertEqual(state.get_status(photo), "pending")

    def test_skip_uncertain_removes_duplicate_risk_from_import_queue(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            uncertain = root / "uncertain.JPG"
            pending = root / "pending.JPG"
            uncertain.write_bytes(b"jpeg")
            pending.write_bytes(b"jpeg")
            state = ImportState(root / "state.sqlite3")
            state.upsert(uncertain, "uncertain")
            state.upsert(pending, "pending")

            skipped = state.skip_uncertain("timed-out Photos batch may already be imported")
            next_batch = state.next_importable_batch(1, 8)

            self.assertEqual(skipped, 1)
            self.assertEqual(state.get_status(uncertain), "skipped_duplicate_risk")
            self.assertEqual(next_batch[0].path, pending)
            self.assertEqual(state.summary()["skipped_duplicate_risk"], 1)

    def test_existing_photos_item_is_skipped_without_importing(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            photo = root / "already-there.JPG"
            photo.write_bytes(b"jpeg")
            state = ImportState(root / "state.sqlite3")
            state.upsert(photo, "pending")
            importer = FakePhotosImporter(
                state=state,
                state_dir=root,
                event_log=root / "events.jsonl",
                error_log=root / "errors.jsonl",
                status_path=root / "status.json",
                stop_file=root / "STOP",
                per_file_timeout_seconds=1,
                attempts=1,
                batch_size=1,
                photos_db=root / "missing.sqlite",
                use_photos_preflight=True,
                existing_filenames={photo.name},
            )

            exit_code = importer.run()

            self.assertEqual(exit_code, 0)
            self.assertEqual(state.get_status(photo), "imported")
            self.assertEqual(importer.imported_paths, [])

    def test_pending_file_imports_without_photos_duplicate_check(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            photo = root / "new-file.JPG"
            photo.write_bytes(b"jpeg")
            state = ImportState(root / "state.sqlite3")
            state.upsert(photo, "pending")
            importer = FakePhotosImporter(
                state=state,
                state_dir=root,
                event_log=root / "events.jsonl",
                error_log=root / "errors.jsonl",
                status_path=root / "status.json",
                stop_file=root / "STOP",
                per_file_timeout_seconds=1,
                attempts=1,
                batch_size=1,
                photos_db=root / "missing.sqlite",
                existing_filenames=set(),
            )

            exit_code = importer.run()

            self.assertEqual(exit_code, 0)
            self.assertEqual(importer.import_calls, [(photo, False)])

    def test_file_is_ready_true_for_nonempty_file(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "photo.jpg"
            path.write_bytes(b"jpeg")
            self.assertTrue(file_is_ready(path))

    def test_file_is_ready_false_for_missing_file(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "missing.jpg"
            self.assertFalse(file_is_ready(path))

    def test_file_is_ready_survives_vanishing_between_exists_and_stat(self):
        # exists() and stat() are separate syscalls; a file (e.g. an iCloud
        # placeholder) that's evicted in between must not crash the caller --
        # it ran unguarded before this fix, raising FileNotFoundError out of
        # wait_for_file() and aborting the whole importer run.
        class VanishingPath:
            def exists(self) -> bool:
                return True

            def stat(self):
                raise FileNotFoundError("vanished between exists() and stat()")

        self.assertFalse(file_is_ready(VanishingPath()))

    def test_scratch_copy_failure_is_retried_not_fatal_to_the_run(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            good = root / "good.JPG"
            flaky = root / "flaky.JPG"
            good.write_bytes(b"jpeg")
            flaky.write_bytes(b"jpeg")
            state = ImportState(root / "state.sqlite3")
            state.upsert(good, "pending")
            state.upsert(flaky, "pending")
            importer = FakePhotosImporter(
                state=state,
                state_dir=root,
                event_log=root / "events.jsonl",
                error_log=root / "errors.jsonl",
                status_path=root / "status.json",
                stop_file=root / "STOP",
                per_file_timeout_seconds=1,
                attempts=1,
                # scratch_dir staging only happens on the single-item path
                # (import_batch_with_split's multi-item branch imports raw
                # source paths directly), so batch_size=1 is what exercises
                # resolve_import_path here.
                batch_size=1,
                photos_db=root / "missing.sqlite",
                existing_filenames=set(),
                scratch_dir=root / "scratch",
            )

            # Simulates a flaky read on the source (stalled iCloud download)
            # or a full/unwritable scratch volume. Before this fix, the bare
            # OSError from shutil.copy2 wasn't caught by import_single_item's
            # `except PhotosImportError`, so it propagated out of the whole
            # run() loop instead of being retried like any other per-item
            # import failure.
            real_copy2 = __import__("shutil").copy2

            def flaky_copy2(src, dst, *args, **kwargs):
                if Path(src) == flaky:
                    raise OSError("Input/output error")
                return real_copy2(src, dst, *args, **kwargs)

            with mock.patch("resumable_photos_import.shutil.copy2", side_effect=flaky_copy2), \
                    mock.patch("resumable_photos_import.time.sleep", return_value=None):
                exit_code = importer.run()

            self.assertEqual(exit_code, 0)
            self.assertEqual(state.get_status(good), "imported")
            self.assertEqual(state.get_status(flaky), "failed")

    def test_stale_scratch_file_removal_failure_is_retried_not_fatal_to_the_run(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            good = root / "good.JPG"
            flaky = root / "flaky.JPG"
            good.write_bytes(b"jpeg")
            flaky.write_bytes(b"jpeg")
            state = ImportState(root / "state.sqlite3")
            state.upsert(good, "pending")
            state.upsert(flaky, "pending")
            scratch_dir = root / "scratch"
            scratch_dir.mkdir()
            # Simulates a leftover partial file from a prior attempt that was
            # killed mid-copy (SIGKILL from a stuck watchdog restart, power
            # loss): resolve_import_path must clear it before staging a
            # fresh copy.
            stale = scratch_dir / "flaky.JPG"
            stale.write_bytes(b"partial")

            importer = FakePhotosImporter(
                state=state,
                state_dir=root,
                event_log=root / "events.jsonl",
                error_log=root / "errors.jsonl",
                status_path=root / "status.json",
                stop_file=root / "STOP",
                per_file_timeout_seconds=1,
                attempts=1,
                batch_size=1,
                photos_db=root / "missing.sqlite",
                existing_filenames=set(),
                scratch_dir=scratch_dir,
            )

            # Simulates the stale scratch file being un-removable right when
            # resolve_import_path tries to clear it (a network/iCloud-backed
            # scratch mount hiccup, a permission change). Before this fix,
            # this unlink() call sat outside the try/except OSError that
            # guards shutil.copy2, so the bare OSError wasn't caught by
            # import_single_item's `except PhotosImportError` and
            # propagated out of the whole run() loop instead of being
            # retried like any other per-item import failure.
            real_unlink = Path.unlink

            def flaky_unlink(self, *args, **kwargs):
                if self == stale:
                    raise OSError("Input/output error")
                return real_unlink(self, *args, **kwargs)

            with mock.patch.object(Path, "unlink", flaky_unlink), \
                    mock.patch("resumable_photos_import.time.sleep", return_value=None):
                exit_code = importer.run()

            self.assertEqual(exit_code, 0)
            self.assertEqual(state.get_status(good), "imported")
            self.assertEqual(state.get_status(flaky), "failed")

    def test_check_disk_space_survives_transient_stat_failure(self):
        # state_dir is typically an iCloud-synced path; a transient stat
        # failure there (sync hiccup, momentarily unreachable network mount)
        # ran unguarded before this fix, raising straight out of
        # check_disk_space() -- uncaught anywhere in run()'s while loop --
        # and crashing the whole import instead of being treated like any
        # other retryable condition.
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            state = ImportState(root / "state.sqlite3")
            importer = FakePhotosImporter(
                state=state,
                state_dir=root,
                event_log=root / "events.jsonl",
                error_log=root / "errors.jsonl",
                status_path=root / "status.json",
                stop_file=root / "STOP",
                per_file_timeout_seconds=1,
                attempts=1,
                batch_size=1,
                photos_db=root / "missing.sqlite",
                existing_filenames=set(),
            )

            with mock.patch(
                "resumable_photos_import.shutil.disk_usage",
                side_effect=OSError("Input/output error"),
            ):
                self.assertFalse(importer.check_disk_space())

    def test_run_survives_transient_disk_space_check_failure(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            photo = root / "photo.JPG"
            photo.write_bytes(b"jpeg")
            state = ImportState(root / "state.sqlite3")
            state.upsert(photo, "pending")
            importer = FakePhotosImporter(
                state=state,
                state_dir=root,
                event_log=root / "events.jsonl",
                error_log=root / "errors.jsonl",
                status_path=root / "status.json",
                stop_file=root / "STOP",
                per_file_timeout_seconds=1,
                attempts=1,
                batch_size=1,
                photos_db=root / "missing.sqlite",
                existing_filenames=set(),
            )

            real_disk_usage = __import__("shutil").disk_usage
            calls = {"count": 0}

            def flaky_disk_usage(path):
                calls["count"] += 1
                if calls["count"] == 1:
                    raise OSError("Input/output error")
                return real_disk_usage(path)

            with mock.patch(
                "resumable_photos_import.shutil.disk_usage", side_effect=flaky_disk_usage
            ), mock.patch("resumable_photos_import.time.sleep", return_value=None):
                exit_code = importer.run()

            self.assertEqual(exit_code, 0)
            self.assertEqual(state.get_status(photo), "imported")

    def test_cleanup_scratch_failure_does_not_lose_the_imported_marking(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            photo = root / "photo.JPG"
            photo.write_bytes(b"jpeg")
            state = ImportState(root / "state.sqlite3")
            state.upsert(photo, "pending")
            importer = FakePhotosImporter(
                state=state,
                state_dir=root,
                event_log=root / "events.jsonl",
                error_log=root / "errors.jsonl",
                status_path=root / "status.json",
                stop_file=root / "STOP",
                per_file_timeout_seconds=1,
                attempts=1,
                batch_size=1,
                photos_db=root / "missing.sqlite",
                existing_filenames=set(),
                scratch_dir=root / "scratch",
            )

            # Photos already has the file at this point (import_paths_osascript
            # succeeded); a failure while deleting the scratch copy must not
            # undo that. Before this fix, cleanup_scratch ran before
            # mark_imported, so this OSError -- uncaught by
            # `except PhotosImportError` -- left the item stuck in
            # "importing" (never picked up again by next_importable_batch in
            # this process) and set up a duplicate re-import of an
            # already-imported file on the next run.
            real_unlink = Path.unlink

            def flaky_unlink(self, *args, **kwargs):
                if self.parent == importer.scratch_dir:
                    raise OSError("Permission denied")
                return real_unlink(self, *args, **kwargs)

            with mock.patch.object(Path, "unlink", flaky_unlink):
                exit_code = importer.run()

            self.assertEqual(exit_code, 0)
            self.assertEqual(state.get_status(photo), "imported")
            self.assertEqual(len(importer.imported_paths), 1)

    def test_ambiguous_names_flags_shared_basename_across_directories(self):
        # Camera-generated basenames (DSC00001.JPG) aren't globally unique --
        # two distinct source files from different cards/folders can share
        # one. Every basename-only Photos-library match in this module needs
        # to know when a name is ambiguous like this.
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            first = root / "card-a" / "DSC00001.JPG"
            second = root / "card-b" / "DSC00001.JPG"
            unique = root / "card-a" / "DSC00002.JPG"
            for path in (first, second, unique):
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b"jpeg")
            state = ImportState(root / "state.sqlite3")
            state.upsert(first, "pending")
            state.upsert(second, "pending")
            state.upsert(unique, "pending")

            self.assertEqual(state.ambiguous_names(), {"DSC00001.JPG"})

    def test_bulk_preflight_pending_does_not_mark_ambiguous_basename_imported(self):
        # Before this fix, bulk_preflight_pending matched on Path(path).name
        # alone: once ANY file named DSC00001.JPG was in Photos, every
        # tracked path sharing that basename -- even a completely different
        # photo from a different card -- was marked "imported" and never
        # revisited by next_importable_batch, silently losing it.
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            first = root / "card-a" / "DSC00001.JPG"
            second = root / "card-b" / "DSC00001.JPG"
            first.parent.mkdir(parents=True, exist_ok=True)
            second.parent.mkdir(parents=True, exist_ok=True)
            first.write_bytes(b"jpeg-a")
            second.write_bytes(b"jpeg-b")
            state = ImportState(root / "state.sqlite3")
            state.upsert(first, "pending")
            state.upsert(second, "pending")
            photos_db = root / "photos.sqlite"
            _make_fake_photos_db(photos_db, {"DSC00001.JPG"})

            marked = bulk_preflight_pending(state, photos_db)

            self.assertEqual(marked, 0)
            self.assertEqual(state.get_status(first), "pending")
            self.assertEqual(state.get_status(second), "pending")

    def test_bulk_preflight_pending_still_marks_unique_basename_imported(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            photo = root / "already-there.JPG"
            photo.write_bytes(b"jpeg")
            state = ImportState(root / "state.sqlite3")
            state.upsert(photo, "pending")
            photos_db = root / "photos.sqlite"
            _make_fake_photos_db(photos_db, {"already-there.JPG"})

            marked = bulk_preflight_pending(state, photos_db)

            self.assertEqual(marked, 1)
            self.assertEqual(state.get_status(photo), "imported")

    def test_photos_contains_file_does_not_shortcut_ambiguous_basename(self):
        # Same collision, exercised through the real (non-Fake)
        # PhotosImporter.photos_contains_file/filename_in_photos -- these
        # gate prepare_batch's pre-import skip and handle_item_error's
        # "recovered_already_imported" path, so a false "yes, Photos already
        # has this" for the wrong file is exactly how a distinct photo gets
        # dropped without ever being copied.
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            first = root / "card-a" / "DSC00001.JPG"
            second = root / "card-b" / "DSC00001.JPG"
            first.parent.mkdir(parents=True, exist_ok=True)
            second.parent.mkdir(parents=True, exist_ok=True)
            first.write_bytes(b"jpeg-a")
            second.write_bytes(b"jpeg-b")
            state = ImportState(root / "state.sqlite3")
            state.upsert(first, "pending")
            state.upsert(second, "pending")
            photos_db = root / "photos.sqlite"
            _make_fake_photos_db(photos_db, {"DSC00001.JPG"})
            importer = PhotosImporter(
                state=state,
                state_dir=root,
                event_log=root / "events.jsonl",
                error_log=root / "errors.jsonl",
                status_path=root / "status.json",
                stop_file=root / "STOP",
                per_file_timeout_seconds=1,
                attempts=1,
                batch_size=1,
                photos_db=photos_db,
                use_photos_preflight=True,
            )

            self.assertFalse(importer.photos_contains_file(first))
            self.assertFalse(importer.photos_contains_file(second))
            self.assertFalse(importer.filename_in_photos("DSC00001.JPG"))

    def test_photos_contains_file_still_shortcuts_unique_basename(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            photo = root / "already-there.JPG"
            photo.write_bytes(b"jpeg")
            state = ImportState(root / "state.sqlite3")
            state.upsert(photo, "pending")
            photos_db = root / "photos.sqlite"
            _make_fake_photos_db(photos_db, {"already-there.JPG"})
            importer = PhotosImporter(
                state=state,
                state_dir=root,
                event_log=root / "events.jsonl",
                error_log=root / "errors.jsonl",
                status_path=root / "status.json",
                stop_file=root / "STOP",
                per_file_timeout_seconds=1,
                attempts=1,
                batch_size=1,
                photos_db=photos_db,
                use_photos_preflight=True,
            )

            self.assertTrue(importer.photos_contains_file(photo))


class FakePhotosImporter(PhotosImporter):
    def __init__(self, *args, existing_filenames: set[str], **kwargs):
        super().__init__(*args, **kwargs)
        self.existing_filenames = existing_filenames
        self.imported_paths: list[Path] = []
        self.import_calls: list[tuple[Path, bool]] = []

    def ensure_photos_ready(self) -> None:
        return

    def photos_contains_file(self, path: Path) -> bool:
        return path.name in self.existing_filenames

    def import_paths_osascript(self, paths: list[Path], *, duplicate_check: bool) -> None:
        for path in paths:
            self.imported_paths.append(path)
            self.import_calls.append((path, duplicate_check))


if __name__ == "__main__":
    unittest.main()
