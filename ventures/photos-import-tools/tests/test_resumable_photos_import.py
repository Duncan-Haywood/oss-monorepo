import tempfile
import unittest
from pathlib import Path

from resumable_photos_import import (
    ImportState,
    PhotosImporter,
    build_manifest,
    discover_importable_photos,
    file_is_ready,
    recover_interrupted,
)


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
