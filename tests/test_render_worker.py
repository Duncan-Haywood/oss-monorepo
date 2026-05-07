from dataclasses import replace
import unittest

from shootflow.assembly import AssemblyPlan, RenderTask
from shootflow.render_status import (
    OutputChecksum,
    RenderStatusManifest,
    RenderTaskStatus,
    render_plan_fingerprint,
)
from shootflow.render_worker import RenderWorkerError, plan_render_worker_actions


class RenderWorkerPlanningTests(unittest.TestCase):
    def test_schedules_pending_and_retryable_tasks_with_completed_dependencies(self) -> None:
        trusted_plan = self._trusted_plan()
        manifest = RenderStatusManifest(
            shoot_slug="worker-contract",
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
            task_statuses=(
                RenderTaskStatus(task_id="render_instagram_reel", state="pending"),
                RenderTaskStatus(
                    task_id="render_instagram_carousel",
                    state="succeeded",
                    renderer_adapter="core-image-local",
                    attempts=1,
                    output_checksums=(
                        OutputChecksum(
                            path="deliverables/instagram_carousel/slide_00001.jpg",
                            sha256="a" * 64,
                        ),
                    ),
                    updated_at="2026-05-07T10:10:00Z",
                ),
                RenderTaskStatus(
                    task_id="export_instagram_photo_set_part_00001",
                    state="retryable",
                    renderer_adapter="ffmpeg-local",
                    attempts=2,
                    error_message="Worker interrupted after temp output cleanup.",
                    updated_at="2026-05-07T10:11:00Z",
                ),
                RenderTaskStatus(
                    task_id="render_instagram_reel_variant_fast_cut",
                    state="running",
                    renderer_adapter="ffmpeg-local",
                    attempts=1,
                    updated_at="2026-05-07T10:12:00Z",
                ),
            ),
        )

        action_plan = plan_render_worker_actions(
            trusted_plan,
            manifest,
            completed_dependency_ids={
                "rank_instagram_storylines",
                "grade_asset_00000",
                "grade_asset_00001",
                "grade_asset_00002",
            },
            renderer_adapter="dry-run-local",
        )

        self.assertEqual(action_plan.shoot_slug, "worker-contract")
        self.assertEqual(action_plan.renderer_adapter, "dry-run-local")
        self.assertEqual(action_plan.blocked_tasks, ())
        self.assertEqual([action.task_id for action in action_plan.actions], [
            "render_instagram_reel",
            "export_instagram_photo_set_part_00001",
        ])
        reel_action, retry_action = action_plan.actions
        self.assertEqual(reel_action.attempt_number, 1)
        self.assertEqual(reel_action.inputs, (
            "analysis/instagram_storylines.json",
            "graded/grade_asset_00000/A001.MOV",
        ))
        self.assertEqual(reel_action.outputs, ("deliverables/instagram_reel.mp4",))
        self.assertEqual(retry_action.attempt_number, 3)
        self.assertTrue(retry_action.can_run_in_parallel)

    def test_reports_dependency_blocked_tasks_without_scheduling_them(self) -> None:
        trusted_plan = self._trusted_plan()
        manifest = RenderStatusManifest(
            shoot_slug="worker-contract",
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
            task_statuses=(
                RenderTaskStatus(task_id="render_instagram_reel", state="pending"),
                RenderTaskStatus(task_id="render_instagram_carousel", state="pending"),
                RenderTaskStatus(task_id="export_instagram_photo_set_part_00001", state="pending"),
                RenderTaskStatus(task_id="render_instagram_reel_variant_fast_cut", state="pending"),
            ),
        )

        action_plan = plan_render_worker_actions(
            trusted_plan,
            manifest,
            completed_dependency_ids={
                "rank_instagram_storylines",
                "grade_asset_00000",
            },
            renderer_adapter="dry-run-local",
        )

        self.assertEqual([action.task_id for action in action_plan.actions], ["render_instagram_reel"])
        self.assertEqual(
            [(blocked.task_id, blocked.missing_dependencies) for blocked in action_plan.blocked_tasks],
            [
                ("render_instagram_carousel", ("grade_asset_00001",)),
                ("export_instagram_photo_set_part_00001", ("grade_asset_00002",)),
                ("render_instagram_reel_variant_fast_cut", ("grade_asset_00002",)),
            ],
        )

    def test_treats_render_task_dependencies_as_satisfied_only_after_success(self) -> None:
        base_plan = self._trusted_plan()
        dependent_variant = replace(
            base_plan.render_tasks[3],
            depends_on=("render_instagram_reel", "grade_asset_00002"),
        )
        trusted_plan = replace(
            base_plan,
            render_tasks=base_plan.render_tasks[:3] + (dependent_variant,),
        )

        pending_manifest = RenderStatusManifest(
            shoot_slug="worker-contract",
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
            task_statuses=(
                RenderTaskStatus(task_id="render_instagram_reel", state="pending"),
                RenderTaskStatus(task_id="render_instagram_carousel", state="pending"),
                RenderTaskStatus(task_id="export_instagram_photo_set_part_00001", state="pending"),
                RenderTaskStatus(task_id="render_instagram_reel_variant_fast_cut", state="pending"),
            ),
        )
        blocked_plan = plan_render_worker_actions(
            trusted_plan,
            pending_manifest,
            completed_dependency_ids={"grade_asset_00002"},
            renderer_adapter="dry-run-local",
        )

        succeeded_manifest = replace(
            pending_manifest,
            task_statuses=(
                RenderTaskStatus(
                    task_id="render_instagram_reel",
                    state="succeeded",
                    renderer_adapter="dry-run-local",
                    attempts=1,
                    output_checksums=(
                        OutputChecksum(path="deliverables/instagram_reel.mp4", sha256="b" * 64),
                    ),
                    updated_at="2026-05-07T10:13:00Z",
                ),
                pending_manifest.task_statuses[1],
                pending_manifest.task_statuses[2],
                pending_manifest.task_statuses[3],
            ),
        )
        ready_plan = plan_render_worker_actions(
            trusted_plan,
            succeeded_manifest,
            completed_dependency_ids={"grade_asset_00002"},
            renderer_adapter="dry-run-local",
        )

        self.assertIn(
            ("render_instagram_reel_variant_fast_cut", ("render_instagram_reel",)),
            [(blocked.task_id, blocked.missing_dependencies) for blocked in blocked_plan.blocked_tasks],
        )
        self.assertIn(
            "render_instagram_reel_variant_fast_cut",
            [action.task_id for action in ready_plan.actions],
        )

    def test_rejects_stale_status_manifest_before_planning_actions(self) -> None:
        trusted_plan = self._trusted_plan()
        stale_plan = replace(
            trusted_plan,
            render_tasks=(
                replace(
                    trusted_plan.render_tasks[0],
                    inputs=(
                        "analysis/instagram_storylines.json",
                        "graded/grade_asset_99999/STALE.MOV",
                    ),
                ),
            )
            + trusted_plan.render_tasks[1:],
        )
        stale_manifest = RenderStatusManifest(
            shoot_slug="worker-contract",
            render_plan_fingerprint=render_plan_fingerprint(stale_plan),
            task_statuses=tuple(
                RenderTaskStatus(task_id=task.task_id, state="pending")
                for task in trusted_plan.render_tasks
            ),
        )

        with self.assertRaisesRegex(RenderWorkerError, "status manifest"):
            plan_render_worker_actions(
                trusted_plan,
                stale_manifest,
                completed_dependency_ids={"rank_instagram_storylines", "grade_asset_00000"},
                renderer_adapter="dry-run-local",
            )

    def test_rejects_invalid_renderer_adapter_names(self) -> None:
        trusted_plan = self._trusted_plan()
        manifest = RenderStatusManifest(
            shoot_slug="worker-contract",
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
            task_statuses=tuple(
                RenderTaskStatus(task_id=task.task_id, state="pending")
                for task in trusted_plan.render_tasks
            ),
        )

        with self.assertRaisesRegex(RenderWorkerError, "renderer adapter"):
            plan_render_worker_actions(
                trusted_plan,
                manifest,
                completed_dependency_ids={"rank_instagram_storylines", "grade_asset_00000"},
                renderer_adapter="../ffmpeg",
            )

    def _trusted_plan(self) -> AssemblyPlan:
        return AssemblyPlan(
            shoot_slug="worker-contract",
            render_tasks=(
                RenderTask(
                    task_id="render_instagram_reel",
                    sequence_name="reel",
                    source_job_id="assemble_instagram_reel",
                    output_kind="instagram_reel",
                    aspect_ratio="9:16",
                    inputs=(
                        "analysis/instagram_storylines.json",
                        "graded/grade_asset_00000/A001.MOV",
                    ),
                    outputs=("deliverables/instagram_reel.mp4",),
                    depends_on=("rank_instagram_storylines", "grade_asset_00000"),
                    can_run_in_parallel=False,
                ),
                RenderTask(
                    task_id="render_instagram_carousel",
                    sequence_name="carousel",
                    source_job_id="assemble_instagram_carousel",
                    output_kind="instagram_carousel",
                    aspect_ratio="4:5",
                    inputs=(
                        "analysis/instagram_storylines.json",
                        "graded/grade_asset_00001/IMG_0001.CR3",
                    ),
                    outputs=("deliverables/instagram_carousel/slide_00001.jpg",),
                    depends_on=("rank_instagram_storylines", "grade_asset_00001"),
                    can_run_in_parallel=False,
                ),
                RenderTask(
                    task_id="export_instagram_photo_set_part_00001",
                    sequence_name="photo_set",
                    source_job_id="export_instagram_photo_set",
                    output_kind="instagram_photo_set",
                    aspect_ratio="4:5",
                    inputs=(
                        "analysis/instagram_storylines.json",
                        "graded/grade_asset_00002/IMG_0002.CR3",
                    ),
                    outputs=("deliverables/instagram_photo_set/photo_00001.jpg",),
                    depends_on=("rank_instagram_storylines", "grade_asset_00002"),
                    can_run_in_parallel=True,
                ),
                RenderTask(
                    task_id="render_instagram_reel_variant_fast_cut",
                    sequence_name="reel",
                    source_job_id="assemble_instagram_reel",
                    output_kind="instagram_reel",
                    aspect_ratio="9:16",
                    inputs=(
                        "analysis/instagram_storylines.json",
                        "graded/grade_asset_00002/A002.MOV",
                    ),
                    outputs=("deliverables/instagram_reels/fast_cut.mp4",),
                    depends_on=("rank_instagram_storylines", "grade_asset_00002"),
                    can_run_in_parallel=True,
                ),
            ),
        )


if __name__ == "__main__":
    unittest.main()
