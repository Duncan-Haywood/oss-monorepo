from dataclasses import replace
import json
import tempfile
import unittest
from pathlib import Path

from shootflow.assembly import AssemblyPlan, RenderTask
from shootflow.render_status import (
    RENDER_STATUS_MANIFEST_PATH,
    OutputChecksum,
    RenderStatusError,
    RenderStatusManifest,
    RenderTaskStatus,
    build_initial_render_status_manifest,
    load_render_status_manifest,
    write_render_status_manifest,
)


class RenderStatusManifestTests(unittest.TestCase):
    def test_round_trips_initial_pending_statuses_for_trusted_render_tasks(self) -> None:
        trusted_plan = self._trusted_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            manifest = build_initial_render_status_manifest(trusted_plan)

            manifest_path = write_render_status_manifest(
                manifest,
                workspace,
                trusted_plan=trusted_plan,
            )
            loaded_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)
            raw_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

        self.assertEqual(manifest_path, workspace / RENDER_STATUS_MANIFEST_PATH)
        self.assertEqual(loaded_manifest, manifest)
        self.assertEqual([status.task_id for status in manifest.task_statuses], [
            "render_instagram_reel",
            "render_instagram_carousel",
        ])
        self.assertTrue(all(status.state == "pending" for status in manifest.task_statuses))
        self.assertEqual(list(raw_manifest), ["schema_version", "shoot_slug", "task_statuses"])
        self.assertEqual(
            list(raw_manifest["task_statuses"][0]),
            [
                "attempts",
                "error_message",
                "output_checksums",
                "renderer_adapter",
                "state",
                "task_id",
                "updated_at",
            ],
        )

    def test_round_trips_worker_reported_success_and_retryable_statuses(self) -> None:
        trusted_plan = self._trusted_plan()
        manifest = RenderStatusManifest(
            shoot_slug="status-contract",
            task_statuses=(
                RenderTaskStatus(
                    task_id="render_instagram_reel",
                    state="succeeded",
                    renderer_adapter="ffmpeg-local",
                    attempts=1,
                    output_checksums=(
                        OutputChecksum(
                            path="deliverables/instagram_reel.mp4",
                            sha256="a" * 64,
                        ),
                    ),
                    updated_at="2026-05-07T09:15:00Z",
                ),
                RenderTaskStatus(
                    task_id="render_instagram_carousel",
                    state="retryable",
                    renderer_adapter="core-image-local",
                    attempts=2,
                    error_message="Renderer worker was interrupted before writing outputs.",
                    updated_at="2026-05-07T09:16:00Z",
                ),
            ),
        )

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            write_render_status_manifest(manifest, workspace, trusted_plan=trusted_plan)

            loaded_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(loaded_manifest, manifest)

    def test_rejects_status_manifest_with_unknown_fields_or_delete_instructions(self) -> None:
        trusted_plan = self._trusted_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            write_render_status_manifest(
                build_initial_render_status_manifest(trusted_plan),
                workspace,
                trusted_plan=trusted_plan,
            )
            manifest_path = workspace / RENDER_STATUS_MANIFEST_PATH
            raw_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            raw_manifest["task_statuses"][0]["delete_after_render"] = True
            manifest_path.write_text(json.dumps(raw_manifest), encoding="utf-8")

            with self.assertRaisesRegex(RenderStatusError, "Unexpected render status field"):
                load_render_status_manifest(workspace, trusted_plan=trusted_plan)

    def test_rejects_statuses_that_do_not_match_the_current_trusted_plan(self) -> None:
        trusted_plan = self._trusted_plan()
        unknown_task_manifest = RenderStatusManifest(
            shoot_slug="status-contract",
            task_statuses=(
                RenderTaskStatus(task_id="render_instagram_reel", state="pending"),
                RenderTaskStatus(task_id="render_unknown_social_package", state="pending"),
            ),
        )
        missing_task_manifest = RenderStatusManifest(
            shoot_slug="status-contract",
            task_statuses=(RenderTaskStatus(task_id="render_instagram_reel", state="pending"),),
        )

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            with self.assertRaisesRegex(RenderStatusError, "does not match trusted render tasks"):
                write_render_status_manifest(
                    unknown_task_manifest,
                    workspace,
                    trusted_plan=trusted_plan,
                )

            with self.assertRaisesRegex(RenderStatusError, "does not match trusted render tasks"):
                write_render_status_manifest(
                    missing_task_manifest,
                    workspace,
                    trusted_plan=trusted_plan,
                )

    def test_rejects_success_checksums_outside_the_task_outputs(self) -> None:
        trusted_plan = self._trusted_plan()
        manifest = RenderStatusManifest(
            shoot_slug="status-contract",
            task_statuses=(
                RenderTaskStatus(
                    task_id="render_instagram_reel",
                    state="succeeded",
                    renderer_adapter="ffmpeg-local",
                    attempts=1,
                    output_checksums=(
                        OutputChecksum(
                            path="card/DCIM/A001.MOV",
                            sha256="a" * 64,
                        ),
                    ),
                    updated_at="2026-05-07T09:17:00Z",
                ),
                RenderTaskStatus(task_id="render_instagram_carousel", state="pending"),
            ),
        )

        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(RenderStatusError, "Unexpected checksum output path"):
                write_render_status_manifest(manifest, Path(tmp), trusted_plan=trusted_plan)

    def test_rejects_status_manifest_for_stale_task_inputs_even_when_outputs_match(self) -> None:
        original_plan = self._trusted_plan()
        stale_reel_task = replace(
            original_plan.render_tasks[0],
            inputs=(
                "analysis/instagram_storylines.json",
                "graded/grade_asset_00099/STALE_SELECTION.MOV",
            ),
            depends_on=("rank_instagram_storylines", "grade_asset_00099"),
        )
        stale_plan = replace(
            original_plan,
            render_tasks=(stale_reel_task,) + original_plan.render_tasks[1:],
        )
        stale_manifest = RenderStatusManifest(
            shoot_slug="status-contract",
            task_statuses=(
                RenderTaskStatus(
                    task_id="render_instagram_reel",
                    state="succeeded",
                    renderer_adapter="ffmpeg-local",
                    attempts=1,
                    output_checksums=(
                        OutputChecksum(
                            path="deliverables/instagram_reel.mp4",
                            sha256="a" * 64,
                        ),
                    ),
                    updated_at="2026-05-07T09:21:00Z",
                ),
                RenderTaskStatus(task_id="render_instagram_carousel", state="pending"),
            ),
        )

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            write_render_status_manifest(stale_manifest, workspace, trusted_plan=stale_plan)

            with self.assertRaisesRegex(RenderStatusError, "render plan fingerprint"):
                load_render_status_manifest(workspace, trusted_plan=original_plan)

    def test_rejects_invalid_state_specific_worker_statuses(self) -> None:
        trusted_plan = self._trusted_plan()

        invalid_statuses = (
            (
                RenderTaskStatus(
                    task_id="render_instagram_reel",
                    state="succeeded",
                    renderer_adapter="ffmpeg-local",
                    attempts=1,
                    output_checksums=(),
                    updated_at="2026-05-07T09:18:00Z",
                ),
                "Succeeded render status must include checksums for every output",
            ),
            (
                RenderTaskStatus(
                    task_id="render_instagram_reel",
                    state="failed",
                    renderer_adapter="ffmpeg-local",
                    attempts=1,
                    updated_at="2026-05-07T09:19:00Z",
                ),
                "failed render status must include an error message",
            ),
            (
                RenderTaskStatus(
                    task_id="render_instagram_reel",
                    state="running",
                    renderer_adapter="ffmpeg-local",
                    attempts=0,
                    updated_at="2026-05-07T09:20:00Z",
                ),
                "running render status attempts must be positive",
            ),
        )

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            for invalid_status, expected_error in invalid_statuses:
                with self.subTest(expected_error=expected_error):
                    manifest = RenderStatusManifest(
                        shoot_slug="status-contract",
                        task_statuses=(
                            invalid_status,
                            RenderTaskStatus(task_id="render_instagram_carousel", state="pending"),
                        ),
                    )

                    with self.assertRaisesRegex(RenderStatusError, expected_error):
                        write_render_status_manifest(manifest, workspace, trusted_plan=trusted_plan)

    def test_rejects_symlinked_status_manifest_and_temp_paths(self) -> None:
        trusted_plan = self._trusted_plan()

        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as outside_tmp:
            workspace = Path(tmp)
            outside = Path(outside_tmp)
            manifest = build_initial_render_status_manifest(trusted_plan)
            manifest_path = write_render_status_manifest(manifest, workspace, trusted_plan=trusted_plan)
            manifest_path.unlink()
            manifest_path.symlink_to(outside / "render_status.json")

            with self.assertRaisesRegex(RenderStatusError, "render status manifest symlink"):
                load_render_status_manifest(workspace, trusted_plan=trusted_plan)

        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as outside_tmp:
            workspace = Path(tmp)
            outside = Path(outside_tmp)
            manifest = build_initial_render_status_manifest(trusted_plan)
            manifest_path = workspace / RENDER_STATUS_MANIFEST_PATH
            manifest_path.parent.mkdir(parents=True)
            manifest_path.with_suffix(".json.tmp").symlink_to(outside / "render_status.json.tmp")

            with self.assertRaisesRegex(RenderStatusError, "temporary render status manifest"):
                write_render_status_manifest(manifest, workspace, trusted_plan=trusted_plan)

    def _trusted_plan(self) -> AssemblyPlan:
        return AssemblyPlan(
            shoot_slug="status-contract",
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
                        "graded/grade_asset_00001/IMG_0001.CR3",
                    ),
                    outputs=("deliverables/instagram_carousel/slide_00001.jpg",),
                    depends_on=("rank_instagram_storylines", "grade_asset_00001"),
                    can_run_in_parallel=False,
                ),
            ),
        )


if __name__ == "__main__":
    unittest.main()
