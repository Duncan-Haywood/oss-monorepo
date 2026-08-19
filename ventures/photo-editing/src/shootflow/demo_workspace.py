from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from shootflow.assembly import (
    RENDER_TASKS_MANIFEST_PATH,
    AssemblyPlan,
    AssemblyPlanError,
    RenderTask,
    load_trusted_render_tasks_manifest,
    write_render_tasks_manifest,
)
from shootflow.card_workflow import CardDumpWorkflowReport, run_card_dump_workflow
from shootflow.ingest import MEDIA_EXTENSIONS
from shootflow.pilot_cohort_report import (
    PilotCohortReport,
    build_pilot_cohort_report_from_paths,
    pilot_cohort_report_to_dict,
)
from shootflow.pilot_dashboard import build_pilot_dashboard_summary, pilot_dashboard_summary_to_dict
from shootflow.render_scheduler import run_dry_run_render_scheduler, write_dry_run_render_scheduler_report
from shootflow.render_status import initialize_render_status_manifest, load_render_status_manifest
from shootflow.storage_discovery import VolumeDiscoveryHint

_SHOOT_SLUG_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$")
_DEFAULT_SHOOT_SLUG = "cli-demo-shoot"
_DEFAULT_CARD_DUMP_SHOOT_DATE = "2026-05-08"
_DEFAULT_DESTINATION_SUBFOLDER = "ShootFlow"
_DEMO_VOLUME_ROOT = "Volumes"
_DEMO_SOURCE_VOLUME = "EOS_DIGITAL"
_DEMO_DESTINATION_VOLUME = "Samsung_T7"
_STORYLINE_PATH = "analysis/instagram_storylines.json"
_PILOT_DEMO_WORKSPACES_DIR = "workspaces"
_PILOT_DEMO_DASHBOARDS_DIR = "pilot_dashboards"
_PILOT_COHORT_REPORT_PATH = "pilot_cohort_report.json"
_PILOT_DEMO_SHOOT_SLUG_PREFIX = "pilot-demo"
_DEFAULT_PILOT_DEMO_WORKSPACE_COUNT = 2
_MAX_PILOT_DEMO_WORKSPACE_COUNT = 20
_CARD_DUMP_DEMO_SOURCE_MEDIA: tuple[tuple[str, bytes], ...] = (
    ("DCIM/100EOS5D/IMG_0001.CR3", b"raw-bytes"),
    ("DCIM/100EOS5D/IMG_0001.JPG", b"photo-bytes"),
    ("PRIVATE/A001.MOV", b"video-bytes"),
    ("PRIVATE/A001.WAV", b"scratch-audio"),
)
_DEMO_INPUTS: tuple[tuple[str, bytes], ...] = (
    (
        _STORYLINE_PATH,
        b'{"demo":true,"note":"trusted placeholder storyline for CLI smoke runs"}\n',
    ),
    ("graded/grade_asset_00000/A001.MOV", b"demo graded hero video\n"),
    ("graded/grade_asset_00001/IMG_0001.JPG", b"demo graded carousel photo 1\n"),
    ("graded/grade_asset_00002/BTS.MOV", b"demo graded behind the scenes video\n"),
    ("graded/grade_asset_00003/IMG_0002.JPG", b"demo graded carousel photo 2\n"),
)
_REQUIRED_COMPLETED_DEPENDENCIES = (
    "rank_instagram_storylines",
    "grade_asset_00000",
    "grade_asset_00001",
    "grade_asset_00002",
    "grade_asset_00003",
)


class DemoWorkspaceError(ValueError):
    """Raised when a persisted CLI demo workspace cannot be created safely."""


@dataclass(frozen=True)
class PersistedCliDemoWorkspace:
    workspace_root: Path
    trusted_plan: AssemblyPlan
    render_tasks_manifest_path: Path
    required_completed_dependency_ids: tuple[str, ...]
    expected_output_paths: tuple[str, ...]
    safety_notes: tuple[str, ...]


@dataclass(frozen=True)
class CardDumpCliDemoWorkspace:
    workspace_root: Path
    volume_root: Path
    source_volume: Path
    destination_volume: Path
    shoot_folder: Path
    card_dump_report: CardDumpWorkflowReport
    render_demo: PersistedCliDemoWorkspace
    required_completed_dependency_ids: tuple[str, ...]
    expected_output_paths: tuple[str, ...]
    safety_notes: tuple[str, ...]


