import hashlib
import os
import tempfile
import unittest
from pathlib import Path

from photoflow.import_planner import ImportMode, ImportPlanner


def write_file(path: Path, content: bytes) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return path


class ImportPlannerTests(unittest.TestCase):
    def test_copy_plan_preserves_sources_and_groups_raw_jpeg_sidecars(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "CARD"
            destination = root / "Archive"

            raw = write_file(source / "DCIM" / "100CANON" / "IMG_0001.CR3", b"raw")
            jpeg = write_file(source / "DCIM" / "100CANON" / "IMG_0001.JPG", b"jpeg")
            xmp = write_file(source / "DCIM" / "100CANON" / "IMG_0001.XMP", b"xmp")

            plan = ImportPlanner().plan(source, destination, shoot_name="Downtown Night")

            self.assertEqual(ImportMode.COPY, plan.mode)
            self.assertEqual(3, len(plan.operations))
            self.assertTrue(all(operation.preserve_source for operation in plan.operations))
            self.assertEqual({raw, jpeg, xmp}, {operation.source for operation in plan.operations})
            self.assertEqual(1, len(plan.groups))
            self.assertEqual({raw, jpeg, xmp}, plan.groups[0].files)
            self.assertEqual(destination / "Downtown Night", plan.shoot_directory)

    def test_duplicate_existing_file_is_skipped_when_checksum_matches(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "CARD"
            destination = root / "Archive"
            content = b"same-photo"

            write_file(source / "IMG_0002.RAF", content)
            write_file(destination / "Portraits" / "IMG_0002.RAF", content)

            plan = ImportPlanner().plan(source, destination, shoot_name="Portraits")

            self.assertEqual(0, len(plan.operations))
            self.assertEqual(1, len(plan.skipped_duplicates))
            self.assertEqual(hashlib.sha256(content).hexdigest(), plan.skipped_duplicates[0].checksum)

    def test_duplicate_planned_file_is_skipped_in_same_import_batch(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "CARD"
            destination = root / "Archive"
            content = b"burst duplicate"

            write_file(source / "A" / "IMG_0002.JPG", content)
            write_file(source / "B" / "IMG_0002.JPG", content)

            plan = ImportPlanner().plan(source, destination, shoot_name="Portraits")

            self.assertEqual(1, len(plan.operations))
            self.assertEqual(1, len(plan.skipped_duplicates))
            self.assertEqual(plan.operations[0].destination, plan.skipped_duplicates[0].destination)

    def test_name_collision_with_different_checksum_gets_unique_destination(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "CARD"
            destination = root / "Archive"

            source_file = write_file(source / "CLIP_0003.MOV", b"new clip")
            write_file(destination / "Commercial" / "CLIP_0003.MOV", b"old clip")

            plan = ImportPlanner().plan(source, destination, shoot_name="Commercial")

            self.assertEqual(1, len(plan.operations))
            operation = plan.operations[0]
            self.assertEqual(source_file, operation.source)
            self.assertEqual(destination / "Commercial" / "CLIP_0003-1.MOV", operation.destination)
            self.assertFalse(plan.warnings)

    def test_move_plan_requires_verified_copy_and_explicit_delete_intent(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "CARD"
            destination = root / "Archive"
            write_file(source / "IMG_0004.NEF", b"nikon raw")

            with self.assertRaisesRegex(ValueError, "verified copy"):
                ImportPlanner().plan(source, destination, shoot_name="Unsafe Move", mode=ImportMode.MOVE)

            with self.assertRaisesRegex(ValueError, "explicit delete intent"):
                ImportPlanner().plan(
                    source,
                    destination,
                    shoot_name="Unsafe Move",
                    mode=ImportMode.MOVE,
                    verified_copy=True,
                )

            plan = ImportPlanner().plan(
                source,
                destination,
                shoot_name="Safe Move",
                mode=ImportMode.MOVE,
                verified_copy=True,
                delete_after_copy=True,
            )

            self.assertTrue(plan.operations[0].preserve_source)
            self.assertIn("cleanup must be planned separately", plan.warnings[0])

    def test_destination_inside_source_tree_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "CARD"
            destination = source / "Archive"
            write_file(source / "IMG_0005.CR3", b"raw")

            with self.assertRaisesRegex(ValueError, "outside the source tree"):
                ImportPlanner().plan(source, destination, shoot_name="Recursive Import")

    def test_source_symlinked_media_is_skipped_to_stay_inside_selected_root(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "CARD"
            destination = root / "Archive"
            outside = write_file(root / "outside" / "PRIVATE.JPG", b"private")
            source.mkdir()
            os.symlink(outside, source / "PRIVATE.JPG")

            plan = ImportPlanner().plan(source, destination, shoot_name="Symlink Card")

            self.assertEqual(0, len(plan.operations))
            self.assertIn("Skipped symlinked source", plan.warnings[0])

    def test_destination_symlink_ancestor_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "CARD"
            destination = root / "Archive"
            outside = root / "outside"
            write_file(source / "IMG_0006.JPG", b"photo")
            outside.mkdir()
            destination.mkdir()
            os.symlink(outside, destination / "Symlink Shoot")

            with self.assertRaisesRegex(ValueError, "Destination path contains a symlink"):
                ImportPlanner().plan(source, destination, shoot_name="Symlink Shoot")

    def test_destination_symlink_file_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "CARD"
            destination = root / "Archive"
            outside = write_file(root / "outside" / "IMG_0007.JPG", b"outside")
            write_file(source / "IMG_0007.JPG", b"photo")
            (destination / "Shoot").mkdir(parents=True)
            os.symlink(outside, destination / "Shoot" / "IMG_0007.JPG")

            with self.assertRaisesRegex(ValueError, "Destination path contains a symlink"):
                ImportPlanner().plan(source, destination, shoot_name="Shoot")

    def test_sidecar_groups_do_not_cross_source_folders(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "CARD"
            destination = root / "Archive"
            write_file(source / "A" / "IMG_0008.CR3", b"raw")
            write_file(source / "B" / "IMG_0008.JPG", b"jpeg")

            plan = ImportPlanner().plan(source, destination, shoot_name="Repeated Names")

            self.assertEqual(0, len(plan.groups))


if __name__ == "__main__":
    unittest.main()
