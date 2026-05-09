import hashlib
import tempfile
import unittest
from pathlib import Path

from shootflow.assembly import AssemblyPlan, RenderTask
from shootflow.render_inspection import (
    inspect_render_workspace,
)
from shootflow.render_status import (
    OutputChecksum,
    RenderStatusManifest,
    RenderTaskStatus,
    render_plan_fingerprint,
    write_render_status_manifest,
)


class RenderWorkspaceInspectionTests(unittest.TestCase):
    def test_reports_verified_succeeded_outputs_without_writing_files(self) -> None:
        trusted_plan = self._trusted_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            output_path = workspace / "deliverables" / "instagram_reel.mp4"
            output_path.parent.mkdir(parents=True)
            output_path.write_bytes(b"rendered reel")
            before_paths = sorted(path.relative_to(workspace).as_posix() for path in workspace.rglob("*"))
            write_render_status_manifest(
                self._status_manifest(
                    trusted_plan,
                    state="succeeded",
                    checksum=self._sha256(output_path),
                ),
                workspace,
                trusted_plan=trusted_plan,
            )

            report = inspect_render_workspace(workspace, trusted_plan=trusted_plan)
            after_paths = sorted(path.relative_to(workspace).as_posix() for path in workspace.rglob("*"))

        self.assertEqual(report.status, "complete")
        self.assertEqual(report.task_counts["succeeded"], 1)
        self.assertEqual(report.output_counts["verified"], 1)
        self.assertEqual(report.review_required_task_ids, ())
        self.assertEqual(report.outputs[0].state, "verified")
        self.assertEqual(report.outputs[0].path, "deliverables/instagram_reel.mp4")
        self.assertEqual(before_paths + ["deliverables/render_status.json"], after_paths)

    def test_flags_missing_succeeded_outputs_for_review(self) -> None:
        trusted_plan = self._trusted_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            write_render_status_manifest(
                self._status_manifest(
                    trusted_plan,
                    state="succeeded",
                    checksum="a" * 64,
                ),
                workspace,
                trusted_plan=trusted_plan,
            )

            report = inspect_render_workspace(workspace, trusted_plan=trusted_plan)

        self.assertEqual(report.status, "attention_required")
        self.assertEqual(report.output_counts["missing"], 1)
        self.assertEqual(report.review_required_task_ids, ("render_instagram_reel",))
        self.assertEqual(report.outputs[0].state, "missing")
        self.assertIsNone(report.outputs[0].observed_sha256)

    def test_flags_checksum_mismatches_for_review(self) -> None:
        trusted_plan = self._trusted_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            output_path = workspace / "deliverables" / "instagram_reel.mp4"
            output_path.parent.mkdir(parents=True)
            output_path.write_bytes(b"changed bytes")
            observed_sha256 = self._sha256(output_path)
            write_render_status_manifest(
                self._status_manifest(
                    trusted_plan,
                    state="succeeded",
                    checksum="b" * 64,
                ),
                workspace,
                trusted_plan=trusted_plan,
            )

            report = inspect_render_workspace(workspace, trusted_plan=trusted_plan)

        self.assertEqual(report.status, "attention_required")
        self.assertEqual(report.output_counts["checksum_mismatch"], 1)
        self.assertEqual(report.review_required_task_ids, ("render_instagram_reel",))
        self.assertEqual(report.outputs[0].state, "checksum_mismatch")
        self.assertEqual(report.outputs[0].observed_sha256, observed_sha256)

    def test_flags_symlinked_succeeded_outputs_for_review(self) -> None:
        trusted_plan = self._trusted_plan()

        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as outside_tmp:
            workspace = Path(tmp)
            outside = Path(outside_tmp)
            outside_output = outside / "instagram_reel.mp4"
            output_path = workspace / "deliverables" / "instagram_reel.mp4"
            output_path.parent.mkdir(parents=True)
            outside_output.write_bytes(b"outside reel")
            output_path.symlink_to(outside_output)
            write_render_status_manifest(
                self._status_manifest(
                    trusted_plan,
                    state="succeeded",
                    checksum="c" * 64,
                ),
                workspace,
                trusted_plan=trusted_plan,
            )

            report = inspect_render_workspace(workspace, trusted_plan=trusted_plan)

        self.assertEqual(report.status, "attention_required")
        self.assertEqual(report.output_counts["unsafe_path"], 1)
        self.assertEqual(report.review_required_task_ids, ("render_instagram_reel",))
        self.assertEqual(report.outputs[0].state, "unsafe_path")
        self.assertIsNone(report.outputs[0].observed_sha256)

    def _trusted_plan(self) -> AssemblyPlan:
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

    def _status_manifest(
        self,
        trusted_plan: AssemblyPlan,
        *,
        state: str,
        checksum: str,
    ) -> RenderStatusManifest:
        return RenderStatusManifest(
            shoot_slug=trusted_plan.shoot_slug,
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
            task_statuses=(
                RenderTaskStatus(
                    task_id="render_instagram_reel",
                    state=state,  # type: ignore[arg-type]
                    renderer_adapter="dry-run-local",
                    attempts=1,
                    output_checksums=(
                        OutputChecksum(
                            path="deliverables/instagram_reel.mp4",
                            sha256=checksum,
                        ),
                    ),
                    updated_at="2026-05-09T10:05:00Z",
                ),
            ),
        )

    def _sha256(self, path: Path) -> str:
        return hashlib.sha256(path.read_bytes()).hexdigest()


if __name__ == "__main__":
    unittest.main()
