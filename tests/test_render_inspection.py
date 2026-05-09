import hashlib
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


class RenderInspectionTests(unittest.TestCase):
    def test_inspection_reports_verified_and_problem_outputs_without_mutating_status(self) -> None:
        trusted_plan = self._two_task_plan()
        verified_bytes = b"verified reel bytes"
        mismatch_bytes = b"actual carousel bytes"
        verified_sha = hashlib.sha256(verified_bytes).hexdigest()
        stale_sha = hashlib.sha256(b"old carousel bytes").hexdigest()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            self._touch_task_inputs(workspace, trusted_plan)
            write_render_tasks_manifest(trusted_plan, workspace)
            reel_output = workspace / "deliverables" / "instagram_reel.mp4"
            carousel_output = workspace / "deliverables" / "instagram_carousel" / "slide_00001.jpg"
            reel_output.parent.mkdir(parents=True, exist_ok=True)
            carousel_output.parent.mkdir(parents=True)
            reel_output.write_bytes(verified_bytes)
            carousel_output.write_bytes(mismatch_bytes)
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
                                    sha256=verified_sha,
                                ),
                            ),
                            updated_at="2026-05-09T11:00:00Z",
                        ),
                        RenderTaskStatus(
                            task_id="render_instagram_carousel",
                            state="succeeded",
                            renderer_adapter="dry-run-local",
                            attempts=1,
                            output_checksums=(
                                OutputChecksum(
                                    path="deliverables/instagram_carousel/slide_00001.jpg",
                                    sha256=stale_sha,
                                ),
                                OutputChecksum(
                                    path="deliverables/instagram_carousel/slide_00002.jpg",
                                    sha256=hashlib.sha256(b"missing").hexdigest(),
                                ),
                            ),
                            updated_at="2026-05-09T11:00:01Z",
                        ),
                    ),
                ),
                workspace,
                trusted_plan=trusted_plan,
            )
            status_before = (workspace / "deliverables" / "render_status.json").read_bytes()

            report = inspect_render_workspace(workspace)

            status_after = (workspace / "deliverables" / "render_status.json").read_bytes()

        self.assertEqual(status_after, status_before)
        self.assertEqual(report.status, "review_required")
        self.assertEqual(report.verified_output_paths, ("deliverables/instagram_reel.mp4",))
        self.assertEqual(report.review_required_task_ids, ("render_instagram_carousel",))
        self.assertEqual(
            [(inspection.path, inspection.state) for inspection in report.output_inspections],
            [
                ("deliverables/instagram_reel.mp4", "verified"),
                ("deliverables/instagram_carousel/slide_00001.jpg", "checksum_mismatch"),
                ("deliverables/instagram_carousel/slide_00002.jpg", "missing"),
            ],
        )

    def test_inspection_verifies_succeeded_outputs_after_render_inputs_are_archived(self) -> None:
        trusted_plan = self._two_task_plan()
        verified_bytes = b"verified reel bytes"
        carousel_bytes = b"verified carousel bytes"
        verified_sha = hashlib.sha256(verified_bytes).hexdigest()
        carousel_sha = hashlib.sha256(carousel_bytes).hexdigest()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            write_render_tasks_manifest(trusted_plan, workspace)
            reel_output = workspace / "deliverables" / "instagram_reel.mp4"
            carousel_output_1 = workspace / "deliverables" / "instagram_carousel" / "slide_00001.jpg"
            carousel_output_2 = workspace / "deliverables" / "instagram_carousel" / "slide_00002.jpg"
            reel_output.parent.mkdir(parents=True, exist_ok=True)
            carousel_output_1.parent.mkdir(parents=True)
            reel_output.write_bytes(verified_bytes)
            carousel_output_1.write_bytes(carousel_bytes)
            carousel_output_2.write_bytes(carousel_bytes)
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
                                    sha256=verified_sha,
                                ),
                            ),
                            updated_at="2026-05-09T11:00:00Z",
                        ),
                        RenderTaskStatus(
                            task_id="render_instagram_carousel",
                            state="succeeded",
                            renderer_adapter="dry-run-local",
                            attempts=1,
                            output_checksums=(
                                OutputChecksum(
                                    path="deliverables/instagram_carousel/slide_00001.jpg",
                                    sha256=carousel_sha,
                                ),
                                OutputChecksum(
                                    path="deliverables/instagram_carousel/slide_00002.jpg",
                                    sha256=carousel_sha,
                                ),
                            ),
                            updated_at="2026-05-09T11:00:01Z",
                        ),
                    ),
                ),
                workspace,
                trusted_plan=trusted_plan,
            )

            report = inspect_render_workspace(workspace)

        self.assertEqual(report.status, "verified")
        self.assertEqual(
            report.verified_output_paths,
            (
                "deliverables/instagram_reel.mp4",
                "deliverables/instagram_carousel/slide_00001.jpg",
                "deliverables/instagram_carousel/slide_00002.jpg",
            ),
        )
        self.assertEqual(report.review_required_task_ids, ())

    def test_inspection_reports_pending_only_workspace_as_in_progress(self) -> None:
        trusted_plan = self._two_task_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            self._touch_task_inputs(workspace, trusted_plan)
            write_render_tasks_manifest(trusted_plan, workspace)
            write_render_status_manifest(
                RenderStatusManifest(
                    shoot_slug=trusted_plan.shoot_slug,
                    render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
                    task_statuses=(
                        RenderTaskStatus(task_id="render_instagram_reel", state="pending"),
                        RenderTaskStatus(task_id="render_instagram_carousel", state="pending"),
                    ),
                ),
                workspace,
                trusted_plan=trusted_plan,
            )

            report = inspect_render_workspace(workspace)

        self.assertEqual(report.status, "in_progress")
        self.assertEqual(
            report.pending_task_ids,
            ("render_instagram_reel", "render_instagram_carousel"),
        )
        self.assertEqual(report.review_required_task_ids, ())
        self.assertEqual(report.output_inspections, ())

    def test_inspection_reports_symlink_and_directory_outputs_as_review_required(self) -> None:
        trusted_plan = self._two_task_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            self._touch_task_inputs(workspace, trusted_plan)
            write_render_tasks_manifest(trusted_plan, workspace)
            target = workspace / "manual-export.mp4"
            target.write_bytes(b"manual export")
            reel_output = workspace / "deliverables" / "instagram_reel.mp4"
            carousel_output = workspace / "deliverables" / "instagram_carousel" / "slide_00001.jpg"
            reel_output.parent.mkdir(parents=True, exist_ok=True)
            carousel_output.mkdir(parents=True)
            reel_output.symlink_to(target)
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
                                    sha256=hashlib.sha256(b"manual export").hexdigest(),
                                ),
                            ),
                            updated_at="2026-05-09T11:00:00Z",
                        ),
                        RenderTaskStatus(
                            task_id="render_instagram_carousel",
                            state="succeeded",
                            renderer_adapter="dry-run-local",
                            attempts=1,
                            output_checksums=(
                                OutputChecksum(
                                    path="deliverables/instagram_carousel/slide_00001.jpg",
                                    sha256=hashlib.sha256(b"directory").hexdigest(),
                                ),
                                OutputChecksum(
                                    path="deliverables/instagram_carousel/slide_00002.jpg",
                                    sha256=hashlib.sha256(b"missing").hexdigest(),
                                ),
                            ),
                            updated_at="2026-05-09T11:00:01Z",
                        ),
                    ),
                ),
                workspace,
                trusted_plan=trusted_plan,
            )

            report = inspect_render_workspace(workspace)

        self.assertEqual(report.status, "review_required")
        self.assertEqual(
            report.review_required_task_ids,
            ("render_instagram_reel", "render_instagram_carousel"),
        )
        self.assertEqual(
            [(inspection.path, inspection.state) for inspection in report.output_inspections],
            [
                ("deliverables/instagram_reel.mp4", "unsafe_path"),
                ("deliverables/instagram_carousel/slide_00001.jpg", "not_a_file"),
                ("deliverables/instagram_carousel/slide_00002.jpg", "missing"),
            ],
        )

    def test_inspection_marks_retryable_failed_and_running_tasks_for_review(self) -> None:
        trusted_plan = self._four_task_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            self._touch_task_inputs(workspace, trusted_plan)
            write_render_tasks_manifest(trusted_plan, workspace)
            write_render_status_manifest(
                RenderStatusManifest(
                    shoot_slug=trusted_plan.shoot_slug,
                    render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
                    task_statuses=(
                        RenderTaskStatus(task_id="render_instagram_reel", state="pending"),
                        RenderTaskStatus(
                            task_id="render_instagram_reel_variant_hero",
                            state="running",
                            renderer_adapter="dry-run-local",
                            attempts=1,
                            updated_at="2026-05-09T11:00:00Z",
                        ),
                        RenderTaskStatus(
                            task_id="render_instagram_reel_variant_fast_cut",
                            state="retryable",
                            renderer_adapter="dry-run-local",
                            attempts=1,
                            error_message="Manual output conflict needs review.",
                            updated_at="2026-05-09T11:00:01Z",
                        ),
                        RenderTaskStatus(
                            task_id="render_instagram_reel_variant_bts",
                            state="failed",
                            renderer_adapter="dry-run-local",
                            attempts=2,
                            error_message="Renderer exited non-zero.",
                            updated_at="2026-05-09T11:00:02Z",
                        ),
                    ),
                ),
                workspace,
                trusted_plan=trusted_plan,
            )

            report = inspect_render_workspace(workspace)

        self.assertEqual(report.status, "review_required")
        self.assertEqual(report.pending_task_ids, ("render_instagram_reel",))
        self.assertEqual(report.running_task_ids, ("render_instagram_reel_variant_hero",))
        self.assertEqual(report.retryable_task_ids, ("render_instagram_reel_variant_fast_cut",))
        self.assertEqual(report.failed_task_ids, ("render_instagram_reel_variant_bts",))
        self.assertEqual(
            report.review_required_task_ids,
            (
                "render_instagram_reel_variant_hero",
                "render_instagram_reel_variant_fast_cut",
                "render_instagram_reel_variant_bts",
            ),
        )
        self.assertEqual(report.output_inspections, ())

    def _touch_task_inputs(self, workspace: Path, trusted_plan: AssemblyPlan) -> None:
        for task in trusted_plan.render_tasks:
            for relative_path in task.inputs:
                path = workspace / relative_path
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b"trusted input")

    def _two_task_plan(self) -> AssemblyPlan:
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
                RenderTask(
                    task_id="render_instagram_carousel",
                    sequence_name="carousel",
                    source_job_id="assemble_instagram_carousel",
                    output_kind="instagram_carousel",
                    aspect_ratio="4:5",
                    inputs=(
                        "analysis/instagram_storylines.json",
                        "graded/grade_asset_00001/IMG_0001.JPG",
                        "graded/grade_asset_00002/IMG_0002.JPG",
                    ),
                    outputs=(
                        "deliverables/instagram_carousel/slide_00001.jpg",
                        "deliverables/instagram_carousel/slide_00002.jpg",
                    ),
                    depends_on=(
                        "rank_instagram_storylines",
                        "grade_asset_00001",
                        "grade_asset_00002",
                    ),
                    can_run_in_parallel=True,
                ),
            ),
        )

    def _four_task_plan(self) -> AssemblyPlan:
        return AssemblyPlan(
            shoot_slug="inspection-shoot",
            render_tasks=(
                self._reel_task("render_instagram_reel", "reel", "deliverables/instagram_reel.mp4"),
                self._reel_task(
                    "render_instagram_reel_variant_hero",
                    "hero",
                    "deliverables/instagram_reels/hero.mp4",
                ),
                self._reel_task(
                    "render_instagram_reel_variant_fast_cut",
                    "fast_cut",
                    "deliverables/instagram_reels/fast_cut.mp4",
                ),
                self._reel_task(
                    "render_instagram_reel_variant_bts",
                    "bts",
                    "deliverables/instagram_reels/bts.mp4",
                ),
            ),
        )

    def _reel_task(self, task_id: str, name: str, output: str) -> RenderTask:
        return RenderTask(
            task_id=task_id,
            sequence_name="reel",
            source_job_id="assemble_instagram_reel",
            output_kind="instagram_reel",
            aspect_ratio="9:16",
            inputs=(
                "analysis/instagram_storylines.json",
                f"graded/{task_id}/A001.MOV",
            ),
            outputs=(output,),
            depends_on=("rank_instagram_storylines", task_id),
            can_run_in_parallel=False,
        )


if __name__ == "__main__":
    unittest.main()
