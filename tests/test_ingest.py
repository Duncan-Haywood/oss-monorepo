import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from shotflow.ingest import build_ingest_plan, execute_ingest_plan


class IngestPlanningTests(unittest.TestCase):
    def test_discovers_supported_media_and_ignores_non_media(self) -> None:
        with TemporaryDirectory() as source_dir, TemporaryDirectory() as library_dir:
            source = Path(source_dir)
            library = Path(library_dir)
            (source / "DCIM").mkdir()
            (source / "DCIM" / "hero.CR3").write_bytes(b"raw")
            (source / "DCIM" / "hero.JPG").write_bytes(b"jpeg")
            (source / "DCIM" / "clip.MOV").write_bytes(b"video")
            (source / "DCIM" / "notes.txt").write_text("ignore me")

            plan = build_ingest_plan(source, library, shoot_name="alpine launch")

            self.assertEqual(len(plan.items), 3)
            self.assertEqual(
                {item.media_kind for item in plan.items},
                {"raw_photo", "photo", "video"},
            )
            self.assertTrue(all(item.destination.exists() is False for item in plan.items))
            self.assertEqual(plan.summary["ignored_files"], 1)

    def test_destinations_are_grouped_by_shoot_and_media_kind(self) -> None:
        with TemporaryDirectory() as source_dir, TemporaryDirectory() as library_dir:
            source = Path(source_dir)
            library = Path(library_dir)
            (source / "A001_C001_0420AB.MP4").write_bytes(b"video")
            (source / "portrait.NEF").write_bytes(b"raw")

            plan = build_ingest_plan(source, library, shoot_name="Client Shoot 01")

            destinations = {item.source.name: item.destination for item in plan.items}
            self.assertEqual(
                destinations["A001_C001_0420AB.MP4"].relative_to(library),
                Path("client-shoot-01") / "video" / "A001_C001_0420AB.MP4",
            )
            self.assertEqual(
                destinations["portrait.NEF"].relative_to(library),
                Path("client-shoot-01") / "raw_photo" / "portrait.NEF",
            )

    def test_existing_destination_collision_gets_hash_suffix(self) -> None:
        with TemporaryDirectory() as source_dir, TemporaryDirectory() as library_dir:
            source = Path(source_dir)
            library = Path(library_dir)
            source_file = source / "hero.JPG"
            source_file.write_bytes(b"new hero image")
            collision_dir = library / "launch-day" / "photo"
            collision_dir.mkdir(parents=True)
            (collision_dir / "hero.JPG").write_bytes(b"existing hero image")

            plan = build_ingest_plan(source, library, shoot_name="Launch Day")

            self.assertEqual(len(plan.items), 1)
            destination = plan.items[0].destination
            self.assertEqual(destination.parent, collision_dir)
            self.assertRegex(destination.name, r"^hero-[0-9a-f]{8}\.JPG$")
            self.assertEqual(plan.items[0].safety_action, "copy")

    def test_hash_suffixed_collision_gets_incremented_destination(self) -> None:
        with TemporaryDirectory() as source_dir, TemporaryDirectory() as library_dir:
            source = Path(source_dir)
            library = Path(library_dir)
            source_file = source / "hero.JPG"
            source_file.write_bytes(b"same image")
            collision_dir = library / "launch-day" / "photo"
            collision_dir.mkdir(parents=True)
            (collision_dir / "hero.JPG").write_bytes(b"existing")

            first_plan = build_ingest_plan(source, library, shoot_name="Launch Day")
            (collision_dir / first_plan.items[0].destination.name).write_bytes(b"existing suffix")
            second_plan = build_ingest_plan(source, library, shoot_name="Launch Day")

            self.assertEqual(
                second_plan.items[0].destination.name,
                first_plan.items[0].destination.with_stem(
                    f"{first_plan.items[0].destination.stem}-2"
                ).name,
            )

    def test_collision_planning_does_not_read_media_contents(self) -> None:
        with TemporaryDirectory() as source_dir, TemporaryDirectory() as library_dir:
            source = Path(source_dir)
            library = Path(library_dir)
            source_file = source / "large-video.MP4"
            source_file.write_bytes(b"large video placeholder")
            collision_dir = library / "fast-plan" / "video"
            collision_dir.mkdir(parents=True)
            (collision_dir / "large-video.MP4").write_bytes(b"existing")

            with patch("shotflow.ingest.content_hash", side_effect=AssertionError):
                plan = build_ingest_plan(source, library, shoot_name="Fast Plan")

            self.assertRegex(plan.items[0].destination.name, r"^large-video-[0-9a-f]{8}\.MP4$")

    def test_manifest_is_json_serializable_and_records_no_delete_policy(self) -> None:
        with TemporaryDirectory() as source_dir, TemporaryDirectory() as library_dir:
            source = Path(source_dir)
            library = Path(library_dir)
            (source / "clip.LOG").write_text("camera metadata")
            (source / "clip.MP4").write_bytes(b"video")

            plan = build_ingest_plan(source, library, shoot_name="grade test")
            manifest = plan.to_manifest()

            encoded = json.dumps(manifest, sort_keys=True)
            self.assertIn('"delete_source": false', encoded)
            self.assertEqual(manifest["summary"]["total_items"], 2)
            self.assertEqual(
                {item["media_kind"] for item in manifest["items"]},
                {"camera_log", "video"},
            )

    def test_write_manifest_refuses_to_overwrite_audit_record(self) -> None:
        with TemporaryDirectory() as source_dir, TemporaryDirectory() as library_dir:
            source = Path(source_dir)
            library = Path(library_dir)
            (source / "clip.MP4").write_bytes(b"video")
            manifest_path = library / "manifest.json"
            manifest_path.write_text("existing audit")

            plan = build_ingest_plan(source, library, shoot_name="grade test")

            with self.assertRaises(FileExistsError):
                plan.write_manifest(manifest_path)
            self.assertEqual(manifest_path.read_text(), "existing audit")

    def test_execute_ingest_plan_copies_and_verifies_without_deleting_sources(self) -> None:
        with TemporaryDirectory() as source_dir, TemporaryDirectory() as library_dir:
            source = Path(source_dir)
            library = Path(library_dir)
            raw = source / "hero.CR3"
            jpeg = source / "hero.JPG"
            raw.write_bytes(b"raw capture")
            jpeg.write_bytes(b"jpeg preview")

            plan = build_ingest_plan(source, library, shoot_name="safe copy")
            result = execute_ingest_plan(plan)

            self.assertEqual(result["copied"], 2)
            self.assertEqual(result["failed"], 0)
            for item in plan.items:
                self.assertTrue(item.source.exists())
                self.assertTrue(item.destination.exists())
                self.assertEqual(item.destination.read_bytes(), item.source.read_bytes())
            self.assertEqual(result["delete_source"], False)

    def test_execute_ingest_plan_refuses_existing_destinations(self) -> None:
        with TemporaryDirectory() as source_dir, TemporaryDirectory() as library_dir:
            source = Path(source_dir)
            library = Path(library_dir)
            source_file = source / "hero.JPG"
            source_file.write_bytes(b"new image")
            plan = build_ingest_plan(source, library, shoot_name="safe copy")
            plan.items[0].destination.parent.mkdir(parents=True)
            plan.items[0].destination.write_bytes(b"do not overwrite")

            result = execute_ingest_plan(plan)

            self.assertEqual(result["copied"], 0)
            self.assertEqual(result["failed"], 1)
            self.assertEqual(plan.items[0].destination.read_bytes(), b"do not overwrite")

    def test_failed_copy_leaves_no_partial_destination(self) -> None:
        with TemporaryDirectory() as source_dir, TemporaryDirectory() as library_dir:
            source = Path(source_dir)
            library = Path(library_dir)
            source_file = source / "hero.JPG"
            source_file.write_bytes(b"image")
            plan = build_ingest_plan(source, library, shoot_name="safe copy")

            with patch("shotflow.ingest.copy_with_hash", side_effect=OSError("disk full")):
                result = execute_ingest_plan(plan)

            self.assertEqual(result["copied"], 0)
            self.assertEqual(result["failed"], 1)
            self.assertFalse(plan.items[0].destination.exists())

    def test_checksum_mismatch_leaves_no_destination(self) -> None:
        with TemporaryDirectory() as source_dir, TemporaryDirectory() as library_dir:
            source = Path(source_dir)
            library = Path(library_dir)
            source_file = source / "hero.JPG"
            source_file.write_bytes(b"image")
            plan = build_ingest_plan(source, library, shoot_name="safe copy")

            with patch("shotflow.ingest.content_hash", return_value="mismatch"):
                result = execute_ingest_plan(plan)

            self.assertEqual(result["copied"], 0)
            self.assertEqual(result["failed"], 1)
            self.assertFalse(plan.items[0].destination.exists())


if __name__ == "__main__":
    unittest.main()
