import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from mediaflow.ingest import (
    IngestOptions,
    SafetyError,
    classify_media,
    detect_media_sources,
    execute_plan,
    plan_ingest,
)


class IngestPlanningTests(unittest.TestCase):
    def test_classifies_photo_raw_video_and_sidecar_extensions(self) -> None:
        self.assertEqual(classify_media(Path("frame.CR3")), "raw")
        self.assertEqual(classify_media(Path("still.jpeg")), "photo")
        self.assertEqual(classify_media(Path("clip.MOV")), "video")
        self.assertEqual(classify_media(Path("grade.xmp")), "sidecar")
        self.assertIsNone(classify_media(Path("notes.txt")))

    def test_plan_ingest_organizes_by_date_type_and_collision_safe_name(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "card"
            destination = root / "library"
            source.mkdir()

            first = source / "DSC0001.JPG"
            duplicate_name = source / "nested" / "DSC0001.JPG"
            duplicate_name.parent.mkdir()
            first.write_bytes(b"first")
            duplicate_name.write_bytes(b"second")

            timestamp = 1_704_067_200  # 2024-01-01T00:00:00Z
            os.utime(first, (timestamp, timestamp))
            os.utime(duplicate_name, (timestamp, timestamp))

            plan = plan_ingest(source, destination, IngestOptions(mode="copy"))

            destinations = [operation.destination for operation in plan.operations]
            self.assertEqual(len(destinations), 2)
            self.assertTrue(all("2024/2024-01-01/photos" in str(path) for path in destinations))
            self.assertEqual(len(set(destinations)), 2)
            self.assertTrue(any(path.name == "DSC0001.JPG" for path in destinations))
            self.assertTrue(any(path.name.startswith("DSC0001-") for path in destinations))

    def test_move_from_removable_source_requires_explicit_source_removal(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "sd-card"
            destination = root / "library"
            source.mkdir()
            (source / "clip.mov").write_bytes(b"video")

            with self.assertRaises(SafetyError):
                plan_ingest(
                    source,
                    destination,
                    IngestOptions(mode="move", source_kind="removable"),
                )

    def test_move_from_local_source_requires_explicit_source_removal_before_planning(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "local-shoot"
            destination = root / "library"
            source.mkdir()
            (source / "clip.mov").write_bytes(b"video")

            with self.assertRaises(SafetyError):
                plan_ingest(source, destination, IngestOptions(mode="move"))

            self.assertTrue((source / "clip.mov").exists())

    def test_move_with_consent_removes_source_after_verified_copy(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "local-shoot"
            destination = root / "library"
            source.mkdir()
            original = source / "clip.mov"
            original.write_bytes(b"video")

            plan = plan_ingest(source, destination, IngestOptions(mode="move", allow_source_removal=True))
            manifest_path = execute_plan(plan)

            self.assertFalse(original.exists())
            self.assertTrue(plan.operations[0].destination.exists())
            self.assertTrue(manifest_path.exists())

    def test_move_verifies_all_copies_before_removing_any_source(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "local-shoot"
            destination = root / "library"
            source.mkdir()
            (source / "clip-a.mov").write_bytes(b"a")
            (source / "clip-b.mov").write_bytes(b"b")
            plan = plan_ingest(source, destination, IngestOptions(mode="move", allow_source_removal=True))

            def assert_all_destinations_exist(path: Path) -> None:
                self.assertTrue(all(operation.destination.exists() for operation in plan.operations))

            with patch.object(Path, "unlink", autospec=True, side_effect=assert_all_destinations_exist) as unlink:
                execute_plan(plan)

            self.assertEqual(unlink.call_count, 2)

    def test_execute_copy_writes_manifest_and_keeps_original(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "card"
            destination = root / "library"
            source.mkdir()
            original = source / "frame.NEF"
            original.write_bytes(b"raw-data")

            plan = plan_ingest(source, destination, IngestOptions(mode="copy"))
            manifest_path = execute_plan(plan)

            self.assertTrue(original.exists())
            copied = plan.operations[0].destination
            self.assertTrue(copied.exists())
            self.assertEqual(copied.read_bytes(), b"raw-data")

            manifest = json.loads(manifest_path.read_text())
            self.assertEqual(manifest["mode"], "copy")
            self.assertEqual(manifest["source"], str(source))
            self.assertEqual(manifest["operation_count"], 1)
            self.assertEqual(manifest["operations"][0]["sha256"], plan.operations[0].sha256)

    def test_existing_destination_name_collision_gets_checksum_suffix(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "card"
            destination = root / "library"
            source.mkdir()
            incoming = source / "DSC0001.JPG"
            incoming.write_bytes(b"incoming")

            timestamp = 1_704_067_200
            os.utime(incoming, (timestamp, timestamp))
            existing_dir = destination / "2024" / "2024-01-01" / "photos"
            existing_dir.mkdir(parents=True)
            (existing_dir / "DSC0001.JPG").write_bytes(b"existing")

            plan = plan_ingest(source, destination, IngestOptions(mode="copy"))

            self.assertEqual(plan.operations[0].destination.parent, existing_dir)
            self.assertTrue(plan.operations[0].destination.name.startswith("DSC0001-"))

    def test_successive_manifests_do_not_overwrite_each_other(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "card"
            destination = root / "library"
            source.mkdir()
            (source / "frame.NEF").write_bytes(b"raw-data")

            plan = plan_ingest(source, destination, IngestOptions(mode="copy"))
            first_manifest = execute_plan(plan)
            second_manifest = execute_plan(plan)

            self.assertNotEqual(first_manifest, second_manifest)
            self.assertTrue(first_manifest.exists())
            self.assertTrue(second_manifest.exists())

    def test_detect_media_sources_scores_candidate_card_roots(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            empty_drive = root / "BackupSSD"
            card = root / "EOS_DIGITAL"
            card_dcim = card / "DCIM" / "100CANON"
            empty_drive.mkdir()
            card_dcim.mkdir(parents=True)
            (card_dcim / "IMG_0001.CR3").write_bytes(b"raw")
            (card_dcim / "IMG_0002.JPG").write_bytes(b"jpeg")

            candidates = detect_media_sources([root])

            self.assertEqual(len(candidates), 1)
            self.assertEqual(candidates[0].path, card)
            self.assertEqual(candidates[0].media_count, 2)
            self.assertGreaterEqual(candidates[0].confidence, 0.75)

    def test_detect_media_sources_accepts_direct_card_root(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            card = Path(tmp) / "EOS_DIGITAL"
            card_dcim = card / "DCIM" / "100CANON"
            card_dcim.mkdir(parents=True)
            (card_dcim / "IMG_0001.CR3").write_bytes(b"raw")

            candidates = detect_media_sources([card])

            self.assertEqual(len(candidates), 1)
            self.assertEqual(candidates[0].path, card)


if __name__ == "__main__":
    unittest.main()
