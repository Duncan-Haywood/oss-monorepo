import json
import os
import hashlib
from pathlib import Path
import tempfile
import unittest

from shootflow.analysis import load_asset_analyses
from shootflow.deliverables import MediaAsset
from shootflow.production import ExecutionWave, ProductionJob, ProductionPlan, build_production_plan
from shootflow.production_adapter import (
    ProductionAdapterBatchResult,
    ProductionAdapterError,
    ProductionAdapterResult,
    run_production_adapter_batch,
    run_analysis_production_action,
    run_dry_run_production_action,
    run_grade_production_action,
    run_metadata_production_action,
    run_package_production_action,
    run_proxy_production_action,
    run_story_production_action,
    run_look_production_action,
    run_scene_production_action,
    supported_production_adapter_output_kinds,
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
from shootflow.production_worker import ProductionWorkerAction, plan_production_worker_actions


class DryRunProductionAdapterTests(unittest.TestCase):
    def test_declares_supported_output_kinds_for_stage_specific_adapters(self) -> None:
        self.assertEqual(
            supported_production_adapter_names(),
            (
                "dry-run-production-local",
                "metadata-production-local",
                "proxy-production-local",
                "analysis-production-local",
                "scene-production-local",
                "look-production-local",
                "grade-production-local",
                "story-production-local",
                "package-production-local",
                "ffmpeg-proxy-production-local",
                "ffmpeg-grade-production-local",
            ),
        )
        self.assertIsNone(supported_production_adapter_output_kinds("dry-run-production-local"))
        self.assertIsNone(supported_production_adapter_output_kinds("metadata-production-local"))
        self.assertEqual(
            supported_production_adapter_output_kinds("proxy-production-local"),
            ("proxy_media",),
        )
        self.assertEqual(
            supported_production_adapter_output_kinds("analysis-production-local"),
            ("vlm_asset_analysis",),
        )
        self.assertEqual(
            supported_production_adapter_output_kinds("scene-production-local"),
            ("scene_grouping",),
        )
        self.assertEqual(
            supported_production_adapter_output_kinds("look-production-local"),
            ("look_development",),
        )
        self.assertEqual(
            supported_production_adapter_output_kinds("grade-production-local"),
            ("graded_photo", "graded_video"),
        )
        self.assertEqual(
            supported_production_adapter_output_kinds("story-production-local"),
            ("storyline_selection",),
        )
        self.assertEqual(
            supported_production_adapter_output_kinds("package-production-local"),
            ("instagram_reel", "instagram_carousel", "instagram_photo_set"),
        )
        with self.assertRaisesRegex(ProductionAdapterError, "Unsupported production adapter"):
            supported_production_adapter_output_kinds("future-vlm-local")

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

        self.assertIsInstance(result, ProductionAdapterResult)
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

            with self.assertRaisesRegex(ProductionAdapterError, "current status"):
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

    def test_analysis_adapter_writes_schema_compatible_asset_analysis(self) -> None:
        trusted_plan, ready_manifest, action = self._analysis_ready_context()

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            source_path = workspace / action.inputs[0]
            source_path.parent.mkdir(parents=True)
            source_path.write_bytes(b"trusted analysis source")
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            result = run_analysis_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T14:05:00Z",
                completed_at="2026-05-10T14:05:05Z",
            )
            output_payload = json.loads((workspace / action.outputs[0]).read_text(encoding="utf-8"))
            analyses = load_asset_analyses(trusted_plan, workspace)
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(output_payload["adapter"], "shootflow-analysis-production-local")
        self.assertEqual(output_payload["source_asset_path"], "originals/A001.MOV")
        self.assertEqual(output_payload["media_type"], "video")
        self.assertEqual(result.final_status.state, "succeeded")
        self.assertEqual(result.outputs_materialized, action.outputs)
        self.assertEqual(analyses[0].media_type, "video")
        self.assertEqual(analyses[0].asset_path, "graded/grade_asset_00000/A001.MOV")
        self.assertEqual(loaded_manifest.job_statuses[1], result.final_status)

    def test_analysis_adapter_rejects_wrong_output_kind_before_claim(self) -> None:
        trusted_plan, ready_manifest, action = self._analysis_ready_context()
        malformed_action = ProductionWorkerAction(
            job_id=action.job_id,
            worker_adapter="analysis-production-local",
            attempt_number=action.attempt_number,
            output_kind="proxy_media",
            inputs=action.inputs,
            outputs=action.outputs,
            depends_on=action.depends_on,
            can_run_in_parallel=action.can_run_in_parallel,
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            with self.assertRaisesRegex(ProductionAdapterError, "only materializes vlm_asset_analysis"):
                run_analysis_production_action(
                    workspace,
                    trusted_plan=trusted_plan,
                    action=malformed_action,
                    started_at="2026-05-10T14:06:00Z",
                    completed_at="2026-05-10T14:06:05Z",
                )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(loaded_manifest, ready_manifest)

    def test_analysis_adapter_rejects_malformed_output_before_claim(self) -> None:
        trusted_plan, ready_manifest, action = self._analysis_ready_context()
        malformed_action = ProductionWorkerAction(
            job_id=action.job_id,
            worker_adapter="analysis-production-local",
            attempt_number=action.attempt_number,
            output_kind=action.output_kind,
            inputs=action.inputs,
            outputs=("analysis/not-padded.json",),
            depends_on=action.depends_on,
            can_run_in_parallel=action.can_run_in_parallel,
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            with self.assertRaisesRegex(ProductionAdapterError, "analysis/00000.json-style output"):
                run_analysis_production_action(
                    workspace,
                    trusted_plan=trusted_plan,
                    action=malformed_action,
                    started_at="2026-05-10T14:07:00Z",
                    completed_at="2026-05-10T14:07:05Z",
                )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(loaded_manifest, ready_manifest)

    def test_analysis_adapter_malformed_input_becomes_retryable_after_claim(self) -> None:
        job = ProductionJob(
            job_id="analyze_bad_input",
            output_kind="vlm_asset_analysis",
            inputs=("originals/bad\x00.MOV",),
            outputs=("analysis/00000.json",),
        )
        trusted_plan = ProductionPlan(
            shoot_slug="analysis-bad-input",
            jobs=(job,),
            execution_waves=(ExecutionWave(wave_index=0, jobs=(job,)),),
        )
        initial_manifest = self._pending_manifest(trusted_plan)
        action = plan_production_worker_actions(
            trusted_plan,
            initial_manifest,
            worker_adapter="analysis-production-local",
            eligible_output_kinds=("vlm_asset_analysis",),
        ).actions[0]

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_analysis_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T14:07:30Z",
                completed_at="2026-05-10T14:07:35Z",
            )
            output_exists = (workspace / action.outputs[0]).exists()
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(result.final_status.state, "retryable")
        self.assertIn("Unsafe analysis production input path", result.final_status.error_message or "")
        self.assertFalse(output_exists)
        self.assertEqual(loaded_manifest.job_statuses[0], result.final_status)

    def test_analysis_adapter_rejects_symlinked_input_without_output(self) -> None:
        trusted_plan, ready_manifest, action = self._analysis_ready_context()

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            outside_path = workspace / "outside.MOV"
            outside_path.write_bytes(b"outside camera bytes")
            source_path = workspace / action.inputs[0]
            source_path.parent.mkdir(parents=True)
            source_path.symlink_to(outside_path)
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            result = run_analysis_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T14:08:00Z",
                completed_at="2026-05-10T14:08:05Z",
            )
            output_exists = (workspace / action.outputs[0]).exists()
            outside_bytes = outside_path.read_bytes()

        self.assertEqual(result.final_status.state, "retryable")
        self.assertIn("analysis production input", result.final_status.error_message or "")
        self.assertIn("symlink", result.final_status.error_message or "")
        self.assertFalse(output_exists)
        self.assertEqual(outside_bytes, b"outside camera bytes")

    def test_analysis_adapter_rejects_symlinked_output_without_modifying_target(self) -> None:
        trusted_plan, ready_manifest, action = self._analysis_ready_context()

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            source_path = workspace / action.inputs[0]
            source_path.parent.mkdir(parents=True)
            source_path.write_bytes(b"trusted analysis source")
            outside_path = workspace / "outside-analysis.json"
            outside_path.write_bytes(b"do not overwrite")
            output_path = workspace / action.outputs[0]
            output_path.parent.mkdir(parents=True)
            output_path.symlink_to(outside_path)
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            result = run_analysis_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T14:09:00Z",
                completed_at="2026-05-10T14:09:05Z",
            )
            output_is_symlink = output_path.is_symlink()
            outside_bytes = outside_path.read_bytes()

        self.assertEqual(result.final_status.state, "retryable")
        self.assertIn("analysis production output", result.final_status.error_message or "")
        self.assertIn("symlink", result.final_status.error_message or "")
        self.assertTrue(output_is_symlink)
        self.assertEqual(outside_bytes, b"do not overwrite")

    def test_analysis_adapter_preserves_existing_different_output_for_review(self) -> None:
        trusted_plan, ready_manifest, action = self._analysis_ready_context()

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            source_path = workspace / action.inputs[0]
            source_path.parent.mkdir(parents=True)
            source_path.write_bytes(b"trusted analysis source")
            output_path = workspace / action.outputs[0]
            output_path.parent.mkdir(parents=True)
            output_path.write_bytes(b"manual analysis")
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            result = run_analysis_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T14:10:00Z",
                completed_at="2026-05-10T14:10:05Z",
            )
            preserved_bytes = output_path.read_bytes()

        self.assertEqual(result.final_status.state, "retryable")
        self.assertIn("analysis production output", result.final_status.error_message or "")
        self.assertIn("Refusing to overwrite", result.final_status.error_message or "")
        self.assertEqual(result.outputs_materialized, ())
        self.assertEqual(preserved_bytes, b"manual analysis")

    def test_scene_adapter_writes_deterministic_grouping_from_trusted_analyses(self) -> None:
        trusted_plan, _ready_manifest, action = self._scene_ready_context()

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            self._write_analysis_payload(
                workspace,
                "analysis/00000.json",
                source_asset_path="originals/A001.MOV",
                media_type="video",
                scene_label="ceremony",
                aesthetic_score=0.8,
                story_score=0.9,
                technical_score=0.7,
                motion_score=0.6,
                duration_seconds=12.0,
                tags=("vows", "wide"),
            )
            self._write_analysis_payload(
                workspace,
                "analysis/00001.json",
                source_asset_path="originals/IMG_0001.CR3",
                media_type="photo",
                scene_label="ceremony",
                aesthetic_score=0.7,
                story_score=0.6,
                technical_score=0.8,
                motion_score=0.5,
                tags=("vows", "portrait"),
            )
            ready_manifest = self._scene_ready_manifest_with_checksums(
                trusted_plan,
                {
                    "analysis/00000.json": self._sha256_file(workspace / "analysis/00000.json"),
                    "analysis/00001.json": self._sha256_file(workspace / "analysis/00001.json"),
                },
            )
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            result = run_scene_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T15:15:00Z",
                completed_at="2026-05-10T15:15:05Z",
            )
            output_payload = json.loads((workspace / action.outputs[0]).read_text(encoding="utf-8"))
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(result.final_status.state, "succeeded")
        self.assertEqual(result.outputs_materialized, ("analysis/scene_groups.json",))
        self.assertEqual(output_payload["adapter"], "shootflow-scene-production-local")
        self.assertEqual(output_payload["analysis_count"], 2)
        self.assertEqual(output_payload["scene_groups"][0]["scene_label"], "ceremony")
        self.assertEqual(output_payload["scene_groups"][0]["asset_count"], 2)
        self.assertEqual(output_payload["scene_groups"][0]["video_count"], 1)
        self.assertEqual(output_payload["scene_groups"][0]["photo_count"], 1)
        self.assertEqual(
            output_payload["scene_groups"][0]["asset_paths"],
            ["graded/grade_asset_00000/A001.MOV", "graded/grade_asset_00001/IMG_0001.CR3"],
        )
        self.assertEqual(output_payload["scene_groups"][0]["primary_tags"], ["portrait", "vows", "wide"])
        self.assertEqual(loaded_manifest.job_statuses[4], result.final_status)

    def test_scene_adapter_missing_analysis_becomes_retryable_after_claim(self) -> None:
        trusted_plan, ready_manifest, action = self._scene_ready_context()

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            result = run_scene_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T15:16:00Z",
                completed_at="2026-05-10T15:16:05Z",
            )
            output_exists = (workspace / action.outputs[0]).exists()
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(result.final_status.state, "retryable")
        self.assertIn("Scene production adapter", result.final_status.error_message or "")
        self.assertIn("Missing scene production dependency output", result.final_status.error_message or "")
        self.assertFalse(output_exists)
        self.assertEqual(loaded_manifest.job_statuses[4], result.final_status)

    def test_scene_adapter_rejects_analysis_checksum_drift(self) -> None:
        trusted_plan, ready_manifest, action = self._scene_ready_context()

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            self._write_analysis_payload(
                workspace,
                "analysis/00000.json",
                source_asset_path="originals/A001.MOV",
                media_type="video",
                scene_label="ceremony",
                aesthetic_score=0.8,
                story_score=0.9,
                technical_score=0.7,
                motion_score=0.6,
                duration_seconds=12.0,
                tags=("vows",),
            )
            self._write_analysis_payload(
                workspace,
                "analysis/00001.json",
                source_asset_path="originals/IMG_0001.CR3",
                media_type="photo",
                scene_label="ceremony",
                aesthetic_score=0.7,
                story_score=0.6,
                technical_score=0.8,
                motion_score=0.5,
                tags=("portrait",),
            )
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            result = run_scene_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T15:18:00Z",
                completed_at="2026-05-10T15:18:05Z",
            )
            output_exists = (workspace / action.outputs[0]).exists()

        self.assertEqual(result.final_status.state, "retryable")
        self.assertIn("Scene production dependency checksum mismatch", result.final_status.error_message or "")
        self.assertFalse(output_exists)

    def test_scene_adapter_rejects_wrong_output_kind_before_claim(self) -> None:
        trusted_plan, ready_manifest, action = self._scene_ready_context()
        malformed_action = ProductionWorkerAction(
            job_id=action.job_id,
            worker_adapter="scene-production-local",
            attempt_number=action.attempt_number,
            output_kind="look_development",
            inputs=action.inputs,
            outputs=action.outputs,
            depends_on=action.depends_on,
            can_run_in_parallel=action.can_run_in_parallel,
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            with self.assertRaisesRegex(ProductionAdapterError, "only materializes scene_grouping"):
                run_scene_production_action(
                    workspace,
                    trusted_plan=trusted_plan,
                    action=malformed_action,
                    started_at="2026-05-10T15:19:00Z",
                    completed_at="2026-05-10T15:19:05Z",
                )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(loaded_manifest, ready_manifest)

    def test_scene_adapter_rejects_malformed_output_before_claim(self) -> None:
        trusted_plan, ready_manifest, action = self._scene_ready_context()
        malformed_action = ProductionWorkerAction(
            job_id=action.job_id,
            worker_adapter="scene-production-local",
            attempt_number=action.attempt_number,
            output_kind=action.output_kind,
            inputs=action.inputs,
            outputs=("analysis/not_scene_groups.json",),
            depends_on=action.depends_on,
            can_run_in_parallel=action.can_run_in_parallel,
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            with self.assertRaisesRegex(ProductionAdapterError, "requires analysis/scene_groups.json output"):
                run_scene_production_action(
                    workspace,
                    trusted_plan=trusted_plan,
                    action=malformed_action,
                    started_at="2026-05-10T15:20:00Z",
                    completed_at="2026-05-10T15:20:05Z",
                )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(loaded_manifest, ready_manifest)

    def test_scene_adapter_rejects_symlinked_output_without_modifying_target(self) -> None:
        trusted_plan, _ready_manifest, action = self._scene_ready_context()

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            ready_manifest = self._write_scene_analyses_with_manifest(trusted_plan, workspace)
            outside_path = workspace / "outside-scene-groups.json"
            outside_path.write_bytes(b"do not overwrite")
            output_path = workspace / action.outputs[0]
            output_path.symlink_to(outside_path)
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            result = run_scene_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T15:21:00Z",
                completed_at="2026-05-10T15:21:05Z",
            )
            output_is_symlink = output_path.is_symlink()
            outside_bytes = outside_path.read_bytes()

        self.assertEqual(result.final_status.state, "retryable")
        self.assertIn("scene production output", result.final_status.error_message or "")
        self.assertIn("symlink", result.final_status.error_message or "")
        self.assertTrue(output_is_symlink)
        self.assertEqual(outside_bytes, b"do not overwrite")

    def test_scene_adapter_preserves_existing_different_output_for_review(self) -> None:
        trusted_plan, _ready_manifest, action = self._scene_ready_context()

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            ready_manifest = self._write_scene_analyses_with_manifest(trusted_plan, workspace)
            output_path = workspace / action.outputs[0]
            output_path.write_bytes(b"manual scene grouping")
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            result = run_scene_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T15:22:00Z",
                completed_at="2026-05-10T15:22:05Z",
            )
            preserved_bytes = output_path.read_bytes()

        self.assertEqual(result.final_status.state, "retryable")
        self.assertIn("scene production output", result.final_status.error_message or "")
        self.assertIn("Refusing to overwrite", result.final_status.error_message or "")
        self.assertEqual(result.outputs_materialized, ())
        self.assertEqual(preserved_bytes, b"manual scene grouping")

    def test_scene_adapter_rejects_unplanned_analysis_file_without_output(self) -> None:
        trusted_plan, _ready_manifest, action = self._scene_ready_context()

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            ready_manifest = self._write_scene_analyses_with_manifest(trusted_plan, workspace)
            self._write_analysis_payload(
                workspace,
                "analysis/99999.json",
                source_asset_path="originals/extra.MOV",
                media_type="video",
                scene_label="extra",
                aesthetic_score=0.5,
                story_score=0.5,
                technical_score=0.5,
                motion_score=0.5,
                duration_seconds=1.0,
                tags=("unplanned",),
            )
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            result = run_scene_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T15:23:00Z",
                completed_at="2026-05-10T15:23:05Z",
            )
            output_exists = (workspace / action.outputs[0]).exists()

        self.assertEqual(result.final_status.state, "retryable")
        self.assertIn("Unplanned per-asset analysis file", result.final_status.error_message or "")
        self.assertFalse(output_exists)

    def test_look_adapter_writes_deterministic_look_from_trusted_scene_groups(self) -> None:
        trusted_plan, _ready_manifest, action = self._look_ready_context()

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            ready_manifest = self._write_scene_groups_with_manifest(trusted_plan, workspace)
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            result = run_look_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T16:05:00Z",
                completed_at="2026-05-10T16:05:05Z",
            )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
            output_payload = json.loads((workspace / action.outputs[0]).read_text(encoding="utf-8"))
            scene_checksum = self._sha256_file(workspace / "analysis/scene_groups.json")

        self.assertEqual(result.final_status.state, "succeeded")
        self.assertEqual(result.outputs_materialized, ("color/shoot_look.json",))
        self.assertEqual(output_payload["adapter"], "shootflow-look-production-local")
        self.assertEqual(output_payload["job_id"], "develop_shoot_look")
        self.assertEqual(output_payload["source_scene_groups"]["sha256"], scene_checksum)
        self.assertEqual(output_payload["source_scene_groups"]["scene_count"], 2)
        self.assertEqual(output_payload["source_scene_groups"]["primary_tags"], ["dance", "portrait", "vows"])
        self.assertEqual(output_payload["look_profile"]["name"], "local-documentary-neutral")
        self.assertEqual(loaded_manifest.job_statuses[5], result.final_status)

    def test_look_adapter_malformed_scene_dependency_becomes_retryable_after_claim(self) -> None:
        scene_job = ProductionJob(
            job_id="group_scene_sets",
            output_kind="scene_grouping",
            inputs=("originals/A001.MOV",),
            outputs=(),
        )
        look_job = ProductionJob(
            job_id="develop_shoot_look",
            output_kind="look_development",
            inputs=("custom-look",),
            outputs=("color/shoot_look.json",),
            depends_on=(scene_job.job_id,),
            can_run_in_parallel=False,
        )
        trusted_plan = ProductionPlan(
            shoot_slug="custom-look",
            jobs=(scene_job, look_job),
            execution_waves=(
                ExecutionWave(wave_index=0, jobs=(scene_job,)),
                ExecutionWave(wave_index=1, jobs=(look_job,)),
            ),
        )
        ready_manifest = ProductionStatusManifest(
            shoot_slug=trusted_plan.shoot_slug,
            production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
            job_statuses=(
                ProductionJobStatus(
                    job_id=scene_job.job_id,
                    state="succeeded",
                    worker_adapter="scene-production-local",
                    attempts=1,
                    output_checksums=(),
                    updated_at="2026-05-10T15:20:00Z",
                ),
                ProductionJobStatus(job_id=look_job.job_id, state="pending"),
            ),
        )
        action = plan_production_worker_actions(
            trusted_plan,
            ready_manifest,
            worker_adapter="look-production-local",
            eligible_output_kinds=("look_development",),
        ).actions[0]

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            result = run_look_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T16:06:00Z",
                completed_at="2026-05-10T16:06:05Z",
            )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
            output_exists = (workspace / action.outputs[0]).exists()

        self.assertEqual(result.final_status.state, "retryable")
        self.assertIn("requires analysis/scene_groups.json", result.final_status.error_message or "")
        self.assertEqual(loaded_manifest.job_statuses[1], result.final_status)
        self.assertFalse(output_exists)

    def test_look_adapter_rejects_malformed_scene_summary_payload(self) -> None:
        trusted_plan, _ready_manifest, action = self._look_ready_context()

        def set_scene_field(field_name: str, value: object):
            def mutate(scene_payload: dict[str, object]) -> None:
                scene_groups = scene_payload["scene_groups"]
                assert isinstance(scene_groups, list)
                first_group = scene_groups[0]
                assert isinstance(first_group, dict)
                first_group[field_name] = value

            return mutate

        def set_bool_scene_count(scene_payload: dict[str, object]) -> None:
            scene_groups = scene_payload["scene_groups"]
            assert isinstance(scene_groups, list)
            scene_payload["scene_groups"] = scene_groups[:1]
            scene_payload["scene_count"] = True
            scene_payload["analysis_count"] = 1

        def set_asset_count_mismatch(scene_payload: dict[str, object]) -> None:
            scene_groups = scene_payload["scene_groups"]
            assert isinstance(scene_groups, list)
            first_group = scene_groups[0]
            assert isinstance(first_group, dict)
            first_group["asset_count"] = 2
            first_group["video_count"] = 2

        cases = (
            (
                "asset_paths_type",
                set_scene_field("asset_paths", "originals/A001.MOV"),
                "asset_paths must be a list",
            ),
            (
                "media_count_mismatch",
                set_scene_field("video_count", 0),
                "scene media counts do not match asset_count",
            ),
            (
                "asset_count_mismatch",
                set_asset_count_mismatch,
                "asset_count does not match asset_paths",
            ),
            (
                "score_range",
                set_scene_field("average_story_score", 1.2),
                "average_story_score must be between 0 and 1",
            ),
            (
                "nan_score",
                set_scene_field("average_story_score", float("nan")),
                "average_story_score must be finite",
            ),
            (
                "primary_tags_content",
                set_scene_field("primary_tags", ["vows", ""]),
                "primary_tags must contain strings",
            ),
            (
                "analysis_count_mismatch",
                lambda scene_payload: scene_payload.__setitem__("analysis_count", 1),
                "analysis_count does not match scene asset counts",
            ),
            (
                "schema_version_bool",
                lambda scene_payload: scene_payload.__setitem__("schema_version", True),
                "requires scene grouping schema_version 1",
            ),
            (
                "scene_count_bool",
                set_bool_scene_count,
                "scene_count does not match scene_groups",
            ),
        )

        for case_name, mutate_payload, expected_message in cases:
            with self.subTest(case_name=case_name), tempfile.TemporaryDirectory() as tmpdir:
                workspace = Path(tmpdir)
                self._write_scene_groups_with_manifest(trusted_plan, workspace)
                scene_path = workspace / "analysis/scene_groups.json"
                scene_payload = json.loads(scene_path.read_text(encoding="utf-8"))
                mutate_payload(scene_payload)
                scene_path.write_text(
                    json.dumps(scene_payload, ensure_ascii=True, indent=2, sort_keys=True) + "\n",
                    encoding="utf-8",
                )
                ready_manifest = self._look_ready_manifest_with_checksum(
                    trusted_plan,
                    scene_checksum=self._sha256_file(scene_path),
                )
                write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

                result = run_look_production_action(
                    workspace,
                    trusted_plan=trusted_plan,
                    action=action,
                    started_at="2026-05-10T16:08:00Z",
                    completed_at="2026-05-10T16:08:05Z",
                )
                loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
                output_exists = (workspace / action.outputs[0]).exists()

                self.assertEqual(result.final_status.state, "retryable")
                self.assertIn(expected_message, result.final_status.error_message or "")
                self.assertEqual(loaded_manifest.job_statuses[5], result.final_status)
                self.assertFalse(output_exists)

    def test_look_adapter_rejects_wrong_output_kind_before_claim(self) -> None:
        trusted_plan, ready_manifest, action = self._look_ready_context()
        malformed_action = ProductionWorkerAction(
            job_id=action.job_id,
            worker_adapter="look-production-local",
            attempt_number=action.attempt_number,
            output_kind="graded_video",
            inputs=action.inputs,
            outputs=action.outputs,
            depends_on=action.depends_on,
            can_run_in_parallel=action.can_run_in_parallel,
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            with self.assertRaisesRegex(ProductionAdapterError, "only materializes look_development"):
                run_look_production_action(
                    workspace,
                    trusted_plan=trusted_plan,
                    action=malformed_action,
                    started_at="2026-05-10T16:09:00Z",
                    completed_at="2026-05-10T16:09:05Z",
                )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(loaded_manifest, ready_manifest)

    def test_look_adapter_rejects_malformed_output_before_claim(self) -> None:
        trusted_plan, ready_manifest, action = self._look_ready_context()
        malformed_action = ProductionWorkerAction(
            job_id=action.job_id,
            worker_adapter="look-production-local",
            attempt_number=action.attempt_number,
            output_kind=action.output_kind,
            inputs=action.inputs,
            outputs=("color/not_shoot_look.json",),
            depends_on=action.depends_on,
            can_run_in_parallel=action.can_run_in_parallel,
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            with self.assertRaisesRegex(ProductionAdapterError, "requires color/shoot_look.json output"):
                run_look_production_action(
                    workspace,
                    trusted_plan=trusted_plan,
                    action=malformed_action,
                    started_at="2026-05-10T16:10:00Z",
                    completed_at="2026-05-10T16:10:05Z",
                )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(loaded_manifest, ready_manifest)

    def test_look_adapter_rejects_scene_checksum_drift(self) -> None:
        trusted_plan, _ready_manifest, action = self._look_ready_context()

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            ready_manifest = self._write_scene_groups_with_manifest(trusted_plan, workspace)
            scene_path = workspace / "analysis/scene_groups.json"
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)
            scene_path.write_text('{"schema_version": 1, "scene_groups": []}\n', encoding="utf-8")

            result = run_look_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T16:11:00Z",
                completed_at="2026-05-10T16:11:05Z",
            )
            output_exists = (workspace / action.outputs[0]).exists()

        self.assertEqual(result.final_status.state, "retryable")
        self.assertIn("Look production dependency checksum mismatch", result.final_status.error_message or "")
        self.assertFalse(output_exists)

    def test_look_adapter_rejects_symlinked_output_without_modifying_target(self) -> None:
        trusted_plan, _ready_manifest, action = self._look_ready_context()

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            ready_manifest = self._write_scene_groups_with_manifest(trusted_plan, workspace)
            outside_path = workspace / "outside-shoot-look.json"
            outside_path.write_bytes(b"do not overwrite")
            output_path = workspace / action.outputs[0]
            output_path.parent.mkdir(parents=True)
            output_path.symlink_to(outside_path)
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            result = run_look_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T16:12:00Z",
                completed_at="2026-05-10T16:12:05Z",
            )
            output_is_symlink = output_path.is_symlink()
            outside_bytes = outside_path.read_bytes()

        self.assertEqual(result.final_status.state, "retryable")
        self.assertIn("look production output", result.final_status.error_message or "")
        self.assertIn("symlink", result.final_status.error_message or "")
        self.assertTrue(output_is_symlink)
        self.assertEqual(outside_bytes, b"do not overwrite")

    def test_look_adapter_preserves_existing_different_output_for_review(self) -> None:
        trusted_plan, _ready_manifest, action = self._look_ready_context()

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            ready_manifest = self._write_scene_groups_with_manifest(trusted_plan, workspace)
            output_path = workspace / action.outputs[0]
            output_path.parent.mkdir(parents=True)
            output_path.write_bytes(b"manual shoot look")
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            result = run_look_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T16:13:00Z",
                completed_at="2026-05-10T16:13:05Z",
            )
            preserved_bytes = output_path.read_bytes()

        self.assertEqual(result.final_status.state, "retryable")
        self.assertIn("look production output", result.final_status.error_message or "")
        self.assertIn("Refusing to overwrite", result.final_status.error_message or "")
        self.assertEqual(result.outputs_materialized, ())
        self.assertEqual(preserved_bytes, b"manual shoot look")

    def test_look_adapter_accepts_custom_scene_dependency_id_from_trusted_plan(self) -> None:
        scene_job = ProductionJob(
            job_id="cluster_reception_scenes",
            output_kind="scene_grouping",
            inputs=("originals/A001.MOV",),
            outputs=("analysis/scene_groups.json",),
            can_run_in_parallel=False,
        )
        look_job = ProductionJob(
            job_id="develop_shoot_look",
            output_kind="look_development",
            inputs=("custom-look",),
            outputs=("color/shoot_look.json",),
            depends_on=(scene_job.job_id,),
            can_run_in_parallel=False,
        )
        trusted_plan = ProductionPlan(
            shoot_slug="custom-look",
            jobs=(scene_job, look_job),
            execution_waves=(
                ExecutionWave(wave_index=0, jobs=(scene_job,)),
                ExecutionWave(wave_index=1, jobs=(look_job,)),
            ),
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            scene_path = workspace / scene_job.outputs[0]
            scene_path.parent.mkdir(parents=True)
            scene_path.write_text(
                json.dumps(
                    {
                        "schema_version": 1,
                        "adapter": "shootflow-scene-production-local",
                        "job_id": scene_job.job_id,
                        "output_kind": "scene_grouping",
                        "inputs": ["originals/A001.MOV"],
                        "outputs": ["analysis/scene_groups.json"],
                        "selected_output": "analysis/scene_groups.json",
                        "depends_on": [],
                        "can_run_in_parallel": False,
                        "analysis_count": 1,
                        "scene_count": 1,
                        "scene_groups": [
                            {
                                "scene_label": "reception",
                                "asset_count": 1,
                                "video_count": 1,
                                "photo_count": 0,
                                "asset_paths": ["originals/A001.MOV"],
                                "primary_tags": ["dance"],
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
            ready_manifest = ProductionStatusManifest(
                shoot_slug=trusted_plan.shoot_slug,
                production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
                job_statuses=(
                    ProductionJobStatus(
                        job_id=scene_job.job_id,
                        state="succeeded",
                        worker_adapter="scene-production-local",
                        attempts=1,
                        output_checksums=(
                            OutputChecksum(path=scene_job.outputs[0], sha256=self._sha256_file(scene_path)),
                        ),
                        updated_at="2026-05-10T15:20:00Z",
                    ),
                    ProductionJobStatus(job_id=look_job.job_id, state="pending"),
                ),
            )
            action = plan_production_worker_actions(
                trusted_plan,
                ready_manifest,
                worker_adapter="look-production-local",
                eligible_output_kinds=("look_development",),
            ).actions[0]
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            result = run_look_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T16:07:00Z",
                completed_at="2026-05-10T16:07:05Z",
            )
            output_payload = json.loads((workspace / action.outputs[0]).read_text(encoding="utf-8"))

        self.assertEqual(result.final_status.state, "succeeded")
        self.assertEqual(output_payload["source_scene_groups"]["scene_labels"], ["reception"])

    def test_grade_adapter_writes_deterministic_grade_from_trusted_dependencies(self) -> None:
        trusted_plan, _ready_manifest, action = self._grade_ready_context()

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            ready_manifest = self._write_grade_dependencies_with_manifest(trusted_plan, workspace)
            source_path = workspace / action.inputs[0]
            source_path.parent.mkdir(parents=True, exist_ok=True)
            source_path.write_bytes(b"trusted camera original")
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            result = run_grade_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T17:35:00Z",
                completed_at="2026-05-10T17:35:05Z",
            )
            output_payload = json.loads((workspace / action.outputs[0]).read_text(encoding="utf-8"))
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(result.final_status.state, "succeeded")
        self.assertEqual(result.outputs_materialized, ("graded/grade_asset_00000/A001.MOV",))
        self.assertEqual(output_payload["adapter"], "shootflow-grade-production-local")
        self.assertEqual(output_payload["job_id"], "grade_asset_00000")
        self.assertEqual(output_payload["output_kind"], "graded_video")
        self.assertEqual(output_payload["source_asset"]["path"], "originals/A001.MOV")
        self.assertEqual(output_payload["source_analysis"]["path"], "analysis/00000.json")
        self.assertEqual(output_payload["source_look"]["path"], "color/shoot_look.json")
        self.assertEqual(output_payload["grade_profile"]["name"], "local-look-application-proof")
        self.assertEqual(loaded_manifest.job_statuses[6], result.final_status)

    def test_grade_adapter_marks_missing_source_retryable_without_output(self) -> None:
        trusted_plan, _ready_manifest, action = self._grade_ready_context()

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            ready_manifest = self._write_grade_dependencies_with_manifest(trusted_plan, workspace)
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            result = run_grade_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T17:36:00Z",
                completed_at="2026-05-10T17:36:05Z",
            )
            output_exists = (workspace / action.outputs[0]).exists()
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(result.final_status.state, "retryable")
        self.assertIn("Grade production adapter", result.final_status.error_message or "")
        self.assertIn("Missing grade production source input", result.final_status.error_message or "")
        self.assertFalse(output_exists)
        self.assertEqual(loaded_manifest.job_statuses[6], result.final_status)

    def test_grade_adapter_marks_malformed_analysis_dependency_retryable(self) -> None:
        trusted_plan, _ready_manifest, action = self._grade_ready_context()

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            self._write_grade_dependencies_with_manifest(trusted_plan, workspace)
            source_path = workspace / action.inputs[0]
            source_path.parent.mkdir(parents=True, exist_ok=True)
            source_path.write_bytes(b"trusted camera original")
            analysis_path = workspace / "analysis/00000.json"
            analysis_payload = json.loads(analysis_path.read_text(encoding="utf-8"))
            analysis_payload["schema_version"] = 2
            analysis_path.write_text(
                json.dumps(analysis_payload, ensure_ascii=True, indent=2, sort_keys=True) + "\n",
                encoding="utf-8",
            )
            ready_manifest = self._grade_ready_manifest_with_checksums(
                trusted_plan,
                analysis_checksum=self._sha256_file(analysis_path),
                look_checksum=self._sha256_file(workspace / "color/shoot_look.json"),
            )
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            result = run_grade_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T17:37:00Z",
                completed_at="2026-05-10T17:37:05Z",
            )
            output_exists = (workspace / action.outputs[0]).exists()
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(result.final_status.state, "retryable")
        self.assertIn("Grade production requires analysis schema_version 1", result.final_status.error_message or "")
        self.assertFalse(output_exists)
        self.assertEqual(loaded_manifest.job_statuses[6], result.final_status)

    def test_grade_adapter_marks_malformed_look_dependency_retryable(self) -> None:
        trusted_plan, _ready_manifest, action = self._grade_ready_context()

        def set_look_profile_field(field_name: str, value: object):
            def mutate(look_payload: dict[str, object]) -> None:
                look_profile = look_payload["look_profile"]
                assert isinstance(look_profile, dict)
                look_profile[field_name] = value

            return mutate

        cases = (
            (
                "source_scene_groups_type",
                lambda look_payload: look_payload.__setitem__("source_scene_groups", "analysis/scene_groups.json"),
                "Grade production source_scene_groups must be an object",
            ),
            (
                "source_scene_groups_bool_count",
                lambda look_payload: look_payload.__setitem__(
                    "source_scene_groups",
                    {
                        "path": "analysis/scene_groups.json",
                        "sha256": "a" * 64,
                        "analysis_count": True,
                        "scene_count": 2,
                        "scene_labels": ["ceremony", "portraits"],
                        "primary_tags": ["dance", "portrait", "vows"],
                    },
                ),
                "Grade production source_scene_groups analysis_count must be a non-negative integer",
            ),
            (
                "source_scene_groups_signed_sha256",
                lambda look_payload: look_payload.__setitem__(
                    "source_scene_groups",
                    {
                        "path": "analysis/scene_groups.json",
                        "sha256": "+" + ("a" * 63),
                        "analysis_count": 2,
                        "scene_count": 2,
                        "scene_labels": ["ceremony", "portraits"],
                        "primary_tags": ["dance", "portrait", "vows"],
                    },
                ),
                "Grade production source_scene_groups sha256 must be a SHA-256 hex digest",
            ),
            (
                "look_profile_empty_tone_curve",
                set_look_profile_field("tone_curve", ""),
                "Grade production look_profile tone_curve cannot be empty",
            ),
            (
                "look_profile_nan_warmth",
                set_look_profile_field("warmth", float("nan")),
                "Grade production look_profile warmth must be finite",
            ),
        )

        for case_name, mutate_payload, expected_message in cases:
            with self.subTest(case_name=case_name), tempfile.TemporaryDirectory() as tmpdir:
                workspace = Path(tmpdir)
                self._write_grade_dependencies_with_manifest(trusted_plan, workspace)
                source_path = workspace / action.inputs[0]
                source_path.parent.mkdir(parents=True, exist_ok=True)
                source_path.write_bytes(b"trusted camera original")
                look_path = workspace / "color/shoot_look.json"
                look_payload = json.loads(look_path.read_text(encoding="utf-8"))
                mutate_payload(look_payload)
                look_path.write_text(
                    json.dumps(look_payload, ensure_ascii=True, indent=2, sort_keys=True) + "\n",
                    encoding="utf-8",
                )
                ready_manifest = self._grade_ready_manifest_with_checksums(
                    trusted_plan,
                    analysis_checksum=self._sha256_file(workspace / "analysis/00000.json"),
                    look_checksum=self._sha256_file(look_path),
                )
                write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

                result = run_grade_production_action(
                    workspace,
                    trusted_plan=trusted_plan,
                    action=action,
                    started_at="2026-05-10T18:31:00Z",
                    completed_at="2026-05-10T18:31:05Z",
                )
                output_exists = (workspace / action.outputs[0]).exists()
                loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

                self.assertEqual(result.final_status.state, "retryable")
                self.assertIn(expected_message, result.final_status.error_message or "")
                self.assertFalse(output_exists)
                self.assertEqual(loaded_manifest.job_statuses[6], result.final_status)

    def test_story_adapter_writes_deterministic_storylines_from_trusted_grade_outputs(self) -> None:
        trusted_plan, _ready_manifest, action = self._story_ready_context()

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            ready_manifest = self._write_story_dependencies_with_manifest(trusted_plan, workspace)
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            result = run_story_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T19:10:00Z",
                completed_at="2026-05-10T19:10:05Z",
            )
            output_payload = json.loads((workspace / action.outputs[0]).read_text(encoding="utf-8"))
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(result.final_status.state, "succeeded")
        self.assertEqual(result.outputs_materialized, ("analysis/instagram_storylines.json",))
        self.assertEqual(output_payload["schema_version"], 2)
        self.assertEqual(
            output_payload["sequences"][0]["asset_paths"],
            ["graded/grade_asset_00000/A001.MOV"],
        )
        self.assertEqual(
            output_payload["sequences"][1]["asset_paths"],
            ["graded/grade_asset_00001/IMG_0001.CR3"],
        )
        self.assertEqual(loaded_manifest.job_statuses[8], result.final_status)

    def test_story_adapter_marks_missing_grade_dependency_retryable_without_output(self) -> None:
        trusted_plan, _ready_manifest, action = self._story_ready_context()

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            ready_manifest = self._write_story_dependencies_with_manifest(trusted_plan, workspace)
            missing_grade_path = workspace / "graded/grade_asset_00000/A001.MOV"
            missing_grade_path.unlink()
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            result = run_story_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T19:11:00Z",
                completed_at="2026-05-10T19:11:05Z",
            )
            output_exists = (workspace / action.outputs[0]).exists()
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(result.final_status.state, "retryable")
        self.assertIn("Missing story production dependency output", result.final_status.error_message or "")
        self.assertFalse(output_exists)
        self.assertEqual(loaded_manifest.job_statuses[8], result.final_status)

    def test_package_adapter_writes_deterministic_reel_from_trusted_story_and_grades(self) -> None:
        trusted_plan, _ready_manifest, action = self._package_ready_context("assemble_instagram_reel")

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            ready_manifest = self._write_package_dependencies_with_manifest(trusted_plan, workspace)
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            result = run_package_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T20:10:00Z",
                completed_at="2026-05-10T20:10:05Z",
            )
            output_payload = json.loads((workspace / action.outputs[0]).read_text(encoding="utf-8"))
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(result.final_status.state, "succeeded")
        self.assertEqual(result.outputs_materialized, ("deliverables/instagram_reel.mp4",))
        self.assertEqual(output_payload["adapter"], "shootflow-package-production-local")
        self.assertEqual(output_payload["job_id"], "assemble_instagram_reel")
        self.assertEqual(output_payload["output_kind"], "instagram_reel")
        self.assertEqual(
            [input_summary["path"] for input_summary in output_payload["verified_inputs"]],
            ["analysis/instagram_storylines.json", "graded/grade_asset_00000/A001.MOV"],
        )
        self.assertEqual(loaded_manifest.job_statuses[9], result.final_status)

    def test_package_adapter_materializes_directory_package_with_directory_checksum(self) -> None:
        trusted_plan, _ready_manifest, action = self._package_ready_context("assemble_instagram_carousel")

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            ready_manifest = self._write_package_dependencies_with_manifest(trusted_plan, workspace)
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            result = run_package_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T20:11:00Z",
                completed_at="2026-05-10T20:11:05Z",
            )
            package_dir = workspace / action.outputs[0]
            package_manifest = package_dir / "package_manifest.json"
            output_payload = json.loads(package_manifest.read_text(encoding="utf-8"))
            package_dir_is_dir = package_dir.is_dir()
            package_manifest_is_file = package_manifest.is_file()
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(result.final_status.state, "succeeded")
        self.assertTrue(package_dir_is_dir)
        self.assertTrue(package_manifest_is_file)
        self.assertEqual(result.outputs_materialized, ("deliverables/instagram_carousel/",))
        self.assertEqual(result.final_status.output_checksums[0].path, "deliverables/instagram_carousel/")
        self.assertEqual(output_payload["selected_output"], "deliverables/instagram_carousel/")
        self.assertEqual(output_payload["output_kind"], "instagram_carousel")
        self.assertEqual(loaded_manifest.job_statuses[10], result.final_status)

    def test_package_adapter_rejects_existing_directory_with_unplanned_extra_file(self) -> None:
        trusted_plan, _ready_manifest, action = self._package_ready_context("assemble_instagram_carousel")

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            ready_manifest = self._write_package_dependencies_with_manifest(trusted_plan, workspace)
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)
            first_result = run_package_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T20:11:10Z",
                completed_at="2026-05-10T20:11:15Z",
            )
            extra_path = workspace / action.outputs[0] / "extra.bin"
            extra_path.write_bytes(b"unplanned package bytes")
            nested_extra_path = workspace / action.outputs[0] / "nested/extra.txt"
            nested_extra_path.parent.mkdir()
            nested_extra_path.write_bytes(b"nested unplanned package bytes")
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            result = run_package_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T20:11:20Z",
                completed_at="2026-05-10T20:11:25Z",
            )
            extra_bytes = extra_path.read_bytes()
            nested_extra_bytes = nested_extra_path.read_bytes()
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(first_result.final_status.state, "succeeded")
        self.assertEqual(result.final_status.state, "retryable")
        self.assertIn("unexpected package production directory entry", result.final_status.error_message or "")
        self.assertIn("extra.bin", result.final_status.error_message or "")
        self.assertIn("nested/extra.txt", result.final_status.error_message or "")
        self.assertEqual(extra_bytes, b"unplanned package bytes")
        self.assertEqual(nested_extra_bytes, b"nested unplanned package bytes")
        self.assertEqual(loaded_manifest.job_statuses[10], result.final_status)

    def test_package_adapter_marks_missing_story_dependency_retryable_without_output(self) -> None:
        trusted_plan, _ready_manifest, action = self._package_ready_context("assemble_instagram_reel")

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            ready_manifest = self._write_package_dependencies_with_manifest(trusted_plan, workspace)
            (workspace / "analysis/instagram_storylines.json").unlink()
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            result = run_package_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T20:12:00Z",
                completed_at="2026-05-10T20:12:05Z",
            )
            output_exists = (workspace / action.outputs[0]).exists()
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(result.final_status.state, "retryable")
        self.assertIn("Missing package production dependency output", result.final_status.error_message or "")
        self.assertFalse(output_exists)
        self.assertEqual(loaded_manifest.job_statuses[9], result.final_status)

    def test_metadata_adapter_malformed_input_becomes_retryable_after_claim(self) -> None:
        job = ProductionJob(
            job_id="metadata_bad_input",
            output_kind="proxy_media",
            inputs=("originals/bad\x00.MOV",),
            outputs=("proxies/metadata_bad_input.json",),
        )
        trusted_plan = ProductionPlan(
            shoot_slug="metadata-bad-input",
            jobs=(job,),
            execution_waves=(ExecutionWave(wave_index=0, jobs=(job,)),),
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
                started_at="2026-05-10T10:08:00Z",
                completed_at="2026-05-10T10:08:05Z",
            )
            output_exists = (workspace / action.outputs[0]).exists()
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(result.final_status.state, "retryable")
        self.assertIn("Unsafe metadata production input path", result.final_status.error_message or "")
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
        self.assertIn("metadata production output", result.final_status.error_message or "")
        self.assertIn("Refusing to overwrite", result.final_status.error_message or "")
        self.assertEqual(result.outputs_materialized, ())
        self.assertEqual(preserved_bytes, b"manual metadata")

    def test_proxy_adapter_copies_real_input_to_declared_proxy_output(self) -> None:
        trusted_plan = self._trusted_plan()
        initial_manifest = self._pending_manifest(trusted_plan)
        action = plan_production_worker_actions(
            trusted_plan,
            initial_manifest,
            worker_adapter="proxy-production-local",
        ).actions[0]

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            source_path = workspace / action.inputs[0]
            source_path.parent.mkdir(parents=True)
            source_path.write_bytes(b"trusted source media bytes")
            write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_proxy_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T11:40:00Z",
                completed_at="2026-05-10T11:40:05Z",
            )
            output_bytes = (workspace / action.outputs[0]).read_bytes()
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(output_bytes, b"trusted source media bytes")
        self.assertEqual(result.final_status.state, "succeeded")
        self.assertEqual(result.outputs_materialized, action.outputs)
        self.assertEqual(result.final_status.output_checksums[0].path, action.outputs[0])
        self.assertEqual(loaded_manifest.job_statuses[0], result.final_status)

    def test_proxy_adapter_marks_missing_input_retryable_without_output(self) -> None:
        trusted_plan = self._trusted_plan()
        initial_manifest = self._pending_manifest(trusted_plan)
        action = plan_production_worker_actions(
            trusted_plan,
            initial_manifest,
            worker_adapter="proxy-production-local",
        ).actions[0]

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_proxy_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T11:41:00Z",
                completed_at="2026-05-10T11:41:05Z",
            )
            output_exists = (workspace / action.outputs[0]).exists()
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(result.final_status.state, "retryable")
        self.assertIn("Missing proxy production input", result.final_status.error_message or "")
        self.assertFalse(output_exists)
        self.assertEqual(loaded_manifest.job_statuses[0], result.final_status)

    def test_proxy_adapter_preserves_existing_different_output_for_review(self) -> None:
        trusted_plan = self._trusted_plan()
        initial_manifest = self._pending_manifest(trusted_plan)
        action = plan_production_worker_actions(
            trusted_plan,
            initial_manifest,
            worker_adapter="proxy-production-local",
        ).actions[0]

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            source_path = workspace / action.inputs[0]
            source_path.parent.mkdir(parents=True)
            source_path.write_bytes(b"trusted source media bytes")
            output_path = workspace / action.outputs[0]
            output_path.parent.mkdir(parents=True)
            output_path.write_bytes(b"manual proxy")
            write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_proxy_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T11:42:00Z",
                completed_at="2026-05-10T11:42:05Z",
            )
            preserved_bytes = output_path.read_bytes()

        self.assertEqual(result.final_status.state, "retryable")
        self.assertIn("proxy production output", result.final_status.error_message or "")
        self.assertIn("Refusing to overwrite", result.final_status.error_message or "")
        self.assertEqual(result.outputs_materialized, ())
        self.assertEqual(preserved_bytes, b"manual proxy")

    def test_proxy_adapter_rejects_symlinked_input_without_output(self) -> None:
        trusted_plan = self._trusted_plan()
        initial_manifest = self._pending_manifest(trusted_plan)
        action = plan_production_worker_actions(
            trusted_plan,
            initial_manifest,
            worker_adapter="proxy-production-local",
        ).actions[0]

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            outside_path = workspace / "outside.MOV"
            outside_path.write_bytes(b"outside camera bytes")
            source_path = workspace / action.inputs[0]
            source_path.parent.mkdir(parents=True)
            source_path.symlink_to(outside_path)
            write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_proxy_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T12:06:00Z",
                completed_at="2026-05-10T12:06:05Z",
            )
            output_exists = (workspace / action.outputs[0]).exists()
            outside_bytes = outside_path.read_bytes()

        self.assertEqual(result.final_status.state, "retryable")
        self.assertIn("proxy production input", result.final_status.error_message or "")
        self.assertIn("symlink", result.final_status.error_message or "")
        self.assertFalse(output_exists)
        self.assertEqual(outside_bytes, b"outside camera bytes")

    def test_proxy_adapter_rejects_symlinked_output_without_modifying_target(self) -> None:
        trusted_plan = self._trusted_plan()
        initial_manifest = self._pending_manifest(trusted_plan)
        action = plan_production_worker_actions(
            trusted_plan,
            initial_manifest,
            worker_adapter="proxy-production-local",
        ).actions[0]

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            source_path = workspace / action.inputs[0]
            source_path.parent.mkdir(parents=True)
            source_path.write_bytes(b"trusted source media bytes")
            outside_path = workspace / "outside-proxy.mov"
            outside_path.write_bytes(b"do not overwrite")
            output_path = workspace / action.outputs[0]
            output_path.parent.mkdir(parents=True)
            output_path.symlink_to(outside_path)
            write_production_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            result = run_proxy_production_action(
                workspace,
                trusted_plan=trusted_plan,
                action=action,
                started_at="2026-05-10T12:07:00Z",
                completed_at="2026-05-10T12:07:05Z",
            )
            output_is_symlink = output_path.is_symlink()
            outside_bytes = outside_path.read_bytes()

        self.assertEqual(result.final_status.state, "retryable")
        self.assertIn("proxy production output", result.final_status.error_message or "")
        self.assertIn("symlink", result.final_status.error_message or "")
        self.assertTrue(output_is_symlink)
        self.assertEqual(outside_bytes, b"do not overwrite")

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

        self.assertIsInstance(result, ProductionAdapterBatchResult)
        self.assertEqual(result.worker_adapter, "metadata-production-local")
        self.assertEqual(tuple(action.job_id for action in action_plan.actions), ("proxy_asset_00000", "proxy_asset_00001"))
        self.assertEqual(tuple(action_result.final_status.state for action_result in result.results), ("succeeded", "succeeded"))
        self.assertEqual(tuple(status.state for status in loaded_manifest.job_statuses[:2]), ("succeeded", "succeeded"))

    def test_story_adapter_batch_runs_ready_action_through_same_contract(self) -> None:
        trusted_plan, _ready_manifest, _action = self._story_ready_context()

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            ready_manifest = self._write_story_dependencies_with_manifest(trusted_plan, workspace)
            action_plan = plan_production_worker_actions(
                trusted_plan,
                ready_manifest,
                worker_adapter="story-production-local",
                eligible_output_kinds=("storyline_selection",),
            )
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            result = run_production_adapter_batch(
                workspace,
                trusted_plan=trusted_plan,
                action_plan=action_plan,
                started_at="2026-05-10T19:12:00Z",
                completed_at="2026-05-10T19:12:05Z",
                max_concurrency=1,
            )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertIsInstance(result, ProductionAdapterBatchResult)
        self.assertEqual(result.worker_adapter, "story-production-local")
        self.assertEqual(tuple(action.job_id for action in action_plan.actions), ("rank_instagram_storylines",))
        self.assertEqual(tuple(action_result.final_status.state for action_result in result.results), ("succeeded",))
        self.assertEqual(loaded_manifest.job_statuses[8], result.results[0].final_status)

    def test_package_adapter_batch_runs_ready_actions_through_same_contract(self) -> None:
        trusted_plan, _ready_manifest, _action = self._package_ready_context("assemble_instagram_reel")

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            ready_manifest = self._write_package_dependencies_with_manifest(trusted_plan, workspace)
            action_plan = plan_production_worker_actions(
                trusted_plan,
                ready_manifest,
                worker_adapter="package-production-local",
                eligible_output_kinds=("instagram_reel", "instagram_carousel", "instagram_photo_set"),
            )
            write_production_status_manifest(ready_manifest, workspace, trusted_plan=trusted_plan)

            result = run_production_adapter_batch(
                workspace,
                trusted_plan=trusted_plan,
                action_plan=action_plan,
                started_at="2026-05-10T20:13:00Z",
                completed_at="2026-05-10T20:13:05Z",
                max_concurrency=1,
            )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertIsInstance(result, ProductionAdapterBatchResult)
        self.assertEqual(result.worker_adapter, "package-production-local")
        self.assertEqual(
            tuple(action.job_id for action in action_plan.actions),
            ("assemble_instagram_reel", "assemble_instagram_carousel", "export_instagram_photo_set"),
        )
        self.assertEqual(
            tuple(action_result.final_status.state for action_result in result.results),
            ("succeeded", "succeeded", "succeeded"),
        )
        self.assertEqual(
            tuple(status.state for status in loaded_manifest.job_statuses[9:]),
            ("succeeded", "succeeded", "succeeded"),
        )

    def test_adapter_batch_rejects_invalid_action_plan_before_dispatch(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            with self.assertRaisesRegex(ProductionAdapterError, "action_plan"):
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

    @classmethod
    def _analysis_ready_context(cls):
        trusted_plan = build_production_plan(
            [MediaAsset(path="originals/A001.MOV", media_type="video", duration_seconds=12.0)],
            shoot_slug="analysis-adapter",
        )
        ready_manifest = ProductionStatusManifest(
            shoot_slug=trusted_plan.shoot_slug,
            production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
            job_statuses=(
                cls._succeeded_status(trusted_plan.job_by_id("proxy_asset_00000")),
            )
            + tuple(
                ProductionJobStatus(job_id=job.job_id, state="pending")
                for job in trusted_plan.jobs[1:]
            ),
        )
        action = plan_production_worker_actions(
            trusted_plan,
            ready_manifest,
            worker_adapter="analysis-production-local",
            eligible_output_kinds=("vlm_asset_analysis",),
        ).actions[0]
        return trusted_plan, ready_manifest, action

    @classmethod
    def _scene_ready_context(cls):
        trusted_plan = cls._trusted_plan()
        ready_manifest = ProductionStatusManifest(
            shoot_slug=trusted_plan.shoot_slug,
            production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
            job_statuses=tuple(
                cls._succeeded_status(job)
                if job.output_kind in {"proxy_media", "vlm_asset_analysis"}
                else ProductionJobStatus(job_id=job.job_id, state="pending")
                for job in trusted_plan.jobs
            ),
        )
        action = plan_production_worker_actions(
            trusted_plan,
            ready_manifest,
            worker_adapter="scene-production-local",
            eligible_output_kinds=("scene_grouping",),
        ).actions[0]
        return trusted_plan, ready_manifest, action

    @classmethod
    def _look_ready_context(cls):
        trusted_plan = cls._trusted_plan()
        ready_manifest = cls._look_ready_manifest_with_checksum(
            trusted_plan,
            scene_checksum="a" * 64,
        )
        action = plan_production_worker_actions(
            trusted_plan,
            ready_manifest,
            worker_adapter="look-production-local",
            eligible_output_kinds=("look_development",),
        ).actions[0]
        return trusted_plan, ready_manifest, action

    @classmethod
    def _grade_ready_context(cls):
        trusted_plan = cls._trusted_plan()
        ready_manifest = cls._grade_ready_manifest_with_checksums(
            trusted_plan,
            analysis_checksum="b" * 64,
            look_checksum="c" * 64,
        )
        action = plan_production_worker_actions(
            trusted_plan,
            ready_manifest,
            worker_adapter="grade-production-local",
            eligible_output_kinds=("graded_photo", "graded_video"),
        ).actions[0]
        return trusted_plan, ready_manifest, action

    @classmethod
    def _story_ready_context(cls):
        trusted_plan = cls._trusted_plan()
        ready_manifest = cls._story_ready_manifest_with_checksums(
            trusted_plan,
            analysis_checksums={
                "analysis/00000.json": "b" * 64,
                "analysis/00001.json": "b" * 64,
            },
            scene_checksum="c" * 64,
            look_checksum="d" * 64,
            grade_checksums={
                "graded/grade_asset_00000/A001.MOV": "e" * 64,
                "graded/grade_asset_00001/IMG_0001.CR3": "f" * 64,
            },
        )
        action = plan_production_worker_actions(
            trusted_plan,
            ready_manifest,
            worker_adapter="story-production-local",
            eligible_output_kinds=("storyline_selection",),
        ).actions[0]
        return trusted_plan, ready_manifest, action

    @classmethod
    def _package_ready_context(cls, job_id: str):
        trusted_plan = cls._trusted_plan()
        ready_manifest = cls._package_ready_manifest_with_checksums(
            trusted_plan,
            story_checksum="a" * 64,
            grade_checksums={
                "graded/grade_asset_00000/A001.MOV": "b" * 64,
                "graded/grade_asset_00001/IMG_0001.CR3": "c" * 64,
            },
        )
        action = next(
            action
            for action in plan_production_worker_actions(
                trusted_plan,
                ready_manifest,
                worker_adapter="package-production-local",
                eligible_output_kinds=("instagram_reel", "instagram_carousel", "instagram_photo_set"),
            ).actions
            if action.job_id == job_id
        )
        return trusted_plan, ready_manifest, action

    @classmethod
    def _write_scene_analyses_with_manifest(
        cls,
        trusted_plan,
        workspace: Path,
    ) -> ProductionStatusManifest:
        cls._write_analysis_payload(
            workspace,
            "analysis/00000.json",
            source_asset_path="originals/A001.MOV",
            media_type="video",
            scene_label="ceremony",
            aesthetic_score=0.8,
            story_score=0.9,
            technical_score=0.7,
            motion_score=0.6,
            duration_seconds=12.0,
            tags=("vows",),
        )
        cls._write_analysis_payload(
            workspace,
            "analysis/00001.json",
            source_asset_path="originals/IMG_0001.CR3",
            media_type="photo",
            scene_label="ceremony",
            aesthetic_score=0.7,
            story_score=0.6,
            technical_score=0.8,
            motion_score=0.5,
            tags=("portrait",),
        )
        return cls._scene_ready_manifest_with_checksums(
            trusted_plan,
            {
                "analysis/00000.json": cls._sha256_file(workspace / "analysis/00000.json"),
                "analysis/00001.json": cls._sha256_file(workspace / "analysis/00001.json"),
            },
        )

    @classmethod
    def _write_scene_groups_with_manifest(
        cls,
        trusted_plan,
        workspace: Path,
    ) -> ProductionStatusManifest:
        scene_path = workspace / "analysis/scene_groups.json"
        scene_path.parent.mkdir(parents=True, exist_ok=True)
        scene_path.write_text(
            json.dumps(
                {
                    "schema_version": 1,
                    "adapter": "shootflow-scene-production-local",
                    "job_id": "group_scene_sets",
                    "output_kind": "scene_grouping",
                    "inputs": ["originals/A001.MOV", "originals/IMG_0001.CR3"],
                    "outputs": ["analysis/scene_groups.json"],
                    "selected_output": "analysis/scene_groups.json",
                    "depends_on": ["analyze_asset_00000", "analyze_asset_00001"],
                    "can_run_in_parallel": False,
                    "analysis_count": 2,
                    "scene_count": 2,
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
                        {
                            "scene_label": "portraits",
                            "asset_count": 1,
                            "video_count": 0,
                            "photo_count": 1,
                            "asset_paths": ["originals/IMG_0001.CR3"],
                            "primary_tags": ["dance", "portrait"],
                            "average_aesthetic_score": 0.7,
                            "average_story_score": 0.6,
                            "average_technical_score": 0.8,
                            "average_motion_score": 0.5,
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
        return cls._look_ready_manifest_with_checksum(
            trusted_plan,
            scene_checksum=cls._sha256_file(scene_path),
        )

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
                    "inputs": ["production-adapter"],
                    "outputs": ["color/shoot_look.json"],
                    "selected_output": "color/shoot_look.json",
                    "depends_on": ["group_scene_sets"],
                    "can_run_in_parallel": False,
                    "source_scene_groups": {
                        "path": "analysis/scene_groups.json",
                        "sha256": "a" * 64,
                        "analysis_count": 2,
                        "scene_count": 2,
                        "scene_labels": ["ceremony", "portraits"],
                        "primary_tags": ["dance", "portrait", "vows"],
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
        return cls._grade_ready_manifest_with_checksums(
            trusted_plan,
            analysis_checksum=cls._sha256_file(analysis_path),
            look_checksum=cls._sha256_file(look_path),
        )

    @classmethod
    def _write_story_dependencies_with_manifest(
        cls,
        trusted_plan,
        workspace: Path,
    ) -> ProductionStatusManifest:
        cls._write_analysis_payload(
            workspace,
            "analysis/00000.json",
            source_asset_path="originals/A001.MOV",
            media_type="video",
            scene_label="ceremony",
            aesthetic_score=0.8,
            story_score=0.9,
            technical_score=0.7,
            motion_score=0.6,
            duration_seconds=12.0,
            tags=("vows",),
        )
        cls._write_analysis_payload(
            workspace,
            "analysis/00001.json",
            source_asset_path="originals/IMG_0001.CR3",
            media_type="photo",
            scene_label="portraits",
            aesthetic_score=0.7,
            story_score=0.6,
            technical_score=0.8,
            motion_score=0.5,
            tags=("portrait",),
        )
        scene_path = workspace / "analysis/scene_groups.json"
        scene_path.parent.mkdir(parents=True, exist_ok=True)
        scene_path.write_bytes(b'{"schema_version":1,"adapter":"shootflow-scene-production-local"}\n')
        look_path = workspace / "color/shoot_look.json"
        look_path.parent.mkdir(parents=True, exist_ok=True)
        look_path.write_bytes(b'{"schema_version":1,"adapter":"shootflow-look-production-local"}\n')
        video_grade_path = workspace / "graded/grade_asset_00000/A001.MOV"
        video_grade_path.parent.mkdir(parents=True, exist_ok=True)
        video_grade_path.write_bytes(b"trusted graded video")
        photo_grade_path = workspace / "graded/grade_asset_00001/IMG_0001.CR3"
        photo_grade_path.parent.mkdir(parents=True, exist_ok=True)
        photo_grade_path.write_bytes(b"trusted graded photo")
        return cls._story_ready_manifest_with_checksums(
            trusted_plan,
            analysis_checksums={
                "analysis/00000.json": cls._sha256_file(workspace / "analysis/00000.json"),
                "analysis/00001.json": cls._sha256_file(workspace / "analysis/00001.json"),
            },
            scene_checksum=cls._sha256_file(scene_path),
            look_checksum=cls._sha256_file(look_path),
            grade_checksums={
                "graded/grade_asset_00000/A001.MOV": cls._sha256_file(video_grade_path),
                "graded/grade_asset_00001/IMG_0001.CR3": cls._sha256_file(photo_grade_path),
            },
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
                        {
                            "sequence_id": "carousel_main",
                            "deliverable_type": "instagram_carousel",
                            "asset_paths": ["graded/grade_asset_00001/IMG_0001.CR3"],
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
        video_grade_path = workspace / "graded/grade_asset_00000/A001.MOV"
        video_grade_path.parent.mkdir(parents=True, exist_ok=True)
        video_grade_path.write_bytes(b"trusted package graded video")
        photo_grade_path = workspace / "graded/grade_asset_00001/IMG_0001.CR3"
        photo_grade_path.parent.mkdir(parents=True, exist_ok=True)
        photo_grade_path.write_bytes(b"trusted package graded photo")
        return cls._package_ready_manifest_with_checksums(
            trusted_plan,
            story_checksum=cls._sha256_file(story_path),
            grade_checksums={
                "graded/grade_asset_00000/A001.MOV": cls._sha256_file(video_grade_path),
                "graded/grade_asset_00001/IMG_0001.CR3": cls._sha256_file(photo_grade_path),
            },
        )

    @staticmethod
    def _look_ready_manifest_with_checksum(
        trusted_plan,
        *,
        scene_checksum: str,
    ) -> ProductionStatusManifest:
        return ProductionStatusManifest(
            shoot_slug=trusted_plan.shoot_slug,
            production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
            job_statuses=tuple(
                ProductionJobStatus(
                    job_id=job.job_id,
                    state="succeeded",
                    worker_adapter="scene-production-local",
                    attempts=1,
                    output_checksums=(
                        OutputChecksum(path=job.outputs[0], sha256=scene_checksum),
                    ),
                    updated_at="2026-05-10T15:20:00Z",
                )
                if job.output_kind == "scene_grouping"
                else ProductionJobStatus(
                    job_id=job.job_id,
                    state="succeeded",
                    worker_adapter="analysis-production-local",
                    attempts=1,
                    output_checksums=tuple(
                        OutputChecksum(path=output, sha256="b" * 64)
                        for output in job.outputs
                    ),
                    updated_at="2026-05-10T15:10:00Z",
                )
                if job.output_kind == "vlm_asset_analysis"
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

    @staticmethod
    def _grade_ready_manifest_with_checksums(
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

    @staticmethod
    def _story_ready_manifest_with_checksums(
        trusted_plan,
        *,
        analysis_checksums: dict[str, str],
        scene_checksum: str,
        look_checksum: str,
        grade_checksums: dict[str, str],
    ) -> ProductionStatusManifest:
        return ProductionStatusManifest(
            shoot_slug=trusted_plan.shoot_slug,
            production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
            job_statuses=tuple(
                ProductionJobStatus(
                    job_id=job.job_id,
                    state="succeeded",
                    worker_adapter="grade-production-local",
                    attempts=1,
                    output_checksums=tuple(
                        OutputChecksum(path=output, sha256=grade_checksums[output])
                        for output in job.outputs
                    ),
                    updated_at="2026-05-10T17:35:00Z",
                )
                if job.output_kind in {"graded_photo", "graded_video"}
                else ProductionJobStatus(
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
                    worker_adapter="scene-production-local",
                    attempts=1,
                    output_checksums=(
                        OutputChecksum(path=job.outputs[0], sha256=scene_checksum),
                    ),
                    updated_at="2026-05-10T15:20:00Z",
                )
                if job.output_kind == "scene_grouping"
                else ProductionJobStatus(
                    job_id=job.job_id,
                    state="succeeded",
                    worker_adapter="analysis-production-local",
                    attempts=1,
                    output_checksums=tuple(
                        OutputChecksum(path=output, sha256=analysis_checksums[output])
                        for output in job.outputs
                    ),
                    updated_at="2026-05-10T15:10:00Z",
                )
                if job.output_kind == "vlm_asset_analysis"
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

    @staticmethod
    def _package_ready_manifest_with_checksums(
        trusted_plan,
        *,
        story_checksum: str,
        grade_checksums: dict[str, str],
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
                    output_checksums=(
                        OutputChecksum(path=job.outputs[0], sha256=story_checksum),
                    ),
                    updated_at="2026-05-10T19:10:00Z",
                )
                if job.output_kind == "storyline_selection"
                else ProductionJobStatus(
                    job_id=job.job_id,
                    state="succeeded",
                    worker_adapter="grade-production-local",
                    attempts=1,
                    output_checksums=tuple(
                        OutputChecksum(path=output, sha256=grade_checksums[output])
                        for output in job.outputs
                    ),
                    updated_at="2026-05-10T17:35:00Z",
                )
                if job.output_kind in {"graded_photo", "graded_video"}
                else ProductionJobStatus(
                    job_id=job.job_id,
                    state="succeeded",
                    worker_adapter="look-production-local",
                    attempts=1,
                    output_checksums=tuple(
                        OutputChecksum(path=output, sha256="d" * 64)
                        for output in job.outputs
                    ),
                    updated_at="2026-05-10T16:05:00Z",
                )
                if job.output_kind == "look_development"
                else ProductionJobStatus(
                    job_id=job.job_id,
                    state="succeeded",
                    worker_adapter="scene-production-local",
                    attempts=1,
                    output_checksums=tuple(
                        OutputChecksum(path=output, sha256="e" * 64)
                        for output in job.outputs
                    ),
                    updated_at="2026-05-10T15:20:00Z",
                )
                if job.output_kind == "scene_grouping"
                else ProductionJobStatus(
                    job_id=job.job_id,
                    state="succeeded",
                    worker_adapter="analysis-production-local",
                    attempts=1,
                    output_checksums=tuple(
                        OutputChecksum(path=output, sha256="f" * 64)
                        for output in job.outputs
                    ),
                    updated_at="2026-05-10T15:10:00Z",
                )
                if job.output_kind == "vlm_asset_analysis"
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

    @staticmethod
    def _scene_ready_manifest_with_checksums(
        trusted_plan,
        analysis_checksums: dict[str, str],
    ) -> ProductionStatusManifest:
        return ProductionStatusManifest(
            shoot_slug=trusted_plan.shoot_slug,
            production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
            job_statuses=tuple(
                ProductionJobStatus(
                    job_id=job.job_id,
                    state="succeeded",
                    worker_adapter="analysis-production-local",
                    attempts=1,
                    output_checksums=(
                        OutputChecksum(path=job.outputs[0], sha256=analysis_checksums[job.outputs[0]]),
                    ),
                    updated_at="2026-05-10T15:10:00Z",
                )
                if job.output_kind == "vlm_asset_analysis"
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

    @staticmethod
    def _write_analysis_payload(
        workspace: Path,
        output: str,
        *,
        source_asset_path: str,
        media_type: str,
        scene_label: str,
        aesthetic_score: float,
        story_score: float,
        technical_score: float,
        motion_score: float,
        duration_seconds: float | None = None,
        tags: tuple[str, ...] = (),
    ) -> None:
        payload: dict[str, object] = {
            "schema_version": 1,
            "source_asset_path": source_asset_path,
            "media_type": media_type,
            "scene_label": scene_label,
            "aesthetic_score": aesthetic_score,
            "story_score": story_score,
            "technical_score": technical_score,
            "motion_score": motion_score,
            "tags": tags,
        }
        if duration_seconds is not None:
            payload["duration_seconds"] = duration_seconds
        output_path = workspace / output
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(payload, ensure_ascii=True, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

    @staticmethod
    def _sha256_file(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as input_file:
            for chunk in iter(lambda: input_file.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()


if __name__ == "__main__":
    unittest.main()
