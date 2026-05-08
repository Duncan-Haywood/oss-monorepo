import tempfile
import unittest
from pathlib import Path

from shootflow.macos_volume_metadata import (
    MacOSVolumeMetadata,
    recommend_import_route_from_macos_metadata,
    storage_candidates_from_macos_metadata,
)


class MacOSVolumeMetadataTest(unittest.TestCase):
    def test_converts_native_records_to_existing_storage_candidates(self):
        with tempfile.TemporaryDirectory() as root:
            workspace = Path(root).resolve()
            card = workspace / "EOS_DIGITAL"
            ssd = workspace / "Samsung_T7"
            (card / "DCIM" / "100CANON").mkdir(parents=True)
            ssd.mkdir()

            candidates = storage_candidates_from_macos_metadata(
                [
                    MacOSVolumeMetadata(
                        name="EOS_DIGITAL",
                        mount_path=card,
                        free_bytes=8 * 1024**3,
                        total_bytes=128 * 1024**3,
                        is_removable=True,
                        is_ejectable=True,
                        is_internal=False,
                        is_read_only=True,
                        is_network=False,
                        is_system_volume=False,
                    ),
                    MacOSVolumeMetadata(
                        name="Samsung_T7",
                        mount_path=ssd,
                        free_bytes=800 * 1024**3,
                        total_bytes=2 * 1024**4,
                        is_removable=False,
                        is_ejectable=True,
                        is_internal=False,
                        is_read_only=False,
                        is_network=False,
                        is_system_volume=False,
                    ),
                ]
            )

        self.assertEqual([candidate.name for candidate in candidates], ["EOS_DIGITAL", "Samsung_T7"])
        self.assertTrue(candidates[0].is_removable)
        self.assertTrue(candidates[1].is_removable)
        self.assertFalse(candidates[1].is_read_only)

    def test_skips_unsafe_or_unusable_native_records(self):
        with tempfile.TemporaryDirectory() as root:
            workspace = Path(root).resolve()
            usable_card = workspace / "EOS_DIGITAL"
            system_volume = workspace / "Macintosh HD"
            network_volume = workspace / "Shared NAS"
            file_backed = workspace / "not-a-volume"
            symlink_target = workspace / "RealVolume"
            symlinked_volume = workspace / "SymlinkedVolume"
            symlinked_parent_target = workspace / "ParentTarget"
            symlinked_parent = workspace / "LinkedParent"
            child_under_symlinked_parent = symlinked_parent / "ChildVolume"
            missing_volume = workspace / "Missing"
            (usable_card / "DCIM").mkdir(parents=True)
            system_volume.mkdir()
            network_volume.mkdir()
            file_backed.write_text("not a directory", encoding="utf-8")
            symlink_target.mkdir()
            symlinked_volume.symlink_to(symlink_target, target_is_directory=True)
            (symlinked_parent_target / "ChildVolume").mkdir(parents=True)
            symlinked_parent.symlink_to(symlinked_parent_target, target_is_directory=True)

            candidates = storage_candidates_from_macos_metadata(
                [
                    self._record("Macintosh HD", system_volume, is_system_volume=True),
                    self._record("Shared NAS", network_volume, is_network=True),
                    self._record("Missing", missing_volume),
                    self._record("not-a-volume", file_backed),
                    self._record("SymlinkedVolume", symlinked_volume),
                    self._record("ChildVolume", child_under_symlinked_parent),
                    self._record("EOS_DIGITAL", usable_card, is_read_only=True),
                ]
            )

        self.assertEqual([candidate.name for candidate in candidates], ["EOS_DIGITAL"])

    def test_recommends_capacity_gated_import_route_from_native_records(self):
        with tempfile.TemporaryDirectory() as root:
            workspace = Path(root).resolve()
            card = workspace / "EOS_DIGITAL"
            ssd = workspace / "Samsung_T7"
            (card / "DCIM" / "100CANON").mkdir(parents=True)
            ssd.mkdir()

            recommendation = recommend_import_route_from_macos_metadata(
                [
                    self._record(
                        "EOS_DIGITAL",
                        card,
                        free_bytes=8 * 1024**3,
                        total_bytes=128 * 1024**3,
                        is_removable=True,
                        is_read_only=True,
                    ),
                    self._record(
                        "Samsung_T7",
                        ssd,
                        free_bytes=300 * 1024**3,
                        total_bytes=2 * 1024**4,
                        is_ejectable=True,
                    ),
                ],
                expected_import_bytes=80 * 1024**3,
                headroom_bytes=32 * 1024**3,
            )

        self.assertTrue(recommendation.ready)
        self.assertEqual(recommendation.source.candidate.name, "EOS_DIGITAL")
        self.assertEqual(recommendation.destination.candidate.name, "Samsung_T7")
        self.assertIn("capacity gate active", " ".join(recommendation.safety_notes))

    def test_route_blocks_cleanly_when_all_native_records_are_skipped(self):
        with tempfile.TemporaryDirectory() as root:
            system_volume = Path(root).resolve() / "Macintosh HD"
            system_volume.mkdir()

            recommendation = recommend_import_route_from_macos_metadata(
                [
                    self._record("Macintosh HD", system_volume, is_system_volume=True),
                ],
                expected_import_bytes=1024,
                headroom_bytes=0,
            )

        self.assertFalse(recommendation.ready)
        self.assertEqual(recommendation.status, "blocked")
        self.assertIn("no usable macOS volume metadata records found", recommendation.safety_notes)
        self.assertIn("capacity gate active", " ".join(recommendation.safety_notes))

    def test_route_blocks_cleanly_when_native_metadata_is_empty(self):
        recommendation = recommend_import_route_from_macos_metadata([])

        self.assertFalse(recommendation.ready)
        self.assertEqual(recommendation.status, "blocked")
        self.assertIn("no usable macOS volume metadata records found", recommendation.safety_notes)
        self.assertNotIn("capacity gate active", " ".join(recommendation.safety_notes))

    def test_validates_native_metadata_records_and_capacity_arguments(self):
        with tempfile.TemporaryDirectory() as root:
            volume = Path(root).resolve() / "EOS_DIGITAL"
            volume.mkdir()

            with self.assertRaises(TypeError):
                storage_candidates_from_macos_metadata((self._record("EOS_DIGITAL", volume),))  # type: ignore[arg-type]
            with self.assertRaises(ValueError):
                storage_candidates_from_macos_metadata([])
            with self.assertRaises(TypeError):
                storage_candidates_from_macos_metadata([object()])  # type: ignore[list-item]
            with self.assertRaises(TypeError):
                MacOSVolumeMetadata(
                    name="EOS_DIGITAL",
                    mount_path=volume,
                    free_bytes=True,  # type: ignore[arg-type]
                    total_bytes=128 * 1024**3,
                    is_removable=True,
                    is_ejectable=True,
                    is_internal=False,
                    is_read_only=True,
                    is_network=False,
                    is_system_volume=False,
                )
            with self.assertRaises(ValueError):
                MacOSVolumeMetadata(
                    name="EOS_DIGITAL",
                    mount_path=volume,
                    free_bytes=129 * 1024**3,
                    total_bytes=128 * 1024**3,
                    is_removable=True,
                    is_ejectable=True,
                    is_internal=False,
                    is_read_only=True,
                    is_network=False,
                    is_system_volume=False,
                )
            with self.assertRaises(TypeError):
                recommend_import_route_from_macos_metadata([self._record("EOS_DIGITAL", volume)], headroom_bytes=True)
            with self.assertRaises(TypeError):
                recommend_import_route_from_macos_metadata(
                    [self._record("EOS_DIGITAL", volume)],
                    expected_import_bytes=True,
                    headroom_bytes=0,
                )

    def _record(
        self,
        name: str,
        mount_path: Path,
        *,
        free_bytes: int = 8 * 1024**3,
        total_bytes: int = 128 * 1024**3,
        is_removable: bool = False,
        is_ejectable: bool = False,
        is_internal: bool = False,
        is_read_only: bool = False,
        is_network: bool = False,
        is_system_volume: bool = False,
    ) -> MacOSVolumeMetadata:
        return MacOSVolumeMetadata(
            name=name,
            mount_path=mount_path,
            free_bytes=free_bytes,
            total_bytes=total_bytes,
            is_removable=is_removable,
            is_ejectable=is_ejectable,
            is_internal=is_internal,
            is_read_only=is_read_only,
            is_network=is_network,
            is_system_volume=is_system_volume,
        )


if __name__ == "__main__":
    unittest.main()
