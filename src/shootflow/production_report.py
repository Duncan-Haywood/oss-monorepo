from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from shootflow.catalog import load_ingest_manifest, production_assets_from_manifest
from shootflow.production import ProductionJob, ProductionPlan, build_production_plan


@dataclass(frozen=True)
class ProductionWaveSummary:
    wave_index: int
    job_count: int
    output_kinds: tuple[str, ...]
    parallel_job_count: int
    serial_job_count: int


@dataclass(frozen=True)
class ProductionDeliverableSummary:
    job_id: str
    output_kind: str
    outputs: tuple[str, ...]
    depends_on: tuple[str, ...]


@dataclass(frozen=True)
class ProductionPlanReport:
    manifest_path: Path
    workspace: Path
    shoot_date: str
    shoot_slug: str
    copied_manifest_item_count: int
    photo_asset_count: int
    video_asset_count: int
    production_job_count: int
    parallel_job_count: int
    serial_job_count: int
    waves: tuple[ProductionWaveSummary, ...]
    deliverables: tuple[ProductionDeliverableSummary, ...]


def build_production_plan_report(ingest_manifest_path: Path | str) -> ProductionPlanReport:
    if not isinstance(ingest_manifest_path, (Path, str)):
        raise TypeError("ingest_manifest_path must be a path-like string")
    manifest_path = Path(ingest_manifest_path)
    catalog = load_ingest_manifest(manifest_path)
    assets = production_assets_from_manifest(catalog)
    production_plan = build_production_plan(assets, shoot_slug=catalog.shoot_slug)
    return ProductionPlanReport(
        manifest_path=manifest_path,
        workspace=manifest_path.parent,
        shoot_date=catalog.shoot_date,
        shoot_slug=catalog.shoot_slug,
        copied_manifest_item_count=_manifest_item_count(manifest_path),
        photo_asset_count=sum(1 for asset in catalog.assets if asset.media_type == "photo"),
        video_asset_count=sum(1 for asset in catalog.assets if asset.media_type == "video"),
        production_job_count=len(production_plan.jobs),
        parallel_job_count=sum(1 for job in production_plan.jobs if job.can_run_in_parallel),
        serial_job_count=sum(1 for job in production_plan.jobs if not job.can_run_in_parallel),
        waves=_wave_summaries(production_plan),
        deliverables=_deliverable_summaries(production_plan),
    )


def _manifest_item_count(manifest_path: Path) -> int:
    raw_data = json.loads(manifest_path.read_text(encoding="utf-8"))
    raw_items = raw_data.get("items") if isinstance(raw_data, dict) else None
    return len(raw_items) if isinstance(raw_items, list) else 0


def _wave_summaries(production_plan: ProductionPlan) -> tuple[ProductionWaveSummary, ...]:
    return tuple(
        ProductionWaveSummary(
            wave_index=wave.wave_index,
            job_count=len(wave.jobs),
            output_kinds=tuple(sorted({job.output_kind for job in wave.jobs})),
            parallel_job_count=sum(1 for job in wave.jobs if job.can_run_in_parallel),
            serial_job_count=sum(1 for job in wave.jobs if not job.can_run_in_parallel),
        )
        for wave in production_plan.execution_waves
    )


def _deliverable_summaries(production_plan: ProductionPlan) -> tuple[ProductionDeliverableSummary, ...]:
    return tuple(
        ProductionDeliverableSummary(
            job_id=job.job_id,
            output_kind=job.output_kind,
            outputs=job.outputs,
            depends_on=job.depends_on,
        )
        for job in production_plan.jobs
        if _is_deliverable_job(job)
    )


def _is_deliverable_job(job: ProductionJob) -> bool:
    return job.output_kind.startswith("instagram_")
