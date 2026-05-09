import tempfile
import unittest
from pathlib import Path
from unittest import mock

from shootflow.storage_discovery import (
    DiscoveredVolumeMetadata,
    discover_import_route,
    discover_storage_candidates,
)


class StorageDiscoveryTest(unittest.TestCase):
    def test_discovers_immediate_volume_children_as_storage_candidates(self):
        with tempfile.TemporaryDirectory() as root:
            volumes = Path(root) / "Volumes"
            card = volumes / "EOS_DIGITAL"
            ssd = volumes / "Samsung_T7"
            (card / "DCIM" / "100CANON").mkdir(parents=True)
            ssd.mkdir(parents=True)

            candidates = discover_storage_candidates([volumes])

        self.assertEqual([candidate.name for candidate in candidates], ["EOS_DIGITAL", "Samsung_T7"])
        self.assertTrue(candidates[0].is_removable)
        self.assertFalse(candidates[0].is_read_only)
        self.assertGreater(candidates[0].total_bytes, 0)
        self.assertGreaterEqual(candidates[0].free_bytes, 0)

    def test_discovery_applies_native_volume_metadata_overrides(self):
        with tempfile.TemporaryDirectory() as root:
            volumes = Path(root) / "Volumes"
            card = volumes / "Untitled"
            ssd = volumes / "StudioRaid"
            (card / "DCIM" / "100CANON").mkdir(parents=True)
            ssd.mkdir(parents=True)

            candidates = discover_storage_candidates(
                [volumes],
                metadata_by_path={
                    card: DiscoveredVolumeMetadata(
                        name="EOS_DIGITAL",
                        free_bytes=4 * 1024**3,
                        total_bytes=128 * 1024**3,
                        is_removable=True,
                        is_read_only=True,
                    ),
                    ssd: DiscoveredVolumeMetadata(
                        free_bytes=1_200 * 1024**3,
                        total_bytes=2 * 1024**4,
                        is_removable=False,
                        is_read_only=False,
                    ),
                },
            )

        candidates_by_name = {candidate.name: candidate for candidate in candidates}
        card_candidate = candidates_by_name["EOS_DIGITAL"]
        ssd_candidate = candidates_by_name["StudioRaid"]
        self.assertEqual(card_candidate.free_bytes, 4 * 1024**3)
        self.assertEqual(card_candidate.total_bytes, 128 * 1024**3)
        self.assertTrue(card_candidate.is_removable)
        self.assertTrue(card_candidate.is_read_only)
        self.assertFalse(ssd_candidate.is_removable)
        self.assertFalse(ssd_candidate.is_read_only)

    def test_discovery_preserves_volume_root_order_without_metadata(self):
        with tempfile.TemporaryDirectory() as root:
            workspace = Path(root)
            first_root = workspace / "FirstRoot"
            second_root = workspace / "SecondRoot"
            first_card = first_root / "ZZZ_EOS"
            second_card = second_root / "AAA_EOS"
            (first_card / "DCIM").mkdir(parents=True)
            (second_card / "DCIM").mkdir(parents=True)

            candidates = discover_storage_candidates([first_root, second_root])
            recommendation = discover_import_route([first_root, second_root])

        self.assertEqual([candidate.name for candidate in candidates], ["ZZZ_EOS", "AAA_EOS"])
        self.assertEqual(recommendation.source.candidate.name, "ZZZ_EOS")

    def test_discover_import_route_uses_native_metadata_for_capacity_gating(self):
        with tempfile.TemporaryDirectory() as root:
            volumes = Path(root) / "Volumes"
            card = volumes / "Untitled"
            ssd = volumes / "StudioRaid"
            (card / "DCIM" / "100CANON").mkdir(parents=True)
            ssd.mkdir(parents=True)

            recommendation = discover_import_route(
                [volumes],
                expected_import_bytes=100 * 1024**3,
                headroom_bytes=0,
                metadata_by_path={
                    card: DiscoveredVolumeMetadata(
                        name="EOS_DIGITAL",
                        free_bytes=8 * 1024**3,
                        total_bytes=128 * 1024**3,
                        is_removable=True,
                        is_read_only=True,
                    ),
                    ssd: DiscoveredVolumeMetadata(
                        free_bytes=900 * 1024**3,
                        total_bytes=2 * 1024**4,
                        is_removable=False,
                        is_read_only=False,
                    ),
                },
            )

        self.assertTrue(recommendation.ready)
        self.assertEqual(recommendation.source.candidate.name, "EOS_DIGITAL")
        self.assertEqual(recommendation.destination.candidate.name, "StudioRaid")
        self.assertEqual(recommendation.destination.candidate.free_bytes, 900 * 1024**3)

    def test_discovery_skips_symlinked_volume_entries_and_files(self):
        with tempfile.TemporaryDirectory() as root:
            workspace = Path(root)
            volumes = workspace / "Volumes"
            target = workspace / "RealCard"
            symlinked_card = volumes / "EOS_DIGITAL"
            file_entry = volumes / "notes.txt"
            volumes.mkdir()
            (target / "DCIM").mkdir(parents=True)
            symlinked_card.symlink_to(target, target_is_directory=True)
            file_entry.write_text("not a mounted volume", encoding="utf-8")

            candidates = discover_storage_candidates([volumes])

        self.assertEqual(candidates, [])

    def test_discovery_skips_roots_that_cannot_be_listed(self):
        with tempfile.TemporaryDirectory() as root:
            volumes = Path(root) / "Volumes"
            volumes.mkdir()
            original_iterdir = Path.iterdir

            def guarded_iterdir(path):
                if path == volumes:
                    raise PermissionError("cannot list volume root")
                return original_iterdir(path)

            with mock.patch.object(Path, "iterdir", guarded_iterdir):
                candidates = discover_storage_candidates([volumes])
                recommendation = discover_import_route([volumes])

        self.assertEqual(candidates, [])
        self.assertFalse(recommendation.ready)
        self.assertIn("no discovered storage candidates found", recommendation.safety_notes)

    def test_discovery_validates_volume_roots(self):
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaises(TypeError):
                discover_storage_candidates((Path(root),))  # type: ignore[arg-type]
            with self.assertRaises(TypeError):
                discover_storage_candidates([str(root)])  # type: ignore[list-item]
            with self.assertRaises(ValueError):
                discover_storage_candidates([])

    def test_discovery_validates_native_volume_metadata(self):
        with tempfile.TemporaryDirectory() as root:
            volumes = Path(root) / "Volumes"
            card = volumes / "EOS_DIGITAL"
            (card / "DCIM").mkdir(parents=True)

            with self.assertRaises(TypeError):
                discover_storage_candidates([volumes], metadata_by_path={str(card): DiscoveredVolumeMetadata()})  # type: ignore[dict-item]
            with self.assertRaises(TypeError):
                discover_storage_candidates([volumes], metadata_by_path={card: object()})  # type: ignore[dict-item]
            with self.assertRaises(ValueError):
                discover_storage_candidates(
                    [volumes],
                    metadata_by_path={card: DiscoveredVolumeMetadata(free_bytes=-1)},
                )

    def test_discover_import_route_validates_capacity_arguments_before_scanning_results(self):
        with tempfile.TemporaryDirectory() as root:
            volumes = Path(root) / "Volumes"
            volumes.mkdir()

            with self.assertRaises(TypeError):
                discover_import_route([volumes], expected_import_bytes="1")  # type: ignore[arg-type]
            with self.assertRaises(ValueError):
                discover_import_route([volumes], expected_import_bytes=0)
            with self.assertRaises(TypeError):
                discover_import_route([volumes], expected_import_bytes=1, headroom_bytes=1.5)  # type: ignore[arg-type]
            with self.assertRaises(ValueError):
                discover_import_route([volumes], expected_import_bytes=1, headroom_bytes=-1)

    def test_discover_import_route_uses_capacity_gate(self):
        with tempfile.TemporaryDirectory() as root:
            volumes = Path(root) / "Volumes"
            card = volumes / "EOS_DIGITAL"
            ssd = volumes / "Samsung_T7"
            (card / "DCIM" / "100CANON").mkdir(parents=True)
            ssd.mkdir(parents=True)

            with mock.patch("shootflow.storage_discovery._read_filesystem_stats", return_value=(900 * 1024**3, 2 * 1024**4)):
                recommendation = discover_import_route(
                    [volumes],
                    expected_import_bytes=1024,
                    headroom_bytes=0,
                )

        self.assertTrue(recommendation.ready)
        self.assertEqual(recommendation.source.candidate.name, "EOS_DIGITAL")
        self.assertEqual(recommendation.destination.candidate.name, "Samsung_T7")
        self.assertIn("capacity gate active", " ".join(recommendation.safety_notes))

    def test_discover_import_route_blocks_cleanly_when_no_volumes_are_found(self):
        with tempfile.TemporaryDirectory() as root:
            volumes = Path(root) / "Volumes"
            volumes.mkdir()

            recommendation = discover_import_route([volumes])

        self.assertFalse(recommendation.ready)
        self.assertEqual(recommendation.status, "blocked")
        self.assertIsNone(recommendation.source)
        self.assertIsNone(recommendation.destination)
        self.assertIn("no discovered storage candidates found", recommendation.safety_notes)


if __name__ == "__main__":
    unittest.main()
