import os
from pathlib import Path
import tempfile
import unittest

from shootflow.deliverables import MediaAsset
from shootflow.production import ExecutionWave, ProductionJob, ProductionPlan, build_production_plan
from shootflow.production_adapter import (
    DryRunProductionAdapterResult,
    DryRunProductionError,
    run_production_adapter_batch,
    run_dry_run_production_action,
    run_metadata_production_action,
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

        self.assertEqual(
            supported_production_adapter_names(),
            ("dry-run-production-local", "metadata-production-local"),
        )
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

    def test_metadata_adapter_writes_declared_output_from_real_input_metadata(self) -> None:
        trusted_plan = self._trusted_plan()
        initial_manifest = self._pending_manifest(trusted_plan)
        action = plan_production_worker_actions(
            trusted_plan,
            initial_manifest,
            worker_adapter="metadata-production-local",
        ).actions[0]

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            source_path = workspace / action.inputs[0]
            source_path.parent.mkdir(parents=True)
            source_path.write_bytes(b"trusted camera bytes")
            write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_metadata_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T05:35:00Z",
                completed_at="2026-05-10T05:35:05Z",
            )
            output_text = (workspace / action.outputs[0]).read_text(encoding="utf-8")
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertIn('"adapter": "shootflow-metadata-production-local"', output_text)
        self.assertIn('"path": "originals/A001.MOV"', output_text)
        self.assertIn('"size_bytes": 20', output_text)
        self.assertEqual(result.final_status.state, "succeeded")
        self.assertEqual(result.outputs_materialized, action.outputs)
        self.assertEqual(result.final_status.output_checksums[0].path, action.outputs[0])
        self.assertEqual(loaded_manifest.job_statuses[0], result.final_status)

    def test_metadata_adapter_marks_missing_real_input_retryable_without_output(self) -> None:
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
                started_at="2026-05-10T05:36:00Z",
                completed_at="2026-05-10T05:36:05Z",
            )
            output_exists = (workspace / action.outputs[0]).exists()
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(result.final_status.state, "retryable")
        self.assertIn("Missing metadata production input", result.final_status.error_message or "")
        self.assertFalse(output_exists)
        self.assertEqual(loaded_manifest.job_statuses[0], result.final_status)

    def test_metadata_adapter_marks_missing_extensionless_input_retryable(self) -> None:
        trusted_plan = ProductionPlan(
            shoot_slug="extensionless-input",
            jobs=(
                ProductionJob(
                    job_id="proxy_asset_00000",
                    output_kind="proxy_media",
                    inputs=("RAWFILE",),
                    outputs=("proxies/proxy_asset_00000/RAWFILE",),
                ),
            ),
            execution_waves=(
                ExecutionWave(
                    wave_index=0,
                    jobs=(
                        ProductionJob(
                            job_id="proxy_asset_00000",
                            output_kind="proxy_media",
                            inputs=("RAWFILE",),
                            outputs=("proxies/proxy_asset_00000/RAWFILE",),
                        ),
                    ),
                ),
            ),
        )
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
                started_at="2026-05-10T05:38:00Z",
                completed_at="2026-05-10T05:38:05Z",
            )
            output_exists = (workspace / action.outputs[0]).exists()

        self.assertEqual(result.final_status.state, "retryable")
        self.assertIn("Missing metadata production input", result.final_status.error_message or "")
        self.assertFalse(output_exists)

    def test_metadata_adapter_accepts_trusted_absolute_inputs_inside_workspace(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            source_path = workspace / "originals" / "A001.MOV"
            source_path.parent.mkdir(parents=True)
            source_path.write_bytes(b"absolute camera bytes")
            trusted_plan = build_production_plan(
                [MediaAsset(path=str(source_path), media_type="video", duration_seconds=12.0)],
                shoot_slug="absolute-input",
            )
            initial_manifest = self._pending_manifest(trusted_plan)
            action = plan_production_worker_actions(
                trusted_plan,
                initial_manifest,
                worker_adapter="metadata-production-local",
            ).actions[0]
            write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_metadata_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T05:39:00Z",
                completed_at="2026-05-10T05:39:05Z",
            )
            output_text = (workspace / action.outputs[0]).read_text(encoding="utf-8")

        self.assertEqual(result.final_status.state, "succeeded")
        self.assertIn('"path": "originals/A001.MOV"', output_text)

    def test_metadata_adapter_accepts_relative_manifest_inputs_inside_workspace(self) -> None:
        original_cwd = Path.cwd()
        with tempfile.TemporaryDirectory() as tmpdir:
            os.chdir(tmpdir)
            try:
                workspace = Path("library") / "2026-05-10_relative-input"
                source_path = workspace / "originals" / "A001.MOV"
                source_path.parent.mkdir(parents=True)
                source_path.write_bytes(b"relative manifest camera bytes")
                trusted_plan = build_production_plan(
                    [MediaAsset(path=str(source_path), media_type="video", duration_seconds=12.0)],
                    shoot_slug="relative-input",
                )
                initial_manifest = self._pending_manifest(trusted_plan)
                action = plan_production_worker_actions(
                    trusted_plan,
                    initial_manifest,
                    worker_adapter="metadata-production-local",
                ).actions[0]
                write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

                result = run_metadata_production_action(
                    workspace,
                    trusted_plan=trusted_plan,
                    action=action,
                    started_at="2026-05-10T05:40:00Z",
                    completed_at="2026-05-10T05:40:05Z",
                )
                output_text = (workspace / action.outputs[0]).read_text(encoding="utf-8")
            finally:
                os.chdir(original_cwd)

        self.assertEqual(result.final_status.state, "succeeded")
        self.assertIn('"path": "originals/A001.MOV"', output_text)

    def test_metadata_adapter_prefers_workspace_relative_input_over_cwd_collision(self) -> None:
        original_cwd = Path.cwd()
        with tempfile.TemporaryDirectory() as tmpdir:
            os.chdir(tmpdir)
            try:
                cwd_collision = Path("originals") / "A001.MOV"
                cwd_collision.parent.mkdir(parents=True)
                cwd_collision.write_bytes(b"wrong cwd file")
                workspace = Path("shoot")
                source_path = workspace / "originals" / "A001.MOV"
                source_path.parent.mkdir(parents=True)
                source_path.write_bytes(b"trusted workspace file")
                trusted_plan = build_production_plan(
                    [MediaAsset(path="originals/A001.MOV", media_type="video", duration_seconds=12.0)],
                    shoot_slug="cwd-collision",
                )
                initial_manifest = self._pending_manifest(trusted_plan)
                action = plan_production_worker_actions(
                    trusted_plan,
                    initial_manifest,
                    worker_adapter="metadata-production-local",
                ).actions[0]
                write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

                result = run_metadata_production_action(
                    workspace,
                    trusted_plan=trusted_plan,
                    action=action,
                    started_at="2026-05-10T05:41:00Z",
                    completed_at="2026-05-10T05:41:05Z",
                )
                output_text = (workspace / action.outputs[0]).read_text(encoding="utf-8")
            finally:
                os.chdir(original_cwd)

        self.assertEqual(result.final_status.state, "succeeded")
        self.assertIn('"size_bytes": 22', output_text)

    def test_metadata_adapter_rejects_absolute_input_outside_workspace(self) -> None:
        with tempfile.TemporaryDirectory() as workspace_dir, tempfile.TemporaryDirectory() as outside_dir:
            workspace = Path(workspace_dir)
            outside_path = Path(outside_dir) / "A001.MOV"
            outside_path.write_bytes(b"outside camera bytes")
            trusted_plan = build_production_plan(
                [MediaAsset(path=str(outside_path), media_type="video", duration_seconds=12.0)],
                shoot_slug="outside-input",
            )
            initial_manifest = self._pending_manifest(trusted_plan)
            action = plan_production_worker_actions(
                trusted_plan,
                initial_manifest,
                worker_adapter="metadata-production-local",
            ).actions[0]
            write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_metadata_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T05:42:00Z",
                completed_at="2026-05-10T05:42:05Z",
            )

        self.assertEqual(result.final_status.state, "retryable")
        self.assertIn("escapes workspace", result.final_status.error_message or "")

    def test_metadata_adapter_rejects_symlinked_input_without_output(self) -> None:
        trusted_plan = self._trusted_plan()
        initial_manifest = self._pending_manifest(trusted_plan)
        action = plan_production_worker_actions(
            trusted_plan,
            initial_manifest,
            worker_adapter="metadata-production-local",
        ).actions[0]

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            outside_path = workspace / "outside.MOV"
            outside_path.write_bytes(b"outside camera bytes")
            source_path = workspace / action.inputs[0]
            source_path.parent.mkdir(parents=True)
            source_path.symlink_to(outside_path)
            write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_metadata_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T09:46:00Z",
                completed_at="2026-05-10T09:46:05Z",
            )
            output_exists = (workspace / action.outputs[0]).exists()
            source_is_symlink = source_path.is_symlink()
            outside_bytes = outside_path.read_bytes()

        self.assertEqual(result.final_status.state, "retryable")
        self.assertIn("metadata production input", result.final_status.error_message or "")
        self.assertIn("symlink", result.final_status.error_message or "")
        self.assertFalse(output_exists)
        self.assertTrue(source_is_symlink)
        self.assertEqual(outside_bytes, b"outside camera bytes")

    def test_metadata_adapter_rejects_symlinked_output_without_modifying_target(self) -> None:
        trusted_plan = self._trusted_plan()
        initial_manifest = self._pending_manifest(trusted_plan)
        action = plan_production_worker_actions(
            trusted_plan,
            initial_manifest,
            worker_adapter="metadata-production-local",
        ).actions[0]

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            source_path = workspace / action.inputs[0]
            source_path.parent.mkdir(parents=True)
            source_path.write_bytes(b"trusted camera bytes")
            outside_path = workspace / "outside-output.json"
            outside_path.write_bytes(b"do not overwrite")
            output_path = workspace / action.outputs[0]
            output_path.parent.mkdir(parents=True)
            output_path.symlink_to(outside_path)
            write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_metadata_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T09:47:00Z",
                completed_at="2026-05-10T09:47:05Z",
            )
            output_is_symlink = output_path.is_symlink()
            outside_bytes = outside_path.read_bytes()

        self.assertEqual(result.final_status.state, "retryable")
        self.assertIn("metadata production output", result.final_status.error_message or "")
        self.assertIn("symlink", result.final_status.error_message or "")
        self.assertTrue(output_is_symlink)
        self.assertEqual(outside_bytes, b"do not overwrite")

    def test_metadata_adapter_preserves_existing_different_output_for_review(self) -> None:
        trusted_plan = self._trusted_plan()
        initial_manifest = self._pending_manifest(trusted_plan)
        action = plan_production_worker_actions(
            trusted_plan,
            initial_manifest,
            worker_adapter="metadata-production-local",
        ).actions[0]

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            source_path = workspace / action.inputs[0]
            source_path.parent.mkdir(parents=True)
            source_path.write_bytes(b"trusted camera bytes")
            output_path = workspace / action.outputs[0]
            output_path.parent.mkdir(parents=True)
            output_path.write_bytes(b"manual metadata")
            write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_metadata_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T09:48:00Z",
                completed_at="2026-05-10T09:48:05Z",
            )
            preserved_bytes = output_path.read_bytes()

        self.assertEqual(result.final_status.state, "retryable")
        self.assertIn("Refusing to overwrite", result.final_status.error_message or "")
        self.assertEqual(result.outputs_materialized, ())
        self.assertEqual(preserved_bytes, b"manual metadata")

    def test_metadata_adapter_batch_runs_ready_actions_through_same_contract(self) -> None:
        trusted_plan = self._trusted_plan()
        initial_manifest = self._pending_manifest(trusted_plan)
        action_plan = plan_production_worker_actions(
            trusted_plan,
            initial_manifest,
            worker_adapter="metadata-production-local",
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            for action in action_plan.actions:
                source_path = workspace / action.inputs[0]
                source_path.parent.mkdir(parents=True, exist_ok=True)
                source_path.write_bytes(f"camera bytes for {action.job_id}".encode("utf-8"))
            write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_production_adapter_batch(
                workspace,
                trusted_plan=trusted_plan,
                action_plan=action_plan,
                started_at="2026-05-10T05:37:00Z",
                completed_at="2026-05-10T05:37:05Z",
                max_concurrency=2,
            )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(result.worker_adapter, "metadata-production-local")
        self.assertEqual(tuple(action.job_id for action in action_plan.actions), ("proxy_asset_00000", "proxy_asset_00001"))
        self.assertEqual(tuple(action_result.final_status.state for action_result in result.results), ("succeeded", "succeeded"))
        self.assertEqual(tuple(status.state for status in loaded_manifest.job_statuses[:2]), ("succeeded", "succeeded"))

    def test_adapter_batch_rejects_invalid_action_plan_before_dispatch(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            with self.assertRaisesRegex(DryRunProductionError, "action_plan"):
                run_production_adapter_batch(
                    Path(tmpdir),
                    trusted_plan=self._trusted_plan(),
                    action_plan=object(),
                    started_at="2026-05-10T07:09:00Z",
                    completed_at="2026-05-10T07:09:05Z",
                    max_concurrency=1,
                )

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
