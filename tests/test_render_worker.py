from dataclasses import replace
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from shootflow.assembly import AssemblyPlan, RenderTask
from shootflow.render_status import (
    OutputChecksum,
    RenderStatusManifest,
    RenderTaskStatus,
    render_plan_fingerprint,
)
from shootflow.render_worker import (
    RenderWorkerError,
    claim_render_worker_action,
    plan_render_worker_actions,
    report_render_worker_failure,
    report_render_worker_retryable,
    report_render_worker_success,
)


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

    def test_rejects_in_memory_plans_with_source_media_inputs_before_scheduling(self) -> None:
        trusted_plan = self._trusted_plan()
        unsafe_task = replace(
            trusted_plan.render_tasks[0],
            inputs=("source/DCIM/A001.MOV",),
            depends_on=("rank_instagram_storylines",),
        )
        unsafe_plan = replace(
            trusted_plan,
            render_tasks=(unsafe_task,) + trusted_plan.render_tasks[1:],
        )
        manifest = RenderStatusManifest(
            shoot_slug="worker-contract",
            render_plan_fingerprint=self._legacy_fingerprint_for_unsafe_plan(unsafe_plan),
            task_statuses=tuple(
                RenderTaskStatus(task_id=task.task_id, state="pending")
                for task in unsafe_plan.render_tasks
            ),
        )

        with self.assertRaisesRegex(RenderWorkerError, "status manifest"):
            plan_render_worker_actions(
                unsafe_plan,
                manifest,
                completed_dependency_ids={"rank_instagram_storylines"},
                renderer_adapter="dry-run-local",
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
                    depends_on=("rank_instagram_storylines", "grade_asset_99999"),
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

    def test_claims_ready_action_as_running_status(self) -> None:
        action = self._ready_action()
        status = RenderTaskStatus(task_id="render_instagram_reel", state="pending")

        running_status = claim_render_worker_action(
            status,
            action,
            updated_at="2026-05-07T11:20:00Z",
        )

        self.assertEqual(
            running_status,
            RenderTaskStatus(
                task_id="render_instagram_reel",
                state="running",
                renderer_adapter="dry-run-local",
                attempts=1,
                updated_at="2026-05-07T11:20:00Z",
            ),
        )

    def test_rejects_stale_worker_claim_attempts(self) -> None:
        action = self._ready_action()
        stale_status = RenderTaskStatus(
            task_id="render_instagram_reel",
            state="running",
            renderer_adapter="dry-run-local",
            attempts=1,
            updated_at="2026-05-07T11:19:00Z",
        )

        with self.assertRaisesRegex(RenderWorkerError, "current status"):
            claim_render_worker_action(
                stale_status,
                action,
                updated_at="2026-05-07T11:20:00Z",
            )

    def test_reports_success_with_checksums_for_declared_outputs(self) -> None:
        action = self._ready_action()
        current_status = RenderTaskStatus(
            task_id="render_instagram_reel",
            state="running",
            renderer_adapter="dry-run-local",
            attempts=1,
            updated_at="2026-05-07T11:20:00Z",
        )
        with tempfile.TemporaryDirectory() as tmpdir:
            output_path = Path(tmpdir) / "deliverables" / "instagram_reel.mp4"
            output_path.parent.mkdir(parents=True)
            output_bytes = b"rendered reel bytes"
            output_path.write_bytes(output_bytes)

            succeeded_status = report_render_worker_success(
                current_status,
                action,
                tmpdir,
                updated_at="2026-05-07T11:21:00Z",
            )

        self.assertEqual(succeeded_status.task_id, "render_instagram_reel")
        self.assertEqual(succeeded_status.state, "succeeded")
        self.assertEqual(succeeded_status.renderer_adapter, "dry-run-local")
        self.assertEqual(succeeded_status.attempts, 1)
        self.assertEqual(succeeded_status.updated_at, "2026-05-07T11:21:00Z")
        self.assertEqual(
            succeeded_status.output_checksums,
            (
                OutputChecksum(
                    path="deliverables/instagram_reel.mp4",
                    sha256=hashlib.sha256(output_bytes).hexdigest(),
                ),
            ),
        )

    def test_rejects_success_when_declared_output_is_missing(self) -> None:
        action = self._ready_action()
        current_status = RenderTaskStatus(
            task_id="render_instagram_reel",
            state="running",
            renderer_adapter="dry-run-local",
            attempts=1,
            updated_at="2026-05-07T11:20:00Z",
        )
        with tempfile.TemporaryDirectory() as tmpdir:
            with self.assertRaisesRegex(RenderWorkerError, "output"):
                report_render_worker_success(
                    current_status,
                    action,
                    tmpdir,
                    updated_at="2026-05-07T11:21:00Z",
                )

    def test_rejects_success_when_output_is_a_symlink(self) -> None:
        action = self._ready_action()
        current_status = RenderTaskStatus(
            task_id="render_instagram_reel",
            state="running",
            renderer_adapter="dry-run-local",
            attempts=1,
            updated_at="2026-05-07T11:20:00Z",
        )
        with tempfile.TemporaryDirectory() as tmpdir:
            target_path = Path(tmpdir) / "rendered-reel.mp4"
            target_path.write_bytes(b"rendered reel bytes")
            output_path = Path(tmpdir) / "deliverables" / "instagram_reel.mp4"
            output_path.parent.mkdir(parents=True)
            output_path.symlink_to(target_path)

            with self.assertRaisesRegex(RenderWorkerError, "symlink"):
                report_render_worker_success(
                    current_status,
                    action,
                    tmpdir,
                    updated_at="2026-05-07T11:21:00Z",
                )

    def test_rejects_success_from_mismatched_running_status(self) -> None:
        action = self._ready_action()
        current_status = RenderTaskStatus(
            task_id="render_instagram_reel",
            state="running",
            renderer_adapter="different-adapter",
            attempts=1,
            updated_at="2026-05-07T11:20:00Z",
        )
        with tempfile.TemporaryDirectory() as tmpdir:
            output_path = Path(tmpdir) / "deliverables" / "instagram_reel.mp4"
            output_path.parent.mkdir(parents=True)
            output_path.write_bytes(b"rendered reel bytes")

            with self.assertRaisesRegex(RenderWorkerError, "renderer adapter"):
                report_render_worker_success(
                    current_status,
                    action,
                    tmpdir,
                    updated_at="2026-05-07T11:21:00Z",
                )

    def test_reports_retryable_and_failed_statuses_from_running_action(self) -> None:
        action = self._ready_action()
        current_status = RenderTaskStatus(
            task_id="render_instagram_reel",
            state="running",
            renderer_adapter="dry-run-local",
            attempts=1,
            updated_at="2026-05-07T11:20:00Z",
        )

        retryable_status = report_render_worker_retryable(
            current_status,
            action,
            error_message="Renderer lost the temporary output before checksum.",
            updated_at="2026-05-07T11:22:00Z",
        )
        failed_status = report_render_worker_failure(
            current_status,
            action,
            error_message="Unsupported codec for the selected local adapter.",
            updated_at="2026-05-07T11:23:00Z",
        )

        self.assertEqual(retryable_status.state, "retryable")
        self.assertEqual(failed_status.state, "failed")
        self.assertEqual(retryable_status.attempts, 1)
        self.assertEqual(failed_status.attempts, 1)
        self.assertEqual(retryable_status.renderer_adapter, "dry-run-local")
        self.assertEqual(failed_status.renderer_adapter, "dry-run-local")

    def test_rejects_retryable_from_non_running_status(self) -> None:
        action = self._ready_action()
        current_status = RenderTaskStatus(task_id="render_instagram_reel", state="pending")

        with self.assertRaisesRegex(RenderWorkerError, "running"):
            report_render_worker_retryable(
                current_status,
                action,
                error_message="Renderer lost the temporary output before checksum.",
                updated_at="2026-05-07T11:22:00Z",
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

    def _legacy_fingerprint_for_unsafe_plan(self, plan: AssemblyPlan) -> str:
        fingerprint_input = {
            "shoot_slug": plan.shoot_slug,
            "render_tasks": [
                {
                    "task_id": task.task_id,
                    "sequence_name": task.sequence_name,
                    "source_job_id": task.source_job_id,
                    "output_kind": task.output_kind,
                    "aspect_ratio": task.aspect_ratio,
                    "inputs": list(task.inputs),
                    "outputs": list(task.outputs),
                    "depends_on": list(task.depends_on),
                    "can_run_in_parallel": task.can_run_in_parallel,
                }
                for task in plan.render_tasks
            ],
        }
        encoded = json.dumps(
            fingerprint_input,
            ensure_ascii=True,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()

    def _ready_action(self):
        trusted_plan = self._trusted_plan()
        manifest = RenderStatusManifest(
            shoot_slug="worker-contract",
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
            task_statuses=tuple(
                RenderTaskStatus(task_id=task.task_id, state="pending")
                for task in trusted_plan.render_tasks
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
        return action_plan.actions[0]


if __name__ == "__main__":
    unittest.main()
