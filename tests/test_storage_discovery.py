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

    def test_discovery_applies_advisory_volume_hints_without_overriding_filesystem_capacity(self):
        with tempfile.TemporaryDirectory() as root:
            volumes = Path(root) / "Volumes"
            card = volumes / "Untitled"
            internal = volumes / "InternalMac"
            external = volumes / "T7_MEDIA"
            (card / "DCIM" / "100CANON").mkdir(parents=True)
            internal.mkdir(parents=True)
            external.mkdir(parents=True)

            hints = {
                card: VolumeDiscoveryHint(display_name="EOS_R5_CARD"),
                internal: VolumeDiscoveryHint(is_removable=False),
                external: VolumeDiscoveryHint(is_removable=True, is_read_only=False),
            }

            candidates = discover_storage_candidates([volumes], volume_hints=hints)
            recommendation = discover_import_route([volumes], volume_hints=hints)

        self.assertEqual([candidate.name for candidate in candidates], ["InternalMac", "T7_MEDIA", "EOS_R5_CARD"])
        self.assertFalse(candidates[0].is_removable)
        self.assertTrue(candidates[1].is_removable)
        self.assertFalse(candidates[1].is_read_only)
        self.assertEqual(recommendation.source.candidate.name, "EOS_R5_CARD")
        self.assertEqual(recommendation.destination.candidate.name, "T7_MEDIA")

    def test_discovery_does_not_let_false_hint_override_unwritable_filesystem(self):
        with tempfile.TemporaryDirectory() as root:
            volumes = Path(root) / "Volumes"
            external = volumes / "T7_MEDIA"
            external.mkdir(parents=True)
            hints = {
                external: VolumeDiscoveryHint(is_read_only=False),
            }

            with mock.patch("shootflow.storage_discovery.os.access", return_value=False):
                candidates = discover_storage_candidates([volumes], volume_hints=hints)

        self.assertEqual(len(candidates), 1)
        self.assertTrue(candidates[0].is_read_only)

    def test_discovery_ignores_hints_for_paths_outside_reviewed_volume_roots(self):
        with tempfile.TemporaryDirectory() as root:
            workspace = Path(root)
            volumes = workspace / "Volumes"
            outside = workspace / "EOS_R5_CARD"
            volumes.mkdir()
            (outside / "DCIM").mkdir(parents=True)
            hints = {
                outside: VolumeDiscoveryHint(display_name="EOS_R5_CARD", is_removable=True),
            }

            candidates = discover_storage_candidates([volumes], volume_hints=hints)
            recommendation = discover_import_route([volumes], volume_hints=hints)

        self.assertEqual(candidates, [])
        self.assertFalse(recommendation.ready)
        self.assertIn("no discovered storage candidates found", recommendation.safety_notes)


if __name__ == "__main__":
    unittest.main()
