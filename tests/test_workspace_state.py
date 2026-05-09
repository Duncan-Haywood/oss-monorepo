import io
import json
from pathlib import Path
import tempfile
import unittest

from shootflow.cli import main
from shootflow.demo_workspace import create_persisted_cli_demo_workspace
from shootflow.render_status import initialize_render_status_manifest
from shootflow.workspace_state import build_workspace_state_report


class ShootFlowWorkspaceStateTests(unittest.TestCase):
    def test_workspace_state_reports_trusted_render_handoffs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            demo = create_persisted_cli_demo_workspace(workspace)
            initialize_render_status_manifest(workspace, trusted_plan=demo.trusted_plan)

            report = build_workspace_state_report(workspace)

        artifacts = {artifact.name: artifact for artifact in report.artifacts}
        self.assertEqual(report.shoot_slug, "cli-demo-shoot")
        self.assertEqual(len(report.render_plan_fingerprint), 64)
        self.assertEqual(artifacts["render_tasks"].status, "trusted")
        self.assertGreater(artifacts["render_tasks"].size_bytes or 0, 0)
        self.assertEqual(len(artifacts["render_tasks"].sha256 or ""), 64)
        self.assertEqual(artifacts["render_status"].status, "trusted")
        self.assertEqual(report.render_status_counts["pending"], 4)
        self.assertEqual(report.render_status_counts["succeeded"], 0)
        self.assertEqual(artifacts["render_scheduler_report"].status, "missing")
        self.assertIn(
            "Run dry-run-render-scheduler to advance ready deliverable work.",
            report.next_actions,
        )
        self.assertIn("read-only workspace state inspection", report.notes)

    def test_workspace_state_surfaces_invalid_status_without_mutating_it(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            create_persisted_cli_demo_workspace(workspace)
            status_path = workspace / "deliverables" / "render_status.json"
            status_path.write_text('{"not":"trusted"}\n', encoding="utf-8")
            before = status_path.read_text(encoding="utf-8")

            report = build_workspace_state_report(workspace)
            after = status_path.read_text(encoding="utf-8")

        artifacts = {artifact.name: artifact for artifact in report.artifacts}
        self.assertEqual(before, after)
        self.assertEqual(artifacts["render_tasks"].status, "trusted")
        self.assertEqual(artifacts["render_status"].status, "invalid")
        self.assertIn("Unexpected render status", artifacts["render_status"].error_message or "")
        self.assertIn(
            "Review invalid render_status.json; do not initialize a new status handoff until the invalid file is resolved.",
            report.next_actions,
        )

    def test_workspace_state_reports_trusted_scheduler_report(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            demo = create_persisted_cli_demo_workspace(workspace)
            initialize_render_status_manifest(workspace, trusted_plan=demo.trusted_plan)
            scheduler_args = [
                "dry-run-render-scheduler",
                "--workspace",
                str(workspace),
                "--renderer",
                "dry-run-local",
                "--started-at",
                "2026-05-09T05:10:00Z",
                "--completed-at",
                "2026-05-09T05:10:05Z",
                "--generated-at",
                "2026-05-09T05:10:06Z",
                "--max-concurrency",
                "3",
                "--max-iterations",
                "4",
            ]
            for dependency_id in demo.required_completed_dependency_ids:
                scheduler_args.extend(["--completed-dependency", dependency_id])
            scheduler_exit_code = main(scheduler_args, stdout=io.StringIO())

            report = build_workspace_state_report(workspace)

        artifacts = {artifact.name: artifact for artifact in report.artifacts}
        self.assertEqual(scheduler_exit_code, 0)
        self.assertEqual(artifacts["render_scheduler_report"].status, "trusted")
        self.assertEqual(report.scheduler_stopped_reason, "complete")
        self.assertEqual(report.review_required_task_ids, ())
        self.assertEqual(report.render_status_counts["succeeded"], 4)
        self.assertIn(
            "Review materialized deliverables and approve or iterate the edit package.",
            report.next_actions,
        )

    def test_workspace_state_surfaces_invalid_scheduler_report_without_mutating_it(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            demo = create_persisted_cli_demo_workspace(workspace)
            initialize_render_status_manifest(workspace, trusted_plan=demo.trusted_plan)
            scheduler_args = [
                "dry-run-render-scheduler",
                "--workspace",
                str(workspace),
                "--renderer",
                "dry-run-local",
                "--started-at",
                "2026-05-09T05:11:00Z",
                "--completed-at",
                "2026-05-09T05:11:05Z",
                "--generated-at",
                "2026-05-09T05:11:06Z",
                "--max-concurrency",
                "3",
                "--max-iterations",
                "4",
            ]
            for dependency_id in demo.required_completed_dependency_ids:
                scheduler_args.extend(["--completed-dependency", dependency_id])
            main(scheduler_args, stdout=io.StringIO())
            scheduler_report_path = workspace / "deliverables" / "render_scheduler_report.json"
            scheduler_report_path.write_text('{"not":"trusted"}\n', encoding="utf-8")
            before = scheduler_report_path.read_text(encoding="utf-8")

            report = build_workspace_state_report(workspace)
            after = scheduler_report_path.read_text(encoding="utf-8")

        artifacts = {artifact.name: artifact for artifact in report.artifacts}
        self.assertEqual(before, after)
        self.assertEqual(artifacts["render_scheduler_report"].status, "invalid")
        self.assertIn(
            "unknown fields",
            artifacts["render_scheduler_report"].error_message or "",
        )
        self.assertIn(
            "Review invalid render_scheduler_report.json; rerun the trusted scheduler only after confirming it is safe to replace the report.",
            report.next_actions,
        )

    def test_workspace_state_cli_prints_next_actions_without_side_effects(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            create_persisted_cli_demo_workspace(workspace)
            stdout = io.StringIO()

            exit_code = main(
                [
                    "inspect-workspace-state",
                    "--workspace",
                    str(workspace),
                ],
                stdout=stdout,
            )

            response = json.loads(stdout.getvalue())
            status_path = workspace / "deliverables" / "render_status.json"

        self.assertEqual(exit_code, 0)
        self.assertEqual(response["schema_version"], 1)
        self.assertEqual(response["shoot_slug"], "cli-demo-shoot")
        self.assertEqual(response["artifacts"]["render_tasks"]["status"], "trusted")
        self.assertEqual(response["artifacts"]["render_status"]["status"], "missing")
        self.assertIn(
            "Run init-render-status to create the render progress handoff.",
            response["next_actions"],
        )
        self.assertFalse(status_path.exists())


if __name__ == "__main__":
    unittest.main()
