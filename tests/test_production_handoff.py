import tempfile
import unittest
from pathlib import Path

from shootflow.ingest import execute_copy_plan, plan_import
from shootflow.production_handoff import ProductionHandoffError, plan_next_production_wave


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


if __name__ == "__main__":
    unittest.main()