@dataclass(frozen=True)
class PilotCohortCliDemoWorkspace:
    workspace_root: Path
    shoot_workspaces: tuple[Path, ...]
    dashboard_json_paths: tuple[Path, ...]
    cohort_report_path: Path
    cohort_report: PilotCohortReport
    safety_notes: tuple[str, ...]


def create_pilot_cohort_cli_demo_workspace(
    workspace_root: Path | str,
    *,
    workspace_count: int = _DEFAULT_PILOT_DEMO_WORKSPACE_COUNT,
    dashboard_generated_at: str,
    generated_at: str,
) -> PilotCohortCliDemoWorkspace:
    """Create saved pilot dashboards plus a cohort report for GTM demos.

    The helper composes the trusted persisted render demo, render status
    initialization, dry-run scheduler report, pilot dashboard, and cohort report
    contracts. It writes only deterministic demo artifacts under
    ``workspace_root`` and preflights saved dashboard/report paths before any
    shoot workspace is created.
    """

    root = _workspace_root(workspace_root)
    _validate_pilot_cohort_demo_args(
        workspace_count=workspace_count,
        dashboard_generated_at=dashboard_generated_at,
        generated_at=generated_at,
    )
    shoot_workspaces = _pilot_demo_shoot_workspaces(root, workspace_count)
    dashboard_paths = _pilot_demo_dashboard_paths(root, workspace_count)
    cohort_report_path = root / _PILOT_COHORT_REPORT_PATH
    _preflight_pilot_demo_shoot_workspaces(root, shoot_workspaces)
    _preflight_pilot_demo_outputs(root, dashboard_paths, cohort_report_path)

    for index, shoot_workspace in enumerate(shoot_workspaces, start=1):
        shoot_slug = _pilot_demo_shoot_slug(index)
        demo = create_persisted_cli_demo_workspace(shoot_workspace, shoot_slug=shoot_slug)
        initialize_render_status_manifest(shoot_workspace, trusted_plan=demo.trusted_plan)
        scheduler_result = run_dry_run_render_scheduler(
            shoot_workspace,
            trusted_plan=demo.trusted_plan,
            completed_dependency_ids=demo.required_completed_dependency_ids,
            renderer_adapter="dry-run-local",
            started_at=dashboard_generated_at,
            completed_at=dashboard_generated_at,
            max_concurrency=3,
            max_iterations=4,
        )
        final_manifest = load_render_status_manifest(
            shoot_workspace,
            trusted_plan=demo.trusted_plan,
        )
        write_dry_run_render_scheduler_report(
            scheduler_result,
            shoot_workspace,
            trusted_plan=demo.trusted_plan,
            final_manifest=final_manifest,
            generated_at=dashboard_generated_at,
        )
        dashboard = build_pilot_dashboard_summary(
            shoot_workspace,
            generated_at=dashboard_generated_at,
        )
        _write_pilot_demo_json_file(
            dashboard_paths[index - 1],
            root=root,
            content=_json_payload(pilot_dashboard_summary_to_dict(dashboard)),
            label="pilot dashboard",
        )

    cohort_report = build_pilot_cohort_report_from_paths(
        dashboard_paths,
        generated_at=generated_at,
    )
    _write_pilot_demo_json_file(
        cohort_report_path,
        root=root,
        content=_json_payload(pilot_cohort_report_to_dict(cohort_report)),
        label="pilot cohort report",
    )
    cohort_demo = PilotCohortCliDemoWorkspace(
        workspace_root=root,
        shoot_workspaces=shoot_workspaces,
        dashboard_json_paths=dashboard_paths,
        cohort_report_path=cohort_report_path,
        cohort_report=cohort_report,
        safety_notes=(
            "saved pilot dashboard JSON is generated from trusted demo workspace health",
            "pilot cohort demo reports are observational and do not authorize workflow actions",
            "pilot cohort demo reports do not grant copy, retry, cleanup, overwrite, materialization, or deletion authority",
        ),
    )
    _validate_pilot_cohort_cli_demo_workspace(cohort_demo)
    return cohort_demo


