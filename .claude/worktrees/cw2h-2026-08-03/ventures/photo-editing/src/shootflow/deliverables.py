from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

MediaType = Literal["photo", "video"]


@dataclass(frozen=True)
class MediaAsset:
    path: str
    media_type: MediaType
    duration_seconds: float | None = None


@dataclass(frozen=True)
class DeliverableSpec:
    name: str
    aspect_ratio: str
    max_items: int
    max_duration_seconds: int | None
    quality_notes: tuple[str, ...]


@dataclass(frozen=True)
class JobSpec:
    job_id: str
    output_kind: str
    inputs: tuple[str, ...]
    depends_on: tuple[str, ...] = ()
    can_run_in_parallel: bool = True
    spec: DeliverableSpec | None = None


@dataclass(frozen=True)
class DeliverablePlan:
    shoot_slug: str
    asset_jobs: tuple[JobSpec, ...]
    deliverable_jobs: tuple[JobSpec, ...]


def instagram_reel_spec() -> DeliverableSpec:
    return DeliverableSpec(
        name="Instagram Reel",
        aspect_ratio="9:16",
        max_items=24,
        max_duration_seconds=90,
        quality_notes=(
            "Use graded selects with motion-aware pacing.",
            "Keep captions and safe-area overlays separate from color pipeline.",
            "Prefer timeline assembly from proxy media, then conform from masters.",
        ),
    )


def instagram_carousel_spec() -> DeliverableSpec:
    return DeliverableSpec(
        name="Instagram Carousel",
        aspect_ratio="4:5",
        max_items=10,
        max_duration_seconds=None,
        quality_notes=(
            "Rank images for narrative variety before crop selection.",
            "Preserve a color-consistent set rather than optimizing frames independently.",
        ),
    )


def instagram_photo_set_spec() -> DeliverableSpec:
    return DeliverableSpec(
        name="Instagram Photo Set",
        aspect_ratio="4:5",
        max_items=20,
        max_duration_seconds=None,
        quality_notes=(
            "Export high-quality feed-ready stills and retain full-resolution graded intermediates.",
        ),
    )


def build_deliverable_plan(assets: list[MediaAsset], shoot_slug: str) -> DeliverablePlan:
    asset_jobs = tuple(
        JobSpec(
            job_id=f"grade_asset_{index:05d}",
            output_kind=f"graded_{asset.media_type}",
            inputs=(asset.path,),
        )
        for index, asset in enumerate(assets)
    )

    video_asset_jobs = tuple(
        job.job_id for job, asset in zip(asset_jobs, assets, strict=True) if asset.media_type == "video"
    )
    photo_asset_jobs = tuple(
        job.job_id for job, asset in zip(asset_jobs, assets, strict=True) if asset.media_type == "photo"
    )

    deliverable_jobs: list[JobSpec] = []
    if video_asset_jobs:
        deliverable_jobs.append(
            JobSpec(
                job_id="assemble_instagram_reel",
                output_kind="instagram_reel",
                inputs=tuple(asset.path for asset in assets if asset.media_type == "video"),
                depends_on=video_asset_jobs,
                can_run_in_parallel=False,
                spec=instagram_reel_spec(),
            )
        )
    if photo_asset_jobs:
        deliverable_jobs.append(
            JobSpec(
                job_id="assemble_instagram_carousel",
                output_kind="instagram_carousel",
                inputs=tuple(asset.path for asset in assets if asset.media_type == "photo"),
                depends_on=photo_asset_jobs,
                can_run_in_parallel=False,
                spec=instagram_carousel_spec(),
            )
        )
        deliverable_jobs.append(
            JobSpec(
                job_id="export_instagram_photo_set",
                output_kind="instagram_photo_set",
                inputs=tuple(asset.path for asset in assets if asset.media_type == "photo"),
                depends_on=photo_asset_jobs,
                can_run_in_parallel=False,
                spec=instagram_photo_set_spec(),
            )
        )

    return DeliverablePlan(
        shoot_slug=shoot_slug,
        asset_jobs=asset_jobs,
        deliverable_jobs=tuple(deliverable_jobs),
    )
