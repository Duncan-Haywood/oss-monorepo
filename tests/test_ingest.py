import json
import tempfile
import unittest
from pathlib import Path

from shootflow.ingest import (
    CopyConflictError,
    UnsafePathError,
    estimate_import_source,
    execute_copy_plan,
    plan_import,
)


class IngestSafetyTests(unittest.TestCase):
    def test_plans_media_files_under_date_and_slug_without_deleting_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            card = root / "card"
            destination = root / "library"
            raw = card / "DCIM" / "100EOS5D" / "IMG_0001.CR3"
            jpeg = card / "DCIM" / "100EOS5D" / "IMG_0001.JPG"
            ignored = card / "DCIM" / "100EOS5D" / "notes.txt"
            raw.parent.mkdir(parents=True)
            raw.write_bytes(b"raw-bytes")
            jpeg.write_bytes(b"jpeg-bytes")
            ignored.write_text("not media", encoding="utf-8")

            plan = plan_import(card, destination, shoot_date="2026-05-06", shoot_slug="desert-editorial")

            self.assertEqual(2, len(plan.items))
            planned_paths = {item.destination.relative_to(destination).as_posix() for item in plan.items}
            self.assertEqual(
                {
                    "2026-05-06_desert-editorial/originals/DCIM/100EOS5D/IMG_0001.CR3",
                    "2026-05-06_desert-editorial/originals/DCIM/100EOS5D/IMG_0001.JPG",
                },
                planned_paths,
            )

            report = execute_copy_plan(plan)

            self.assertEqual(2, report.copied)
            self.assertEqual(0, report.skipped)
            self.assertTrue(raw.exists())
            self.assertTrue(jpeg.exists())
            manifest = destination / "2026-05-06_desert-editorial" / "ingest_manifest.json"
            manifest_data = json.loads(manifest.read_text(encoding="utf-8"))
            self.assertEqual(2, len(manifest_data["items"]))
            self.assertFalse(manifest_data["source_deleted"])

    def test_rejects_unsafe_shoot_paths_and_source_symlinks(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            card = root / "card"
            destination = root / "library"
            media = card / "IMG_0001.RAF"
            card.mkdir()
            media.write_bytes(b"fuji-raw")

            with self.assertRaises(UnsafePathError):
                plan_import(card, destination, shoot_date="2026-05-06", shoot_slug="../escape")

            link = card / "linked.MOV"
            link.symlink_to(media)
            with self.assertRaises(UnsafePathError):
                plan_import(card, destination, shoot_date="2026-05-06", shoot_slug="safe-shoot")

    def test_refuses_to_overwrite_different_existing_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            card = root / "card"
            destination = root / "library"
            source = card / "clip.MOV"
            existing = destination / "2026-05-06_wedding/originals/clip.MOV"
            card.mkdir()
            existing.parent.mkdir(parents=True)
            source.write_bytes(b"source-video")
            existing.write_bytes(b"different-video")

            plan = plan_import(card, destination, shoot_date="2026-05-06", shoot_slug="wedding")

            with self.assertRaises(CopyConflictError):
                execute_copy_plan(plan)
            self.assertEqual(b"source-video", source.read_bytes())
            self.assertEqual(b"different-video", existing.read_bytes())

    def test_estimates_media_payload_bytes_for_capacity_gating(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            card = root / "card"
            media_one = card / "DCIM" / "100EOS5D" / "IMG_0001.CR3"
            media_two = card / "DCIM" / "100EOS5D" / "A001.MOV"
            ignored = card / "notes.txt"
            media_one.parent.mkdir(parents=True)
            media_one.write_bytes(b"a" * 13)
            media_two.write_bytes(b"b" * 29)
            ignored.write_text("ignore", encoding="utf-8")

            estimate = estimate_import_source(card)

        self.assertEqual(estimate.source_root, card)
        self.assertEqual(estimate.media_file_count, 2)
        self.assertEqual(estimate.estimated_bytes, 42)


if __name__ == "__main__":
    unittest.main()
