from pathlib import Path
import tempfile
import unittest

from shootflow.assembly import AssemblyPlan, RenderTask
from shootflow.render_adapter import (
    DryRunRenderResult,
    run_dry_run_render_action,
)
from shootflow.render_status import (
    RenderStatusManifest,
    RenderTaskStatus,
    load_render_status_manifest,
    render_plan_fingerprint,
    write_render_status_manifest,
)
from shootflow.render_worker import RenderWorkerError, plan_render_worker_actions


class DryRunRenderAdapterTests(unittest.TestCase):
    def test_persists_claim_and_success_for_declared_outputs(self) -> None:
        trusted_plan = self._trusted_plan()
        action = self._ready_action(trusted_plan)
        initial_manifest = self._pending_manifest(trusted_plan)

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_render_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_render_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-07T13:00:00Z",
                completed_at="2026-05-07T13:00:05Z",
            )
            loaded_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)
            output_path = workspace / "deliverables" / "instagram_reel.mp4"
            output_exists = output_path.exists()

        self.assertIsInstance(result, DryRunRenderResult)
        self.assertEqual(result.task_id, "render_instagram_reel")
        self.assertEqual(result.claimed_status.state, "running")
        self.assertEqual(result.final_status.state, "succeeded")
        self.assertEqual(result.outputs_materialized, ("deliverables/instagram_reel.mp4",))
        self.assertEqual(result.manifest, loaded_manifest)
        self.assertTrue(output_exists)
        self.assertEqual(
            result.final_status.output_checksums[0].path,
            "deliverables/instagram_reel.mp4",
        )

    def test_refuses_to_overwrite_existing_different_output_and_marks_retryable(self) -> None:
        trusted_plan = self._trusted_plan()
        action = self._ready_action(trusted_plan)
        initial_manifest = self._pending_manifest(trusted_plan)

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            output_path = workspace / "deliverables" / "instagram_reel.mp4"
            output_path.parent.mkdir(parents=True)
            output_path.write_bytes(b"manual editor export")
            write_render_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_render_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-07T13:01:00Z",
                completed_at="2026-05-07T13:01:05Z",
            )
            loaded_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)
            preserved_bytes = output_path.read_bytes()

        self.assertEqual(result.final_status.state, "retryable")
        self.assertEqual(result.final_status.attempts, 1)
        self.assertIn("Refusing to overwrite", result.final_status.error_message or "")
        self.assertEqual(result.outputs_materialized, ())
        self.assertEqual(preserved_bytes, b"manual editor export")
        self.assertEqual(loaded_manifest.task_statuses[0], result.final_status)

    def test_refuses_symlinked_output_and_does_not_modify_target(self) -> None:
        trusted_plan = self._trusted_plan()
        action = self._ready_action(trusted_plan)
        initial_manifest = self._pending_manifest(trusted_plan)

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            target_path = workspace / "outside-render.mp4"
            target_path.write_bytes(b"target bytes")
            output_path = workspace / "deliverables" / "instagram_reel.mp4"
            output_path.parent.mkdir(parents=True)
            output_path.symlink_to(target_path)
            write_render_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_render_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-07T13:02:00Z",
                completed_at="2026-05-07T13:02:05Z",
            )
            target_bytes = target_path.read_bytes()
            output_is_symlink = output_path.is_symlink()

        self.assertEqual(result.final_status.state, "retryable")
        self.assertIn("symlink", result.final_status.error_message or "")
        self.assertEqual(target_bytes, b"target bytes")
        self.assertTrue(output_is_symlink)

    def test_stale_claim_does_not_materialize_outputs(self) -> None:
        trusted_plan = self._trusted_plan()
        action = self._ready_action(trusted_plan)
        running_manifest = RenderStatusManifest(
            shoot_slug="adapter-contract",
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
            task_statuses=(
                RenderTaskStatus(
                    task_id="render_instagram_reel",
                    state="running",
                    renderer_adapter="dry-run-local",
                    attempts=1,
                    updated_at="2026-05-07T12:59:00Z",
                ),
                RenderTaskStatus(task_id="render_instagram_carousel", state="pending"),
            ),
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_render_status_manifest(running_manifest, workspace, trusted_plan=trusted_plan)

            with self.assertRaisesRegex(RenderWorkerError, "current status"):
                run_dry_run_render_action(
                    workspace,
                    trusted_plan=trusted_plan,
                    action=action,
                    started_at="2026-05-07T13:03:00Z",
                    completed_at="2026-05-07T13:03:05Z",
                )
            output_exists = (workspace / "deliverables" / "instagram_reel.mp4").exists()
            loaded_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertFalse(output_exists)
        self.assertEqual(loaded_manifest, running_manifest)

    def _pending_manifest(self, trusted_plan: AssemblyPlan) -> RenderStatusManifest:
        return RenderStatusManifest(
            shoot_slug="adapter-contract",
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
            task_statuses=tuple(
                RenderTaskStatus(task_id=task.task_id, state="pending")
                for task in trusted_plan.render_tasks
            ),
        )

    def _ready_action(self, trusted_plan: AssemblyPlan):
        action_plan = plan_render_worker_actions(
            trusted_plan,
            self._pending_manifest(trusted_plan),
            completed_dependency_ids={
                "rank_instagram_storylines",
                "grade_asset_00000",
                "grade_asset_00001",
            },
            renderer_adapter="dry-run-local",
        )
        return action_plan.actions[0]

    def _trusted_plan(self) -> AssemblyPlan:
        return AssemblyPlan(
            shoot_slug="adapter-contract",
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
            ),
        )


if __name__ == "__main__":
    unittest.main()