def create_card_dump_cli_demo_workspace(
    workspace_root: Path | str,
    *,
    shoot_date: str = _DEFAULT_CARD_DUMP_SHOOT_DATE,
    shoot_slug: str = _DEFAULT_SHOOT_SLUG,
    destination_subfolder: str = _DEFAULT_DESTINATION_SUBFOLDER,
) -> CardDumpCliDemoWorkspace:
    """Create a synthetic card-dump-to-render workspace for CLI demos.

    The helper seeds a fake mounted card and destination SSD under
    ``workspace_root``, runs the real confirmed card-dump workflow, then adds the
    persisted render-task demo to the ingested shoot folder. It deliberately
    leaves render status and scheduler reports to the normal CLI commands.
    """

    root = _workspace_root(workspace_root)
    _validate_card_dump_demo_args(
        shoot_date=shoot_date,
        shoot_slug=shoot_slug,
        destination_subfolder=destination_subfolder,
    )
    volume_root = root / _DEMO_VOLUME_ROOT
    source_volume = volume_root / _DEMO_SOURCE_VOLUME
    destination_volume = volume_root / _DEMO_DESTINATION_VOLUME
    destination_shoot_folder = destination_volume / destination_subfolder / f"{shoot_date}_{shoot_slug}"

    _preflight_card_dump_demo_volume_root(volume_root)
    _ensure_demo_directory_available(volume_root, root=root, label="demo volume root")
    _ensure_demo_directory_available(source_volume, root=root, label="demo source volume")
    _ensure_demo_directory_available(destination_volume, root=root, label="demo destination volume")
    _preflight_card_dump_demo_destination_shoot_folder(destination_shoot_folder, root=root)
    _preflight_card_dump_demo_destination_volume(destination_volume)
    _preflight_card_dump_demo_source_media(source_volume, root=root)
    _preflight_card_dump_demo_source_contents(source_volume)
    _write_card_dump_demo_source_media(source_volume, root=root)
    destination_volume.mkdir(parents=True, exist_ok=True)
    _reject_symlink_ancestors(destination_volume, root=root)

    card_dump_report = run_card_dump_workflow(
        [volume_root],
        shoot_date=shoot_date,
        shoot_slug=shoot_slug,
        destination_subfolder=destination_subfolder,
        headroom_bytes=0,
        confirm_ingest=True,
        volume_hints=_card_dump_demo_volume_hints(source_volume, destination_volume),
    )
    if card_dump_report.production_report is None:
        raise DemoWorkspaceError("Card-dump demo did not produce a production report")
    shoot_folder = card_dump_report.production_report.workspace
    render_demo = create_persisted_cli_demo_workspace(shoot_folder, shoot_slug=shoot_slug)
    demo = CardDumpCliDemoWorkspace(
        workspace_root=root,
        volume_root=volume_root,
        source_volume=source_volume,
        destination_volume=destination_volume,
        shoot_folder=shoot_folder,
        card_dump_report=card_dump_report,
        render_demo=render_demo,
        required_completed_dependency_ids=render_demo.required_completed_dependency_ids,
        expected_output_paths=render_demo.expected_output_paths,
        safety_notes=(
            "card-dump demo source media was not deleted",
            "card-dump demo refuses to overwrite existing different source files",
            "render status and scheduler reports must still be created through the normal CLI commands",
        ),
    )
    _validate_card_dump_cli_demo_workspace(demo)
    return demo


def create_persisted_cli_demo_workspace(
    workspace_root: Path | str,
    *,
    shoot_slug: str = _DEFAULT_SHOOT_SLUG,
) -> PersistedCliDemoWorkspace:
    """Create a tiny persisted render-task workspace for CLI smoke demos.

    The helper writes deterministic placeholder inputs and
    ``deliverables/render_tasks.json`` only. It deliberately does not create or
    reset render status, scheduler reports, outputs, or source media; callers can
    then exercise the same ``init-render-status`` and ``dry-run-render-scheduler``
    commands a Mac UI or launch agent would use.
    """

    root = _workspace_root(workspace_root)
    _validate_shoot_slug(shoot_slug)
    plan = _demo_assembly_plan(shoot_slug)
    _preflight_existing_render_tasks_manifest(root, plan)
    _preflight_demo_inputs(root)
    _write_demo_inputs(root)
    manifest_path = _write_demo_render_tasks_manifest(root, plan)
    demo = PersistedCliDemoWorkspace(
        workspace_root=root,
        trusted_plan=plan,
        render_tasks_manifest_path=manifest_path,
        required_completed_dependency_ids=_REQUIRED_COMPLETED_DEPENDENCIES,
        expected_output_paths=tuple(
            output_path
            for task in plan.render_tasks
            for output_path in task.outputs
        ),
        safety_notes=(
            "demo helper never deletes source media",
            "demo helper refuses to overwrite existing different files",
            "run init-render-status before scheduling so existing progress is preserved",
        ),
    )
    _validate_demo_workspace(demo)
    return demo


