from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal

StoryMediaType = Literal["photo", "video"]


class StoryPlanError(ValueError):
    """Raised when VLM analysis cannot be turned into a safe content plan."""


@dataclass(frozen=True)
class AssetAnalysis:
    asset_path: str
    media_type: StoryMediaType
    scene_label: str
    aesthetic_score: float
    story_score: float
    technical_score: float
    motion_score: float
    duration_seconds: float | None = None
    tags: tuple[str, ...] = ()


@dataclass(frozen=True)
class ContentSequence:
    output_kind: str
    aspect_ratio: str
    asset_paths: tuple[str, ...]
    total_duration_seconds: float | None
    rationale: str


@dataclass(frozen=True)
class StorylinePlan:
    reel: ContentSequence
    carousel: ContentSequence
    photo_set: ContentSequence


def build_storyline_plan(
    analyses: list[AssetAnalysis],
    *,
    max_reel_items: int = 24,
    max_reel_duration_seconds: int = 90,
    max_carousel_items: int = 10,
) -> StorylinePlan:
    _validate_limits(
        max_reel_items=max_reel_items,
        max_reel_duration_seconds=max_reel_duration_seconds,
        max_carousel_items=max_carousel_items,
    )
    for analysis in analyses:
        _validate_analysis(analysis)

    video_analyses = [analysis for analysis in analyses if analysis.media_type == "video"]
    photo_analyses = [analysis for analysis in analyses if analysis.media_type == "photo"]

    reel_assets = _limit_by_reel_budget(
        _rank_best_per_scene(video_analyses),
        max_items=max_reel_items,
        max_duration_seconds=max_reel_duration_seconds,
    )
    carousel_assets = tuple(_rank_with_scene_variety(photo_analyses)[:max_carousel_items])
    photo_set_assets = tuple(sorted(photo_analyses, key=_quality_score, reverse=True))

    return StorylinePlan(
        reel=ContentSequence(
            output_kind="instagram_reel",
            aspect_ratio="9:16",
            asset_paths=tuple(asset.asset_path for asset in reel_assets),
            total_duration_seconds=sum(_duration_for_video(asset) for asset in reel_assets),
            rationale="Ranked VLM video selects with scene variety before repeated coverage.",
        ),
        carousel=ContentSequence(
            output_kind="instagram_carousel",
            aspect_ratio="4:5",
            asset_paths=tuple(asset.asset_path for asset in carousel_assets),
            total_duration_seconds=None,
            rationale="High-scoring photo selects ordered for scene variety and visual range.",
        ),
        photo_set=ContentSequence(
            output_kind="instagram_photo_set",
            aspect_ratio="4:5",
            asset_paths=tuple(asset.asset_path for asset in photo_set_assets),
            total_duration_seconds=None,
            rationale="All graded photos ranked by VLM quality for editor review and export.",
        ),
    )


def _validate_limits(
    *,
    max_reel_items: int,
    max_reel_duration_seconds: int,
    max_carousel_items: int,
) -> None:
    if max_reel_items < 1:
        raise StoryPlanError("max_reel_items must be positive")
    if max_reel_duration_seconds < 1:
        raise StoryPlanError("max_reel_duration_seconds must be positive")
    if max_carousel_items < 1:
        raise StoryPlanError("max_carousel_items must be positive")


def _validate_analysis(analysis: AssetAnalysis) -> None:
    if not analysis.asset_path.strip():
        raise StoryPlanError("Analysis asset path cannot be empty")
    if analysis.media_type not in {"photo", "video"}:
        raise StoryPlanError(f"Unsupported analysis media type: {analysis.media_type}")
    if not analysis.scene_label.strip():
        raise StoryPlanError(f"Analysis scene label cannot be empty: {analysis.asset_path}")
    for score_name in ("aesthetic_score", "story_score", "technical_score", "motion_score"):
        score = getattr(analysis, score_name)
        if not math.isfinite(score) or score < 0 or score > 1:
            raise StoryPlanError(f"{score_name} must be between 0 and 1: {analysis.asset_path}")
    if analysis.media_type == "video":
        if analysis.duration_seconds is None:
            raise StoryPlanError(f"Video duration is required for reel planning: {analysis.asset_path}")
        if not math.isfinite(analysis.duration_seconds) or analysis.duration_seconds < 0:
            raise StoryPlanError(f"Video duration cannot be negative: {analysis.asset_path}")


def _rank_with_scene_variety(analyses: list[AssetAnalysis]) -> list[AssetAnalysis]:
    ranked_by_scene: dict[str, list[AssetAnalysis]] = {}
    for analysis in sorted(analyses, key=_quality_score, reverse=True):
        ranked_by_scene.setdefault(analysis.scene_label, []).append(analysis)

    scene_order = sorted(
        ranked_by_scene,
        key=lambda scene: _quality_score(ranked_by_scene[scene][0]),
        reverse=True,
    )
    diversified: list[AssetAnalysis] = []
    round_index = 0
    while True:
        added = False
        for scene in scene_order:
            scene_assets = ranked_by_scene[scene]
            if round_index < len(scene_assets):
                diversified.append(scene_assets[round_index])
                added = True
        if not added:
            return diversified
        round_index += 1


def _rank_best_per_scene(analyses: list[AssetAnalysis]) -> list[AssetAnalysis]:
    ranked = _rank_with_scene_variety(analyses)
    seen_scenes: set[str] = set()
    best_per_scene: list[AssetAnalysis] = []
    for analysis in ranked:
        if analysis.scene_label in seen_scenes:
            continue
        best_per_scene.append(analysis)
        seen_scenes.add(analysis.scene_label)
    return best_per_scene


def _limit_by_reel_budget(
    analyses: list[AssetAnalysis],
    *,
    max_items: int,
    max_duration_seconds: int,
) -> tuple[AssetAnalysis, ...]:
    selected: list[AssetAnalysis] = []
    total_duration = 0.0
    for analysis in analyses:
        duration = _duration_for_video(analysis)
        if len(selected) >= max_items:
            break
        if total_duration + duration > max_duration_seconds:
            continue
        selected.append(analysis)
        total_duration += duration
    return tuple(selected)


def _duration_for_video(analysis: AssetAnalysis) -> float:
    if analysis.media_type != "video":
        return 0.0
    return analysis.duration_seconds or 0.0


def _quality_score(analysis: AssetAnalysis) -> float:
    return (
        analysis.aesthetic_score * 0.4
        + analysis.story_score * 0.3
        + analysis.technical_score * 0.2
        + analysis.motion_score * 0.1
    )
