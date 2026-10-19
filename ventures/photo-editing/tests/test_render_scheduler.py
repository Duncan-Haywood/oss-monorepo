import json
from pathlib import Path
import tempfile
import unittest

from shootflow.assembly import AssemblyPlan, RenderTask
from shootflow.render_scheduler import (
    DryRunRenderSchedulerError,
    DryRunRenderSchedulerReport,
    DryRunRenderSchedulerResult,
    load_dry_run_render_scheduler_report,
    run_dry_run_render_scheduler,
    write_dry_run_render_scheduler_report,
)
from shootflow.render_status import (
    RenderStatusManifest,
    RenderTaskStatus,
    load_render_status_manifest,
    render_plan_fingerprint,
    write_render_status_manifest,
)
from shootflow.workflow_authority import observe_only_workflow_authority_to_dict


class DryRunRenderSchedulerTests(unittest.TestCase):
    def test_scheduler_runs_ready_batches_until_no_work_remains(self) -> None:
        trusted_plan = self._batch_trusted_plan()
        initial_manifest = self._pending_manifest(trusted_plan)

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_render_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_render_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                completed_dependency_ids={
                    "rank_instagram_storylines",
                    "grade_asset_00000",
                    "grade_asset_00001",
                },
                renderer_adapter="dry-run-local",
                started_at="2026-05-07T15:00:00Z",
                completed_at="2026-05-07T15:00:05Z",
                max_concurrency=2,
                max_iterations=5,
            )
            loaded_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertIsInstance(result, DryRunRenderSchedulerResult)
        self.assertEqual(result.stopped_reason, "complete")
        self.assertEqual(
            result.completed_task_ids,
            ("render_instagram_reel", "export_instagram_photo_set_part_00001"),
        )
        self.assertEqual(result.retryable_task_ids, ())
        self.assertEqual(result.blocked_task_ids, ())
        batch_iterations = [iteration for iteration in result.iterations if iteration.batch_result is not None]
        self.assertEqual(len(batch_iterations), 1)
        self.assertEqual(
            [action_result.task_id for action_result in batch_iterations[0].batch_result.results],
            ["render_instagram_reel", "export_instagram_photo_set_part_00001"],
        )
        self.assertEqual([status.state for status in loaded_manifest.task_statuses], ["succeeded", "succeeded"])

    def test_scheduler_expires_stale_leases_before_planning_ready_actions(self) -> None:
        trusted_plan = self._single_task_plan()
        stale_running_manifest = RenderStatusManifest(
            shoot_slug=trusted_plan.shoot_slug,
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
            task_statuses=(
                RenderTaskStatus(
                    task_id="render_instagram_reel",
                    state="running",
                    renderer_adapter="dry-run-local",
                    attempts=1,
                    updated_at="2026-05-07T14:00:00Z",
                ),
            ),
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_render_status_manifest(stale_running_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_render_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                completed_dependency_ids={"rank_instagram_storylines", "grade_asset_00000"},
                renderer_adapter="dry-run-local",
                started_at="2026-05-07T15:01:00Z",
                completed_at="2026-05-07T15:01:05Z",
                max_concurrency=1,
                max_iterations=3,
                stale_before="2026-05-07T14:30:00Z",
                lease_updated_at="2026-05-07T15:00:30Z",
            )
            loaded_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(result.stopped_reason, "complete")
        self.assertEqual(result.iterations[0].expired_lease_task_ids, ("render_instagram_reel",))
        self.assertEqual(result.iterations[0].conflicted_lease_task_ids, ())
        self.assertEqual(result.completed_task_ids, ("render_instagram_reel",))
        self.assertEqual(loaded_manifest.task_statuses[0].state, "succeeded")
        self.assertEqual(loaded_manifest.task_statuses[0].attempts, 2)

    def test_scheduler_reports_terminal_state_after_final_allowed_iteration(self) -> None:
        trusted_plan = self._single_task_plan()
        initial_manifest = self._pending_manifest(trusted_plan)

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_render_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_render_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                completed_dependency_ids={"rank_instagram_storylines", "grade_asset_00000"},
                renderer_adapter="dry-run-local",
                started_at="2026-05-07T15:01:30Z",
                completed_at="2026-05-07T15:01:35Z",
                max_concurrency=1,
                max_iterations=1,
            )

        self.assertEqual(result.stopped_reason, "complete")
        self.assertEqual(result.completed_task_ids, ("render_instagram_reel",))

    def test_scheduler_does_not_hammer_retryable_task_in_same_run(self) -> None:
        trusted_plan = self._single_task_plan()
        initial_manifest = self._pending_manifest(trusted_plan)

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            output_path = workspace / "deliverables" / "instagram_reel.mp4"
            output_path.parent.mkdir(parents=True)
            output_path.write_bytes(b"manual editor export")
            write_render_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_render_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                completed_dependency_ids={"rank_instagram_storylines", "grade_asset_00000"},
                renderer_adapter="dry-run-local",
                started_at="2026-05-07T15:02:00Z",
                completed_at="2026-05-07T15:02:05Z",
                max_concurrency=1,
                max_iterations=5,
            )
            loaded_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)
            preserved_bytes = output_path.read_bytes()

        self.assertEqual(result.stopped_reason, "retryable")
        self.assertEqual(result.completed_task_ids, ())
        self.assertEqual(result.retryable_task_ids, ("render_instagram_reel",))
        self.assertEqual(result.iterations[-1].skipped_retryable_task_ids, ("render_instagram_reel",))
        self.assertEqual(result.iterations[0].attempted_task_ids, ("render_instagram_reel",))
        self.assertEqual(loaded_manifest.task_statuses[0].state, "retryable")
        self.assertEqual(loaded_manifest.task_statuses[0].attempts, 1)
        self.assertEqual(preserved_bytes, b"manual editor export")

    def test_scheduler_prioritizes_failed_stop_reason_over_retryable_work(self) -> None:
        trusted_plan = self._mixed_terminal_plan()
        initial_manifest = RenderStatusManifest(
            shoot_slug=trusted_plan.shoot_slug,
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
            task_statuses=(
                RenderTaskStatus(task_id="render_instagram_reel", state="pending"),
                RenderTaskStatus(
                    task_id="export_instagram_photo_set_part_00001",
                    state="failed",
                    renderer_adapter="dry-run-local",
                    attempts=1,
                    error_message="Reviewer rejected the photo export.",
                    updated_at="2026-05-07T15:02:30Z",
                ),
            ),
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            output_path = workspace / "deliverables" / "instagram_reel.mp4"
            output_path.parent.mkdir(parents=True)
            output_path.write_bytes(b"manual editor export")
            write_render_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_render_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                completed_dependency_ids={"rank_instagram_storylines", "grade_asset_00000", "grade_asset_00001"},
                renderer_adapter="dry-run-local",
                started_at="2026-05-07T15:02:40Z",
                completed_at="2026-05-07T15:02:45Z",
                max_concurrency=1,
                max_iterations=5,
            )

        self.assertEqual(result.stopped_reason, "failed")
        self.assertEqual(result.retryable_task_ids, ("render_instagram_reel",))
        self.assertEqual(result.failed_task_ids, ("export_instagram_photo_set_part_00001",))

    def test_scheduler_rejects_invalid_adapter_before_expiring_stale_leases(self) -> None:
        trusted_plan = self._single_task_plan()
        stale_running_manifest = RenderStatusManifest(
            shoot_slug=trusted_plan.shoot_slug,
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
            task_statuses=(
                RenderTaskStatus(
                    task_id="render_instagram_reel",
                    state="running",
                    renderer_adapter="dry-run-local",
                    attempts=1,
                    updated_at="2026-05-07T14:00:00Z",
                ),
            ),
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_render_status_manifest(stale_running_manifest, workspace, trusted_plan=trusted_plan)

            with self.assertRaisesRegex(DryRunRenderSchedulerError, "renderer_adapter"):
                run_dry_run_render_scheduler(
                    workspace,
                    trusted_plan=trusted_plan,
                    completed_dependency_ids={"rank_instagram_storylines", "grade_asset_00000"},
                    renderer_adapter="bad adapter",
                    started_at="2026-05-07T15:02:50Z",
                    completed_at="2026-05-07T15:02:55Z",
                    max_concurrency=1,
                    max_iterations=3,
                    stale_before="2026-05-07T14:30:00Z",
                    lease_updated_at="2026-05-07T15:02:45Z",
                )
            loaded_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(loaded_manifest, stale_running_manifest)

    def test_scheduler_rejects_unsupported_adapter_before_writing_status(self) -> None:
        trusted_plan = self._single_task_plan()
        initial_manifest = self._pending_manifest(trusted_plan)

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_render_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            with self.assertRaisesRegex(DryRunRenderSchedulerError, "Unsupported renderer adapter"):
                run_dry_run_render_scheduler(
                    workspace,
                    trusted_plan=trusted_plan,
                    completed_dependency_ids={"rank_instagram_storylines", "grade_asset_00000"},
                    renderer_adapter="resolve-local",
                    started_at="2026-05-07T15:02:52Z",
                    completed_at="2026-05-07T15:02:57Z",
                    max_concurrency=1,
                    max_iterations=3,
                )
            loaded_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(loaded_manifest, initial_manifest)

    def test_scheduler_rejects_string_completed_dependency_ids(self) -> None:
        trusted_plan = self._single_task_plan()

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_render_status_manifest(self._pending_manifest(trusted_plan), workspace, trusted_plan=trusted_plan)

            with self.assertRaisesRegex(DryRunRenderSchedulerError, "completed_dependency_ids"):
                run_dry_run_render_scheduler(
                    workspace,
                    trusted_plan=trusted_plan,
                    completed_dependency_ids="rank_instagram_storylines",
                    renderer_adapter="dry-run-local",
                    started_at="2026-05-07T15:02:56Z",
                    completed_at="2026-05-07T15:02:57Z",
                    max_concurrency=1,
                    max_iterations=1,
                )

    def test_scheduler_reports_failed_status_without_calling_it_complete(self) -> None:
        trusted_plan = self._single_task_plan()
        failed_manifest = RenderStatusManifest(
            shoot_slug=trusted_plan.shoot_slug,
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
            task_statuses=(
                RenderTaskStatus(
                    task_id="render_instagram_reel",
                    state="failed",
                    renderer_adapter="dry-run-local",
                    attempts=2,
                    error_message="User marked render as failed after review.",
                    updated_at="2026-05-07T15:03:00Z",
                ),
            ),
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_render_status_manifest(failed_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_render_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                completed_dependency_ids=(dependency for dependency in ("rank_instagram_storylines", "grade_asset_00000")),
                renderer_adapter="dry-run-local",
                started_at="2026-05-07T15:03:30Z",
                completed_at="2026-05-07T15:03:35Z",
                max_concurrency=1,
                max_iterations=2,
            )

        self.assertEqual(result.stopped_reason, "failed")
        self.assertEqual(result.failed_task_ids, ("render_instagram_reel",))
        self.assertEqual(result.completed_task_ids, ())

    def test_scheduler_report_persists_actionable_summary_for_ui_and_agents(self) -> None:
        trusted_plan = self._batch_trusted_plan()
        initial_manifest = self._pending_manifest(trusted_plan)

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_render_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_render_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                completed_dependency_ids={
                    "rank_instagram_storylines",
                    "grade_asset_00000",
                    "grade_asset_00001",
                },
                renderer_adapter="dry-run-local",
                started_at="2026-05-07T15:04:00Z",
                completed_at="2026-05-07T15:04:05Z",
                max_concurrency=2,
                max_iterations=3,
            )
            final_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)
            report_path = write_dry_run_render_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-07T15:04:06Z",
            )
            raw_report = json.loads(report_path.read_text(encoding="utf-8"))
            loaded_report = load_dry_run_render_scheduler_report(
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
            )

        self.assertEqual(report_path, Path(tmpdir) / "deliverables" / "render_scheduler_report.json")
        self.assertEqual(raw_report["schema_version"], 3)
        self.assertEqual(raw_report["workflow_authority"], observe_only_workflow_authority_to_dict())
        self.assertIsInstance(loaded_report, DryRunRenderSchedulerReport)
        self.assertEqual(
            loaded_report.workflow_authority,
            observe_only_workflow_authority_to_dict(),
        )
        self.assertEqual(loaded_report.stopped_reason, "complete")
        self.assertEqual(loaded_report.total_task_count, 2)
        self.assertEqual(loaded_report.completed_task_ids, result.completed_task_ids)
        self.assertEqual(
            loaded_report.outputs_materialized,
            (
                "deliverables/instagram_reel.mp4",
                "deliverables/instagram_photo_set/photo_00001.jpg",
            ),
        )
        self.assertEqual(loaded_report.review_required_task_ids, ())
        self.assertEqual(loaded_report.failure_messages, ())
        self.assertEqual(
            raw_report["product_metrics"],
            {
                "attempted_task_count": 2,
                "blocked_task_count": 0,
                "completed_task_count": 2,
                "conflicted_lease_task_count": 0,
                "expired_lease_task_count": 0,
                "failed_task_count": 0,
                "failure_message_count": 0,
                "iteration_count": 2,
                "materialized_output_count": 2,
                "retryable_task_count": 0,
                "review_required_task_count": 0,
                "skipped_retryable_task_count": 0,
                "total_task_count": 2,
            },
        )
        self.assertEqual(loaded_report.product_metrics["completed_task_count"], 2)
        with self.assertRaises(TypeError):
            loaded_report.product_metrics["completed_task_count"] = 0

    def test_scheduler_report_marks_retryable_tasks_for_review_without_overwriting_outputs(self) -> None:
        trusted_plan = self._single_task_plan()
        initial_manifest = self._pending_manifest(trusted_plan)

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            output_path = workspace / "deliverables" / "instagram_reel.mp4"
            output_path.parent.mkdir(parents=True)
            output_path.write_bytes(b"manual editor export")
            write_render_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_render_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                completed_dependency_ids={"rank_instagram_storylines", "grade_asset_00000"},
                renderer_adapter="dry-run-local",
                started_at="2026-05-07T15:05:00Z",
                completed_at="2026-05-07T15:05:05Z",
                max_concurrency=1,
                max_iterations=3,
            )
            final_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)
            write_dry_run_render_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-07T15:05:06Z",
            )
            loaded_report = load_dry_run_render_scheduler_report(
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
            )
            preserved_bytes = output_path.read_bytes()

        self.assertEqual(loaded_report.stopped_reason, "retryable")
        self.assertEqual(loaded_report.review_required_task_ids, ("render_instagram_reel",))
        self.assertEqual(loaded_report.outputs_materialized, ())
        self.assertEqual(loaded_report.failure_messages[0].task_id, "render_instagram_reel")
        self.assertIn("Refusing to overwrite", loaded_report.failure_messages[0].message)
        self.assertEqual(preserved_bytes, b"manual editor export")

    def test_scheduler_report_rejects_stale_render_plan_fingerprint(self) -> None:
        trusted_plan = self._single_task_plan()
        initial_manifest = self._pending_manifest(trusted_plan)

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_render_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_render_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                completed_dependency_ids={"rank_instagram_storylines", "grade_asset_00000"},
                renderer_adapter="dry-run-local",
                started_at="2026-05-07T15:06:00Z",
                completed_at="2026-05-07T15:06:05Z",
                max_concurrency=1,
                max_iterations=1,
            )
            final_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)
            report_path = write_dry_run_render_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-07T15:06:06Z",
            )
            raw_report = json.loads(report_path.read_text(encoding="utf-8"))
            raw_report["render_plan_fingerprint"] = "0" * 64
            report_path.write_text(json.dumps(raw_report), encoding="utf-8")

            with self.assertRaisesRegex(DryRunRenderSchedulerError, "fingerprint"):
                load_dry_run_render_scheduler_report(
                    workspace,
                    trusted_plan=trusted_plan,
                    final_manifest=final_manifest,
                )

    def test_scheduler_report_rejects_forged_known_task_review_state(self) -> None:
        trusted_plan = self._single_task_plan()
        initial_manifest = self._pending_manifest(trusted_plan)

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_render_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_render_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                completed_dependency_ids={"rank_instagram_storylines", "grade_asset_00000"},
                renderer_adapter="dry-run-local",
                started_at="2026-05-07T15:07:00Z",
                completed_at="2026-05-07T15:07:05Z",
                max_concurrency=1,
                max_iterations=1,
            )
            final_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)
            report_path = write_dry_run_render_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-07T15:07:06Z",
            )
            raw_report = json.loads(report_path.read_text(encoding="utf-8"))
            raw_report["blocked_task_ids"] = ["render_instagram_reel"]
            raw_report["review_required_task_ids"] = ["render_instagram_reel"]
            report_path.write_text(json.dumps(raw_report), encoding="utf-8")

            with self.assertRaisesRegex(DryRunRenderSchedulerError, "blocked"):
                load_dry_run_render_scheduler_report(
                    workspace,
                    trusted_plan=trusted_plan,
                    final_manifest=final_manifest,
                )

    def test_scheduler_report_rejects_forged_product_metrics(self) -> None:
        trusted_plan = self._single_task_plan()
        initial_manifest = self._pending_manifest(trusted_plan)

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_render_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_render_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                completed_dependency_ids={"rank_instagram_storylines", "grade_asset_00000"},
                renderer_adapter="dry-run-local",
                started_at="2026-05-07T15:07:30Z",
                completed_at="2026-05-07T15:07:35Z",
                max_concurrency=1,
                max_iterations=1,
            )
            final_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)
            report_path = write_dry_run_render_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-07T15:07:36Z",
            )
            raw_report = json.loads(report_path.read_text(encoding="utf-8"))
            raw_report["product_metrics"]["completed_task_count"] = 0
            report_path.write_text(json.dumps(raw_report), encoding="utf-8")

            with self.assertRaisesRegex(DryRunRenderSchedulerError, "product_metrics"):
                load_dry_run_render_scheduler_report(
                    workspace,
                    trusted_plan=trusted_plan,
                    final_manifest=final_manifest,
                )

    def test_scheduler_report_rejects_duplicate_metric_source_ids(self) -> None:
        trusted_plan = self._single_task_plan()
        initial_manifest = self._pending_manifest(trusted_plan)

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_render_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_render_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                completed_dependency_ids={"rank_instagram_storylines", "grade_asset_00000"},
                renderer_adapter="dry-run-local",
                started_at="2026-05-07T15:07:40Z",
                completed_at="2026-05-07T15:07:45Z",
                max_concurrency=1,
                max_iterations=1,
            )
            final_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)
            report_path = write_dry_run_render_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-07T15:07:46Z",
            )
            raw_report = json.loads(report_path.read_text(encoding="utf-8"))
            raw_report["completed_task_ids"].append("render_instagram_reel")
            raw_report["product_metrics"]["completed_task_count"] = 2
            report_path.write_text(json.dumps(raw_report), encoding="utf-8")

            with self.assertRaisesRegex(DryRunRenderSchedulerError, "duplicate"):
                load_dry_run_render_scheduler_report(
                    workspace,
                    trusted_plan=trusted_plan,
                    final_manifest=final_manifest,
                )

    def test_scheduler_report_rejects_duplicate_failure_metric_sources(self) -> None:
        trusted_plan = self._single_task_plan()
        initial_manifest = self._pending_manifest(trusted_plan)

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            output_path = workspace / "deliverables" / "instagram_reel.mp4"
            output_path.parent.mkdir(parents=True)
            output_path.write_bytes(b"manual editor export")
            write_render_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_render_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                completed_dependency_ids={"rank_instagram_storylines", "grade_asset_00000"},
                renderer_adapter="dry-run-local",
                started_at="2026-05-07T15:07:47Z",
                completed_at="2026-05-07T15:07:48Z",
                max_concurrency=1,
                max_iterations=3,
            )
            final_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)
            report_path = write_dry_run_render_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-07T15:07:49Z",
            )
            raw_report = json.loads(report_path.read_text(encoding="utf-8"))
            raw_report["failure_messages"].append(raw_report["failure_messages"][0])
            raw_report["product_metrics"]["failure_message_count"] = 2
            report_path.write_text(json.dumps(raw_report), encoding="utf-8")

            with self.assertRaisesRegex(DryRunRenderSchedulerError, "duplicate"):
                load_dry_run_render_scheduler_report(
                    workspace,
                    trusted_plan=trusted_plan,
                    final_manifest=final_manifest,
                )

    def test_scheduler_report_rejects_extra_failure_metric_source_for_same_task(self) -> None:
        trusted_plan = self._single_task_plan()
        initial_manifest = self._pending_manifest(trusted_plan)

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            output_path = workspace / "deliverables" / "instagram_reel.mp4"
            output_path.parent.mkdir(parents=True)
            output_path.write_bytes(b"manual editor export")
            write_render_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_render_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                completed_dependency_ids={"rank_instagram_storylines", "grade_asset_00000"},
                renderer_adapter="dry-run-local",
                started_at="2026-05-07T15:07:51Z",
                completed_at="2026-05-07T15:07:52Z",
                max_concurrency=1,
                max_iterations=3,
            )
            final_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)
            report_path = write_dry_run_render_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-07T15:07:53Z",
            )
            raw_report = json.loads(report_path.read_text(encoding="utf-8"))
            raw_report["failure_messages"].append(
                {"task_id": "render_instagram_reel", "message": "forged second failure"}
            )
            raw_report["product_metrics"]["failure_message_count"] = 2
            report_path.write_text(json.dumps(raw_report), encoding="utf-8")

            with self.assertRaisesRegex(DryRunRenderSchedulerError, "duplicate"):
                load_dry_run_render_scheduler_report(
                    workspace,
                    trusted_plan=trusted_plan,
                    final_manifest=final_manifest,
                )

    def test_schema_v1_scheduler_report_loads_with_derived_metrics(self) -> None:
        trusted_plan = self._single_task_plan()
        initial_manifest = self._pending_manifest(trusted_plan)

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_render_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_render_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                completed_dependency_ids={"rank_instagram_storylines", "grade_asset_00000"},
                renderer_adapter="dry-run-local",
                started_at="2026-05-07T15:07:50Z",
                completed_at="2026-05-07T15:07:55Z",
                max_concurrency=1,
                max_iterations=1,
            )
            final_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)
            report_path = write_dry_run_render_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-07T15:07:56Z",
            )
            raw_report = json.loads(report_path.read_text(encoding="utf-8"))
            raw_report["schema_version"] = 1
            del raw_report["product_metrics"]
            raw_report.pop("workflow_authority", None)
            report_path.write_text(json.dumps(raw_report), encoding="utf-8")

            loaded_report = load_dry_run_render_scheduler_report(
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
            )

        self.assertEqual(loaded_report.product_metrics["completed_task_count"], 1)
        self.assertEqual(
            loaded_report.workflow_authority,
            observe_only_workflow_authority_to_dict(),
        )

    def test_schema_v2_scheduler_report_loads_with_observe_only_authority(self) -> None:
        trusted_plan = self._single_task_plan()
        initial_manifest = self._pending_manifest(trusted_plan)

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_render_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_render_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                completed_dependency_ids={"rank_instagram_storylines", "grade_asset_00000"},
                renderer_adapter="dry-run-local",
                started_at="2026-05-07T15:08:10Z",
                completed_at="2026-05-07T15:08:15Z",
                max_concurrency=1,
                max_iterations=1,
            )
            final_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)
            report_path = write_dry_run_render_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-07T15:08:16Z",
            )
            raw_report = json.loads(report_path.read_text(encoding="utf-8"))
            raw_report["schema_version"] = 2
            raw_report.pop("workflow_authority", None)
            report_path.write_text(json.dumps(raw_report), encoding="utf-8")

            loaded_report = load_dry_run_render_scheduler_report(
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
            )

        self.assertEqual(loaded_report.product_metrics["completed_task_count"], 1)
        self.assertEqual(
            loaded_report.workflow_authority,
            observe_only_workflow_authority_to_dict(),
        )

    def test_schema_v3_scheduler_report_rejects_missing_workflow_authority(self) -> None:
        trusted_plan = self._single_task_plan()
        initial_manifest = self._pending_manifest(trusted_plan)

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_render_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_render_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                completed_dependency_ids={"rank_instagram_storylines", "grade_asset_00000"},
                renderer_adapter="dry-run-local",
                started_at="2026-05-07T15:07:56Z",
                completed_at="2026-05-07T15:07:57Z",
                max_concurrency=1,
                max_iterations=1,
            )
            final_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)
            report_path = write_dry_run_render_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-07T15:07:58Z",
            )
            raw_report = json.loads(report_path.read_text(encoding="utf-8"))
            raw_report.pop("workflow_authority", None)
            report_path.write_text(json.dumps(raw_report), encoding="utf-8")

            with self.assertRaisesRegex(DryRunRenderSchedulerError, "workflow_authority"):
                load_dry_run_render_scheduler_report(
                    workspace,
                    trusted_plan=trusted_plan,
                    final_manifest=final_manifest,
                )

    def test_scheduler_report_rejects_authorizing_workflow_authority(self) -> None:
        trusted_plan = self._single_task_plan()
        initial_manifest = self._pending_manifest(trusted_plan)

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_render_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_render_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                completed_dependency_ids={"rank_instagram_storylines", "grade_asset_00000"},
                renderer_adapter="dry-run-local",
                started_at="2026-05-07T15:07:57Z",
                completed_at="2026-05-07T15:07:58Z",
                max_concurrency=1,
                max_iterations=1,
            )
            final_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)
            report_path = write_dry_run_render_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-07T15:07:59Z",
            )
            raw_report = json.loads(report_path.read_text(encoding="utf-8"))
            raw_report["workflow_authority"]["permits_retry"] = True
            report_path.write_text(json.dumps(raw_report), encoding="utf-8")

            with self.assertRaisesRegex(
                DryRunRenderSchedulerError,
                "workflow_authority.permits_retry must be False",
            ):
                load_dry_run_render_scheduler_report(
                    workspace,
                    trusted_plan=trusted_plan,
                    final_manifest=final_manifest,
                )

    def test_scheduler_report_rejects_forged_complete_stop_for_retryable_status(self) -> None:
        trusted_plan = self._single_task_plan()
        initial_manifest = self._pending_manifest(trusted_plan)

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            output_path = workspace / "deliverables" / "instagram_reel.mp4"
            output_path.parent.mkdir(parents=True)
            output_path.write_bytes(b"manual editor export")
            write_render_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_render_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                completed_dependency_ids={"rank_instagram_storylines", "grade_asset_00000"},
                renderer_adapter="dry-run-local",
                started_at="2026-05-07T15:08:00Z",
                completed_at="2026-05-07T15:08:05Z",
                max_concurrency=1,
                max_iterations=3,
            )
            final_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)
            report_path = write_dry_run_render_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-07T15:08:06Z",
            )
            raw_report = json.loads(report_path.read_text(encoding="utf-8"))
            raw_report["stopped_reason"] = "complete"
            raw_report["failure_messages"] = [
                {"task_id": "render_instagram_reel", "message": "forged succeeded-task warning"}
            ]
            report_path.write_text(json.dumps(raw_report), encoding="utf-8")

            with self.assertRaisesRegex(DryRunRenderSchedulerError, "stopped_reason"):
                load_dry_run_render_scheduler_report(
                    workspace,
                    trusted_plan=trusted_plan,
                    final_manifest=final_manifest,
                )

    def test_scheduler_report_accepts_empty_complete_plan(self) -> None:
        trusted_plan = AssemblyPlan(shoot_slug="empty-scheduler-plan", render_tasks=())
        initial_manifest = self._pending_manifest(trusted_plan)

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_render_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_render_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                completed_dependency_ids=(),
                renderer_adapter="dry-run-local",
                started_at="2026-05-07T15:09:00Z",
                completed_at="2026-05-07T15:09:05Z",
                max_concurrency=1,
                max_iterations=1,
            )
            final_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)
            write_dry_run_render_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-07T15:09:06Z",
            )
            loaded_report = load_dry_run_render_scheduler_report(
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
            )

        self.assertEqual(loaded_report.stopped_reason, "complete")
        self.assertEqual(loaded_report.total_task_count, 0)
        self.assertEqual(loaded_report.review_required_task_ids, ())

    def _pending_manifest(self, trusted_plan: AssemblyPlan) -> RenderStatusManifest:
        return RenderStatusManifest(
            shoot_slug=trusted_plan.shoot_slug,
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
            task_statuses=tuple(
                RenderTaskStatus(task_id=task.task_id, state="pending")
                for task in trusted_plan.render_tasks
            ),
        )

    def _single_task_plan(self) -> AssemblyPlan:
        return AssemblyPlan(
            shoot_slug="scheduler-contract",
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
            ),
        )

    def _mixed_terminal_plan(self) -> AssemblyPlan:
        return AssemblyPlan(
            shoot_slug="scheduler-mixed-terminal",
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
                    task_id="export_instagram_photo_set_part_00001",
                    sequence_name="photo_set",
                    source_job_id="export_instagram_photo_set",
                    output_kind="instagram_photo_set",
                    aspect_ratio="4:5",
                    inputs=(
                        "analysis/instagram_storylines.json",
                        "graded/grade_asset_00001/IMG_0001.CR3",
                    ),
                    outputs=("deliverables/instagram_photo_set/photo_00001.jpg",),
                    depends_on=("rank_instagram_storylines", "grade_asset_00001"),
                    can_run_in_parallel=True,
                ),
            ),
        )

    def _batch_trusted_plan(self) -> AssemblyPlan:
        return AssemblyPlan(
            shoot_slug="scheduler-batch",
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
                    task_id="export_instagram_photo_set_part_00001",
                    sequence_name="photo_set",
                    source_job_id="export_instagram_photo_set",
                    output_kind="instagram_photo_set",
                    aspect_ratio="4:5",
                    inputs=(
                        "analysis/instagram_storylines.json",
                        "graded/grade_asset_00001/IMG_0001.CR3",
                    ),
                    outputs=("deliverables/instagram_photo_set/photo_00001.jpg",),
                    depends_on=("rank_instagram_storylines", "grade_asset_00001"),
                    can_run_in_parallel=True,
                ),
            ),
        )


if __name__ == "__main__":
    unittest.main()