def _validate_pilot_cohort_demo_args(
    *,
    workspace_count: int,
    dashboard_generated_at: str,
    generated_at: str,
) -> None:
    if isinstance(workspace_count, bool) or not isinstance(workspace_count, int):
        raise DemoWorkspaceError("workspace_count must be an integer")
    if workspace_count < 1 or workspace_count > _MAX_PILOT_DEMO_WORKSPACE_COUNT:
        raise DemoWorkspaceError(
            f"workspace_count must be between 1 and {_MAX_PILOT_DEMO_WORKSPACE_COUNT}"
        )
    _validate_demo_timestamp(dashboard_generated_at, field_name="dashboard_generated_at")
    _validate_demo_timestamp(generated_at, field_name="generated_at")


def _validate_demo_timestamp(timestamp: str, *, field_name: str) -> None:
    if not isinstance(timestamp, str) or not timestamp.strip():
        raise DemoWorkspaceError(f"{field_name} must be a non-empty string")
    if len(timestamp) > 80 or "\x00" in timestamp or "\n" in timestamp or "\r" in timestamp:
        raise DemoWorkspaceError(f"{field_name} is invalid")


def _pilot_demo_shoot_slug(index: int) -> str:
    return f"{_PILOT_DEMO_SHOOT_SLUG_PREFIX}-{index:03d}"


def _pilot_demo_shoot_workspaces(root: Path, workspace_count: int) -> tuple[Path, ...]:
    return tuple(
        root / _PILOT_DEMO_WORKSPACES_DIR / _pilot_demo_shoot_slug(index)
        for index in range(1, workspace_count + 1)
    )


def _pilot_demo_dashboard_paths(root: Path, workspace_count: int) -> tuple[Path, ...]:
    return tuple(
        root / _PILOT_DEMO_DASHBOARDS_DIR / f"{_pilot_demo_shoot_slug(index)}.json"
        for index in range(1, workspace_count + 1)
    )


def _preflight_pilot_demo_outputs(
    root: Path,
    dashboard_paths: tuple[Path, ...],
    cohort_report_path: Path,
) -> None:
    for path in dashboard_paths:
        _preflight_pilot_demo_output_path(
            path,
            root=root,
            label="pilot dashboard",
        )
    _preflight_pilot_demo_output_path(
        cohort_report_path,
        root=root,
        label="pilot cohort report",
    )


def _preflight_pilot_demo_shoot_workspaces(
    root: Path,
    shoot_workspaces: tuple[Path, ...],
) -> None:
    for shoot_workspace in shoot_workspaces:
        _reject_symlink_ancestors(shoot_workspace.parent, root=root)
        if shoot_workspace.parent.exists() and not shoot_workspace.parent.is_dir():
            raise DemoWorkspaceError(
                f"pilot demo shoot workspace directory must be a directory: {shoot_workspace.parent}"
            )
        if shoot_workspace.exists() or shoot_workspace.is_symlink():
            raise DemoWorkspaceError(
                f"Refusing existing pilot demo shoot workspace: {shoot_workspace}"
            )


def _preflight_pilot_demo_output_path(path: Path, *, root: Path, label: str) -> None:
    _reject_symlink_ancestors(path.parent, root=root)
    if path.parent.exists() and not path.parent.is_dir():
        raise DemoWorkspaceError(f"{label} directory must be a directory: {path.parent}")
    if path.exists() or path.is_symlink():
        raise DemoWorkspaceError(f"Refusing to overwrite existing different {label}: {path}")


