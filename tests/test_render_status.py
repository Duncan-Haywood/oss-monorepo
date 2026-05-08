from dataclasses import replace
import json
import tempfile
import threading
import unittest
from pathlib import Path

import shootflow.render_status as render_status_module
from shootflow.assembly import AssemblyPlan, RenderTask
from shootflow.render_status import (
    RENDER_STATUS_MANIFEST_PATH,
    OutputChecksum,
    RenderStatusError,
    RenderStatusManifest,
    RenderTaskStatus,
    build_initial_render_status_manifest,
    compare_and_write_render_task_status,
    initialize_render_status_manifest,
    load_render_status_manifest,
    render_plan_fingerprint,
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
        self.assertEqual(
            list(raw_manifest),
            ["render_plan_fingerprint", "schema_version", "shoot_slug", "task_statuses"],
        )
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

    def test_initializes_missing_render_status_manifest_from_trusted_plan(self) -> None:
        trusted_plan = self._trusted_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)

            result = initialize_render_status_manifest(workspace, trusted_plan=trusted_plan)
            loaded_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertTrue(result.created)
        self.assertEqual(result.manifest_path, workspace / RENDER_STATUS_MANIFEST_PATH)
        self.assertEqual(result.manifest, loaded_manifest)
        self.assertEqual([status.state for status in result.manifest.task_statuses], ["pending", "pending"])

    def test_initializing_existing_render_status_manifest_preserves_progress(self) -> None:
        trusted_plan = self._trusted_plan()
        existing_manifest = RenderStatusManifest(
            shoot_slug="status-contract",
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
            task_statuses=(
                RenderTaskStatus(
                    task_id="render_instagram_reel",
                    state="running",
                    renderer_adapter="dry-run-local",
                    attempts=1,
                    updated_at="2026-05-07T13:30:00Z",
                ),
                RenderTaskStatus(
                    task_id="render_instagram_carousel",
                    state="retryable",
                    renderer_adapter="dry-run-local",
                    attempts=2,
                    error_message="Manual export already exists and needs review.",
                    updated_at="2026-05-07T13:31:00Z",
                ),
            ),
        )

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            write_render_status_manifest(existing_manifest, workspace, trusted_plan=trusted_plan)

            result = initialize_render_status_manifest(workspace, trusted_plan=trusted_plan)
            loaded_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertFalse(result.created)
        self.assertEqual(result.manifest, existing_manifest)
        self.assertEqual(loaded_manifest, existing_manifest)
        self.assertEqual([status.state for status in result.manifest.task_statuses], ["running", "retryable"])

    def test_initializing_existing_stale_status_manifest_rejects_without_reset(self) -> None:
        trusted_plan = self._trusted_plan()
        stale_plan = replace(
            trusted_plan,
            render_tasks=(
                replace(
                    trusted_plan.render_tasks[0],
                    inputs=(
                        "analysis/instagram_storylines.json",
                        "graded/grade_asset_00099/STALE.MOV",
                    ),
                    depends_on=("rank_instagram_storylines", "grade_asset_00099"),
                ),
            )
            + trusted_plan.render_tasks[1:],
        )

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            stale_manifest = build_initial_render_status_manifest(stale_plan)
            write_render_status_manifest(stale_manifest, workspace, trusted_plan=stale_plan)

            with self.assertRaisesRegex(RenderStatusError, "render plan fingerprint"):
                initialize_render_status_manifest(workspace, trusted_plan=trusted_plan)
            loaded_stale_manifest = load_render_status_manifest(workspace, trusted_plan=stale_plan)

        self.assertEqual(loaded_stale_manifest, stale_manifest)

    def test_concurrent_initialization_creates_once_without_resetting_progress(self) -> None:
        trusted_plan = self._trusted_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            barrier = threading.Barrier(2)
            results = []
            errors = []

            def initialize() -> None:
                try:
                    barrier.wait()
                    results.append(
                        initialize_render_status_manifest(workspace, trusted_plan=trusted_plan)
                    )
                except Exception as exc:  # pragma: no cover - re-raised by assertion below
                    errors.append(exc)

            threads = [threading.Thread(target=initialize) for _index in range(2)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join()
            loaded_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(errors, [])
        self.assertEqual(len(results), 2)
        self.assertEqual(sorted(result.created for result in results), [False, True])
        self.assertTrue(all(result.manifest == loaded_manifest for result in results))
        self.assertEqual([status.state for status in loaded_manifest.task_statuses], ["pending", "pending"])

    def test_round_trips_worker_reported_success_and_retryable_statuses(self) -> None:
        trusted_plan = self._trusted_plan()
        manifest = RenderStatusManifest(
            shoot_slug="status-contract",
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
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
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
            task_statuses=(
                RenderTaskStatus(task_id="render_instagram_reel", state="pending"),
                RenderTaskStatus(task_id="render_unknown_social_package", state="pending"),
            ),
        )
        missing_task_manifest = RenderStatusManifest(
            shoot_slug="status-contract",
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
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
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
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
            render_plan_fingerprint=render_plan_fingerprint(stale_plan),
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
                        render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
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

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            manifest = build_initial_render_status_manifest(trusted_plan)
            manifest_path = workspace / RENDER_STATUS_MANIFEST_PATH
            manifest_path.parent.mkdir(parents=True)
            manifest_path.with_suffix(".json.tmp").write_text("stale", encoding="utf-8")

            with self.assertRaisesRegex(RenderStatusError, "stale temporary render status manifest"):
                write_render_status_manifest(manifest, workspace, trusted_plan=trusted_plan)

    def test_compares_and_writes_one_updated_task_status_from_latest_manifest(self) -> None:
        trusted_plan = self._trusted_plan()
        updated_status = RenderTaskStatus(
            task_id="render_instagram_reel",
            state="running",
            renderer_adapter="dry-run-local",
            attempts=1,
            updated_at="2026-05-07T13:20:00Z",
        )

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            initial_manifest = build_initial_render_status_manifest(trusted_plan)
            write_render_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)

            updated_manifest = compare_and_write_render_task_status(
                workspace,
                trusted_plan=trusted_plan,
                updated_status=updated_status,
                expected_state="pending",
                expected_attempts=0,
            )
            loaded_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(updated_manifest, loaded_manifest)
        self.assertEqual(updated_manifest.shoot_slug, initial_manifest.shoot_slug)
        self.assertEqual(
            updated_manifest.render_plan_fingerprint,
            initial_manifest.render_plan_fingerprint,
        )
        self.assertEqual(
            [status.task_id for status in updated_manifest.task_statuses],
            ["render_instagram_reel", "render_instagram_carousel"],
        )
        self.assertEqual(updated_manifest.task_statuses[0], updated_status)
        self.assertEqual(updated_manifest.task_statuses[1], initial_manifest.task_statuses[1])

    def test_rejects_stale_status_precondition_without_rewriting_manifest(self) -> None:
        trusted_plan = self._trusted_plan()
        running_status = RenderTaskStatus(
            task_id="render_instagram_reel",
            state="running",
            renderer_adapter="dry-run-local",
            attempts=1,
            updated_at="2026-05-07T13:20:00Z",
        )
        succeeded_status = RenderTaskStatus(
            task_id="render_instagram_reel",
            state="succeeded",
            renderer_adapter="dry-run-local",
            attempts=1,
            output_checksums=(
                OutputChecksum(
                    path="deliverables/instagram_reel.mp4",
                    sha256="b" * 64,
                ),
            ),
            updated_at="2026-05-07T13:21:00Z",
        )

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            manifest = RenderStatusManifest(
                shoot_slug="status-contract",
                render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
                task_statuses=(running_status, RenderTaskStatus(task_id="render_instagram_carousel", state="pending")),
            )
            write_render_status_manifest(manifest, workspace, trusted_plan=trusted_plan)

            with self.assertRaisesRegex(RenderStatusError, "precondition"):
                compare_and_write_render_task_status(
                    workspace,
                    trusted_plan=trusted_plan,
                    updated_status=succeeded_status,
                    expected_state="pending",
                    expected_attempts=0,
                )
            loaded_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(loaded_manifest, manifest)

    def test_rejects_stale_attempt_precondition_without_rewriting_manifest(self) -> None:
        trusted_plan = self._trusted_plan()
        retryable_status = RenderTaskStatus(
            task_id="render_instagram_reel",
            state="retryable",
            renderer_adapter="dry-run-local",
            attempts=1,
            error_message="Renderer interrupted before writing outputs.",
            updated_at="2026-05-07T13:20:00Z",
        )
        next_running_status = RenderTaskStatus(
            task_id="render_instagram_reel",
            state="running",
            renderer_adapter="dry-run-local",
            attempts=2,
            updated_at="2026-05-07T13:21:00Z",
        )

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            manifest = RenderStatusManifest(
                shoot_slug="status-contract",
                render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
                task_statuses=(
                    retryable_status,
                    RenderTaskStatus(task_id="render_instagram_carousel", state="pending"),
                ),
            )
            write_render_status_manifest(manifest, workspace, trusted_plan=trusted_plan)

            with self.assertRaisesRegex(RenderStatusError, "precondition"):
                compare_and_write_render_task_status(
                    workspace,
                    trusted_plan=trusted_plan,
                    updated_status=next_running_status,
                    expected_state="retryable",
                    expected_attempts=0,
                )
            loaded_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(loaded_manifest, manifest)

    def test_serializes_concurrent_status_updates_for_the_same_task(self) -> None:
        trusted_plan = self._trusted_plan()
        original_write_manifest_text = render_status_module._write_manifest_text
        first_write_started = threading.Event()
        release_first_write = threading.Event()
        results: list[str] = []
        errors: list[tuple[str, Exception]] = []
        result_lock = threading.Lock()

        def delayed_first_write(manifest_path: Path, *, root: Path, content: str) -> None:
            if threading.current_thread().name == "first-render-worker":
                first_write_started.set()
                if not release_first_write.wait(timeout=5):
                    raise AssertionError("timed out waiting to release first render worker")
            original_write_manifest_text(manifest_path, root=root, content=content)

        def update_status(worker_name: str, timestamp: str) -> None:
            try:
                compare_and_write_render_task_status(
                    workspace,
                    trusted_plan=trusted_plan,
                    updated_status=RenderTaskStatus(
                        task_id="render_instagram_reel",
                        state="running",
                        renderer_adapter="dry-run-local",
                        attempts=1,
                        updated_at=timestamp,
                    ),
                    expected_state="pending",
                    expected_attempts=0,
                )
            except Exception as exc:  # noqa: BLE001 - test captures thread failures.
                with result_lock:
                    errors.append((worker_name, exc))
                return
            with result_lock:
                results.append(worker_name)

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            write_render_status_manifest(
                build_initial_render_status_manifest(trusted_plan),
                workspace,
                trusted_plan=trusted_plan,
            )

            render_status_module._write_manifest_text = delayed_first_write
            try:
                first_worker = threading.Thread(
                    target=update_status,
                    args=("first", "2026-05-07T13:30:00Z"),
                    name="first-render-worker",
                )
                second_worker = threading.Thread(
                    target=update_status,
                    args=("second", "2026-05-07T13:31:00Z"),
                    name="second-render-worker",
                )
                first_worker.start()
                self.assertTrue(first_write_started.wait(timeout=5))
                second_worker.start()
                release_first_write.set()
                first_worker.join(timeout=5)
                second_worker.join(timeout=5)
            finally:
                render_status_module._write_manifest_text = original_write_manifest_text
            loaded_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertFalse(first_worker.is_alive())
        self.assertFalse(second_worker.is_alive())
        self.assertEqual(results, ["first"])
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0][0], "second")
        self.assertIsInstance(errors[0][1], RenderStatusError)
        self.assertIn("precondition", str(errors[0][1]))
        self.assertEqual(loaded_manifest.task_statuses[0].updated_at, "2026-05-07T13:30:00Z")

    def test_rejects_unknown_task_status_update(self) -> None:
        trusted_plan = self._trusted_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            write_render_status_manifest(
                build_initial_render_status_manifest(trusted_plan),
                workspace,
                trusted_plan=trusted_plan,
            )

            with self.assertRaisesRegex(RenderStatusError, "unknown render task"):
                compare_and_write_render_task_status(
                    workspace,
                    trusted_plan=trusted_plan,
                    updated_status=RenderTaskStatus(task_id="render_unknown_task", state="pending"),
                    expected_state="pending",
                    expected_attempts=0,
                )

    def test_rejects_stale_manifest_fingerprint_before_status_update(self) -> None:
        trusted_plan = self._trusted_plan()
        stale_plan = replace(
            trusted_plan,
            render_tasks=(
                replace(
                    trusted_plan.render_tasks[0],
                    inputs=(
                        "analysis/instagram_storylines.json",
                        "graded/grade_asset_00099/STALE.MOV",
                    ),
                    depends_on=("rank_instagram_storylines", "grade_asset_00099"),
                ),
            )
            + trusted_plan.render_tasks[1:],
        )

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            write_render_status_manifest(
                build_initial_render_status_manifest(stale_plan),
                workspace,
                trusted_plan=stale_plan,
            )

            with self.assertRaisesRegex(RenderStatusError, "render plan fingerprint"):
                compare_and_write_render_task_status(
                    workspace,
                    trusted_plan=trusted_plan,
                    updated_status=RenderTaskStatus(
                        task_id="render_instagram_reel",
                        state="running",
                        renderer_adapter="dry-run-local",
                        attempts=1,
                        updated_at="2026-05-07T13:20:00Z",
                    ),
                    expected_state="pending",
                    expected_attempts=0,
                )

    def test_status_update_uses_safe_writer_for_stale_temp_manifest_paths(self) -> None:
        trusted_plan = self._trusted_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            initial_manifest = build_initial_render_status_manifest(trusted_plan)
            write_render_status_manifest(initial_manifest, workspace, trusted_plan=trusted_plan)
            manifest_path = workspace / RENDER_STATUS_MANIFEST_PATH
            manifest_path.with_suffix(".json.tmp").write_text("stale", encoding="utf-8")

            with self.assertRaisesRegex(RenderStatusError, "stale temporary render status manifest"):
                compare_and_write_render_task_status(
                    workspace,
                    trusted_plan=trusted_plan,
                    updated_status=RenderTaskStatus(
                        task_id="render_instagram_reel",
                        state="running",
                        renderer_adapter="dry-run-local",
                        attempts=1,
                        updated_at="2026-05-07T13:20:00Z",
                    ),
                    expected_state="pending",
                    expected_attempts=0,
                )
            loaded_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(loaded_manifest, initial_manifest)

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
