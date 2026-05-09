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
from shootflow.pilot_dashboard import (
    build_pilot_dashboard_summary,
    pilot_dashboard_summary_to_dict,
)
from shootflow.production import build_production_plan
from shootflow.production_scheduler import (
    run_dry_run_production_scheduler,
    write_dry_run_production_scheduler_report,
)
from shootflow.production_status import (
    initialize_production_status_manifest,
    load_production_status_manifest,
)


class PilotDashboardTests(unittest.TestCase):
    def test_complete_render_workspace_dashboard_reports_activation_without_writing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            demo = create_persisted_cli_demo_workspace(workspace)
            self._run_demo_render_scheduler(workspace, demo.required_completed_dependency_ids)
            status_before = (workspace / "deliverables" / "render_status.json").read_text(
                encoding="utf-8"
            )

            dashboard = build_pilot_dashboard_summary(
                workspace,
                generated_at="2026-05-09T20:31:00Z",
            )
            payload = pilot_dashboard_summary_to_dict(dashboard)
            status_after = (workspace / "deliverables" / "render_status.json").read_text(
                encoding="utf-8"
            )

        self.assertEqual(payload["schema_version"], 2)
        self.assertEqual(payload["generated_at"], "2026-05-09T20:31:00Z")
        self.assertEqual(payload["shoot_slug"], "cli-demo-shoot")
        self.assertTrue(payload["metric_sources"]["render_scheduler_report"])
        self.assertFalse(payload["metric_sources"]["production_scheduler_report"])
        self.assertEqual(payload["workflow_state"], "ready_for_review")
        self.assertEqual(payload["next_action"]["name"], "review_deliverables")
        self.assertFalse(payload["next_action"]["writes_files"])
        self.assertEqual(payload["throughput"]["completed_work_count"], 4)
        self.assertEqual(
            payload["throughput"]["materialized_output_count"],
            len(demo.expected_output_paths),
        )
        self.assertTrue(payload["pilot_acceptance"]["metrics_available"])
        self.assertEqual(payload["pilot_acceptance"]["completion_rate_basis_points"], 10000)
        self.assertEqual(payload["pilot_acceptance"]["intervention_rate_basis_points"], 0)
        self.assertTrue(payload["pilot_acceptance"]["meets_completion_threshold"])
        self.assertTrue(payload["pilot_acceptance"]["meets_intervention_threshold"])
        self.assertTrue(payload["pilot_acceptance"]["meets_output_threshold"])
        self.assertTrue(payload["pilot_acceptance"]["ready_for_pilot_review"])
        self.assertEqual(
            payload["pilot_acceptance"]["thresholds"]["min_completion_rate_basis_points"],
            9000,
        )
        self.assertEqual(payload["intervention"]["manual_intervention_count"], 0)
        self.assertTrue(payload["activation"]["render_tasks_trusted"])
        self.assertTrue(payload["activation"]["render_status_trusted"])
        self.assertTrue(payload["activation"]["render_scheduler_report_trusted"])
        self.assertEqual(status_after, status_before)
        self.assertFalse((workspace / "shootflow_workspace_index.json").exists())

    def test_production_retryable_dashboard_surfaces_intervention_without_file_authority(self) -> None:
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
                started_at="2026-05-09T20:31:10Z",
                completed_at="2026-05-09T20:31:15Z",
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
                generated_at="2026-05-09T20:31:16Z",
            )
            production_status_before = (demo.shoot_folder / "production_status.json").read_text(
                encoding="utf-8"
            )

            stdout = io.StringIO()
            exit_code = main(
                [
                    "pilot-dashboard",
                    "--workspace",
                    str(demo.shoot_folder),
                    "--generated-at",
                    "2026-05-09T20:31:17Z",
                ],
                stdout=stdout,
            )
            payload = json.loads(stdout.getvalue())
            production_status_after = (demo.shoot_folder / "production_status.json").read_text(
                encoding="utf-8"
            )

        self.assertEqual(exit_code, 0)
        self.assertTrue(payload["metric_sources"]["production_scheduler_report"])
        self.assertFalse(payload["metric_sources"]["render_scheduler_report"])
        self.assertEqual(payload["workflow_state"], "needs_human_review")
        self.assertEqual(payload["next_action"]["name"], "review_production_scheduler_report")
        self.assertFalse(payload["next_action"]["writes_files"])
        self.assertEqual(payload["intervention"]["retryable_work_count"], 1)
        self.assertGreater(payload["intervention"]["manual_intervention_count"], 1)
        self.assertEqual(
            payload["intervention"]["manual_intervention_count"],
            payload["intervention"]["review_required_work_count"],
        )
        self.assertEqual(payload["intervention"]["failure_message_count"], 1)
        self.assertEqual(
            payload["intervention"]["intervention_rate_basis_count"],
            payload["throughput"]["total_work_count"],
        )
        self.assertTrue(payload["pilot_acceptance"]["metrics_available"])
        self.assertLess(
            payload["pilot_acceptance"]["completion_rate_basis_points"],
            payload["pilot_acceptance"]["thresholds"]["min_completion_rate_basis_points"],
        )
        self.assertFalse(payload["pilot_acceptance"]["meets_completion_threshold"])
        self.assertGreater(
            payload["pilot_acceptance"]["intervention_rate_basis_points"],
            payload["pilot_acceptance"]["thresholds"]["max_intervention_rate_basis_points"],
        )
        self.assertFalse(payload["pilot_acceptance"]["meets_intervention_threshold"])
        self.assertFalse(payload["pilot_acceptance"]["ready_for_pilot_review"])
        self.assertIn(
            "completion rate",
            " ".join(payload["pilot_acceptance"]["threshold_notes"]),
        )
        self.assertIn(
            "manual intervention rate",
            " ".join(payload["pilot_acceptance"]["threshold_notes"]),
        )
        self.assertGreater(payload["throughput"]["attempted_work_count"], 0)
        self.assertIn("read-only", " ".join(payload["safety_notes"]))
        self.assertEqual(production_status_after, production_status_before)

    def test_dashboard_keeps_missing_scheduler_metrics_unavailable_not_zero(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            create_persisted_cli_demo_workspace(workspace)

            payload = pilot_dashboard_summary_to_dict(
                build_pilot_dashboard_summary(
                    workspace,
                    generated_at="2026-05-09T20:31:30Z",
                )
            )

        self.assertFalse(payload["metric_sources"]["production_scheduler_report"])
        self.assertFalse(payload["metric_sources"]["render_scheduler_report"])
        self.assertEqual(payload["workflow_state"], "ready_to_initialize")
        self.assertEqual(payload["next_action"]["name"], "init_render_status")
        self.assertTrue(payload["next_action"]["writes_files"])
        self.assertEqual(payload["next_action"]["authority"], "observe_only")
        self.assertNotIn("command", payload["next_action"])
        self.assertNotIn("requires_runtime_args", payload["next_action"])
        self.assertIn("command_omitted_reason", payload["next_action"])
        self.assertIsNone(payload["throughput"]["total_work_count"])
        self.assertIsNone(payload["throughput"]["completed_work_count"])
        self.assertIsNone(payload["intervention"]["manual_intervention_count"])
        self.assertFalse(payload["pilot_acceptance"]["metrics_available"])
        self.assertIsNone(payload["pilot_acceptance"]["completion_rate_basis_points"])
        self.assertIsNone(payload["pilot_acceptance"]["intervention_rate_basis_points"])
        self.assertIsNone(payload["pilot_acceptance"]["materialized_output_count"])
        self.assertIsNone(payload["pilot_acceptance"]["meets_completion_threshold"])
        self.assertIsNone(payload["pilot_acceptance"]["meets_intervention_threshold"])
        self.assertIsNone(payload["pilot_acceptance"]["meets_output_threshold"])
        self.assertFalse(payload["pilot_acceptance"]["ready_for_pilot_review"])
        self.assertIn("trusted scheduler metrics", " ".join(payload["pilot_acceptance"]["threshold_notes"]))
        self.assertTrue(payload["activation"]["render_tasks_trusted"])
        self.assertFalse(payload["activation"]["render_status_trusted"])

    def test_acceptance_survives_completed_workspace_noop_scheduler_report(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            demo = create_persisted_cli_demo_workspace(workspace)
            self._run_demo_render_scheduler(workspace, demo.required_completed_dependency_ids)
            self._run_demo_render_scheduler(workspace, demo.required_completed_dependency_ids)

            payload = pilot_dashboard_summary_to_dict(
                build_pilot_dashboard_summary(
                    workspace,
                    generated_at="2026-05-09T21:01:00Z",
                )
            )

        self.assertEqual(payload["throughput"]["completed_work_count"], 4)
        self.assertEqual(payload["throughput"]["materialized_output_count"], 0)
        self.assertEqual(payload["pilot_acceptance"]["materialized_output_count"], 4)
        self.assertTrue(payload["pilot_acceptance"]["meets_output_threshold"])
        self.assertTrue(payload["pilot_acceptance"]["ready_for_pilot_review"])

    def test_blocked_scheduler_report_fails_output_acceptance_threshold(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            create_persisted_cli_demo_workspace(workspace)
            init_exit = main(
                ["init-render-status", "--workspace", str(workspace)],
                stdout=io.StringIO(),
            )
            self.assertEqual(init_exit, 0)
            scheduler_exit = main(
                [
                    "dry-run-render-scheduler",
                    "--workspace",
                    str(workspace),
                    "--renderer",
                    "dry-run-local",
                    "--started-at",
                    "2026-05-09T21:01:10Z",
                    "--completed-at",
                    "2026-05-09T21:01:15Z",
                    "--generated-at",
                    "2026-05-09T21:01:16Z",
                    "--max-concurrency",
                    "3",
                    "--max-iterations",
                    "4",
                ],
                stdout=io.StringIO(),
            )
            self.assertEqual(scheduler_exit, 0)

            payload = pilot_dashboard_summary_to_dict(
                build_pilot_dashboard_summary(
                    workspace,
                    generated_at="2026-05-09T21:01:17Z",
                )
            )

        self.assertTrue(payload["pilot_acceptance"]["metrics_available"])
        self.assertEqual(payload["throughput"]["completed_work_count"], 0)
        self.assertEqual(payload["pilot_acceptance"]["materialized_output_count"], 0)
        self.assertFalse(payload["pilot_acceptance"]["meets_output_threshold"])
        self.assertFalse(payload["pilot_acceptance"]["ready_for_pilot_review"])
        self.assertIn(
            "materialized output count",
            " ".join(payload["pilot_acceptance"]["threshold_notes"]),
        )

    def _run_demo_render_scheduler(self, workspace: Path, dependencies: tuple[str, ...]) -> None:
        init_exit = main(
            ["init-render-status", "--workspace", str(workspace)],
            stdout=io.StringIO(),
        )
        self.assertEqual(init_exit, 0)
        scheduler_args = [
            "dry-run-render-scheduler",
            "--workspace",
            str(workspace),
            "--renderer",
            "dry-run-local",
            "--started-at",
            "2026-05-09T20:30:40Z",
            "--completed-at",
            "2026-05-09T20:30:45Z",
            "--generated-at",
            "2026-05-09T20:30:46Z",
            "--max-concurrency",
            "3",
            "--max-iterations",
            "4",
        ]
        for dependency_id in dependencies:
            scheduler_args.extend(["--completed-dependency", dependency_id])
        scheduler_exit = main(scheduler_args, stdout=io.StringIO())
        self.assertEqual(scheduler_exit, 0)

    def _production_plan_from_workspace(self, workspace: Path):
        catalog = load_ingest_manifest(workspace / "ingest_manifest.json")
        return build_production_plan(
            production_assets_from_manifest(catalog),
            shoot_slug=catalog.shoot_slug,
        )


if __name__ == "__main__":
    unittest.main()
