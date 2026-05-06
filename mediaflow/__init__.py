from __future__ import annotations

from dataclasses import dataclass
from pathlib import PurePosixPath


PHOTO_KINDS = {"raw_photo", "jpeg_photo"}
VIDEO_KINDS = {"log_video", "raw_video", "video"}


@dataclass(frozen=True)
class MediaAsset:
    source_path: str
    capture_id: str
    kind: str
    bytes_size: int
    checksum: str
    captured_at: str


@dataclass(frozen=True)
class DestinationPolicy:
    project_slug: str
    primary_root: str
    backup_root: str | None = None
    delete_source_after_verified_backup: bool = False


@dataclass(frozen=True)
class IngestStep:
    action: str
    source_path: str
    destination_path: str | None
    checksum: str


@dataclass(frozen=True)
class IngestPlan:
    steps: list[IngestStep]
    can_delete_source: bool
    skipped_duplicates: list[str]
    safety_notes: list[str]


@dataclass(frozen=True)
class SocialGoal:
    reels: int
    carousels: int
    photo_posts: int
    max_parallel_color_jobs: int


@dataclass(frozen=True)
class ColorBatch:
    asset_ids: list[str]
    total_bytes: int


@dataclass(frozen=True)
class Deliverable:
    kind: str
    asset_ids: list[str]
    target_aspect_ratio: str


@dataclass(frozen=True)
class SocialPlan:
    color_batches: list[ColorBatch]
    deliverables: list[Deliverable]
    safety_notes: list[str]


def plan_ingest(assets: list[MediaAsset], policy: DestinationPolicy) -> IngestPlan:
    _validate_assets(assets)
    _validate_policy(policy)

    steps: list[IngestStep] = []
    skipped_duplicates: list[str] = []
    seen_checksums: set[str] = set()

    for asset in assets:
        if asset.checksum in seen_checksums:
            skipped_duplicates.append(asset.source_path)
            continue

        seen_checksums.add(asset.checksum)
        primary_destination = _destination_path(policy.primary_root, policy.project_slug, asset)
        steps.append(IngestStep("copy_primary", asset.source_path, primary_destination, asset.checksum))
        steps.append(IngestStep("verify_primary", primary_destination, None, asset.checksum))

        if policy.backup_root is not None:
            backup_destination = _destination_path(policy.backup_root, policy.project_slug, asset)
            steps.append(IngestStep("copy_backup", asset.source_path, backup_destination, asset.checksum))
            steps.append(IngestStep("verify_backup", backup_destination, None, asset.checksum))
            if policy.delete_source_after_verified_backup:
                steps.append(IngestStep("delete_source", asset.source_path, None, asset.checksum))

    safety_notes: list[str] = []
    can_delete_source = policy.delete_source_after_verified_backup and policy.backup_root is not None
    if policy.delete_source_after_verified_backup and policy.backup_root is None:
        safety_notes.append("Source deletion disabled because no backup destination was provided.")

    return IngestPlan(
        steps=steps,
        can_delete_source=can_delete_source,
        skipped_duplicates=skipped_duplicates,
        safety_notes=safety_notes,
    )


def plan_social_outputs(assets: list[MediaAsset], goal: SocialGoal) -> SocialPlan:
    _validate_assets(assets)
    _validate_goal(goal)

    color_batches = _color_batches(assets, goal.max_parallel_color_jobs)
    videos = [asset for asset in assets if asset.kind in VIDEO_KINDS]
    photos = [asset for asset in assets if asset.kind in PHOTO_KINDS]
    deliverables: list[Deliverable] = []

    for index in range(goal.reels):
        if not videos:
            break
        selected = videos[index::max(goal.reels, 1)][:12] or [videos[index % len(videos)]]
        deliverables.append(Deliverable("reel", [asset.capture_id for asset in selected], "9:16"))

    for index in range(goal.carousels):
        carousel_assets = (photos or assets)[index * 10 : (index + 1) * 10]
        if not carousel_assets:
            break
        deliverables.append(
            Deliverable("carousel", [asset.capture_id for asset in carousel_assets[:10]], "4:5")
        )

    if goal.photo_posts > 0:
        still_assets = (photos or assets)[: goal.photo_posts]
        if still_assets:
            deliverables.append(
                Deliverable("photo_post", [asset.capture_id for asset in still_assets], "4:5")
            )

    return SocialPlan(color_batches=color_batches, deliverables=deliverables, safety_notes=[])


def _destination_path(root: str, project_slug: str, asset: MediaAsset) -> str:
    year = asset.captured_at[0:4]
    month = asset.captured_at[5:7]
    filename = PurePosixPath(asset.source_path).name
    return str(PurePosixPath(root) / year / month / project_slug / asset.kind / filename)


def _color_batches(assets: list[MediaAsset], max_parallel_jobs: int) -> list[ColorBatch]:
    return [
        ColorBatch(
            asset_ids=[asset.capture_id for asset in assets[index : index + max_parallel_jobs]],
            total_bytes=sum(asset.bytes_size for asset in assets[index : index + max_parallel_jobs]),
        )
        for index in range(0, len(assets), max_parallel_jobs)
    ]


def _validate_assets(assets: list[MediaAsset]) -> None:
    for asset in assets:
        if not asset.source_path:
            raise ValueError("MediaAsset.source_path is required.")
        if not asset.capture_id:
            raise ValueError("MediaAsset.capture_id is required.")
        if asset.bytes_size <= 0:
            raise ValueError("MediaAsset.bytes_size must be positive.")
        if not asset.checksum:
            raise ValueError("MediaAsset.checksum is required for safe dedupe and verification.")
        if len(asset.captured_at) < 7:
            raise ValueError("MediaAsset.captured_at must include year and month.")


def _validate_policy(policy: DestinationPolicy) -> None:
    if not policy.project_slug:
        raise ValueError("DestinationPolicy.project_slug is required.")
    if not policy.primary_root:
        raise ValueError("DestinationPolicy.primary_root is required.")


def _validate_goal(goal: SocialGoal) -> None:
    if goal.max_parallel_color_jobs <= 0:
        raise ValueError("SocialGoal.max_parallel_color_jobs must be positive.")
    if goal.reels < 0 or goal.carousels < 0 or goal.photo_posts < 0:
        raise ValueError("SocialGoal counts cannot be negative.")
