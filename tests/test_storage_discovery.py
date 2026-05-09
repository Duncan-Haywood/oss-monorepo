import tempfile
import unittest
from pathlib import Path
from unittest import mock

from shootflow.storage_discovery import (
    VolumeDiscoveryHint,
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

    def test_discovery_applies_native_volume_hints_to_candidates(self):
        with tempfile.TemporaryDirectory() as root:
            volumes = Path(root) / "Volumes"
            card = volumes / "Untitled"
            (card / "DCIM" / "100CANON").mkdir(parents=True)

            candidates = discover_storage_candidates(
                [volumes],
                volume_hints={
                    card: VolumeDiscoveryHint(
                        display_name="EOS_R5_CARD",
                        is_removable=True,
                        is_read_only=True,
                    )
                },
            )

        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0].name, "EOS_R5_CARD")
        self.assertTrue(candidates[0].is_removable)
        self.assertTrue(candidates[0].is_read_only)

    def test_discover_import_route_uses_hints_for_route_ranking(self):
        with tempfile.TemporaryDirectory() as root:
            volumes = Path(root) / "Volumes"
            internal_disk = volumes / "Macintosh HD"
            external_ssd = volumes / "Untitled"
            card = volumes / "Camera"
            (card / "DCIM" / "100CANON").mkdir(parents=True)
            internal_disk.mkdir(parents=True)
            external_ssd.mkdir(parents=True)

            with mock.patch("shootflow.storage_discovery._read_filesystem_stats", return_value=(800 * 1024**3, 2 * 1024**4)):
                recommendation = discover_import_route(
                    [volumes],
                    volume_hints={
                        internal_disk: VolumeDiscoveryHint(is_removable=False),
                        external_ssd: VolumeDiscoveryHint(
                            display_name="Samsung_T7",
                            is_removable=True,
                            is_read_only=False,
                        ),
                        card: VolumeDiscoveryHint(display_name="EOS_R5_CARD", is_removable=True),
                    },
                )

        self.assertTrue(recommendation.ready)
        self.assertEqual(recommendation.source.candidate.name, "EOS_R5_CARD")
        self.assertEqual(recommendation.destination.candidate.name, "Samsung_T7")

    def test_discovery_validates_volume_hints(self):
        with tempfile.TemporaryDirectory() as root:
            volumes = Path(root) / "Volumes"
            card = volumes / "EOS_DIGITAL"
            (card / "DCIM").mkdir(parents=True)

            with self.assertRaises(TypeError):
                discover_storage_candidates([volumes], volume_hints=[VolumeDiscoveryHint()])  # type: ignore[arg-type]
            with self.assertRaises(TypeError):
                discover_storage_candidates([volumes], volume_hints={str(card): VolumeDiscoveryHint()})  # type: ignore[dict-item]
            with self.assertRaises(TypeError):
                discover_storage_candidates([volumes], volume_hints={card: object()})  # type: ignore[dict-item]
            with self.assertRaises(TypeError):
                discover_storage_candidates([volumes], volume_hints={card: VolumeDiscoveryHint(display_name=123)})  # type: ignore[arg-type]
            with self.assertRaises(ValueError):
                discover_storage_candidates([volumes], volume_hints={card: VolumeDiscoveryHint(display_name="   ")})
            with self.assertRaises(TypeError):
                discover_storage_candidates([volumes], volume_hints={card: VolumeDiscoveryHint(is_removable="yes")})  # type: ignore[arg-type]
            with self.assertRaises(TypeError):
                discover_storage_candidates([volumes], volume_hints={card: VolumeDiscoveryHint(is_read_only="no")})  # type: ignore[arg-type]

    def test_discover_import_route_carries_hints_through_capacity_gate(self):
        with tempfile.TemporaryDirectory() as root:
            volumes = Path(root) / "Volumes"
            card = volumes / "Untitled"
            ssd = volumes / "External"
            (card / "DCIM" / "100CANON").mkdir(parents=True)
            ssd.mkdir(parents=True)

            with mock.patch("shootflow.storage_discovery._read_filesystem_stats", return_value=(900 * 1024**3, 2 * 1024**4)):
                recommendation = discover_import_route(
                    [volumes],
                    expected_import_bytes=100 * 1024**3,
                    headroom_bytes=32 * 1024**3,
                    volume_hints={
                        card: VolumeDiscoveryHint(display_name="EOS_R5_CARD", is_removable=True),
                        ssd: VolumeDiscoveryHint(display_name="Samsung_T7", is_removable=True, is_read_only=False),
                    },
                )

        self.assertTrue(recommendation.ready)
        self.assertEqual(recommendation.source.candidate.name, "EOS_R5_CARD")
        self.assertEqual(recommendation.destination.candidate.name, "Samsung_T7")
        self.assertIn("capacity gate active", " ".join(recommendation.safety_notes))

    def test_read_write_hint_cannot_override_unwritable_filesystem_check(self):
        with tempfile.TemporaryDirectory() as root:
            volumes = Path(root) / "Volumes"
            archive = volumes / "Archive"
            archive.mkdir(parents=True)

            with mock.patch("shootflow.storage_discovery.os.access", return_value=False):
                candidates = discover_storage_candidates(
                    [volumes],
                    volume_hints={archive: VolumeDiscoveryHint(is_read_only=False)},
                )

        self.assertEqual(len(candidates), 1)
        self.assertTrue(candidates[0].is_read_only)


if __name__ == "__main__":
    unittest.main()
