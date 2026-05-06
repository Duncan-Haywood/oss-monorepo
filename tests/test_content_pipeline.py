import unittest
from pathlib import Path

from media_automation.content_pipeline import (
    ContentPlanOptions,
    DeliverableKind,
    JobKind,
    plan_content_jobs,
)
from media_automation.ingest import IngestManifest, ManifestItem, MediaKind


class ContentPipelinePlanTests(unittest.TestCase):
    def test_plans_parallel_analysis_and_color_grade_jobs_before_deliverables(self) -> None:
        manifest = IngestManifest(
            items=(
                ManifestItem(
                    source=Path("/Volumes/CARD/DCIM/IMG_0001.CR3"),
                    destination=Path("/Archive/shoot/raw/IMG_0001.CR3"),
                    kind=MediaKind.RAW,
                    size_bytes=12,
                    sha256="raw-digest",
                ),
                ManifestItem(
                    source=Path("/Volumes/CARD/DCIM/VID_0002.MOV"),
                    destination=Path("/Archive/shoot/video/VID_0002.MOV"),
                    kind=MediaKind.VIDEO,
                    size_bytes=34,
                    sha256="video-digest",
                ),
            )
        )

        plan = plan_content_jobs(
            manifest,
            ContentPlanOptions(
                project_slug="desert-editorial",
                output_root=Path("/Projects/Exports"),
                deliverables=(DeliverableKind.REEL, DeliverableKind.CAROUSEL),
                max_parallel_jobs=16,
            ),
        )

        analysis_jobs = [job for job in plan.jobs if job.kind == JobKind.ANALYZE]
        grade_jobs = [job for job in plan.jobs if job.kind == JobKind.COLOR_GRADE]
        deliverable_jobs = [job for job in plan.jobs if job.kind == JobKind.ASSEMBLE_DELIVERABLE]

        self.assertEqual(len(analysis_jobs), 2)
        self.assertEqual(len(grade_jobs), 2)
        self.assertTrue(all(job.parallelizable for job in analysis_jobs + grade_jobs))
        self.assertEqual({job.deliverable for job in deliverable_jobs}, {DeliverableKind.REEL, DeliverableKind.CAROUSEL})
        self.assertTrue(all(not job.parallelizable for job in deliverable_jobs))
        self.assertTrue(all(grade_jobs[0].id not in job.depends_on for job in analysis_jobs))
        self.assertTrue(all(job.depends_on for job in deliverable_jobs))
        self.assertLessEqual(plan.recommended_concurrency, 16)

    def test_skips_unsupported_sidecars_for_visual_deliverables_but_keeps_them_as_context(self) -> None:
        manifest = IngestManifest(
            items=(
                ManifestItem(
                    source=Path("/Volumes/CARD/DCIM/IMG_0001.XMP"),
                    destination=Path("/Archive/shoot/sidecar/IMG_0001.XMP"),
                    kind=MediaKind.SIDECAR,
                    size_bytes=5,
                    sha256="xmp-digest",
                ),
            )
        )

        plan = plan_content_jobs(
            manifest,
            ContentPlanOptions(
                project_slug="lookbook",
                output_root=Path("/Projects/Exports"),
                deliverables=(DeliverableKind.PHOTO_SELECTS,),
            ),
        )

        self.assertEqual(plan.jobs, ())
        self.assertIn("sidecar", plan.notes[0])


if __name__ == "__main__":
    unittest.main()