def _write_pilot_demo_json_file(path: Path, *, root: Path, content: str, label: str) -> None:
    _reject_symlink_ancestors(path.parent, root=root)
    if path.exists():
        if path.is_symlink() or not path.is_file():
            raise DemoWorkspaceError(f"Refusing unsafe existing {label}: {path}")
        if path.read_text(encoding="utf-8") != content:
            raise DemoWorkspaceError(f"Refusing to overwrite existing different {label}: {path}")
        return
    if path.is_symlink():
        raise DemoWorkspaceError(f"Refusing unsafe existing {label}: {path}")
    if path.parent.exists() and not path.parent.is_dir():
        raise DemoWorkspaceError(f"{label} directory must be a directory: {path.parent}")
    path.parent.mkdir(parents=True, exist_ok=True)
    _reject_symlink_ancestors(path.parent, root=root)
    try:
        with path.open("x", encoding="utf-8") as handle:
            handle.write(content)
    except FileExistsError as exc:
        raise DemoWorkspaceError(f"Refusing raced existing {label}: {path}") from exc


def _json_payload(payload: dict[str, object]) -> str:
    return json.dumps(payload, ensure_ascii=True, indent=2, sort_keys=True) + "\n"


def _workspace_root(workspace_root: Path | str) -> Path:
    if not isinstance(workspace_root, (Path, str)):
        raise DemoWorkspaceError("workspace_root must be a pathlib.Path or string")
    root = Path(workspace_root)
    _reject_symlink_path_components(root)
    if root.is_symlink():
        raise DemoWorkspaceError(f"Refusing demo workspace symlink: {root}")
    if root.exists() and not root.is_dir():
        raise DemoWorkspaceError(f"Demo workspace root must be a directory: {root}")
    root.mkdir(parents=True, exist_ok=True)
    _reject_symlink_path_components(root)
    if root.is_symlink():
        raise DemoWorkspaceError(f"Refusing demo workspace symlink: {root}")
    return root


def _validate_shoot_slug(shoot_slug: str) -> None:
    if not isinstance(shoot_slug, str) or _SHOOT_SLUG_PATTERN.fullmatch(shoot_slug) is None:
        raise DemoWorkspaceError("shoot_slug must match ^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$")


def _validate_card_dump_demo_args(
    *,
    shoot_date: str,
    shoot_slug: str,
    destination_subfolder: str,
) -> None:
    if not isinstance(shoot_date, str) or not shoot_date.strip():
        raise DemoWorkspaceError("shoot_date must be a non-empty string")
    try:
        date.fromisoformat(shoot_date)
    except ValueError as exc:
        raise DemoWorkspaceError("shoot_date must be an ISO-8601 date") from exc
    _validate_shoot_slug(shoot_slug)
    if not isinstance(destination_subfolder, str) or not destination_subfolder.strip():
        raise DemoWorkspaceError("destination_subfolder must be a non-empty relative path")
    subfolder_path = Path(destination_subfolder)
    if subfolder_path.is_absolute():
        raise DemoWorkspaceError("destination_subfolder must be relative")
    if any(part in ("", ".", "..") for part in subfolder_path.parts):
        raise DemoWorkspaceError(
            "destination_subfolder cannot contain empty, current, or parent components"
        )


def _preflight_card_dump_demo_volume_root(volume_root: Path) -> None:
    if not volume_root.exists():
        return
    if volume_root.is_symlink() or not volume_root.is_dir():
        raise DemoWorkspaceError(f"demo volume root must be a directory: {volume_root}")
    allowed_names = {_DEMO_SOURCE_VOLUME, _DEMO_DESTINATION_VOLUME}
    for child in volume_root.iterdir():
        if child.name not in allowed_names:
            raise DemoWorkspaceError(f"Unexpected demo volume entry: {child}")


def _preflight_card_dump_demo_source_media(source_volume: Path, *, root: Path) -> None:
    for relative_path, content in _CARD_DUMP_DEMO_SOURCE_MEDIA:
        path = source_volume / relative_path
        _reject_symlink_ancestors(path.parent, root=root)
        if not path.exists():
            continue
        if path.is_symlink() or not path.is_file():
            raise DemoWorkspaceError(f"Refusing unsafe existing demo source file: {path}")
        if path.read_bytes() != content:
            raise DemoWorkspaceError(
                f"Refusing to overwrite existing different demo source file: {path}"
            )


def _preflight_card_dump_demo_destination_shoot_folder(shoot_folder: Path, *, root: Path) -> None:
    _reject_symlink_ancestors(shoot_folder.parent, root=root)
    if shoot_folder.exists() or shoot_folder.is_symlink():
        raise DemoWorkspaceError(f"Refusing existing demo destination shoot folder: {shoot_folder}")


