import hashlib
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


if __name__ == "__main__":
    unittest.main()
