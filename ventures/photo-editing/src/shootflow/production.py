from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from shootflow.raw_preview import is_raw_path
from shootflow.deliverables import (
    DeliverableSpec,
    MediaAsset,
    instagram_carousel_spec,
    instagram_photo_set_spec,
    instagram_reel_spec,
)

_SHOOT_SLUG_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$")
_SUPPORTED_MEDIA_TYPES = {"photo", "video"}


class ProductionPlanError(ValueError):
    """Raised when a shoot cannot be planned safely."""


@dataclass(frozen=True)
class ProductionJob:
    job_id: str
    output_kind: str
    inputs: tuple[str, ...]
    outputs: tuple[str, ...] = ()
    depends_on: tuple[str, ...] = ()
    can_run_in_parallel: bool = True
    spec: DeliverableSpec | None = None


@dataclass(frozen=True)
class ExecutionWave:
    wave_index: int
    jobs: tuple[ProductionJob, ...]


@dataclass(frozen=True)
class ProductionPlan:
    shoot_slug: str
    jobs: tuple[ProductionJob, ...]
    execution_waves: tuple[ExecutionWave, ...]

    def job_by_id(self, job_id: str) -> ProductionJob:
        for job in self.jobs:
            if job.job_id == job_id:
                return job
        raise KeyError(job_id)


def build_production_plan(assets: list[MediaAsset], shoot_slug: str) -> ProductionPlan:
    _validate_inputs(assets=assets, shoot_slug=shoot_slug)

    proxy_jobs = tuple(
        ProductionJob(
            job_id=_asset_job_id("proxy", index),
            output_kind="proxy_media",
            inputs=(asset.path,),
            outputs=(_proxy_path(_asset_job_id("proxy", index), asset),),
        )
        for index, asset in enumerate(assets)
    )
    analysis_jobs = tuple(
        ProductionJob(
            job_id=_asset_job_id("analyze", index),
            output_kind="vlm_asset_analysis",
            inputs=(asset.path,),
            outputs=(f"analysis/{index:05d}.json",),
            depends_on=(_asset_job_id("proxy", index),),
        )
        for index, asset in enumerate(assets)
    )
    scene_job = ProductionJob(
        job_id="group_scene_sets",
        output_kind="scene_grouping",
        inputs=tuple(asset.path for asset in assets),
        outputs=("analysis/scene_groups.json",),
        depends_on=tuple(job.job_id for job in analysis_jobs),
        can_run_in_parallel=False,
    )
    look_job = ProductionJob(
        job_id="develop_shoot_look",
        output_kind="look_development",
        inputs=(shoot_slug,),
        outputs=("color/shoot_look.json",),
        depends_on=(scene_job.job_id,),
        can_run_in_parallel=False,
    )
    grade_jobs = tuple(
        ProductionJob(
            job_id=_asset_job_id("grade", index),
            output_kind=f"graded_{asset.media_type}",
            inputs=(asset.path,),
            outputs=(_artifact_path("graded", _asset_job_id("grade", index), asset),),
            depends_on=(look_job.job_id, _asset_job_id("analyze", index)),
        )
        for index, asset in enumerate(assets)
    )
    storyline_job = ProductionJob(
        job_id="rank_instagram_storylines",
        output_kind="storyline_selection",
        inputs=(
            tuple(job.outputs[0] for job in analysis_jobs)
            + (scene_job.outputs[0], look_job.outputs[0])
            + tuple(job.outputs[0] for job in grade_jobs)
        ),
        outputs=("analysis/instagram_storylines.json",),
        depends_on=(scene_job.job_id, look_job.job_id) + tuple(job.job_id for job in grade_jobs),
        can_run_in_parallel=False,
    )
    deliverable_jobs = _build_instagram_jobs(assets, grade_jobs, storyline_job)

    waves = (
        ExecutionWave(wave_index=0, jobs=proxy_jobs),
        ExecutionWave(wave_index=1, jobs=analysis_jobs),
        ExecutionWave(wave_index=2, jobs=(scene_job,)),
        ExecutionWave(wave_index=3, jobs=(look_job,)),
        ExecutionWave(wave_index=4, jobs=grade_jobs),
        ExecutionWave(wave_index=5, jobs=(storyline_job,)),
        ExecutionWave(wave_index=6, jobs=deliverable_jobs),
    )
    jobs = proxy_jobs + analysis_jobs + (scene_job, look_job) + grade_jobs + (storyline_job,) + deliverable_jobs
    return ProductionPlan(shoot_slug=shoot_slug, jobs=jobs, execution_waves=waves)


