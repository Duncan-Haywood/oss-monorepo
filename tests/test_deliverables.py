import unittest

from shootflow.deliverables import (
    MediaAsset,
    build_deliverable_plan,
    instagram_carousel_spec,
    instagram_reel_spec,
)


class DeliverablePlanningTests(unittest.TestCase):
    def test_builds_parallelizable_reel_and_carousel_jobs_from_mixed_shoot(self) -> None:
        assets = [
            MediaAsset(path="clip-a.mov", media_type="video", duration_seconds=24.0),
            MediaAsset(path="clip-b.mp4", media_type="video", duration_seconds=18.0),
            MediaAsset(path="portrait-1.cr3", media_type="photo"),
            MediaAsset(path="portrait-2.jpg", media_type="photo"),
            MediaAsset(path="portrait-3.arw", media_type="photo"),
        ]

        plan = build_deliverable_plan(assets, shoot_slug="fashion-editorial")

        self.assertEqual(plan.shoot_slug, "fashion-editorial")
        self.assertEqual(len(plan.asset_jobs), 5)
        self.assertTrue(all(job.can_run_in_parallel for job in plan.asset_jobs))

        reel_jobs = [job for job in plan.deliverable_jobs if job.output_kind == "instagram_reel"]
        carousel_jobs = [job for job in plan.deliverable_jobs if job.output_kind == "instagram_carousel"]
        self.assertEqual(len(reel_jobs), 1)
        self.assertEqual(len(carousel_jobs), 1)
        self.assertEqual(reel_jobs[0].spec, instagram_reel_spec())
        self.assertEqual(carousel_jobs[0].spec, instagram_carousel_spec())

        dependency_ids = {job.job_id for job in plan.asset_jobs}
        self.assertLessEqual(set(reel_jobs[0].depends_on), dependency_ids)
        self.assertLessEqual(set(carousel_jobs[0].depends_on), dependency_ids)

    def test_skips_content_formats_that_have_no_source_media(self) -> None:
        assets = [
            MediaAsset(path="portrait-1.nef", media_type="photo"),
            MediaAsset(path="portrait-2.jpg", media_type="photo"),
        ]

        plan = build_deliverable_plan(assets, shoot_slug="stills-only")

        self.assertEqual(
            [job.output_kind for job in plan.deliverable_jobs],
            ["instagram_carousel", "instagram_photo_set"],
        )


if __name__ == "__main__":
    unittest.main()