def _preflight_card_dump_demo_destination_volume(destination_volume: Path) -> None:
    if not destination_volume.exists():
        return
    for child in destination_volume.iterdir():
        raise DemoWorkspaceError(f"Unexpected demo destination entry: {child}")


def _preflight_card_dump_demo_source_contents(source_volume: Path) -> None:
    if not source_volume.exists():
        return
    expected_media_paths = {Path(relative_path) for relative_path, _content in _CARD_DUMP_DEMO_SOURCE_MEDIA}
    expected_directories = {
        parent
        for path in expected_media_paths
        for parent in path.parents
        if parent != Path(".")
    }
    for path in sorted(source_volume.rglob("*")):
        if path.is_symlink():
            raise DemoWorkspaceError(f"Refusing unsafe existing demo source file: {path}")
        relative_path = path.relative_to(source_volume)
        if path.is_dir():
            if relative_path not in expected_directories:
                raise DemoWorkspaceError(f"Unexpected demo source entry: {path}")
            continue
        if relative_path not in expected_media_paths:
            if path.suffix.lower() in MEDIA_EXTENSIONS:
                raise DemoWorkspaceError(f"Unexpected demo source media: {path}")
            raise DemoWorkspaceError(f"Unexpected demo source entry: {path}")


def _ensure_demo_directory_available(path: Path, *, root: Path, label: str) -> None:
    _reject_symlink_ancestors(path, root=root)
    if path.exists() and not path.is_dir():
        raise DemoWorkspaceError(f"{label} must be a directory: {path}")


def _write_card_dump_demo_source_media(source_volume: Path, *, root: Path) -> None:
    for relative_path, content in _CARD_DUMP_DEMO_SOURCE_MEDIA:
        _write_exact_demo_file(source_volume / relative_path, root=root, content=content)


def _card_dump_demo_volume_hints(
    source_volume: Path,
    destination_volume: Path,
) -> dict[Path, VolumeDiscoveryHint]:
    return {
        source_volume: VolumeDiscoveryHint(
            display_name=_DEMO_SOURCE_VOLUME,
            free_bytes=1024**3,
            total_bytes=2 * 1024**3,
            is_removable=True,
            is_read_only=True,
        ),
        destination_volume: VolumeDiscoveryHint(
            display_name=_DEMO_DESTINATION_VOLUME,
            free_bytes=1024**4,
            total_bytes=2 * 1024**4,
            is_removable=True,
            is_read_only=False,
        ),
    }


def _demo_assembly_plan(shoot_slug: str) -> AssemblyPlan:
    return AssemblyPlan(
        shoot_slug=shoot_slug,
        render_tasks=(
            RenderTask(
                task_id="render_instagram_reel",
                sequence_name="reel",
                source_job_id="assemble_instagram_reel",
                output_kind="instagram_reel",
                aspect_ratio="9:16",
                inputs=(
                    _STORYLINE_PATH,
                    "graded/grade_asset_00000/A001.MOV",
                ),
                outputs=("deliverables/instagram_reel.mp4",),
                depends_on=("rank_instagram_storylines", "grade_asset_00000"),
                can_run_in_parallel=False,
            ),
            RenderTask(
                task_id="render_instagram_reel_variant_hero",
                sequence_name="reel",
                source_job_id="assemble_instagram_reel",
                output_kind="instagram_reel",
                aspect_ratio="9:16",
                inputs=(
                    _STORYLINE_PATH,
                    "graded/grade_asset_00002/BTS.MOV",
                ),
                outputs=("deliverables/instagram_reels/hero.mp4",),
                depends_on=("rank_instagram_storylines", "grade_asset_00002"),
                can_run_in_parallel=True,
            ),
            RenderTask(
                task_id="render_instagram_carousel",
                sequence_name="carousel",
                source_job_id="assemble_instagram_carousel",
                output_kind="instagram_carousel",
                aspect_ratio="4:5",
                inputs=(
                    _STORYLINE_PATH,
                    "graded/grade_asset_00001/IMG_0001.JPG",
                    "graded/grade_asset_00003/IMG_0002.JPG",
                ),
                outputs=(
                    "deliverables/instagram_carousel/slide_00001.jpg",
                    "deliverables/instagram_carousel/slide_00002.jpg",
                ),
                depends_on=(
                    "rank_instagram_storylines",
                    "grade_asset_00001",
                    "grade_asset_00003",
                ),
                can_run_in_parallel=True,
            ),
            RenderTask(
                task_id="export_instagram_photo_set_part_00001",
                sequence_name="photo_set",
                source_job_id="export_instagram_photo_set",
                output_kind="instagram_photo_set",
                aspect_ratio="4:5",
                inputs=(
                    _STORYLINE_PATH,
                    "graded/grade_asset_00001/IMG_0001.JPG",
                    "graded/grade_asset_00003/IMG_0002.JPG",
                ),
                outputs=(
                    "deliverables/instagram_photo_set/photo_00001.jpg",
                    "deliverables/instagram_photo_set/photo_00002.jpg",
                ),
                depends_on=(
                    "rank_instagram_storylines",
                    "grade_asset_00001",
                    "grade_asset_00003",
                ),
                can_run_in_parallel=True,
            ),
        ),
    )