def _validate_inputs(*, assets: list[MediaAsset], shoot_slug: str) -> None:
    if not _SHOOT_SLUG_PATTERN.fullmatch(shoot_slug):
        raise ProductionPlanError(f"Invalid shoot slug: {shoot_slug}")

    for asset in assets:
        if not asset.path.strip():
            raise ProductionPlanError("Asset path cannot be empty")
        if asset.media_type not in _SUPPORTED_MEDIA_TYPES:
            raise ProductionPlanError(f"Unsupported media type: {asset.media_type}")


def _asset_job_id(prefix: str, index: int) -> str:
    return f"{prefix}_asset_{index:05d}"


def _artifact_path(root: str, job_id: str, asset: MediaAsset) -> str:
    return f"{root}/{job_id}/{Path(asset.path).name}"


def _proxy_path(job_id: str, asset: MediaAsset) -> str:
    # A RAW still's proxy is a JPEG made from the preview the camera embedded
    # in it (raw_preview.py), so it is named for what it holds.
    path = _artifact_path("proxies", job_id, asset)
    if asset.media_type == "photo" and is_raw_path(Path(asset.path)):
        return path + ".jpg"
    return path


def _build_instagram_jobs(
    assets: list[MediaAsset],
    grade_jobs: tuple[ProductionJob, ...],
    storyline_job: ProductionJob,
) -> tuple[ProductionJob, ...]:
    video_pairs = tuple(
        (asset, job)
        for asset, job in zip(assets, grade_jobs, strict=True)
        if asset.media_type == "video"
    )
    photo_pairs = tuple(
        (asset, job)
        for asset, job in zip(assets, grade_jobs, strict=True)
        if asset.media_type == "photo"
    )

    jobs: list[ProductionJob] = []
    if video_pairs:
        jobs.append(
            ProductionJob(
                job_id="assemble_instagram_reel",
                output_kind="instagram_reel",
                inputs=(storyline_job.outputs[0],) + tuple(job.outputs[0] for _asset, job in video_pairs),
                outputs=("deliverables/instagram_reel.mp4",),
                depends_on=(storyline_job.job_id,) + tuple(job.job_id for _asset, job in video_pairs),
                can_run_in_parallel=False,
                spec=instagram_reel_spec(),
            )
        )
    if photo_pairs:
        photo_inputs = tuple(job.outputs[0] for _asset, job in photo_pairs)
        photo_dependencies = tuple(job.job_id for _asset, job in photo_pairs)
        jobs.append(
            ProductionJob(
                job_id="assemble_instagram_carousel",
                output_kind="instagram_carousel",
                inputs=(storyline_job.outputs[0],) + photo_inputs,
                outputs=("deliverables/instagram_carousel/",),
                depends_on=(storyline_job.job_id,) + photo_dependencies,
                can_run_in_parallel=False,
                spec=instagram_carousel_spec(),
            )
        )
        jobs.append(
            ProductionJob(
                job_id="export_instagram_photo_set",
                output_kind="instagram_photo_set",
                inputs=(storyline_job.outputs[0],) + photo_inputs,
                outputs=("deliverables/instagram_photo_set/",),
                depends_on=(storyline_job.job_id,) + photo_dependencies,
                can_run_in_parallel=False,
                spec=instagram_photo_set_spec(),
            )
        )
    return tuple(jobs)
