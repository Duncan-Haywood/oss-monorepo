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

_SHOOT_SLUG_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$")
_DEFAULT_SHOOT_SLUG = "cli-demo-shoot"
_STORYLINE_PATH = "analysis/instagram_storylines.json"
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


def _validate_demo_workspace(demo: PersistedCliDemoWorkspace) -> None:
    if not isinstance(demo, PersistedCliDemoWorkspace):
        raise DemoWorkspaceError("demo must be a PersistedCliDemoWorkspace")
    if load_trusted_render_tasks_manifest(demo.workspace_root) != demo.trusted_plan:
        raise DemoWorkspaceError("Demo render task manifest does not match trusted plan")
    for output_path in demo.expected_output_paths:
        if not isinstance(output_path, str) or not output_path.startswith("deliverables/"):
            raise DemoWorkspaceError(f"Unexpected demo output path: {output_path}")
