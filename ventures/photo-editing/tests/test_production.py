import unittest

from shootflow.deliverables import MediaAsset
from shootflow.production import ProductionPlanError, build_production_plan


class ProductionPlanningTests(unittest.TestCase):
    def test_builds_parallel_waves_for_quality_first_media_pipeline(self) -> None:
        assets = [
            MediaAsset(path="card/DCIM/A001.mov", media_type="video", duration_seconds=32.0),
            MediaAsset(path="card/DCIM/A002.mov", media_type="video", duration_seconds=28.0),
            MediaAsset(path="card/DCIM/IMG_0001.cr3", media_type="photo"),
            MediaAsset(path="card/DCIM/IMG_0002.cr3", media_type="photo"),
        ]

        plan = build_production_plan(assets, shoot_slug="editorial-launch")

        self.assertEqual(plan.shoot_slug, "editorial-launch")
        self.assertEqual(
            [[job.output_kind for job in wave.jobs] for wave in plan.execution_waves],
            [
                ["proxy_media", "proxy_media", "proxy_media", "proxy_media"],
                ["vlm_asset_analysis", "vlm_asset_analysis", "vlm_asset_analysis", "vlm_asset_analysis"],
                ["scene_grouping"],
                ["look_development"],
                ["graded_video", "graded_video", "graded_photo", "graded_photo"],
                ["storyline_selection"],
                ["instagram_reel", "instagram_carousel", "instagram_photo_set"],
            ],
        )
        self.assertTrue(all(job.can_run_in_parallel for job in plan.execution_waves[0].jobs))
        self.assertTrue(all(job.can_run_in_parallel for job in plan.execution_waves[1].jobs))
        self.assertTrue(all(job.can_run_in_parallel for job in plan.execution_waves[4].jobs))
        self.assertFalse(any(job.can_run_in_parallel for job in plan.execution_waves[5].jobs))
        self.assertFalse(any(job.can_run_in_parallel for job in plan.execution_waves[6].jobs))

    def test_instagram_jobs_consume_matching_graded_masters(self) -> None:
        assets = [
            MediaAsset(path="clip-a.mov", media_type="video", duration_seconds=12.0),
            MediaAsset(path="clip-b.mov", media_type="video", duration_seconds=18.0),
            MediaAsset(path="portrait-a.nef", media_type="photo"),
            MediaAsset(path="portrait-b.jpg", media_type="photo"),
            MediaAsset(path="portrait-c.arw", media_type="photo"),
        ]

        plan = build_production_plan(assets, shoot_slug="wedding-preview")

        reel = plan.job_by_id("assemble_instagram_reel")
        carousel = plan.job_by_id("assemble_instagram_carousel")
        photo_set = plan.job_by_id("export_instagram_photo_set")
        storylines = plan.job_by_id("rank_instagram_storylines")

        self.assertEqual(
            storylines.depends_on,
            (
                "group_scene_sets",
                "develop_shoot_look",
                "grade_asset_00000",
                "grade_asset_00001",
                "grade_asset_00002",
                "grade_asset_00003",
                "grade_asset_00004",
            ),
        )
        self.assertEqual(storylines.outputs, ("analysis/instagram_storylines.json",))
        self.assertEqual(reel.depends_on, ("rank_instagram_storylines", "grade_asset_00000", "grade_asset_00001"))
        self.assertEqual(
            carousel.depends_on,
            (
                "rank_instagram_storylines",
                "grade_asset_00002",
                "grade_asset_00003",
                "grade_asset_00004",
            ),
        )
        self.assertEqual(carousel.depends_on, photo_set.depends_on)
        self.assertEqual(
            reel.inputs,
            (
                "analysis/instagram_storylines.json",
                "graded/grade_asset_00000/clip-a.mov",
                "graded/grade_asset_00001/clip-b.mov",
            ),
        )
        self.assertEqual(
            carousel.inputs,
            (
                "analysis/instagram_storylines.json",
                "graded/grade_asset_00002/portrait-a.nef",
                "graded/grade_asset_00003/portrait-b.jpg",
                "graded/grade_asset_00004/portrait-c.arw",
            ),
        )

    def test_artifact_paths_do_not_collide_for_duplicate_camera_filenames(self) -> None:
        assets = [
            MediaAsset(path="card-a/DCIM/IMG_0001.CR3", media_type="photo"),
            MediaAsset(path="card-b/DCIM/IMG_0001.CR3", media_type="photo"),
        ]

        plan = build_production_plan(assets, shoot_slug="multi-card")

        proxy_outputs = [job.outputs[0] for job in plan.execution_waves[0].jobs]
        grade_outputs = [job.outputs[0] for job in plan.execution_waves[4].jobs]
        self.assertEqual(
            proxy_outputs,
            [
                "proxies/proxy_asset_00000/IMG_0001.CR3.jpg",
                "proxies/proxy_asset_00001/IMG_0001.CR3.jpg",
            ],
        )
        self.assertEqual(
            grade_outputs,
            [
                "graded/grade_asset_00000/IMG_0001.CR3",
                "graded/grade_asset_00001/IMG_0001.CR3",
            ],
        )
        self.assertEqual(len(set(proxy_outputs)), 2)
        self.assertEqual(len(set(grade_outputs)), 2)

    def test_rejects_invalid_production_inputs(self) -> None:
        with self.assertRaises(ProductionPlanError):
            build_production_plan([], shoot_slug="../unsafe")

        with self.assertRaises(ProductionPlanError):
            build_production_plan(
                [MediaAsset(path="", media_type="photo")],
                shoot_slug="empty-path",
            )

        with self.assertRaises(ProductionPlanError):
            build_production_plan(
                [MediaAsset(path="notes.wav", media_type="audio")],
                shoot_slug="bad-media-type",
            )

    def test_scales_job_ids_for_large_shoots_without_serializing_asset_work(self) -> None:
        assets = [
            MediaAsset(path=f"archive/frame-{index:05d}.jpg", media_type="photo")
            for index in range(1000)
        ]

        plan = build_production_plan(assets, shoot_slug="archive-refresh")

        self.assertEqual(len(plan.execution_waves[0].jobs), 1000)
        self.assertEqual(len(plan.execution_waves[1].jobs), 1000)
        self.assertEqual(len(plan.execution_waves[4].jobs), 1000)
        self.assertEqual(plan.execution_waves[4].jobs[-1].job_id, "grade_asset_00999")
        self.assertTrue(all(job.can_run_in_parallel for job in plan.execution_waves[4].jobs))


if __name__ == "__main__":
    unittest.main()
