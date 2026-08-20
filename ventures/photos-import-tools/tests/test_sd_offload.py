import json
import tempfile
import unittest
from pathlib import Path

from sd_offload import (
    CardSpec,
    OffloadStats,
    build_rsync_cmd,
    iter_media_files,
    offload_exit_code,
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
