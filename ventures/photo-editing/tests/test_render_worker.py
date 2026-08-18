from dataclasses import replace
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from shootflow.assembly import AssemblyPlan, RenderTask
from shootflow.render_status import (
    OutputChecksum,
    RenderStatusManifest,
    RenderStatusPreconditionError,
    RenderTaskStatus,
    compare_and_write_render_task_status,
    load_render_status_manifest,
    render_plan_fingerprint,
    write_render_status_manifest,
)
from shootflow.render_worker import (
    ExpiredRenderLease,
    RenderLeaseExpirationPlan,
    RenderWorkerError,
    claim_render_worker_action,
    plan_render_worker_actions,
    plan_stale_render_leases,
    persist_stale_render_leases,
    report_render_worker_failure,
    report_render_worker_retryable,
    report_render_worker_success,
)


class RenderWorkerPlanningTests(unittest.TestCase):
    def test_schedules_pending_and_retryable_tasks_with_completed_dependencies(self) -> None:
        trusted_plan = self._trusted_plan()
        manifest = RenderStatusManifest(
            shoot_slug="worker-contract",
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
            task_statuses=(
                RenderTaskStatus(task_id="render_instagram_reel", state="pending"),
                RenderTaskStatus(
                    task_id="render_instagram_carousel",
                    state="succeeded",
                    renderer_adapter="core-image-local",
                    attempts=1,
                    output_checksums=(
                        OutputChecksum(
                            path="deliverables/instagram_carousel/slide_00001.jpg",
                            sha256="a" * 64,
                        ),
                    ),
                    updated_at="2026-05-07T10:10:00Z",
                ),
                RenderTaskStatus(
                    task_id="export_instagram_photo_set_part_00001",
                    state="retryable",
                    renderer_adapter="ffmpeg-local",
                    attempts=2,
                    error_message="Worker interrupted after temp output cleanup.",
                    updated_at="2026-05-07T10:11:00Z",
                ),
                RenderTaskStatus(
                    task_id="render_instagram_reel_variant_fast_cut",
                    state="running",
                    renderer_adapter="ffmpeg-local",
                    attempts=1,
                    updated_at="2026-05-07T10:12:00Z",
                ),
            ),
        )

        action_plan = plan_render_worker_actions(
            trusted_plan,
            manifest,
            completed_dependency_ids={
                "rank_instagram_storylines",
                "grade_asset_00000",
                "grade_asset_00001",
                "grade_asset_00002",
            },
            renderer_adapter="dry-run-local",
        )

        self.assertEqual(action_plan.shoot_slug, "worker-contract")
        self.assertEqual(action_plan.renderer_adapter, "dry-run-local")
        self.assertEqual(action_plan.blocked_tasks, ())
        self.assertEqual([action.task_id for action in action_plan.actions], [
            "render_instagram_reel",
            "export_instagram_photo_set_part_00001",
        ])
        reel_action, retry_action = action_plan.actions
        self.assertEqual(reel_action.attempt_number, 1)
        self.assertEqual(reel_action.inputs, (
            "analysis/instagram_storylines.json",
            "graded/grade_asset_00000/A001.MOV",
        ))
        self.assertEqual(reel_action.outputs, ("deliverables/instagram_reel.mp4",))
        self.assertEqual(retry_action.attempt_number, 3)
        self.assertTrue(retry_action.can_run_in_parallel)

    def test_reports_dependency_blocked_tasks_without_scheduling_them(self) -> None:
        trusted_plan = self._trusted_plan()
        manifest = RenderStatusManifest(
            shoot_slug="worker-contract",
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
            task_statuses=(
                RenderTaskStatus(task_id="render_instagram_reel", state="pending"),
                RenderTaskStatus(task_id="render_instagram_carousel", state="pending"),
                RenderTaskStatus(task_id="export_instagram_photo_set_part_00001", state="pending"),
                RenderTaskStatus(task_id="render_instagram_reel_variant_fast_cut", state="pending"),
            ),
        )

        action_plan = plan_render_worker_actions(
            trusted_plan,
            manifest,
            completed_dependency_ids={
                "rank_instagram_storylines",
                "grade_asset_00000",
            },
            renderer_adapter="dry-run-local",
        )

        self.assertEqual([action.task_id for action in action_plan.actions], ["render_instagram_reel"])
        self.assertEqual(
            [(blocked.task_id, blocked.missing_dependencies) for blocked in action_plan.blocked_tasks],
            [
                ("render_instagram_carousel", ("grade_asset_00001",)),
                ("export_instagram_photo_set_part_00001", ("grade_asset_00002",)),
                ("render_instagram_reel_variant_fast_cut", ("grade_asset_00002",)),
            ],
        )

    def test_rejects_in_memory_plans_with_source_media_inputs_before_scheduling(self) -> None:
        trusted_plan = self._trusted_plan()
        unsafe_task = replace(
            trusted_plan.render_tasks[0],
            inputs=("source/DCIM/A001.MOV",),
            depends_on=("rank_instagram_storylines",),
        )
        unsafe_plan = replace(
            trusted_plan,
            render_tasks=(unsafe_task,) + trusted_plan.render_tasks[1:],
        )
        manifest = RenderStatusManifest(
            shoot_slug="worker-contract",
            render_plan_fingerprint=self._legacy_fingerprint_for_unsafe_plan(unsafe_plan),
            task_statuses=tuple(
                RenderTaskStatus(task_id=task.task_id, state="pending")
                for task in unsafe_plan.render_tasks
            ),
        )

        with self.assertRaisesRegex(RenderWorkerError, "status manifest"):
            plan_render_worker_actions(
                unsafe_plan,
                manifest,
                completed_dependency_ids={"rank_instagram_storylines"},
                renderer_adapter="dry-run-local",
            )

    def test_rejects_stale_status_manifest_before_planning_actions(self) -> None:
        trusted_plan = self._trusted_plan()
        stale_plan = replace(
            trusted_plan,
            render_tasks=(
                replace(
                    trusted_plan.render_tasks[0],
                    inputs=(
                        "analysis/instagram_storylines.json",
                        "graded/grade_asset_99999/STALE.MOV",
                    ),
                    depends_on=("rank_instagram_storylines", "grade_asset_99999"),
                ),
            )
            + trusted_plan.render_tasks[1:],
        )
        stale_manifest = RenderStatusManifest(
            shoot_slug="worker-contract",
            render_plan_fingerprint=render_plan_fingerprint(stale_plan),
            task_statuses=tuple(
                RenderTaskStatus(task_id=task.task_id, state="pending")
                for task in trusted_plan.render_tasks
            ),
        )

        with self.assertRaisesRegex(RenderWorkerError, "status manifest"):
            plan_render_worker_actions(
                trusted_plan,
                stale_manifest,
                completed_dependency_ids={"rank_instagram_storylines", "grade_asset_00000"},
                renderer_adapter="dry-run-local",
            )

    def test_rejects_invalid_renderer_adapter_names(self) -> None:
        trusted_plan = self._trusted_plan()
        manifest = RenderStatusManifest(
            shoot_slug="worker-contract",
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
            task_statuses=tuple(
                RenderTaskStatus(task_id=task.task_id, state="pending")
                for task in trusted_plan.render_tasks
            ),
        )

        with self.assertRaisesRegex(RenderWorkerError, "renderer adapter"):
            plan_render_worker_actions(
                trusted_plan,
                manifest,
                completed_dependency_ids={"rank_instagram_storylines", "grade_asset_00000"},
                renderer_adapter="../ffmpeg",
            )

    def test_plans_expired_running_leases_as_retryable_transitions(self) -> None:
        trusted_plan = self._trusted_plan()
        manifest = RenderStatusManifest(
            shoot_slug="worker-contract",
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
            task_statuses=(
                RenderTaskStatus(task_id="render_instagram_reel", state="pending"),
                RenderTaskStatus(
                    task_id="render_instagram_carousel",
                    state="running",
                    renderer_adapter="core-image-local",
                    attempts=1,
                    updated_at="2026-05-07T11:00:00Z",
                ),
                RenderTaskStatus(
                    task_id="export_instagram_photo_set_part_00001",
                    state="running",
                    renderer_adapter="ffmpeg-local",
                    attempts=2,
                    updated_at="2026-05-07T11:45:00Z",
                ),
                RenderTaskStatus(
                    task_id="render_instagram_reel_variant_fast_cut",
                    state="retryable",
                    renderer_adapter="dry-run-local",
                    attempts=1,
                    error_message="Previous adapter failure.",
                    updated_at="2026-05-07T11:30:00Z",
                ),
            ),
        )

        expiration_plan = plan_stale_render_leases(
            trusted_plan,
            manifest,
            stale_before="2026-05-07T11:30:00Z",
            updated_at="2026-05-07T12:00:00Z",
        )

        expected_retryable_status = RenderTaskStatus(
            task_id="render_instagram_carousel",
            state="retryable",
            renderer_adapter="core-image-local",
            attempts=1,
            error_message=(
                "Render worker lease expired after running since 2026-05-07T11:00:00Z; "
                "no source, graded, or deliverable files were deleted or cleaned up."
            ),
            updated_at="2026-05-07T12:00:00Z",
        )
        self.assertEqual(
            expiration_plan,
            RenderLeaseExpirationPlan(
                shoot_slug="worker-contract",
                stale_before="2026-05-07T11:30:00Z",
                updated_at="2026-05-07T12:00:00Z",
                expired_leases=(
                    ExpiredRenderLease(
                        task_id="render_instagram_carousel",
                        renderer_adapter="core-image-local",
                        attempt_number=1,
                        running_since="2026-05-07T11:00:00Z",
                        retryable_status=expected_retryable_status,
                    ),
                ),
            ),
        )

    def test_does_not_expire_running_lease_at_exact_cutoff(self) -> None:
        trusted_plan = self._trusted_plan()
        manifest = RenderStatusManifest(
            shoot_slug="worker-contract",
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
            task_statuses=(
                RenderTaskStatus(task_id="render_instagram_reel", state="pending"),
                RenderTaskStatus(
                    task_id="render_instagram_carousel",
                    state="running",
                    renderer_adapter="core-image-local",
                    attempts=1,
                    updated_at="2026-05-07T11:30:00Z",
                ),
                RenderTaskStatus(task_id="export_instagram_photo_set_part_00001", state="pending"),
                RenderTaskStatus(task_id="render_instagram_reel_variant_fast_cut", state="pending"),
            ),
        )

        expiration_plan = plan_stale_render_leases(
            trusted_plan,
            manifest,
            stale_before="2026-05-07T11:30:00Z",
            updated_at="2026-05-07T12:00:00Z",
        )

        self.assertEqual(expiration_plan.expired_leases, ())

    def test_rejects_invalid_lease_cutoff_timestamps(self) -> None:
        trusted_plan = self._trusted_plan()
        manifest = RenderStatusManifest(
            shoot_slug="worker-contract",
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
            task_statuses=tuple(
                RenderTaskStatus(task_id=task.task_id, state="pending")
                for task in trusted_plan.render_tasks
            ),
        )

        with self.assertRaisesRegex(RenderWorkerError, "timestamp"):
            plan_stale_render_leases(
                trusted_plan,
                manifest,
                stale_before="2026-05-07 11:30",
                updated_at="2026-05-07T12:00:00Z",
            )

    def test_rejects_stale_status_manifest_before_planning_lease_expiration(self) -> None:
        trusted_plan = self._trusted_plan()
        stale_manifest = RenderStatusManifest(
            shoot_slug="worker-contract",
            render_plan_fingerprint="0" * 64,
            task_statuses=tuple(
                RenderTaskStatus(task_id=task.task_id, state="pending")
                for task in trusted_plan.render_tasks
            ),
        )

        with self.assertRaisesRegex(RenderWorkerError, "status manifest"):
            plan_stale_render_leases(
                trusted_plan,
                stale_manifest,
                stale_before="2026-05-07T11:30:00Z",
                updated_at="2026-05-07T12:00:00Z",
            )

    def test_stale_lease_persistence_rejects_same_attempt_heartbeat_refresh(self) -> None:
        trusted_plan = self._trusted_plan()
        stale_running_status = RenderTaskStatus(
            task_id="render_instagram_carousel",
            state="running",
            renderer_adapter="core-image-local",
            attempts=1,
            updated_at="2026-05-07T11:00:00Z",
        )
        planned_manifest = RenderStatusManifest(
            shoot_slug="worker-contract",
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
            task_statuses=(
                RenderTaskStatus(task_id="render_instagram_reel", state="pending"),
                stale_running_status,
                RenderTaskStatus(task_id="export_instagram_photo_set_part_00001", state="pending"),
                RenderTaskStatus(task_id="render_instagram_reel_variant_fast_cut", state="pending"),
            ),
        )
        expiration_plan = plan_stale_render_leases(
            trusted_plan,
            planned_manifest,
            stale_before="2026-05-07T11:30:00Z",
            updated_at="2026-05-07T12:00:00Z",
        )
        expired_lease = expiration_plan.expired_leases[0]
        refreshed_manifest = RenderStatusManifest(
            shoot_slug="worker-contract",
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
            task_statuses=(
                RenderTaskStatus(task_id="render_instagram_reel", state="pending"),
                RenderTaskStatus(
                    task_id="render_instagram_carousel",
                    state="running",
                    renderer_adapter="core-image-local",
                    attempts=1,
                    updated_at="2026-05-07T11:45:00Z",
                ),
                RenderTaskStatus(task_id="export_instagram_photo_set_part_00001", state="pending"),
                RenderTaskStatus(task_id="render_instagram_reel_variant_fast_cut", state="pending"),
            ),
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_render_status_manifest(refreshed_manifest, workspace, trusted_plan=trusted_plan)

            with self.assertRaisesRegex(RenderStatusPreconditionError, "precondition"):
                compare_and_write_render_task_status(
                    workspace,
                    trusted_plan=trusted_plan,
                    updated_status=expired_lease.retryable_status,
                    expected_state="running",
                    expected_attempts=expired_lease.attempt_number,
                    expected_updated_at=expired_lease.running_since,
                )
            loaded_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(loaded_manifest, refreshed_manifest)

    def test_persists_stale_render_leases_with_lease_preconditions(self) -> None:
        trusted_plan = self._trusted_plan()
        running_manifest = RenderStatusManifest(
            shoot_slug="worker-contract",
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
            task_statuses=(
                RenderTaskStatus(task_id="render_instagram_reel", state="pending"),
                RenderTaskStatus(
                    task_id="render_instagram_carousel",
                    state="running",
                    renderer_adapter="core-image-local",
                    attempts=1,
                    updated_at="2026-05-07T11:00:00Z",
                ),
                RenderTaskStatus(
                    task_id="export_instagram_photo_set_part_00001",
                    state="running",
                    renderer_adapter="ffmpeg-local",
                    attempts=2,
                    updated_at="2026-05-07T11:10:00Z",
                ),
                RenderTaskStatus(task_id="render_instagram_reel_variant_fast_cut", state="pending"),
            ),
        )
        expiration_plan = plan_stale_render_leases(
            trusted_plan,
            running_manifest,
            stale_before="2026-05-07T11:30:00Z",
            updated_at="2026-05-07T12:00:00Z",
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_render_status_manifest(running_manifest, workspace, trusted_plan=trusted_plan)

            persistence_result = persist_stale_render_leases(
                workspace,
                trusted_plan=trusted_plan,
                expiration_plan=expiration_plan,
            )
            loaded_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(
            [persisted.task_id for persisted in persistence_result.persisted_leases],
            ["render_instagram_carousel", "export_instagram_photo_set_part_00001"],
        )
        self.assertEqual(persistence_result.conflicted_leases, ())
        self.assertEqual(
            [status.state for status in loaded_manifest.task_statuses],
            ["pending", "retryable", "retryable", "pending"],
        )
        for status in loaded_manifest.task_statuses[1:3]:
            self.assertIn("no source, graded, or deliverable files were deleted", status.error_message or "")
            self.assertEqual(status.updated_at, "2026-05-07T12:00:00Z")

    def test_reports_stale_lease_persistence_conflicts_without_clobbering(self) -> None:
        trusted_plan = self._trusted_plan()
        stale_running_status = RenderTaskStatus(
            task_id="render_instagram_carousel",
            state="running",
            renderer_adapter="core-image-local",
            attempts=1,
            updated_at="2026-05-07T11:00:00Z",
        )
        planned_manifest = RenderStatusManifest(
            shoot_slug="worker-contract",
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
            task_statuses=(
                RenderTaskStatus(task_id="render_instagram_reel", state="pending"),
                stale_running_status,
                RenderTaskStatus(task_id="export_instagram_photo_set_part_00001", state="pending"),
                RenderTaskStatus(task_id="render_instagram_reel_variant_fast_cut", state="pending"),
            ),
        )
        expiration_plan = plan_stale_render_leases(
            trusted_plan,
            planned_manifest,
            stale_before="2026-05-07T11:30:00Z",
            updated_at="2026-05-07T12:00:00Z",
        )
        refreshed_manifest = RenderStatusManifest(
            shoot_slug="worker-contract",
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
            task_statuses=(
                RenderTaskStatus(task_id="render_instagram_reel", state="pending"),
                RenderTaskStatus(
                    task_id="render_instagram_carousel",
                    state="running",
                    renderer_adapter="core-image-local",
                    attempts=1,
                    updated_at="2026-05-07T11:45:00Z",
                ),
                RenderTaskStatus(task_id="export_instagram_photo_set_part_00001", state="pending"),
                RenderTaskStatus(task_id="render_instagram_reel_variant_fast_cut", state="pending"),
            ),
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_render_status_manifest(refreshed_manifest, workspace, trusted_plan=trusted_plan)

            persistence_result = persist_stale_render_leases(
                workspace,
                trusted_plan=trusted_plan,
                expiration_plan=expiration_plan,
            )
            loaded_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(persistence_result.persisted_leases, ())
        self.assertEqual(len(persistence_result.conflicted_leases), 1)
        conflict = persistence_result.conflicted_leases[0]
        self.assertEqual(conflict.task_id, "render_instagram_carousel")
        self.assertIn("another worker already changed this task", conflict.error_message)
        self.assertIn("no source, graded, or deliverable files were deleted", conflict.error_message)
        self.assertEqual(loaded_manifest, refreshed_manifest)

    def test_rejects_forged_expiration_plan_for_fresh_running_lease(self) -> None:
        trusted_plan = self._trusted_plan()
        fresh_running_status = RenderTaskStatus(
            task_id="render_instagram_carousel",
            state="running",
            renderer_adapter="core-image-local",
            attempts=1,
            updated_at="2026-05-07T11:45:00Z",
        )
        running_manifest = RenderStatusManifest(
            shoot_slug="worker-contract",
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
            task_statuses=(
                RenderTaskStatus(task_id="render_instagram_reel", state="pending"),
                fresh_running_status,
                RenderTaskStatus(task_id="export_instagram_photo_set_part_00001", state="pending"),
                RenderTaskStatus(task_id="render_instagram_reel_variant_fast_cut", state="pending"),
            ),
        )
        forged_plan = RenderLeaseExpirationPlan(
            shoot_slug="worker-contract",
            stale_before="2026-05-07T11:30:00Z",
            updated_at="2026-05-07T12:00:00Z",
            expired_leases=(
                ExpiredRenderLease(
                    task_id="render_instagram_carousel",
                    renderer_adapter="core-image-local",
                    attempt_number=1,
                    running_since="2026-05-07T11:45:00Z",
                    retryable_status=RenderTaskStatus(
                        task_id="render_instagram_carousel",
                        state="retryable",
                        renderer_adapter="core-image-local",
                        attempts=1,
                        error_message=(
                            "Render worker lease expired after running since 2026-05-07T11:45:00Z; "
                            "no source, graded, or deliverable files were deleted or cleaned up."
                        ),
                        updated_at="2026-05-07T12:00:00Z",
                    ),
                ),
            ),
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_render_status_manifest(running_manifest, workspace, trusted_plan=trusted_plan)

            with self.assertRaisesRegex(RenderWorkerError, "stale_before"):
                persist_stale_render_leases(
                    workspace,
                    trusted_plan=trusted_plan,
                    expiration_plan=forged_plan,
                )
            loaded_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(loaded_manifest, running_manifest)

    def test_rejects_expiration_plan_with_forged_retryable_status_content(self) -> None:
        trusted_plan = self._trusted_plan()
        stale_running_status = RenderTaskStatus(
            task_id="render_instagram_carousel",
            state="running",
            renderer_adapter="core-image-local",
            attempts=1,
            updated_at="2026-05-07T11:00:00Z",
        )
        running_manifest = RenderStatusManifest(
            shoot_slug="worker-contract",
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
            task_statuses=(
                RenderTaskStatus(task_id="render_instagram_reel", state="pending"),
                stale_running_status,
                RenderTaskStatus(task_id="export_instagram_photo_set_part_00001", state="pending"),
                RenderTaskStatus(task_id="render_instagram_reel_variant_fast_cut", state="pending"),
            ),
        )
        expiration_plan = plan_stale_render_leases(
            trusted_plan,
            running_manifest,
            stale_before="2026-05-07T11:30:00Z",
            updated_at="2026-05-07T12:00:00Z",
        )
        forged_plan = replace(
            expiration_plan,
            expired_leases=(
                replace(
                    expiration_plan.expired_leases[0],
                    retryable_status=replace(
                        expiration_plan.expired_leases[0].retryable_status,
                        error_message="delete temp outputs before retrying",
                    ),
                ),
            ),
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_render_status_manifest(running_manifest, workspace, trusted_plan=trusted_plan)

            with self.assertRaisesRegex(RenderWorkerError, "retryable status"):
                persist_stale_render_leases(
                    workspace,
                    trusted_plan=trusted_plan,
                    expiration_plan=forged_plan,
                )
            loaded_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(loaded_manifest, running_manifest)

    def test_persists_mixed_stale_lease_successes_and_conflicts(self) -> None:
        trusted_plan = self._trusted_plan()
        planned_manifest = RenderStatusManifest(
            shoot_slug="worker-contract",
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
            task_statuses=(
                RenderTaskStatus(task_id="render_instagram_reel", state="pending"),
                RenderTaskStatus(
                    task_id="render_instagram_carousel",
                    state="running",
                    renderer_adapter="core-image-local",
                    attempts=1,
                    updated_at="2026-05-07T11:00:00Z",
                ),
                RenderTaskStatus(
                    task_id="export_instagram_photo_set_part_00001",
                    state="running",
                    renderer_adapter="ffmpeg-local",
                    attempts=2,
                    updated_at="2026-05-07T11:10:00Z",
                ),
                RenderTaskStatus(task_id="render_instagram_reel_variant_fast_cut", state="pending"),
            ),
        )
        expiration_plan = plan_stale_render_leases(
            trusted_plan,
            planned_manifest,
            stale_before="2026-05-07T11:30:00Z",
            updated_at="2026-05-07T12:00:00Z",
        )
        partially_refreshed_manifest = RenderStatusManifest(
            shoot_slug="worker-contract",
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
            task_statuses=(
                RenderTaskStatus(task_id="render_instagram_reel", state="pending"),
                planned_manifest.task_statuses[1],
                RenderTaskStatus(
                    task_id="export_instagram_photo_set_part_00001",
                    state="running",
                    renderer_adapter="ffmpeg-local",
                    attempts=2,
                    updated_at="2026-05-07T11:45:00Z",
                ),
                RenderTaskStatus(task_id="render_instagram_reel_variant_fast_cut", state="pending"),
            ),
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            write_render_status_manifest(partially_refreshed_manifest, workspace, trusted_plan=trusted_plan)

            persistence_result = persist_stale_render_leases(
                workspace,
                trusted_plan=trusted_plan,
                expiration_plan=expiration_plan,
            )
            loaded_manifest = load_render_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(
            [persisted.task_id for persisted in persistence_result.persisted_leases],
            ["render_instagram_carousel"],
        )
        self.assertEqual(
            [conflict.task_id for conflict in persistence_result.conflicted_leases],
            ["export_instagram_photo_set_part_00001"],
        )
        self.assertEqual(loaded_manifest.task_statuses[1].state, "retryable")
        self.assertEqual(loaded_manifest.task_statuses[2], partially_refreshed_manifest.task_statuses[2])

    def test_missing_status_manifest_is_not_reported_as_lease_conflict(self) -> None:
        trusted_plan = self._trusted_plan()
        planned_manifest = RenderStatusManifest(
            shoot_slug="worker-contract",
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
            task_statuses=(
                RenderTaskStatus(task_id="render_instagram_reel", state="pending"),
                RenderTaskStatus(
                    task_id="render_instagram_carousel",
                    state="running",
                    renderer_adapter="core-image-local",
                    attempts=1,
                    updated_at="2026-05-07T11:00:00Z",
                ),
                RenderTaskStatus(task_id="export_instagram_photo_set_part_00001", state="pending"),
                RenderTaskStatus(task_id="render_instagram_reel_variant_fast_cut", state="pending"),
            ),
        )
        expiration_plan = plan_stale_render_leases(
            trusted_plan,
            planned_manifest,
            stale_before="2026-05-07T11:30:00Z",
            updated_at="2026-05-07T12:00:00Z",
        )

        with tempfile.TemporaryDirectory(prefix="precondition failed-") as tmpdir:
            with self.assertRaisesRegex(RenderWorkerError, "untrusted status state"):
                persist_stale_render_leases(
                    Path(tmpdir),
                    trusted_plan=trusted_plan,
                    expiration_plan=expiration_plan,
                )

    def test_claims_ready_action_as_running_status(self) -> None:
        action = self._ready_action()
        status = RenderTaskStatus(task_id="render_instagram_reel", state="pending")

        running_status = claim_render_worker_action(
            status,
            action,
            updated_at="2026-05-07T11:20:00Z",
        )

        self.assertEqual(
            running_status,
            RenderTaskStatus(
                task_id="render_instagram_reel",
                state="running",
                renderer_adapter="dry-run-local",
                attempts=1,
                updated_at="2026-05-07T11:20:00Z",
            ),
        )

    def test_rejects_stale_worker_claim_attempts(self) -> None:
        action = self._ready_action()
        stale_status = RenderTaskStatus(
            task_id="render_instagram_reel",
            state="running",
            renderer_adapter="dry-run-local",
            attempts=1,
            updated_at="2026-05-07T11:19:00Z",
        )

        with self.assertRaisesRegex(RenderWorkerError, "current status"):
            claim_render_worker_action(
                stale_status,
                action,
                updated_at="2026-05-07T11:20:00Z",
            )

    def test_reports_success_with_checksums_for_declared_outputs(self) -> None:
        action = self._ready_action()
        current_status = RenderTaskStatus(
            task_id="render_instagram_reel",
            state="running",
            renderer_adapter="dry-run-local",
            attempts=1,
            updated_at="2026-05-07T11:20:00Z",
        )
        with tempfile.TemporaryDirectory() as tmpdir:
            output_path = Path(tmpdir) / "deliverables" / "instagram_reel.mp4"
            output_path.parent.mkdir(parents=True)
            output_bytes = b"rendered reel bytes"
            output_path.write_bytes(output_bytes)

            succeeded_status = report_render_worker_success(
                current_status,
                action,
                tmpdir,
                updated_at="2026-05-07T11:21:00Z",
            )

        self.assertEqual(succeeded_status.task_id, "render_instagram_reel")
        self.assertEqual(succeeded_status.state, "succeeded")
        self.assertEqual(succeeded_status.renderer_adapter, "dry-run-local")
        self.assertEqual(succeeded_status.attempts, 1)
        self.assertEqual(succeeded_status.updated_at, "2026-05-07T11:21:00Z")
        self.assertEqual(
            succeeded_status.output_checksums,
            (
                OutputChecksum(
                    path="deliverables/instagram_reel.mp4",
                    sha256=hashlib.sha256(output_bytes).hexdigest(),
                ),
            ),
        )

    def test_rejects_success_when_declared_output_is_missing(self) -> None:
        action = self._ready_action()
        current_status = RenderTaskStatus(
            task_id="render_instagram_reel",
            state="running",
            renderer_adapter="dry-run-local",
            attempts=1,
            updated_at="2026-05-07T11:20:00Z",
        )
        with tempfile.TemporaryDirectory() as tmpdir:
            with self.assertRaisesRegex(RenderWorkerError, "output"):
                report_render_worker_success(
                    current_status,
                    action,
                    tmpdir,
                    updated_at="2026-05-07T11:21:00Z",
                )

    def test_rejects_success_when_output_is_a_symlink(self) -> None:
        action = self._ready_action()
        current_status = RenderTaskStatus(
            task_id="render_instagram_reel",
            state="running",
            renderer_adapter="dry-run-local",
            attempts=1,
            updated_at="2026-05-07T11:20:00Z",
        )
        with tempfile.TemporaryDirectory() as tmpdir:
            target_path = Path(tmpdir) / "rendered-reel.mp4"
            target_path.write_bytes(b"rendered reel bytes")
            output_path = Path(tmpdir) / "deliverables" / "instagram_reel.mp4"
            output_path.parent.mkdir(parents=True)
            output_path.symlink_to(target_path)

            with self.assertRaisesRegex(RenderWorkerError, "symlink"):
                report_render_worker_success(
                    current_status,
                    action,
                    tmpdir,
                    updated_at="2026-05-07T11:21:00Z",
                )

    def test_rejects_success_from_mismatched_running_status(self) -> None:
        action = self._ready_action()
        current_status = RenderTaskStatus(
            task_id="render_instagram_reel",
            state="running",
            renderer_adapter="different-adapter",
            attempts=1,
            updated_at="2026-05-07T11:20:00Z",
        )
        with tempfile.TemporaryDirectory() as tmpdir:
            output_path = Path(tmpdir) / "deliverables" / "instagram_reel.mp4"
            output_path.parent.mkdir(parents=True)
            output_path.write_bytes(b"rendered reel bytes")

            with self.assertRaisesRegex(RenderWorkerError, "renderer adapter"):
                report_render_worker_success(
                    current_status,
                    action,
                    tmpdir,
                    updated_at="2026-05-07T11:21:00Z",
                )

    def test_reports_retryable_and_failed_statuses_from_running_action(self) -> None:
        action = self._ready_action()
        current_status = RenderTaskStatus(
            task_id="render_instagram_reel",
            state="running",
            renderer_adapter="dry-run-local",
            attempts=1,
            updated_at="2026-05-07T11:20:00Z",
        )

        retryable_status = report_render_worker_retryable(
            current_status,
            action,
            error_message="Renderer lost the temporary output before checksum.",
            updated_at="2026-05-07T11:22:00Z",
        )
        failed_status = report_render_worker_failure(
            current_status,
            action,
            error_message="Unsupported codec for the selected local adapter.",
            updated_at="2026-05-07T11:23:00Z",
        )

        self.assertEqual(retryable_status.state, "retryable")
        self.assertEqual(failed_status.state, "failed")
        self.assertEqual(retryable_status.attempts, 1)
        self.assertEqual(failed_status.attempts, 1)
        self.assertEqual(retryable_status.renderer_adapter, "dry-run-local")
        self.assertEqual(failed_status.renderer_adapter, "dry-run-local")

    def test_rejects_retryable_from_non_running_status(self) -> None:
        action = self._ready_action()
        current_status = RenderTaskStatus(task_id="render_instagram_reel", state="pending")

        with self.assertRaisesRegex(RenderWorkerError, "running"):
            report_render_worker_retryable(
                current_status,
                action,
                error_message="Renderer lost the temporary output before checksum.",
                updated_at="2026-05-07T11:22:00Z",
            )

    def _trusted_plan(self) -> AssemblyPlan:
        return AssemblyPlan(
            shoot_slug="worker-contract",
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
                RenderTask(
                    task_id="export_instagram_photo_set_part_00001",
                    sequence_name="photo_set",
                    source_job_id="export_instagram_photo_set",
                    output_kind="instagram_photo_set",
                    aspect_ratio="4:5",
                    inputs=(
                        "analysis/instagram_storylines.json",
                        "graded/grade_asset_00002/IMG_0002.CR3",
                    ),
                    outputs=("deliverables/instagram_photo_set/photo_00001.jpg",),
                    depends_on=("rank_instagram_storylines", "grade_asset_00002"),
                    can_run_in_parallel=True,
                ),
                RenderTask(
                    task_id="render_instagram_reel_variant_fast_cut",
                    sequence_name="reel",
                    source_job_id="assemble_instagram_reel",
                    output_kind="instagram_reel",
                    aspect_ratio="9:16",
                    inputs=(
                        "analysis/instagram_storylines.json",
                        "graded/grade_asset_00002/A002.MOV",
                    ),
                    outputs=("deliverables/instagram_reels/fast_cut.mp4",),
                    depends_on=("rank_instagram_storylines", "grade_asset_00002"),
                    can_run_in_parallel=True,
                ),
            ),
        )

    def _legacy_fingerprint_for_unsafe_plan(self, plan: AssemblyPlan) -> str:
        fingerprint_input = {
            "shoot_slug": plan.shoot_slug,
            "render_tasks": [
                {
                    "task_id": task.task_id,
                    "sequence_name": task.sequence_name,
                    "source_job_id": task.source_job_id,
                    "output_kind": task.output_kind,
                    "aspect_ratio": task.aspect_ratio,
                    "inputs": list(task.inputs),
                    "outputs": list(task.outputs),
                    "depends_on": list(task.depends_on),
                    "can_run_in_parallel": task.can_run_in_parallel,
                }
                for task in plan.render_tasks
            ],
        }
        encoded = json.dumps(
            fingerprint_input,
            ensure_ascii=True,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()

    def _ready_action(self):
        trusted_plan = self._trusted_plan()
        manifest = RenderStatusManifest(
            shoot_slug="worker-contract",
            render_plan_fingerprint=render_plan_fingerprint(trusted_plan),
            task_statuses=tuple(
                RenderTaskStatus(task_id=task.task_id, state="pending")
                for task in trusted_plan.render_tasks
            ),
        )
        action_plan = plan_render_worker_actions(
            trusted_plan,
            manifest,
            completed_dependency_ids={
                "rank_instagram_storylines",
                "grade_asset_00000",
                "grade_asset_00001",
                "grade_asset_00002",
            },
            renderer_adapter="dry-run-local",
        )
        return action_plan.actions[0]


if __name__ == "__main__":
    unittest.main()
