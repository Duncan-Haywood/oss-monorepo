import tempfile
import unittest
from pathlib import Path

from shootflow.storage import (
    StorageCandidate,
    rank_storage_candidates,
    recommend_import_route,
    recommend_import_route_with_capacity,
)


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

    def test_recommends_review_required_import_route_from_card_to_ssd(self):
        with tempfile.TemporaryDirectory() as root:
            workspace = Path(root)
            card = workspace / "EOS_DIGITAL"
            ssd = workspace / "Samsung_T7"
            (card / "DCIM" / "100CANON").mkdir(parents=True)
            ssd.mkdir()

            recommendation = recommend_import_route(
                [
                    StorageCandidate(
                        name="EOS_DIGITAL",
                        path=card,
                        free_bytes=8 * 1024**3,
                        total_bytes=128 * 1024**3,
                        is_removable=True,
                        is_read_only=True,
                    ),
                    StorageCandidate(
                        name="Samsung_T7",
                        path=ssd,
                        free_bytes=800 * 1024**3,
                        total_bytes=2 * 1024**4,
                        is_removable=True,
                        is_read_only=False,
                    ),
                ]
            )

        self.assertTrue(recommendation.ready)
        self.assertTrue(recommendation.review_required)
        self.assertEqual(recommendation.status, "ready_for_review")
        self.assertEqual(recommendation.source.candidate.name, "EOS_DIGITAL")
        self.assertEqual(recommendation.destination.candidate.name, "Samsung_T7")
        self.assertIn("source media will not be deleted", recommendation.safety_notes)
        self.assertIn("copy must be verified by checksum manifest", recommendation.safety_notes)

    def test_import_route_blocks_without_automatic_destination(self):
        with tempfile.TemporaryDirectory() as root:
            workspace = Path(root)
            card = workspace / "FUJI_CARD"
            (card / "DCIM" / "101_FUJI").mkdir(parents=True)

            recommendation = recommend_import_route(
                [
                    StorageCandidate(
                        name="FUJI_CARD",
                        path=card,
                        free_bytes=2 * 1024**3,
                        total_bytes=64 * 1024**3,
                        is_removable=True,
                        is_read_only=True,
                    )
                ]
            )

        self.assertFalse(recommendation.ready)
        self.assertEqual(recommendation.status, "blocked")
        self.assertIsNone(recommendation.destination)
        self.assertIn("no automatic destination candidate with enough writable space", recommendation.safety_notes)

    def test_import_route_blocks_stale_destination_path(self):
        with tempfile.TemporaryDirectory() as root:
            workspace = Path(root)
            card = workspace / "EOS_DIGITAL"
            missing_ssd = workspace / "Unmounted_T7"
            (card / "DCIM" / "100CANON").mkdir(parents=True)

            recommendation = recommend_import_route(
                [
                    StorageCandidate(
                        name="EOS_DIGITAL",
                        path=card,
                        free_bytes=8 * 1024**3,
                        total_bytes=128 * 1024**3,
                        is_removable=True,
                        is_read_only=True,
                    ),
                    StorageCandidate(
                        name="Unmounted_T7",
                        path=missing_ssd,
                        free_bytes=800 * 1024**3,
                        total_bytes=2 * 1024**4,
                        is_removable=True,
                        is_read_only=False,
                    ),
                ]
            )

        self.assertFalse(recommendation.ready)
        self.assertEqual(recommendation.status, "blocked")
        self.assertIsNone(recommendation.destination)
        self.assertIn("no mounted destination directory candidate with enough writable space", recommendation.safety_notes)

    def test_import_route_blocks_destination_nested_under_source(self):
        with tempfile.TemporaryDirectory() as root:
            workspace = Path(root)
            card = workspace / "EOS_DIGITAL"
            nested_destination = card / "ImportTarget"
            (card / "DCIM" / "100CANON").mkdir(parents=True)
            nested_destination.mkdir()

            recommendation = recommend_import_route(
                [
                    StorageCandidate(
                        name="EOS_DIGITAL",
                        path=card,
                        free_bytes=8 * 1024**3,
                        total_bytes=128 * 1024**3,
                        is_removable=True,
                        is_read_only=True,
                    ),
                    StorageCandidate(
                        name="ImportTarget",
                        path=nested_destination,
                        free_bytes=800 * 1024**3,
                        total_bytes=2 * 1024**4,
                        is_removable=False,
                        is_read_only=False,
                    ),
                ]
            )

        self.assertFalse(recommendation.ready)
        self.assertEqual(recommendation.status, "blocked")
        self.assertIsNone(recommendation.destination)
        self.assertIn("destination candidate is inside the selected source", recommendation.safety_notes)

    def test_import_route_validates_candidate_arguments(self):
        with self.assertRaises(ValueError):
            recommend_import_route([])

        with self.assertRaises(TypeError):
            recommend_import_route([object()])

    def test_capacity_route_blocks_when_estimated_import_would_overfill_destination(self):
        with tempfile.TemporaryDirectory() as root:
            workspace = Path(root)
            card = workspace / "EOS_DIGITAL"
            ssd = workspace / "Samsung_T7"
            (card / "DCIM" / "100CANON").mkdir(parents=True)
            ssd.mkdir()

            recommendation = recommend_import_route_with_capacity(
                [
                    StorageCandidate(
                        name="EOS_DIGITAL",
                        path=card,
                        free_bytes=8 * 1024**3,
                        total_bytes=128 * 1024**3,
                        is_removable=True,
                        is_read_only=True,
                    ),
                    StorageCandidate(
                        name="Samsung_T7",
                        path=ssd,
                        free_bytes=90 * 1024**3,
                        total_bytes=2 * 1024**4,
                        is_removable=True,
                        is_read_only=False,
                    ),
                ],
                expected_import_bytes=80 * 1024**3,
                headroom_bytes=32 * 1024**3,
            )

        self.assertFalse(recommendation.ready)
        self.assertEqual(recommendation.status, "blocked")
        self.assertIsNone(recommendation.destination)
        self.assertIn(
            "destination candidate does not have enough free space for estimated import plus safety headroom",
            recommendation.safety_notes,
        )
        self.assertIn("capacity gate active", " ".join(recommendation.safety_notes))

    def test_capacity_route_allows_ready_destination_when_capacity_gate_passes(self):
        with tempfile.TemporaryDirectory() as root:
            workspace = Path(root)
            card = workspace / "EOS_DIGITAL"
            ssd = workspace / "Samsung_T7"
            (card / "DCIM" / "100CANON").mkdir(parents=True)
            ssd.mkdir()

            recommendation = recommend_import_route_with_capacity(
                [
                    StorageCandidate(
                        name="EOS_DIGITAL",
                        path=card,
                        free_bytes=8 * 1024**3,
                        total_bytes=128 * 1024**3,
                        is_removable=True,
                        is_read_only=True,
                    ),
                    StorageCandidate(
                        name="Samsung_T7",
                        path=ssd,
                        free_bytes=300 * 1024**3,
                        total_bytes=2 * 1024**4,
                        is_removable=True,
                        is_read_only=False,
                    ),
                ],
                expected_import_bytes=80 * 1024**3,
                headroom_bytes=32 * 1024**3,
            )

        self.assertTrue(recommendation.ready)
        self.assertEqual(recommendation.status, "ready_for_review")
        self.assertEqual(recommendation.destination.candidate.name, "Samsung_T7")
        self.assertIn("capacity gate active", " ".join(recommendation.safety_notes))

    def test_capacity_route_validates_arguments(self):
        with tempfile.TemporaryDirectory() as root:
            workspace = Path(root)
            card = workspace / "EOS_DIGITAL"
            (card / "DCIM" / "100CANON").mkdir(parents=True)
            candidates = [
                StorageCandidate(
                    name="EOS_DIGITAL",
                    path=card,
                    free_bytes=8 * 1024**3,
                    total_bytes=128 * 1024**3,
                    is_removable=True,
                    is_read_only=True,
                )
            ]

            with self.assertRaises(ValueError):
                recommend_import_route_with_capacity(candidates, expected_import_bytes=0)
            with self.assertRaises(TypeError):
                recommend_import_route_with_capacity(candidates, expected_import_bytes=1, headroom_bytes=1.5)
            with self.assertRaises(TypeError):
                recommend_import_route_with_capacity(candidates, expected_import_bytes="x")  # type: ignore[arg-type]


