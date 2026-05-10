from pathlib import Path
import hashlib
import tempfile
import unittest
from unittest import mock
import json

from shootflow.deliverables import MediaAsset
from shootflow.production import build_production_plan
from shootflow.production_scheduler import (
    PRODUCTION_SCHEDULER_REPORT_PATH,
    DryRunProductionSchedulerError,
    DryRunProductionSchedulerReport,
    DryRunProductionSchedulerResult,
    load_dry_run_production_scheduler_report,
    run_dry_run_production_scheduler,
    write_dry_run_production_scheduler_report,
)
from shootflow.production_status import (
    OutputChecksum,
    ProductionJobStatus,
    ProductionStatusManifest,
    load_production_status_manifest,
    production_plan_fingerprint,
    write_production_status_manifest,
)
from shootflow.production_worker import (
    ConflictedProductionLease,
    ProductionLeasePersistenceResult,
)
from shootflow.workflow_authority import observe_only_workflow_authority_to_dict


class DryRunProductionSchedulerTests(unittest.TestCase):
    def test_scheduler_runs_dependency_waves_until_no_work_remains(self) -> None:
        trusted_plan = self._video_only_plan()
        initial_manifest = self._pending_manifest(trusted_plan)

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_production_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                worker_adapter="dry-run-production-local",
                started_at="2026-05-09T16:30:00Z",
                completed_at="2026-05-09T16:30:05Z",
                max_concurrency=2,
                max_iterations=10,
            )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertIsInstance(result, DryRunProductionSchedulerResult)
        self.assertEqual(result.stopped_reason, "complete")
        self.assertEqual(result.retryable_job_ids, ())
        self.assertEqual(result.failed_job_ids, ())
        self.assertEqual(result.blocked_job_ids, ())
        self.assertEqual([status.state for status in loaded_manifest.job_statuses], ["succeeded"] * 7)
        self.assertEqual(
            result.completed_job_ids,
            tuple(job.job_id for job in trusted_plan.jobs),
        )
        attempted_job_ids = tuple(
            job_id
            for iteration in result.iterations
            for job_id in iteration.attempted_job_ids
        )
        self.assertEqual(attempted_job_ids, tuple(job.job_id for job in trusted_plan.jobs))

    def test_proxy_adapter_scheduler_leaves_non_proxy_jobs_pending_for_later_adapters(self) -> None:
        trusted_plan = self._video_only_plan()
        initial_manifest = self._pending_manifest(trusted_plan)

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            source_path = workspace / trusted_plan.jobs[0].inputs[0]
            source_path.parent.mkdir(parents=True)
            source_path.write_bytes(b"trusted proxy source")
            write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_production_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                worker_adapter="proxy-production-local",
                started_at="2026-05-10T12:05:00Z",
                completed_at="2026-05-10T12:05:05Z",
                max_concurrency=1,
                max_iterations=2,
            )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(result.stopped_reason, "waiting")
        self.assertEqual(loaded_manifest.job_statuses[0].state, "succeeded")
        self.assertEqual(loaded_manifest.job_statuses[1].state, "pending")
        self.assertEqual(loaded_manifest.job_statuses[1].attempts, 0)
        self.assertEqual(result.retryable_job_ids, ())
        self.assertEqual(result.blocked_job_ids, ())
        self.assertEqual(result.iterations[1].attempted_job_ids, ())
        self.assertIsNone(result.iterations[1].batch_result)

    def test_proxy_adapter_scheduler_max_iteration_check_ignores_non_proxy_jobs(self) -> None:
        trusted_plan = self._video_only_plan()
        initial_manifest = self._pending_manifest(trusted_plan)

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            source_path = workspace / trusted_plan.jobs[0].inputs[0]
            source_path.parent.mkdir(parents=True)
            source_path.write_bytes(b"trusted proxy source")
            write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_production_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                worker_adapter="proxy-production-local",
                started_at="2026-05-10T12:10:00Z",
                completed_at="2026-05-10T12:10:05Z",
                max_concurrency=1,
                max_iterations=1,
            )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(result.stopped_reason, "waiting")
        self.assertEqual(result.iterations[0].attempted_job_ids, ("proxy_asset_00000",))
        self.assertEqual(loaded_manifest.job_statuses[0].state, "succeeded")
        self.assertEqual(loaded_manifest.job_statuses[1].state, "pending")
        self.assertEqual(loaded_manifest.job_statuses[1].attempts, 0)
        self.assertEqual(result.retryable_job_ids, ())
        self.assertEqual(result.blocked_job_ids, ())

    def test_analysis_adapter_scheduler_leaves_downstream_jobs_pending(self) -> None:
        trusted_plan = self._video_only_plan()
        proxy_job = trusted_plan.job_by_id("proxy_asset_00000")
        ready_manifest = ProductionStatusManifest(
            shoot_slug=trusted_plan.shoot_slug,
            production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
            job_statuses=(
                ProductionJobStatus(
                    job_id=proxy_job.job_id,
                    state="succeeded",
                    worker_adapter="proxy-production-local",
                    attempts=1,
                    output_checksums=(
                        OutputChecksum(path=proxy_job.outputs[0], sha256="a" * 64),
                    ),
                    updated_at="2026-05-10T14:10:00Z",
                ),
            )
            + tuple(
                ProductionJobStatus(job_id=job.job_id, state="pending")
                for job in trusted_plan.jobs[1:]
            ),
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            source_path = workspace / proxy_job.inputs[0]
            source_path.parent.mkdir(parents=True)
            source_path.write_bytes(b"trusted analysis scheduler source")
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_production_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                worker_adapter="analysis-production-local",
                started_at="2026-05-10T14:11:00Z",
                completed_at="2026-05-10T14:11:05Z",
                max_concurrency=1,
                max_iterations=2,
            )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(result.stopped_reason, "waiting")
        self.assertEqual(result.iterations[0].attempted_job_ids, ("analyze_asset_00000",))
        self.assertEqual(result.iterations[1].attempted_job_ids, ())
        self.assertEqual(loaded_manifest.job_statuses[1].state, "succeeded")
        self.assertEqual(loaded_manifest.job_statuses[2].state, "pending")
        self.assertEqual(loaded_manifest.job_statuses[2].attempts, 0)
        self.assertEqual(result.retryable_job_ids, ())
        self.assertEqual(result.blocked_job_ids, ())

    def test_scene_adapter_scheduler_leaves_downstream_jobs_pending(self) -> None:
        trusted_plan = self._video_only_plan()
        proxy_job = trusted_plan.job_by_id("proxy_asset_00000")
        analysis_job = trusted_plan.job_by_id("analyze_asset_00000")

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            analysis_path = workspace / analysis_job.outputs[0]
            analysis_path.parent.mkdir(parents=True)
            analysis_path.write_text(
                json.dumps(
                    {
                        "schema_version": 1,
                        "source_asset_path": analysis_job.inputs[0],
                        "media_type": "video",
                        "scene_label": "local_scene_00000",
                        "aesthetic_score": 0.8,
                        "story_score": 0.7,
                        "technical_score": 0.9,
                        "motion_score": 0.6,
                        "duration_seconds": 12.0,
                        "tags": ["ceremony"],
                    },
                    ensure_ascii=True,
                    indent=2,
                    sort_keys=True,
                )
                + "\n",
                encoding="utf-8",
            )
            analysis_checksum = self._sha256_file(analysis_path)
            ready_manifest = ProductionStatusManifest(
                shoot_slug=trusted_plan.shoot_slug,
                production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
                job_statuses=(
                    ProductionJobStatus(
                        job_id=proxy_job.job_id,
                        state="succeeded",
                        worker_adapter="proxy-production-local",
                        attempts=1,
                        output_checksums=(OutputChecksum(path=proxy_job.outputs[0], sha256="a" * 64),),
                        updated_at="2026-05-10T14:10:00Z",
                    ),
                    ProductionJobStatus(
                        job_id=analysis_job.job_id,
                        state="succeeded",
                        worker_adapter="analysis-production-local",
                        attempts=1,
                        output_checksums=(OutputChecksum(path=analysis_job.outputs[0], sha256=analysis_checksum),),
                        updated_at="2026-05-10T15:10:00Z",
                    ),
                )
                + tuple(
                    ProductionJobStatus(job_id=job.job_id, state="pending")
                    for job in trusted_plan.jobs[2:]
                ),
            )
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_production_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                worker_adapter="scene-production-local",
                started_at="2026-05-10T15:17:00Z",
                completed_at="2026-05-10T15:17:05Z",
                max_concurrency=1,
                max_iterations=2,
            )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
            scene_payload = json.loads((workspace / "analysis/scene_groups.json").read_text(encoding="utf-8"))

        self.assertEqual(result.stopped_reason, "waiting")
        self.assertEqual(result.iterations[0].attempted_job_ids, ("group_scene_sets",))
        self.assertEqual(result.iterations[1].attempted_job_ids, ())
        self.assertEqual(loaded_manifest.job_statuses[2].state, "succeeded")
        self.assertEqual(loaded_manifest.job_statuses[3].state, "pending")
        self.assertEqual(loaded_manifest.job_statuses[3].attempts, 0)
        self.assertEqual(scene_payload["adapter"], "shootflow-scene-production-local")
        self.assertEqual(result.retryable_job_ids, ())
        self.assertEqual(result.blocked_job_ids, ())

    def test_look_adapter_scheduler_leaves_grading_jobs_pending(self) -> None:
        trusted_plan = self._video_only_plan()
        proxy_job = trusted_plan.job_by_id("proxy_asset_00000")
        analysis_job = trusted_plan.job_by_id("analyze_asset_00000")
        scene_job = trusted_plan.job_by_id("group_scene_sets")

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            scene_path = self._write_scene_groups_payload(workspace)
            scene_checksum = self._sha256_file(scene_path)
            ready_manifest = ProductionStatusManifest(
                shoot_slug=trusted_plan.shoot_slug,
                production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
                job_statuses=(
                    ProductionJobStatus(
                        job_id=proxy_job.job_id,
                        state="succeeded",
                        worker_adapter="proxy-production-local",
                        attempts=1,
                        output_checksums=(OutputChecksum(path=proxy_job.outputs[0], sha256="a" * 64),),
                        updated_at="2026-05-10T14:10:00Z",
                    ),
                    ProductionJobStatus(
                        job_id=analysis_job.job_id,
                        state="succeeded",
                        worker_adapter="analysis-production-local",
                        attempts=1,
                        output_checksums=(OutputChecksum(path=analysis_job.outputs[0], sha256="b" * 64),),
                        updated_at="2026-05-10T15:10:00Z",
                    ),
                    ProductionJobStatus(
                        job_id=scene_job.job_id,
                        state="succeeded",
                        worker_adapter="scene-production-local",
                        attempts=1,
                        output_checksums=(OutputChecksum(path=scene_job.outputs[0], sha256=scene_checksum),),
                        updated_at="2026-05-10T15:20:00Z",
                    ),
                )
                + tuple(
                    ProductionJobStatus(job_id=job.job_id, state="pending")
                    for job in trusted_plan.jobs[3:]
                ),
            )
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_production_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                worker_adapter="look-production-local",
                started_at="2026-05-10T16:10:00Z",
                completed_at="2026-05-10T16:10:05Z",
                max_concurrency=1,
                max_iterations=2,
            )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
            final_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
            write_dry_run_production_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-10T16:10:06Z",
            )
            loaded_report = load_dry_run_production_scheduler_report(
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
            )
            look_payload = json.loads((workspace / "color/shoot_look.json").read_text(encoding="utf-8"))

        self.assertEqual(result.stopped_reason, "waiting")
        self.assertEqual(result.iterations[0].attempted_job_ids, ("develop_shoot_look",))
        self.assertEqual(result.iterations[1].attempted_job_ids, ())
        self.assertEqual(loaded_manifest.job_statuses[3].state, "succeeded")
        self.assertEqual(loaded_manifest.job_statuses[4].state, "pending")
        self.assertEqual(loaded_manifest.job_statuses[4].attempts, 0)
        self.assertEqual(look_payload["adapter"], "shootflow-look-production-local")
        self.assertEqual(loaded_report.outputs_materialized, ("color/shoot_look.json",))
        self.assertEqual(loaded_report.product_metrics["completed_job_count"], 4)
        self.assertEqual(result.retryable_job_ids, ())
        self.assertEqual(result.blocked_job_ids, ())

    def test_look_adapter_scheduler_reports_scene_checksum_drift_as_retryable(self) -> None:
        trusted_plan = self._video_only_plan()
        scene_job = trusted_plan.job_by_id("group_scene_sets")

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            scene_path = self._write_scene_groups_payload(workspace)
            scene_checksum = self._sha256_file(scene_path)
            ready_manifest = self._look_ready_manifest(trusted_plan, scene_checksum=scene_checksum)
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)
            scene_path.write_text('{"schema_version": 1, "scene_groups": []}\n', encoding="utf-8")

            result = run_dry_run_production_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                worker_adapter="look-production-local",
                started_at="2026-05-10T16:20:00Z",
                completed_at="2026-05-10T16:20:05Z",
                max_concurrency=1,
                max_iterations=2,
            )
            final_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
            write_dry_run_production_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-10T16:20:06Z",
            )
            loaded_report = load_dry_run_production_scheduler_report(
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
            )
            output_exists = (workspace / "color/shoot_look.json").exists()

        look_status = final_manifest.job_statuses[3]
        self.assertEqual(result.stopped_reason, "retryable")
        self.assertEqual(result.completed_job_ids, ("proxy_asset_00000", "analyze_asset_00000", scene_job.job_id))
        self.assertEqual(result.retryable_job_ids, ("develop_shoot_look",))
        self.assertEqual(result.iterations[0].attempted_job_ids, ("develop_shoot_look",))
        self.assertEqual(result.iterations[-1].skipped_retryable_job_ids, ("develop_shoot_look",))
        self.assertEqual(look_status.state, "retryable")
        self.assertIn("Look production dependency checksum mismatch", look_status.error_message or "")
        self.assertFalse(output_exists)
        self.assertEqual(loaded_report.retryable_job_ids, ("develop_shoot_look",))
        self.assertEqual(loaded_report.review_required_job_ids, ("develop_shoot_look",))
        self.assertEqual(loaded_report.outputs_materialized, ())
        self.assertEqual(loaded_report.product_metrics["completed_job_count"], 3)
        self.assertEqual(loaded_report.product_metrics["retryable_job_count"], 1)
        self.assertEqual(loaded_report.product_metrics["materialized_output_count"], 0)
        self.assertEqual(loaded_report.product_metrics["failure_message_count"], 1)
        self.assertEqual(loaded_report.failure_messages[0].job_id, "develop_shoot_look")
        self.assertIn("Look production dependency checksum mismatch", loaded_report.failure_messages[0].message)

    def test_look_adapter_scheduler_reports_malformed_scene_summary_as_retryable(self) -> None:
        trusted_plan = self._video_only_plan()

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            scene_path = self._write_scene_groups_payload(workspace)
            scene_payload = json.loads(scene_path.read_text(encoding="utf-8"))
            scene_groups = scene_payload["scene_groups"]
            self.assertIsInstance(scene_groups, list)
            first_scene = scene_groups[0]
            self.assertIsInstance(first_scene, dict)
            first_scene["asset_paths"] = "originals/A001.MOV"
            scene_path.write_text(
                json.dumps(scene_payload, ensure_ascii=True, indent=2, sort_keys=True) + "\n",
                encoding="utf-8",
            )
            ready_manifest = self._look_ready_manifest(
                trusted_plan,
                scene_checksum=self._sha256_file(scene_path),
            )
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_production_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                worker_adapter="look-production-local",
                started_at="2026-05-10T16:21:00Z",
                completed_at="2026-05-10T16:21:05Z",
                max_concurrency=1,
                max_iterations=2,
            )
            final_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
            write_dry_run_production_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-10T16:21:06Z",
            )
            loaded_report = load_dry_run_production_scheduler_report(
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
            )
            output_exists = (workspace / "color/shoot_look.json").exists()

        look_status = final_manifest.job_statuses[3]
        self.assertEqual(result.stopped_reason, "retryable")
        self.assertEqual(result.retryable_job_ids, ("develop_shoot_look",))
        self.assertEqual(result.iterations[0].attempted_job_ids, ("develop_shoot_look",))
        self.assertEqual(result.iterations[-1].skipped_retryable_job_ids, ("develop_shoot_look",))
        self.assertEqual(look_status.state, "retryable")
        self.assertIn("asset_paths must be a list", look_status.error_message or "")
        self.assertFalse(output_exists)
        self.assertEqual(loaded_report.retryable_job_ids, ("develop_shoot_look",))
        self.assertEqual(loaded_report.review_required_job_ids, ("develop_shoot_look",))
        self.assertEqual(loaded_report.outputs_materialized, ())
        self.assertEqual(loaded_report.product_metrics["completed_job_count"], 3)
        self.assertEqual(loaded_report.product_metrics["retryable_job_count"], 1)
        self.assertEqual(loaded_report.product_metrics["materialized_output_count"], 0)
        self.assertEqual(loaded_report.product_metrics["failure_message_count"], 1)
        self.assertEqual(loaded_report.failure_messages[0].job_id, "develop_shoot_look")
        self.assertIn("asset_paths must be a list", loaded_report.failure_messages[0].message)

    def test_grade_adapter_scheduler_materializes_grade_and_reports_output(self) -> None:
        trusted_plan = self._video_only_plan()
        grade_job = trusted_plan.job_by_id("grade_asset_00000")

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            source_path = workspace / grade_job.inputs[0]
            source_path.parent.mkdir(parents=True, exist_ok=True)
            source_path.write_bytes(b"trusted scheduler grade source")
            dependency_manifest = self._write_grade_dependencies_with_manifest(trusted_plan, workspace)
            write_production_status_manifest(dependency_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_production_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                worker_adapter="grade-production-local",
                started_at="2026-05-10T18:05:00Z",
                completed_at="2026-05-10T18:05:05Z",
                max_concurrency=1,
                max_iterations=2,
            )
            final_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
            write_dry_run_production_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-10T18:05:06Z",
            )
            loaded_report = load_dry_run_production_scheduler_report(
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
            )
            grade_payload = json.loads((workspace / grade_job.outputs[0]).read_text(encoding="utf-8"))

        self.assertEqual(result.stopped_reason, "waiting")
        self.assertEqual(result.iterations[0].attempted_job_ids, ("grade_asset_00000",))
        self.assertEqual(result.iterations[1].attempted_job_ids, ())
        self.assertEqual(final_manifest.job_statuses[4].state, "succeeded")
        self.assertEqual(final_manifest.job_statuses[5].state, "pending")
        self.assertEqual(final_manifest.job_statuses[5].attempts, 0)
        self.assertEqual(grade_payload["adapter"], "shootflow-grade-production-local")
        self.assertEqual(grade_payload["source_analysis"]["path"], "analysis/00000.json")
        self.assertEqual(grade_payload["source_look"]["path"], "color/shoot_look.json")
        self.assertEqual(loaded_report.completed_job_ids, tuple(job.job_id for job in trusted_plan.jobs[:5]))
        self.assertEqual(loaded_report.outputs_materialized, ("graded/grade_asset_00000/A001.MOV",))
        self.assertEqual(loaded_report.product_metrics["completed_job_count"], 5)
        self.assertEqual(loaded_report.product_metrics["retryable_job_count"], 0)
        self.assertEqual(loaded_report.product_metrics["review_required_job_count"], 0)
        self.assertEqual(loaded_report.product_metrics["materialized_output_count"], 1)

    def test_grade_adapter_scheduler_reports_analysis_checksum_drift_as_retryable(self) -> None:
        trusted_plan = self._video_only_plan()
        grade_job = trusted_plan.job_by_id("grade_asset_00000")

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            source_path = workspace / grade_job.inputs[0]
            source_path.parent.mkdir(parents=True, exist_ok=True)
            source_path.write_bytes(b"trusted scheduler grade source")
            dependency_manifest = self._write_grade_dependencies_with_manifest(trusted_plan, workspace)
            write_production_status_manifest(dependency_manifest, workspace, trusted_plan=trusted_plan)
            (workspace / "analysis/00000.json").write_text(
                '{"schema_version": 1, "source_asset_path": "originals/A001.MOV"}\n',
                encoding="utf-8",
            )

            result = run_dry_run_production_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                worker_adapter="grade-production-local",
                started_at="2026-05-10T18:06:00Z",
                completed_at="2026-05-10T18:06:05Z",
                max_concurrency=1,
                max_iterations=2,
            )
            final_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
            write_dry_run_production_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-10T18:06:06Z",
            )
            loaded_report = load_dry_run_production_scheduler_report(
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
            )
            output_exists = (workspace / grade_job.outputs[0]).exists()

        grade_status = final_manifest.job_statuses[4]
        self.assertEqual(result.stopped_reason, "retryable")
        self.assertEqual(result.retryable_job_ids, ("grade_asset_00000",))
        self.assertEqual(result.iterations[0].attempted_job_ids, ("grade_asset_00000",))
        self.assertEqual(result.iterations[-1].skipped_retryable_job_ids, ("grade_asset_00000",))
        self.assertEqual(grade_status.state, "retryable")
        self.assertIn("Grade production dependency checksum mismatch", grade_status.error_message or "")
        self.assertFalse(output_exists)
        self.assertEqual(loaded_report.retryable_job_ids, ("grade_asset_00000",))
        self.assertEqual(loaded_report.review_required_job_ids, ("grade_asset_00000",))
        self.assertEqual(loaded_report.outputs_materialized, ())
        self.assertEqual(loaded_report.product_metrics["completed_job_count"], 4)
        self.assertEqual(loaded_report.product_metrics["retryable_job_count"], 1)
        self.assertEqual(loaded_report.product_metrics["materialized_output_count"], 0)
        self.assertEqual(loaded_report.product_metrics["failure_message_count"], 1)
        self.assertEqual(loaded_report.failure_messages[0].job_id, "grade_asset_00000")
        self.assertIn(
            "Grade production dependency checksum mismatch",
            loaded_report.failure_messages[0].message,
        )

    def test_grade_adapter_scheduler_reports_malformed_analysis_as_retryable(self) -> None:
        trusted_plan = self._video_only_plan()
        grade_job = trusted_plan.job_by_id("grade_asset_00000")

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            source_path = workspace / grade_job.inputs[0]
            source_path.parent.mkdir(parents=True, exist_ok=True)
            source_path.write_bytes(b"trusted scheduler grade source")
            self._write_grade_dependencies_with_manifest(trusted_plan, workspace)
            analysis_path = workspace / "analysis/00000.json"
            analysis_payload = json.loads(analysis_path.read_text(encoding="utf-8"))
            analysis_payload["schema_version"] = 2
            analysis_path.write_text(
                json.dumps(analysis_payload, ensure_ascii=True, indent=2, sort_keys=True) + "\n",
                encoding="utf-8",
            )
            dependency_manifest = self._grade_ready_manifest(
                trusted_plan,
                analysis_checksum=self._sha256_file(analysis_path),
                look_checksum=self._sha256_file(workspace / "color/shoot_look.json"),
            )
            write_production_status_manifest(dependency_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_production_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                worker_adapter="grade-production-local",
                started_at="2026-05-10T18:07:00Z",
                completed_at="2026-05-10T18:07:05Z",
                max_concurrency=1,
                max_iterations=2,
            )
            final_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
            write_dry_run_production_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-10T18:07:06Z",
            )
            loaded_report = load_dry_run_production_scheduler_report(
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
            )
            output_exists = (workspace / grade_job.outputs[0]).exists()

        grade_status = final_manifest.job_statuses[4]
        self.assertEqual(result.stopped_reason, "retryable")
        self.assertEqual(result.retryable_job_ids, ("grade_asset_00000",))
        self.assertEqual(grade_status.state, "retryable")
        self.assertIn("Grade production requires analysis schema_version 1", grade_status.error_message or "")
        self.assertFalse(output_exists)
        self.assertEqual(loaded_report.retryable_job_ids, ("grade_asset_00000",))
        self.assertEqual(loaded_report.review_required_job_ids, ("grade_asset_00000",))
        self.assertEqual(loaded_report.outputs_materialized, ())
        self.assertEqual(loaded_report.product_metrics["completed_job_count"], 4)
        self.assertEqual(loaded_report.product_metrics["retryable_job_count"], 1)
        self.assertEqual(loaded_report.product_metrics["materialized_output_count"], 0)
        self.assertEqual(loaded_report.product_metrics["failure_message_count"], 1)
        self.assertEqual(loaded_report.failure_messages[0].job_id, "grade_asset_00000")
        self.assertIn(
            "Grade production requires analysis schema_version 1",
            loaded_report.failure_messages[0].message,
        )

    def test_package_adapter_scheduler_materializes_reel_and_reports_output(self) -> None:
        trusted_plan = self._video_only_plan()
        package_job = trusted_plan.job_by_id("assemble_instagram_reel")

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            dependency_manifest = self._write_package_dependencies_with_manifest(trusted_plan, workspace)
            write_production_status_manifest(dependency_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_production_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                worker_adapter="package-production-local",
                started_at="2026-05-10T20:20:00Z",
                completed_at="2026-05-10T20:20:05Z",
                max_concurrency=1,
                max_iterations=2,
            )
            final_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
            write_dry_run_production_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-10T20:20:06Z",
            )
            loaded_report = load_dry_run_production_scheduler_report(
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
            )
            package_payload = json.loads((workspace / package_job.outputs[0]).read_text(encoding="utf-8"))

        self.assertEqual(result.stopped_reason, "complete")
        self.assertEqual(result.iterations[0].attempted_job_ids, ("assemble_instagram_reel",))
        self.assertEqual(result.iterations[1].attempted_job_ids, ())
        self.assertEqual(final_manifest.job_statuses[6].state, "succeeded")
        self.assertEqual(package_payload["adapter"], "shootflow-package-production-local")
        self.assertEqual(package_payload["verified_inputs"][0]["path"], "analysis/instagram_storylines.json")
        self.assertEqual(loaded_report.completed_job_ids, tuple(job.job_id for job in trusted_plan.jobs))
        self.assertEqual(loaded_report.outputs_materialized, ("deliverables/instagram_reel.mp4",))
        self.assertEqual(loaded_report.product_metrics["completed_job_count"], 7)
        self.assertEqual(loaded_report.product_metrics["retryable_job_count"], 0)
        self.assertEqual(loaded_report.product_metrics["review_required_job_count"], 0)
        self.assertEqual(loaded_report.product_metrics["materialized_output_count"], 1)

    def test_package_adapter_scheduler_names_unexpected_directory_entries(self) -> None:
        trusted_plan = self._photo_only_plan()
        carousel_job = trusted_plan.job_by_id("assemble_instagram_carousel")
        photo_set_job = trusted_plan.job_by_id("export_instagram_photo_set")

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            dependency_manifest = self._write_photo_package_dependencies_with_manifest(trusted_plan, workspace)
            for package_job in (carousel_job, photo_set_job):
                package_dir = workspace / package_job.outputs[0]
                package_dir.mkdir(parents=True)
                (package_dir / "package_manifest.json").write_bytes(b"stale deterministic package manifest")
                (package_dir / "extra.bin").write_bytes(b"unplanned package bytes")
            nested_extra = workspace / photo_set_job.outputs[0] / "nested/extra.txt"
            nested_extra.parent.mkdir()
            nested_extra.write_bytes(b"nested unplanned package bytes")
            write_production_status_manifest(dependency_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_production_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                worker_adapter="package-production-local",
                started_at="2026-05-10T20:21:00Z",
                completed_at="2026-05-10T20:21:05Z",
                max_concurrency=2,
                max_iterations=2,
            )
            final_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
            write_dry_run_production_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-10T20:21:06Z",
            )
            loaded_report = load_dry_run_production_scheduler_report(
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
            )
            extra_bytes = (workspace / carousel_job.outputs[0] / "extra.bin").read_bytes()
            nested_extra_bytes = nested_extra.read_bytes()

        self.assertEqual(result.stopped_reason, "retryable")
        self.assertEqual(final_manifest.job_statuses[6].state, "retryable")
        self.assertEqual(final_manifest.job_statuses[7].state, "retryable")
        self.assertEqual(loaded_report.retryable_job_ids, ("assemble_instagram_carousel", "export_instagram_photo_set"))
        self.assertEqual(loaded_report.outputs_materialized, ())
        self.assertEqual(loaded_report.product_metrics["completed_job_count"], 6)
        self.assertEqual(loaded_report.product_metrics["retryable_job_count"], 2)
        self.assertEqual(loaded_report.product_metrics["materialized_output_count"], 0)
        self.assertEqual(loaded_report.product_metrics["failure_message_count"], 2)
        self.assertIn("extra.bin", loaded_report.failure_messages[0].message)
        self.assertIn("extra.bin", loaded_report.failure_messages[1].message)
        self.assertIn("nested/extra.txt", loaded_report.failure_messages[1].message)
        self.assertEqual(extra_bytes, b"unplanned package bytes")
        self.assertEqual(nested_extra_bytes, b"nested unplanned package bytes")

    def test_proxy_adapter_scheduler_does_not_expire_non_proxy_running_leases(self) -> None:
        trusted_plan = self._video_only_plan()
        running_analysis_manifest = ProductionStatusManifest(
            shoot_slug=trusted_plan.shoot_slug,
            production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
            job_statuses=(
                ProductionJobStatus(
                    job_id="proxy_asset_00000",
                    state="succeeded",
                    worker_adapter="proxy-production-local",
                    attempts=1,
                    updated_at="2026-05-10T12:11:00Z",
                    output_checksums=(
                        OutputChecksum(
                            path=trusted_plan.job_by_id("proxy_asset_00000").outputs[0],
                            sha256="a" * 64,
                        ),
                    ),
                ),
                ProductionJobStatus(
                    job_id="analyze_asset_00000",
                    state="running",
                    worker_adapter="metadata-production-local",
                    attempts=1,
                    updated_at="2026-05-10T12:00:00Z",
                ),
            )
            + tuple(
                ProductionJobStatus(job_id=job.job_id, state="pending")
                for job in trusted_plan.jobs[2:]
            ),
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_production_status_manifest(
                running_analysis_manifest,
                workspace,
                trusted_plan=trusted_plan,
            )

            result = run_dry_run_production_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                worker_adapter="proxy-production-local",
                started_at="2026-05-10T12:12:00Z",
                completed_at="2026-05-10T12:12:05Z",
                max_concurrency=1,
                max_iterations=1,
                stale_before="2026-05-10T12:05:00Z",
                lease_updated_at="2026-05-10T12:12:00Z",
            )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(result.stopped_reason, "waiting")
        self.assertEqual(result.iterations[0].expired_lease_job_ids, ())
        self.assertEqual(result.iterations[0].attempted_job_ids, ())
        self.assertEqual(loaded_manifest.job_statuses[1].state, "running")
        self.assertEqual(loaded_manifest.job_statuses[1].attempts, 1)
        self.assertEqual(result.retryable_job_ids, ())

    def test_scheduler_does_not_hammer_retryable_job_in_same_run(self) -> None:
        trusted_plan = self._video_only_plan()
        initial_manifest = self._pending_manifest(trusted_plan)
        first_output = trusted_plan.jobs[0].outputs[0]

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            output_path = workspace / first_output
            output_path.parent.mkdir(parents=True)
            output_path.write_bytes(b"manual proxy export")
            write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_production_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                worker_adapter="dry-run-production-local",
                started_at="2026-05-09T16:31:00Z",
                completed_at="2026-05-09T16:31:05Z",
                max_concurrency=1,
                max_iterations=5,
            )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
            preserved_bytes = output_path.read_bytes()

        self.assertEqual(result.stopped_reason, "retryable")
        self.assertEqual(result.completed_job_ids, ())
        self.assertEqual(result.retryable_job_ids, ("proxy_asset_00000",))
        self.assertEqual(result.iterations[0].attempted_job_ids, ("proxy_asset_00000",))
        self.assertEqual(result.iterations[-1].skipped_retryable_job_ids, ("proxy_asset_00000",))
        self.assertEqual(loaded_manifest.job_statuses[0].state, "retryable")
        self.assertEqual(loaded_manifest.job_statuses[0].attempts, 1)
        self.assertEqual(preserved_bytes, b"manual proxy export")

    def test_scheduler_requires_explicit_review_before_retrying_existing_retryable_job(self) -> None:
        trusted_plan = self._video_only_plan()
        retryable_manifest = ProductionStatusManifest(
            shoot_slug=trusted_plan.shoot_slug,
            production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
            job_statuses=(
                ProductionJobStatus(
                    job_id="proxy_asset_00000",
                    state="retryable",
                    worker_adapter="dry-run-production-local",
                    attempts=1,
                    error_message="Manual proxy export already exists.",
                    updated_at="2026-05-09T16:30:30Z",
                ),
            )
            + tuple(
                ProductionJobStatus(job_id=job.job_id, state="pending")
                for job in trusted_plan.jobs[1:]
            ),
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_production_status_manifest(retryable_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_production_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                worker_adapter="dry-run-production-local",
                started_at="2026-05-09T16:31:30Z",
                completed_at="2026-05-09T16:31:35Z",
                max_concurrency=1,
                max_iterations=5,
            )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(result.stopped_reason, "retryable")
        self.assertEqual(result.iterations[0].attempted_job_ids, ())
        self.assertEqual(result.iterations[0].skipped_retryable_job_ids, ("proxy_asset_00000",))
        self.assertEqual(loaded_manifest, retryable_manifest)

    def test_scheduler_expires_stale_running_production_lease_before_planning_work(self) -> None:
        trusted_plan = self._video_only_plan()
        running_manifest = ProductionStatusManifest(
            shoot_slug=trusted_plan.shoot_slug,
            production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
            job_statuses=(
                ProductionJobStatus(
                    job_id="proxy_asset_00000",
                    state="running",
                    worker_adapter="dry-run-production-local",
                    attempts=1,
                    updated_at="2026-05-09T16:20:00Z",
                ),
            )
            + tuple(
                ProductionJobStatus(job_id=job.job_id, state="pending")
                for job in trusted_plan.jobs[1:]
            ),
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_production_status_manifest(running_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_production_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                worker_adapter="dry-run-production-local",
                started_at="2026-05-09T16:40:00Z",
                completed_at="2026-05-09T16:40:05Z",
                max_concurrency=1,
                max_iterations=5,
                stale_before="2026-05-09T16:30:00Z",
                lease_updated_at="2026-05-09T16:39:00Z",
                reviewed_retryable_job_ids=("proxy_asset_00000",),
            )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
            report_path = write_dry_run_production_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=loaded_manifest,
                generated_at="2026-05-09T16:40:06Z",
            )
            loaded_report = load_dry_run_production_scheduler_report(
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=loaded_manifest,
            )

        self.assertEqual(result.stopped_reason, "retryable")
        self.assertEqual(result.iterations[0].expired_lease_job_ids, ("proxy_asset_00000",))
        self.assertEqual(result.iterations[0].conflicted_lease_job_ids, ())
        self.assertEqual(result.iterations[0].attempted_job_ids, ())
        self.assertEqual(result.iterations[0].skipped_retryable_job_ids, ("proxy_asset_00000",))
        self.assertEqual(loaded_manifest.job_statuses[0].state, "retryable")
        self.assertIn("lease expired", loaded_manifest.job_statuses[0].error_message or "")
        self.assertEqual(report_path.name, PRODUCTION_SCHEDULER_REPORT_PATH)
        self.assertEqual(loaded_report.expired_lease_job_ids, ("proxy_asset_00000",))
        self.assertIn("proxy_asset_00000", loaded_report.review_required_job_ids)
        self.assertEqual(loaded_report.attempted_job_ids, ())
        self.assertIn("lease expired", loaded_report.failure_messages[0].message)

    def test_scheduler_reports_stale_lease_conflicts_as_review_required(self) -> None:
        trusted_plan = self._video_only_plan()
        running_manifest = ProductionStatusManifest(
            shoot_slug=trusted_plan.shoot_slug,
            production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
            job_statuses=(
                ProductionJobStatus(
                    job_id="proxy_asset_00000",
                    state="running",
                    worker_adapter="dry-run-production-local",
                    attempts=1,
                    updated_at="2026-05-09T16:20:00Z",
                ),
            )
            + tuple(
                ProductionJobStatus(job_id=job.job_id, state="pending")
                for job in trusted_plan.jobs[1:]
            ),
        )
        conflict_result = ProductionLeasePersistenceResult(
            shoot_slug=trusted_plan.shoot_slug,
            persisted_leases=(),
            conflicted_leases=(
                ConflictedProductionLease(
                    job_id="proxy_asset_00000",
                    error_message=(
                        "another worker already changed this job before stale lease expiration "
                        "could be persisted for proxy_asset_00000; no source, analysis, graded, "
                        "render, or deliverable files were deleted or cleaned up."
                    ),
                ),
            ),
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_production_status_manifest(running_manifest, workspace, trusted_plan=trusted_plan)
            with mock.patch(
                "shootflow.production_scheduler.persist_stale_production_leases",
                return_value=conflict_result,
            ):
                result = run_dry_run_production_scheduler(
                    workspace,
                    trusted_plan=trusted_plan,
                    worker_adapter="dry-run-production-local",
                    started_at="2026-05-09T16:40:00Z",
                    completed_at="2026-05-09T16:40:05Z",
                    max_concurrency=1,
                    max_iterations=1,
                    stale_before="2026-05-09T16:30:00Z",
                    lease_updated_at="2026-05-09T16:39:00Z",
                )
            final_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
            write_dry_run_production_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-09T16:40:06Z",
            )
            loaded_report = load_dry_run_production_scheduler_report(
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
            )

        self.assertEqual(result.iterations[0].conflicted_lease_job_ids, ("proxy_asset_00000",))
        self.assertEqual(result.iterations[0].attempted_job_ids, ())
        self.assertEqual(loaded_report.conflicted_lease_job_ids, ("proxy_asset_00000",))
        self.assertIn("proxy_asset_00000", loaded_report.review_required_job_ids)
        self.assertEqual(len(loaded_report.failure_messages), 1)
        self.assertEqual(loaded_report.failure_messages[0].job_id, "proxy_asset_00000")
        self.assertIn("stale lease expiration", loaded_report.failure_messages[0].message)

    def test_scheduler_retries_existing_retryable_job_when_reviewed(self) -> None:
        trusted_plan = self._video_only_plan()
        retryable_manifest = ProductionStatusManifest(
            shoot_slug=trusted_plan.shoot_slug,
            production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
            job_statuses=(
                ProductionJobStatus(
                    job_id="proxy_asset_00000",
                    state="retryable",
                    worker_adapter="dry-run-production-local",
                    attempts=1,
                    error_message="Operator cleared the proxy output conflict.",
                    updated_at="2026-05-09T16:32:30Z",
                ),
            )
            + tuple(
                ProductionJobStatus(job_id=job.job_id, state="pending")
                for job in trusted_plan.jobs[1:]
            ),
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_production_status_manifest(retryable_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_production_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                worker_adapter="dry-run-production-local",
                started_at="2026-05-09T16:33:00Z",
                completed_at="2026-05-09T16:33:05Z",
                max_concurrency=1,
                max_iterations=10,
                reviewed_retryable_job_ids=("proxy_asset_00000",),
            )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(result.stopped_reason, "complete")
        self.assertEqual(result.iterations[0].attempted_job_ids, ("proxy_asset_00000",))
        self.assertEqual(result.iterations[0].skipped_retryable_job_ids, ())
        self.assertEqual(loaded_manifest.job_statuses[0].state, "succeeded")
        self.assertEqual(loaded_manifest.job_statuses[0].attempts, 2)

    def test_scheduler_rejects_unsupported_adapter_before_writing_status(self) -> None:
        trusted_plan = self._video_only_plan()
        initial_manifest = self._pending_manifest(trusted_plan)

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            with self.assertRaisesRegex(DryRunProductionSchedulerError, "Unsupported production adapter"):
                run_dry_run_production_scheduler(
                    workspace,
                    trusted_plan=trusted_plan,
                    worker_adapter="coreml-local",
                    started_at="2026-05-09T16:32:00Z",
                    completed_at="2026-05-09T16:32:05Z",
                    max_concurrency=1,
                    max_iterations=3,
                )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(loaded_manifest, initial_manifest)

    def test_scheduler_report_persists_and_loads_against_final_status(self) -> None:
        trusted_plan = self._video_only_plan()
        initial_manifest = self._pending_manifest(trusted_plan)

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)
            result = run_dry_run_production_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                worker_adapter="dry-run-production-local",
                started_at="2026-05-09T17:00:00Z",
                completed_at="2026-05-09T17:00:05Z",
                max_concurrency=2,
                max_iterations=10,
            )
            final_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

            report_path = write_dry_run_production_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-09T17:00:06Z",
            )
            raw_report = json.loads(report_path.read_text(encoding="utf-8"))
            loaded_report = load_dry_run_production_scheduler_report(
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
            )

        self.assertEqual(report_path.name, PRODUCTION_SCHEDULER_REPORT_PATH)
        self.assertEqual(raw_report["schema_version"], 3)
        self.assertEqual(raw_report["workflow_authority"], observe_only_workflow_authority_to_dict())
        self.assertIsInstance(loaded_report, DryRunProductionSchedulerReport)
        self.assertEqual(
            loaded_report.workflow_authority,
            observe_only_workflow_authority_to_dict(),
        )
        self.assertEqual(loaded_report.generated_at, "2026-05-09T17:00:06Z")
        self.assertEqual(loaded_report.shoot_slug, trusted_plan.shoot_slug)
        self.assertEqual(
            loaded_report.production_plan_fingerprint,
            production_plan_fingerprint(trusted_plan),
        )
        self.assertEqual(loaded_report.stopped_reason, "complete")
        self.assertEqual(loaded_report.total_job_count, len(trusted_plan.jobs))
        self.assertEqual(loaded_report.review_required_job_ids, ())
        self.assertEqual(loaded_report.expired_lease_job_ids, ())
        self.assertEqual(loaded_report.conflicted_lease_job_ids, ())
        self.assertEqual(loaded_report.completed_job_ids, tuple(job.job_id for job in trusted_plan.jobs))
        self.assertGreater(len(loaded_report.outputs_materialized), 0)
        self.assertEqual(
            raw_report["product_metrics"],
            {
                "attempted_job_count": len(trusted_plan.jobs),
                "blocked_job_count": 0,
                "completed_job_count": len(trusted_plan.jobs),
                "conflicted_lease_job_count": 0,
                "expired_lease_job_count": 0,
                "failed_job_count": 0,
                "failure_message_count": 0,
                "iteration_count": 8,
                "materialized_output_count": len(loaded_report.outputs_materialized),
                "retryable_job_count": 0,
                "review_required_job_count": 0,
                "skipped_retryable_job_count": 0,
                "total_job_count": len(trusted_plan.jobs),
            },
        )
        self.assertEqual(loaded_report.product_metrics["completed_job_count"], len(trusted_plan.jobs))
        with self.assertRaises(TypeError):
            loaded_report.product_metrics["completed_job_count"] = 0

    def test_scheduler_report_rejects_forged_product_metrics(self) -> None:
        trusted_plan = self._video_only_plan()
        initial_manifest = self._pending_manifest(trusted_plan)

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)
            result = run_dry_run_production_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                worker_adapter="dry-run-production-local",
                started_at="2026-05-09T17:00:30Z",
                completed_at="2026-05-09T17:00:35Z",
                max_concurrency=2,
                max_iterations=10,
            )
            final_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
            report_path = write_dry_run_production_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-09T17:00:36Z",
            )
            raw_report = json.loads(report_path.read_text(encoding="utf-8"))
            raw_report["product_metrics"]["completed_job_count"] = 0
            report_path.write_text(json.dumps(raw_report), encoding="utf-8")

            with self.assertRaisesRegex(DryRunProductionSchedulerError, "product_metrics"):
                load_dry_run_production_scheduler_report(
                    workspace,
                    trusted_plan=trusted_plan,
                    final_manifest=final_manifest,
                )

    def test_scheduler_report_rejects_duplicate_metric_source_ids(self) -> None:
        trusted_plan = self._video_only_plan()
        initial_manifest = self._pending_manifest(trusted_plan)

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)
            result = run_dry_run_production_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                worker_adapter="dry-run-production-local",
                started_at="2026-05-09T17:00:40Z",
                completed_at="2026-05-09T17:00:45Z",
                max_concurrency=2,
                max_iterations=10,
            )
            final_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
            report_path = write_dry_run_production_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-09T17:00:46Z",
            )
            raw_report = json.loads(report_path.read_text(encoding="utf-8"))
            raw_report["completed_job_ids"].append("proxy_asset_00000")
            raw_report["product_metrics"]["completed_job_count"] = len(trusted_plan.jobs) + 1
            report_path.write_text(json.dumps(raw_report), encoding="utf-8")

            with self.assertRaisesRegex(DryRunProductionSchedulerError, "duplicate"):
                load_dry_run_production_scheduler_report(
                    workspace,
                    trusted_plan=trusted_plan,
                    final_manifest=final_manifest,
                )

    def test_scheduler_report_rejects_duplicate_failure_metric_sources(self) -> None:
        trusted_plan = self._video_only_plan()
        initial_manifest = self._pending_manifest(trusted_plan)
        first_output = trusted_plan.jobs[0].outputs[0]

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            output_path = workspace / first_output
            output_path.parent.mkdir(parents=True)
            output_path.write_bytes(b"manual proxy export")
            write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)
            result = run_dry_run_production_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                worker_adapter="dry-run-production-local",
                started_at="2026-05-09T17:00:47Z",
                completed_at="2026-05-09T17:00:48Z",
                max_concurrency=1,
                max_iterations=5,
            )
            final_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
            report_path = write_dry_run_production_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-09T17:00:49Z",
            )
            raw_report = json.loads(report_path.read_text(encoding="utf-8"))
            raw_report["failure_messages"].append(raw_report["failure_messages"][0])
            raw_report["product_metrics"]["failure_message_count"] = 2
            report_path.write_text(json.dumps(raw_report), encoding="utf-8")

            with self.assertRaisesRegex(DryRunProductionSchedulerError, "duplicate"):
                load_dry_run_production_scheduler_report(
                    workspace,
                    trusted_plan=trusted_plan,
                    final_manifest=final_manifest,
                )

    def test_scheduler_report_rejects_extra_failure_metric_source_for_same_job(self) -> None:
        trusted_plan = self._video_only_plan()
        initial_manifest = self._pending_manifest(trusted_plan)
        first_output = trusted_plan.jobs[0].outputs[0]

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            output_path = workspace / first_output
            output_path.parent.mkdir(parents=True)
            output_path.write_bytes(b"manual proxy export")
            write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)
            result = run_dry_run_production_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                worker_adapter="dry-run-production-local",
                started_at="2026-05-09T17:00:51Z",
                completed_at="2026-05-09T17:00:52Z",
                max_concurrency=1,
                max_iterations=5,
            )
            final_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
            report_path = write_dry_run_production_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-09T17:00:53Z",
            )
            raw_report = json.loads(report_path.read_text(encoding="utf-8"))
            raw_report["failure_messages"].append(
                {"job_id": "proxy_asset_00000", "message": "forged second failure"}
            )
            raw_report["product_metrics"]["failure_message_count"] = 2
            report_path.write_text(json.dumps(raw_report), encoding="utf-8")

            with self.assertRaisesRegex(DryRunProductionSchedulerError, "duplicate"):
                load_dry_run_production_scheduler_report(
                    workspace,
                    trusted_plan=trusted_plan,
                    final_manifest=final_manifest,
                )

    def test_schema_v1_scheduler_report_loads_with_derived_metrics(self) -> None:
        trusted_plan = self._video_only_plan()
        initial_manifest = self._pending_manifest(trusted_plan)

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)
            result = run_dry_run_production_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                worker_adapter="dry-run-production-local",
                started_at="2026-05-09T17:00:50Z",
                completed_at="2026-05-09T17:00:55Z",
                max_concurrency=2,
                max_iterations=10,
            )
            final_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
            report_path = write_dry_run_production_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-09T17:00:56Z",
            )
            raw_report = json.loads(report_path.read_text(encoding="utf-8"))
            raw_report["schema_version"] = 1
            del raw_report["product_metrics"]
            raw_report.pop("workflow_authority", None)
            report_path.write_text(json.dumps(raw_report), encoding="utf-8")

            loaded_report = load_dry_run_production_scheduler_report(
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
            )

        self.assertEqual(loaded_report.product_metrics["completed_job_count"], len(trusted_plan.jobs))
        self.assertEqual(
            loaded_report.workflow_authority,
            observe_only_workflow_authority_to_dict(),
        )

    def test_schema_v2_scheduler_report_loads_with_observe_only_authority(self) -> None:
        trusted_plan = self._video_only_plan()
        initial_manifest = self._pending_manifest(trusted_plan)

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)
            result = run_dry_run_production_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                worker_adapter="dry-run-production-local",
                started_at="2026-05-09T17:01:00Z",
                completed_at="2026-05-09T17:01:05Z",
                max_concurrency=2,
                max_iterations=10,
            )
            final_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
            report_path = write_dry_run_production_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-09T17:01:06Z",
            )
            raw_report = json.loads(report_path.read_text(encoding="utf-8"))
            raw_report["schema_version"] = 2
            raw_report.pop("workflow_authority", None)
            report_path.write_text(json.dumps(raw_report), encoding="utf-8")

            loaded_report = load_dry_run_production_scheduler_report(
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
            )

        self.assertEqual(loaded_report.product_metrics["completed_job_count"], len(trusted_plan.jobs))
        self.assertEqual(
            loaded_report.workflow_authority,
            observe_only_workflow_authority_to_dict(),
        )

    def test_schema_v3_scheduler_report_rejects_missing_workflow_authority(self) -> None:
        trusted_plan = self._video_only_plan()
        initial_manifest = self._pending_manifest(trusted_plan)

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)
            result = run_dry_run_production_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                worker_adapter="dry-run-production-local",
                started_at="2026-05-09T17:00:55Z",
                completed_at="2026-05-09T17:00:56Z",
                max_concurrency=2,
                max_iterations=10,
            )
            final_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
            report_path = write_dry_run_production_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-09T17:00:57Z",
            )
            raw_report = json.loads(report_path.read_text(encoding="utf-8"))
            raw_report.pop("workflow_authority", None)
            report_path.write_text(json.dumps(raw_report), encoding="utf-8")

            with self.assertRaisesRegex(DryRunProductionSchedulerError, "workflow_authority"):
                load_dry_run_production_scheduler_report(
                    workspace,
                    trusted_plan=trusted_plan,
                    final_manifest=final_manifest,
                )

    def test_scheduler_report_rejects_authorizing_workflow_authority(self) -> None:
        trusted_plan = self._video_only_plan()
        initial_manifest = self._pending_manifest(trusted_plan)

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)
            result = run_dry_run_production_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                worker_adapter="dry-run-production-local",
                started_at="2026-05-09T17:00:57Z",
                completed_at="2026-05-09T17:00:58Z",
                max_concurrency=2,
                max_iterations=10,
            )
            final_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
            report_path = write_dry_run_production_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-09T17:00:59Z",
            )
            raw_report = json.loads(report_path.read_text(encoding="utf-8"))
            raw_report["workflow_authority"]["permits_retry"] = True
            report_path.write_text(json.dumps(raw_report), encoding="utf-8")

            with self.assertRaisesRegex(
                DryRunProductionSchedulerError,
                "workflow_authority.permits_retry must be False",
            ):
                load_dry_run_production_scheduler_report(
                    workspace,
                    trusted_plan=trusted_plan,
                    final_manifest=final_manifest,
                )

    def test_scheduler_report_rejects_final_status_drift(self) -> None:
        trusted_plan = self._video_only_plan()
        initial_manifest = self._pending_manifest(trusted_plan)

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)
            result = run_dry_run_production_scheduler(
                workspace,
                trusted_plan=trusted_plan,
                worker_adapter="dry-run-production-local",
                started_at="2026-05-09T17:01:00Z",
                completed_at="2026-05-09T17:01:05Z",
                max_concurrency=2,
                max_iterations=10,
            )
            final_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
            write_dry_run_production_scheduler_report(
                result,
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
                generated_at="2026-05-09T17:01:06Z",
            )
            original_status = final_manifest.job_statuses[0]
            drifted_manifest = ProductionStatusManifest(
                shoot_slug=final_manifest.shoot_slug,
                production_plan_fingerprint=final_manifest.production_plan_fingerprint,
                job_statuses=(
                    ProductionJobStatus(
                        job_id=original_status.job_id,
                        state=original_status.state,
                        worker_adapter=original_status.worker_adapter,
                        attempts=original_status.attempts + 1,
                        error_message=original_status.error_message,
                        output_checksums=original_status.output_checksums,
                        updated_at="2026-05-09T17:01:30Z",
                    ),
                )
                + final_manifest.job_statuses[1:],
            )

            with self.assertRaisesRegex(
                DryRunProductionSchedulerError,
                "status fingerprint",
            ):
                load_dry_run_production_scheduler_report(
                    workspace,
                    trusted_plan=trusted_plan,
                    final_manifest=drifted_manifest,
                )

    @staticmethod
    def _video_only_plan():
        return build_production_plan(
            [MediaAsset(path="originals/A001.MOV", media_type="video", duration_seconds=12.0)],
            shoot_slug="production-scheduler",
        )

    @staticmethod
    def _photo_only_plan():
        return build_production_plan(
            [MediaAsset(path="originals/IMG_0001.CR3", media_type="photo")],
            shoot_slug="production-scheduler",
        )

    @staticmethod
    def _pending_manifest(trusted_plan) -> ProductionStatusManifest:
        return ProductionStatusManifest(
            shoot_slug=trusted_plan.shoot_slug,
            production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
            job_statuses=tuple(
                ProductionJobStatus(job_id=job.job_id, state="pending")
                for job in trusted_plan.jobs
            ),
        )

    @staticmethod
    def _look_ready_manifest(trusted_plan, *, scene_checksum: str) -> ProductionStatusManifest:
        proxy_job = trusted_plan.job_by_id("proxy_asset_00000")
        analysis_job = trusted_plan.job_by_id("analyze_asset_00000")
        scene_job = trusted_plan.job_by_id("group_scene_sets")
        return ProductionStatusManifest(
            shoot_slug=trusted_plan.shoot_slug,
            production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
            job_statuses=(
                ProductionJobStatus(
                    job_id=proxy_job.job_id,
                    state="succeeded",
                    worker_adapter="proxy-production-local",
                    attempts=1,
                    output_checksums=(OutputChecksum(path=proxy_job.outputs[0], sha256="a" * 64),),
                    updated_at="2026-05-10T14:10:00Z",
                ),
                ProductionJobStatus(
                    job_id=analysis_job.job_id,
                    state="succeeded",
                    worker_adapter="analysis-production-local",
                    attempts=1,
                    output_checksums=(OutputChecksum(path=analysis_job.outputs[0], sha256="b" * 64),),
                    updated_at="2026-05-10T15:10:00Z",
                ),
                ProductionJobStatus(
                    job_id=scene_job.job_id,
                    state="succeeded",
                    worker_adapter="scene-production-local",
                    attempts=1,
                    output_checksums=(OutputChecksum(path=scene_job.outputs[0], sha256=scene_checksum),),
                    updated_at="2026-05-10T15:20:00Z",
                ),
            )
            + tuple(
                ProductionJobStatus(job_id=job.job_id, state="pending")
                for job in trusted_plan.jobs[3:]
            ),
        )

    @staticmethod
    def _sha256_file(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as input_file:
            for chunk in iter(lambda: input_file.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    @staticmethod
    def _write_scene_groups_payload(workspace: Path) -> Path:
        scene_path = workspace / "analysis/scene_groups.json"
        scene_path.parent.mkdir(parents=True, exist_ok=True)
        scene_path.write_text(
            json.dumps(
                {
                    "schema_version": 1,
                    "adapter": "shootflow-scene-production-local",
                    "job_id": "group_scene_sets",
                    "output_kind": "scene_grouping",
                    "inputs": ["originals/A001.MOV"],
                    "outputs": ["analysis/scene_groups.json"],
                    "selected_output": "analysis/scene_groups.json",
                    "depends_on": ["analyze_asset_00000"],
                    "can_run_in_parallel": False,
                    "analysis_count": 1,
                    "scene_count": 1,
                    "scene_groups": [
                        {
                            "scene_label": "ceremony",
                            "asset_count": 1,
                            "video_count": 1,
                            "photo_count": 0,
                            "asset_paths": ["originals/A001.MOV"],
                            "primary_tags": ["vows"],
                            "average_aesthetic_score": 0.8,
                            "average_story_score": 0.9,
                            "average_technical_score": 0.7,
                            "average_motion_score": 0.6,
                        },
                    ],
                },
                ensure_ascii=True,
                indent=2,
                sort_keys=True,
            )
            + "\n",
            encoding="utf-8",
        )
        return scene_path

    @classmethod
    def _write_grade_dependencies_with_manifest(
        cls,
        trusted_plan,
        workspace: Path,
    ) -> ProductionStatusManifest:
        analysis_path = workspace / "analysis/00000.json"
        analysis_path.parent.mkdir(parents=True, exist_ok=True)
        analysis_path.write_text(
            json.dumps(
                {
                    "schema_version": 1,
                    "adapter": "shootflow-analysis-production-local",
                    "source_asset_path": "originals/A001.MOV",
                    "media_type": "video",
                    "scene_label": "ceremony",
                    "aesthetic_score": 0.8,
                    "story_score": 0.9,
                    "technical_score": 0.7,
                    "motion_score": 0.6,
                    "duration_seconds": 12.0,
                    "tags": ["vows"],
                    "adapter_metadata": {
                        "job_id": "analyze_asset_00000",
                        "output_kind": "vlm_asset_analysis",
                        "outputs": ["analysis/00000.json"],
                        "selected_output": "analysis/00000.json",
                        "depends_on": ["proxy_asset_00000"],
                        "can_run_in_parallel": True,
                    },
                },
                ensure_ascii=True,
                indent=2,
                sort_keys=True,
            )
            + "\n",
            encoding="utf-8",
        )
        look_path = workspace / "color/shoot_look.json"
        look_path.parent.mkdir(parents=True, exist_ok=True)
        look_path.write_text(
            json.dumps(
                {
                    "schema_version": 1,
                    "adapter": "shootflow-look-production-local",
                    "job_id": "develop_shoot_look",
                    "output_kind": "look_development",
                    "inputs": ["production-scheduler"],
                    "outputs": ["color/shoot_look.json"],
                    "selected_output": "color/shoot_look.json",
                    "depends_on": ["group_scene_sets"],
                    "can_run_in_parallel": False,
                    "source_scene_groups": {
                        "path": "analysis/scene_groups.json",
                        "sha256": "a" * 64,
                        "analysis_count": 1,
                        "scene_count": 1,
                        "scene_labels": ["ceremony"],
                        "primary_tags": ["vows"],
                    },
                    "look_profile": {
                        "name": "local-documentary-neutral",
                        "tone_curve": "soft_contrast",
                        "color_bias": "warm_highlight_protection",
                        "warmth": 0.6,
                        "saturation": 0.7,
                        "contrast": 0.8,
                    },
                },
                ensure_ascii=True,
                indent=2,
                sort_keys=True,
            )
            + "\n",
            encoding="utf-8",
        )
        return cls._grade_ready_manifest(
            trusted_plan,
            analysis_checksum=cls._sha256_file(analysis_path),
            look_checksum=cls._sha256_file(look_path),
        )

    @classmethod
    def _write_package_dependencies_with_manifest(
        cls,
        trusted_plan,
        workspace: Path,
    ) -> ProductionStatusManifest:
        story_path = workspace / "analysis/instagram_storylines.json"
        story_path.parent.mkdir(parents=True, exist_ok=True)
        story_path.write_text(
            json.dumps(
                {
                    "schema_version": 2,
                    "sequences": [
                        {
                            "sequence_id": "reel_main",
                            "deliverable_type": "instagram_reel",
                            "asset_paths": ["graded/grade_asset_00000/A001.MOV"],
                        },
                    ],
                },
                ensure_ascii=True,
                indent=2,
                sort_keys=True,
            )
            + "\n",
            encoding="utf-8",
        )
        grade_path = workspace / "graded/grade_asset_00000/A001.MOV"
        grade_path.parent.mkdir(parents=True, exist_ok=True)
        grade_path.write_bytes(b"trusted scheduler package grade")
        return cls._package_ready_manifest(
            trusted_plan,
            story_checksum=cls._sha256_file(story_path),
            grade_checksum=cls._sha256_file(grade_path),
        )

    @classmethod
    def _write_photo_package_dependencies_with_manifest(
        cls,
        trusted_plan,
        workspace: Path,
    ) -> ProductionStatusManifest:
        story_path = workspace / "analysis/instagram_storylines.json"
        story_path.parent.mkdir(parents=True, exist_ok=True)
        story_path.write_text(
            json.dumps(
                {
                    "schema_version": 2,
                    "sequences": [
                        {
                            "sequence_id": "carousel_main",
                            "deliverable_type": "instagram_carousel",
                            "asset_paths": ["graded/grade_asset_00000/IMG_0001.CR3"],
                        },
                        {
                            "sequence_id": "photo_set_main",
                            "deliverable_type": "instagram_photo_set",
                            "asset_paths": ["graded/grade_asset_00000/IMG_0001.CR3"],
                        },
                    ],
                },
                ensure_ascii=True,
                indent=2,
                sort_keys=True,
            )
            + "\n",
            encoding="utf-8",
        )
        grade_path = workspace / "graded/grade_asset_00000/IMG_0001.CR3"
        grade_path.parent.mkdir(parents=True, exist_ok=True)
        grade_path.write_bytes(b"trusted scheduler package photo grade")
        return cls._package_ready_manifest(
            trusted_plan,
            story_checksum=cls._sha256_file(story_path),
            grade_checksum=cls._sha256_file(grade_path),
        )

    @staticmethod
    def _package_ready_manifest(
        trusted_plan,
        *,
        story_checksum: str,
        grade_checksum: str,
    ) -> ProductionStatusManifest:
        return ProductionStatusManifest(
            shoot_slug=trusted_plan.shoot_slug,
            production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
            job_statuses=tuple(
                ProductionJobStatus(
                    job_id=job.job_id,
                    state="succeeded",
                    worker_adapter="story-production-local",
                    attempts=1,
                    output_checksums=(OutputChecksum(path=job.outputs[0], sha256=story_checksum),),
                    updated_at="2026-05-10T19:10:00Z",
                )
                if job.output_kind == "storyline_selection"
                else ProductionJobStatus(
                    job_id=job.job_id,
                    state="succeeded",
                    worker_adapter="grade-production-local",
                    attempts=1,
                    output_checksums=(OutputChecksum(path=job.outputs[0], sha256=grade_checksum),),
                    updated_at="2026-05-10T17:35:00Z",
                )
                if job.output_kind in {"graded_photo", "graded_video"}
                else ProductionJobStatus(
                    job_id=job.job_id,
                    state="succeeded",
                    worker_adapter="look-production-local",
                    attempts=1,
                    output_checksums=tuple(OutputChecksum(path=output, sha256="c" * 64) for output in job.outputs),
                    updated_at="2026-05-10T16:05:00Z",
                )
                if job.output_kind == "look_development"
                else ProductionJobStatus(
                    job_id=job.job_id,
                    state="succeeded",
                    worker_adapter="scene-production-local",
                    attempts=1,
                    output_checksums=tuple(OutputChecksum(path=output, sha256="d" * 64) for output in job.outputs),
                    updated_at="2026-05-10T15:20:00Z",
                )
                if job.output_kind == "scene_grouping"
                else ProductionJobStatus(
                    job_id=job.job_id,
                    state="succeeded",
                    worker_adapter="analysis-production-local",
                    attempts=1,
                    output_checksums=tuple(OutputChecksum(path=output, sha256="e" * 64) for output in job.outputs),
                    updated_at="2026-05-10T15:10:00Z",
                )
                if job.output_kind == "vlm_asset_analysis"
                else ProductionJobStatus(
                    job_id=job.job_id,
                    state="succeeded",
                    worker_adapter="proxy-production-local",
                    attempts=1,
                    output_checksums=tuple(OutputChecksum(path=output, sha256="a" * 64) for output in job.outputs),
                    updated_at="2026-05-10T14:10:00Z",
                )
                if job.output_kind == "proxy_media"
                else ProductionJobStatus(job_id=job.job_id, state="pending")
                for job in trusted_plan.jobs
            ),
        )

    @staticmethod
    def _grade_ready_manifest(
        trusted_plan,
        *,
        analysis_checksum: str,
        look_checksum: str,
    ) -> ProductionStatusManifest:
        return ProductionStatusManifest(
            shoot_slug=trusted_plan.shoot_slug,
            production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
            job_statuses=tuple(
                ProductionJobStatus(
                    job_id=job.job_id,
                    state="succeeded",
                    worker_adapter="look-production-local",
                    attempts=1,
                    output_checksums=(
                        OutputChecksum(path=job.outputs[0], sha256=look_checksum),
                    ),
                    updated_at="2026-05-10T16:05:00Z",
                )
                if job.output_kind == "look_development"
                else ProductionJobStatus(
                    job_id=job.job_id,
                    state="succeeded",
                    worker_adapter="analysis-production-local",
                    attempts=1,
                    output_checksums=tuple(
                        OutputChecksum(
                            path=output,
                            sha256=analysis_checksum if output == "analysis/00000.json" else "b" * 64,
                        )
                        for output in job.outputs
                    ),
                    updated_at="2026-05-10T15:10:00Z",
                )
                if job.output_kind == "vlm_asset_analysis"
                else ProductionJobStatus(
                    job_id=job.job_id,
                    state="succeeded",
                    worker_adapter="scene-production-local",
                    attempts=1,
                    output_checksums=tuple(
                        OutputChecksum(path=output, sha256="a" * 64)
                        for output in job.outputs
                    ),
                    updated_at="2026-05-10T15:20:00Z",
                )
                if job.output_kind == "scene_grouping"
                else ProductionJobStatus(
                    job_id=job.job_id,
                    state="succeeded",
                    worker_adapter="proxy-production-local",
                    attempts=1,
                    output_checksums=tuple(
                        OutputChecksum(path=output, sha256="a" * 64)
                        for output in job.outputs
                    ),
                    updated_at="2026-05-10T14:10:00Z",
                )
                if job.output_kind == "proxy_media"
                else ProductionJobStatus(job_id=job.job_id, state="pending")
                for job in trusted_plan.jobs
            ),
        )


if __name__ == "__main__":
    unittest.main()
