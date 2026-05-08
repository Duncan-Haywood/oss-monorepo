from __future__ import annotations

import re
from dataclasses import dataclass
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

_SHOOT_SLUG_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$")
_DEFAULT_SHOOT_SLUG = "cli-demo-shoot"
_DEFAULT_CARD_DUMP_SHOOT_DATE = "2026-05-08"
_DEFAULT_DESTINATION_SUBFOLDER = "ShootFlow"
_DEMO_VOLUME_ROOT = "Volumes"
_DEMO_SOURCE_VOLUME = "EOS_DIGITAL"
_DEMO_DESTINATION_VOLUME = "Samsung_T7"
_STORYLINE_PATH = "analysis/instagram_storylines.json"
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


def create_card_dump_cli_demo_workspace(
    workspace_root: Path | str,
    *,
    shoot_date: str = _DEFAULT_CARD_DUMP_SHOOT_DATE,
    shoot_slug: str = _DEFAULT_SHOOT_SLUG,
    destination_subfolder: str = _DEFAULT_DESTINATION_SUBFOLDER,
) -> CardDumpCliDemoWorkspace:
    """Create a synthetic card-dump-to-render workspace for CLI demos.

    The helper creates a fake mounted card and SSD under ``workspace_root``,
    runs the real confirmed card-dump workflow, then seeds the ingested shoot
    folder with the persisted render-task demo. It does not initialize render
    status, run the scheduler, delete source media, or overwrite different
    existing demo files.
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
    _preflight_card_dump_demo_volume_root(volume_root)
    _ensure_demo_directory_available(volume_root, root=root, label="demo volume root")
    _ensure_demo_directory_available(source_volume, root=root, label="demo source volume")
    _ensure_demo_directory_available(destination_volume, root=root, label="demo destination volume")
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


def _workspace_root(workspace_root: Path | str) -> Path:
    if not isinstance(workspace_root, (Path, str)):
        raise DemoWorkspaceError("workspace_root must be a pathlib.Path or string")
    root = Path(workspace_root)
    if root.is_symlink():
        raise DemoWorkspaceError(f"Refusing demo workspace symlink: {root}")
    if root.exists() and not root.is_dir():
        raise DemoWorkspaceError(f"Demo workspace root must be a directory: {root}")
    root.mkdir(parents=True, exist_ok=True)
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
    _validate_shoot_slug(shoot_slug)
    if not isinstance(destination_subfolder, str) or not destination_subfolder.strip():
        raise DemoWorkspaceError("destination_subfolder must be a non-empty relative path")
    subfolder_path = Path(destination_subfolder)
    if subfolder_path.is_absolute():
        raise DemoWorkspaceError("destination_subfolder must be relative")
    if any(part in ("", ".", "..") for part in subfolder_path.parts):
        raise DemoWorkspaceError("destination_subfolder cannot contain empty, current, or parent components")


def _preflight_card_dump_demo_source_media(source_volume: Path, *, root: Path) -> None:
    for relative_path, content in _CARD_DUMP_DEMO_SOURCE_MEDIA:
        path = source_volume / relative_path
        _reject_symlink_ancestors(path.parent, root=root)
        if not path.exists():
            continue
        if path.is_symlink() or not path.is_file():
            raise DemoWorkspaceError(f"Refusing unsafe existing demo source file: {path}")
        if path.read_bytes() != content:
            raise DemoWorkspaceError(f"Refusing to overwrite existing different demo source file: {path}")


def _preflight_card_dump_demo_volume_root(volume_root: Path) -> None:
    if not volume_root.exists():
        return
    if volume_root.is_symlink() or not volume_root.is_dir():
        raise DemoWorkspaceError(f"demo volume root must be a directory: {volume_root}")
    allowed_names = {_DEMO_SOURCE_VOLUME, _DEMO_DESTINATION_VOLUME}
    for child in volume_root.iterdir():
        if child.name not in allowed_names:
            raise DemoWorkspaceError(f"Unexpected demo volume entry: {child}")


def _preflight_card_dump_demo_source_contents(source_volume: Path) -> None:
    if not source_volume.exists():
        return
    expected_media_paths = {Path(relative_path) for relative_path, _content in _CARD_DUMP_DEMO_SOURCE_MEDIA}
    for path in sorted(source_volume.rglob("*")):
        if path.is_symlink():
            raise DemoWorkspaceError(f"Refusing unsafe existing demo source file: {path}")
        if path.is_dir():
            continue
        if path.suffix.lower() not in MEDIA_EXTENSIONS:
            continue
        relative_path = path.relative_to(source_volume)
        if relative_path not in expected_media_paths:
            raise DemoWorkspaceError(f"Unexpected demo source media: {path}")


def _ensure_demo_directory_available(path: Path, *, root: Path, label: str) -> None:
    _reject_symlink_ancestors(path, root=root)
    if path.exists() and not path.is_dir():
        raise DemoWorkspaceError(f"{label} must be a directory: {path}")


def _write_card_dump_demo_source_media(source_volume: Path, *, root: Path) -> None:
    for relative_path, content in _CARD_DUMP_DEMO_SOURCE_MEDIA:
        _write_exact_demo_file(source_volume / relative_path, root=root, content=content)


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
