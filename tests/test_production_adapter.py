import json
from pathlib import Path
import tempfile
import unittest

from shootflow.deliverables import MediaAsset
from shootflow.production import build_production_plan
from shootflow.production_adapter import (
    DryRunProductionAdapterResult,
    DryRunProductionError,
    MetadataProductionAdapterResult,
    run_metadata_production_action,
    run_dry_run_production_action,
    supported_production_adapter_names,
)
from shootflow.production_status import (
    OutputChecksum,
    ProductionJobStatus,
    ProductionStatusManifest,
    load_production_status_manifest,
    production_plan_fingerprint,
    write_production_status_manifest,
)
from shootflow.production_worker import plan_production_worker_actions


class DryRunProductionAdapterTests(unittest.TestCase):
    def test_persists_claim_and_success_for_declared_outputs(self) -> None:
        trusted_plan = self._trusted_plan()
        initial_manifest = self._pending_manifest(trusted_plan)
        action = plan_production_worker_actions(
            trusted_plan,
            initial_manifest,
            worker_adapter="dry-run-production-local",
        ).actions[0]

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-09T16:05:00Z",
                completed_at="2026-05-09T16:05:05Z",
            )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
            output_path = workspace / action.outputs[0]
            output_exists = output_path.exists()

        self.assertEqual(supported_production_adapter_names(), ("dry-run-production-local",))
        self.assertIsInstance(result, DryRunProductionAdapterResult)
        self.assertEqual(result.job_id, action.job_id)
        self.assertEqual(result.claimed_status.state, "running")
        self.assertEqual(result.final_status.state, "succeeded")
        self.assertEqual(result.outputs_materialized, action.outputs)
        self.assertEqual(result.manifest, loaded_manifest)
        self.assertTrue(output_exists)
        self.assertEqual(result.final_status.output_checksums[0].path, action.outputs[0])

    def test_refuses_to_overwrite_existing_different_output_and_marks_retryable(self) -> None:
        trusted_plan = self._trusted_plan()
        initial_manifest = self._pending_manifest(trusted_plan)
        action = plan_production_worker_actions(
            trusted_plan,
            initial_manifest,
            worker_adapter="dry-run-production-local",
        ).actions[0]

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            output_path = workspace / action.outputs[0]
            output_path.parent.mkdir(parents=True)
            output_path.write_bytes(b"manual proxy export")
            write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-09T16:06:00Z",
                completed_at="2026-05-09T16:06:05Z",
            )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
            preserved_bytes = output_path.read_bytes()

        self.assertEqual(result.final_status.state, "retryable")
        self.assertIn("Refusing to overwrite", result.final_status.error_message or "")
        self.assertEqual(result.outputs_materialized, ())
        self.assertEqual(preserved_bytes, b"manual proxy export")
        self.assertEqual(loaded_manifest.job_statuses[0], result.final_status)

    def test_stale_claim_does_not_materialize_outputs(self) -> None:
        trusted_plan = self._trusted_plan()
        initial_manifest = self._pending_manifest(trusted_plan)
        action = plan_production_worker_actions(
            trusted_plan,
            initial_manifest,
            worker_adapter="dry-run-production-local",
        ).actions[0]
        running_manifest = ProductionStatusManifest(
            shoot_slug=trusted_plan.shoot_slug,
            production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
            job_statuses=(
                ProductionJobStatus(
                    job_id=action.job_id,
                    state="running",
                    worker_adapter="dry-run-production-local",
                    attempts=1,
                    updated_at="2026-05-09T16:04:00Z",
                ),
            )
            + initial_manifest.job_statuses[1:],
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_production_status_manifest(running_manifest, workspace, trusted_plan=trusted_plan)

            with self.assertRaisesRegex(DryRunProductionError, "current status"):
                run_dry_run_production_action(
                    workspace,
                    trusted_plan=trusted_plan,
                    action=action,
                    started_at="2026-05-09T16:07:00Z",
                    completed_at="2026-05-09T16:07:05Z",
                )
            output_exists = (workspace / action.outputs[0]).exists()
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertFalse(output_exists)
        self.assertEqual(loaded_manifest, running_manifest)

    def test_directory_style_package_output_becomes_retryable_without_creating_file(self) -> None:
        trusted_plan = self._trusted_plan()
        target_job_id = "assemble_instagram_carousel"
        ready_manifest = ProductionStatusManifest(
            shoot_slug=trusted_plan.shoot_slug,
            production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
            job_statuses=tuple(
                ProductionJobStatus(job_id=job.job_id, state="pending")
                if job.job_id == target_job_id
                else self._succeeded_status(job)
                if trusted_plan.jobs.index(job) < trusted_plan.jobs.index(trusted_plan.job_by_id(target_job_id))
                else ProductionJobStatus(job_id=job.job_id, state="pending")
                for job in trusted_plan.jobs
            ),
        )
        action = next(
            action
            for action in plan_production_worker_actions(
                trusted_plan,
                ready_manifest,
                worker_adapter="dry-run-production-local",
            ).actions
            if action.job_id == target_job_id
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            result = run_dry_run_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-09T16:08:00Z",
                completed_at="2026-05-09T16:08:05Z",
            )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
            package_path_exists = (workspace / action.outputs[0]).exists()

        self.assertEqual(action.outputs, ("deliverables/instagram_carousel/",))
        self.assertEqual(result.final_status.state, "retryable")
        self.assertIn("directory-style output", result.final_status.error_message or "")
        self.assertEqual(result.outputs_materialized, ())
        self.assertFalse(package_path_exists)
        self.assertEqual(loaded_manifest.job_statuses[trusted_plan.jobs.index(trusted_plan.job_by_id(target_job_id))], result.final_status)

    def test_metadata_adapter_persists_input_fingerprints_for_declared_outputs(self) -> None:
        trusted_plan = self._trusted_plan()
        initial_manifest = self._pending_manifest(trusted_plan)
        action = plan_production_worker_actions(
            trusted_plan,
            initial_manifest,
            worker_adapter="metadata-production-local",
        ).actions[0]

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            input_path = workspace / action.inputs[0]
            input_path.parent.mkdir(parents=True)
            input_path.write_bytes(b"trusted camera bytes")
            write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_metadata_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T10:05:00Z",
                completed_at="2026-05-10T10:05:05Z",
            )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
            output_payload = json.loads((workspace / action.outputs[0]).read_text(encoding="utf-8"))

        self.assertEqual(
            supported_production_adapter_names(),
            ("dry-run-production-local", "metadata-production-local"),
        )
        self.assertIsInstance(result, MetadataProductionAdapterResult)
        self.assertEqual(result.final_status.state, "succeeded")
        self.assertEqual(result.outputs_materialized, action.outputs)
        self.assertEqual(result.manifest, loaded_manifest)
        self.assertEqual(output_payload["adapter"], "shootflow-metadata-production")
        self.assertEqual(output_payload["job_id"], action.job_id)
        self.assertEqual(output_payload["output_kind"], action.output_kind)
        self.assertEqual(
            output_payload["input_metadata"],
            [
                {
                    "path": action.inputs[0],
                    "sha256": "5cd00a6f04b1f9fc069579fb82120fe61fe1af4d31d2f9a1fb2e4da5090a0181",
                    "size_bytes": 20,
                }
            ],
        )

    def test_metadata_adapter_missing_input_becomes_retryable_without_output(self) -> None:
        trusted_plan = self._trusted_plan()
        initial_manifest = self._pending_manifest(trusted_plan)
        action = plan_production_worker_actions(
            trusted_plan,
            initial_manifest,
            worker_adapter="metadata-production-local",
        ).actions[0]

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_metadata_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T10:06:00Z",
                completed_at="2026-05-10T10:06:05Z",
            )
            output_exists = (workspace / action.outputs[0]).exists()
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(result.final_status.state, "retryable")
        self.assertIn("Missing metadata production input", result.final_status.error_message or "")
        self.assertEqual(result.outputs_materialized, ())
        self.assertFalse(output_exists)
        self.assertEqual(loaded_manifest.job_statuses[0], result.final_status)

    @staticmethod
    def _trusted_plan():
        return build_production_plan(
            [
                MediaAsset(path="originals/A001.MOV", media_type="video", duration_seconds=12.0),
                MediaAsset(path="originals/IMG_0001.CR3", media_type="photo"),
            ],
            shoot_slug="production-adapter",
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
    def _succeeded_status(job) -> ProductionJobStatus:
        return ProductionJobStatus(
            job_id=job.job_id,
            state="succeeded",
            worker_adapter="dry-run-production-local",
            attempts=1,
            output_checksums=tuple(
                OutputChecksum(path=output, sha256="a" * 64)
                for output in job.outputs
            ),
            updated_at="2026-05-09T16:03:00Z",
        )


if __name__ == "__main__":
    unittest.main()
