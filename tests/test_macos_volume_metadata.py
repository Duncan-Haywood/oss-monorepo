import tempfile
import unittest
from pathlib import Path

from shootflow.macos_volume_metadata import (
    MacOSVolumeMetadata,
    recommend_import_route_from_macos_metadata,
    storage_candidates_from_macos_metadata,
)


class MacOSVolumeMetadataTest(unittest.TestCase):
    def test_converts_native_metadata_to_storage_candidates(self):
        with tempfile.TemporaryDirectory() as root:
            workspace = Path(root)
            card = workspace / "EOS_DIGITAL"
            ssd = workspace / "Samsung_T7"
            (card / "DCIM" / "100CANON").mkdir(parents=True)
            ssd.mkdir()

            candidates = storage_candidates_from_macos_metadata(
                [
                    MacOSVolumeMetadata(
                        name="EOS_DIGITAL",
                        mount_path=card,
                        free_bytes=12 * 1024**3,
                        total_bytes=64 * 1024**3,
                        is_removable=True,
                        is_ejectable=True,
                        is_internal=False,
                        is_read_only=False,
                        is_network=False,
                        is_system_volume=False,
                    ),
                    MacOSVolumeMetadata(
                        name="Samsung_T7",
                        mount_path=ssd,
                        free_bytes=900 * 1024**3,
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
        self.assertFalse(candidates[0].is_read_only)
        self.assertTrue(candidates[1].is_removable)
        self.assertEqual(candidates[1].free_bytes, 900 * 1024**3)

    def test_skips_system_network_missing_and_symlinked_volumes(self):
        with tempfile.TemporaryDirectory() as root:
            workspace = Path(root)
            system_volume = workspace / "Macintosh HD"
            network_volume = workspace / "Team NAS"
            target = workspace / "RealCard"
            symlinked_volume = workspace / "EOS_DIGITAL"
            linked_parent_target = workspace / "LinkedParentTarget"
            linked_parent = workspace / "LinkedParent"
            symlinked_parent_volume = linked_parent / "NIKON_CARD"
            file_volume = workspace / "NotAVolume"
            usable_ssd = workspace / "Samsung_T7"
            system_volume.mkdir()
            network_volume.mkdir()
            target.mkdir()
            symlinked_volume.symlink_to(target, target_is_directory=True)
            (linked_parent_target / "NIKON_CARD").mkdir(parents=True)
            linked_parent.symlink_to(linked_parent_target, target_is_directory=True)
            file_volume.write_text("not a mounted volume", encoding="utf-8")
            usable_ssd.mkdir()

            candidates = storage_candidates_from_macos_metadata(
                [
                    self._metadata(name="Macintosh HD", mount_path=system_volume, is_system_volume=True),
                    self._metadata(name="Team NAS", mount_path=network_volume, is_network=True),
                    self._metadata(name="Missing", mount_path=workspace / "Missing"),
                    self._metadata(name="EOS_DIGITAL", mount_path=symlinked_volume),
                    self._metadata(name="NIKON_CARD", mount_path=symlinked_parent_volume),
                    self._metadata(name="NotAVolume", mount_path=file_volume),
                    self._metadata(name="Samsung_T7", mount_path=usable_ssd),
                ]
            )

        self.assertEqual([candidate.name for candidate in candidates], ["Samsung_T7"])

    def test_recommendation_uses_capacity_gate(self):
        with tempfile.TemporaryDirectory() as root:
            workspace = Path(root)
            card = workspace / "EOS_DIGITAL"
            ssd = workspace / "Samsung_T7"
            (card / "DCIM").mkdir(parents=True)
            ssd.mkdir()

            recommendation = recommend_import_route_from_macos_metadata(
                [
                    self._metadata(
                        name="EOS_DIGITAL",
                        mount_path=card,
                        free_bytes=8 * 1024**3,
                        total_bytes=64 * 1024**3,
                        is_removable=True,
                    ),
                    self._metadata(
                        name="Samsung_T7",
                        mount_path=ssd,
                        free_bytes=300 * 1024**3,
                        total_bytes=1 * 1024**4,
                        is_ejectable=True,
                    ),
                ],
                expected_import_bytes=280 * 1024**3,
                headroom_bytes=32 * 1024**3,
            )

        self.assertFalse(recommendation.ready)
        self.assertEqual(recommendation.status, "blocked")
        self.assertIn(
            "destination candidate does not have enough free space for estimated import plus safety headroom",
            recommendation.safety_notes,
        )

    def test_validates_metadata_arguments(self):
        with tempfile.TemporaryDirectory() as root:
            mount_path = Path(root)

            with self.assertRaises(TypeError):
                storage_candidates_from_macos_metadata((self._metadata(mount_path=mount_path),))  # type: ignore[arg-type]
            with self.assertRaises(ValueError):
                storage_candidates_from_macos_metadata([])
            with self.assertRaises(TypeError):
                storage_candidates_from_macos_metadata([object()])  # type: ignore[list-item]
            with self.assertRaises(TypeError):
                MacOSVolumeMetadata(
                    name="EOS_DIGITAL",
                    mount_path=str(mount_path),  # type: ignore[arg-type]
                    free_bytes=1,
                    total_bytes=2,
                    is_removable=True,
                    is_ejectable=True,
                    is_internal=False,
                    is_read_only=False,
                    is_network=False,
                    is_system_volume=False,
                )
            with self.assertRaises(ValueError):
                MacOSVolumeMetadata(
                    name="EOS_DIGITAL",
                    mount_path=mount_path,
                    free_bytes=3,
                    total_bytes=2,
                    is_removable=True,
                    is_ejectable=True,
                    is_internal=False,
                    is_read_only=False,
                    is_network=False,
                    is_system_volume=False,
                )
            with self.assertRaises(TypeError):
                MacOSVolumeMetadata(
                    name="EOS_DIGITAL",
                    mount_path=mount_path,
                    free_bytes=True,  # type: ignore[arg-type]
                    total_bytes=2,
                    is_removable=True,
                    is_ejectable=True,
                    is_internal=False,
                    is_read_only=False,
                    is_network=False,
                    is_system_volume=False,
                )
            with self.assertRaises(TypeError):
                recommend_import_route_from_macos_metadata(
                    [self._metadata(mount_path=mount_path)],
                    expected_import_bytes="1",  # type: ignore[arg-type]
                )
            with self.assertRaises(TypeError):
                recommend_import_route_from_macos_metadata(
                    [self._metadata(mount_path=mount_path)],
                    expected_import_bytes=True,  # type: ignore[arg-type]
                )
            with self.assertRaises(TypeError):
                recommend_import_route_from_macos_metadata(
                    [self._metadata(mount_path=mount_path)],
                    headroom_bytes=False,  # type: ignore[arg-type]
                )
            with self.assertRaises(ValueError):
                recommend_import_route_from_macos_metadata(
                    [self._metadata(mount_path=mount_path)],
                    headroom_bytes=-1,
                )

    def _metadata(
        self,
        *,
        name: str = "Volume",
        mount_path: Path,
        free_bytes: int = 100 * 1024**3,
        total_bytes: int = 1 * 1024**4,
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
