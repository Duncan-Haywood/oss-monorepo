from pathlib import Path
import tempfile
import unittest

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
    ProductionJobStatus,
    ProductionStatusManifest,
    load_production_status_manifest,
    production_plan_fingerprint,
    write_production_status_manifest,
)


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
            )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(result.stopped_reason, "retryable")
        self.assertEqual(result.iterations[0].expired_lease_job_ids, ("proxy_asset_00000",))
        self.assertEqual(result.iterations[0].conflicted_lease_job_ids, ())
        self.assertEqual(result.iterations[0].attempted_job_ids, ())
        self.assertEqual(result.iterations[0].skipped_retryable_job_ids, ("proxy_asset_00000",))
        self.assertEqual(loaded_manifest.job_statuses[0].state, "retryable")
        self.assertIn("lease expired", loaded_manifest.job_statuses[0].error_message or "")

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
            loaded_report = load_dry_run_production_scheduler_report(
                workspace,
                trusted_plan=trusted_plan,
                final_manifest=final_manifest,
            )

        self.assertEqual(report_path.name, PRODUCTION_SCHEDULER_REPORT_PATH)
        self.assertIsInstance(loaded_report, DryRunProductionSchedulerReport)
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
    def _pending_manifest(trusted_plan) -> ProductionStatusManifest:
        return ProductionStatusManifest(
            shoot_slug=trusted_plan.shoot_slug,
            production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
            job_statuses=tuple(
                ProductionJobStatus(job_id=job.job_id, state="pending")
                for job in trusted_plan.jobs
            ),
        )


if __name__ == "__main__":
    unittest.main()