def _write_demo_inputs(root: Path) -> None:
    for relative_path, content in _DEMO_INPUTS:
        _write_exact_demo_file(root / relative_path, root=root, content=content)


def _preflight_demo_inputs(root: Path) -> None:
    for relative_path, content in _DEMO_INPUTS:
        path = root / relative_path
        _reject_symlink_ancestors(path.parent, root=root)
        if not path.exists():
            continue
        if path.is_symlink() or not path.is_file():
            raise DemoWorkspaceError(f"Refusing unsafe existing demo file: {path}")
        if path.read_bytes() != content:
            raise DemoWorkspaceError(f"Refusing to overwrite existing different demo file: {path}")


def _preflight_existing_render_tasks_manifest(root: Path, plan: AssemblyPlan) -> None:
    manifest_path = root / RENDER_TASKS_MANIFEST_PATH
    if manifest_path.parent.is_symlink():
        raise DemoWorkspaceError(
            f"Refusing symlinked render task manifest directory: {manifest_path.parent}"
        )
    _reject_symlink_ancestors(manifest_path.parent, root=root)
    if manifest_path.parent.exists() and not manifest_path.parent.is_dir():
        raise DemoWorkspaceError(
            f"Render task manifest directory must be a directory: {manifest_path.parent}"
        )
    if not manifest_path.exists() and not manifest_path.is_symlink():
        return
    if not _demo_inputs_are_exact(root):
        raise DemoWorkspaceError(
            f"Refusing to create demo inputs while an existing render task manifest is present: {manifest_path}"
        )
    try:
        existing_plan = load_trusted_render_tasks_manifest(root)
    except AssemblyPlanError as exc:
        raise DemoWorkspaceError(
            f"Refusing to overwrite existing render task manifest: {manifest_path}"
        ) from exc
    if existing_plan != plan:
        raise DemoWorkspaceError(
            f"Refusing to overwrite existing different render task manifest: {manifest_path}"
        )


def _demo_inputs_are_exact(root: Path) -> bool:
    for relative_path, content in _DEMO_INPUTS:
        path = root / relative_path
        if path.is_symlink() or not path.is_file():
            return False
        if path.read_bytes() != content:
            return False
    return True


