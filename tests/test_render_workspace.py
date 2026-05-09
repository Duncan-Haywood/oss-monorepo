import io
import json
from pathlib import Path
import tempfile
import unittest

from shootflow.cli import main
from shootflow.demo_workspace import create_persisted_cli_demo_workspace
from shootflow.render_workspace import RenderWorkspaceError, inspect_render_workspace


class RenderWorkspaceInspectionTests(unittest.TestCase):
    def test_inspection_reports_missing_status_without_writing_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            demo = create_persisted_cli_demo_workspace(workspace)

            report = inspect_render_workspace(workspace)

            self.assertFalse((workspace / "deliverables" / "render_status.json").exists())
            self.assertFalse((workspace / "deliverables" / "render_scheduler_report.json").exists())

        self.assertEqual(report.overall_status, "needs_status_initialization")
        self.assertEqual(report.shoot_slug, demo.trusted_plan.shoot_slug)
        self.assertTrue(report.render_tasks_present)
        self.assertFalse(report.render_status_present)
        self.assertFalse(report.scheduler_report_present)
        self.assertEqual(report.task_count, 4)
        self.assertEqual(report.status_counts_by_state["pending"], 0)
        self.assertEqual(report.expected_output_paths, demo.expected_output_paths)
        self.assertIn("run init-render-status", report.next_actions)
        self.assertIn("read-only inspection - no files were written", report.safety_notes)

    def test_inspection_summarizes_completed_scheduler_report(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            demo = create_persisted_cli_demo_workspace(workspace)
            self._run_demo_scheduler(workspace, dependency_ids=demo.required_completed_dependency_ids)

            report = inspect_render_workspace(workspace)

        self.assertEqual(report.overall_status, "complete")
        self.assertTrue(report.render_status_present)
        self.assertTrue(report.scheduler_report_present)
        self.assertEqual(report.task_count, 4)
        self.assertEqual(report.status_counts_by_state["succeeded"], 4)
        self.assertEqual(report.scheduler_stopped_reason, "complete")
        self.assertEqual(report.review_required_task_ids, ())
        self.assertEqual(report.outputs_materialized, demo.expected_output_paths)
        self.assertIn("review completed deliverables", report.next_actions)

    def test_inspection_rejects_stale_scheduler_report(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            demo = create_persisted_cli_demo_workspace(workspace)
            self._run_demo_scheduler(workspace, dependency_ids=demo.required_completed_dependency_ids)
            scheduler_report_path = workspace / "deliverables" / "render_scheduler_report.json"
            raw_report = json.loads(scheduler_report_path.read_text(encoding="utf-8"))
            raw_report["render_plan_fingerprint"] = "0" * 64
            scheduler_report_path.write_text(json.dumps(raw_report), encoding="utf-8")

            with self.assertRaisesRegex(RenderWorkspaceError, "scheduler report"):
                inspect_render_workspace(workspace)

    def test_cli_prints_read_only_inspection_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            create_persisted_cli_demo_workspace(workspace)
            stdout = io.StringIO()

            exit_code = main(
                [
                    "inspect-render-workspace",
                    "--workspace",
                    str(workspace),
                ],
                stdout=stdout,
            )

            report = json.loads(stdout.getvalue())

        self.assertEqual(exit_code, 0)
        self.assertEqual(report["schema_version"], 1)
        self.assertEqual(report["overall_status"], "needs_status_initialization")
        self.assertEqual(report["task_count"], 4)
        self.assertFalse(report["render_status_present"])
        self.assertIn("run init-render-status", report["next_actions"])
        self.assertIn("read-only inspection - no files were written", report["safety_notes"])

    def _run_demo_scheduler(self, workspace: Path, *, dependency_ids: tuple[str, ...]) -> None:
        init_exit_code = main(
            ["init-render-status", "--workspace", str(workspace)],
            stdout=io.StringIO(),
        )
        self.assertEqual(init_exit_code, 0)

        scheduler_args = [
            "dry-run-render-scheduler",
            "--workspace",
            str(workspace),
            "--renderer",
            "dry-run-local",
            "--started-at",
            "2026-05-09T06:00:00Z",
            "--completed-at",
            "2026-05-09T06:00:05Z",
            "--generated-at",
            "2026-05-09T06:00:06Z",
            "--max-concurrency",
            "3",
            "--max-iterations",
            "4",
        ]
        for dependency_id in dependency_ids:
            scheduler_args.extend(["--completed-dependency", dependency_id])

        scheduler_exit_code = main(scheduler_args, stdout=io.StringIO())
        self.assertEqual(scheduler_exit_code, 0)


if __name__ == "__main__":
    unittest.main()
