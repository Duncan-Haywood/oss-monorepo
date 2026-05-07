import tempfile
import unittest
from pathlib import Path

from shootflow.storage import StorageVolume, rank_storage_candidates


class StorageRankingTests(unittest.TestCase):
    def test_camera_card_is_review_only_source_not_automatic_destination(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            card_root = Path(tmp) / "EOS_DIGITAL"
            (card_root / "DCIM").mkdir(parents=True)

            candidates = rank_storage_candidates(
                [
                    StorageVolume(
                        path=card_root,
                        name="EOS_DIGITAL",
                        total_bytes=64 * 1024**3,
                        free_bytes=12 * 1024**3,
                        removable=True,
                        read_only=False,
                    )
                ]
            )

            self.assertEqual(len(candidates), 1)
            candidate = candidates[0]
            self.assertEqual(candidate.source_action, "review")
            self.assertEqual(candidate.destination_action, "never")
            self.assertIn("camera card", candidate.reasons)

    def test_large_writable_ssd_can_be_automatic_destination(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ssd_root = Path(tmp) / "ShootFlow_SSD"
            ssd_root.mkdir()

            candidates = rank_storage_candidates(
                [
                    StorageVolume(
                        path=ssd_root,
                        name="ShootFlow_SSD",
                        total_bytes=4 * 1024**4,
                        free_bytes=3 * 1024**4,
                        removable=True,
                        read_only=False,
                    )
                ]
            )

            self.assertEqual(candidates[0].destination_action, "auto")
            self.assertGreater(candidates[0].destination_score, candidates[0].source_score)
            self.assertIn("large writable volume", candidates[0].reasons)

    def test_read_only_unknown_volume_requires_review(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            archive_root = Path(tmp) / "Archive"
            archive_root.mkdir()

            candidates = rank_storage_candidates(
                [
                    StorageVolume(
                        path=archive_root,
                        name="Archive",
                        total_bytes=1 * 1024**4,
                        free_bytes=500 * 1024**3,
                        removable=False,
                        read_only=True,
                    )
                ]
            )

            self.assertEqual(candidates[0].source_action, "review")
            self.assertEqual(candidates[0].destination_action, "never")
            self.assertIn("read-only", candidates[0].reasons)


if __name__ == "__main__":
    unittest.main()
