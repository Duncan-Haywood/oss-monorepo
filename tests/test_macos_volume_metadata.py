import tempfile
import unittest
from pathlib import Path

from shootflow.macos_volume_metadata import (
    MacOSVolumeMetadata,
    recommend_import_route_from_macos_metadata,
    storage_candidates_from_macos_metadata,
)


class MacOSVolumeMetadataTest(unittest.TestCase):
    def test_converts_native_card_and_external_ssd_metadata_to_route_candidates(self):
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
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
                    ),
                ]
            )

        self.assertEqual([candidate.name for candidate in candidates], ["EOS_DIGITAL", "Samsung_T7"])
        self.assertTrue(candidates[0].is_removable)
        self.assertTrue(candidates[0].is_read_only)
        self.assertTrue(candidates[1].is_removable)
        self.assertFalse(candidates[1].is_read_only)

    def test_recommends_capacity_gated_route_from_native_metadata(self):
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            card = workspace / "EOS_DIGITAL"
            ssd = workspace / "Samsung_T7"
            (card / "DCIM" / "100CANON").mkdir(parents=True)
            ssd.mkdir()

            recommendation = recommend_import_route_from_macos_metadata(
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
                    ),
                    MacOSVolumeMetadata(
                        name="Samsung_T7",
                        mount_path=ssd,
                        free_bytes=96 * 1024**3,
                        total_bytes=2 * 1024**4,
                        is_removable=False,
                        is_ejectable=True,
                        is_internal=False,
                        is_read_only=False,
                    ),
                ],
                expected_import_bytes=80 * 1024**3,
                headroom_bytes=32 * 1024**3,
            )

        self.assertFalse(recommendation.ready)
        self.assertEqual(recommendation.status, "blocked")
        self.assertEqual(recommendation.source.candidate.name, "EOS_DIGITAL")
        self.assertIsNone(recommendation.destination)
        self.assertIn(
            "destination candidate does not have enough free space for estimated import plus safety headroom",
            recommendation.safety_notes,
        )

    def test_skips_system_network_missing_and_symlinked_volumes(self):
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            system = workspace / "Macintosh HD"
            network = workspace / "NAS"
            real_card = workspace / "RealCard"
            symlinked_card = workspace / "EOS_DIGITAL"
            missing = workspace / "Missing"
            system.mkdir()
            network.mkdir()
            (real_card / "DCIM").mkdir(parents=True)
            symlinked_card.symlink_to(real_card, target_is_directory=True)

            candidates = storage_candidates_from_macos_metadata(
                [
                    MacOSVolumeMetadata(
                        name="Macintosh HD",
                        mount_path=system,
                        free_bytes=500 * 1024**3,
                        total_bytes=1 * 1024**4,
                        is_removable=False,
                        is_ejectable=False,
                        is_internal=True,
                        is_read_only=False,
                        is_system_volume=True,
                    ),
                    MacOSVolumeMetadata(
                        name="NAS",
                        mount_path=network,
                        free_bytes=8 * 1024**4,
                        total_bytes=12 * 1024**4,
                        is_removable=False,
                        is_ejectable=False,
                        is_internal=False,
                        is_read_only=False,
                        is_network=True,
                    ),
                    MacOSVolumeMetadata(
                        name="EOS_DIGITAL",
                        mount_path=symlinked_card,
                        free_bytes=8 * 1024**3,
                        total_bytes=128 * 1024**3,
                        is_removable=True,
                        is_ejectable=True,
                        is_internal=False,
                        is_read_only=True,
                    ),
                    MacOSVolumeMetadata(
                        name="Missing",
                        mount_path=missing,
                        free_bytes=8 * 1024**3,
                        total_bytes=128 * 1024**3,
                        is_removable=True,
                        is_ejectable=True,
                        is_internal=False,
                        is_read_only=True,
                    ),
                ]
            )

        self.assertEqual(candidates, [])

    def test_validates_native_metadata_arguments(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)

            with self.assertRaises(TypeError):
                storage_candidates_from_macos_metadata((  # type: ignore[arg-type]
                    MacOSVolumeMetadata(
                        name="EOS_DIGITAL",
                        mount_path=path,
                        free_bytes=1,
                        total_bytes=1,
                        is_removable=True,
                        is_ejectable=True,
                        is_internal=False,
                        is_read_only=True,
                    ),
                ))

            with self.assertRaises(ValueError):
                storage_candidates_from_macos_metadata(
                    [
                        MacOSVolumeMetadata(
                            name="",
                            mount_path=path,
                            free_bytes=1,
                            total_bytes=1,
                            is_removable=True,
                            is_ejectable=True,
                            is_internal=False,
                            is_read_only=True,
                        )
                    ]
                )

            with self.assertRaises(ValueError):
                recommend_import_route_from_macos_metadata(
                    [
                        MacOSVolumeMetadata(
                            name="EOS_DIGITAL",
                            mount_path=path,
                            free_bytes=1,
                            total_bytes=1,
                            is_removable=True,
                            is_ejectable=True,
                            is_internal=False,
                            is_read_only=True,
                        )
                    ],
                    expected_import_bytes=0,
                )


if __name__ == "__main__":
    unittest.main()
