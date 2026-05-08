import io
import json
from pathlib import Path
import tempfile
import unittest

from shootflow.assembly import AssemblyPlan, RenderTask, write_render_tasks_manifest
from shootflow.cli import main
from shootflow.render_scheduler import load_dry_run_render_scheduler_report
from shootflow.render_status import (
    RenderStatusManifest,
    RenderTaskStatus,
    load_render_status_manifest,
    render_plan_fingerprint,
    write_render_status_manifest,
)


class ShootFlowCliTests(unittest.TestCase):
    def test_init_render_status_command_creates_status_manifest_from_persisted_tasks(self) -> None:
        trusted_plan = self._single_task_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            self._touch_task_inputs(workspace, trusted_plan)
            write_render_tasks_manifest(trusted_plan, workspace)
            stdout = io.StringIO()

            exit_code = main(
                [
                    "init-render-status",
                    "--workspace",
                    str(workspace),
                ],
                stdout=stdout,
            )
            loaded_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)

        printed_summary = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertTrue(printed_summary["created"])
        self.assertEqual(printed_summary["shoot_slug"], "cli-scheduler")
        self.assertEqual(printed_summary["task_count"], 1)
        self.assertEqual(printed_summary["pending_task_count"], 1)
        self.assertEqual(printed_summary["running_task_count"], 0)
        self.assertEqual(loaded_manifest.task_statuses[0].state, "pending")

    def test_init_render_status_command_is_idempotent_for_existing_status(self) -> None:
        trusted_plan = self._single_task_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            self._touch_task_inputs(workspace, trusted_plan)
            write_render_tasks_manifest(trusted_plan, workspace)
            write_render_status_manifest(
                RenderStatusManifest(
                    shoot_slug=trusted_plan.shoot_slug,
                    render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
                    task_statuses=(
                        RenderTaskStatus(
                            task_id="render_instagram_reel",
                            state="retryable",
                            renderer_adapter="dry-run-local",
                            attempts=1,
                            error_message="Manual output conflict needs review.",
                            updated_at="2026-05-07T16:00:30Z",
                        ),
                    ),
                ),
                workspace,
                trusted_plan=trusted_plan,
            )
            stdout = io.StringIO()

            exit_code = main(
                [
                    "init-render-status",
                    "--workspace",
                    str(workspace),
                ],
                stdout=stdout,
            )
            loaded_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)

        printed_summary = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertFalse(printed_summary["created"])
        self.assertEqual(printed_summary["pending_task_count"], 0)
        self.assertEqual(printed_summary["retryable_task_count"], 1)
        self.assertEqual(loaded_manifest.task_statuses[0].state, "retryable")
        self.assertEqual(loaded_manifest.task_statuses[0].attempts, 1)

    def test_init_render_status_command_rejects_stale_existing_status(self) -> None:
        trusted_plan = self._single_task_plan()
        stale_plan = AssemblyPlan(
            shoot_slug="cli-scheduler",
            render_tasks=(
                RenderTask(
                    task_id="render_instagram_reel",
                    sequence_name="reel",
                    source_job_id="assemble_instagram_reel",
                    output_kind="instagram_reel",
                    aspect_ratio="9:16",
                    inputs=(
                        "analysis/instagram_storylines.json",
                        "graded/grade_asset_00099/STALE.MOV",
                    ),
                    outputs=("deliverables/instagram_reel.mp4",),
                    depends_on=("rank_instagram_storylines", "grade_asset_00099"),
                    can_run_in_parallel=False,
                ),
            ),
        )

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            self._touch_task_inputs(workspace, trusted_plan)
            write_render_tasks_manifest(trusted_plan, workspace)
            write_render_status_manifest(
                self._pending_manifest(stale_plan),
                workspace,
                trusted_plan=stale_plan,
            )
            stdout = io.StringIO()
            stderr = io.StringIO()

            exit_code = main(
                [
                    "init-render-status",
                    "--workspace",
                    str(workspace),
                ],
                stdout=stdout,
                stderr=stderr,
            )
            loaded_stale_manifest = load_render_status_manifest(workspace, trusted_plan=stale_plan)

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout.getvalue(), "")
        self.assertIn("render plan fingerprint", stderr.getvalue())
        self.assertEqual(loaded_stale_manifest.render_plan_fingerprint, render_plan_fingerprint(stale_plan))

    def test_plan_import_route_command_discovers_capacity_gated_route_from_estimated_source(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            volumes = workspace / "Volumes"
            card = volumes / "EOS_DIGITAL"
            ssd = volumes / "Samsung_T7"
            (card / "DCIM" / "100CANON").mkdir(parents=True)
            ssd.mkdir(parents=True)
            (card / "DCIM" / "100CANON" / "A001.MOV").write_bytes(b"video-bytes")
            (card / "DCIM" / "100CANON" / "A001.JPG").write_bytes(b"photo-bytes")
            stdout = io.StringIO()

            exit_code = main(
                [
                    "plan-import-route",
                    "--volume-root",
                    str(volumes),
                    "--estimate-source-bytes",
                    "--headroom-bytes",
                    "0",
                    "--print-candidates",
                ],
                stdout=stdout,
            )

        printed_summary = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertEqual(printed_summary["status"], "ready_for_review")
        self.assertTrue(printed_summary["ready"])
        self.assertEqual(printed_summary["source"]["name"], "EOS_DIGITAL")
        self.assertEqual(printed_summary["destination"]["name"], "Samsung_T7")
        self.assertEqual(printed_summary["estimated_source_media"]["media_file_count"], 2)
        self.assertEqual(printed_summary["expected_import_bytes"], 22)
        self.assertIn("capacity gate active", " ".join(printed_summary["safety_notes"]))
        self.assertEqual(
            [candidate["name"] for candidate in printed_summary["discovered_candidates"]],
            ["EOS_DIGITAL", "Samsung_T7"],
        )

    def test_plan_import_route_command_blocks_cleanly_when_no_candidates_found(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            volumes = Path(tmp) / "Volumes"
            volumes.mkdir()
            stdout = io.StringIO()

            exit_code = main(
                [
                    "plan-import-route",
                    "--volume-root",
                    str(volumes),
                ],
                stdout=stdout,
            )

        printed_summary = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertEqual(printed_summary["status"], "blocked")
        self.assertFalse(printed_summary["ready"])
        self.assertIsNone(printed_summary["source"])
        self.assertIsNone(printed_summary["destination"])
        self.assertIn("no discovered storage candidates found", printed_summary["safety_notes"])

    def test_plan_import_route_command_rejects_conflicting_capacity_inputs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            volumes = Path(tmp) / "Volumes"
            volumes.mkdir()
            stdout = io.StringIO()
            stderr = io.StringIO()

            exit_code = main(
                [
                    "plan-import-route",
                    "--volume-root",
                    str(volumes),
                    "--expected-import-bytes",
                    "123",
                    "--estimate-source-bytes",
                ],
                stdout=stdout,
                stderr=stderr,
            )

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout.getvalue(), "")
        self.assertIn("cannot be combined", stderr.getvalue())

    def test_plan_import_route_command_rejects_invalid_capacity_values(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            volumes = Path(tmp) / "Volumes"
            volumes.mkdir()
            stdout = io.StringIO()
            stderr = io.StringIO()

            zero_exit_code = main(
                [
                    "plan-import-route",
                    "--volume-root",
                    str(volumes),
                    "--expected-import-bytes",
                    "0",
                ],
                stdout=stdout,
                stderr=stderr,
            )

        self.assertEqual(zero_exit_code, 1)
        self.assertEqual(stdout.getvalue(), "")
        self.assertIn("greater than zero", stderr.getvalue())

    def test_dry_run_scheduler_command_writes_and_prints_report(self) -> None:
        trusted_plan = self._single_task_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            self._touch_task_inputs(workspace, trusted_plan)
            write_render_tasks_manifest(trusted_plan, workspace)
            write_render_status_manifest(
                self._pending_manifest(trusted_plan),
                workspace,
                trusted_plan=trusted_plan,
            )
            stdout = io.StringIO()

            exit_code = main(
                [
                    "dry-run-render-scheduler",
                    "--workspace",
                    str(workspace),
                    "--completed-dependency",
                    "rank_instagram_storylines",
                    "--completed-dependency",
                    "grade_asset_00000",
                    "--renderer",
                    "dry-run-local",
                    "--started-at",
                    "2026-05-07T16:00:00Z",
                    "--completed-at",
                    "2026-05-07T16:00:05Z",
                    "--generated-at",
                    "2026-05-07T16:00:06Z",
                    "--max-concurrency",
                    "1",
                    "--max-iterations",
                    "3",
                    "--print-report",
                ],
                stdout=stdout,
            )
            final_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)
            loaded_report = load_dry_run_render_scheduler_report(
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
            )

        printed_report = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertEqual(loaded_report.stopped_reason, "complete")
        self.assertEqual(loaded_report.completed_task_ids, ("render_instagram_reel",))
        self.assertEqual(printed_report["stopped_reason"], "complete")
        self.assertEqual(printed_report["schema_version"], 1)
        self.assertEqual(printed_report["completed_task_ids"], ["render_instagram_reel"])
        self.assertEqual(printed_report["outputs_materialized"], ["deliverables/instagram_reel.mp4"])

    def test_dry_run_scheduler_command_rejects_untrusted_render_task_manifest(self) -> None:
        trusted_plan = self._single_task_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            manifest_path = write_render_tasks_manifest(trusted_plan, workspace)
            raw_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            raw_manifest["render_tasks"][0]["delete_after_render"] = True
            manifest_path.write_text(json.dumps(raw_manifest), encoding="utf-8")
            write_render_status_manifest(
                self._pending_manifest(trusted_plan),
                workspace,
                trusted_plan=trusted_plan,
            )
            stdout = io.StringIO()
            stderr = io.StringIO()

            exit_code = main(
                [
                    "dry-run-render-scheduler",
                    "--workspace",
                    str(workspace),
                    "--completed-dependency",
                    "rank_instagram_storylines",
                    "--renderer",
                    "dry-run-local",
                    "--started-at",
                    "2026-05-07T16:01:00Z",
                    "--completed-at",
                    "2026-05-07T16:01:05Z",
                    "--generated-at",
                    "2026-05-07T16:01:06Z",
                ],
                stdout=stdout,
                stderr=stderr,
            )

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout.getvalue(), "")
        self.assertIn("Unexpected render task field", stderr.getvalue())

    def _pending_manifest(self, trusted_plan: AssemblyPlan) -> RenderStatusManifest:
        return RenderStatusManifest(
            shoot_slug=trusted_plan.shoot_slug,
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
            task_statuses=tuple(
                RenderTaskStatus(task_id=task.task_id, state="pending")
                for task in trusted_plan.render_tasks
            ),
        )

    def _touch_task_inputs(self, workspace: Path, trusted_plan: AssemblyPlan) -> None:
        for task in trusted_plan.render_tasks:
            for relative_path in task.inputs:
                path = workspace / relative_path
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b"trusted input")

    def _single_task_plan(self) -> AssemblyPlan:
        return AssemblyPlan(
            shoot_slug="cli-scheduler",
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


if __name__ == "__main__":
    unittest.main()
