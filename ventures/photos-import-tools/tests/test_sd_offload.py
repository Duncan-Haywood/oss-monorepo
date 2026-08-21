import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from sd_offload import (
    CardSpec,
    OffloadStats,
    build_rsync_cmd,
    count_source,
    evict_tree,
    iter_media_files,
    offload_all,
    offload_card,
    offload_exit_code,
    rsync_copy,
    sha256_file,
    verify_and_manifest,
)


class Sha256FileTests(unittest.TestCase):
    def test_hash_is_stable_and_content_sensitive(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            a = Path(temp_dir) / "a.bin"
            b = Path(temp_dir) / "b.bin"
            a.write_bytes(b"identical")
            b.write_bytes(b"identical")
            self.assertEqual(sha256_file(a), sha256_file(b))
            b.write_bytes(b"different")
            self.assertNotEqual(sha256_file(a), sha256_file(b))


class IterMediaFilesTests(unittest.TestCase):
    def test_filters_by_extension_and_excludes_system_dirs(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "DCIM").mkdir()
            (root / "DCIM" / "IMG_0001.JPG").write_bytes(b"x")
            (root / "DCIM" / "clip.MP4").write_bytes(b"x")
            (root / "DCIM" / "notes.txt").write_bytes(b"x")
            (root / ".Spotlight-V100").mkdir()
            (root / ".Spotlight-V100" / "index.JPG").write_bytes(b"x")

            found = {p.name for p in iter_media_files(root)}

            self.assertEqual(found, {"IMG_0001.JPG", "clip.MP4"})

    def test_missing_root_returns_empty(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            self.assertEqual(iter_media_files(Path(temp_dir) / "nope"), [])


class VerifyAndManifestTests(unittest.TestCase):
    def _make_card(self, root: Path) -> CardSpec:
        source = root / "source"
        dest = root / "dest"
        (source / "DCIM").mkdir(parents=True)
        (dest / "DCIM").mkdir(parents=True)
        return CardSpec(name="Test", source=source, dest=dest, include_paths=("DCIM",))

    def _write(self, path: Path, data: bytes) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def test_good_copy_verifies_and_writes_manifest(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            card = self._make_card(root)
            self._write(card.source / "DCIM" / "IMG_1.JPG", b"photo-bytes")
            self._write(card.dest / "DCIM" / "IMG_1.JPG", b"photo-bytes")
            stats = OffloadStats(card=card.name)
            manifest = root / "manifest.json"

            verify_and_manifest(card, stats, manifest, root / "log.txt")

            self.assertEqual(stats.verified_files, 1)
            self.assertEqual(stats.copied_files, 1)
            self.assertEqual(stats.errors, [])
            payload = json.loads(manifest.read_text())
            self.assertEqual(payload["files"][0]["status"], "verified")

    def test_missing_dest_is_flagged(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            card = self._make_card(root)
            self._write(card.source / "DCIM" / "IMG_1.JPG", b"photo-bytes")
            stats = OffloadStats(card=card.name)

            verify_and_manifest(card, stats, root / "m.json", root / "log.txt")

            self.assertEqual(stats.verified_files, 0)
            self.assertEqual(len(stats.errors), 1)
            self.assertIn("Missing after copy", stats.errors[0])

    def test_size_mismatch_is_flagged(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            card = self._make_card(root)
            self._write(card.source / "DCIM" / "IMG_1.JPG", b"full-length-photo")
            self._write(card.dest / "DCIM" / "IMG_1.JPG", b"truncated")
            stats = OffloadStats(card=card.name)

            verify_and_manifest(card, stats, root / "m.json", root / "log.txt")

            self.assertEqual(stats.verified_files, 0)
            self.assertIn("Size mismatch", stats.errors[0])

    def test_same_size_corruption_passes_size_check_but_fails_hash(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            card = self._make_card(root)
            self._write(card.source / "DCIM" / "IMG_1.JPG", b"AAAAAAAA")
            # Same byte count, different content: exactly what size-only misses.
            self._write(card.dest / "DCIM" / "IMG_1.JPG", b"BBBBBBBB")
            stats = OffloadStats(card=card.name)

            verify_and_manifest(card, stats, root / "m.json", root / "log.txt", verify_hash=True)

            self.assertEqual(stats.verified_files, 0)
            self.assertIn("Hash mismatch", stats.errors[0])

    def test_same_size_corruption_silently_passes_size_only_check(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            card = self._make_card(root)
            self._write(card.source / "DCIM" / "IMG_1.JPG", b"AAAAAAAA")
            self._write(card.dest / "DCIM" / "IMG_1.JPG", b"BBBBBBBB")
            stats = OffloadStats(card=card.name)

            verify_and_manifest(card, stats, root / "m.json", root / "log.txt", verify_hash=False)

            # Documents the gap the hash mode closes: size-only reports success.
            self.assertEqual(stats.verified_files, 1)
            self.assertEqual(stats.errors, [])

    def test_read_error_on_one_file_does_not_abort_the_others(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            card = self._make_card(root)
            self._write(card.source / "DCIM" / "IMG_1.JPG", b"photo-bytes")
            self._write(card.dest / "DCIM" / "IMG_1.JPG", b"photo-bytes")
            self._write(card.source / "DCIM" / "IMG_2.JPG", b"more-bytes")
            self._write(card.dest / "DCIM" / "IMG_2.JPG", b"more-bytes")
            stats = OffloadStats(card=card.name)
            manifest = root / "manifest.json"

            # Simulates a dest file that was evicted to iCloud-only after an
            # earlier run and now fails to re-download (offline, stalled
            # sync) when this run tries to hash it -- exactly the case a bare
            # sha256_file() call cannot recover from on its own.
            real_sha256 = sha256_file

            def flaky_sha256(path: Path) -> str:
                if path.name == "IMG_1.JPG" and "dest" in path.parts:
                    raise OSError("Resource temporarily unavailable")
                return real_sha256(path)

            with mock.patch("sd_offload.sha256_file", side_effect=flaky_sha256):
                verify_and_manifest(card, stats, manifest, root / "log.txt", verify_hash=True)

            self.assertEqual(stats.verified_files, 1)
            self.assertEqual(len(stats.errors), 1)
            self.assertIn("Read error: DCIM/IMG_1.JPG", stats.errors[0])
            payload = json.loads(manifest.read_text())
            statuses = {entry["relative_path"]: entry["status"] for entry in payload["files"]}
            self.assertEqual(statuses["DCIM/IMG_1.JPG"], "read_error")
            self.assertEqual(statuses["DCIM/IMG_2.JPG"], "verified")

    def test_source_read_error_on_one_file_does_not_abort_the_others(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            card = self._make_card(root)
            self._write(card.source / "DCIM" / "IMG_1.JPG", b"photo-bytes")
            self._write(card.dest / "DCIM" / "IMG_1.JPG", b"photo-bytes")
            self._write(card.source / "DCIM" / "IMG_2.JPG", b"more-bytes")
            self._write(card.dest / "DCIM" / "IMG_2.JPG", b"more-bytes")
            stats = OffloadStats(card=card.name)
            manifest = root / "manifest.json"
            img1 = card.source / "DCIM" / "IMG_1.JPG"
            img2 = card.source / "DCIM" / "IMG_2.JPG"

            # Simulates a flaky card reader or a card ejected mid-verification:
            # the *source*-side stat() used to seed each manifest entry fails,
            # as opposed to the dest-side read #370 already made resilient.
            real_stat = Path.stat

            def flaky_stat(self, *args, **kwargs):
                if self == img1:
                    raise OSError("Input/output error")
                return real_stat(self, *args, **kwargs)

            with mock.patch("sd_offload.iter_media_files", return_value=[img1, img2]), \
                    mock.patch.object(Path, "stat", flaky_stat):
                verify_and_manifest(card, stats, manifest, root / "log.txt")

            self.assertEqual(stats.verified_files, 1)
            self.assertEqual(len(stats.errors), 1)
            self.assertIn("Read error: DCIM/IMG_1.JPG", stats.errors[0])
            payload = json.loads(manifest.read_text())
            statuses = {entry["relative_path"]: entry["status"] for entry in payload["files"]}
            self.assertEqual(statuses["DCIM/IMG_1.JPG"], "read_error")
            self.assertEqual(statuses["DCIM/IMG_2.JPG"], "verified")

    def test_hash_mode_records_digest_in_manifest(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            card = self._make_card(root)
            self._write(card.source / "DCIM" / "IMG_1.JPG", b"photo-bytes")
            self._write(card.dest / "DCIM" / "IMG_1.JPG", b"photo-bytes")
            stats = OffloadStats(card=card.name)
            manifest = root / "manifest.json"

            verify_and_manifest(card, stats, manifest, root / "log.txt", verify_hash=True)

            entry = json.loads(manifest.read_text())["files"][0]
            self.assertEqual(entry["status"], "verified")
            self.assertEqual(entry["sha256"], sha256_file(card.dest / "DCIM" / "IMG_1.JPG"))


class CountSourceTests(unittest.TestCase):
    def _make_card(self, root: Path) -> CardSpec:
        source = root / "source"
        dest = root / "dest"
        (source / "DCIM").mkdir(parents=True)
        return CardSpec(name="Test", source=source, dest=dest, include_paths=("DCIM",))

    def test_counts_files_and_bytes(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            card = self._make_card(root)
            (card.source / "DCIM" / "IMG_1.JPG").write_bytes(b"12345")
            (card.source / "DCIM" / "IMG_2.JPG").write_bytes(b"1234567890")

            total_files, total_bytes = count_source(card)

            self.assertEqual(total_files, 2)
            self.assertEqual(total_bytes, 15)

    def test_unreadable_file_is_skipped_not_fatal(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            card = self._make_card(root)
            good = card.source / "DCIM" / "IMG_1.JPG"
            flaky = card.source / "DCIM" / "IMG_2.JPG"
            good.write_bytes(b"12345")
            flaky.write_bytes(b"1234567890")

            # Simulates a file that disappears or goes unreadable (flaky card
            # reader, card ejected) between the rglob() scan in
            # iter_media_files and this stat() call. Before this fix that
            # raised OSError straight out of count_source, crashing
            # offload_card before rsync_copy ever ran -- unlike the already
            # guarded post-copy verification loop, this aborted the whole
            # card with zero files copied.
            real_stat = Path.stat

            def flaky_stat(self, *args, **kwargs):
                if self == flaky:
                    raise OSError("Input/output error")
                return real_stat(self, *args, **kwargs)

            with mock.patch("sd_offload.iter_media_files", return_value=[good, flaky]), \
                    mock.patch.object(Path, "stat", flaky_stat):
                total_files, total_bytes = count_source(card)

            self.assertEqual(total_files, 1)
            self.assertEqual(total_bytes, 5)


class OffloadAllTests(unittest.TestCase):
    def _make_card(self, root: Path, name: str) -> CardSpec:
        source = root / name / "source"
        dest = root / name / "dest"
        (source / "DCIM").mkdir(parents=True)
        return CardSpec(name=name, source=source, dest=dest, include_paths=("DCIM",))

    def test_one_card_failing_does_not_abort_the_others_or_lose_their_summary(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            failing = self._make_card(root, "Failing")
            healthy = self._make_card(root, "Healthy")

            def fake_offload_card(card, card_log, manifest, verify_hash=False):
                if card.name == "Failing":
                    # Simulates rsync raising RuntimeError from a card ejected
                    # mid-copy, a network drop, or a permission error.
                    raise RuntimeError("rsync failed with exit code 23")
                return OffloadStats(
                    card=card.name,
                    verified_files=1,
                    started_at="t0",
                    finished_at="t1",
                )

            with mock.patch("sd_offload.offload_card", side_effect=fake_offload_card):
                summary = offload_all([failing, healthy], root, root / "_logs")

            self.assertEqual(len(summary), 2)
            self.assertEqual(summary[0]["card"], "Failing")
            self.assertIn("Offload failed", summary[0]["errors"][0])
            # The card attempted after the failure still ran and verified --
            # a crash on the first card must not block the second.
            self.assertEqual(summary[1]["card"], "Healthy")
            self.assertEqual(summary[1]["errors"], [])
            self.assertEqual(summary[1]["verified_files"], 1)
            # A run with a failed card is "offloaded with errors", never
            # silently reported as clean.
            self.assertEqual(offload_exit_code(summary), 1)

    def test_unmounted_card_is_skipped_not_recorded_as_a_failure(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            unmounted = CardSpec(
                name="Unmounted",
                source=root / "does-not-exist",
                dest=root / "dest",
                include_paths=("DCIM",),
            )

            summary = offload_all([unmounted], root, root / "_logs")

            self.assertEqual(summary, [])


class OffloadCardTests(unittest.TestCase):
    def _make_card(self, root: Path) -> CardSpec:
        source = root / "source"
        dest = root / "dest"
        (source / "DCIM").mkdir(parents=True)
        (source / "MISC").mkdir(parents=True)
        return CardSpec(name="Insta360_X5", source=source, dest=dest, include_paths=("DCIM", "MISC"))

    def test_one_include_path_rsync_failure_does_not_abort_the_card(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            card = self._make_card(root)
            (card.source / "DCIM" / "IMG_1.JPG").write_bytes(b"12345")
            (card.source / "MISC" / "IMG_2.JPG").write_bytes(b"67890")

            # rsync failing outright on the first include path (disk-full on
            # staging, source card ejected mid-copy, a permission error on the
            # whole volume) used to raise RuntimeError straight out of this
            # loop, and offload_card had no try/except -- that aborted the
            # rest of this card's include_paths (e.g. MISC never attempted
            # after DCIM fails) before the manifest was ever written.
            def fake_rsync_copy(source, dest, log_path):
                if source.name == "DCIM":
                    raise RuntimeError("rsync failed with exit code 23")
                dest.mkdir(parents=True, exist_ok=True)
                for path in source.iterdir():
                    (dest / path.name).write_bytes(path.read_bytes())

            with mock.patch("sd_offload.wait_for_disk_space", return_value=None), \
                    mock.patch("sd_offload.rsync_copy", side_effect=fake_rsync_copy):
                stats = offload_card(
                    card,
                    root / "card.log",
                    root / "manifest.json",
                )

            self.assertTrue(any("Copy failed for DCIM" in e for e in stats.errors))
            # MISC must still be attempted after DCIM fails.
            self.assertTrue((card.dest / "MISC" / "IMG_2.JPG").exists())
            self.assertIsNotNone(stats.finished_at)
            self.assertNotEqual(stats.finished_at, "")
            self.assertTrue((root / "manifest.json").exists())


class OffloadExitCodeTests(unittest.TestCase):
    def test_no_card_mounted_is_not_reported_as_success(self):
        # The dangerous case: an empty summary means nothing was offloaded, so
        # a wrapper that ejects/reformats on exit 0 must not treat it as done.
        self.assertEqual(offload_exit_code([]), 2)

    def test_clean_offload_returns_zero(self):
        self.assertEqual(offload_exit_code([{"errors": []}]), 0)

    def test_offload_with_errors_returns_one(self):
        self.assertEqual(
            offload_exit_code([{"errors": []}, {"errors": ["Size mismatch: x"]}]), 1
        )


class EvictTreeTests(unittest.TestCase):
    def test_skips_rsync_in_flight_temp_file(self):
        # rsync writes to a hidden temp file with a random suffix (e.g.
        # ".IMG_0001.JPG.a1B2c3") while a copy is still in progress, renaming
        # it to the real name only once the transfer completes. The
        # background evictor thread runs on a timer *concurrently* with
        # rsync, so if evict_tree ever walks into that temp file it would be
        # calling brctl evict on a file rsync still has open for write -- a
        # silent corruption risk on whatever file rsync happens to be
        # mid-transfer on. It must only ever touch finished, media-extension
        # files, the same set iter_media_files already restricts to.
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "IMG_0001.JPG").write_bytes(b"done")
            (root / ".IMG_0002.JPG.a1B2c3").write_bytes(b"in-flight")
            (root / "notes.txt").write_bytes(b"not media")

            with mock.patch("sd_offload.evict", return_value=True) as mock_evict:
                count = evict_tree(root)

            evicted = {call.args[0].name for call in mock_evict.call_args_list}
            self.assertEqual(evicted, {"IMG_0001.JPG"})
            self.assertEqual(count, 1)

    def test_missing_root_returns_zero(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            self.assertEqual(evict_tree(Path(temp_dir) / "nope"), 0)


class RsyncCopyThreadLeakTests(unittest.TestCase):
    def test_launch_failure_still_stops_background_evictor_thread(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "source"
            dest = root / "dest"
            source.mkdir()

            stop_events = []

            def fake_evictor(root_arg, stop, log_path):
                stop_events.append(stop)
                # Mirrors the real background_evictor's stop.wait(20) loop,
                # just polled fast so the test doesn't block for 20s.
                while not stop.wait(0.01):
                    pass

            def raising_run(cmd, **kwargs):
                # Simulates rsync being temporarily missing/unreachable:
                # subprocess.run raises before returning a CompletedProcess,
                # unlike a nonzero exit code which it reports normally.
                raise FileNotFoundError("rsync: no such file or directory")

            with mock.patch("sd_offload.background_evictor", side_effect=fake_evictor), \
                    mock.patch("sd_offload.subprocess.run", side_effect=raising_run):
                with self.assertRaises(FileNotFoundError):
                    rsync_copy(source, dest, root / "log.txt")

            # The evictor thread must be signaled to stop even though
            # subprocess.run raised before reaching stop.set() -- otherwise
            # it is a leaked daemon thread that keeps calling brctl evict on
            # `dest` every 20s for the rest of this process's life.
            self.assertEqual(len(stop_events), 1)
            self.assertTrue(stop_events[0].is_set())


class BuildRsyncCmdTests(unittest.TestCase):
    def test_resumes_partial_without_ignore_existing(self):
        # --ignore-existing would skip a half-copied file forever, making an
        # interrupted import unrecoverable (kill_criteria #1). It must not be
        # present; --partial must be, so progress survives an interruption.
        cmd = build_rsync_cmd(Path("/Volumes/card"), Path("/staging/card"))
        self.assertNotIn("--ignore-existing", cmd)
        self.assertIn("--partial", cmd)

    def test_source_has_trailing_slash_to_copy_contents(self):
        cmd = build_rsync_cmd(Path("/Volumes/card"), Path("/staging/card"))
        self.assertEqual(cmd[-2], "/Volumes/card/")
        self.assertEqual(cmd[-1], "/staging/card/")


if __name__ == "__main__":
    unittest.main()
