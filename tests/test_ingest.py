from __future__ import annotations

import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from shootflow.ingest import IngestSafetyError, import_shoot


class IngestTests(unittest.TestCase):
    def test_import_shoot_copies_media_verifies_checksums_and_keeps_sources(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "card"
            destination = root / "library"
            source.mkdir()

            raw = source / "A001.CR3"
            video = source / "A002.MOV"
            scratch_audio = source / "A003.WAV"
            ignored = source / "notes.txt"
            raw.write_bytes(b"raw photo bytes")
            video.write_bytes(b"video bytes")
            scratch_audio.write_bytes(b"scratch audio bytes")
            ignored.write_text("not part of ingest", encoding="utf-8")

            manifest = import_shoot(
                source,
                destination,
                shoot_slug="desert-fashion",
                shoot_date="2026-05-07",
            )

            imported_names = {item.destination_path.name for item in manifest.items}
            self.assertEqual(imported_names, {"A001.CR3", "A002.MOV", "A003.WAV"})
            self.assertTrue(raw.exists())
            self.assertTrue(video.exists())
            self.assertTrue(scratch_audio.exists())
            self.assertFalse(any(item.source_deleted for item in manifest.items))

            for item in manifest.items:
                self.assertTrue(item.destination_path.exists())
                self.assertEqual(item.source_sha256, item.destination_sha256)
                self.assertEqual(item.source_size, item.destination_size)

            manifest_path = destination / "2026-05-07_desert-fashion" / "ingest_manifest.json"
            payload = json.loads(manifest_path.read_text(encoding="utf-8"))
            self.assertEqual(payload["shoot_slug"], "desert-fashion")
            self.assertEqual(len(payload["items"]), 3)

    def test_import_shoot_never_overwrites_different_destination_bytes(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "card"
            destination = root / "library"
            source.mkdir()

            source_file = source / "IMG_0001.JPG"
            source_file.write_bytes(b"new image")
            originals = destination / "2026-05-07_wedding" / "originals"
            originals.mkdir(parents=True)
            existing = originals / "IMG_0001.JPG"
            existing.write_bytes(b"older image with same camera filename")

            manifest = import_shoot(source, destination, shoot_slug="wedding", shoot_date="2026-05-07")

            self.assertEqual(existing.read_bytes(), b"older image with same camera filename")
            self.assertEqual(manifest.items[0].destination_path.name, "IMG_0001__1.JPG")
            self.assertEqual(manifest.items[0].destination_path.read_bytes(), b"new image")

    def test_import_shoot_rejects_symlink_media_sources(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "card"
            destination = root / "library"
            source.mkdir()
            real_file = root / "outside.JPG"
            real_file.write_bytes(b"outside")
            (source / "linked.JPG").symlink_to(real_file)

            with self.assertRaises(IngestSafetyError):
                import_shoot(source, destination, shoot_slug="unsafe", shoot_date="2026-05-07")


if __name__ == "__main__":
    unittest.main()
