from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from pathlib import Path
import re

from media_automation.ingest import IngestManifest, ManifestItem, MediaKind


class DeliverableKind(Enum):
    REEL = "reel"
    CAROUSEL = "carousel"
    PHOTO_SELECTS = "photo_selects"


class JobKind(Enum):
    ANALYZE = "analyze"
    COLOR_GRADE = "color_grade"
    ASSEMBLE_DELIVERABLE = "assemble_deliverable"


VISUAL_MEDIA_KINDS = {MediaKind.RAW, MediaKind.JPEG, MediaKind.VIDEO}


@dataclass(frozen=True)
class ContentPlanOptions:
    project_slug: str
    output_root: Path
    deliverables: tuple[DeliverableKind, ...]
    max_parallel_jobs: int = 8

    def __post_init__(self) -> None:
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", self.project_slug):
            raise ValueError("project_slug must be lowercase kebab-case")
        if not self.output_root.is_absolute():
            raise ValueError("output_root must be an absolute path")
        if not self.deliverables:
            raise ValueError("deliverables must not be empty")
        if self.max_parallel_jobs < 1:
            raise ValueError("max_parallel_jobs must be at least 1")


@dataclass(frozen=True)
class ContentJob:
    id: str
    kind: JobKind
    inputs: tuple[Path, ...]
    outputs: tuple[Path, ...]
    depends_on: tuple[str, ...] = ()
    parallelizable: bool = True
    deliverable: DeliverableKind | None = None


@dataclass(frozen=True)
class ContentJobPlan:
    jobs: tuple[ContentJob, ...]
    recommended_concurrency: int
    notes: tuple[str, ...] = ()


def plan_content_jobs(
    manifest: IngestManifest,
    options: ContentPlanOptions,
) -> ContentJobPlan:
    visual_items = tuple(item for item in manifest.items if item.kind in VISUAL_MEDIA_KINDS)
    notes = _context_notes(manifest.items, visual_items)
    jobs: list[ContentJob] = []
    grade_job_ids: list[str] = []

    for index, item in enumerate(visual_items, start=1):
        stem = _safe_stem(item)
        analysis_id = f"analyze-{index:05d}-{stem}"
        grade_id = f"grade-{index:05d}-{stem}"

        jobs.append(
            ContentJob(
                id=analysis_id,
                kind=JobKind.ANALYZE,
                inputs=(item.destination,),
                outputs=(options.output_root / options.project_slug / "analysis" / f"{stem}.json",),
            )
        )
        jobs.append(
            ContentJob(
                id=grade_id,
                kind=JobKind.COLOR_GRADE,
                inputs=(item.destination,),
                outputs=(options.output_root / options.project_slug / "graded" / item.destination.name),
                depends_on=(analysis_id,),
            )
        )
        grade_job_ids.append(grade_id)

    if grade_job_ids:
        for deliverable in options.deliverables:
            jobs.append(
                ContentJob(
                    id=f"assemble-{deliverable.value}",
                    kind=JobKind.ASSEMBLE_DELIVERABLE,
                    inputs=tuple(
                        options.output_root / options.project_slug / "graded" / item.destination.name
                        for item in visual_items
                    ),
                    outputs=(_deliverable_output(options, deliverable),),
                    depends_on=tuple(grade_job_ids),
                    parallelizable=False,
                    deliverable=deliverable,
                )
            )

    parallel_jobs = sum(1 for job in jobs if job.parallelizable)
    return ContentJobPlan(
        jobs=tuple(jobs),
        recommended_concurrency=max(1, min(options.max_parallel_jobs, parallel_jobs or 1)),
        notes=tuple(notes),
    )


def _context_notes(
    manifest_items: tuple[ManifestItem, ...],
    visual_items: tuple[ManifestItem, ...],
) -> list[str]:
    notes: list[str] = []
    sidecar_count = sum(1 for item in manifest_items if item.kind == MediaKind.SIDECAR)
    if sidecar_count:
        notes.append(
            f"Found {sidecar_count} sidecar file(s); keep them as color/editing context, not visual deliverables."
        )
    if manifest_items and not visual_items:
        notes.append("No visual media found; nothing to analyze, grade, or assemble.")
    return notes


def _safe_stem(item: ManifestItem) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", item.destination.stem.lower()).strip("-")
    return normalized or item.sha256[:12]


def _deliverable_output(options: ContentPlanOptions, deliverable: DeliverableKind) -> Path:
    extension = ".mp4" if deliverable == DeliverableKind.REEL else ".json"
    return options.output_root / options.project_slug / "deliverables" / f"{deliverable.value}{extension}"
