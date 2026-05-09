from pathlib import Path
import tempfile
import unittest

from shootflow.deliverables import MediaAsset
from shootflow.production import build_production_plan
from shootflow.production_scheduler import (
    DryRunProductionSchedulerError,
    DryRunProductionSchedulerResult,
    run_dry_run_production_scheduler,
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
