from dataclasses import replace
import json
import tempfile
import unittest
from pathlib import Path

from shootflow.assembly import (
    AssemblyPlan,
    RENDER_TASKS_MANIFEST_PATH,
    RenderTask,
    AssemblyPlanError,
    build_assembly_plan,
    load_render_tasks_manifest,
    load_trusted_render_tasks_manifest,
    write_render_tasks_manifest,
)
from shootflow.deliverables import MediaAsset
from shootflow.production import build_production_plan
from shootflow.story import ContentSequence, ReelVariant, StorylinePlan, write_storyline_artifact


class AssemblyPlanningTests(unittest.TestCase):
    def test_builds_render_tasks_from_storyline_selected_graded_assets(self) -> None:
        assets = [
            MediaAsset(path="card/DCIM/A001.MOV", media_type="video", duration_seconds=24.0),
            MediaAsset(path="card/DCIM/IMG_0001.CR3", media_type="photo"),
            MediaAsset(path="card/DCIM/IMG_0002.JPG", media_type="photo"),
        ]
        production_plan = build_production_plan(assets, shoot_slug="editorial-launch")
        reel_asset = "graded/grade_asset_00000/A001.MOV"
        first_photo = "graded/grade_asset_00001/IMG_0001.CR3"
        second_photo = "graded/grade_asset_00002/IMG_0002.JPG"

        storyline = StorylinePlan(
            reel=ContentSequence(
                output_kind="instagram_reel",
                aspect_ratio="9:16",
                asset_paths=(reel_asset,),
                total_duration_seconds=24.0,
                rationale="Hero reel.",
            ),
            carousel=ContentSequence(
                output_kind="instagram_carousel",
                aspect_ratio="4:5",
                asset_paths=(first_photo,),
                total_duration_seconds=None,
                rationale="Tight carousel.",
            ),
            photo_set=ContentSequence(
                output_kind="instagram_photo_set",
                aspect_ratio="4:5",
                asset_paths=(first_photo, second_photo),
                total_duration_seconds=None,
                rationale="Full ranked set.",
            ),
        )

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            self._touch_workspace_files(workspace, (reel_asset, first_photo, second_photo))
            write_storyline_artifact(
                storyline,
                workspace,
                allowed_asset_paths={reel_asset, first_photo, second_photo},
            )

            assembly_plan = build_assembly_plan(production_plan, workspace)

        self.assertEqual(assembly_plan.shoot_slug, "editorial-launch")
        self.assertEqual([task.task_id for task in assembly_plan.render_tasks], [
            "render_instagram_reel",
            "render_instagram_carousel",
            "export_instagram_photo_set",
        ])
        reel_task, carousel_task, photo_set_task = assembly_plan.render_tasks
        self.assertEqual(reel_task.inputs, ("analysis/instagram_storylines.json", reel_asset))
        self.assertEqual(reel_task.outputs, ("deliverables/instagram_reel.mp4",))
        self.assertEqual(carousel_task.inputs, ("analysis/instagram_storylines.json", first_photo))
        self.assertEqual(carousel_task.depends_on, ("rank_instagram_storylines", "grade_asset_00001"))
        self.assertEqual(carousel_task.outputs, ("deliverables/instagram_carousel/slide_00001.jpg",))
        self.assertEqual(photo_set_task.inputs, ("analysis/instagram_storylines.json", first_photo, second_photo))
        self.assertEqual(
            photo_set_task.depends_on,
            ("rank_instagram_storylines", "grade_asset_00001", "grade_asset_00002"),
        )
        self.assertEqual(
            photo_set_task.outputs,
            (
                "deliverables/instagram_photo_set/photo_00001.jpg",
                "deliverables/instagram_photo_set/photo_00002.jpg",
            ),
        )

    def test_builds_collision_free_render_tasks_for_named_reel_variants(self) -> None:
        assets = [
            MediaAsset(path="card/DCIM/A001.MOV", media_type="video", duration_seconds=24.0),
            MediaAsset(path="card/DCIM/A002.MOV", media_type="video", duration_seconds=8.0),
            MediaAsset(path="card/DCIM/IMG_0001.CR3", media_type="photo"),
        ]
        production_plan = build_production_plan(assets, shoot_slug="multi-reel-launch")
        hero_asset = "graded/grade_asset_00000/A001.MOV"
        fast_asset = "graded/grade_asset_00001/A002.MOV"
        photo_asset = "graded/grade_asset_00002/IMG_0001.CR3"
        storyline = StorylinePlan(
            reel=ContentSequence(
                output_kind="instagram_reel",
                aspect_ratio="9:16",
                asset_paths=(hero_asset,),
                total_duration_seconds=24.0,
                rationale="Default hero reel.",
            ),
            carousel=ContentSequence(
                output_kind="instagram_carousel",
                aspect_ratio="4:5",
                asset_paths=(photo_asset,),
                total_duration_seconds=None,
                rationale="Single carousel select.",
            ),
            photo_set=ContentSequence(
                output_kind="instagram_photo_set",
                aspect_ratio="4:5",
                asset_paths=(photo_asset,),
                total_duration_seconds=None,
                rationale="Single ranked photo.",
            ),
            reel_variants=(
                ReelVariant(
                    variant_id="hero",
                    sequence=ContentSequence(
                        output_kind="instagram_reel",
                        aspect_ratio="9:16",
                        asset_paths=(hero_asset,),
                        total_duration_seconds=24.0,
                        rationale="Reviewable hero variant.",
                    ),
                ),
                ReelVariant(
                    variant_id="fast_cut",
                    sequence=ContentSequence(
                        output_kind="instagram_reel",
                        aspect_ratio="9:16",
                        asset_paths=(fast_asset, hero_asset),
                        total_duration_seconds=32.0,
                        rationale="Reviewable fast-cut variant.",
                    ),
                ),
            ),
        )

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            self._touch_workspace_files(workspace, (hero_asset, fast_asset, photo_asset))
            write_storyline_artifact(
                storyline,
                workspace,
                allowed_asset_paths={hero_asset, fast_asset, photo_asset},
            )

            assembly_plan = build_assembly_plan(production_plan, workspace)

        self.assertEqual(
            [task.task_id for task in assembly_plan.render_tasks],
            [
                "render_instagram_reel",
                "render_instagram_reel_variant_hero",
                "render_instagram_reel_variant_fast_cut",
                "render_instagram_carousel",
                "export_instagram_photo_set",
            ],
        )
        default_reel, hero_variant, fast_cut_variant = assembly_plan.render_tasks[:3]
        self.assertEqual(default_reel.outputs, ("deliverables/instagram_reel.mp4",))
        self.assertEqual(hero_variant.outputs, ("deliverables/instagram_reels/hero.mp4",))
        self.assertEqual(fast_cut_variant.inputs, ("analysis/instagram_storylines.json", fast_asset, hero_asset))
        self.assertEqual(fast_cut_variant.outputs, ("deliverables/instagram_reels/fast_cut.mp4",))
        self.assertEqual(
            fast_cut_variant.depends_on,
            ("rank_instagram_storylines", "grade_asset_00001", "grade_asset_00000"),
        )
        self.assertTrue(hero_variant.can_run_in_parallel)

    def test_builds_reel_variant_tasks_when_default_reel_is_empty(self) -> None:
        assets = [
            MediaAsset(path="card/DCIM/A001.MOV", media_type="video", duration_seconds=24.0),
        ]
        production_plan = build_production_plan(assets, shoot_slug="variant-only")
        variant_asset = "graded/grade_asset_00000/A001.MOV"
        storyline = StorylinePlan(
            reel=ContentSequence(
                output_kind="instagram_reel",
                aspect_ratio="9:16",
                asset_paths=(),
                total_duration_seconds=0.0,
                rationale="No default reel approved.",
            ),
            carousel=ContentSequence(
                output_kind="instagram_carousel",
                aspect_ratio="4:5",
                asset_paths=(),
                total_duration_seconds=None,
                rationale="No photos.",
            ),
            photo_set=ContentSequence(
                output_kind="instagram_photo_set",
                aspect_ratio="4:5",
                asset_paths=(),
                total_duration_seconds=None,
                rationale="No photos.",
            ),
            reel_variants=(
                ReelVariant(
                    variant_id="fast_cut",
                    sequence=ContentSequence(
                        output_kind="instagram_reel",
                        aspect_ratio="9:16",
                        asset_paths=(variant_asset,),
                        total_duration_seconds=24.0,
                        rationale="Only the fast-cut variant is selected.",
                    ),
                ),
            ),
        )

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            self._touch_workspace_files(workspace, (variant_asset,))
            write_storyline_artifact(storyline, workspace, allowed_asset_paths={variant_asset})

            assembly_plan = build_assembly_plan(production_plan, workspace)

        self.assertEqual(
            [task.task_id for task in assembly_plan.render_tasks],
            ["render_instagram_reel_variant_fast_cut"],
        )
        self.assertEqual(
            assembly_plan.render_tasks[0].outputs,
            ("deliverables/instagram_reels/fast_cut.mp4",),
        )

    def test_rejects_storyline_assets_that_are_missing_from_workspace(self) -> None:
        assets = [MediaAsset(path="card/DCIM/A001.MOV", media_type="video", duration_seconds=24.0)]
        production_plan = build_production_plan(assets, shoot_slug="missing-graded")
        reel_asset = "graded/grade_asset_00000/A001.MOV"
        storyline = StorylinePlan(
            reel=ContentSequence(
                output_kind="instagram_reel",
                aspect_ratio="9:16",
                asset_paths=(reel_asset,),
                total_duration_seconds=24.0,
                rationale="Hero reel.",
            ),
            carousel=ContentSequence(
                output_kind="instagram_carousel",
                aspect_ratio="4:5",
                asset_paths=(),
                total_duration_seconds=None,
                rationale="No photos.",
            ),
            photo_set=ContentSequence(
                output_kind="instagram_photo_set",
                aspect_ratio="4:5",
                asset_paths=(),
                total_duration_seconds=None,
                rationale="No photos.",
            ),
        )

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            write_storyline_artifact(storyline, workspace, allowed_asset_paths={reel_asset})

            with self.assertRaisesRegex(AssemblyPlanError, "Missing graded asset"):
                build_assembly_plan(production_plan, workspace)

    def test_rejects_sequence_assets_with_wrong_media_type(self) -> None:
        assets = [
            MediaAsset(path="card/DCIM/A001.MOV", media_type="video", duration_seconds=24.0),
            MediaAsset(path="card/DCIM/IMG_0001.CR3", media_type="photo"),
        ]
        production_plan = build_production_plan(assets, shoot_slug="wrong-sequence-type")
        video_asset = "graded/grade_asset_00000/A001.MOV"
        photo_asset = "graded/grade_asset_00001/IMG_0001.CR3"
        storyline = StorylinePlan(
            reel=ContentSequence(
                output_kind="instagram_reel",
                aspect_ratio="9:16",
                asset_paths=(video_asset,),
                total_duration_seconds=24.0,
                rationale="Hero reel.",
            ),
            carousel=ContentSequence(
                output_kind="instagram_carousel",
                aspect_ratio="4:5",
                asset_paths=(video_asset,),
                total_duration_seconds=None,
                rationale="Bad model selection.",
            ),
            photo_set=ContentSequence(
                output_kind="instagram_photo_set",
                aspect_ratio="4:5",
                asset_paths=(photo_asset,),
                total_duration_seconds=None,
                rationale="Trusted photo.",
            ),
        )

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            self._touch_workspace_files(workspace, (video_asset, photo_asset))
            write_storyline_artifact(
                storyline,
                workspace,
                allowed_asset_paths={video_asset, photo_asset},
            )

            with self.assertRaisesRegex(AssemblyPlanError, "carousel requires photo"):
                build_assembly_plan(production_plan, workspace)

    def test_rejects_symlinked_selected_graded_assets(self) -> None:
        assets = [MediaAsset(path="card/DCIM/A001.MOV", media_type="video", duration_seconds=24.0)]
        production_plan = build_production_plan(assets, shoot_slug="symlink-graded")
        reel_asset = "graded/grade_asset_00000/A001.MOV"
        storyline = StorylinePlan(
            reel=ContentSequence(
                output_kind="instagram_reel",
                aspect_ratio="9:16",
                asset_paths=(reel_asset,),
                total_duration_seconds=24.0,
                rationale="Hero reel.",
            ),
            carousel=ContentSequence(
                output_kind="instagram_carousel",
                aspect_ratio="4:5",
                asset_paths=(),
                total_duration_seconds=None,
                rationale="No photos.",
            ),
            photo_set=ContentSequence(
                output_kind="instagram_photo_set",
                aspect_ratio="4:5",
                asset_paths=(),
                total_duration_seconds=None,
                rationale="No photos.",
            ),
        )

        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as outside_tmp:
            workspace = Path(tmp)
            target = Path(outside_tmp) / "A001.MOV"
            target.write_bytes(b"outside media")
            asset_path = workspace / reel_asset
            asset_path.parent.mkdir(parents=True)
            asset_path.symlink_to(target)
            write_storyline_artifact(storyline, workspace, allowed_asset_paths={reel_asset})

            with self.assertRaisesRegex(AssemblyPlanError, "symlink"):
                build_assembly_plan(production_plan, workspace)

    def test_rejects_production_jobs_with_noncanonical_deliverable_outputs(self) -> None:
        assets = [MediaAsset(path="card/DCIM/IMG_0001.CR3", media_type="photo")]
        production_plan = build_production_plan(assets, shoot_slug="canonical-outputs")
        photo_asset = "graded/grade_asset_00000/IMG_0001.CR3"
        storyline = StorylinePlan(
            reel=ContentSequence(
                output_kind="instagram_reel",
                aspect_ratio="9:16",
                asset_paths=(),
                total_duration_seconds=0.0,
                rationale="No videos.",
            ),
            carousel=ContentSequence(
                output_kind="instagram_carousel",
                aspect_ratio="4:5",
                asset_paths=(photo_asset,),
                total_duration_seconds=None,
                rationale="Trusted photo.",
            ),
            photo_set=ContentSequence(
                output_kind="instagram_photo_set",
                aspect_ratio="4:5",
                asset_paths=(photo_asset,),
                total_duration_seconds=None,
                rationale="Trusted photo.",
            ),
        )
        mutated_jobs = tuple(
            replace(job, outputs=("deliverables/custom_carousel/",))
            if job.job_id == "assemble_instagram_carousel"
            else job
            for job in production_plan.jobs
        )
        mutated_plan = replace(production_plan, jobs=mutated_jobs)

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            self._touch_workspace_files(workspace, (photo_asset,))
            write_storyline_artifact(storyline, workspace, allowed_asset_paths={photo_asset})

            with self.assertRaisesRegex(AssemblyPlanError, "Unexpected carousel output path"):
                build_assembly_plan(mutated_plan, workspace)

    def test_splits_large_photo_sets_into_parallel_chunks_with_stable_public_outputs(self) -> None:
        assets = [
            MediaAsset(path=f"card/DCIM/IMG_{index:04d}.CR3", media_type="photo")
            for index in range(1, 6)
        ]
        production_plan = build_production_plan(assets, shoot_slug="chunked-photo-set")
        photo_assets = tuple(
            f"graded/grade_asset_{index:05d}/IMG_{index + 1:04d}.CR3"
            for index in range(5)
        )
        storyline = StorylinePlan(
            reel=ContentSequence(
                output_kind="instagram_reel",
                aspect_ratio="9:16",
                asset_paths=(),
                total_duration_seconds=0.0,
                rationale="No video selects.",
            ),
            carousel=ContentSequence(
                output_kind="instagram_carousel",
                aspect_ratio="4:5",
                asset_paths=(),
                total_duration_seconds=None,
                rationale="No carousel for this export.",
            ),
            photo_set=ContentSequence(
                output_kind="instagram_photo_set",
                aspect_ratio="4:5",
                asset_paths=photo_assets,
                total_duration_seconds=None,
                rationale="Full ranked set.",
            ),
        )

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            self._touch_workspace_files(workspace, photo_assets)
            write_storyline_artifact(
                storyline,
                workspace,
                allowed_asset_paths=set(photo_assets),
            )

            assembly_plan = build_assembly_plan(
                production_plan,
                workspace,
                photo_set_chunk_size=2,
            )

        self.assertEqual([task.task_id for task in assembly_plan.render_tasks], [
            "export_instagram_photo_set_part_00001",
            "export_instagram_photo_set_part_00002",
            "export_instagram_photo_set_part_00003",
        ])
        first_chunk, second_chunk, third_chunk = assembly_plan.render_tasks
        self.assertTrue(all(task.can_run_in_parallel for task in assembly_plan.render_tasks))
        self.assertEqual(
            first_chunk.inputs,
            ("analysis/instagram_storylines.json", photo_assets[0], photo_assets[1]),
        )
        self.assertEqual(
            first_chunk.outputs,
            (
                "deliverables/instagram_photo_set/photo_00001.jpg",
                "deliverables/instagram_photo_set/photo_00002.jpg",
            ),
        )
        self.assertEqual(
            second_chunk.depends_on,
            ("rank_instagram_storylines", "grade_asset_00002", "grade_asset_00003"),
        )
        self.assertEqual(
            second_chunk.outputs,
            (
                "deliverables/instagram_photo_set/photo_00003.jpg",
                "deliverables/instagram_photo_set/photo_00004.jpg",
            ),
        )
        self.assertEqual(third_chunk.inputs, ("analysis/instagram_storylines.json", photo_assets[4]))
        self.assertEqual(third_chunk.outputs, ("deliverables/instagram_photo_set/photo_00005.jpg",))

    def test_rejects_invalid_photo_set_chunk_size(self) -> None:
        production_plan = build_production_plan(
            [MediaAsset(path="card/DCIM/IMG_0001.CR3", media_type="photo")],
            shoot_slug="invalid-chunk-size",
        )

        with tempfile.TemporaryDirectory() as tmp:
            for chunk_size in (0, True):
                with self.subTest(chunk_size=chunk_size):
                    with self.assertRaisesRegex(AssemblyPlanError, "photo_set_chunk_size"):
                        build_assembly_plan(
                            production_plan,
                            Path(tmp),
                            photo_set_chunk_size=chunk_size,
                        )

    def test_round_trips_render_tasks_manifest_with_exact_sorted_schema(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            assembly_plan = self._assembly_plan_for_manifest_tests(workspace)

            manifest_path = write_render_tasks_manifest(assembly_plan, workspace)
            loaded_plan = load_render_tasks_manifest(workspace, trusted_plan=assembly_plan)
            trusted_from_disk = load_trusted_render_tasks_manifest(workspace)

            raw_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

        self.assertEqual(manifest_path, workspace / "deliverables/render_tasks.json")
        self.assertEqual(loaded_plan, assembly_plan)
        self.assertEqual(trusted_from_disk, assembly_plan)
        self.assertEqual(list(raw_manifest), ["render_tasks", "schema_version", "shoot_slug"])
        self.assertEqual(
            list(raw_manifest["render_tasks"][0]),
            [
                "aspect_ratio",
                "can_run_in_parallel",
                "depends_on",
                "inputs",
                "output_kind",
                "outputs",
                "sequence_name",
                "source_job_id",
                "task_id",
            ],
        )

    def test_rejects_render_task_manifest_with_unknown_task_fields(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            assembly_plan = self._assembly_plan_for_manifest_tests(workspace)
            manifest_path = write_render_tasks_manifest(assembly_plan, workspace)
            raw_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            raw_manifest["render_tasks"][0]["delete_after_render"] = True
            manifest_path.write_text(json.dumps(raw_manifest), encoding="utf-8")

            with self.assertRaisesRegex(AssemblyPlanError, "Unexpected render task field"):
                load_render_tasks_manifest(workspace, trusted_plan=assembly_plan)
            with self.assertRaisesRegex(AssemblyPlanError, "Unexpected render task field"):
                load_trusted_render_tasks_manifest(workspace)

    def test_rejects_render_task_manifest_with_unsafe_inputs_or_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            assembly_plan = self._assembly_plan_for_manifest_tests(workspace)
            manifest_path = write_render_tasks_manifest(assembly_plan, workspace)
            raw_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            raw_manifest["render_tasks"][0]["inputs"] = ["analysis/instagram_storylines.json", "../secret.mov"]
            manifest_path.write_text(json.dumps(raw_manifest), encoding="utf-8")

            with self.assertRaisesRegex(AssemblyPlanError, "Unsafe render task input path"):
                load_render_tasks_manifest(workspace, trusted_plan=assembly_plan)

            raw_manifest["render_tasks"][0]["inputs"] = ["analysis/instagram_storylines.json", "graded/grade_asset_00000/A001.MOV"]
            raw_manifest["render_tasks"][0]["outputs"] = ["/tmp/instagram_reel.mp4"]
            manifest_path.write_text(json.dumps(raw_manifest), encoding="utf-8")

            with self.assertRaisesRegex(AssemblyPlanError, "Unsafe render task output path"):
                load_render_tasks_manifest(workspace, trusted_plan=assembly_plan)

    def test_rejects_symlinked_render_task_manifest_and_temp_paths(self) -> None:
        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as outside_tmp:
            workspace = Path(tmp)
            outside = Path(outside_tmp)
            assembly_plan = self._assembly_plan_for_manifest_tests(workspace)
            manifest_path = write_render_tasks_manifest(assembly_plan, workspace)
            manifest_path.unlink()
            manifest_path.symlink_to(outside / "render_tasks.json")

            with self.assertRaisesRegex(AssemblyPlanError, "render task manifest symlink"):
                load_render_tasks_manifest(workspace, trusted_plan=assembly_plan)
            with self.assertRaisesRegex(AssemblyPlanError, "render task manifest symlink"):
                load_trusted_render_tasks_manifest(workspace)

        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as outside_tmp:
            workspace = Path(tmp)
            outside = Path(outside_tmp)
            assembly_plan = self._assembly_plan_for_manifest_tests(workspace)
            manifest_path = workspace / RENDER_TASKS_MANIFEST_PATH
            manifest_path.parent.mkdir(parents=True)
            manifest_path.with_suffix(".json.tmp").symlink_to(outside / "render_tasks.json.tmp")

            with self.assertRaisesRegex(AssemblyPlanError, "temporary render task manifest"):
                write_render_tasks_manifest(assembly_plan, workspace)

    def test_rejects_render_task_manifest_inputs_outside_trusted_assembly_plan(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            assembly_plan = self._assembly_plan_for_manifest_tests(workspace)
            manifest_path = write_render_tasks_manifest(assembly_plan, workspace)
            raw_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            raw_manifest["render_tasks"][0]["inputs"] = [
                "analysis/instagram_storylines.json",
                "graded/grade_asset_00099/UNTRUSTED.MOV",
            ]
            raw_manifest["render_tasks"][0]["depends_on"] = [
                "rank_instagram_storylines",
                "grade_asset_00099",
            ]
            manifest_path.write_text(json.dumps(raw_manifest), encoding="utf-8")

            with self.assertRaisesRegex(AssemblyPlanError, "not match trusted assembly plan"):
                load_render_tasks_manifest(workspace, trusted_plan=assembly_plan)

    def test_rejects_noncanonical_render_task_identity_before_writing_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            assembly_plan = self._assembly_plan_for_manifest_tests(workspace)
            mutated_task = replace(
                assembly_plan.render_tasks[0],
                source_job_id="delete_sources_after_render",
            )
            mutated_plan = replace(assembly_plan, render_tasks=(mutated_task,) + assembly_plan.render_tasks[1:])

            with self.assertRaisesRegex(AssemblyPlanError, "Unexpected reel source job"):
                write_render_tasks_manifest(mutated_plan, workspace)

    def test_rejects_duplicate_outputs_across_render_tasks_before_writing_manifest(self) -> None:
        duplicated_plan = AssemblyPlan(
            shoot_slug="duplicate-outputs",
            render_tasks=(
                RenderTask(
                    task_id="export_instagram_photo_set_part_00001",
                    sequence_name="photo_set",
                    source_job_id="export_instagram_photo_set",
                    output_kind="instagram_photo_set",
                    aspect_ratio="4:5",
                    inputs=(
                        "analysis/instagram_storylines.json",
                        "graded/grade_asset_00000/IMG_0001.CR3",
                    ),
                    outputs=("deliverables/instagram_photo_set/photo_00001.jpg",),
                    depends_on=("rank_instagram_storylines", "grade_asset_00000"),
                    can_run_in_parallel=True,
                ),
                RenderTask(
                    task_id="export_instagram_photo_set_part_00002",
                    sequence_name="photo_set",
                    source_job_id="export_instagram_photo_set",
                    output_kind="instagram_photo_set",
                    aspect_ratio="4:5",
                    inputs=(
                        "analysis/instagram_storylines.json",
                        "graded/grade_asset_00001/IMG_0002.CR3",
                    ),
                    outputs=("deliverables/instagram_photo_set/photo_00001.jpg",),
                    depends_on=("rank_instagram_storylines", "grade_asset_00001"),
                    can_run_in_parallel=True,
                ),
            ),
        )

        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(AssemblyPlanError, "Duplicate render task output"):
                write_render_tasks_manifest(duplicated_plan, Path(tmp))

    def test_rejects_chunked_photo_set_tasks_that_are_not_parallelizable(self) -> None:
        nonparallel_plan = AssemblyPlan(
            shoot_slug="nonparallel-chunk",
            render_tasks=(
                RenderTask(
                    task_id="export_instagram_photo_set_part_00001",
                    sequence_name="photo_set",
                    source_job_id="export_instagram_photo_set",
                    output_kind="instagram_photo_set",
                    aspect_ratio="4:5",
                    inputs=(
                        "analysis/instagram_storylines.json",
                        "graded/grade_asset_00000/IMG_0001.CR3",
                    ),
                    outputs=("deliverables/instagram_photo_set/photo_00001.jpg",),
                    depends_on=("rank_instagram_storylines", "grade_asset_00000"),
                    can_run_in_parallel=False,
                ),
            ),
        )

        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(AssemblyPlanError, "parallel"):
                write_render_tasks_manifest(nonparallel_plan, Path(tmp))

    def test_round_trips_chunked_render_tasks_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            assembly_plan = self._chunked_photo_set_plan(workspace, photo_count=3, chunk_size=2)

            manifest_path = write_render_tasks_manifest(assembly_plan, workspace)
            loaded_plan = load_render_tasks_manifest(workspace, trusted_plan=assembly_plan)
            raw_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

        self.assertEqual(loaded_plan, assembly_plan)
        self.assertEqual(
            [task["task_id"] for task in raw_manifest["render_tasks"]],
            ["export_instagram_photo_set_part_00001", "export_instagram_photo_set_part_00002"],
        )

    def test_rejects_noncanonical_render_task_paths_and_dependencies_before_writing_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            assembly_plan = self._assembly_plan_for_manifest_tests(workspace)

            for field_name, field_value, expected_error in (
                ("inputs", ("analysis/rogue_storyline.json", "graded/grade_asset_00000/A001.MOV"), "first input"),
                ("outputs", ("deliverables/rogue_reel.mp4",), "Unexpected reel outputs"),
                ("depends_on", ("rank_instagram_storylines", "grade_asset_99999"), "Unexpected reel dependencies"),
            ):
                with self.subTest(field_name=field_name):
                    mutated_task = replace(assembly_plan.render_tasks[0], **{field_name: field_value})
                    mutated_plan = replace(
                        assembly_plan,
                        render_tasks=(mutated_task,) + assembly_plan.render_tasks[1:],
                    )

                    with self.assertRaisesRegex(AssemblyPlanError, expected_error):
                        write_render_tasks_manifest(mutated_plan, workspace)

    def test_wraps_cyclic_render_task_manifest_symlinks_as_assembly_errors(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            assembly_plan = self._assembly_plan_for_manifest_tests(workspace)
            deliverables_path = workspace / "deliverables"
            deliverables_path.symlink_to(deliverables_path)

            with self.assertRaisesRegex(AssemblyPlanError, "render task manifest directory symlink"):
                load_render_tasks_manifest(workspace, trusted_plan=assembly_plan)

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            assembly_plan = self._assembly_plan_for_manifest_tests(workspace)
            deliverables_path = workspace / "deliverables"
            deliverables_path.symlink_to(deliverables_path)

            with self.assertRaisesRegex(AssemblyPlanError, "render task manifest directory symlink"):
                write_render_tasks_manifest(assembly_plan, workspace)

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            assembly_plan = self._assembly_plan_for_manifest_tests(workspace)
            manifest_path = workspace / RENDER_TASKS_MANIFEST_PATH
            manifest_path.parent.mkdir(parents=True)
            manifest_path.symlink_to(manifest_path)

            with self.assertRaisesRegex(AssemblyPlanError, "render task manifest symlink"):
                load_render_tasks_manifest(workspace, trusted_plan=assembly_plan)

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            assembly_plan = self._assembly_plan_for_manifest_tests(workspace)
            manifest_path = workspace / RENDER_TASKS_MANIFEST_PATH
            manifest_path.parent.mkdir(parents=True)
            temp_path = manifest_path.with_suffix(".json.tmp")
            temp_path.symlink_to(temp_path)

            with self.assertRaisesRegex(AssemblyPlanError, "temporary render task manifest symlink"):
                write_render_tasks_manifest(assembly_plan, workspace)

    def _touch_workspace_files(self, workspace: Path, relative_paths: tuple[str, ...]) -> None:
        for relative_path in relative_paths:
            path = workspace / relative_path
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b"graded media")

    def _assembly_plan_for_manifest_tests(self, workspace: Path):
        assets = [
            MediaAsset(path="card/DCIM/A001.MOV", media_type="video", duration_seconds=24.0),
            MediaAsset(path="card/DCIM/IMG_0001.CR3", media_type="photo"),
        ]
        production_plan = build_production_plan(assets, shoot_slug="manifest-contract")
        reel_asset = "graded/grade_asset_00000/A001.MOV"
        photo_asset = "graded/grade_asset_00001/IMG_0001.CR3"
        storyline = StorylinePlan(
            reel=ContentSequence(
                output_kind="instagram_reel",
                aspect_ratio="9:16",
                asset_paths=(reel_asset,),
                total_duration_seconds=24.0,
                rationale="Hero reel.",
            ),
            carousel=ContentSequence(
                output_kind="instagram_carousel",
                aspect_ratio="4:5",
                asset_paths=(photo_asset,),
                total_duration_seconds=None,
                rationale="Single carousel select.",
            ),
            photo_set=ContentSequence(
                output_kind="instagram_photo_set",
                aspect_ratio="4:5",
                asset_paths=(photo_asset,),
                total_duration_seconds=None,
                rationale="Single ranked photo.",
            ),
        )
        self._touch_workspace_files(workspace, (reel_asset, photo_asset))
        write_storyline_artifact(
            storyline,
            workspace,
            allowed_asset_paths={reel_asset, photo_asset},
        )
        return build_assembly_plan(production_plan, workspace)

    def _chunked_photo_set_plan(self, workspace: Path, *, photo_count: int, chunk_size: int):
        assets = [
            MediaAsset(path=f"card/DCIM/IMG_{index:04d}.CR3", media_type="photo")
            for index in range(1, photo_count + 1)
        ]
        production_plan = build_production_plan(assets, shoot_slug="chunked-manifest")
        photo_assets = tuple(
            f"graded/grade_asset_{index:05d}/IMG_{index + 1:04d}.CR3"
            for index in range(photo_count)
        )
        storyline = StorylinePlan(
            reel=ContentSequence(
                output_kind="instagram_reel",
                aspect_ratio="9:16",
                asset_paths=(),
                total_duration_seconds=0.0,
                rationale="No video selects.",
            ),
            carousel=ContentSequence(
                output_kind="instagram_carousel",
                aspect_ratio="4:5",
                asset_paths=(),
                total_duration_seconds=None,
                rationale="No carousel for this export.",
            ),
            photo_set=ContentSequence(
                output_kind="instagram_photo_set",
                aspect_ratio="4:5",
                asset_paths=photo_assets,
                total_duration_seconds=None,
                rationale="Full ranked set.",
            ),
        )
        self._touch_workspace_files(workspace, photo_assets)
        write_storyline_artifact(
            storyline,
            workspace,
            allowed_asset_paths=set(photo_assets),
        )
        return build_assembly_plan(
            production_plan,
            workspace,
            photo_set_chunk_size=chunk_size,
        )


if __name__ == "__main__":
    unittest.main()
