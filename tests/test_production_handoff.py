import tempfile
import unittest
from pathlib import Path

from shootflow.ingest import execute_copy_plan, plan_import
from shootflow.production_handoff import ProductionHandoffError, plan_next_production_wave


class ProductionWaveHandoffTests(unittest.TestCase):
    def test_plans_first_proxy_wave_from_verified_ingest_manifest_without_writes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            library = root / "library"
            manifest_path = _create_verified_manifest(root)

            handoff = plan_next_production_wave(manifest_path)

            shoot_folder = library / "2026-05-09_launch-demo"
            self.assertEqual(handoff.status, "ready")
            self.assertEqual(handoff.wave_index, 0)
            self.assertEqual(handoff.shoot_slug, "launch-demo")
            self.assertEqual([job.output_kind for job in handoff.jobs], ["proxy_media", "proxy_media"])
            self.assertEqual(handoff.completed_job_ids, ())
            self.assertIn("read-only production wave handoff", handoff.safety_notes)
            self.assertFalse((shoot_folder / "analysis").exists())
            self.assertFalse((shoot_folder / "graded").exists())
            self.assertFalse((shoot_folder / "deliverables").exists())

    def test_advances_to_analysis_wave_after_all_proxy_jobs_are_completed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            manifest_path = _create_verified_manifest(Path(tmp))

            handoff = plan_next_production_wave(
                manifest_path,
                completed_job_ids=("proxy_asset_00001", "proxy_asset_00000"),
            )

            self.assertEqual(handoff.status, "ready")
            self.assertEqual(handoff.wave_index, 1)
            self.assertEqual(handoff.completed_job_ids, ("proxy_asset_00000", "proxy_asset_00001"))
            self.assertEqual(
                [(job.job_id, job.output_kind, job.depends_on) for job in handoff.jobs],
                [
                    ("analyze_asset_00000", "vlm_asset_analysis", ("proxy_asset_00000",)),
                    ("analyze_asset_00001", "vlm_asset_analysis", ("proxy_asset_00001",)),
                ],
            )

    def test_reports_complete_when_all_production_jobs_are_completed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            manifest_path = _create_verified_manifest(Path(tmp))

            handoff = plan_next_production_wave(
                manifest_path,
                completed_job_ids=(
                    "proxy_asset_00000",
                    "proxy_asset_00001",
                    "analyze_asset_00000",
                    "analyze_asset_00001",
                    "group_scene_sets",
                    "develop_shoot_look",
                    "grade_asset_00000",
                    "grade_asset_00001",
                    "rank_instagram_storylines",
                    "assemble_instagram_reel",
                    "assemble_instagram_carousel",
                    "export_instagram_photo_set",
                ),
            )

            self.assertEqual(handoff.status, "complete")
            self.assertIsNone(handoff.wave_index)
            self.assertEqual(handoff.jobs, ())
            self.assertEqual(handoff.blocked_dependency_ids, ())

    def test_rejects_completed_job_ids_that_do_not_match_the_manifest_plan(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            manifest_path = _create_verified_manifest(Path(tmp))

            with self.assertRaisesRegex(ProductionHandoffError, "Unknown completed production job ID"):
                plan_next_production_wave(manifest_path, completed_job_ids=("proxy_asset_99999",))

    def test_rejects_completed_jobs_whose_dependencies_are_not_completed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            manifest_path = _create_verified_manifest(Path(tmp))

            with self.assertRaisesRegex(ProductionHandoffError, "missing completed dependency"):
                plan_next_production_wave(manifest_path, completed_job_ids=("analyze_asset_00000",))


def _create_verified_manifest(root: Path) -> Path:
    card = root / "card"
    library = root / "library"
    photo = card / "DCIM" / "100CANON" / "IMG_0001.JPG"
    video = card / "PRIVATE" / "A001.MOV"
    photo.parent.mkdir(parents=True)
    video.parent.mkdir(parents=True)
    photo.write_bytes(b"photo-bytes")
    video.write_bytes(b"video-bytes")
    copy_report = execute_copy_plan(
        plan_import(card, library, shoot_date="2026-05-09", shoot_slug="launch-demo")
    )
    return copy_report.manifest_path


if __name__ == "__main__":
    unittest.main()
