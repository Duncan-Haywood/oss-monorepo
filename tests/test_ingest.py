import hashlib
import json
import shutil
import tempfile
import unittest
from pathlib import Path

from shootflow.ingest import (
    IngestPolicy,
    IngestStatus,
    MediaKind,
    build_ingest_plan,
    copy_from_plan,
)


class IngestPlanTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="shootflow-test-"))
        self.source = self.tmp / "card"
        self.dest = self.tmp / "library"
        self.source.mkdir()
        self.dest.mkdir()

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp)

    def write_file(self, path: Path, data: bytes) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path

    def test_plans_media_into_kind_directories_without_deleting_source(self) -> None:
        raw = self.write_file(self.source / "DCIM" / "A001" / "IMG_0001.CR3", b"raw")
        jpeg = self.write_file(self.source / "DCIM" / "A001" / "IMG_0001.JPG", b"jpeg")
        video = self.write_file(self.source / "PRIVATE" / "M4ROOT" / "CLIP0001.MP4", b"video")
        sidecar = self.write_file(self.source / "DCIM" / "A001" / "IMG_0001.XMP", b"xmp")
        self.write_file(self.source / "notes.txt", b"not media")

        plan = build_ingest_plan(
            self.source,
            self.dest,
            IngestPolicy(shoot_slug="client-shoot", shoot_date="2026-05-06"),
        )

        self.assertEqual(plan.total_source_bytes, 15)
        self.assertEqual({operation.kind for operation in plan.operations}, {
            MediaKind.RAW,
            MediaKind.PHOTO,
            MediaKind.VIDEO,
            MediaKind.SIDECAR,
        })
        self.assertEqual(
            [operation.status for operation in plan.operations],
            [IngestStatus.PENDING_COPY] * 4,
        )
        expected_destinations = {
            self.dest / "2026-05-06_client-shoot" / "originals" / "raw" / "DCIM" / "A001" / "IMG_0001.CR3",
            self.dest / "2026-05-06_client-shoot" / "originals" / "photo" / "DCIM" / "A001" / "IMG_0001.JPG",
            self.dest / "2026-05-06_client-shoot" / "originals" / "video" / "PRIVATE" / "M4ROOT" / "CLIP0001.MP4",
            self.dest / "2026-05-06_client-shoot" / "originals" / "sidecar" / "DCIM" / "A001" / "IMG_0001.XMP",
        }
        self.assertEqual({operation.destination for operation in plan.operations}, expected_destinations)

        copy_from_plan(plan)

        self.assertTrue(raw.exists())
        self.assertTrue(jpeg.exists())
        self.assertTrue(video.exists())
        self.assertTrue(sidecar.exists())
        self.assertEqual(plan.manifest_path.name, "ingest-manifest.json")
        self.assertTrue(plan.manifest_path.exists())

    def test_existing_same_checksum_is_skipped(self) -> None:
        source = self.write_file(self.source / "IMG_0002.JPG", b"same-image")
        expected_destination = (
            self.dest
            / "2026-05-06_client-shoot"
            / "originals"
            / "photo"
            / "IMG_0002.JPG"
        )
        self.write_file(expected_destination, b"same-image")

        plan = build_ingest_plan(
            self.source,
            self.dest,
            IngestPolicy(shoot_slug="client-shoot", shoot_date="2026-05-06"),
        )

        operation = plan.operations[0]
        self.assertEqual(operation.status, IngestStatus.SKIP_EXISTING_IDENTICAL)
        self.assertEqual(operation.source, source)
        self.assertEqual(operation.sha256, hashlib.sha256(b"same-image").hexdigest())

    def test_existing_different_checksum_is_a_manual_conflict(self) -> None:
        self.write_file(self.source / "IMG_0003.JPG", b"new-image")
        expected_destination = (
            self.dest
            / "2026-05-06_client-shoot"
            / "originals"
            / "photo"
            / "IMG_0003.JPG"
        )
        self.write_file(expected_destination, b"old-image")

        plan = build_ingest_plan(
            self.source,
            self.dest,
            IngestPolicy(shoot_slug="client-shoot", shoot_date="2026-05-06"),
        )

        self.assertEqual(plan.operations[0].status, IngestStatus.CONFLICT_EXISTING_DIFFERENT)
        with self.assertRaises(RuntimeError):
            copy_from_plan(plan)
        self.assertEqual(expected_destination.read_bytes(), b"old-image")

    def test_rejects_destination_inside_source_to_avoid_recursive_copy(self) -> None:
        nested_destination = self.source / "library"

        with self.assertRaises(ValueError):
            build_ingest_plan(
                self.source,
                nested_destination,
                IngestPolicy(shoot_slug="bad-plan", shoot_date="2026-05-06"),
            )

    def test_rejects_shoot_components_that_escape_destination_root(self) -> None:
        self.write_file(self.source / "IMG_0004.JPG", b"image")

        with self.assertRaisesRegex(ValueError, "shoot_slug must be a safe path component"):
            build_ingest_plan(
                self.source,
                self.dest,
                IngestPolicy(shoot_slug="../escape", shoot_date="2026-05-06"),
            )

        with self.assertRaisesRegex(ValueError, "shoot_date must be a safe path component"):
            build_ingest_plan(
                self.source,
                self.dest,
                IngestPolicy(shoot_slug="client-shoot", shoot_date="2026/05/06"),
            )

    def test_rejects_source_symlink_media_files(self) -> None:
        outside_file = self.write_file(self.tmp / "outside.JPG", b"outside-media")
        symlink_path = self.source / "IMG_0005.JPG"
        symlink_path.symlink_to(outside_file)

        with self.assertRaisesRegex(ValueError, "Source symlinks require manual review"):
            build_ingest_plan(
                self.source,
                self.dest,
                IngestPolicy(shoot_slug="client-shoot", shoot_date="2026-05-06"),
            )

    def test_destination_symlink_is_manual_conflict(self) -> None:
        self.write_file(self.source / "IMG_0006.JPG", b"new-image")
        linked_target = self.write_file(self.tmp / "linked-target.JPG", b"new-image")
        destination = (
            self.dest
            / "2026-05-06_client-shoot"
            / "originals"
            / "photo"
            / "IMG_0006.JPG"
        )
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.symlink_to(linked_target)

        plan = build_ingest_plan(
            self.source,
            self.dest,
            IngestPolicy(shoot_slug="client-shoot", shoot_date="2026-05-06"),
        )

        self.assertEqual(plan.operations[0].status, IngestStatus.CONFLICT_EXISTING_DIFFERENT)
        self.assertIn("Destination symlink", plan.operations[0].reason)

    def test_manifest_replaces_existing_file_without_leaving_temp_file(self) -> None:
        self.write_file(self.source / "IMG_0007.JPG", b"manifest-image")
        manifest_path = (
            self.dest / "2026-05-06_client-shoot" / "ingest-manifest.json"
        )
        self.write_file(manifest_path, b"{old manifest")
        plan = build_ingest_plan(
            self.source,
            self.dest,
            IngestPolicy(shoot_slug="client-shoot", shoot_date="2026-05-06"),
        )

        copy_from_plan(plan)

        manifest = json.loads(manifest_path.read_text())
        self.assertEqual(manifest["source_root"], str(self.source.resolve()))
        self.assertFalse(manifest_path.with_suffix(".json.tmp").exists())


if __name__ == "__main__":
    unittest.main()
