import json
import os
import tempfile
import unittest
from pathlib import Path

from media_tool.ingest import build_ingest_plan, execute_ingest_plan, validate_shoot_slug
from media_tool.media_types import MediaKind


class IngestTests(unittest.TestCase):
    def test_build_plan_includes_supported_media_and_preserves_relative_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "card"
            library = root / "library"
            (source / "DCIM" / "100CANON").mkdir(parents=True)
            (source / "PRIVATE").mkdir()
            (source / ".Spotlight-V100").mkdir()

            raw = source / "DCIM" / "100CANON" / "IMG_0001.CR3"
            jpeg = source / "DCIM" / "100CANON" / "IMG_0001.JPG"
            video = source / "PRIVATE" / "CLIP0001.MOV"
            unsupported = source / "DCIM" / "100CANON" / "notes.txt"
            hidden = source / ".Spotlight-V100" / "store.db"

            raw.write_bytes(b"raw")
            jpeg.write_bytes(b"jpeg")
            video.write_bytes(b"video")
            unsupported.write_text("skip", encoding="utf-8")
            hidden.write_bytes(b"skip")
            (source / "DCIM" / "100CANON" / "IMG_0001.XMP").write_bytes(b"sidecar")

            plan = build_ingest_plan(source=source, library=library, shoot_slug="wedding-day")

            self.assertEqual(len(plan.copies), 4)
            destinations = {copy.asset.source.name: copy.destination for copy in plan.copies}
            self.assertEqual(
                destinations["IMG_0001.CR3"],
                library / "wedding-day" / "originals" / "raw_photo" / "DCIM" / "100CANON" / "IMG_0001.CR3",
            )
            self.assertEqual(
                destinations["IMG_0001.JPG"],
                library / "wedding-day" / "originals" / "photo" / "DCIM" / "100CANON" / "IMG_0001.JPG",
            )
            self.assertEqual(
                destinations["CLIP0001.MOV"],
                library / "wedding-day" / "originals" / "video" / "PRIVATE" / "CLIP0001.MOV",
            )
            self.assertEqual(
                destinations["IMG_0001.XMP"],
                library / "wedding-day" / "originals" / "sidecar" / "DCIM" / "100CANON" / "IMG_0001.XMP",
            )
            self.assertEqual(
                {copy.asset.kind for copy in plan.copies},
                {MediaKind.RAW_PHOTO, MediaKind.PHOTO, MediaKind.VIDEO, MediaKind.SIDECAR},
            )

    def test_rejects_unsafe_shoot_slugs(self):
        invalid_slugs = ["", " shoot ", "../shoot", "nested/shoot", "/absolute", ".", "..", "client:shoot"]

        for slug in invalid_slugs:
            with self.subTest(slug=slug):
                with self.assertRaises(ValueError):
                    validate_shoot_slug(slug)

        self.assertEqual(validate_shoot_slug("client-shoot_2026.05.07"), "client-shoot_2026.05.07")

    def test_build_plan_uses_collision_path_for_existing_different_destination(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "card"
            library = root / "library"
            source.mkdir()
            (source / "IMG_0001.JPG").write_bytes(b"new shoot bytes")
            existing = library / "same-name" / "originals" / "photo" / "IMG_0001.JPG"
            existing.parent.mkdir(parents=True)
            existing.write_bytes(b"different old bytes")

            plan = build_ingest_plan(source=source, library=library, shoot_slug="same-name")

            destination = plan.copies[0].destination
            self.assertNotEqual(destination, existing)
            self.assertTrue(destination.name.startswith("IMG_0001-"))
            self.assertTrue(destination.name.endswith(".JPG"))

            manifest = execute_ingest_plan(plan)
            self.assertEqual(existing.read_bytes(), b"different old bytes")
            self.assertEqual(manifest.results[0].status, "copied")
            self.assertEqual(destination.read_bytes(), b"new shoot bytes")

    def test_build_plan_uses_collision_path_for_existing_destination_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "card"
            library = root / "library"
            source.mkdir()
            (source / "IMG_0001.JPG").write_bytes(b"new shoot bytes")
            existing = library / "directory-conflict" / "originals" / "photo" / "IMG_0001.JPG"
            existing.mkdir(parents=True)

            plan = build_ingest_plan(source=source, library=library, shoot_slug="directory-conflict")

            destination = plan.copies[0].destination
            self.assertNotEqual(destination, existing)
            self.assertTrue(existing.is_dir())
            self.assertTrue(destination.name.startswith("IMG_0001-"))

    def test_execute_plan_copies_with_checksums_and_writes_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "card"
            library = root / "library"
            source.mkdir()
            (source / "IMG_0001.CR3").write_bytes(b"raw bytes")
            (source / "CLIP0001.MP4").write_bytes(b"video bytes")

            plan = build_ingest_plan(source=source, library=library, shoot_slug="shoot-01")
            manifest = execute_ingest_plan(plan)

            self.assertEqual(len(manifest.results), 2)
            self.assertTrue(all(result.status == "copied" for result in manifest.results))
            for result in manifest.results:
                self.assertTrue(result.destination.exists())
                self.assertEqual(result.source_checksum, result.destination_checksum)

            manifest_path = manifest.manifest_path
            self.assertTrue(manifest_path.exists())
            data = json.loads(manifest_path.read_text(encoding="utf-8"))
            self.assertEqual(data["shoot_slug"], "shoot-01")
            self.assertEqual(len(data["results"]), 2)
            self.assertEqual({item["status"] for item in data["results"]}, {"copied"})
            self.assertEqual((source / "IMG_0001.CR3").read_bytes(), b"raw bytes")
            self.assertEqual((source / "CLIP0001.MP4").read_bytes(), b"video bytes")

    def test_execute_plan_preserves_existing_matching_copy(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "card"
            library = root / "library"
            source.mkdir()
            asset = source / "IMG_0001.JPG"
            asset.write_bytes(b"jpeg bytes")

            plan = build_ingest_plan(source=source, library=library, shoot_slug="shoot-02")
            destination = plan.copies[0].destination
            destination.parent.mkdir(parents=True)
            destination.write_bytes(b"jpeg bytes")

            manifest = execute_ingest_plan(plan)

            self.assertEqual(manifest.results[0].status, "already_copied")
            self.assertEqual(destination.read_bytes(), b"jpeg bytes")

    def test_execute_plan_preserves_existing_different_destination_from_stale_plan(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "card"
            library = root / "library"
            source.mkdir()
            asset = source / "IMG_0001.JPG"
            asset.write_bytes(b"new bytes")

            plan = build_ingest_plan(source=source, library=library, shoot_slug="shoot-03")
            destination = plan.copies[0].destination
            destination.parent.mkdir(parents=True)
            destination.write_bytes(b"racy bytes")

            with self.assertRaises(FileExistsError):
                execute_ingest_plan(plan)

            self.assertEqual(destination.read_bytes(), b"racy bytes")

    def test_repeated_ingests_preserve_distinct_manifest_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "card"
            library = root / "library"
            source.mkdir()
            (source / "IMG_0001.JPG").write_bytes(b"jpeg bytes")

            first = execute_ingest_plan(build_ingest_plan(source=source, library=library, shoot_slug="shoot-04"))
            second = execute_ingest_plan(build_ingest_plan(source=source, library=library, shoot_slug="shoot-04"))

            self.assertNotEqual(first.manifest_path, second.manifest_path)
            self.assertTrue(first.manifest_path.exists())
            self.assertTrue(second.manifest_path.exists())

    def test_source_symlinks_are_skipped(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "card"
            outside = root / "outside.JPG"
            library = root / "library"
            source.mkdir()
            outside.write_bytes(b"outside")
            os.symlink(outside, source / "linked.JPG")

            plan = build_ingest_plan(source=source, library=library, shoot_slug="shoot-05")

            self.assertEqual(plan.copies, ())

    def test_symlinked_destination_parent_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "card"
            library = root / "library"
            outside = root / "outside"
            source.mkdir()
            library.mkdir()
            outside.mkdir()
            (source / "IMG_0001.JPG").write_bytes(b"jpeg bytes")
            os.symlink(outside, library / "shoot-06")

            with self.assertRaises(ValueError):
                build_ingest_plan(source=source, library=library, shoot_slug="shoot-06")

    def test_broken_symlink_destination_parent_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "card"
            library = root / "library"
            missing = library / "missing"
            source.mkdir()
            library.mkdir()
            (source / "IMG_0001.JPG").write_bytes(b"jpeg bytes")
            os.symlink(missing, library / "shoot-07")

            with self.assertRaises(ValueError):
                build_ingest_plan(source=source, library=library, shoot_slug="shoot-07")


if __name__ == "__main__":
    unittest.main()
