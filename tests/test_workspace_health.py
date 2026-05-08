import io
import json
from pathlib import Path
import tempfile
import unittest

from shootflow.cli import main
from shootflow.demo_workspace import create_persisted_cli_demo_workspace
from shootflow.render_status import initialize_render_status_manifest
from shootflow.workspace_health import build_workspace_health_summary


class WorkspaceHealthTests(unittest.TestCase):
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
            summary.next_action.command,
            ("init-render-status", "--workspace", str(demo.workspace_root)),
        )
        self.assertTrue(summary.next_action.writes_files)

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
                str(workspace),
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
            status_after = status_path.read_text(encoding="utf-8")

        self.assertTrue(summary.render_tasks.valid)
        self.assertTrue(summary.render_status.exists)
        self.assertFalse(summary.render_status.valid)
        self.assertIn("render status", summary.render_status.error_message or "")
        self.assertEqual(summary.next_action.name, "review_invalid_render_status")
        self.assertFalse(summary.next_action.writes_files)
        self.assertEqual(status_after, status_before)

    def test_workspace_health_cli_prints_summary_and_creates_no_status_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            create_persisted_cli_demo_workspace(workspace)
            stdout = io.StringIO()

            exit_code = main(["workspace-health", "--workspace", str(workspace)], stdout=stdout)

            status_exists = (workspace / "deliverables" / "render_status.json").exists()

        summary = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertEqual(summary["schema_version"], 1)
        self.assertEqual(summary["workspace"], str(workspace))
        self.assertTrue(summary["artifacts"]["render_tasks"]["valid"])
        self.assertFalse(summary["artifacts"]["render_status"]["exists"])
        self.assertEqual(summary["next_action"]["name"], "init_render_status")
        self.assertFalse(status_exists)


if __name__ == "__main__":
    unittest.main()
