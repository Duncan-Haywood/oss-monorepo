import tempfile
import unittest
from pathlib import Path

from shootflow.storage import StorageCandidate, rank_storage_candidates


class StorageRankingTest(unittest.TestCase):
    def test_camera_card_signals_make_read_only_source_candidate_review_only(self):
        with tempfile.TemporaryDirectory() as root:
            card = Path(root) / "EOS_DIGITAL"
            (card / "DCIM" / "100CANON").mkdir(parents=True)

            ranked = rank_storage_candidates(
                [
                    StorageCandidate(
                        name="EOS_DIGITAL",
                        path=card,
                        free_bytes=0,
                        total_bytes=128 * 1024**3,
                        is_removable=True,
                        is_read_only=True,
                    )
                ]
            )

        self.assertEqual(len(ranked), 1)
        self.assertEqual(ranked[0].role, "source")
        self.assertEqual(ranked[0].safety, "review")
        self.assertGreaterEqual(ranked[0].confidence, 80)
        self.assertIn("DCIM", ranked[0].reasons)

    def test_low_confidence_read_only_drive_is_not_auto_selected(self):
        with tempfile.TemporaryDirectory() as root:
            archive = Path(root) / "Archive"
            archive.mkdir()

            ranked = rank_storage_candidates(
                [
                    StorageCandidate(
                        name="Archive",
                        path=archive,
                        free_bytes=0,
                        total_bytes=4 * 1024**4,
                        is_removable=False,
                        is_read_only=True,
                    )
                ]
            )

        self.assertEqual(ranked[0].role, "review")
        self.assertEqual(ranked[0].safety, "review")
        self.assertLess(ranked[0].confidence, 50)

    def test_fast_writable_ssd_is_ranked_as_destination(self):
        with tempfile.TemporaryDirectory() as root:
            ssd = Path(root) / "Samsung_T7"
            ssd.mkdir()

            ranked = rank_storage_candidates(
                [
                    StorageCandidate(
                        name="Samsung_T7",
                        path=ssd,
                        free_bytes=800 * 1024**3,
                        total_bytes=2 * 1024**4,
                        is_removable=True,
                        is_read_only=False,
                    )
                ]
            )

        self.assertEqual(ranked[0].role, "destination")
        self.assertEqual(ranked[0].safety, "automatic")
        self.assertIn("writable", ranked[0].reasons)


if __name__ == "__main__":
    unittest.main()
