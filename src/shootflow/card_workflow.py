from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from shootflow.ingest import (
    CopyPlan,
    CopyReport,
    ImportSourceEstimate,
    estimate_import_source,
    execute_copy_plan,
    plan_import,
)
from shootflow.production_report import ProductionPlanReport, build_production_plan_report
from shootflow.storage import ImportRouteRecommendation
from shootflow.storage_discovery import DiscoveredVolumeMetadata, discover_import_route


class CardDumpWorkflowError(ValueError):
    """Raised when the card-dump workflow arguments are invalid."""


@dataclass(frozen=True)
class CardDumpWorkflowReport:
    volume_roots: tuple[Path, ...]
    status: str
    route: ImportRouteRecommendation
    source_estimate: ImportSourceEstimate | None
    destination_root: Path | None
    preview_plan: CopyPlan | None
    copy_report: CopyReport | None
    production_report: ProductionPlanReport | None
    ingest_executed: bool
    notes: tuple[str, ...]


def run_card_dump_workflow(
    volume_roots: list[Path],
    *,
    shoot_date: str,
    shoot_slug: str,
    destination_subfolder: str | None = None,
    headroom_bytes: int = 32 * 1024**3,
    confirm_ingest: bool = False,
    metadata_by_path: dict[Path, DiscoveredVolumeMetadata] | None = None,
) -> CardDumpWorkflowReport:
    """Run the safe card-dump planning flow, optionally executing ingest.

    The workflow is intentionally conservative: discovery and preview are
    advisory, copies happen only when confirm_ingest is true, and production
    planning after ingest is read-only.
    """

    _validate_workflow_args(
        volume_roots=volume_roots,
        shoot_date=shoot_date,
        shoot_slug=shoot_slug,
        destination_subfolder=destination_subfolder,
        headroom_bytes=headroom_bytes,
        confirm_ingest=confirm_ingest,
        metadata_by_path=metadata_by_path,
    )

    initial_route = discover_import_route(volume_roots, metadata_by_path=metadata_by_path)
    source_estimate = _estimate_source_media(initial_route)
    route = initial_route
    if source_estimate is not None and source_estimate.estimated_bytes > 0:
        route = discover_import_route(
            volume_roots,
            expected_import_bytes=source_estimate.estimated_bytes,
            headroom_bytes=headroom_bytes,
            metadata_by_path=metadata_by_path,
        )

    if route.source is None or route.destination is None:
        return CardDumpWorkflowReport(
            volume_roots=tuple(volume_roots),
            status="blocked",
            route=route,
            source_estimate=source_estimate,
            destination_root=None,
            preview_plan=None,
            copy_report=None,
            production_report=None,
            ingest_executed=False,
            notes=(
                "blocked before preview because no reviewed source/destination route is ready",
                "no files were copied or deleted",
            ),
        )

    destination_root = _validated_destination_root(
        route.destination.candidate.path,
        destination_subfolder,
    )
    preview_plan = plan_import(
        route.source.candidate.path,
        destination_root,
        shoot_date=shoot_date,
        shoot_slug=shoot_slug,
    )

    if not confirm_ingest:
        return CardDumpWorkflowReport(
            volume_roots=tuple(volume_roots),
            status="ready_for_review",
            route=route,
            source_estimate=source_estimate,
            destination_root=destination_root,
            preview_plan=preview_plan,
            copy_report=None,
            production_report=None,
            ingest_executed=False,
            notes=(
                "preview only - no files were copied",
                "review source, destination, and checksums before rerunning with confirm_ingest",
                "source media will not be deleted",
            ),
        )

    copy_report = execute_copy_plan(preview_plan)
    production_report = build_production_plan_report(copy_report.manifest_path)
    return CardDumpWorkflowReport(
        volume_roots=tuple(volume_roots),
        status="ingest_complete",
        route=route,
        source_estimate=source_estimate,
        destination_root=destination_root,
        preview_plan=preview_plan,
        copy_report=copy_report,
        production_report=production_report,
        ingest_executed=True,
        notes=(
            "safe ingest completed with SHA-256 verification",
            "source media was not deleted",
            "post-ingest production planning was read-only",
        ),
    )


def _validate_workflow_args(
    *,
    volume_roots: list[Path],
    shoot_date: str,
    shoot_slug: str,
    destination_subfolder: str | None,
    headroom_bytes: int,
    confirm_ingest: bool,
    metadata_by_path: dict[Path, DiscoveredVolumeMetadata] | None,
) -> None:
    if not isinstance(volume_roots, list):
        raise CardDumpWorkflowError("volume_roots must be a list of Path objects")
    if not volume_roots:
        raise CardDumpWorkflowError("volume_roots cannot be empty")
    for root in volume_roots:
        if not isinstance(root, Path):
            raise CardDumpWorkflowError("volume_roots must contain only Path objects")
    if not isinstance(shoot_date, str) or not shoot_date.strip():
        raise CardDumpWorkflowError("shoot_date must be a non-empty string")
    if not isinstance(shoot_slug, str) or not shoot_slug.strip():
        raise CardDumpWorkflowError("shoot_slug must be a non-empty string")
    if not isinstance(headroom_bytes, int):
        raise CardDumpWorkflowError("headroom_bytes must be an integer")
    if headroom_bytes < 0:
        raise CardDumpWorkflowError("headroom_bytes cannot be negative")
    if not isinstance(confirm_ingest, bool):
        raise CardDumpWorkflowError("confirm_ingest must be a boolean")
    if metadata_by_path is not None and not isinstance(metadata_by_path, dict):
        raise CardDumpWorkflowError("metadata_by_path must be a dict when provided")
    if destination_subfolder is not None:
        _validate_destination_subfolder(destination_subfolder)


def _validate_destination_subfolder(destination_subfolder: str) -> None:
    if not isinstance(destination_subfolder, str) or not destination_subfolder.strip():
        raise CardDumpWorkflowError("destination_subfolder must be a non-empty relative path")
    subfolder_path = Path(destination_subfolder)
    if subfolder_path.is_absolute():
        raise CardDumpWorkflowError("destination_subfolder must be relative")
    if any(part in ("", ".", "..") for part in subfolder_path.parts):
        raise CardDumpWorkflowError("destination_subfolder cannot contain empty, current, or parent components")


def _estimate_source_media(route: ImportRouteRecommendation) -> ImportSourceEstimate | None:
    if route.source is None:
        return None
    return estimate_import_source(route.source.candidate.path)


def _validated_destination_root(destination_volume: Path, destination_subfolder: str | None) -> Path:
    if destination_subfolder is None:
        return destination_volume
    destination_root = destination_volume / destination_subfolder
    _reject_symlinked_existing_subfolder_components(destination_volume, destination_root)
    try:
        destination_root.resolve(strict=False).relative_to(destination_volume.resolve())
    except ValueError as exc:
        raise CardDumpWorkflowError(
            "destination subfolder must stay under the selected destination volume"
        ) from exc
    return destination_root


def _reject_symlinked_existing_subfolder_components(destination_volume: Path, destination_root: Path) -> None:
    for parent in (destination_root, *destination_root.parents):
        if parent == destination_volume:
            return
        if parent.is_symlink():
            raise CardDumpWorkflowError(f"destination subfolder contains a symlink: {parent}")
