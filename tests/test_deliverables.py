from pathlib import Path
import unittest

from shootflow.deliverables import MediaAsset, plan_instagram_deliverables


class DeliverablePlanningTests(unittest.TestCase):
    def test_plans_reels_carousels_and_photo_sets_from_ranked_assets(self) -> None:
        assets = [
            MediaAsset(Path("graded/a.jpg"), "photo", scene="prep", quality_score=0.98),
            MediaAsset(Path("graded/b.jpg"), "photo", scene="ceremony", quality_score=0.95),
            MediaAsset(Path("graded/c.jpg"), "photo", scene="prep", quality_score=0.94),
            MediaAsset(Path("graded/d.jpg"), "photo", scene="portraits", quality_score=0.91),
            MediaAsset(Path("graded/e.jpg"), "photo", scene="party", quality_score=0.89),
            MediaAsset(Path("graded/f.jpg"), "photo", scene="details", quality_score=0.88),
            MediaAsset(Path("graded/g.jpg"), "photo", scene="ceremony", quality_score=0.87),
            MediaAsset(Path("graded/h.jpg"), "photo", scene="portraits", quality_score=0.86),
            MediaAsset(Path("graded/i.jpg"), "photo", scene="party", quality_score=0.85),
            MediaAsset(Path("graded/j.jpg"), "photo", scene="details", quality_score=0.84),
            MediaAsset(Path("graded/k.jpg"), "photo", scene="bonus", quality_score=0.83),
            MediaAsset(Path("graded/opening.mov"), "video", scene="prep", quality_score=0.97, duration_seconds=18.0),
            MediaAsset(Path("graded/speech.mov"), "video", scene="ceremony", quality_score=0.93, duration_seconds=32.0),
            MediaAsset(Path("graded/party.mov"), "video", scene="party", quality_score=0.92, duration_seconds=24.0),
        ]

        plan = plan_instagram_deliverables(assets, reel_duration_limit_seconds=60, carousel_limit=10)

        self.assertEqual([job.kind for job in plan.jobs], ["ig_reel", "ig_carousel", "ig_photo_set"])

        reel = plan.jobs[0]
        self.assertEqual([item.path.name for item in reel.items], ["opening.mov", "speech.mov"])
        self.assertLessEqual(sum(item.duration_seconds or 0 for item in reel.items), 60)

        carousel = plan.jobs[1]
        self.assertEqual(len(carousel.items), 10)
        self.assertEqual(carousel.items[0].path.name, "a.jpg")
        self.assertIn("b.jpg", [item.path.name for item in carousel.items[:5]])

        photo_set = plan.jobs[2]
        self.assertEqual(photo_set.metadata["count"], 11)
        self.assertEqual(photo_set.items[0].path.name, "a.jpg")

    def test_rejects_invalid_asset_metadata(self) -> None:
        with self.assertRaises(ValueError):
            MediaAsset(Path("graded/bad.mov"), "video", scene="prep", quality_score=1.2, duration_seconds=5)

        with self.assertRaises(ValueError):
            MediaAsset(Path("graded/bad.mov"), "video", scene="prep", quality_score=0.5)

        with self.assertRaises(ValueError):
            MediaAsset(Path("graded/bad.txt"), "audio", scene="prep", quality_score=0.5)


if __name__ == "__main__":
    unittest.main()
