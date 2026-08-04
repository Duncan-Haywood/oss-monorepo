import io
import json
import os
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
    PRODUCTION_SCHEDULER_REPORT_PATH,
    run_dry_run_production_scheduler,
    write_dry_run_production_scheduler_report,
)
from shootflow.production_status import (
    initialize_production_status_manifest,
    load_production_status_manifest,
)
from shootflow.workspace_index import (
    WORKSPACE_INDEX_PATH,
    WorkspaceIndexError,
    build_workspace_index,
    load_workspace_index,
    workspace_index_to_dict,
    write_workspace_index,
)


class WorkspaceIndexTests(unittest.TestCase):
    def test_builds_workspace_index_from_trusted_persisted_artifacts_without_writing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            demo = create_persisted_cli_demo_workspace(workspace)
            self._run_demo_scheduler(workspace, demo.required_completed_dependency_ids)

            index = build_workspace_index(
                workspace,
                generated_at="2026-05-09T00:00:00Z",
            )

            self.assertFalse((workspace / WORKSPACE_INDEX_PATH).exists())

        render_tasks = self._artifact(index, "render_tasks")
        render_status = self._artifact(index, "render_status")
        scheduler_report = self._artifact(index, "render_scheduler_report")
        storyline = self._artifact(index, "storyline_artifact")
        ingest_manifest = self._artifact(index, "ingest_manifest")

        self.assertEqual(index.schema_version, 2)
        self.assertEqual(index.generated_at, "2026-05-09T00:00:00Z")
        self.assertEqual(index.shoot_slug, "cli-demo-shoot")
        self.assertTrue(render_tasks.present)
        self.assertTrue(render_tasks.trusted)
        self.assertEqual(render_tasks.status, "trusted")
        self.assertEqual(render_tasks.summary["task_count"], 4)
        self.assertTrue(render_status.trusted)
        self.assertEqual(render_status.summary["succeeded_task_count"], 4)
        self.assertTrue(scheduler_report.trusted)
        self.assertEqual(scheduler_report.summary["stopped_reason"], "complete")
        self.assertEqual(scheduler_report.summary["review_required_task_count"], 0)
        self.assertEqual(
            scheduler_report.summary["product_metrics"]["completed_task_count"],
            4,
        )
        self.assertEqual(
            scheduler_report.summary["outputs_materialized_count"],
            len(demo.expected_output_paths),
        )
        self.assertTrue(storyline.present)
        self.assertFalse(storyline.trusted)
        self.assertEqual(storyline.status, "present_unvalidated")
        self.assertFalse(ingest_manifest.present)
        self.assertEqual(ingest_manifest.status, "missing")

        payload = workspace_index_to_dict(index)
        self.assertEqual(payload["schema_version"], 2)
        self.assertEqual(payload["shoot_slug"], "cli-demo-shoot")
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
        self.assertIn("metadata only", payload["notes"])

    def test_workspace_index_includes_derived_next_safe_action(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            create_persisted_cli_demo_workspace(workspace)

            index = build_workspace_index(
                workspace,
                generated_at="2026-05-09T00:01:30Z",
            )

        workspace_health = self._artifact(index, "workspace_health")

        self.assertFalse(workspace_health.present)
        self.assertTrue(workspace_health.trusted)
        self.assertEqual(workspace_health.status, "derived")
        self.assertEqual(
            workspace_health.summary["workflow_authority"],
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
        self.assertEqual(workspace_health.summary["next_action"]["name"], "init_render_status")
        cmd = workspace_health.summary["next_action"]["command"]
        self.assertEqual(
            (cmd[0], cmd[1], Path(cmd[2]).resolve()),
            ("init-render-status", "--workspace", workspace.resolve()),
        )
        self.assertTrue(workspace_health.summary["next_action"]["writes_files"])
        self.assertEqual(workspace_health.summary["render_input_count"], 5)
        self.assertIsInstance(workspace_health.summary["render_inputs_fingerprint"], str)
        self.assertEqual(len(workspace_health.summary["render_inputs_fingerprint"]), 64)

    def test_workspace_index_includes_production_status_and_report_state(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            demo = create_card_dump_cli_demo_workspace(root)
            trusted_plan = self._production_plan_from_workspace(demo.shoot_folder)
            initialize_production_status_manifest(demo.shoot_folder, trusted_plan=trusted_plan)
            result = run_dry_run_production_scheduler(
                demo.shoot_folder,
                trusted_plan=trusted_plan,
                worker_adapter="dry-run-production-local",
                started_at="2026-05-09T17:31:00Z",
                completed_at="2026-05-09T17:31:05Z",
                max_concurrency=2,
                max_iterations=20,
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
                generated_at="2026-05-09T17:31:06Z",
            )

            index = build_workspace_index(
                demo.shoot_folder,
                generated_at="2026-05-09T17:31:07Z",
            )

        production_status = self._artifact(index, "production_status")
        production_report = self._artifact(index, "production_scheduler_report")
        workspace_health = self._artifact(index, "workspace_health")

        self.assertTrue(production_status.trusted)
        self.assertEqual(
            production_status.summary["succeeded_job_count"],
            sum(1 for status in final_manifest.job_statuses if status.state == "succeeded"),
        )
        self.assertTrue(production_report.trusted)
        self.assertEqual(production_report.summary["stopped_reason"], result.stopped_reason)
        self.assertEqual(
            production_report.summary["completed_job_count"],
            len(result.completed_job_ids),
        )
        self.assertEqual(
            production_report.summary["product_metrics"]["completed_job_count"],
            len(result.completed_job_ids),
        )
        self.assertEqual(
            workspace_health.summary["production_status_counts"]["succeeded"],
            production_status.summary["succeeded_job_count"],
        )
        self.assertEqual(
            workspace_health.summary["production_scheduler_product_metrics"][
                "completed_job_count"
            ],
            len(result.completed_job_ids),
        )

    def test_workspace_index_reports_invalid_production_status_without_resetting_it(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            demo = create_card_dump_cli_demo_workspace(root)
            trusted_plan = self._production_plan_from_workspace(demo.shoot_folder)
            initialize_production_status_manifest(demo.shoot_folder, trusted_plan=trusted_plan)
            status_path = demo.shoot_folder / "production_status.json"
            status_path.write_text('{"schema_version":1,"job_statuses":[]}\n', encoding="utf-8")
            status_before = status_path.read_text(encoding="utf-8")

            index = build_workspace_index(
                demo.shoot_folder,
                generated_at="2026-05-09T19:01:00Z",
            )
            status_after = status_path.read_text(encoding="utf-8")

        production_status = self._artifact(index, "production_status")
        production_report = self._artifact(index, "production_scheduler_report")
        workspace_health = self._artifact(index, "workspace_health")

        self.assertTrue(production_status.present)
        self.assertFalse(production_status.trusted)
        self.assertEqual(production_status.status, "invalid")
        self.assertIn("production", production_status.summary["error"])
        self.assertFalse(production_report.present)
        self.assertEqual(production_report.status, "missing")
        self.assertEqual(
            workspace_health.summary["next_action"]["name"],
            "review_invalid_production_status",
        )
        self.assertIsNone(workspace_health.summary["production_scheduler_product_metrics"])
        self.assertEqual(status_after, status_before)

    def test_workspace_index_reports_invalid_production_scheduler_report_for_review(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            demo = create_card_dump_cli_demo_workspace(root)
            trusted_plan = self._production_plan_from_workspace(demo.shoot_folder)
            initialize_production_status_manifest(demo.shoot_folder, trusted_plan=trusted_plan)
            report_path = demo.shoot_folder / PRODUCTION_SCHEDULER_REPORT_PATH
            report_path.write_text(
                '{"schema_version":1,"completed_job_ids":["ghost"]}\n',
                encoding="utf-8",
            )
            report_before = report_path.read_text(encoding="utf-8")

            index = build_workspace_index(
                demo.shoot_folder,
                generated_at="2026-05-09T19:01:30Z",
            )
            report_after = report_path.read_text(encoding="utf-8")

        production_status = self._artifact(index, "production_status")
        production_report = self._artifact(index, "production_scheduler_report")
        workspace_health = self._artifact(index, "workspace_health")

        self.assertTrue(production_status.trusted)
        self.assertTrue(production_report.present)
        self.assertFalse(production_report.trusted)
        self.assertEqual(production_report.status, "invalid")
        self.assertIn("production", production_report.summary["error"])
        self.assertEqual(
            workspace_health.summary["next_action"]["name"],
            "review_invalid_production_scheduler_report",
        )
        self.assertIsNone(workspace_health.summary["production_scheduler_product_metrics"])
        self.assertEqual(report_after, report_before)

    def test_write_and_load_workspace_index_rejects_symlinked_index_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            demo = create_persisted_cli_demo_workspace(workspace)
            self._run_demo_scheduler(workspace, demo.required_completed_dependency_ids)
            index = build_workspace_index(
                workspace,
                generated_at="2026-05-09T00:02:00Z",
            )

            written_path = write_workspace_index(index, workspace)
            loaded = load_workspace_index(workspace)

            outside = workspace / "outside-index.json"
            symlink_path = workspace / WORKSPACE_INDEX_PATH
            written_path.unlink()
            outside.write_text("{}", encoding="utf-8")
            symlink_path.symlink_to(outside)

            with self.assertRaisesRegex(WorkspaceIndexError, "symlink"):
                write_workspace_index(index, workspace)
            with self.assertRaisesRegex(WorkspaceIndexError, "symlink"):
                load_workspace_index(workspace)

        self.assertEqual(written_path.name, WORKSPACE_INDEX_PATH)
        self.assertEqual(loaded.generated_at, "2026-05-09T00:02:00Z")
        self.assertEqual(loaded.shoot_slug, "cli-demo-shoot")

    def test_workspace_index_is_bound_to_requested_workspace(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            first_workspace = root / "first"
            second_workspace = root / "second"
            first_workspace.mkdir()
            second_workspace.mkdir()
            index = build_workspace_index(
                first_workspace,
                generated_at="2026-05-09T00:02:30Z",
            )

            with self.assertRaisesRegex(WorkspaceIndexError, "workspace_root"):
                write_workspace_index(index, second_workspace)

            first_index_path = write_workspace_index(index, first_workspace)
            second_index_path = second_workspace / WORKSPACE_INDEX_PATH
            second_index_path.write_text(first_index_path.read_text(encoding="utf-8"), encoding="utf-8")

            with self.assertRaisesRegex(WorkspaceIndexError, "workspace_root"):
                load_workspace_index(second_workspace)

    def test_workspace_index_written_from_relative_workspace_loads_from_absolute_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp) / "shoot"
            workspace.mkdir()
            create_persisted_cli_demo_workspace(workspace)
            previous_cwd = Path.cwd()
            try:
                os.chdir(workspace)
                index = build_workspace_index(
                    ".",
                    generated_at="2026-05-09T00:02:40Z",
                )
                write_workspace_index(index, ".")
            finally:
                os.chdir(previous_cwd)

            loaded = load_workspace_index(workspace)

        self.assertEqual(loaded.workspace_root, workspace.resolve())
        self.assertEqual(loaded.index_path, (workspace / WORKSPACE_INDEX_PATH).resolve())

    def test_legacy_workspace_index_loads_as_observe_only_schema_v2(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            create_persisted_cli_demo_workspace(workspace)
            index = build_workspace_index(
                workspace,
                generated_at="2026-05-09T00:02:42Z",
            )
            legacy_payload = workspace_index_to_dict(index)
            legacy_payload["schema_version"] = 1
            legacy_payload.pop("workflow_authority")
            self._artifact_payload(legacy_payload, "workspace_health")["summary"].pop(
                "workflow_authority"
            )
            (workspace / WORKSPACE_INDEX_PATH).write_text(
                json.dumps(legacy_payload, indent=2, sort_keys=True) + "\n",
                encoding="utf-8",
            )

            loaded = load_workspace_index(workspace)
            payload = workspace_index_to_dict(loaded)

        workspace_health = self._artifact_payload(payload, "workspace_health")

        self.assertEqual(payload["schema_version"], 2)
        self.assertEqual(payload["workflow_authority"]["mode"], "observe_only")
        self.assertFalse(payload["workflow_authority"]["permits_file_mutation"])
        self.assertEqual(
            workspace_health["summary"]["workflow_authority"],
            payload["workflow_authority"],
        )

    def test_workspace_index_reports_non_file_storyline_artifact_as_invalid(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            storyline_path = workspace / "analysis" / "instagram_storylines.json"
            storyline_path.mkdir(parents=True)

            index = build_workspace_index(
                workspace,
                generated_at="2026-05-09T00:02:45Z",
            )

        storyline = self._artifact(index, "storyline_artifact")
        self.assertTrue(storyline.present)
        self.assertFalse(storyline.trusted)
        self.assertEqual(storyline.status, "invalid")
        self.assertIn("must be a file", storyline.summary["error"])

    def test_index_workspace_cli_prints_and_optionally_writes_index(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            demo = create_persisted_cli_demo_workspace(workspace)
            self._run_demo_scheduler(workspace, demo.required_completed_dependency_ids)
            stdout = io.StringIO()

            exit_code = main(
                [
                    "index-workspace",
                    "--workspace",
                    str(workspace),
                    "--generated-at",
                    "2026-05-09T00:03:00Z",
                    "--write",
                ],
                stdout=stdout,
            )

            index_path = workspace / WORKSPACE_INDEX_PATH
            printed_index = json.loads(stdout.getvalue())
            persisted_index = json.loads(index_path.read_text(encoding="utf-8"))

        self.assertEqual(exit_code, 0)
        self.assertEqual(printed_index, persisted_index)
        self.assertEqual(printed_index["generated_at"], "2026-05-09T00:03:00Z")
        self.assertEqual(printed_index["shoot_slug"], "cli-demo-shoot")
        self.assertEqual(printed_index["index_path"], str(index_path.resolve()))
        self.assertEqual(
            self._artifact_payload(printed_index, "render_scheduler_report")["summary"][
                "stopped_reason"
            ],
            "complete",
        )
        self.assertEqual(
            self._artifact_payload(printed_index, "workspace_health")["summary"][
                "render_scheduler_product_metrics"
            ]["completed_task_count"],
            4,
        )

    def test_index_workspace_cli_rejects_missing_workspace(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            missing_workspace = Path(tmp) / "missing"
            stdout = io.StringIO()
            stderr = io.StringIO()

            exit_code = main(
                [
                    "index-workspace",
                    "--workspace",
                    str(missing_workspace),
                    "--generated-at",
                    "2026-05-09T00:03:30Z",
                ],
                stdout=stdout,
                stderr=stderr,
            )

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout.getvalue(), "")
        self.assertIn("workspace_root", stderr.getvalue())

    def _run_demo_scheduler(self, workspace: Path, dependencies: tuple[str, ...]) -> None:
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
            "2026-05-09T00:01:00Z",
            "--completed-at",
            "2026-05-09T00:01:05Z",
            "--generated-at",
            "2026-05-09T00:01:06Z",
            "--max-concurrency",
            "3",
            "--max-iterations",
            "4",
        ]
        for dependency_id in dependencies:
            scheduler_args.extend(["--completed-dependency", dependency_id])
        scheduler_exit = main(scheduler_args, stdout=io.StringIO())
        self.assertEqual(scheduler_exit, 0)

    def _artifact(self, index: object, name: str) -> object:
        for artifact in getattr(index, "artifacts"):
            if artifact.name == name:
                return artifact
        raise AssertionError(f"Missing artifact summary: {name}")

    def _artifact_payload(self, payload: dict[str, object], name: str) -> dict[str, object]:
        artifacts = payload["artifacts"]
        self.assertIsInstance(artifacts, list)
        for artifact in artifacts:
            self.assertIsInstance(artifact, dict)
            if artifact["name"] == name:
                return artifact
        raise AssertionError(f"Missing artifact payload: {name}")

    def _production_plan_from_workspace(self, workspace: Path):
        catalog = load_ingest_manifest(workspace / "ingest_manifest.json")
        return build_production_plan(
            production_assets_from_manifest(catalog),
            shoot_slug=catalog.shoot_slug,
        )


if __name__ == "__main__":
    unittest.main()
