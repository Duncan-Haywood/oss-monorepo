from dataclasses import replace
import hashlib
from pathlib import Path
import tempfile
import unittest

from shootflow.deliverables import MediaAsset
from shootflow.production import build_production_plan
from shootflow.production_status import (
    OutputChecksum,
    ProductionJobStatus,
    ProductionStatusManifest,
    load_production_status_manifest,
    production_plan_fingerprint,
    write_production_status_manifest,
)
from shootflow.production_worker import (
    ExpiredProductionLease,
    ProductionLeaseExpirationPlan,
    ProductionWorkerError,
    claim_production_worker_action,
    plan_production_worker_actions,
    plan_stale_production_leases,
    persist_stale_production_leases,
    report_production_worker_failure,
    report_production_worker_retryable,
    report_production_worker_success,
)


class ProductionWorkerTests(unittest.TestCase):
    def test_schedules_dependency_ready_pending_and_retryable_jobs(self) -> None:
        trusted_plan = self._trusted_plan()
        manifest = ProductionStatusManifest(
            shoot_slug="production-worker",
            production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
            job_statuses=self._statuses_with(
                trusted_plan,
                {
                    "proxy_asset_00000": self._succeeded_status(
                        trusted_plan.job_by_id("proxy_asset_00000"),
                    ),
                    "proxy_asset_00001": ProductionJobStatus(
                        job_id="proxy_asset_00001",
                        state="retryable",
                        worker_adapter="proxy-local",
                        attempts=2,
                        error_message="proxy worker interrupted; no files were deleted",
                        updated_at="2026-05-09T15:30:00Z",
                    ),
                },
            ),
        )

        action_plan = plan_production_worker_actions(
            trusted_plan,
            manifest,
            worker_adapter="production-local",
        )

        self.assertEqual(action_plan.shoot_slug, "production-worker")
        self.assertEqual(action_plan.worker_adapter, "production-local")
        self.assertEqual(
            [action.job_id for action in action_plan.actions],
            ["proxy_asset_00001", "analyze_asset_00000"],
        )
        self.assertEqual(action_plan.actions[0].attempt_number, 3)
        self.assertEqual(action_plan.actions[1].attempt_number, 1)
        self.assertEqual(
            [(blocked.job_id, blocked.missing_dependencies) for blocked in action_plan.blocked_jobs],
            [
                ("analyze_asset_00001", ("proxy_asset_00001",)),
                ("group_scene_sets", ("analyze_asset_00000", "analyze_asset_00001")),
                ("develop_shoot_look", ("group_scene_sets",)),
                ("grade_asset_00000", ("develop_shoot_look", "analyze_asset_00000")),
                ("grade_asset_00001", ("develop_shoot_look", "analyze_asset_00001")),
                ("rank_instagram_storylines", ("group_scene_sets", "develop_shoot_look", "grade_asset_00000", "grade_asset_00001")),
                ("assemble_instagram_reel", ("rank_instagram_storylines", "grade_asset_00000")),
                ("assemble_instagram_carousel", ("rank_instagram_storylines", "grade_asset_00001")),
                ("export_instagram_photo_set", ("rank_instagram_storylines", "grade_asset_00001")),
            ],
        )

    def test_plans_expired_running_production_leases_as_retryable_transitions(self) -> None:
        trusted_plan = self._trusted_plan()
        manifest = ProductionStatusManifest(
            shoot_slug="production-worker",
            production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
            job_statuses=self._statuses_with(
                trusted_plan,
                {
                    "proxy_asset_00000": ProductionJobStatus(
                        job_id="proxy_asset_00000",
                        state="running",
                        worker_adapter="proxy-local",
                        attempts=1,
                        updated_at="2026-05-09T15:30:00Z",
                    ),
                    "proxy_asset_00001": ProductionJobStatus(
                        job_id="proxy_asset_00001",
                        state="running",
                        worker_adapter="proxy-local",
                        attempts=2,
                        updated_at="2026-05-09T15:45:00Z",
                    ),
                },
            ),
        )

        expiration_plan = plan_stale_production_leases(
            trusted_plan,
            manifest,
            stale_before="2026-05-09T15:40:00Z",
            updated_at="2026-05-09T16:00:00Z",
        )

        expected_retryable_status = ProductionJobStatus(
            job_id="proxy_asset_00000",
            state="retryable",
            worker_adapter="proxy-local",
            attempts=1,
            error_message=(
                "Production worker lease expired after running since 2026-05-09T15:30:00Z; "
                "no source, analysis, graded, render, or deliverable files were deleted or cleaned up."
            ),
            updated_at="2026-05-09T16:00:00Z",
        )
        self.assertEqual(
            expiration_plan,
            ProductionLeaseExpirationPlan(
                shoot_slug="production-worker",
                stale_before="2026-05-09T15:40:00Z",
                updated_at="2026-05-09T16:00:00Z",
                expired_leases=(
                    ExpiredProductionLease(
                        job_id="proxy_asset_00000",
                        worker_adapter="proxy-local",
                        attempt_number=1,
                        running_since="2026-05-09T15:30:00Z",
                        retryable_status=expected_retryable_status,
                    ),
                ),
            ),
        )

    def test_rejects_invalid_production_lease_cutoff_timestamps(self) -> None:
        trusted_plan = self._trusted_plan()
        manifest = ProductionStatusManifest(
            shoot_slug="production-worker",
            production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
            job_statuses=tuple(
                ProductionJobStatus(job_id=job.job_id, state="pending")
                for job in trusted_plan.jobs
            ),
        )

        with self.assertRaisesRegex(ProductionWorkerError, "timestamp"):
            plan_stale_production_leases(
                trusted_plan,
                manifest,
                stale_before="2026-05-09 15:40",
                updated_at="2026-05-09T16:00:00Z",
            )

    def test_persists_stale_production_leases_with_lease_preconditions(self) -> None:
        trusted_plan = self._trusted_plan()
        running_manifest = ProductionStatusManifest(
            shoot_slug="production-worker",
            production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
            job_statuses=self._statuses_with(
                trusted_plan,
                {
                    "proxy_asset_00000": ProductionJobStatus(
                        job_id="proxy_asset_00000",
                        state="running",
                        worker_adapter="proxy-local",
                        attempts=1,
                        updated_at="2026-05-09T15:30:00Z",
                    ),
                    "proxy_asset_00001": ProductionJobStatus(
                        job_id="proxy_asset_00001",
                        state="running",
                        worker_adapter="proxy-local",
                        attempts=2,
                        updated_at="2026-05-09T15:35:00Z",
                    ),
                },
            ),
        )
        expiration_plan = plan_stale_production_leases(
            trusted_plan,
            running_manifest,
            stale_before="2026-05-09T15:40:00Z",
            updated_at="2026-05-09T16:00:00Z",
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_production_status_manifest(running_manifest, workspace, trusted_plan=trusted_plan)

            persistence_result = persist_stale_production_leases(
                workspace,
                trusted_plan=trusted_plan,
                expiration_plan=expiration_plan,
            )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(
            [persisted.job_id for persisted in persistence_result.persisted_leases],
            ["proxy_asset_00000", "proxy_asset_00001"],
        )
        self.assertEqual(persistence_result.conflicted_leases, ())
        self.assertEqual(loaded_manifest.job_statuses[0].state, "retryable")
        self.assertEqual(loaded_manifest.job_statuses[1].state, "retryable")
        for status in loaded_manifest.job_statuses[:2]:
            self.assertIn("no source, analysis, graded, render, or deliverable files were deleted", status.error_message or "")
            self.assertEqual(status.updated_at, "2026-05-09T16:00:00Z")

    def test_reports_stale_production_lease_persistence_conflicts_without_clobbering(self) -> None:
        trusted_plan = self._trusted_plan()
        planned_manifest = ProductionStatusManifest(
            shoot_slug="production-worker",
            production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
            job_statuses=self._statuses_with(
                trusted_plan,
                {
                    "proxy_asset_00000": ProductionJobStatus(
                        job_id="proxy_asset_00000",
                        state="running",
                        worker_adapter="proxy-local",
                        attempts=1,
                        updated_at="2026-05-09T15:30:00Z",
                    ),
                },
            ),
        )
        expiration_plan = plan_stale_production_leases(
            trusted_plan,
            planned_manifest,
            stale_before="2026-05-09T15:40:00Z",
            updated_at="2026-05-09T16:00:00Z",
        )
        refreshed_manifest = ProductionStatusManifest(
            shoot_slug="production-worker",
            production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
            job_statuses=self._statuses_with(
                trusted_plan,
                {
                    "proxy_asset_00000": ProductionJobStatus(
                        job_id="proxy_asset_00000",
                        state="running",
                        worker_adapter="proxy-local",
                        attempts=1,
                        updated_at="2026-05-09T15:50:00Z",
                    ),
                },
            ),
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_production_status_manifest(refreshed_manifest, workspace, trusted_plan=trusted_plan)

            persistence_result = persist_stale_production_leases(
                workspace,
                trusted_plan=trusted_plan,
                expiration_plan=expiration_plan,
            )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(persistence_result.persisted_leases, ())
        self.assertEqual(len(persistence_result.conflicted_leases), 1)
        conflict = persistence_result.conflicted_leases[0]
        self.assertEqual(conflict.job_id, "proxy_asset_00000")
        self.assertIn("another worker already changed this job", conflict.error_message)
        self.assertIn("no source, analysis, graded, render, or deliverable files were deleted", conflict.error_message)
        self.assertEqual(loaded_manifest, refreshed_manifest)

    def test_rejects_expiration_plan_with_forged_retryable_status_content(self) -> None:
        trusted_plan = self._trusted_plan()
        running_manifest = ProductionStatusManifest(
            shoot_slug="production-worker",
            production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
            job_statuses=self._statuses_with(
                trusted_plan,
                {
                    "proxy_asset_00000": ProductionJobStatus(
                        job_id="proxy_asset_00000",
                        state="running",
                        worker_adapter="proxy-local",
                        attempts=1,
                        updated_at="2026-05-09T15:30:00Z",
                    ),
                },
            ),
        )
        expiration_plan = plan_stale_production_leases(
            trusted_plan,
            running_manifest,
            stale_before="2026-05-09T15:40:00Z",
            updated_at="2026-05-09T16:00:00Z",
        )
        forged_plan = replace(
            expiration_plan,
            expired_leases=(
                replace(
                    expiration_plan.expired_leases[0],
                    retryable_status=replace(
                        expiration_plan.expired_leases[0].retryable_status,
                        error_message="delete partial production outputs before retrying",
                    ),
                ),
            ),
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_production_status_manifest(running_manifest, workspace, trusted_plan=trusted_plan)

            with self.assertRaisesRegex(ProductionWorkerError, "retryable status"):
                persist_stale_production_leases(
                    workspace,
                    trusted_plan=trusted_plan,
                    expiration_plan=forged_plan,
                )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(loaded_manifest, running_manifest)

    def test_claim_and_report_success_from_declared_outputs_only(self) -> None:
        trusted_plan = self._trusted_plan()
        manifest = ProductionStatusManifest(
            shoot_slug="production-worker",
            production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
            job_statuses=tuple(
                ProductionJobStatus(job_id=job.job_id, state="pending")
                for job in trusted_plan.jobs
            ),
        )
        action = plan_production_worker_actions(
            trusted_plan,
            manifest,
            worker_adapter="proxy-local",
        ).actions[0]
        current_status = ProductionJobStatus(job_id=action.job_id, state="pending")

        running_status = claim_production_worker_action(
            current_status,
            action,
            updated_at="2026-05-09T15:33:00Z",
        )
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            output_path = workspace / action.outputs[0]
            output_path.parent.mkdir(parents=True)
            output_path.write_bytes(b"proxy-bytes")

            succeeded_status = report_production_worker_success(
                running_status,
                action,
                workspace,
                updated_at="2026-05-09T15:34:00Z",
            )

        self.assertEqual(running_status.state, "running")
        self.assertEqual(running_status.worker_adapter, "proxy-local")
        self.assertEqual(running_status.attempts, 1)
        self.assertEqual(succeeded_status.state, "succeeded")
        self.assertEqual(
            succeeded_status.output_checksums,
            (
                OutputChecksum(
                    path=action.outputs[0],
                    sha256=hashlib.sha256(b"proxy-bytes").hexdigest(),
                ),
            ),
        )

    def test_report_success_rejects_missing_declared_output(self) -> None:
        trusted_plan = self._trusted_plan()
        action = plan_production_worker_actions(
            trusted_plan,
            ProductionStatusManifest(
                shoot_slug="production-worker",
                production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
                job_statuses=tuple(
                    ProductionJobStatus(job_id=job.job_id, state="pending")
                    for job in trusted_plan.jobs
                ),
            ),
            worker_adapter="proxy-local",
        ).actions[0]
        running_status = ProductionJobStatus(
            job_id=action.job_id,
            state="running",
            worker_adapter=action.worker_adapter,
            attempts=action.attempt_number,
            updated_at="2026-05-09T15:33:00Z",
        )

        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ProductionWorkerError, "Missing production output"):
                report_production_worker_success(
                    running_status,
                    action,
                    Path(tmp),
                    updated_at="2026-05-09T15:34:00Z",
                )

    def test_report_retryable_and_failure_keep_error_state_non_destructive(self) -> None:
        trusted_plan = self._trusted_plan()
        action = plan_production_worker_actions(
            trusted_plan,
            ProductionStatusManifest(
                shoot_slug="production-worker",
                production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
                job_statuses=tuple(
                    ProductionJobStatus(job_id=job.job_id, state="pending")
                    for job in trusted_plan.jobs
                ),
            ),
            worker_adapter="vlm-local",
        ).actions[0]
        running_status = ProductionJobStatus(
            job_id=action.job_id,
            state="running",
            worker_adapter=action.worker_adapter,
            attempts=action.attempt_number,
            updated_at="2026-05-09T15:35:00Z",
        )

        retryable_status = report_production_worker_retryable(
            running_status,
            action,
            error_message="adapter interrupted; no source, graded, or deliverable files were deleted",
            updated_at="2026-05-09T15:36:00Z",
        )
        failed_status = report_production_worker_failure(
            running_status,
            action,
            error_message="adapter output failed validation; no source media was deleted",
            updated_at="2026-05-09T15:37:00Z",
        )

        self.assertEqual(retryable_status.state, "retryable")
        self.assertEqual(retryable_status.output_checksums, ())
        self.assertIn("no source", retryable_status.error_message or "")
        self.assertEqual(failed_status.state, "failed")
        self.assertEqual(failed_status.output_checksums, ())

    @staticmethod
    def _trusted_plan():
        return build_production_plan(
            [
                MediaAsset(path="originals/A001.MOV", media_type="video", duration_seconds=12.0),
                MediaAsset(path="originals/IMG_0001.CR3", media_type="photo"),
            ],
            shoot_slug="production-worker",
        )

    @staticmethod
    def _statuses_with(trusted_plan, overrides):
        return tuple(
            overrides.get(job.job_id, ProductionJobStatus(job_id=job.job_id, state="pending"))
            for job in trusted_plan.jobs
        )

    @staticmethod
    def _succeeded_status(job) -> ProductionJobStatus:
        return ProductionJobStatus(
            job_id=job.job_id,
            state="succeeded",
            worker_adapter="production-local",
            attempts=1,
            output_checksums=tuple(
                OutputChecksum(path=output_path, sha256="a" * 64)
                for output_path in job.outputs
            ),
            updated_at="2026-05-09T15:29:00Z",
        )


if __name__ == "__main__":
    unittest.main()