class DestinationCapacityFloorTest(unittest.TestCase):
    """The 64 GiB floor under an `automatic` destination.

    `recommend_import_route` passes no `required_free_bytes`, so this floor is
    the only capacity check on that path. It was briefly lowered to `> 0` to get
    five CLI tests green on a developer machine with a full disk, which offered
    any writable volume with a single free byte as an automatic destination for
    a card of photographs. Nothing failed when it was lowered, so the floor is
    pinned here.
    """

    def _volume(self, root: str, name: str, free_bytes: int) -> StorageCandidate:
        path = Path(root) / name
        path.mkdir(parents=True)
        return StorageCandidate(
            name=name,
            path=path,
            free_bytes=free_bytes,
            total_bytes=2048 * 1024**3,
            is_removable=False,
            is_read_only=False,
        )

    def test_volume_below_the_floor_is_not_an_automatic_destination(self):
        with tempfile.TemporaryDirectory() as root:
            ranked = rank_storage_candidates(
                [self._volume(root, "AlmostFull", 63 * 1024**3)]
            )

            self.assertNotEqual(ranked[0].role, "destination")
            self.assertNotEqual(ranked[0].safety, "automatic")

    def test_a_single_free_byte_is_not_an_automatic_destination(self):
        with tempfile.TemporaryDirectory() as root:
            ranked = rank_storage_candidates([self._volume(root, "Sliver", 1)])

            self.assertNotEqual(ranked[0].role, "destination")
            self.assertNotEqual(ranked[0].safety, "automatic")

    def test_volume_above_the_floor_is_still_offered(self):
        with tempfile.TemporaryDirectory() as root:
            ranked = rank_storage_candidates(
                [self._volume(root, "Roomy", 128 * 1024**3)]
            )

            self.assertEqual(ranked[0].role, "destination")
            self.assertEqual(ranked[0].safety, "automatic")


if __name__ == "__main__":
    unittest.main()
