import json
import tempfile
import unittest
from pathlib import Path

from shootflow.catalog import CatalogError, load_ingest_manifest, production_assets_from_manifest
from shootflow.ingest import execute_copy_plan, plan_import
from shootflow.production import build_production_plan


class CatalogManifestTests(unittest.TestCase):
    def test_loads_verified_ingest_manifest_as_photo_and_video_assets(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            card = root / "card"
            library = root / "library"
            raw = card / "DCIM" / "100CANON" / "IMG_0001.CR3"
            jpeg = card / "DCIM" / "100CANON" / "IMG_0002.JPG"
            clip = card / "PRIVATE" / "A001.MOV"
            audio = card / "PRIVATE" / "A001.WAV"
            raw.parent.mkdir(parents=True)
            clip.parent.mkdir(parents=True)
            raw.write_bytes(b"raw")
            jpeg.write_bytes(b"jpeg")
            clip.write_bytes(b"video")
            audio.write_bytes(b"scratch-audio")

            report = execute_copy_plan(
                plan_import(card, library, shoot_date="2026-05-06", shoot_slug="launch-shoot")
            )

            catalog = load_ingest_manifest(report.manifest_path)
            assets = production_assets_from_manifest(catalog)
            production_plan = build_production_plan(assets, shoot_slug=catalog.shoot_slug)

            self.assertEqual(catalog.shoot_date, "2026-05-06")
            self.assertEqual(catalog.shoot_slug, "launch-shoot")
            self.assertFalse(catalog.source_deleted)
            self.assertEqual(
                [(asset.relative_path.as_posix(), asset.media_type) for asset in catalog.assets],
                [
                    ("DCIM/100CANON/IMG_0001.CR3", "photo"),
                    ("DCIM/100CANON/IMG_0002.JPG", "photo"),
                    ("PRIVATE/A001.MOV", "video"),
                ],
            )
            self.assertEqual([asset.media_type for asset in assets], ["photo", "photo", "video"])
            self.assertTrue(all(Path(asset.path).is_absolute() for asset in assets))
            self.assertEqual(len(production_plan.execution_waves[0].jobs), 3)

    def test_rejects_manifest_paths_that_escape_import_destination(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifest = root / "library" / "2026-05-06_escape" / "ingest_manifest.json"
            escaped = root / "outside" / "IMG_0001.JPG"
            manifest.parent.mkdir(parents=True)
            escaped.parent.mkdir()
            escaped.write_bytes(b"not-in-library")
            manifest.write_text(
                json.dumps(
                    {
                        "shoot_date": "2026-05-06",
                        "shoot_slug": "escape",
                        "source_root": str(root / "card"),
                        "destination_root": str(root / "library"),
                        "source_deleted": False,
                        "items": [
                            {
                                "source": str(root / "card" / "IMG_0001.JPG"),
                                "destination": str(escaped),
                                "relative_path": "IMG_0001.JPG",
                                "checksum_sha256": "0" * 64,
                                "size_bytes": 12,
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )

            with self.assertRaises(CatalogError):
                load_ingest_manifest(manifest)

    def test_rejects_manifest_that_widens_destination_root(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            library = root / "library"
            manifest = library / "2026-05-06_escape" / "ingest_manifest.json"
            escaped = root / "outside" / "IMG_0001.JPG"
            manifest.parent.mkdir(parents=True)
            escaped.parent.mkdir()
            escaped.write_bytes(b"not-in-library")
            manifest.write_text(
                json.dumps(
                    {
                        "shoot_date": "2026-05-06",
                        "shoot_slug": "escape",
                        "source_root": str(root / "card"),
                        "destination_root": str(root),
                        "source_deleted": False,
                        "items": [
                            {
                                "source": str(root / "card" / "IMG_0001.JPG"),
                                "destination": str(escaped),
                                "relative_path": "IMG_0001.JPG",
                                "checksum_sha256": "0" * 64,
                                "size_bytes": 12,
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )

            with self.assertRaises(CatalogError):
                load_ingest_manifest(manifest)

    def test_rejects_manifests_that_claim_source_media_was_deleted(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            library = root / "library"
            imported = library / "2026-05-06_deleted" / "originals" / "IMG_0001.JPG"
            manifest = library / "2026-05-06_deleted" / "ingest_manifest.json"
            imported.parent.mkdir(parents=True)
            imported.write_bytes(b"photo")
            manifest.write_text(
                json.dumps(
                    {
                        "shoot_date": "2026-05-06",
                        "shoot_slug": "deleted",
                        "source_root": str(root / "card"),
                        "destination_root": str(library),
                        "source_deleted": True,
                        "items": [
                            {
                                "source": str(root / "card" / "IMG_0001.JPG"),
                                "destination": str(imported),
                                "relative_path": "IMG_0001.JPG",
                                "checksum_sha256": "0" * 64,
                                "size_bytes": 3,
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(CatalogError, "source media was deleted"):
                load_ingest_manifest(manifest)

    def test_rejects_manifest_item_when_destination_file_is_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifest = root / "library" / "2026-05-06_missing" / "ingest_manifest.json"
            missing = manifest.parent / "originals" / "IMG_0001.JPG"
            manifest.parent.mkdir(parents=True)
            manifest.write_text(
                json.dumps(
                    {
                        "shoot_date": "2026-05-06",
                        "shoot_slug": "missing",
                        "source_root": str(root / "card"),
                        "destination_root": str(root / "library"),
                        "source_deleted": False,
                        "items": [
                            {
                                "source": str(root / "card" / "IMG_0001.JPG"),
                                "destination": str(missing),
                                "relative_path": "IMG_0001.JPG",
                                "checksum_sha256": "0" * 64,
                                "size_bytes": 12,
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )

            with self.assertRaises(CatalogError):
                load_ingest_manifest(manifest)

    def test_rejects_manifest_item_when_destination_size_or_checksum_mismatches(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifest = root / "library" / "2026-05-06_mismatch" / "ingest_manifest.json"
            imported = manifest.parent / "originals" / "IMG_0001.JPG"
            imported.parent.mkdir(parents=True)
            imported.write_bytes(b"actual-bytes")
            manifest.write_text(
                json.dumps(
                    {
                        "shoot_date": "2026-05-06",
                        "shoot_slug": "mismatch",
                        "source_root": str(root / "card"),
                        "destination_root": str(root / "library"),
                        "source_deleted": False,
                        "items": [
                            {
                                "source": str(root / "card" / "IMG_0001.JPG"),
                                "destination": str(imported),
                                "relative_path": "IMG_0001.JPG",
                                "checksum_sha256": "0" * 64,
                                "size_bytes": len(b"actual-bytes"),
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )

            with self.assertRaises(CatalogError):
                load_ingest_manifest(manifest)

    def test_rejects_manifest_item_when_destination_size_mismatches(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifest = root / "library" / "2026-05-06_size-mismatch" / "ingest_manifest.json"
            imported = manifest.parent / "originals" / "IMG_0001.JPG"
            imported.parent.mkdir(parents=True)
            imported.write_bytes(b"actual-bytes")
            manifest.write_text(
                json.dumps(
                    {
                        "shoot_date": "2026-05-06",
                        "shoot_slug": "size-mismatch",
                        "source_root": str(root / "card"),
                        "destination_root": str(root / "library"),
                        "source_deleted": False,
                        "items": [
                            {
                                "source": str(root / "card" / "IMG_0001.JPG"),
                                "destination": str(imported),
                                "relative_path": "IMG_0001.JPG",
                                "checksum_sha256": "0" * 64,
                                "size_bytes": 999,
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )

            with self.assertRaises(CatalogError):
                load_ingest_manifest(manifest)

    def test_rejects_boolean_size_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            library = root / "library"
            imported = library / "2026-05-06_bad-size" / "originals" / "IMG_0001.JPG"
            manifest = library / "2026-05-06_bad-size" / "ingest_manifest.json"
            imported.parent.mkdir(parents=True)
            imported.write_bytes(b"photo")
            manifest.write_text(
                json.dumps(
                    {
                        "shoot_date": "2026-05-06",
                        "shoot_slug": "bad-size",
                        "source_root": str(root / "card"),
                        "destination_root": str(library),
                        "source_deleted": False,
                        "items": [
                            {
                                "source": str(root / "card" / "IMG_0001.JPG"),
                                "destination": str(imported),
                                "relative_path": "IMG_0001.JPG",
                                "checksum_sha256": "0" * 64,
                                "size_bytes": True,
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )

            with self.assertRaises(CatalogError):
                load_ingest_manifest(manifest)


if __name__ == "__main__":
    unittest.main()
