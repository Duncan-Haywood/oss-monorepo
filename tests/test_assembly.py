from dataclasses import replace
import json
import tempfile
import unittest
from pathlib import Path

from shootflow.assembly import (
    RENDER_TASKS_MANIFEST_PATH,
    AssemblyPlanError,
    build_assembly_plan,
    load_render_tasks_manifest,
    write_render_tasks_manifest,
)
from shootflow.deliverables import MediaAsset
from shootflow.production import build_production_plan
from shootflow.story import ContentSequence, StorylinePlan, write_storyline_artifact


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

    def test_round_trips_render_tasks_manifest_with_exact_sorted_schema(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            assembly_plan = self._assembly_plan_for_manifest_tests(workspace)

            manifest_path = write_render_tasks_manifest(assembly_plan, workspace)
            loaded_plan = load_render_tasks_manifest(workspace, trusted_plan=assembly_plan)

            raw_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

        self.assertEqual(manifest_path, workspace / "deliverables/render_tasks.json")
        self.assertEqual(loaded_plan, assembly_plan)
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


if __name__ == "__main__":
    unittest.main()
