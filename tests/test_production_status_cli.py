import io
import json
import os
import tempfile
import unittest
from pathlib import Path

from shootflow.catalog import load_ingest_manifest, production_assets_from_manifest
from shootflow.cli import main
from shootflow.production import build_production_plan
from shootflow.production_scheduler import PRODUCTION_SCHEDULER_REPORT_PATH
from shootflow.production_status import (
    OutputChecksum,
    ProductionJobStatus,
    ProductionStatusManifest,
    load_production_status_manifest,
    production_plan_fingerprint,
    write_production_status_manifest,
)
from shootflow.workflow_authority import observe_only_workflow_authority_to_dict


class ShootFlowProductionStatusCliTests(unittest.TestCase):
    def test_dry_run_production_scheduler_command_advances_persisted_status(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            card = root / "card"
            destination = root / "library"
            clip = card / "DCIM" / "A001.MOV"
            clip.parent.mkdir(parents=True)
            clip.write_bytes(b"video-bytes")
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
                    "production-scheduler",
                    "--confirm",
                ],
                stdout=io.StringIO(),
            )
            shoot_folder = destination / "2026-05-09_production-scheduler"
            manifest_path = shoot_folder / "ingest_manifest.json"
            production_plan = self._production_plan(manifest_path)
            init_exit_code = main(
                [
                    "init-production-status",
                    "--ingest-manifest",
                    str(manifest_path),
                ],
                stdout=io.StringIO(),
            )
            stdout = io.StringIO()

            exit_code = main(
                [
                    "dry-run-production-scheduler",
                    "--ingest-manifest",
                    str(manifest_path),
                    "--worker",
                    "dry-run-production-local",
                    "--started-at",
                    "2026-05-09T16:40:00Z",
                    "--completed-at",
                    "2026-05-09T16:40:05Z",
                    "--generated-at",
                    "2026-05-09T16:40:06Z",
                    "--max-concurrency",
                    "2",
                    "--max-iterations",
                    "10",
                ],
                stdout=stdout,
            )
            status_manifest = load_production_status_manifest(shoot_folder, trusted_plan=production_plan)
            reel_output_exists = (shoot_folder / "deliverables" / "instagram_reel.mp4").exists()
            report_exists = (shoot_folder / PRODUCTION_SCHEDULER_REPORT_PATH).exists()

        payload = json.loads(stdout.getvalue())
        self.assertEqual(init_exit_code, 0)
        self.assertEqual(exit_code, 0)
        self.assertEqual(payload["schema_version"], 1)
        self.assertEqual(payload["workspace"], str(shoot_folder))
        self.assertEqual(payload["ingest_manifest_path"], str(manifest_path))
        self.assertEqual(
            payload["report_path"],
            str(shoot_folder / PRODUCTION_SCHEDULER_REPORT_PATH),
        )
        self.assertEqual(payload["shoot_slug"], "production-scheduler")
        self.assertEqual(payload["stopped_reason"], "complete")
        self.assertEqual(payload["retryable_job_ids"], [])
        self.assertEqual(payload["review_required_job_ids"], [])
        self.assertEqual(payload["completed_job_ids"], [job.job_id for job in production_plan.jobs])
        self.assertEqual(payload["product_metrics"]["completed_job_count"], len(production_plan.jobs))
        self.assertEqual(payload["product_metrics"]["review_required_job_count"], 0)
        self.assertEqual([status.state for status in status_manifest.job_statuses], ["succeeded"] * 7)
        self.assertTrue(reel_output_exists)
        self.assertTrue(report_exists)

    def test_dry_run_production_scheduler_command_can_print_persisted_report(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            card = root / "card"
            destination = root / "library"
            clip = card / "DCIM" / "A001.MOV"
            clip.parent.mkdir(parents=True)
            clip.write_bytes(b"video-bytes")
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
                    "production-report",
                    "--confirm",
                ],
                stdout=io.StringIO(),
            )
            shoot_folder = destination / "2026-05-09_production-report"
            manifest_path = shoot_folder / "ingest_manifest.json"
            production_plan = self._production_plan(manifest_path)
            main(
                [
                    "init-production-status",
                    "--ingest-manifest",
                    str(manifest_path),
                ],
                stdout=io.StringIO(),
            )
            stdout = io.StringIO()

            exit_code = main(
                [
                    "dry-run-production-scheduler",
                    "--ingest-manifest",
                    str(manifest_path),
                    "--worker",
                    "dry-run-production-local",
                    "--started-at",
                    "2026-05-09T17:02:00Z",
                    "--completed-at",
                    "2026-05-09T17:02:05Z",
                    "--generated-at",
                    "2026-05-09T17:02:06Z",
                    "--max-concurrency",
                    "2",
                    "--max-iterations",
                    "10",
                    "--print-report",
                ],
                stdout=stdout,
            )

        payload = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertEqual(payload["schema_version"], 3)
        self.assertEqual(payload["workflow_authority"], observe_only_workflow_authority_to_dict())
        self.assertEqual(payload["generated_at"], "2026-05-09T17:02:06Z")
        self.assertEqual(payload["shoot_slug"], "production-report")
        self.assertRegex(payload["production_plan_fingerprint"], r"^[0-9a-f]{64}$")
        self.assertRegex(payload["production_status_fingerprint"], r"^[0-9a-f]{64}$")
        self.assertEqual(payload["stopped_reason"], "complete")
        self.assertEqual(payload["review_required_job_ids"], [])
        self.assertEqual(payload["completed_job_ids"], [job.job_id for job in production_plan.jobs])
        self.assertEqual(payload["product_metrics"]["completed_job_count"], len(production_plan.jobs))
        self.assertEqual(payload["product_metrics"]["review_required_job_count"], 0)

    def test_dry_run_production_scheduler_command_accepts_metadata_adapter(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            card = root / "card"
            destination = root / "library"
            clip = card / "DCIM" / "A001.MOV"
            clip.parent.mkdir(parents=True)
            clip.write_bytes(b"video-bytes")
            main(
                [
                    "execute-ingest",
                    "--source",
                    str(card),
                    "--destination",
                    str(destination),
                    "--shoot-date",
                    "2026-05-10",
                    "--shoot-slug",
                    "metadata-scheduler",
                    "--confirm",
                ],
                stdout=io.StringIO(),
            )
            shoot_folder = destination / "2026-05-10_metadata-scheduler"
            manifest_path = shoot_folder / "ingest_manifest.json"
            production_plan = self._production_plan(manifest_path)
            main(
                [
                    "init-production-status",
                    "--ingest-manifest",
                    str(manifest_path),
                ],
                stdout=io.StringIO(),
            )
            stdout = io.StringIO()

            exit_code = main(
                [
                    "dry-run-production-scheduler",
                    "--ingest-manifest",
                    str(manifest_path),
                    "--worker",
                    "metadata-production-local",
                    "--started-at",
                    "2026-05-10T10:10:00Z",
                    "--completed-at",
                    "2026-05-10T10:10:05Z",
                    "--generated-at",
                    "2026-05-10T10:10:06Z",
                    "--max-concurrency",
                    "2",
                    "--max-iterations",
                    "10",
                ],
                stdout=stdout,
            )
            status_manifest = load_production_status_manifest(shoot_folder, trusted_plan=production_plan)
            proxy_payload = json.loads((shoot_folder / production_plan.jobs[0].outputs[0]).read_text(encoding="utf-8"))

        payload = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertEqual(payload["stopped_reason"], "retryable")
        self.assertEqual(payload["completed_job_ids"], [job.job_id for job in production_plan.jobs[:3]])
        self.assertIn("develop_shoot_look", payload["review_required_job_ids"])
        self.assertEqual(status_manifest.job_statuses[0].state, "succeeded")
        self.assertEqual(status_manifest.job_statuses[3].state, "retryable")
        self.assertEqual(proxy_payload["adapter"], "shootflow-metadata-production")
        self.assertEqual(proxy_payload["input_metadata"][0]["path"], production_plan.jobs[0].inputs[0])

    def test_metadata_scheduler_accepts_relative_ingest_manifest_paths(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            card = root / "card"
            clip = card / "DCIM" / "A001.MOV"
            clip.parent.mkdir(parents=True)
            clip.write_bytes(b"video-bytes")
            previous_cwd = Path.cwd()
            try:
                os.chdir(root)
                main(
                    [
                        "execute-ingest",
                        "--source",
                        "card",
                        "--destination",
                        "library",
                        "--shoot-date",
                        "2026-05-10",
                        "--shoot-slug",
                        "relative-metadata",
                        "--confirm",
                    ],
                    stdout=io.StringIO(),
                )
                shoot_folder = (root / "library" / "2026-05-10_relative-metadata").resolve()
                manifest_path = shoot_folder / "ingest_manifest.json"
                production_plan = self._production_plan(manifest_path)
                main(
                    [
                        "init-production-status",
                        "--ingest-manifest",
                        str(manifest_path),
                    ],
                    stdout=io.StringIO(),
                )
                stdout = io.StringIO()

                exit_code = main(
                    [
                        "dry-run-production-scheduler",
                        "--ingest-manifest",
                        str(manifest_path),
                        "--worker",
                        "metadata-production-local",
                        "--started-at",
                        "2026-05-10T10:12:00Z",
                        "--completed-at",
                        "2026-05-10T10:12:05Z",
                        "--generated-at",
                        "2026-05-10T10:12:06Z",
                        "--max-concurrency",
                        "1",
                        "--max-iterations",
                        "1",
                    ],
                    stdout=stdout,
                )
                status_manifest = load_production_status_manifest(shoot_folder, trusted_plan=production_plan)
                proxy_payload = json.loads((shoot_folder / production_plan.jobs[0].outputs[0]).read_text(encoding="utf-8"))
            finally:
                os.chdir(previous_cwd)

        self.assertEqual(exit_code, 0)
        self.assertEqual(status_manifest.job_statuses[0].state, "succeeded")
        self.assertEqual(proxy_payload["adapter"], "shootflow-metadata-production")
        self.assertEqual(proxy_payload["input_metadata"][0]["path"], production_plan.jobs[0].inputs[0])

    def test_dry_run_production_scheduler_command_expires_stale_running_job(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            card = root / "card"
            destination = root / "library"
            clip = card / "DCIM" / "A001.MOV"
            clip.parent.mkdir(parents=True)
            clip.write_bytes(b"video-bytes")
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
                    "production-lease",
                    "--confirm",
                ],
                stdout=io.StringIO(),
            )
            shoot_folder = destination / "2026-05-09_production-lease"
            manifest_path = shoot_folder / "ingest_manifest.json"
            production_plan = self._production_plan(manifest_path)
            write_production_status_manifest(
                ProductionStatusManifest(
                    shoot_slug=production_plan.shoot_slug,
                    production_plan_fingerprint=production_plan_fingerprint(production_plan),
                    job_statuses=(
                        ProductionJobStatus(
                            job_id="proxy_asset_00000",
                            state="running",
                            worker_adapter="dry-run-production-local",
                            attempts=1,
                            updated_at="2026-05-09T17:10:00Z",
                        ),
                    )
                    + tuple(
                        ProductionJobStatus(job_id=job.job_id, state="pending")
                        for job in production_plan.jobs[1:]
                    ),
                ),
                shoot_folder,
                trusted_plan=production_plan,
            )
            stdout = io.StringIO()

            exit_code = main(
                [
                    "dry-run-production-scheduler",
                    "--ingest-manifest",
                    str(manifest_path),
                    "--worker",
                    "dry-run-production-local",
                    "--started-at",
                    "2026-05-09T17:30:00Z",
                    "--completed-at",
                    "2026-05-09T17:30:05Z",
                    "--generated-at",
                    "2026-05-09T17:30:06Z",
                    "--max-concurrency",
                    "1",
                    "--max-iterations",
                    "5",
                    "--stale-before",
                    "2026-05-09T17:20:00Z",
                    "--lease-updated-at",
                    "2026-05-09T17:29:00Z",
                ],
                stdout=stdout,
            )
            status_manifest = load_production_status_manifest(shoot_folder, trusted_plan=production_plan)

        payload = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertEqual(payload["stopped_reason"], "retryable")
        self.assertEqual(payload["expired_lease_job_ids"], ["proxy_asset_00000"])
        self.assertEqual(payload["conflicted_lease_job_ids"], [])
        self.assertIn("proxy_asset_00000", payload["review_required_job_ids"])
        self.assertEqual(payload["skipped_retryable_job_ids"], ["proxy_asset_00000"])
        self.assertIn("lease expired", payload["failure_messages"][0]["message"])
        self.assertEqual(status_manifest.job_statuses[0].state, "retryable")
        self.assertIn("lease expired", status_manifest.job_statuses[0].error_message or "")

    def test_dry_run_production_scheduler_requires_complete_stale_lease_arguments(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            card = root / "card"
            destination = root / "library"
            clip = card / "DCIM" / "A001.MOV"
            clip.parent.mkdir(parents=True)
            clip.write_bytes(b"video-bytes")
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
                    "production-lease-args",
                    "--confirm",
                ],
                stdout=io.StringIO(),
            )
            shoot_folder = destination / "2026-05-09_production-lease-args"
            manifest_path = shoot_folder / "ingest_manifest.json"
            production_plan = self._production_plan(manifest_path)
            initial_manifest = ProductionStatusManifest(
                shoot_slug=production_plan.shoot_slug,
                production_plan_fingerprint=production_plan_fingerprint(production_plan),
                job_statuses=tuple(
                    ProductionJobStatus(job_id=job.job_id, state="pending")
                    for job in production_plan.jobs
                ),
            )

            for extra_args, expected_error in (
                (("--stale-before", "2026-05-09T17:20:00Z"), "lease_updated_at"),
                (("--lease-updated-at", "2026-05-09T17:29:00Z"), "requires stale_before"),
            ):
                write_production_status_manifest(initial_manifest, shoot_folder, trusted_plan=production_plan)
                stdout = io.StringIO()
                stderr = io.StringIO()

                exit_code = main(
                    [
                        "dry-run-production-scheduler",
                        "--ingest-manifest",
                        str(manifest_path),
                        "--worker",
                        "dry-run-production-local",
                        "--started-at",
                        "2026-05-09T17:30:00Z",
                        "--completed-at",
                        "2026-05-09T17:30:05Z",
                        "--generated-at",
                        "2026-05-09T17:30:06Z",
                        "--max-concurrency",
                        "1",
                        "--max-iterations",
                        "5",
                        *extra_args,
                    ],
                    stdout=stdout,
                    stderr=stderr,
                )
                loaded_manifest = load_production_status_manifest(shoot_folder, trusted_plan=production_plan)

                self.assertEqual(exit_code, 1)
                self.assertEqual(stdout.getvalue(), "")
                self.assertIn(expected_error, stderr.getvalue())
                self.assertEqual(loaded_manifest, initial_manifest)

    def test_init_production_status_command_creates_manifest_without_downstream_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            card = root / "card"
            destination = root / "library"
            clip = card / "DCIM" / "A001.MOV"
            photo = card / "DCIM" / "IMG_0001.CR3"
            clip.parent.mkdir(parents=True)
            clip.write_bytes(b"video-bytes")
            photo.write_bytes(b"photo-bytes")
            ingest_stdout = io.StringIO()
            ingest_exit_code = main(
                [
                    "execute-ingest",
                    "--source",
                    str(card),
                    "--destination",
                    str(destination),
                    "--shoot-date",
                    "2026-05-09",
                    "--shoot-slug",
                    "production-status",
                    "--confirm",
                ],
                stdout=ingest_stdout,
            )
            shoot_folder = destination / "2026-05-09_production-status"
            manifest_path = shoot_folder / "ingest_manifest.json"
            stdout = io.StringIO()

            exit_code = main(
                [
                    "init-production-status",
                    "--ingest-manifest",
                    str(manifest_path),
                ],
                stdout=stdout,
            )

            payload = json.loads(stdout.getvalue())
            self.assertEqual(ingest_exit_code, 0)
            self.assertEqual(exit_code, 0)
            self.assertTrue(payload["created"])
            self.assertEqual(payload["status_path"], str(shoot_folder / "production_status.json"))
            self.assertEqual(payload["shoot_slug"], "production-status")
            self.assertEqual(payload["job_count"], 12)
            self.assertEqual(payload["pending_job_count"], 12)
            self.assertEqual(payload["running_job_count"], 0)
            self.assertEqual(payload["succeeded_job_count"], 0)
            self.assertEqual(payload["failed_job_count"], 0)
            self.assertEqual(payload["retryable_job_count"], 0)
            self.assertRegex(payload["production_plan_fingerprint"], r"^[0-9a-f]{64}$")
            self.assertTrue((shoot_folder / "production_status.json").exists())
            self.assertFalse((shoot_folder / "analysis").exists())
            self.assertFalse((shoot_folder / "graded").exists())
            self.assertFalse((shoot_folder / "deliverables").exists())

    def test_init_production_status_command_rejects_deleted_source_manifest_without_writes(self) -> None:
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
                    "production-status-reject",
                    "--confirm",
                ],
                stdout=ingest_stdout,
            )
            shoot_folder = destination / "2026-05-09_production-status-reject"
            manifest_path = shoot_folder / "ingest_manifest.json"
            manifest_data = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest_data["source_deleted"] = True
            manifest_path.write_text(json.dumps(manifest_data), encoding="utf-8")
            stdout = io.StringIO()
            stderr = io.StringIO()

            exit_code = main(
                [
                    "init-production-status",
                    "--ingest-manifest",
                    str(manifest_path),
                ],
                stdout=stdout,
                stderr=stderr,
            )

            self.assertEqual(exit_code, 1)
            self.assertEqual(stdout.getvalue(), "")
            self.assertIn("source media was deleted", stderr.getvalue())
            self.assertFalse((shoot_folder / "production_status.json").exists())

    def test_next_production_wave_can_read_succeeded_jobs_from_production_status(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            card = root / "card"
            destination = root / "library"
            clip = card / "DCIM" / "A001.MOV"
            photo = card / "DCIM" / "IMG_0001.CR3"
            clip.parent.mkdir(parents=True)
            clip.write_bytes(b"video-bytes")
            photo.write_bytes(b"photo-bytes")
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
                    "status-wave",
                    "--confirm",
                ],
                stdout=io.StringIO(),
            )
            shoot_folder = destination / "2026-05-09_status-wave"
            manifest_path = shoot_folder / "ingest_manifest.json"
            production_plan = self._production_plan(manifest_path)
            write_production_status_manifest(
                ProductionStatusManifest(
                    shoot_slug=production_plan.shoot_slug,
                    production_plan_fingerprint=production_plan_fingerprint(production_plan),
                    job_statuses=tuple(
                        self._succeeded_status(job)
                        if job.job_id in {"proxy_asset_00000", "proxy_asset_00001"}
                        else ProductionJobStatus(job_id=job.job_id, state="pending")
                        for job in production_plan.jobs
                    ),
                ),
                shoot_folder,
                trusted_plan=production_plan,
            )
            stdout = io.StringIO()

            exit_code = main(
                [
                    "next-production-wave",
                    "--ingest-manifest",
                    str(manifest_path),
                    "--use-production-status",
                ],
                stdout=stdout,
            )

        payload = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertEqual(payload["status_source"], "production_status")
        self.assertEqual(payload["wave_index"], 1)
        self.assertEqual(payload["completed_job_ids"], ["proxy_asset_00000", "proxy_asset_00001"])
        self.assertEqual(
            [job["job_id"] for job in payload["jobs"]],
            ["analyze_asset_00000", "analyze_asset_00001"],
        )

    def test_next_production_wave_surfaces_retryable_status_jobs_for_review(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            card = root / "card"
            destination = root / "library"
            clip = card / "DCIM" / "A001.MOV"
            photo = card / "DCIM" / "IMG_0001.CR3"
            clip.parent.mkdir(parents=True)
            clip.write_bytes(b"video-bytes")
            photo.write_bytes(b"photo-bytes")
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
                    "retryable-status-wave",
                    "--confirm",
                ],
                stdout=io.StringIO(),
            )
            shoot_folder = destination / "2026-05-09_retryable-status-wave"
            manifest_path = shoot_folder / "ingest_manifest.json"
            production_plan = self._production_plan(manifest_path)
            write_production_status_manifest(
                ProductionStatusManifest(
                    shoot_slug=production_plan.shoot_slug,
                    production_plan_fingerprint=production_plan_fingerprint(production_plan),
                    job_statuses=tuple(
                        ProductionJobStatus(
                            job_id=job.job_id,
                            state="retryable",
                            worker_adapter="dry-run-production-local",
                            attempts=1,
                            error_message=(
                                "production lease expired; no source, analysis, graded, render, "
                                "or deliverable files were deleted or cleaned up."
                            ),
                            updated_at="2026-05-09T18:31:00Z",
                        )
                        if job.job_id == "proxy_asset_00000"
                        else ProductionJobStatus(job_id=job.job_id, state="pending")
                        for job in production_plan.jobs
                    ),
                ),
                shoot_folder,
                trusted_plan=production_plan,
            )
            stdout = io.StringIO()

            exit_code = main(
                [
                    "next-production-wave",
                    "--ingest-manifest",
                    str(manifest_path),
                    "--use-production-status",
                ],
                stdout=stdout,
            )

        payload = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertEqual(payload["status_source"], "production_status")
        self.assertEqual(payload["wave_index"], 0)
        self.assertEqual(
            [job["job_id"] for job in payload["jobs"]],
            ["proxy_asset_00001"],
        )
        self.assertEqual(payload["review_required_job_ids"], ["proxy_asset_00000"])

    def test_next_production_wave_rejects_mixed_status_and_completed_job_modes(self) -> None:
        stdout = io.StringIO()
        stderr = io.StringIO()

        exit_code = main(
            [
                "next-production-wave",
                "--ingest-manifest",
                "/tmp/missing-ingest-manifest.json",
                "--use-production-status",
                "--completed-job",
                "proxy_asset_00000",
            ],
            stdout=stdout,
            stderr=stderr,
        )

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout.getvalue(), "")
        self.assertIn("cannot be combined", stderr.getvalue())

    @staticmethod
    def _production_plan(manifest_path: Path):
        catalog = load_ingest_manifest(manifest_path)
        return build_production_plan(
            production_assets_from_manifest(catalog),
            shoot_slug=catalog.shoot_slug,
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
            updated_at="2026-05-09T15:06:00Z",
        )


if __name__ == "__main__":
    unittest.main()
