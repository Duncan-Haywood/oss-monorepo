import tempfile
import unittest
from pathlib import Path

from shootflow.catalog import load_ingest_manifest, production_assets_from_manifest
from shootflow.ingest import execute_copy_plan, plan_import
from shootflow.production import build_production_plan
from shootflow.production_handoff import (
    ProductionHandoffError,
    plan_next_production_wave,
    plan_next_production_wave_from_status,
)
from shootflow.production_status import (
    OutputChecksum,
    ProductionJobStatus,
    ProductionStatusManifest,
    production_plan_fingerprint,
    write_production_status_manifest,
)


class ProductionHandoffTests(unittest.TestCase):
    def test_returns_first_proxy_wave_without_writing_downstream_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            manifest_path = self._ingest_fixture(Path(tmp), shoot_slug="desert-editorial")
            shoot_folder = manifest_path.parent

            handoff = plan_next_production_wave(manifest_path, completed_job_ids=())
            downstream_dirs_exist = (
                (shoot_folder / "analysis").exists(),
                (shoot_folder / "graded").exists(),
                (shoot_folder / "deliverables").exists(),
            )

        self.assertEqual(handoff.status, "ready")
        self.assertEqual(handoff.wave_index, 0)
        self.assertEqual(handoff.completed_job_ids, ())
        self.assertEqual([job.job_id for job in handoff.jobs], ["proxy_asset_00000", "proxy_asset_00001"])
        self.assertEqual([job.output_kind for job in handoff.jobs], ["proxy_media", "proxy_media"])
        self.assertTrue(all(job.can_run_in_parallel for job in handoff.jobs))
        self.assertIn("read-only production wave handoff", handoff.notes)
        self.assertEqual(downstream_dirs_exist, (False, False, False))

    def test_advances_to_analysis_wave_after_proxy_jobs_complete(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            manifest_path = self._ingest_fixture(Path(tmp), shoot_slug="wedding-preview")

            handoff = plan_next_production_wave(
                manifest_path,
                completed_job_ids=("proxy_asset_00001", "proxy_asset_00000"),
            )

        self.assertEqual(handoff.status, "ready")
        self.assertEqual(handoff.wave_index, 1)
        self.assertEqual(handoff.completed_job_ids, ("proxy_asset_00000", "proxy_asset_00001"))
        self.assertEqual([job.job_id for job in handoff.jobs], ["analyze_asset_00000", "analyze_asset_00001"])
        self.assertEqual(handoff.blocked_dependency_ids, ())

    def test_reads_completed_jobs_from_production_status_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            manifest_path = self._ingest_fixture(Path(tmp), shoot_slug="status-backed")
            production_plan = self._production_plan(manifest_path)
            succeeded_proxy_statuses = {
                "proxy_asset_00000": self._succeeded_status(
                    production_plan.job_by_id("proxy_asset_00000"),
                ),
                "proxy_asset_00001": self._succeeded_status(
                    production_plan.job_by_id("proxy_asset_00001"),
                ),
            }
            write_production_status_manifest(
                ProductionStatusManifest(
                    shoot_slug=production_plan.shoot_slug,
                    production_plan_fingerprint=production_plan_fingerprint(production_plan),
                    job_statuses=self._statuses_with(production_plan, succeeded_proxy_statuses),
                ),
                manifest_path.parent,
                trusted_plan=production_plan,
            )

            handoff = plan_next_production_wave_from_status(manifest_path)

        self.assertEqual(handoff.status_source, "production_status")
        self.assertEqual(handoff.status, "ready")
        self.assertEqual(handoff.wave_index, 1)
        self.assertEqual(handoff.completed_job_ids, ("proxy_asset_00000", "proxy_asset_00001"))
        self.assertEqual([job.job_id for job in handoff.jobs], ["analyze_asset_00000", "analyze_asset_00001"])

    def test_status_backed_wave_does_not_reschedule_running_jobs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            manifest_path = self._ingest_fixture(Path(tmp), shoot_slug="running-status")
            production_plan = self._production_plan(manifest_path)
            running_status = ProductionJobStatus(
                job_id="proxy_asset_00001",
                state="running",
                worker_adapter="production-local",
                attempts=1,
                updated_at="2026-05-09T15:07:00Z",
            )
            write_production_status_manifest(
                ProductionStatusManifest(
                    shoot_slug=production_plan.shoot_slug,
                    production_plan_fingerprint=production_plan_fingerprint(production_plan),
                    job_statuses=self._statuses_with(
                        production_plan,
                        {
                            "proxy_asset_00000": self._succeeded_status(
                                production_plan.job_by_id("proxy_asset_00000"),
                            ),
                            "proxy_asset_00001": running_status,
                        },
                    ),
                ),
                manifest_path.parent,
                trusted_plan=production_plan,
            )

            handoff = plan_next_production_wave_from_status(manifest_path)

        self.assertEqual(handoff.status, "blocked")
        self.assertEqual(handoff.wave_index, 0)
        self.assertEqual(handoff.jobs, ())
        self.assertEqual(handoff.active_job_ids, ("proxy_asset_00001",))
        self.assertEqual(handoff.review_required_job_ids, ())

    def test_status_backed_wave_surfaces_failed_jobs_outside_ready_wave(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            manifest_path = self._ingest_fixture(Path(tmp), shoot_slug="failed-status")
            production_plan = self._production_plan(manifest_path)
            failed_status = ProductionJobStatus(
                job_id="analyze_asset_00000",
                state="failed",
                worker_adapter="vlm-local",
                attempts=1,
                error_message="analysis output failed validation; no files were deleted",
                updated_at="2026-05-09T15:08:00Z",
            )
            write_production_status_manifest(
                ProductionStatusManifest(
                    shoot_slug=production_plan.shoot_slug,
                    production_plan_fingerprint=production_plan_fingerprint(production_plan),
                    job_statuses=self._statuses_with(
                        production_plan,
                        {
                            "proxy_asset_00000": self._succeeded_status(
                                production_plan.job_by_id("proxy_asset_00000"),
                            ),
                            "analyze_asset_00000": failed_status,
                        },
                    ),
                ),
                manifest_path.parent,
                trusted_plan=production_plan,
            )

            handoff = plan_next_production_wave_from_status(manifest_path)

        self.assertEqual(handoff.status, "ready")
        self.assertEqual(handoff.wave_index, 0)
        self.assertEqual([job.job_id for job in handoff.jobs], ["proxy_asset_00001"])
        self.assertEqual(handoff.review_required_job_ids, ("analyze_asset_00000",))

    def test_returns_complete_when_all_manifest_backed_jobs_are_complete(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            manifest_path = self._ingest_fixture(Path(tmp), shoot_slug="complete-shoot")
            first_handoff = plan_next_production_wave(manifest_path, completed_job_ids=())
            all_job_ids = tuple(job.job_id for job in first_handoff.production_plan.jobs)

            handoff = plan_next_production_wave(manifest_path, completed_job_ids=all_job_ids)

        self.assertEqual(handoff.status, "complete")
        self.assertIsNone(handoff.wave_index)
        self.assertEqual(handoff.jobs, ())
        self.assertEqual(handoff.blocked_dependency_ids, ())

    def test_rejects_unknown_duplicate_and_dependency_skipping_completed_jobs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            manifest_path = self._ingest_fixture(Path(tmp), shoot_slug="bad-completions")

            with self.assertRaisesRegex(ProductionHandoffError, "Unknown production job"):
                plan_next_production_wave(manifest_path, completed_job_ids=("missing-job",))

            with self.assertRaisesRegex(ProductionHandoffError, "Duplicate completed production job"):
                plan_next_production_wave(
                    manifest_path,
                    completed_job_ids=("proxy_asset_00000", "proxy_asset_00000"),
                )

            with self.assertRaisesRegex(ProductionHandoffError, "depends on incomplete"):
                plan_next_production_wave(manifest_path, completed_job_ids=("analyze_asset_00000",))

    def _ingest_fixture(self, root: Path, *, shoot_slug: str) -> Path:
        card = root / "card"
        library = root / "library"
        photo = card / "DCIM" / "100EOS5D" / "IMG_0001.JPG"
        video = card / "PRIVATE" / "A001.MOV"
        photo.parent.mkdir(parents=True)
        video.parent.mkdir(parents=True)
        photo.write_bytes(b"photo-bytes")
        video.write_bytes(b"video-bytes")
        report = execute_copy_plan(
            plan_import(card, library, shoot_date="2026-05-09", shoot_slug=shoot_slug)
        )
        return report.manifest_path

    @staticmethod
    def _production_plan(manifest_path: Path):
        catalog = load_ingest_manifest(manifest_path)
        return build_production_plan(
            production_assets_from_manifest(catalog),
            shoot_slug=catalog.shoot_slug,
        )

    @staticmethod
    def _statuses_with(production_plan, overrides):
        return tuple(
            overrides.get(job.job_id, ProductionJobStatus(job_id=job.job_id, state="pending"))
            for job in production_plan.jobs
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
            updated_at="2026-05-09T15:05:00Z",
        )


if __name__ == "__main__":
    unittest.main()
