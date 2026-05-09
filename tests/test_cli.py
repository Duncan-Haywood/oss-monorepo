import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from shootflow.assembly import AssemblyPlan, RenderTask, write_render_tasks_manifest
from shootflow.catalog import load_ingest_manifest, production_assets_from_manifest
from shootflow.cli import main
from shootflow.demo_workspace import (
    DemoWorkspaceError,
    create_persisted_cli_demo_workspace,
)
from shootflow.production import ProductionPlan, build_production_plan
from shootflow.render_scheduler import load_dry_run_render_scheduler_report
from shootflow.render_status import (
    OutputChecksum,
    RenderStatusManifest,
    RenderTaskStatus,
    load_render_status_manifest,
    render_plan_fingerprint,
    write_render_status_manifest,
)
from shootflow.story import ContentSequence, StorylinePlan, write_storyline_artifact


class ShootFlowCliTests(unittest.TestCase):
    def test_persisted_cli_demo_workspace_runs_init_to_scheduler_report(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            demo = create_persisted_cli_demo_workspace(workspace)
            init_stdout = io.StringIO()
            scheduler_stdout = io.StringIO()

            init_exit_code = main(
                [
                    "init-render-status",
                    "--workspace",
                    str(workspace),
                ],
                stdout=init_stdout,
            )
            scheduler_args = [
                "dry-run-render-scheduler",
                "--workspace",
                str(workspace),
                "--renderer",
                "dry-run-local",
                "--started-at",
                "2026-05-08T15:10:00Z",
                "--completed-at",
                "2026-05-08T15:10:05Z",
                "--generated-at",
                "2026-05-08T15:10:06Z",
                "--max-concurrency",
                "3",
                "--max-iterations",
                "4",
                "--print-report",
            ]
            for dependency_id in demo.required_completed_dependency_ids:
                scheduler_args.extend(["--completed-dependency", dependency_id])

            scheduler_exit_code = main(scheduler_args, stdout=scheduler_stdout)
            final_manifest = load_render_status_manifest(workspace, trusted_plan=demo.trusted_plan)
            loaded_report = load_dry_run_render_scheduler_report(
                workspace,
                trusted_plan=demo.trusted_plan,
                final_manifest=final_manifest,
            )

        init_summary = json.loads(init_stdout.getvalue())
        printed_report = json.loads(scheduler_stdout.getvalue())
        self.assertEqual(init_exit_code, 0)
        self.assertTrue(init_summary["created"])
        self.assertEqual(init_summary["task_count"], 4)
        self.assertEqual(scheduler_exit_code, 0)
        self.assertEqual(loaded_report.stopped_reason, "complete")
        self.assertEqual(loaded_report.total_task_count, 4)
        self.assertEqual(tuple(printed_report["completed_task_ids"]), loaded_report.completed_task_ids)
        self.assertEqual(tuple(printed_report["outputs_materialized"]), demo.expected_output_paths)
        self.assertEqual(loaded_report.review_required_task_ids, ())

    def test_inspect_render_workspace_reports_missing_status_without_writes(self) -> None:
        trusted_plan = self._single_task_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            self._touch_task_inputs(workspace, trusted_plan)
            write_render_tasks_manifest(trusted_plan, workspace)
            stdout = io.StringIO()

            exit_code = main(
                [
                    "inspect-render-workspace",
                    "--workspace",
                    str(workspace),
                ],
                stdout=stdout,
            )

            self.assertFalse((workspace / "deliverables" / "render_status.json").exists())
            self.assertFalse((workspace / "deliverables" / "render_scheduler_report.json").exists())

        report = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertEqual(report["schema_version"], 1)
        self.assertEqual(report["status"], "needs_status_initialization")
        self.assertFalse(report["status_manifest_present"])
        self.assertFalse(report["scheduler_report_present"])
        self.assertEqual(report["task_counts_by_state"]["pending"], 1)
        self.assertEqual(report["expected_outputs"], ["deliverables/instagram_reel.mp4"])
        self.assertEqual(report["materialized_outputs"], [])
        self.assertEqual(report["review_required_task_ids"], [])
        self.assertEqual(report["safe_next_actions"], ["initialize_render_status"])

    def test_inspect_render_workspace_reports_completed_demo_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            demo = create_persisted_cli_demo_workspace(workspace)
            init_stdout = io.StringIO()
            scheduler_stdout = io.StringIO()
            inspect_stdout = io.StringIO()

            main(["init-render-status", "--workspace", str(workspace)], stdout=init_stdout)
            scheduler_args = [
                "dry-run-render-scheduler",
                "--workspace",
                str(workspace),
                "--renderer",
                "dry-run-local",
                "--started-at",
                "2026-05-08T15:10:00Z",
                "--completed-at",
                "2026-05-08T15:10:05Z",
                "--generated-at",
                "2026-05-08T15:10:06Z",
                "--max-concurrency",
                "3",
                "--max-iterations",
                "4",
            ]
            for dependency_id in demo.required_completed_dependency_ids:
                scheduler_args.extend(["--completed-dependency", dependency_id])
            main(scheduler_args, stdout=scheduler_stdout)

            exit_code = main(
                [
                    "inspect-render-workspace",
                    "--workspace",
                    str(workspace),
                ],
                stdout=inspect_stdout,
            )

        report = json.loads(inspect_stdout.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertEqual(report["status"], "complete")
        self.assertTrue(report["status_manifest_present"])
        self.assertTrue(report["scheduler_report_present"])
        self.assertEqual(report["task_counts_by_state"]["succeeded"], 4)
        self.assertEqual(report["materialized_outputs"], list(demo.expected_output_paths))
        self.assertEqual(report["safe_next_actions"], ["review_deliverables"])
        self.assertEqual(report["review_required_task_ids"], [])

    def test_inspect_render_workspace_rejects_stale_scheduler_report(self) -> None:
        trusted_plan = self._single_task_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            self._touch_task_inputs(workspace, trusted_plan)
            write_render_tasks_manifest(trusted_plan, workspace)
            main(["init-render-status", "--workspace", str(workspace)], stdout=io.StringIO())
            main(
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
                    "2026-05-08T15:10:00Z",
                    "--completed-at",
                    "2026-05-08T15:10:05Z",
                    "--generated-at",
                    "2026-05-08T15:10:06Z",
                ],
                stdout=io.StringIO(),
            )
            write_render_status_manifest(
                self._pending_manifest(trusted_plan),
                workspace,
                trusted_plan=trusted_plan,
            )
            stdout = io.StringIO()
            stderr = io.StringIO()

            exit_code = main(
                [
                    "inspect-render-workspace",
                    "--workspace",
                    str(workspace),
                ],
                stdout=stdout,
                stderr=stderr,
            )

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout.getvalue(), "")
        self.assertIn("scheduler report", stderr.getvalue())

    def test_inspect_render_workspace_requires_succeeded_outputs_to_exist(self) -> None:
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
                            state="succeeded",
                            renderer_adapter="dry-run-local",
                            attempts=1,
                            output_checksums=(
                                OutputChecksum(
                                    path="deliverables/instagram_reel.mp4",
                                    sha256="0" * 64,
                                ),
                            ),
                            updated_at="2026-05-08T15:10:05Z",
                        ),
                    ),
                ),
                workspace,
                trusted_plan=trusted_plan,
            )
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
        self.assertEqual(report["status"], "needs_review")
        self.assertEqual(report["materialized_outputs"], [])
        self.assertEqual(report["review_required_task_ids"], ["render_instagram_reel"])
        self.assertEqual(report["safe_next_actions"], ["review_render_outputs"])

    def test_inspect_render_workspace_requires_succeeded_outputs_to_match_checksums(self) -> None:
        trusted_plan = self._single_task_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            self._touch_task_inputs(workspace, trusted_plan)
            write_render_tasks_manifest(trusted_plan, workspace)
            output_path = workspace / "deliverables" / "instagram_reel.mp4"
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(b"mutated-render-output")
            write_render_status_manifest(
                RenderStatusManifest(
                    shoot_slug=trusted_plan.shoot_slug,
                    render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
                    task_statuses=(
                        RenderTaskStatus(
                            task_id="render_instagram_reel",
                            state="succeeded",
                            renderer_adapter="dry-run-local",
                            attempts=1,
                            output_checksums=(
                                OutputChecksum(
                                    path="deliverables/instagram_reel.mp4",
                                    sha256="0" * 64,
                                ),
                            ),
                            updated_at="2026-05-08T15:10:05Z",
                        ),
                    ),
                ),
                workspace,
                trusted_plan=trusted_plan,
            )
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
        self.assertEqual(report["status"], "needs_review")
        self.assertEqual(report["materialized_outputs"], ["deliverables/instagram_reel.mp4"])
        self.assertEqual(report["checksum_mismatch_task_ids"], ["render_instagram_reel"])
        self.assertEqual(report["review_required_task_ids"], ["render_instagram_reel"])
        self.assertEqual(report["safe_next_actions"], ["review_render_outputs"])

    def test_inspect_render_workspace_rejects_symlinked_output_parent(self) -> None:
        trusted_plan = AssemblyPlan(
            shoot_slug="cli-scheduler",
            render_tasks=(
                RenderTask(
                    task_id="render_instagram_reel_variant_hero",
                    sequence_name="reel",
                    source_job_id="assemble_instagram_reel",
                    output_kind="instagram_reel",
                    aspect_ratio="9:16",
                    inputs=(
                        "analysis/instagram_storylines.json",
                        "graded/grade_asset_00000/A001.MOV",
                    ),
                    outputs=("deliverables/instagram_reels/hero.mp4",),
                    depends_on=("rank_instagram_storylines", "grade_asset_00000"),
                    can_run_in_parallel=False,
                ),
            ),
        )
        output_bytes = b"outside-render-output"

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            outside = workspace / "outside"
            outside_output_dir = outside / "instagram_reels"
            outside_output_path = outside_output_dir / "hero.mp4"
            self._touch_task_inputs(workspace, trusted_plan)
            write_render_tasks_manifest(trusted_plan, workspace)
            outside_output_dir.mkdir(parents=True)
            outside_output_path.write_bytes(output_bytes)
            (workspace / "deliverables" / "instagram_reels").symlink_to(
                outside_output_dir,
                target_is_directory=True,
            )
            write_render_status_manifest(
                RenderStatusManifest(
                    shoot_slug=trusted_plan.shoot_slug,
                    render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
                    task_statuses=(
                        RenderTaskStatus(
                            task_id="render_instagram_reel_variant_hero",
                            state="succeeded",
                            renderer_adapter="dry-run-local",
                            attempts=1,
                            output_checksums=(
                                OutputChecksum(
                                    path="deliverables/instagram_reels/hero.mp4",
                                    sha256=hashlib.sha256(output_bytes).hexdigest(),
                                ),
                            ),
                            updated_at="2026-05-08T15:10:05Z",
                        ),
                    ),
                ),
                workspace,
                trusted_plan=trusted_plan,
            )
            stdout = io.StringIO()
            stderr = io.StringIO()

            exit_code = main(
                [
                    "inspect-render-workspace",
                    "--workspace",
                    str(workspace),
                ],
                stdout=stdout,
                stderr=stderr,
            )

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout.getvalue(), "")
        self.assertIn("symlink", stderr.getvalue())

    def test_inspect_render_workspace_rejects_symlinked_output_file(self) -> None:
        trusted_plan = self._single_task_plan()
        output_bytes = b"outside-render-output"

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            outside = workspace / "outside"
            outside_output_path = outside / "instagram_reel.mp4"
            self._touch_task_inputs(workspace, trusted_plan)
            write_render_tasks_manifest(trusted_plan, workspace)
            outside.mkdir()
            outside_output_path.write_bytes(output_bytes)
            (workspace / "deliverables" / "instagram_reel.mp4").symlink_to(outside_output_path)
            write_render_status_manifest(
                RenderStatusManifest(
                    shoot_slug=trusted_plan.shoot_slug,
                    render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
                    task_statuses=(
                        RenderTaskStatus(
                            task_id="render_instagram_reel",
                            state="succeeded",
                            renderer_adapter="dry-run-local",
                            attempts=1,
                            output_checksums=(
                                OutputChecksum(
                                    path="deliverables/instagram_reel.mp4",
                                    sha256=hashlib.sha256(output_bytes).hexdigest(),
                                ),
                            ),
                            updated_at="2026-05-08T15:10:05Z",
                        ),
                    ),
                ),
                workspace,
                trusted_plan=trusted_plan,
            )
            stdout = io.StringIO()
            stderr = io.StringIO()

            exit_code = main(
                [
                    "inspect-render-workspace",
                    "--workspace",
                    str(workspace),
                ],
                stdout=stdout,
                stderr=stderr,
            )

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout.getvalue(), "")
        self.assertIn("symlink", stderr.getvalue())

    def test_inspect_render_workspace_flags_completed_report_after_output_removal(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            demo = create_persisted_cli_demo_workspace(workspace)
            main(["init-render-status", "--workspace", str(workspace)], stdout=io.StringIO())
            scheduler_args = [
                "dry-run-render-scheduler",
                "--workspace",
                str(workspace),
                "--renderer",
                "dry-run-local",
                "--started-at",
                "2026-05-08T15:10:00Z",
                "--completed-at",
                "2026-05-08T15:10:05Z",
                "--generated-at",
                "2026-05-08T15:10:06Z",
                "--max-concurrency",
                "3",
                "--max-iterations",
                "4",
            ]
            for dependency_id in demo.required_completed_dependency_ids:
                scheduler_args.extend(["--completed-dependency", dependency_id])
            main(scheduler_args, stdout=io.StringIO())
            (workspace / demo.expected_output_paths[0]).unlink()
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
        self.assertEqual(report["status"], "needs_review")
        self.assertNotIn(demo.expected_output_paths[0], report["materialized_outputs"])
        self.assertIn("render_instagram_reel", report["review_required_task_ids"])
        self.assertEqual(report["safe_next_actions"], ["review_render_outputs"])

    def test_persisted_cli_demo_workspace_refuses_to_overwrite_existing_input(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            storyline_path = workspace / "analysis" / "instagram_storylines.json"
            storyline_path.parent.mkdir(parents=True)
            storyline_path.write_bytes(b"user-owned storyline")

            with self.assertRaisesRegex(DemoWorkspaceError, "Refusing to overwrite"):
                create_persisted_cli_demo_workspace(workspace)

            self.assertEqual(storyline_path.read_bytes(), b"user-owned storyline")
            self.assertFalse((workspace / "deliverables" / "render_tasks.json").exists())

    def test_persisted_cli_demo_workspace_rejects_later_input_conflict_without_side_effects(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            later_input = workspace / "graded" / "grade_asset_00002" / "BTS.MOV"
            later_input.parent.mkdir(parents=True)
            later_input.write_bytes(b"user-owned bts edit")

            with self.assertRaisesRegex(DemoWorkspaceError, "Refusing to overwrite"):
                create_persisted_cli_demo_workspace(workspace)

            self.assertEqual(later_input.read_bytes(), b"user-owned bts edit")
            self.assertFalse((workspace / "analysis" / "instagram_storylines.json").exists())
            self.assertFalse((workspace / "graded" / "grade_asset_00000" / "A001.MOV").exists())
            self.assertFalse((workspace / "deliverables" / "render_tasks.json").exists())

    def test_persisted_cli_demo_workspace_rejects_existing_manifest_without_side_effects(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            write_render_tasks_manifest(self._single_task_plan(), workspace)

            with self.assertRaisesRegex(DemoWorkspaceError, "render task manifest"):
                create_persisted_cli_demo_workspace(workspace)

            self.assertFalse((workspace / "analysis" / "instagram_storylines.json").exists())
            self.assertFalse((workspace / "graded" / "grade_asset_00000" / "A001.MOV").exists())

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


class ShootFlowIngestCliTests(unittest.TestCase):
    def test_preview_ingest_command_outputs_planned_items_without_copying(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            card = root / "card"
            destination = root / "library"
            raw = card / "DCIM" / "100EOS5D" / "IMG_0001.CR3"
            jpeg = card / "DCIM" / "100EOS5D" / "IMG_0001.JPG"
            raw.parent.mkdir(parents=True)
            raw.write_bytes(b"raw-bytes")
            jpeg.write_bytes(b"jpeg-bytes")
            stdout = io.StringIO()

            exit_code = main(
                [
                    "preview-ingest",
                    "--source",
                    str(card),
                    "--destination",
                    str(destination),
                    "--shoot-date",
                    "2026-05-08",
                    "--shoot-slug",
                    "desert-editorial",
                ],
                stdout=stdout,
            )

            shoot_folder = destination / "2026-05-08_desert-editorial"
            preview = json.loads(stdout.getvalue())

            self.assertEqual(exit_code, 0)
            self.assertEqual(preview["item_count"], 2)
            self.assertEqual(
                sorted(item["relative_path"] for item in preview["items"]),
                [
                    "DCIM/100EOS5D/IMG_0001.CR3",
                    "DCIM/100EOS5D/IMG_0001.JPG",
                ],
            )
            for item in preview["items"]:
                self.assertEqual(len(item["checksum_sha256"]), 64)
                self.assertGreater(item["size_bytes"], 0)
            self.assertEqual(preview["shoot_slug"], "desert-editorial")
            self.assertEqual(preview["shoot_date"], "2026-05-08")
            self.assertEqual(preview["shoot_folder"], str(shoot_folder))
            self.assertIn("preview only - no files were copied", preview["notes"])
            # Confirm no destination-side files were created.
            self.assertFalse(shoot_folder.exists())

    def test_execute_ingest_command_requires_confirm_flag(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            card = root / "card"
            destination = root / "library"
            raw = card / "DCIM" / "100EOS5D" / "IMG_0001.CR3"
            raw.parent.mkdir(parents=True)
            raw.write_bytes(b"raw-bytes")
            stdout = io.StringIO()
            stderr = io.StringIO()

            exit_code = main(
                [
                    "execute-ingest",
                    "--source",
                    str(card),
                    "--destination",
                    str(destination),
                    "--shoot-date",
                    "2026-05-08",
                    "--shoot-slug",
                    "desert-editorial",
                ],
                stdout=stdout,
                stderr=stderr,
            )

            shoot_folder = destination / "2026-05-08_desert-editorial"

            self.assertEqual(exit_code, 1)
            self.assertEqual(stdout.getvalue(), "")
            self.assertIn("--confirm", stderr.getvalue())
            # No copy or manifest occurred.
            self.assertFalse(shoot_folder.exists())
            # Source still intact.
            self.assertEqual(raw.read_bytes(), b"raw-bytes")

    def test_execute_ingest_command_with_confirm_writes_checksum_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            card = root / "card"
            destination = root / "library"
            raw = card / "DCIM" / "100EOS5D" / "IMG_0001.CR3"
            jpeg = card / "DCIM" / "100EOS5D" / "IMG_0001.JPG"
            raw.parent.mkdir(parents=True)
            raw.write_bytes(b"raw-bytes")
            jpeg.write_bytes(b"jpeg-bytes")
            stdout = io.StringIO()

            exit_code = main(
                [
                    "execute-ingest",
                    "--source",
                    str(card),
                    "--destination",
                    str(destination),
                    "--shoot-date",
                    "2026-05-08",
                    "--shoot-slug",
                    "desert-editorial",
                    "--confirm",
                ],
                stdout=stdout,
            )

            shoot_folder = destination / "2026-05-08_desert-editorial"
            manifest_path = shoot_folder / "ingest_manifest.json"
            response = json.loads(stdout.getvalue())
            manifest_data = json.loads(manifest_path.read_text(encoding="utf-8"))

            self.assertEqual(exit_code, 0)
            self.assertEqual(response["copied"], 2)
            self.assertEqual(response["skipped"], 0)
            self.assertEqual(response["item_count"], 2)
            self.assertEqual(response["shoot_slug"], "desert-editorial")
            self.assertEqual(response["shoot_folder"], str(shoot_folder))
            self.assertEqual(response["manifest_path"], str(manifest_path))
            self.assertIn("no source files were deleted", response["notes"])
            # Source files untouched.
            self.assertEqual(raw.read_bytes(), b"raw-bytes")
            self.assertEqual(jpeg.read_bytes(), b"jpeg-bytes")
            # Destination files match source bytes.
            copied_raw = shoot_folder / "originals" / "DCIM" / "100EOS5D" / "IMG_0001.CR3"
            copied_jpeg = shoot_folder / "originals" / "DCIM" / "100EOS5D" / "IMG_0001.JPG"
            self.assertEqual(copied_raw.read_bytes(), b"raw-bytes")
            self.assertEqual(copied_jpeg.read_bytes(), b"jpeg-bytes")
            # Manifest records non-destructive copy.
            self.assertFalse(manifest_data["source_deleted"])
            self.assertEqual(len(manifest_data["items"]), 2)

    def test_execute_ingest_command_rejects_symlinked_source_without_deleting_source(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            card = root / "card"
            destination = root / "library"
            real_media = card / "real" / "IMG_0001.MOV"
            symlink_media = card / "linked.MOV"
            real_media.parent.mkdir(parents=True)
            real_media.write_bytes(b"video-bytes")
            symlink_media.symlink_to(real_media)
            stdout = io.StringIO()
            stderr = io.StringIO()

            exit_code = main(
                [
                    "execute-ingest",
                    "--source",
                    str(card),
                    "--destination",
                    str(destination),
                    "--shoot-date",
                    "2026-05-08",
                    "--shoot-slug",
                    "wedding",
                    "--confirm",
                ],
                stdout=stdout,
                stderr=stderr,
            )

            shoot_folder = destination / "2026-05-08_wedding"

            self.assertEqual(exit_code, 1)
            self.assertEqual(stdout.getvalue(), "")
            self.assertIn("symlink", stderr.getvalue().lower())
            # No destination-side artifacts were created.
            self.assertFalse(shoot_folder.exists())
            # Source untouched.
            self.assertEqual(real_media.read_bytes(), b"video-bytes")
            self.assertTrue(symlink_media.is_symlink())

    def test_preview_ingest_command_rejects_invalid_shoot_slug(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            card = root / "card"
            destination = root / "library"
            (card / "IMG_0001.JPG").parent.mkdir(parents=True)
            (card / "IMG_0001.JPG").write_bytes(b"jpeg-bytes")
            stdout = io.StringIO()
            stderr = io.StringIO()

            exit_code = main(
                [
                    "preview-ingest",
                    "--source",
                    str(card),
                    "--destination",
                    str(destination),
                    "--shoot-date",
                    "2026-05-08",
                    "--shoot-slug",
                    "../escape",
                ],
                stdout=stdout,
                stderr=stderr,
            )

            self.assertEqual(exit_code, 1)
            self.assertEqual(stdout.getvalue(), "")
            self.assertIn("Invalid shoot slug", stderr.getvalue())


class ShootFlowProductionPlanCliTests(unittest.TestCase):
    def test_plan_production_command_summarizes_manifest_backed_pipeline_without_writes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            card = root / "card"
            destination = root / "library"
            raw = card / "DCIM" / "100EOS5D" / "IMG_0001.CR3"
            jpeg = card / "DCIM" / "100EOS5D" / "IMG_0001.JPG"
            clip = card / "PRIVATE" / "A001.MOV"
            audio = card / "PRIVATE" / "A001.WAV"
            raw.parent.mkdir(parents=True)
            clip.parent.mkdir(parents=True)
            raw.write_bytes(b"raw-bytes")
            jpeg.write_bytes(b"jpeg-bytes")
            clip.write_bytes(b"video-bytes")
            audio.write_bytes(b"scratch-audio")
            ingest_stdout = io.StringIO()

            ingest_exit_code = main(
                [
                    "execute-ingest",
                    "--source",
                    str(card),
                    "--destination",
                    str(destination),
                    "--shoot-date",
                    "2026-05-08",
                    "--shoot-slug",
                    "desert-editorial",
                    "--confirm",
                ],
                stdout=ingest_stdout,
            )
            shoot_folder = destination / "2026-05-08_desert-editorial"
            manifest_path = shoot_folder / "ingest_manifest.json"
            plan_stdout = io.StringIO()

            plan_exit_code = main(
                [
                    "plan-production",
                    "--ingest-manifest",
                    str(manifest_path),
                ],
                stdout=plan_stdout,
            )

            report = json.loads(plan_stdout.getvalue())
            self.assertEqual(ingest_exit_code, 0)
            self.assertEqual(plan_exit_code, 0)
            self.assertEqual(report["schema_version"], 1)
            self.assertEqual(report["manifest_path"], str(manifest_path))
            self.assertEqual(report["workspace"], str(shoot_folder))
            self.assertEqual(report["shoot_date"], "2026-05-08")
            self.assertEqual(report["shoot_slug"], "desert-editorial")
            self.assertEqual(report["asset_counts"], {"photo": 2, "video": 1, "total": 3})
            self.assertEqual(report["copied_manifest_item_count"], 4)
            self.assertEqual(report["production_plan"]["job_count"], 15)
            self.assertEqual(report["production_plan"]["parallel_job_count"], 9)
            self.assertEqual(report["production_plan"]["serial_job_count"], 6)
            self.assertEqual(
                [(wave["wave_index"], wave["job_count"], wave["output_kinds"]) for wave in report["waves"]],
                [
                    (0, 3, ["proxy_media"]),
                    (1, 3, ["vlm_asset_analysis"]),
                    (2, 1, ["scene_grouping"]),
                    (3, 1, ["look_development"]),
                    (4, 3, ["graded_photo", "graded_video"]),
                    (5, 1, ["storyline_selection"]),
                    (6, 3, ["instagram_carousel", "instagram_photo_set", "instagram_reel"]),
                ],
            )
            self.assertEqual(
                [deliverable["output_kind"] for deliverable in report["deliverables"]],
                ["instagram_reel", "instagram_carousel", "instagram_photo_set"],
            )
            self.assertIn("read-only production plan", report["notes"])
            self.assertFalse((shoot_folder / "analysis").exists())
            self.assertFalse((shoot_folder / "graded").exists())
            self.assertFalse((shoot_folder / "deliverables").exists())

    def test_plan_production_command_rejects_deleted_source_manifest_without_writes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            card = root / "card"
            destination = root / "library"
            photo = card / "IMG_0001.JPG"
            photo.parent.mkdir(parents=True)
            photo.write_bytes(b"photo-bytes")
            ingest_stdout = io.StringIO()
            main(
                [
                    "execute-ingest",
                    "--source",
                    str(card),
                    "--destination",
                    str(destination),
                    "--shoot-date",
                    "2026-05-08",
                    "--shoot-slug",
                    "unsafe-deletion",
                    "--confirm",
                ],
                stdout=ingest_stdout,
            )
            shoot_folder = destination / "2026-05-08_unsafe-deletion"
            manifest_path = shoot_folder / "ingest_manifest.json"
            manifest_data = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest_data["source_deleted"] = True
            manifest_path.write_text(json.dumps(manifest_data), encoding="utf-8")
            stdout = io.StringIO()
            stderr = io.StringIO()

            exit_code = main(
                [
                    "plan-production",
                    "--ingest-manifest",
                    str(manifest_path),
                ],
                stdout=stdout,
                stderr=stderr,
            )

            self.assertEqual(exit_code, 1)
            self.assertEqual(stdout.getvalue(), "")
            self.assertIn("source media was deleted", stderr.getvalue())
            self.assertFalse((shoot_folder / "analysis").exists())
            self.assertFalse((shoot_folder / "graded").exists())
            self.assertFalse((shoot_folder / "deliverables").exists())

    def test_next_production_wave_command_reports_ready_wave_without_writes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            card = root / "card"
            destination = root / "library"
            raw = card / "DCIM" / "100EOS5D" / "IMG_0001.CR3"
            clip = card / "PRIVATE" / "A001.MOV"
            raw.parent.mkdir(parents=True)
            clip.parent.mkdir(parents=True)
            raw.write_bytes(b"raw-bytes")
            clip.write_bytes(b"video-bytes")
            ingest_stdout = io.StringIO()
            main(
                [
                    "execute-ingest",
                    "--source",
                    str(card),
                    "--destination",
                    str(destination),
                    "--shoot-date",
                    "2026-05-09",
                    "--shoot-slug",
                    "next-wave",
                    "--confirm",
                ],
                stdout=ingest_stdout,
            )
            shoot_folder = destination / "2026-05-09_next-wave"
            manifest_path = shoot_folder / "ingest_manifest.json"
            stdout = io.StringIO()

            exit_code = main(
                [
                    "next-production-wave",
                    "--ingest-manifest",
                    str(manifest_path),
                    "--completed-job",
                    "proxy_asset_00001",
                    "--completed-job",
                    "proxy_asset_00000",
                ],
                stdout=stdout,
            )

            report = json.loads(stdout.getvalue())
            self.assertEqual(exit_code, 0)
            self.assertEqual(report["schema_version"], 1)
            self.assertEqual(report["status"], "ready")
            self.assertEqual(report["wave_index"], 1)
            self.assertEqual(report["manifest_path"], str(manifest_path))
            self.assertEqual(report["workspace"], str(shoot_folder))
            self.assertEqual(report["completed_job_ids"], ["proxy_asset_00000", "proxy_asset_00001"])
            self.assertEqual(
                [job["job_id"] for job in report["jobs"]],
                ["analyze_asset_00000", "analyze_asset_00001"],
            )
            self.assertIn("read-only production wave handoff", report["notes"])
            self.assertFalse((shoot_folder / "analysis").exists())
            self.assertFalse((shoot_folder / "graded").exists())
            self.assertFalse((shoot_folder / "deliverables").exists())

    def test_next_production_wave_command_rejects_unknown_completed_job_without_writes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            card = root / "card"
            destination = root / "library"
            photo = card / "IMG_0001.JPG"
            photo.parent.mkdir(parents=True)
            photo.write_bytes(b"photo-bytes")
            ingest_stdout = io.StringIO()
            main(
                [
                    "execute-ingest",
                    "--source",
                    str(card),
                    "--destination",
                    str(destination),
                    "--shoot-date",
                    "2026-05-09",
                    "--shoot-slug",
                    "unknown-completed",
                    "--confirm",
                ],
                stdout=ingest_stdout,
            )
            shoot_folder = destination / "2026-05-09_unknown-completed"
            manifest_path = shoot_folder / "ingest_manifest.json"
            stdout = io.StringIO()
            stderr = io.StringIO()

            exit_code = main(
                [
                    "next-production-wave",
                    "--ingest-manifest",
                    str(manifest_path),
                    "--completed-job",
                    "missing-job",
                ],
                stdout=stdout,
                stderr=stderr,
            )

            self.assertEqual(exit_code, 1)
            self.assertEqual(stdout.getvalue(), "")
            self.assertIn("Unknown production job", stderr.getvalue())
            self.assertFalse((shoot_folder / "analysis").exists())
            self.assertFalse((shoot_folder / "graded").exists())
            self.assertFalse((shoot_folder / "deliverables").exists())


class ShootFlowRenderTaskCliTests(unittest.TestCase):
    def test_write_render_tasks_command_persists_trusted_assembly_handoff(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifest_path, production_plan = self._create_ingested_workspace(root)
            workspace = manifest_path.parent
            video_grade = self._graded_outputs(production_plan, "graded_video")[0]
            first_photo_grade, second_photo_grade = self._graded_outputs(
                production_plan,
                "graded_photo",
            )
            self._touch_graded_files(
                workspace,
                (video_grade, first_photo_grade, second_photo_grade),
            )
            write_storyline_artifact(
                StorylinePlan(
                    reel=ContentSequence(
                        output_kind="instagram_reel",
                        aspect_ratio="9:16",
                        asset_paths=(video_grade,),
                        total_duration_seconds=8.0,
                        rationale="Use the hero video.",
                    ),
                    carousel=ContentSequence(
                        output_kind="instagram_carousel",
                        aspect_ratio="4:5",
                        asset_paths=(first_photo_grade,),
                        total_duration_seconds=None,
                        rationale="Use the strongest frame.",
                    ),
                    photo_set=ContentSequence(
                        output_kind="instagram_photo_set",
                        aspect_ratio="4:5",
                        asset_paths=(first_photo_grade, second_photo_grade),
                        total_duration_seconds=None,
                        rationale="Export all ranked photos.",
                    ),
                ),
                workspace,
                allowed_asset_paths={video_grade, first_photo_grade, second_photo_grade},
            )
            stdout = io.StringIO()

            exit_code = main(
                [
                    "write-render-tasks",
                    "--ingest-manifest",
                    str(manifest_path),
                    "--photo-set-chunk-size",
                    "1",
                ],
                stdout=stdout,
            )
            summary = json.loads(stdout.getvalue())
            manifest_data = json.loads(
                (workspace / "deliverables" / "render_tasks.json").read_text(encoding="utf-8")
            )
            reel_output_exists_before_scheduler = (
                workspace / "deliverables" / "instagram_reel.mp4"
            ).exists()
            init_stdout = io.StringIO()
            scheduler_stdout = io.StringIO()
            init_exit_code = main(
                summary["next_actions"][0]["command"],
                stdout=init_stdout,
            )
            scheduler_exit_code = main(
                [
                    *summary["next_actions"][1]["command"],
                    "--renderer",
                    "dry-run-local",
                    "--started-at",
                    "2026-05-08T16:30:00Z",
                    "--completed-at",
                    "2026-05-08T16:30:05Z",
                    "--generated-at",
                    "2026-05-08T16:30:06Z",
                    "--max-concurrency",
                    "2",
                    "--max-iterations",
                    "4",
                    "--print-report",
                ],
                stdout=scheduler_stdout,
            )
            scheduler_report = json.loads(scheduler_stdout.getvalue())

        self.assertEqual(exit_code, 0)
        self.assertTrue(summary["created"])
        self.assertEqual(summary["workspace"], str(workspace))
        self.assertEqual(summary["ingest_manifest_path"], str(manifest_path))
        self.assertEqual(summary["shoot_slug"], "render-handoff")
        self.assertEqual(summary["task_count"], 4)
        self.assertEqual(
            summary["task_ids"],
            [
                "render_instagram_reel",
                "render_instagram_carousel",
                "export_instagram_photo_set_part_00001",
                "export_instagram_photo_set_part_00002",
            ],
        )
        self.assertIn("writes render task manifest only", summary["notes"])
        self.assertEqual(
            summary["next_actions"],
            [
                {
                    "name": "init_render_status",
                    "command": [
                        "init-render-status",
                        "--workspace",
                        str(workspace),
                    ],
                    "writes_files": True,
                },
                {
                    "name": "run_dry_run_render_scheduler",
                    "command": [
                        "dry-run-render-scheduler",
                        "--workspace",
                        str(workspace),
                        "--completed-dependency",
                        "rank_instagram_storylines",
                        "--completed-dependency",
                        "grade_asset_00002",
                        "--completed-dependency",
                        "grade_asset_00000",
                        "--completed-dependency",
                        "grade_asset_00001",
                    ],
                    "requires_runtime_args": [
                        "--renderer",
                        "--started-at",
                        "--completed-at",
                        "--generated-at",
                    ],
                    "writes_files": True,
                },
            ],
        )
        self.assertEqual(
            [task["task_id"] for task in manifest_data["render_tasks"]],
            summary["task_ids"],
        )
        self.assertFalse(reel_output_exists_before_scheduler)
        self.assertEqual(init_exit_code, 0)
        self.assertEqual(scheduler_exit_code, 0)
        self.assertEqual(scheduler_report["stopped_reason"], "complete")
        self.assertEqual(scheduler_report["completed_task_ids"], summary["task_ids"])

    def test_write_render_tasks_command_refuses_existing_different_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifest_path, production_plan = self._create_ingested_workspace(root)
            workspace = manifest_path.parent
            video_grade = self._graded_outputs(production_plan, "graded_video")[0]
            self._touch_graded_files(workspace, (video_grade,))
            write_storyline_artifact(
                StorylinePlan(
                    reel=ContentSequence(
                        output_kind="instagram_reel",
                        aspect_ratio="9:16",
                        asset_paths=(video_grade,),
                        total_duration_seconds=8.0,
                        rationale="Use the hero video.",
                    ),
                    carousel=ContentSequence(
                        output_kind="instagram_carousel",
                        aspect_ratio="4:5",
                        asset_paths=(),
                        total_duration_seconds=None,
                        rationale="No carousel selected.",
                    ),
                    photo_set=ContentSequence(
                        output_kind="instagram_photo_set",
                        aspect_ratio="4:5",
                        asset_paths=(),
                        total_duration_seconds=None,
                        rationale="No photo set selected.",
                    ),
                ),
                workspace,
                allowed_asset_paths={video_grade},
            )
            existing_plan = self._single_task_plan()
            write_render_tasks_manifest(existing_plan, workspace)
            existing_manifest = (workspace / "deliverables" / "render_tasks.json").read_text(
                encoding="utf-8"
            )
            stdout = io.StringIO()
            stderr = io.StringIO()

            exit_code = main(
                [
                    "write-render-tasks",
                    "--ingest-manifest",
                    str(manifest_path),
                ],
                stdout=stdout,
                stderr=stderr,
            )
            after_manifest = (workspace / "deliverables" / "render_tasks.json").read_text(
                encoding="utf-8"
            )

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout.getvalue(), "")
        self.assertIn("not match trusted assembly plan", stderr.getvalue())
        self.assertEqual(after_manifest, existing_manifest)

    def test_write_render_tasks_command_reports_reused_manifest_after_creation_race(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifest_path, production_plan = self._create_ingested_workspace(root)
            workspace = manifest_path.parent
            video_grade = self._graded_outputs(production_plan, "graded_video")[0]
            self._touch_graded_files(workspace, (video_grade,))
            write_storyline_artifact(
                StorylinePlan(
                    reel=ContentSequence(
                        output_kind="instagram_reel",
                        aspect_ratio="9:16",
                        asset_paths=(video_grade,),
                        total_duration_seconds=8.0,
                        rationale="Use the hero video.",
                    ),
                    carousel=ContentSequence(
                        output_kind="instagram_carousel",
                        aspect_ratio="4:5",
                        asset_paths=(),
                        total_duration_seconds=None,
                        rationale="No carousel selected.",
                    ),
                    photo_set=ContentSequence(
                        output_kind="instagram_photo_set",
                        aspect_ratio="4:5",
                        asset_paths=(),
                        total_duration_seconds=None,
                        rationale="No photo set selected.",
                    ),
                ),
                workspace,
                allowed_asset_paths={video_grade},
            )
            stdout = io.StringIO()

            def simulate_matching_manifest_race(src, dst):
                Path(dst).write_text(Path(src).read_text(encoding="utf-8"), encoding="utf-8")
                raise FileExistsError("matching manifest appeared concurrently")

            with patch("shootflow.assembly.os.link", side_effect=simulate_matching_manifest_race):
                exit_code = main(
                    [
                        "write-render-tasks",
                        "--ingest-manifest",
                        str(manifest_path),
                    ],
                    stdout=stdout,
                )

            summary = json.loads(stdout.getvalue())

        self.assertEqual(exit_code, 0)
        self.assertFalse(summary["created"])
        self.assertEqual(
            summary["render_tasks_manifest_path"],
            str(workspace / "deliverables" / "render_tasks.json"),
        )

    def test_write_render_tasks_command_reports_invalid_ingest_manifest_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            workspace = root / "library" / "2026-05-08_bad-json"
            workspace.mkdir(parents=True)
            manifest_path = workspace / "ingest_manifest.json"
            manifest_path.write_text("{not-json", encoding="utf-8")
            stdout = io.StringIO()
            stderr = io.StringIO()

            exit_code = main(
                [
                    "write-render-tasks",
                    "--ingest-manifest",
                    str(manifest_path),
                ],
                stdout=stdout,
                stderr=stderr,
            )

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout.getvalue(), "")
        self.assertIn("Invalid ingest manifest JSON", stderr.getvalue())

    def _create_ingested_workspace(self, root: Path) -> tuple[Path, ProductionPlan]:
        card = root / "card"
        destination = root / "library"
        video = card / "PRIVATE" / "A001.MOV"
        raw = card / "DCIM" / "100EOS5D" / "IMG_0001.CR3"
        jpeg = card / "DCIM" / "100EOS5D" / "IMG_0002.JPG"
        video.parent.mkdir(parents=True)
        raw.parent.mkdir(parents=True)
        video.write_bytes(b"video-bytes")
        raw.write_bytes(b"raw-bytes")
        jpeg.write_bytes(b"jpeg-bytes")
        stdout = io.StringIO()
        exit_code = main(
            [
                "execute-ingest",
                "--source",
                str(card),
                "--destination",
                str(destination),
                "--shoot-date",
                "2026-05-08",
                "--shoot-slug",
                "render-handoff",
                "--confirm",
            ],
            stdout=stdout,
        )
        self.assertEqual(exit_code, 0)
        manifest_path = destination / "2026-05-08_render-handoff" / "ingest_manifest.json"
        catalog = load_ingest_manifest(manifest_path)
        return manifest_path, build_production_plan(
            production_assets_from_manifest(catalog),
            shoot_slug=catalog.shoot_slug,
        )

    def _touch_graded_files(self, workspace: Path, relative_paths: tuple[str, ...]) -> None:
        for relative_path in relative_paths:
            path = workspace / relative_path
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b"graded media")

    def _graded_outputs(self, production_plan: ProductionPlan, output_kind: str) -> tuple[str, ...]:
        return tuple(
            job.outputs[0]
            for job in production_plan.jobs
            if job.output_kind == output_kind
        )

    def _single_task_plan(self) -> AssemblyPlan:
        return AssemblyPlan(
            shoot_slug="existing-render-handoff",
            render_tasks=(
                RenderTask(
                    task_id="render_instagram_reel",
                    sequence_name="reel",
                    source_job_id="assemble_instagram_reel",
                    output_kind="instagram_reel",
                    aspect_ratio="9:16",
                    inputs=(
                        "analysis/instagram_storylines.json",
                        "graded/grade_asset_99999/OTHER.MOV",
                    ),
                    outputs=("deliverables/instagram_reel.mp4",),
                    depends_on=("rank_instagram_storylines", "grade_asset_99999"),
                    can_run_in_parallel=False,
                ),
            ),
        )


class ShootFlowCardDumpWorkflowCliTests(unittest.TestCase):
    def test_card_dump_workflow_previews_route_without_copying(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            volumes = workspace / "Volumes"
            card = volumes / "EOS_DIGITAL"
            ssd = volumes / "Samsung_T7"
            photo = card / "DCIM" / "100EOS5D" / "IMG_0001.JPG"
            video = card / "PRIVATE" / "A001.MOV"
            photo.parent.mkdir(parents=True)
            video.parent.mkdir(parents=True)
            ssd.mkdir(parents=True)
            photo.write_bytes(b"photo-bytes")
            video.write_bytes(b"video-bytes")
            stdout = io.StringIO()

            exit_code = main(
                [
                    "card-dump-workflow",
                    "--volume-root",
                    str(volumes),
                    "--shoot-date",
                    "2026-05-08",
                    "--shoot-slug",
                    "desert-editorial",
                    "--destination-subfolder",
                    "ShootFlow",
                    "--headroom-bytes",
                    "0",
                ],
                stdout=stdout,
            )

            report = json.loads(stdout.getvalue())
            shoot_folder = ssd / "ShootFlow" / "2026-05-08_desert-editorial"

            self.assertEqual(exit_code, 0)
            self.assertEqual(report["schema_version"], 1)
            self.assertEqual(report["status"], "ready_for_review")
            self.assertFalse(report["ingest_executed"])
            self.assertEqual(report["route"]["source"]["name"], "EOS_DIGITAL")
            self.assertEqual(report["route"]["destination"]["name"], "Samsung_T7")
            self.assertEqual(report["estimated_source_media"]["media_file_count"], 2)
            self.assertEqual(report["estimated_source_media"]["estimated_bytes"], 22)
            self.assertEqual(report["preview"]["item_count"], 2)
            self.assertEqual(report["preview"]["total_bytes"], 22)
            self.assertEqual(report["preview"]["shoot_folder"], str(shoot_folder))
            self.assertIsNone(report["ingest"])
            self.assertIsNone(report["production_report"])
            self.assertEqual(
                report["next_actions"],
                [
                    {
                        "name": "review_and_confirm_ingest",
                        "requires": [
                            "human review of source, destination, checksums, and backup notes",
                        ],
                        "writes_files": True,
                    }
                ],
            )
            self.assertEqual(
                report["agent_handoff"],
                {
                    "next_step": "review_preview",
                    "human_review_required": True,
                    "safe_to_rerun": True,
                    "next_step_may_copy_bytes": True,
                    "requires_confirm_ingest": True,
                },
            )
            self.assertFalse(shoot_folder.exists())
            self.assertFalse((shoot_folder / "ingest_manifest.json").exists())
            self.assertFalse((shoot_folder / "originals").exists())

    def test_card_dump_workflow_confirm_ingests_and_reports_production(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            volumes = workspace / "Volumes"
            card = volumes / "EOS_DIGITAL"
            ssd = volumes / "Samsung_T7"
            raw = card / "DCIM" / "100EOS5D" / "IMG_0001.CR3"
            jpeg = card / "DCIM" / "100EOS5D" / "IMG_0001.JPG"
            clip = card / "PRIVATE" / "A001.MOV"
            audio = card / "PRIVATE" / "A001.WAV"
            raw.parent.mkdir(parents=True)
            clip.parent.mkdir(parents=True)
            ssd.mkdir(parents=True)
            raw.write_bytes(b"raw-bytes")
            jpeg.write_bytes(b"jpeg-bytes")
            clip.write_bytes(b"video-bytes")
            audio.write_bytes(b"scratch-audio")
            stdout = io.StringIO()

            exit_code = main(
                [
                    "card-dump-workflow",
                    "--volume-root",
                    str(volumes),
                    "--shoot-date",
                    "2026-05-08",
                    "--shoot-slug",
                    "wedding-preview",
                    "--destination-subfolder",
                    "ShootFlow",
                    "--headroom-bytes",
                    "0",
                    "--confirm-ingest",
                ],
                stdout=stdout,
            )

            report = json.loads(stdout.getvalue())
            shoot_folder = ssd / "ShootFlow" / "2026-05-08_wedding-preview"
            manifest_path = shoot_folder / "ingest_manifest.json"

            self.assertEqual(exit_code, 0)
            self.assertEqual(report["status"], "ingest_complete")
            self.assertTrue(report["ingest_executed"])
            self.assertEqual(report["preview"]["item_count"], 4)
            self.assertEqual(report["ingest"]["copied"], 4)
            self.assertEqual(report["ingest"]["skipped"], 0)
            self.assertEqual(report["ingest"]["manifest_path"], str(manifest_path))
            self.assertEqual(report["production_report"]["asset_counts"], {"photo": 2, "video": 1, "total": 3})
            self.assertEqual(report["production_report"]["copied_manifest_item_count"], 4)
            self.assertFalse(report["production_report"]["wrote_downstream_files"])
            self.assertEqual(
                report["next_actions"],
                [
                    {
                        "name": "prepare_storyline_and_graded_assets",
                        "requires": [
                            "analysis/instagram_storylines.json",
                            "graded outputs for selected storyline assets",
                        ],
                        "writes_files": True,
                    },
                    {
                        "name": "write_render_tasks",
                        "command": [
                            "write-render-tasks",
                            "--ingest-manifest",
                            str(manifest_path),
                        ],
                        "requires": [
                            "analysis/instagram_storylines.json",
                            "graded outputs for selected storyline assets",
                        ],
                        "writes_files": True,
                    },
                ],
            )
            self.assertEqual(
                report["agent_handoff"],
                {
                    "next_step": "review_production_plan",
                    "human_review_required": True,
                    "safe_to_rerun": True,
                    "next_step_may_copy_bytes": False,
                    "requires_confirm_ingest": False,
                },
            )
            self.assertTrue(manifest_path.exists())
            self.assertFalse((shoot_folder / "analysis").exists())
            self.assertFalse((shoot_folder / "graded").exists())
            self.assertFalse((shoot_folder / "deliverables").exists())
            self.assertEqual(raw.read_bytes(), b"raw-bytes")
            self.assertEqual(clip.read_bytes(), b"video-bytes")

    def test_card_dump_workflow_blocks_without_route_candidates(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            volumes = Path(tmp) / "Volumes"
            volumes.mkdir()
            stdout = io.StringIO()

            exit_code = main(
                [
                    "card-dump-workflow",
                    "--volume-root",
                    str(volumes),
                    "--shoot-date",
                    "2026-05-08",
                    "--shoot-slug",
                    "blocked-shoot",
                ],
                stdout=stdout,
            )

        report = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertEqual(report["status"], "blocked")
        self.assertFalse(report["ingest_executed"])
        self.assertIsNone(report["route"]["source"])
        self.assertIsNone(report["route"]["destination"])
        self.assertIsNone(report["preview"])
        self.assertIsNone(report["production_report"])
        self.assertEqual(
            report["agent_handoff"],
            {
                "next_step": "fix_route",
                "human_review_required": True,
                "safe_to_rerun": True,
                "next_step_may_copy_bytes": False,
                "requires_confirm_ingest": False,
            },
        )
        self.assertIn("no discovered storage candidates found", report["route"]["safety_notes"])
        self.assertEqual(report["next_actions"], [])

    def test_card_dump_workflow_rejects_symlinked_destination_subfolder_before_preview(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            volumes = workspace / "Volumes"
            card = volumes / "EOS_DIGITAL"
            ssd = volumes / "Samsung_T7"
            outside = workspace / "outside-library"
            photo = card / "DCIM" / "100EOS5D" / "IMG_0001.JPG"
            photo.parent.mkdir(parents=True)
            ssd.mkdir(parents=True)
            outside.mkdir()
            (ssd / "ShootFlow").symlink_to(outside, target_is_directory=True)
            photo.write_bytes(b"photo-bytes")
            stdout = io.StringIO()
            stderr = io.StringIO()

            exit_code = main(
                [
                    "card-dump-workflow",
                    "--volume-root",
                    str(volumes),
                    "--shoot-date",
                    "2026-05-08",
                    "--shoot-slug",
                    "unsafe-destination",
                    "--destination-subfolder",
                    "ShootFlow",
                    "--headroom-bytes",
                    "0",
                ],
                stdout=stdout,
                stderr=stderr,
            )

            self.assertEqual(exit_code, 1)
            self.assertEqual(stdout.getvalue(), "")
            self.assertIn("destination subfolder", stderr.getvalue())
            self.assertFalse((outside / "2026-05-08_unsafe-destination").exists())
            self.assertEqual(photo.read_bytes(), b"photo-bytes")

    def test_card_dump_workflow_rejects_broken_symlinked_destination_subfolder(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            volumes = workspace / "Volumes"
            card = volumes / "EOS_DIGITAL"
            ssd = volumes / "Samsung_T7"
            photo = card / "DCIM" / "100EOS5D" / "IMG_0001.JPG"
            photo.parent.mkdir(parents=True)
            ssd.mkdir(parents=True)
            (ssd / "ShootFlow").symlink_to(ssd / "missing-library", target_is_directory=True)
            photo.write_bytes(b"photo-bytes")
            stdout = io.StringIO()
            stderr = io.StringIO()

            exit_code = main(
                [
                    "card-dump-workflow",
                    "--volume-root",
                    str(volumes),
                    "--shoot-date",
                    "2026-05-08",
                    "--shoot-slug",
                    "broken-symlink-destination",
                    "--destination-subfolder",
                    "ShootFlow",
                    "--headroom-bytes",
                    "0",
                ],
                stdout=stdout,
                stderr=stderr,
            )

            self.assertEqual(exit_code, 1)
            self.assertEqual(stdout.getvalue(), "")
            self.assertIn("destination subfolder", stderr.getvalue())
            self.assertEqual(photo.read_bytes(), b"photo-bytes")


if __name__ == "__main__":
    unittest.main()
