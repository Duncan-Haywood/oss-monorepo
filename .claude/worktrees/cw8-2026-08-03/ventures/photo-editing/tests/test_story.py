import json
import tempfile
import unittest
from pathlib import Path

from shootflow.story import (
    AssetAnalysis,
    ReelVariant,
    STORYLINE_ARTIFACT_PATH,
    StoryPlanError,
    build_storyline_plan,
    load_storyline_artifact,
    write_storyline_artifact,
)


class StorylinePlanningTests(unittest.TestCase):
    def test_builds_reel_and_carousel_sequences_from_vlm_scores(self) -> None:
        analyses = [
            AssetAnalysis(
                asset_path="graded/ceremony-wide.mov",
                media_type="video",
                scene_label="ceremony",
                aesthetic_score=0.91,
                story_score=0.88,
                technical_score=0.94,
                motion_score=0.72,
                duration_seconds=24.0,
                tags=("wide", "vows"),
            ),
            AssetAnalysis(
                asset_path="graded/prep-detail.mov",
                media_type="video",
                scene_label="prep",
                aesthetic_score=0.82,
                story_score=0.79,
                technical_score=0.86,
                motion_score=0.61,
                duration_seconds=18.0,
                tags=("details",),
            ),
            AssetAnalysis(
                asset_path="graded/ceremony-close.mov",
                media_type="video",
                scene_label="ceremony",
                aesthetic_score=0.96,
                story_score=0.95,
                technical_score=0.97,
                motion_score=0.9,
                duration_seconds=42.0,
                tags=("close", "vows"),
            ),
            AssetAnalysis(
                asset_path="graded/portrait-a.jpg",
                media_type="photo",
                scene_label="portraits",
                aesthetic_score=0.95,
                story_score=0.86,
                technical_score=0.92,
                motion_score=0.0,
                tags=("couple",),
            ),
            AssetAnalysis(
                asset_path="graded/detail-a.jpg",
                media_type="photo",
                scene_label="details",
                aesthetic_score=0.89,
                story_score=0.8,
                technical_score=0.91,
                motion_score=0.0,
                tags=("rings",),
            ),
            AssetAnalysis(
                asset_path="graded/portrait-b.jpg",
                media_type="photo",
                scene_label="portraits",
                aesthetic_score=0.9,
                story_score=0.83,
                technical_score=0.9,
                motion_score=0.0,
                tags=("couple",),
            ),
        ]

        plan = build_storyline_plan(analyses)

        self.assertEqual(plan.reel.asset_paths, ("graded/ceremony-close.mov", "graded/prep-detail.mov"))
        self.assertLessEqual(plan.reel.total_duration_seconds, 90)
        self.assertEqual(
            plan.carousel.asset_paths,
            ("graded/portrait-a.jpg", "graded/detail-a.jpg", "graded/portrait-b.jpg"),
        )
        self.assertEqual(
            plan.photo_set.asset_paths,
            ("graded/portrait-a.jpg", "graded/portrait-b.jpg", "graded/detail-a.jpg"),
        )
        self.assertIn("scene variety", plan.reel.rationale)
        self.assertIn("ranked", plan.photo_set.rationale)

    def test_builds_named_reel_variants_for_reviewable_social_narratives(self) -> None:
        analyses = [
            AssetAnalysis(
                asset_path="graded/ceremony-hero.mov",
                media_type="video",
                scene_label="ceremony",
                aesthetic_score=0.96,
                story_score=0.97,
                technical_score=0.94,
                motion_score=0.64,
                duration_seconds=18.0,
                tags=("vows", "hero"),
            ),
            AssetAnalysis(
                asset_path="graded/prep-bts.mov",
                media_type="video",
                scene_label="prep",
                aesthetic_score=0.83,
                story_score=0.9,
                technical_score=0.87,
                motion_score=0.72,
                duration_seconds=9.0,
                tags=("behind_the_scenes", "details"),
            ),
            AssetAnalysis(
                asset_path="graded/dance-fast.mov",
                media_type="video",
                scene_label="dance",
                aesthetic_score=0.88,
                story_score=0.82,
                technical_score=0.9,
                motion_score=0.99,
                duration_seconds=6.0,
                tags=("movement",),
            ),
            AssetAnalysis(
                asset_path="graded/reception-wide.mov",
                media_type="video",
                scene_label="reception",
                aesthetic_score=0.84,
                story_score=0.86,
                technical_score=0.85,
                motion_score=0.8,
                duration_seconds=14.0,
                tags=("guests",),
            ),
        ]

        plan = build_storyline_plan(analyses)

        self.assertEqual(
            tuple(variant.variant_id for variant in plan.reel_variants),
            ("hero", "behind_the_scenes", "fast_cut"),
        )
        hero, behind_the_scenes, fast_cut = plan.reel_variants
        self.assertEqual(hero.sequence.asset_paths, plan.reel.asset_paths)
        self.assertEqual(behind_the_scenes.sequence.asset_paths[0], "graded/prep-bts.mov")
        self.assertEqual(fast_cut.sequence.asset_paths[0], "graded/dance-fast.mov")
        self.assertLessEqual(fast_cut.sequence.total_duration_seconds, plan.reel.total_duration_seconds)
        self.assertIn("variant", hero.sequence.rationale)

    def test_reel_planning_respects_duration_budget_and_item_cap(self) -> None:
        analyses = [
            AssetAnalysis(
                asset_path=f"graded/clip-{index:02d}.mov",
                media_type="video",
                scene_label=f"scene-{index}",
                aesthetic_score=1.0 - index * 0.01,
                story_score=0.9,
                technical_score=0.9,
                motion_score=0.9,
                duration_seconds=20.0,
            )
            for index in range(12)
        ]

        plan = build_storyline_plan(analyses, max_reel_items=4, max_reel_duration_seconds=65)

        self.assertEqual(len(plan.reel.asset_paths), 3)
        self.assertEqual(plan.reel.total_duration_seconds, 60.0)

    def test_rejects_invalid_analysis_values(self) -> None:
        with self.assertRaises(StoryPlanError):
            build_storyline_plan(
                [
                    AssetAnalysis(
                        asset_path=" ",
                        media_type="photo",
                        scene_label="portraits",
                        aesthetic_score=0.8,
                        story_score=0.8,
                        technical_score=0.8,
                        motion_score=0.0,
                    )
                ]
            )

        with self.assertRaises(StoryPlanError):
            build_storyline_plan(
                [
                    AssetAnalysis(
                        asset_path="graded/bad.jpg",
                        media_type="photo",
                        scene_label="portraits",
                        aesthetic_score=1.2,
                        story_score=0.8,
                        technical_score=0.8,
                        motion_score=0.0,
                    )
                ]
            )

        with self.assertRaises(StoryPlanError):
            build_storyline_plan(
                [
                    AssetAnalysis(
                        asset_path="graded/nan.jpg",
                        media_type="photo",
                        scene_label="portraits",
                        aesthetic_score=float("nan"),
                        story_score=0.8,
                        technical_score=0.8,
                        motion_score=0.0,
                    )
                ]
            )

        with self.assertRaises(StoryPlanError):
            build_storyline_plan(
                [
                    AssetAnalysis(
                        asset_path="graded/unknown-duration.mov",
                        media_type="video",
                        scene_label="ceremony",
                        aesthetic_score=0.8,
                        story_score=0.8,
                        technical_score=0.8,
                        motion_score=0.6,
                    )
                ]
            )

    def test_large_storyline_plans_do_not_drop_ranked_photo_set_exports(self) -> None:
        analyses = [
            AssetAnalysis(
                asset_path=f"graded/photo-{index:05d}.jpg",
                media_type="photo",
                scene_label=f"scene-{index % 20}",
                aesthetic_score=(index % 100) / 100,
                story_score=0.7,
                technical_score=0.8,
                motion_score=0.0,
            )
            for index in range(10_000)
        ]

        plan = build_storyline_plan(analyses)

        self.assertEqual(len(plan.photo_set.asset_paths), 10_000)
        self.assertEqual(len(plan.carousel.asset_paths), 10)

    def test_writes_and_loads_storyline_artifact_deterministically(self) -> None:
        analyses = [
            AssetAnalysis(
                asset_path="graded/grade_asset_00000/A001.MOV",
                media_type="video",
                scene_label="ceremony",
                aesthetic_score=0.93,
                story_score=0.91,
                technical_score=0.87,
                motion_score=0.82,
                duration_seconds=12.5,
            ),
            AssetAnalysis(
                asset_path="graded/grade_asset_00001/IMG_0001.JPG",
                media_type="photo",
                scene_label="portraits",
                aesthetic_score=0.95,
                story_score=0.88,
                technical_score=0.92,
                motion_score=0.0,
            ),
        ]
        plan = build_storyline_plan(analyses)

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            artifact_path = write_storyline_artifact(
                plan,
                workspace,
                allowed_asset_paths={analysis.asset_path for analysis in analyses},
            )
            first_write = artifact_path.read_text(encoding="utf-8")
            second_path = write_storyline_artifact(
                plan,
                workspace,
                allowed_asset_paths={analysis.asset_path for analysis in analyses},
            )

            self.assertEqual(artifact_path, workspace / STORYLINE_ARTIFACT_PATH)
            self.assertEqual(first_write, second_path.read_text(encoding="utf-8"))
            self.assertEqual(load_storyline_artifact(workspace, allowed_asset_paths={analysis.asset_path for analysis in analyses}), plan)
            raw = json.loads(first_write)
            self.assertEqual(raw["schema_version"], 2)
            self.assertEqual(raw["sequences"][0]["output_kind"], "instagram_reel")
            self.assertEqual(raw["sequences"][0]["asset_paths"], ["graded/grade_asset_00000/A001.MOV"])
            self.assertEqual(raw["reel_variants"][0]["variant_id"], "hero")

    def test_rejects_storyline_artifacts_that_reference_untrusted_assets(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            artifact_path = workspace / STORYLINE_ARTIFACT_PATH
            artifact_path.parent.mkdir()
            artifact_path.write_text(
                json.dumps(
                    {
                        "schema_version": 2,
                        "reel_variants": [],
                        "sequences": [
                            {
                                "name": "reel",
                                "output_kind": "instagram_reel",
                                "aspect_ratio": "9:16",
                                "asset_paths": ["graded/grade_asset_99999/ROGUE.MOV"],
                                "total_duration_seconds": 8.0,
                                "rationale": "Untrusted model reference.",
                            },
                            {
                                "name": "carousel",
                                "output_kind": "instagram_carousel",
                                "aspect_ratio": "4:5",
                                "asset_paths": [],
                                "total_duration_seconds": None,
                                "rationale": "No photos.",
                            },
                            {
                                "name": "photo_set",
                                "output_kind": "instagram_photo_set",
                                "aspect_ratio": "4:5",
                                "asset_paths": [],
                                "total_duration_seconds": None,
                                "rationale": "No photos.",
                            },
                        ],
                    }
                ),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(StoryPlanError, "untrusted asset"):
                load_storyline_artifact(workspace, allowed_asset_paths={"graded/grade_asset_00000/A001.MOV"})

    def test_rejects_storyline_reel_variants_that_reference_untrusted_assets(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            artifact_path = workspace / STORYLINE_ARTIFACT_PATH
            artifact_path.parent.mkdir()
            artifact_path.write_text(
                json.dumps(
                    {
                        "schema_version": 2,
                        "sequences": [
                            {
                                "name": "reel",
                                "output_kind": "instagram_reel",
                                "aspect_ratio": "9:16",
                                "asset_paths": ["graded/grade_asset_00000/A001.MOV"],
                                "total_duration_seconds": 8.0,
                                "rationale": "Trusted reel.",
                            },
                            {
                                "name": "carousel",
                                "output_kind": "instagram_carousel",
                                "aspect_ratio": "4:5",
                                "asset_paths": [],
                                "total_duration_seconds": None,
                                "rationale": "No photos.",
                            },
                            {
                                "name": "photo_set",
                                "output_kind": "instagram_photo_set",
                                "aspect_ratio": "4:5",
                                "asset_paths": [],
                                "total_duration_seconds": None,
                                "rationale": "No photos.",
                            },
                        ],
                        "reel_variants": [
                            {
                                "variant_id": "rogue",
                                "output_kind": "instagram_reel",
                                "aspect_ratio": "9:16",
                                "asset_paths": ["graded/grade_asset_99999/ROGUE.MOV"],
                                "total_duration_seconds": 8.0,
                                "rationale": "Unsafe model-authored variant.",
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(StoryPlanError, "untrusted asset"):
                load_storyline_artifact(workspace, allowed_asset_paths={"graded/grade_asset_00000/A001.MOV"})

    def test_loads_legacy_v1_storyline_artifact_without_reel_variants(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            artifact_path = workspace / STORYLINE_ARTIFACT_PATH
            artifact_path.parent.mkdir()
            artifact_path.write_text(
                json.dumps(
                    {
                        "schema_version": 1,
                        "sequences": [
                            {
                                "name": "reel",
                                "output_kind": "instagram_reel",
                                "aspect_ratio": "9:16",
                                "asset_paths": ["graded/grade_asset_00000/A001.MOV"],
                                "total_duration_seconds": 8.0,
                                "rationale": "Legacy trusted reel.",
                            },
                            {
                                "name": "carousel",
                                "output_kind": "instagram_carousel",
                                "aspect_ratio": "4:5",
                                "asset_paths": [],
                                "total_duration_seconds": None,
                                "rationale": "No photos.",
                            },
                            {
                                "name": "photo_set",
                                "output_kind": "instagram_photo_set",
                                "aspect_ratio": "4:5",
                                "asset_paths": [],
                                "total_duration_seconds": None,
                                "rationale": "No photos.",
                            },
                        ],
                    }
                ),
                encoding="utf-8",
            )

            loaded = load_storyline_artifact(
                workspace,
                allowed_asset_paths={"graded/grade_asset_00000/A001.MOV"},
            )

        self.assertEqual(loaded.reel.asset_paths, ("graded/grade_asset_00000/A001.MOV",))
        self.assertEqual(loaded.reel_variants, ())

    def test_rejects_broken_storyline_artifact_temp_symlink_without_writing_target(self) -> None:
        analysis = AssetAnalysis(
            asset_path="graded/grade_asset_00000/A001.MOV",
            media_type="video",
            scene_label="ceremony",
            aesthetic_score=0.93,
            story_score=0.91,
            technical_score=0.87,
            motion_score=0.82,
            duration_seconds=12.5,
        )
        plan = build_storyline_plan([analysis])

        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as outside_tmp:
            workspace = Path(tmp)
            artifact_path = workspace / STORYLINE_ARTIFACT_PATH
            artifact_path.parent.mkdir()
            outside_target = Path(outside_tmp) / "outside-storyline.json"
            artifact_path.with_suffix(".json.tmp").symlink_to(outside_target)

            with self.assertRaisesRegex(StoryPlanError, "symlink"):
                write_storyline_artifact(plan, workspace, allowed_asset_paths={analysis.asset_path})
            self.assertFalse(outside_target.exists())

    def test_rejects_unknown_storyline_artifact_fields(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            artifact_path = workspace / STORYLINE_ARTIFACT_PATH
            artifact_path.parent.mkdir()
            artifact_path.write_text(
                json.dumps(
                    {
                        "schema_version": 2,
                        "delete_files": ["/Volumes/Untitled/DCIM"],
                        "reel_variants": [],
                        "sequences": [
                            {
                                "name": "reel",
                                "output_kind": "instagram_reel",
                                "aspect_ratio": "9:16",
                                "asset_paths": ["graded/grade_asset_00000/A001.MOV"],
                                "total_duration_seconds": 8.0,
                                "rationale": "Trusted reel.",
                            },
                            {
                                "name": "carousel",
                                "output_kind": "instagram_carousel",
                                "aspect_ratio": "4:5",
                                "asset_paths": [],
                                "total_duration_seconds": None,
                                "rationale": "No photos.",
                                "raw_inputs": ["/shoot/originals/IMG_0001.CR3"],
                            },
                            {
                                "name": "photo_set",
                                "output_kind": "instagram_photo_set",
                                "aspect_ratio": "4:5",
                                "asset_paths": [],
                                "total_duration_seconds": None,
                                "rationale": "No photos.",
                            },
                        ],
                    }
                ),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(StoryPlanError, "Unexpected storyline artifact field"):
                load_storyline_artifact(workspace, allowed_asset_paths={"graded/grade_asset_00000/A001.MOV"})

    def test_rejects_storyline_sequences_with_missing_schema_fields(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            artifact_path = workspace / STORYLINE_ARTIFACT_PATH
            artifact_path.parent.mkdir()
            artifact_path.write_text(
                json.dumps(
                    {
                        "schema_version": 2,
                        "reel_variants": [],
                        "sequences": [
                            {
                                "name": "reel",
                                "output_kind": "instagram_reel",
                                "aspect_ratio": "9:16",
                                "asset_paths": ["graded/grade_asset_00000/A001.MOV"],
                                "rationale": "Trusted reel.",
                            },
                            {
                                "name": "carousel",
                                "output_kind": "instagram_carousel",
                                "aspect_ratio": "4:5",
                                "asset_paths": [],
                                "total_duration_seconds": None,
                                "rationale": "No photos.",
                            },
                            {
                                "name": "photo_set",
                                "output_kind": "instagram_photo_set",
                                "aspect_ratio": "4:5",
                                "asset_paths": [],
                                "total_duration_seconds": None,
                                "rationale": "No photos.",
                            },
                        ],
                    }
                ),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(StoryPlanError, "Missing storyline sequence field"):
                load_storyline_artifact(workspace, allowed_asset_paths={"graded/grade_asset_00000/A001.MOV"})


if __name__ == "__main__":
    unittest.main()
