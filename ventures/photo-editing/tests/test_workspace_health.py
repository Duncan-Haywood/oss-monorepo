import io
import json
from pathlib import Path
import tempfile
import unittest

from shootflow.cli import main
from shootflow.catalog import load_ingest_manifest, production_assets_from_manifest
from shootflow.demo_workspace import (
    create_card_dump_cli_demo_workspace,
    create_persisted_cli_demo_workspace,
)
from shootflow.production import build_production_plan
from shootflow.production_scheduler import (
    run_dry_run_production_scheduler,
    write_dry_run_production_scheduler_report,
)
from shootflow.production_status import (
    ProductionJobStatus,
    ProductionStatusManifest,
    initialize_production_status_manifest,
    load_production_status_manifest,
    production_plan_fingerprint,
    write_production_status_manifest,
)
from shootflow.render_scheduler import (
    run_dry_run_render_scheduler,
    write_dry_run_render_scheduler_report,
)
from shootflow.render_status import initialize_render_status_manifest, load_render_status_manifest
from shootflow.workspace_health import build_workspace_health_summary, workspace_health_summary_to_dict


class WorkspaceHealthTests(unittest.TestCase):
    def test_workspace_health_json_exposes_observe_only_workflow_authority(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            create_persisted_cli_demo_workspace(workspace)

            payload = workspace_health_summary_to_dict(build_workspace_health_summary(workspace))

        self.assertEqual(payload["schema_version"], 4)
        self.assertEqual(
            payload["workflow_authority"],
            {
                "mode": "observe_only",
                "handoff_kind": "presentation_only",
                "permits_file_mutation": False,
                "permits_copy": False,
                "permits_retry": False,
                "permits_cleanup": False,
                "permits_overwrite": False,
                "permits_materialization": False,
                "permits_deletion": False,
            },
        )

    def test_task_manifest_without_status_points_to_status_initialization(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            demo = create_persisted_cli_demo_workspace(workspace)

            summary = build_workspace_health_summary(workspace)

        self.assertTrue(summary.render_tasks.exists)
        self.assertTrue(summary.render_tasks.valid)
        self.assertFalse(summary.render_status.exists)
        self.assertFalse(summary.render_status.valid)
        self.assertEqual(summary.shoot_slug, "cli-demo-shoot")
        self.assertEqual(summary.task_count, 4)
        self.assertEqual(summary.next_action.name, "init_render_status")
        self.assertEqual(
            (summary.next_action.command[0], summary.next_action.command[1], Path(summary.next_action.command[2]).resolve()),
            ("init-render-status", "--workspace", demo.workspace_root.resolve()),
        )
        self.assertTrue(summary.next_action.writes_files)

    def test_render_input_fingerprint_changes_when_trusted_inputs_change(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            create_persisted_cli_demo_workspace(workspace)

            initial_summary = build_workspace_health_summary(workspace)
            (workspace / "graded" / "grade_asset_00000" / "A001.MOV").write_bytes(
                b"updated graded hero video\n"
            )
            updated_summary = build_workspace_health_summary(workspace)
            (workspace / "analysis" / "instagram_storylines.json").write_bytes(
                b'{"demo":true,"note":"updated storyline"}\n'
            )
            storyline_summary = build_workspace_health_summary(workspace)

        self.assertEqual(initial_summary.render_input_count, 5)
        self.assertIsNotNone(initial_summary.render_inputs_fingerprint)
        self.assertEqual(len(initial_summary.render_inputs_fingerprint or ""), 64)
        self.assertNotEqual(
            updated_summary.render_inputs_fingerprint,
            initial_summary.render_inputs_fingerprint,
        )
        self.assertNotEqual(
            storyline_summary.render_inputs_fingerprint,
            updated_summary.render_inputs_fingerprint,
        )

    def test_unreadable_render_input_is_reported_for_review(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            create_persisted_cli_demo_workspace(workspace)
            input_path = workspace / "graded" / "grade_asset_00000" / "A001.MOV"
            input_path.chmod(0)
            try:
                summary = build_workspace_health_summary(workspace)
            finally:
                input_path.chmod(0o600)

        self.assertTrue(summary.render_tasks.exists)
        self.assertFalse(summary.render_tasks.valid)
        self.assertIn("render input", summary.render_tasks.error_message or "")
        self.assertEqual(summary.next_action.name, "review_invalid_render_tasks")

    def test_pending_status_points_to_scheduler_without_writing_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            demo = create_persisted_cli_demo_workspace(workspace)
            initialize_render_status_manifest(workspace, trusted_plan=demo.trusted_plan)
            status_before = (workspace / "deliverables" / "render_status.json").read_text(
                encoding="utf-8"
            )

            summary = build_workspace_health_summary(workspace)
            status_after = (workspace / "deliverables" / "render_status.json").read_text(
                encoding="utf-8"
            )

        self.assertTrue(summary.render_status.exists)
        self.assertTrue(summary.render_status.valid)
        self.assertEqual(summary.status_counts.pending, 4)
        self.assertEqual(summary.status_counts.succeeded, 0)
        self.assertEqual(summary.next_action.name, "run_dry_run_render_scheduler")
        self.assertEqual(
            summary.next_action.command,
            (
                "dry-run-render-scheduler",
                "--workspace",
                str(workspace.resolve()),
                "--completed-dependency",
                "rank_instagram_storylines",
                "--completed-dependency",
                "grade_asset_00000",
                "--completed-dependency",
                "grade_asset_00002",
                "--completed-dependency",
                "grade_asset_00001",
                "--completed-dependency",
                "grade_asset_00003",
            ),
        )
        self.assertEqual(
            summary.next_action.requires_runtime_args,
            ("--renderer", "--started-at", "--completed-at", "--generated-at"),
        )
        self.assertEqual(status_after, status_before)

    def test_invalid_status_is_reported_for_review_without_resetting_progress(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            create_persisted_cli_demo_workspace(workspace)
            status_path = workspace / "deliverables" / "render_status.json"
            status_path.write_text('{"schema_version":1,"task_statuses":[]}\n', encoding="utf-8")
            status_before = status_path.read_text(encoding="utf-8")

            summary = build_workspace_health_summary(workspace)
            payload = workspace_health_summary_to_dict(summary)
            status_after = status_path.read_text(encoding="utf-8")

        self.assertTrue(summary.render_tasks.valid)
        self.assertTrue(summary.render_status.exists)
        self.assertFalse(summary.render_status.valid)
        self.assertIn("render status", summary.render_status.error_message or "")
        self.assertIsNone(payload["render_scheduler_product_metrics"])
        self.assertEqual(summary.next_action.name, "review_invalid_render_status")
        self.assertFalse(summary.next_action.writes_files)
        self.assertEqual(status_after, status_before)

    def test_valid_retryable_scheduler_report_points_to_review_not_rerun(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            demo = create_persisted_cli_demo_workspace(workspace)
            initialize_render_status_manifest(workspace, trusted_plan=demo.trusted_plan)
            output_path = workspace / "deliverables" / "instagram_reel.mp4"
            output_path.write_bytes(b"manual editor export")

            result = run_dry_run_render_scheduler(
                workspace,
                trusted_plan=demo.trusted_plan,
                completed_dependency_ids=demo.required_completed_dependency_ids,
                renderer_adapter="dry-run-local",
                started_at="2026-05-08T23:40:00Z",
                completed_at="2026-05-08T23:40:05Z",
                max_concurrency=3,
                max_iterations=4,
            )
            final_manifest = load_render_status_manifest(workspace, trusted_plan=demo.trusted_plan)
            write_dry_run_render_scheduler_report(
                result,
                workspace,
                trusted_plan=demo.trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-08T23:40:06Z",
            )

            summary = build_workspace_health_summary(workspace)
            payload = workspace_health_summary_to_dict(summary)

        self.assertTrue(summary.scheduler_report.exists)
        self.assertTrue(summary.scheduler_report.valid)
        self.assertEqual(summary.status_counts.retryable, 1)
        self.assertEqual(
            payload["render_scheduler_product_metrics"]["retryable_task_count"],
            1,
        )
        self.assertEqual(
            payload["render_scheduler_product_metrics"]["total_task_count"],
            summary.task_count,
        )
        self.assertEqual(summary.next_action.name, "review_scheduler_report")
        self.assertFalse(summary.next_action.writes_files)

    def test_ingested_workspace_points_to_production_status_initialization(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            demo = create_card_dump_cli_demo_workspace(root)

            summary = build_workspace_health_summary(demo.shoot_folder)

        self.assertTrue(summary.production_plan_exists)
        self.assertFalse(summary.production_status.exists)
        self.assertFalse(summary.production_scheduler_report.exists)
        self.assertGreater(summary.production_job_count, 0)
        self.assertEqual(summary.production_status_counts.pending, 0)
        self.assertEqual(summary.next_action.name, "init_production_status")
        self.assertEqual(
            summary.next_action.command,
            (
                "init-production-status",
                "--ingest-manifest",
                str((demo.shoot_folder / "ingest_manifest.json").resolve()),
            ),
        )
        self.assertTrue(summary.next_action.writes_files)

    def test_pending_production_status_points_to_production_scheduler(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            demo = create_card_dump_cli_demo_workspace(root)
            trusted_plan = self._production_plan_from_workspace(demo.shoot_folder)
            initialize_production_status_manifest(demo.shoot_folder, trusted_plan=trusted_plan)
            status_before = (demo.shoot_folder / "production_status.json").read_text(
                encoding="utf-8"
            )

            summary = build_workspace_health_summary(demo.shoot_folder)
            status_after = (demo.shoot_folder / "production_status.json").read_text(
                encoding="utf-8"
            )

        self.assertTrue(summary.production_status.exists)
        self.assertTrue(summary.production_status.valid)
        self.assertEqual(summary.production_status_counts.pending, summary.production_job_count)
        self.assertEqual(summary.next_action.name, "run_dry_run_production_scheduler")
        self.assertEqual(
            summary.next_action.command,
            (
                "dry-run-production-scheduler",
                "--ingest-manifest",
                str((demo.shoot_folder / "ingest_manifest.json").resolve()),
            ),
        )
        self.assertEqual(
            summary.next_action.requires_runtime_args,
            ("--worker", "--started-at", "--completed-at", "--generated-at"),
        )
        self.assertEqual(status_after, status_before)

    def test_pending_production_sibling_can_run_while_retryable_job_needs_review(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            demo = create_card_dump_cli_demo_workspace(root)
            trusted_plan = self._production_plan_from_workspace(demo.shoot_folder)
            retryable_status = ProductionJobStatus(
                job_id="proxy_asset_00000",
                state="retryable",
                worker_adapter="dry-run-production-local",
                attempts=1,
                error_message="production lease expired; no files were deleted or cleaned up.",
                updated_at="2026-05-09T18:31:00Z",
            )
            write_production_status_manifest(
                ProductionStatusManifest(
                    shoot_slug=trusted_plan.shoot_slug,
                    production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
                    job_statuses=tuple(
                        retryable_status
                        if job.job_id == "proxy_asset_00000"
                        else ProductionJobStatus(job_id=job.job_id, state="pending")
                        for job in trusted_plan.jobs
                    ),
                ),
                demo.shoot_folder,
                trusted_plan=trusted_plan,
            )
            status_before = (demo.shoot_folder / "production_status.json").read_text(
                encoding="utf-8"
            )

            summary = build_workspace_health_summary(demo.shoot_folder)
            status_after = (demo.shoot_folder / "production_status.json").read_text(
                encoding="utf-8"
            )

        self.assertEqual(summary.production_status_counts.retryable, 1)
        self.assertGreater(summary.production_status_counts.pending, 0)
        self.assertEqual(summary.next_action.name, "run_dry_run_production_scheduler")
        self.assertEqual(
            summary.next_action.command,
            (
                "dry-run-production-scheduler",
                "--ingest-manifest",
                str(demo.shoot_folder / "ingest_manifest.json"),
            ),
        )
        self.assertEqual(status_after, status_before)

    def test_invalid_production_status_is_reported_without_resetting_progress(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            demo = create_card_dump_cli_demo_workspace(root)
            trusted_plan = self._production_plan_from_workspace(demo.shoot_folder)
            initialize_production_status_manifest(demo.shoot_folder, trusted_plan=trusted_plan)
            status_path = demo.shoot_folder / "production_status.json"
            status_path.write_text('{"schema_version":1,"job_statuses":[]}\n', encoding="utf-8")
            status_before = status_path.read_text(encoding="utf-8")

            summary = build_workspace_health_summary(demo.shoot_folder)
            payload = workspace_health_summary_to_dict(summary)
            status_after = status_path.read_text(encoding="utf-8")

        self.assertTrue(summary.production_status.exists)
        self.assertFalse(summary.production_status.valid)
        self.assertIn("production status", summary.production_status.error_message or "")
        self.assertIsNone(payload["production_scheduler_product_metrics"])
        self.assertEqual(summary.next_action.name, "review_invalid_production_status")
        self.assertFalse(summary.next_action.writes_files)
        self.assertEqual(status_after, status_before)

    def test_valid_retryable_production_report_points_to_review_not_render_work(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            demo = create_card_dump_cli_demo_workspace(root)
            trusted_plan = self._production_plan_from_workspace(demo.shoot_folder)
            initialize_production_status_manifest(demo.shoot_folder, trusted_plan=trusted_plan)
            first_output = trusted_plan.jobs[0].outputs[0]
            output_path = demo.shoot_folder / first_output
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(b"manual proxy export")

            result = run_dry_run_production_scheduler(
                demo.shoot_folder,
                trusted_plan=trusted_plan,
                worker_adapter="dry-run-production-local",
                started_at="2026-05-09T17:30:00Z",
                completed_at="2026-05-09T17:30:05Z",
                max_concurrency=2,
                max_iterations=5,
            )
            final_manifest = load_production_status_manifest(
                demo.shoot_folder,
                trusted_plan=trusted_plan,
            )
            write_dry_run_production_scheduler_report(
                result,
                demo.shoot_folder,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-09T17:30:06Z",
            )

            summary = build_workspace_health_summary(demo.shoot_folder)
            payload = workspace_health_summary_to_dict(summary)

        self.assertTrue(summary.production_scheduler_report.exists)
        self.assertTrue(summary.production_scheduler_report.valid)
        self.assertEqual(summary.production_status_counts.retryable, 1)
        self.assertEqual(
            payload["production_scheduler_product_metrics"]["retryable_job_count"],
            1,
        )
        self.assertEqual(
            payload["production_scheduler_product_metrics"]["total_job_count"],
            summary.production_job_count,
        )
        self.assertEqual(summary.next_action.name, "review_production_scheduler_report")
        self.assertFalse(summary.next_action.writes_files)

    def test_workspace_health_cli_prints_summary_and_creates_no_status_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            create_persisted_cli_demo_workspace(workspace)
            stdout = io.StringIO()

            exit_code = main(["workspace-health", "--workspace", str(workspace)], stdout=stdout)

            status_exists = (workspace / "deliverables" / "render_status.json").exists()

        summary = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertEqual(summary["schema_version"], 4)
        self.assertEqual(summary["workflow_authority"]["mode"], "observe_only")
        self.assertFalse(summary["workflow_authority"]["permits_file_mutation"])
        self.assertEqual(Path(summary["workspace"]).resolve(), workspace.resolve())
        self.assertEqual(summary["render_input_count"], 5)
        self.assertIsInstance(summary["render_inputs_fingerprint"], str)
        self.assertTrue(summary["artifacts"]["render_tasks"]["valid"])
        self.assertFalse(summary["artifacts"]["render_status"]["exists"])
        self.assertEqual(summary["next_action"]["name"], "init_render_status")
        self.assertFalse(status_exists)

    def test_workspace_health_cli_rejects_missing_workspace(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            missing_workspace = Path(tmp) / "missing"
            stdout = io.StringIO()
            stderr = io.StringIO()

            exit_code = main(
                ["workspace-health", "--workspace", str(missing_workspace)],
                stdout=stdout,
                stderr=stderr,
            )

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout.getvalue(), "")
        self.assertIn("workspace_root", stderr.getvalue())

    def _production_plan_from_workspace(self, workspace: Path):
        catalog = load_ingest_manifest(workspace / "ingest_manifest.json")
        return build_production_plan(
            production_assets_from_manifest(catalog),
            shoot_slug=catalog.shoot_slug,
        )


if __name__ == "__main__":
    unittest.main()
