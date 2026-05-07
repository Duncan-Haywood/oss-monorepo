from __future__ import annotations

import math
from dataclasses import dataclass, field
from pathlib import Path


SUPPORTED_MEDIA_TYPES = {"photo", "video"}


@dataclass(frozen=True)
class MediaAsset:
    path: Path
    media_type: str
    scene: str
    quality_score: float
    duration_seconds: float | None = None

    def __post_init__(self) -> None:
        if not str(self.path):
            raise ValueError("asset path must not be empty")
        if self.media_type not in SUPPORTED_MEDIA_TYPES:
            raise ValueError(f"unsupported media type: {self.media_type}")
        if not self.scene:
            raise ValueError("asset scene must not be empty")
        if not math.isfinite(self.quality_score) or not 0 <= self.quality_score <= 1:
            raise ValueError("quality score must be finite and between 0 and 1")
        if self.media_type == "video":
            if self.duration_seconds is None:
                raise ValueError("video assets require a duration")
            if not math.isfinite(self.duration_seconds) or self.duration_seconds < 0:
                raise ValueError("video duration must be finite and non-negative")


@dataclass(frozen=True)
class DeliverableJob:
    kind: str
    items: tuple[MediaAsset, ...]
    metadata: dict[str, int | float | str] = field(default_factory=dict)


@dataclass(frozen=True)
class DeliverablePlan:
    jobs: tuple[DeliverableJob, ...]


def plan_instagram_deliverables(
    assets: list[MediaAsset] | tuple[MediaAsset, ...],
    *,
    reel_duration_limit_seconds: float = 90.0,
    carousel_limit: int = 10,
) -> DeliverablePlan:
    if reel_duration_limit_seconds <= 0:
        raise ValueError("reel duration limit must be positive")
    if carousel_limit <= 0:
        raise ValueError("carousel limit must be positive")

    ranked_photos = _rank([asset for asset in assets if asset.media_type == "photo"])
    ranked_videos = _rank([asset for asset in assets if asset.media_type == "video"])

    jobs: list[DeliverableJob] = []
    reel_items = _choose_reel_items(ranked_videos, reel_duration_limit_seconds)
    if reel_items:
        jobs.append(
            DeliverableJob(
                "ig_reel",
                tuple(reel_items),
                {
                    "duration_seconds": sum(item.duration_seconds or 0 for item in reel_items),
                    "max_duration_seconds": reel_duration_limit_seconds,
                },
            )
        )

    carousel_items = _choose_scene_varied_photos(ranked_photos, carousel_limit)
    if carousel_items:
        jobs.append(
            DeliverableJob(
                "ig_carousel",
                tuple(carousel_items),
                {"count": len(carousel_items), "max_count": carousel_limit},
            )
        )

    if ranked_photos:
        jobs.append(DeliverableJob("ig_photo_set", tuple(ranked_photos), {"count": len(ranked_photos)}))

    return DeliverablePlan(tuple(jobs))


def _rank(assets: list[MediaAsset]) -> list[MediaAsset]:
    return sorted(assets, key=lambda asset: (-asset.quality_score, str(asset.path)))


def _choose_reel_items(videos: list[MediaAsset], duration_limit: float) -> list[MediaAsset]:
    selected: list[MediaAsset] = []
    total = 0.0
    used_scenes: set[str] = set()

    for video in videos:
        duration = video.duration_seconds or 0
        if video.scene in used_scenes:
            continue
        if total + duration > duration_limit:
            continue
        selected.append(video)
        used_scenes.add(video.scene)
        total += duration

    if not selected and videos:
        shortest_best = min(videos, key=lambda asset: (asset.duration_seconds or 0, -asset.quality_score))
        if (shortest_best.duration_seconds or 0) <= duration_limit:
            selected.append(shortest_best)

    return selected


def _choose_scene_varied_photos(photos: list[MediaAsset], limit: int) -> list[MediaAsset]:
    selected: list[MediaAsset] = []
    selected_paths: set[Path] = set()

    scene_best: dict[str, MediaAsset] = {}
    for photo in photos:
        scene_best.setdefault(photo.scene, photo)

    for photo in _rank(list(scene_best.values())):
        if len(selected) >= limit:
            return selected
        selected.append(photo)
        selected_paths.add(photo.path)

    for photo in photos:
        if len(selected) >= limit:
            return selected
        if photo.path in selected_paths:
            continue
        selected.append(photo)
        selected_paths.add(photo.path)

    return selected
