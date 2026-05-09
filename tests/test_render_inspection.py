import hashlib
import os
from pathlib import Path
import tempfile
import unittest

from shootflow.assembly import AssemblyPlan, RenderTask, write_render_tasks_manifest
from shootflow.render_inspection import inspect_render_workspace
from shootflow.render_status import (
    OutputChecksum,
    RenderStatusManifest,
    RenderTaskStatus,
    render_plan_fingerprint,
    write_render_status_manifest,
)


class RenderWorkspaceInspectionTests(unittest.TestCase):
    def test_inspection_verifies_outputs_and_marks_review_required_tasks(self) -> None:
        trusted_plan = self._three_task_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            write_render_tasks_manifest(trusted_plan, workspace)
            verified_output = workspace / "deliverables" / "instagram_reel.mp4"
            verified_output.parent.mkdir(parents=True, exist_ok=True)
            verified_output.write_bytes(b"verified reel")
            write_render_status_manifest(
                RenderStatusManifest(
                    shoot_slug=trusted_plan.shoot_slug,
                    render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
                    task_statuses=(
                        RenderTaskStatus(
                            task_id="render_instagram_reel",
                            state="succeeded",
                            renderer_adapter="dry-run-local",
                            attempts=1,
                            output_checksums=(
                                OutputChecksum(
                                    path="deliverables/instagram_reel.mp4",
                                    sha256=self._sha256(b"verified reel"),
                                ),
                            ),
                            updated_at="2026-05-09T10:00:00Z",
                        ),
                        RenderTaskStatus(
                            task_id="render_instagram_carousel",
                            state="succeeded",
                            renderer_adapter="dry-run-local",
                            attempts=1,
                            output_checksums=(
                                OutputChecksum(
                                    path="deliverables/instagram_carousel/slide_00001.jpg",
                                    sha256=self._sha256(b"missing carousel"),
                                ),
                            ),
                            updated_at="2026-05-09T10:00:01Z",
                        ),
                        RenderTaskStatus(
                            task_id="export_instagram_photo_set",
                            state="retryable",
                            renderer_adapter="dry-run-local",
                            attempts=1,
                            error_message="Manual output conflict needs review.",
                            updated_at="2026-05-09T10:00:02Z",
                        ),
                    ),
                ),
                workspace,
                trusted_plan=trusted_plan,
            )

            report = inspect_render_workspace(workspace)

        self.assertEqual(report.shoot_slug, "inspection-shoot")
        self.assertEqual(report.total_task_count, 3)
        self.assertEqual(report.status_counts["succeeded"], 2)
        self.assertEqual(report.status_counts["retryable"], 1)
        self.assertEqual(
            tuple((output.task_id, output.path, output.state) for output in report.outputs),
            (
                ("render_instagram_reel", "deliverables/instagram_reel.mp4", "verified"),
                ("render_instagram_carousel", "deliverables/instagram_carousel/slide_00001.jpg", "missing"),
            ),
        )
        self.assertEqual(report.verified_output_count, 1)
        self.assertEqual(
            report.review_required_task_ids,
            ("render_instagram_carousel", "export_instagram_photo_set"),
        )

    def test_inspection_rejects_symlinked_outputs_without_following_them(self) -> None:
        trusted_plan = self._single_reel_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            outside = workspace / "outside.mp4"
            outside.write_bytes(b"outside bytes")
            write_render_tasks_manifest(trusted_plan, workspace)
            deliverable = workspace / "deliverables" / "instagram_reel.mp4"
            deliverable.parent.mkdir(parents=True, exist_ok=True)
            deliverable.symlink_to(outside)
            write_render_status_manifest(
                RenderStatusManifest(
                    shoot_slug=trusted_plan.shoot_slug,
                    render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
                    task_statuses=(
                        RenderTaskStatus(
                            task_id="render_instagram_reel",
                            state="succeeded",
                            renderer_adapter="dry-run-local",
                            attempts=1,
                            output_checksums=(
                                OutputChecksum(
                                    path="deliverables/instagram_reel.mp4",
                                    sha256=self._sha256(b"outside bytes"),
                                ),
                            ),
                            updated_at="2026-05-09T10:00:00Z",
                        ),
                    ),
                ),
                workspace,
                trusted_plan=trusted_plan,
            )

            report = inspect_render_workspace(workspace)
            outside_bytes = outside.read_bytes()

        self.assertEqual(report.outputs[0].state, "unsafe_path")
        self.assertIn("symlink", report.outputs[0].message.lower())
        self.assertEqual(report.outputs[0].actual_sha256, None)
        self.assertEqual(report.review_required_task_ids, ("render_instagram_reel",))
        self.assertEqual(outside_bytes, b"outside bytes")

    def test_inspection_rejects_symlinked_output_parent_without_following_it(self) -> None:
        trusted_plan = self._single_carousel_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            outside = workspace / "outside"
            outside.mkdir()
            outside_output = outside / "slide_00001.jpg"
            outside_output.write_bytes(b"outside carousel")
            write_render_tasks_manifest(trusted_plan, workspace)
            write_render_status_manifest(
                RenderStatusManifest(
                    shoot_slug=trusted_plan.shoot_slug,
                    render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
                    task_statuses=(
                        RenderTaskStatus(
                            task_id="render_instagram_carousel",
                            state="succeeded",
                            renderer_adapter="dry-run-local",
                            attempts=1,
                            output_checksums=(
                                OutputChecksum(
                                    path="deliverables/instagram_carousel/slide_00001.jpg",
                                    sha256=self._sha256(b"outside carousel"),
                                ),
                            ),
                            updated_at="2026-05-09T10:00:00Z",
                        ),
                    ),
                ),
                workspace,
                trusted_plan=trusted_plan,
            )
            (workspace / "deliverables" / "instagram_carousel").symlink_to(
                outside,
                target_is_directory=True,
            )

            report = inspect_render_workspace(workspace)
            outside_bytes = outside_output.read_bytes()

        self.assertEqual(report.outputs[0].state, "unsafe_path")
        self.assertIn("symlink", report.outputs[0].message.lower())
        self.assertEqual(report.outputs[0].actual_sha256, None)
        self.assertEqual(report.review_required_task_ids, ("render_instagram_carousel",))
        self.assertEqual(outside_bytes, b"outside carousel")

    @unittest.skipUnless(hasattr(os, "mkfifo"), "requires os.mkfifo")
    def test_inspection_reports_fifo_output_as_not_a_file(self) -> None:
        trusted_plan = self._single_reel_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            write_render_tasks_manifest(trusted_plan, workspace)
            deliverable = workspace / "deliverables" / "instagram_reel.mp4"
            os.mkfifo(deliverable)
            write_render_status_manifest(
                RenderStatusManifest(
                    shoot_slug=trusted_plan.shoot_slug,
                    render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
                    task_statuses=(
                        RenderTaskStatus(
                            task_id="render_instagram_reel",
                            state="succeeded",
                            renderer_adapter="dry-run-local",
                            attempts=1,
                            output_checksums=(
                                OutputChecksum(
                                    path="deliverables/instagram_reel.mp4",
                                    sha256=self._sha256(b""),
                                ),
                            ),
                            updated_at="2026-05-09T10:00:00Z",
                        ),
                    ),
                ),
                workspace,
                trusted_plan=trusted_plan,
            )

            report = inspect_render_workspace(workspace)

        self.assertEqual(report.outputs[0].state, "not_a_file")
        self.assertEqual(report.outputs[0].actual_sha256, None)
        self.assertEqual(report.review_required_task_ids, ("render_instagram_reel",))

    def test_inspection_reports_checksum_mismatch_with_actual_checksum(self) -> None:
        trusted_plan = self._single_reel_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            write_render_tasks_manifest(trusted_plan, workspace)
            deliverable = workspace / "deliverables" / "instagram_reel.mp4"
            deliverable.write_bytes(b"actual reel")
            write_render_status_manifest(
                RenderStatusManifest(
                    shoot_slug=trusted_plan.shoot_slug,
                    render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
                    task_statuses=(
                        RenderTaskStatus(
                            task_id="render_instagram_reel",
                            state="succeeded",
                            renderer_adapter="dry-run-local",
                            attempts=1,
                            output_checksums=(
                                OutputChecksum(
                                    path="deliverables/instagram_reel.mp4",
                                    sha256=self._sha256(b"expected reel"),
                                ),
                            ),
                            updated_at="2026-05-09T10:00:00Z",
                        ),
                    ),
                ),
                workspace,
                trusted_plan=trusted_plan,
            )

            report = inspect_render_workspace(workspace)

        self.assertEqual(report.outputs[0].state, "checksum_mismatch")
        self.assertEqual(report.outputs[0].actual_sha256, self._sha256(b"actual reel"))
        self.assertEqual(report.outputs[0].expected_sha256, self._sha256(b"expected reel"))
        self.assertEqual(report.review_required_task_ids, ("render_instagram_reel",))

    def test_inspection_marks_failed_status_for_review_without_reading_outputs(self) -> None:
        trusted_plan = self._single_reel_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            write_render_tasks_manifest(trusted_plan, workspace)
            write_render_status_manifest(
                RenderStatusManifest(
                    shoot_slug=trusted_plan.shoot_slug,
                    render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
                    task_statuses=(
                        RenderTaskStatus(
                            task_id="render_instagram_reel",
                            state="failed",
                            renderer_adapter="dry-run-local",
                            attempts=1,
                            error_message="Renderer exhausted safe retries.",
                            updated_at="2026-05-09T10:00:00Z",
                        ),
                    ),
                ),
                workspace,
                trusted_plan=trusted_plan,
            )

            report = inspect_render_workspace(workspace)

        self.assertEqual(report.outputs, ())
        self.assertEqual(report.failed_task_ids, ("render_instagram_reel",))
        self.assertEqual(report.review_required_task_ids, ("render_instagram_reel",))

    def _single_reel_plan(self) -> AssemblyPlan:
        return AssemblyPlan(
            shoot_slug="inspection-shoot",
            render_tasks=(
                RenderTask(
                    task_id="render_instagram_reel",
                    sequence_name="reel",
                    source_job_id="assemble_instagram_reel",
                    output_kind="instagram_reel",
                    aspect_ratio="9:16",
                    inputs=(
                        "analysis/instagram_storylines.json",
                        "graded/grade_asset_00000/A001.MOV",
                    ),
                    outputs=("deliverables/instagram_reel.mp4",),
                    depends_on=("rank_instagram_storylines", "grade_asset_00000"),
                    can_run_in_parallel=False,
                ),
            ),
        )

    def _single_carousel_plan(self) -> AssemblyPlan:
        return AssemblyPlan(
            shoot_slug="inspection-shoot",
            render_tasks=(
                RenderTask(
                    task_id="render_instagram_carousel",
                    sequence_name="carousel",
                    source_job_id="assemble_instagram_carousel",
                    output_kind="instagram_carousel",
                    aspect_ratio="4:5",
                    inputs=(
                        "analysis/instagram_storylines.json",
                        "graded/grade_asset_00001/IMG_0001.JPG",
                    ),
                    outputs=("deliverables/instagram_carousel/slide_00001.jpg",),
                    depends_on=("rank_instagram_storylines", "grade_asset_00001"),
                    can_run_in_parallel=False,
                ),
            ),
        )

    def _three_task_plan(self) -> AssemblyPlan:
        return AssemblyPlan(
            shoot_slug="inspection-shoot",
            render_tasks=(
                self._single_reel_plan().render_tasks[0],
                RenderTask(
                    task_id="render_instagram_carousel",
                    sequence_name="carousel",
                    source_job_id="assemble_instagram_carousel",
                    output_kind="instagram_carousel",
                    aspect_ratio="4:5",
                    inputs=(
                        "analysis/instagram_storylines.json",
                        "graded/grade_asset_00001/IMG_0001.JPG",
                    ),
                    outputs=("deliverables/instagram_carousel/slide_00001.jpg",),
                    depends_on=("rank_instagram_storylines", "grade_asset_00001"),
                    can_run_in_parallel=False,
                ),
                RenderTask(
                    task_id="export_instagram_photo_set",
                    sequence_name="photo_set",
                    source_job_id="export_instagram_photo_set",
                    output_kind="instagram_photo_set",
                    aspect_ratio="4:5",
                    inputs=(
                        "analysis/instagram_storylines.json",
                        "graded/grade_asset_00002/IMG_0002.JPG",
                    ),
                    outputs=("deliverables/instagram_photo_set/photo_00001.jpg",),
                    depends_on=("rank_instagram_storylines", "grade_asset_00002"),
                    can_run_in_parallel=False,
                ),
            ),
        )

    def _sha256(self, content: bytes) -> str:
        return hashlib.sha256(content).hexdigest()
