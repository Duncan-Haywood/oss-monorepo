"""Unattended local run: ingested shoot -> proxies -> grades -> Instagram media.

``run_local_pipeline`` chains the existing trusted schedulers in stage order on
one machine, stamping each stage with the current UTC time, so a launchd job
(see ``launchd_plist_bytes``) can finish a shoot overnight with nobody at the
keyboard. It adds no new authority: every stage goes through the same status
manifests, compare/write leases, and adapters as the manual CLI flow, and it
stops at whatever needs a person (retryable or failed work) instead of
guessing.

Stage order and adapters:

1. ``ffmpeg-proxy-production-local``: small review/selection proxies.
2. ``analysis-production-local``, ``scene-production-local``,
   ``look-production-local``: the deterministic analysis, scene and look
   stand-ins. They are not taste-based yet, so the selection they feed is a
   placeholder until a real vision-model adapter replaces stage 2.
3. ``ffmpeg-grade-production-local``: full-resolution graded masters, with
   ``color/shoot_look.cube`` applied when present.
4. ``story-production-local``: storyline selection over the graded masters.
5. ``ffmpeg-local`` render: the reel MP4 and the 4:5 carousel/photo-set JPEGs.
"""

from __future__ import annotations

import plistlib
import sys
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from shootflow.assembly import (
    build_assembly_plan,
    ensure_render_tasks_manifest,
    load_trusted_render_tasks_manifest,
)
from shootflow.catalog import load_ingest_manifest, production_assets_from_manifest
from shootflow.production import build_production_plan
from shootflow.production_scheduler import (
    run_dry_run_production_scheduler,
    write_dry_run_production_scheduler_report,
)
from shootflow.production_status import (
    initialize_production_status_manifest,
    load_production_status_manifest,
)
from shootflow.render_scheduler import (
    run_dry_run_render_scheduler,
    write_dry_run_render_scheduler_report,
)
from shootflow.render_status import initialize_render_status_manifest, load_render_status_manifest

LOCAL_PRODUCTION_STAGES = (
    "ffmpeg-proxy-production-local",
    "analysis-production-local",
    "scene-production-local",
    "look-production-local",
    "ffmpeg-grade-production-local",
    "story-production-local",
)
LOCAL_RENDERER = "ffmpeg-local"
STORYLINE_JOB_ID = "rank_instagram_storylines"
LAUNCHD_LABEL_PREFIX = "dev.shootflow.local-pipeline"


class LocalPipelineError(ValueError):
    """Raised when the unattended run is configured incorrectly."""


@dataclass(frozen=True)
class LocalPipelineStage:
    adapter: str
    stopped_reason: str
    completed_ids: tuple[str, ...]
    retryable_ids: tuple[str, ...]
    failed_ids: tuple[str, ...]


@dataclass(frozen=True)
class LocalPipelineResult:
    shoot_slug: str
    workspace: Path
    stages: tuple[LocalPipelineStage, ...]
    rendered: bool
    needs_review_ids: tuple[str, ...]
    stopped_before_render_reason: str | None