def _write_exact_demo_file(path: Path, *, root: Path, content: bytes) -> None:
    _reject_symlink_ancestors(path.parent, root=root)
    if path.exists():
        if path.is_symlink() or not path.is_file():
            raise DemoWorkspaceError(f"Refusing unsafe existing demo file: {path}")
        if path.read_bytes() != content:
            raise DemoWorkspaceError(f"Refusing to overwrite existing different demo file: {path}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    _reject_symlink_ancestors(path.parent, root=root)
    try:
        with path.open("xb") as handle:
            handle.write(content)
    except FileExistsError as exc:
        raise DemoWorkspaceError(f"Refusing raced existing demo file: {path}") from exc


def _write_demo_render_tasks_manifest(root: Path, plan: AssemblyPlan) -> Path:
    manifest_path = root / RENDER_TASKS_MANIFEST_PATH
    if manifest_path.exists() or manifest_path.is_symlink():
        try:
            existing_plan = load_trusted_render_tasks_manifest(root)
        except AssemblyPlanError as exc:
            raise DemoWorkspaceError(
                f"Refusing to overwrite existing render task manifest: {manifest_path}"
            ) from exc
        if existing_plan != plan:
            raise DemoWorkspaceError(
                f"Refusing to overwrite existing different render task manifest: {manifest_path}"
            )
        return manifest_path
    return write_render_tasks_manifest(plan, root)


def _reject_symlink_ancestors(path: Path, *, root: Path) -> None:
    current = root
    if current.is_symlink():
        raise DemoWorkspaceError(f"Refusing symlinked demo workspace path: {current}")
    relative = path.relative_to(root)
    for part in relative.parts:
        current = current / part
        if current.is_symlink():
            raise DemoWorkspaceError(f"Refusing symlinked demo workspace path: {current}")


def _reject_symlink_path_components(path: Path) -> None:
    current = Path(path.anchor) if path.anchor else Path()
    for part in path.parts:
        if path.anchor and part == path.anchor:
            continue
        current = current / part
        if current.is_symlink():
            raise DemoWorkspaceError(f"Refusing symlinked demo workspace path: {current}")
        if not current.exists():
            break


def _validate_demo_workspace(demo: PersistedCliDemoWorkspace) -> None:
    if not isinstance(demo, PersistedCliDemoWorkspace):
        raise DemoWorkspaceError("demo must be a PersistedCliDemoWorkspace")
    if load_trusted_render_tasks_manifest(demo.workspace_root) != demo.trusted_plan:
        raise DemoWorkspaceError("Demo render task manifest does not match trusted plan")
    for output_path in demo.expected_output_paths:
        if not isinstance(output_path, str) or not output_path.startswith("deliverables/"):
            raise DemoWorkspaceError(f"Unexpected demo output path: {output_path}")


def _validate_card_dump_cli_demo_workspace(demo: CardDumpCliDemoWorkspace) -> None:
    if not isinstance(demo, CardDumpCliDemoWorkspace):
        raise DemoWorkspaceError("demo must be a CardDumpCliDemoWorkspace")
    if demo.card_dump_report.production_report is None:
        raise DemoWorkspaceError("Card-dump demo production report is missing")
    if demo.card_dump_report.production_report.workspace != demo.shoot_folder:
        raise DemoWorkspaceError("Card-dump demo shoot folder does not match production report")
    _validate_demo_workspace(demo.render_demo)
    if demo.render_demo.workspace_root != demo.shoot_folder:
        raise DemoWorkspaceError("Render demo workspace does not match card-dump shoot folder")
    for relative_path, content in _CARD_DUMP_DEMO_SOURCE_MEDIA:
        path = demo.source_volume / relative_path
        if not path.is_file() or path.read_bytes() != content:
            raise DemoWorkspaceError(f"Card-dump demo source file is missing or changed: {path}")


def _validate_pilot_cohort_cli_demo_workspace(demo: PilotCohortCliDemoWorkspace) -> None:
    if not isinstance(demo, PilotCohortCliDemoWorkspace):
        raise DemoWorkspaceError("demo must be a PilotCohortCliDemoWorkspace")
    if not demo.shoot_workspaces:
        raise DemoWorkspaceError("Pilot cohort demo must contain at least one shoot workspace")
    if len(demo.shoot_workspaces) != len(demo.dashboard_json_paths):
        raise DemoWorkspaceError("Pilot cohort demo dashboards must match shoot workspaces")
    for shoot_workspace in demo.shoot_workspaces:
        if not isinstance(shoot_workspace, Path) or not shoot_workspace.is_dir():
            raise DemoWorkspaceError(f"Pilot cohort demo shoot workspace is missing: {shoot_workspace}")
    for dashboard_path in demo.dashboard_json_paths:
        if not isinstance(dashboard_path, Path) or not dashboard_path.is_file():
            raise DemoWorkspaceError(f"Pilot cohort demo dashboard is missing: {dashboard_path}")
    if not isinstance(demo.cohort_report_path, Path) or not demo.cohort_report_path.is_file():
        raise DemoWorkspaceError("Pilot cohort demo report is missing")
    if not isinstance(demo.cohort_report, PilotCohortReport):
        raise DemoWorkspaceError("Pilot cohort demo report must be a PilotCohortReport")
    if not isinstance(demo.safety_notes, tuple):
        raise DemoWorkspaceError("Pilot cohort demo safety_notes must be a tuple")
    for note in demo.safety_notes:
        if not isinstance(note, str) or not note.strip():
            raise DemoWorkspaceError("Pilot cohort demo safety_notes must contain non-empty strings")