def run_local_pipeline(
    ingest_manifest_path: Path | str,
    *,
    max_concurrency: int = 2,
    max_iterations: int = 10,
    stale_after: timedelta = timedelta(hours=6),
    retry_retryable: bool = False,
    clock: Callable[[], datetime] | None = None,
) -> LocalPipelineResult:
    """Advance one ingested shoot as far as it can go without a person.

    Running leases older than ``stale_after`` (a run killed by sleep or a
    power cut) are expired into retryable review states by the schedulers'
    own stale-lease path. Retryable production jobs are retried only when
    ``retry_retryable`` is set, matching the manual ``--retryable-job`` review
    step; leave it off until a shoot's failures have been looked at once.
    """

    if max_concurrency < 1:
        raise LocalPipelineError("max_concurrency must be at least 1")
    if max_iterations < 1:
        raise LocalPipelineError("max_iterations must be at least 1")
    if stale_after <= timedelta(0):
        raise LocalPipelineError("stale_after must be positive")
    now = clock or _utc_now

    manifest_path = Path(ingest_manifest_path)
    catalog = load_ingest_manifest(manifest_path)
    trusted_plan = build_production_plan(
        production_assets_from_manifest(catalog),
        shoot_slug=catalog.shoot_slug,
    )
    workspace = manifest_path.parent
    initialize_production_status_manifest(workspace, trusted_plan=trusted_plan)

    stages: list[LocalPipelineStage] = []
    for adapter in LOCAL_PRODUCTION_STAGES:
        started = now()
        timestamp = _timestamp(started)
        retryable_ids: tuple[str, ...] = ()
        if retry_retryable:
            manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
            retryable_ids = tuple(
                status.job_id for status in manifest.job_statuses if status.state == "retryable"
            )
        result = run_dry_run_production_scheduler(
            workspace,
            trusted_plan=trusted_plan,
            worker_adapter=adapter,
            started_at=timestamp,
            completed_at=timestamp,
            max_concurrency=max_concurrency,
            max_iterations=max_iterations,
            reviewed_retryable_job_ids=retryable_ids,
            stale_before=_timestamp(started - stale_after),
            lease_updated_at=timestamp,
        )
        write_dry_run_production_scheduler_report(
            result,
            workspace,
            trusted_plan=trusted_plan,
            final_manifest=load_production_status_manifest(workspace, trusted_plan=trusted_plan),
            generated_at=_timestamp(now()),
        )
        stages.append(
            LocalPipelineStage(
                adapter=adapter,
                stopped_reason=result.stopped_reason,
                completed_ids=result.completed_job_ids,
                retryable_ids=result.retryable_job_ids,
                failed_ids=result.failed_job_ids,
            )
        )

    production_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
    production_states = {status.job_id: status.state for status in production_manifest.job_statuses}
    needs_review = [
        job_id for job_id, state in production_states.items() if state in {"retryable", "failed"}
    ]
    if production_states.get(STORYLINE_JOB_ID) != "succeeded":
        return LocalPipelineResult(
            shoot_slug=catalog.shoot_slug,
            workspace=workspace,
            stages=tuple(stages),
            rendered=False,
            needs_review_ids=tuple(needs_review),
            stopped_before_render_reason=(
                "storyline selection has not succeeded; review the listed jobs, then rerun"
                if needs_review
                else "storyline selection has not succeeded"
            ),
        )

    assembly_plan = build_assembly_plan(trusted_plan, workspace)
    ensure_render_tasks_manifest(assembly_plan, workspace)
    render_plan = load_trusted_render_tasks_manifest(workspace)
    initialize_render_status_manifest(workspace, trusted_plan=render_plan)
    started = now()
    timestamp = _timestamp(started)
    render_result = run_dry_run_render_scheduler(
        workspace,
        trusted_plan=render_plan,
        completed_dependency_ids=tuple(
            job_id for job_id, state in production_states.items() if state == "succeeded"
        ),
        renderer_adapter=LOCAL_RENDERER,
        started_at=timestamp,
        completed_at=timestamp,
        max_concurrency=max_concurrency,
        max_iterations=max_iterations,
        stale_before=_timestamp(started - stale_after),
        lease_updated_at=timestamp,
    )
    render_manifest = load_render_status_manifest(workspace, trusted_plan=render_plan)
    write_dry_run_render_scheduler_report(
        render_result,
        workspace,
        trusted_plan=render_plan,
        final_manifest=render_manifest,
        generated_at=_timestamp(now()),
    )
    stages.append(
        LocalPipelineStage(
            adapter=LOCAL_RENDERER,
            stopped_reason=render_result.stopped_reason,
            completed_ids=render_result.completed_task_ids,
            retryable_ids=render_result.retryable_task_ids,
            failed_ids=render_result.failed_task_ids,
        )
    )
    needs_review += [
        status.task_id
        for status in render_manifest.task_statuses
        if status.state in {"retryable", "failed"}
    ]
    return LocalPipelineResult(
        shoot_slug=catalog.shoot_slug,
        workspace=workspace,
        stages=tuple(stages),
        rendered=all(status.state == "succeeded" for status in render_manifest.task_statuses),
        needs_review_ids=tuple(needs_review),
        stopped_before_render_reason=None,
    )


def local_pipeline_result_to_dict(result: LocalPipelineResult) -> dict[str, object]:
    return {
        "shoot_slug": result.shoot_slug,
        "workspace": str(result.workspace),
        "rendered": result.rendered,
        "needs_review_ids": list(result.needs_review_ids),
        "stopped_before_render_reason": result.stopped_before_render_reason,
        "stages": [
            {
                "adapter": stage.adapter,
                "stopped_reason": stage.stopped_reason,
                "completed_ids": list(stage.completed_ids),
                "retryable_ids": list(stage.retryable_ids),
                "failed_ids": list(stage.failed_ids),
            }
            for stage in result.stages
        ],
    }


def launchd_plist_bytes(
    *,
    ingest_manifests: Sequence[Path | str],
    hour: int,
    minute: int,
    max_concurrency: int,
    log_path: Path | str,
    source_root: Path | str,
    python: str | None = None,
    label: str = LAUNCHD_LABEL_PREFIX,
) -> bytes:
    """Build a macOS LaunchAgent that runs the pipeline nightly.

    The job is wrapped in ``caffeinate -i`` so the Mac does not idle-sleep
    mid-encode. If the Mac is asleep at the scheduled time, launchd runs the job
    when it next wakes. Paths are made absolute because launchd does not run in
    the shell's working directory.
    """

    if not ingest_manifests:
        raise LocalPipelineError("at least one ingest manifest is required")
    if not 0 <= hour <= 23 or not 0 <= minute <= 59:
        raise LocalPipelineError("hour must be 0-23 and minute 0-59")
    if max_concurrency < 1:
        raise LocalPipelineError("max_concurrency must be at least 1")
    if not label or any(not (char.isalnum() or char in ".-_") for char in label):
        raise LocalPipelineError("label may contain only letters, digits, '.', '-' and '_'")

    arguments = [
        "/usr/bin/caffeinate",
        "-i",
        python or sys.executable,
        "-m",
        "shootflow.cli",
        "run-local-pipeline",
        "--max-concurrency",
        str(max_concurrency),
    ]
    for manifest in ingest_manifests:
        arguments += ["--ingest-manifest", str(Path(manifest).expanduser().absolute())]
    log = str(Path(log_path).expanduser().absolute())
    payload = {
        "Label": label,
        "ProgramArguments": arguments,
        "EnvironmentVariables": {
            "PYTHONPATH": str(Path(source_root).expanduser().absolute()),
            "PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
        },
        "StartCalendarInterval": {"Hour": hour, "Minute": minute},
        "StandardOutPath": log,
        "StandardErrorPath": log,
        "ProcessType": "Standard",
    }
    return plistlib.dumps(payload, sort_keys=True)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _timestamp(moment: datetime) -> str:
    if moment.tzinfo is None:
        raise LocalPipelineError("pipeline clock must return timezone-aware datetimes")
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
