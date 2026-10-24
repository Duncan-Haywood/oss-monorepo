from __future__ import annotations

import json
import math
import os
import re
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

StoryMediaType = Literal["photo", "video"]
STORYLINE_ARTIFACT_PATH = "analysis/instagram_storylines.json"
_STORYLINE_SCHEMA_VERSION = 2
_LEGACY_STORYLINE_SCHEMA_VERSION = 1
_SEQUENCE_NAMES = ("reel", "carousel", "photo_set")
_SEQUENCE_METADATA = {
    "reel": ("instagram_reel", "9:16"),
    "carousel": ("instagram_carousel", "4:5"),
    "photo_set": ("instagram_photo_set", "4:5"),
}
_ARTIFACT_KEYS = frozenset({"schema_version", "sequences", "reel_variants"})
_LEGACY_ARTIFACT_KEYS = frozenset({"schema_version", "sequences"})
_SEQUENCE_KEYS = frozenset(
    {
        "name",
        "output_kind",
        "aspect_ratio",
        "asset_paths",
        "total_duration_seconds",
        "rationale",
    }
)
_REEL_VARIANT_KEYS = frozenset(
    {
        "variant_id",
        "output_kind",
        "aspect_ratio",
        "asset_paths",
        "total_duration_seconds",
        "rationale",
    }
)
_VARIANT_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_]{0,63}$")
_BTS_HINTS = frozenset({"behind", "behind_the_scenes", "bts", "prep", "detail", "details", "setup"})


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
    perceptual_hash: str | None = None


@dataclass(frozen=True)
class ContentSequence:
    output_kind: str
    aspect_ratio: str
    asset_paths: tuple[str, ...]
    total_duration_seconds: float | None
    rationale: str


@dataclass(frozen=True)
class ReelVariant:
    variant_id: str
    sequence: ContentSequence


@dataclass(frozen=True)
class StorylinePlan:
    reel: ContentSequence
    carousel: ContentSequence
    photo_set: ContentSequence
    reel_variants: tuple[ReelVariant, ...] = ()


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

    reel_sequence = _reel_sequence(
        reel_assets,
        rationale="Ranked VLM video selects with scene variety before repeated coverage.",
    )

    return StorylinePlan(
        reel=reel_sequence,
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
        reel_variants=_build_reel_variants(
            video_analyses,
            hero_assets=reel_assets,
            max_items=max_reel_items,
            max_duration_seconds=max_reel_duration_seconds,
        ),
    )


def write_storyline_artifact(
    plan: StorylinePlan,
    workspace_root: Path | str,
    *,
    allowed_asset_paths: set[str] | frozenset[str],
) -> Path:
    if not isinstance(plan, StorylinePlan):
        raise TypeError("plan must be a StorylinePlan")
    allowed_paths = _validate_allowed_asset_paths(allowed_asset_paths)
    _validate_storyline_plan(plan, allowed_paths=allowed_paths)

    artifact_path = _storyline_artifact_path(workspace_root)
    artifact_path.parent.mkdir(parents=True, exist_ok=True)
    _reject_symlink(artifact_path.parent, "storyline artifact directory")
    _reject_symlink(artifact_path, "storyline artifact")

    temp_path = artifact_path.with_suffix(".json.tmp")
    _reject_symlink(temp_path, "temporary storyline artifact")
    content = storyline_artifact_bytes(plan, allowed_asset_paths=allowed_asset_paths)
    _write_bytes_no_follow(temp_path, content)
    temp_path.replace(artifact_path)
    return artifact_path


def storyline_artifact_bytes(
    plan: StorylinePlan,
    *,
    allowed_asset_paths: set[str] | frozenset[str],
) -> bytes:
    if not isinstance(plan, StorylinePlan):
        raise TypeError("plan must be a StorylinePlan")
    allowed_paths = _validate_allowed_asset_paths(allowed_asset_paths)
    _validate_storyline_plan(plan, allowed_paths=allowed_paths)
    return _storyline_plan_json(plan).encode("utf-8")


def load_storyline_artifact(
    workspace_root: Path | str,
    *,
    allowed_asset_paths: set[str] | frozenset[str],
) -> StorylinePlan:
    allowed_paths = _validate_allowed_asset_paths(allowed_asset_paths)
    root = Path(workspace_root)
    artifact_path = _storyline_artifact_path(root)
    _reject_symlink_path(artifact_path, root, "storyline artifact")
    raw_artifact = _read_json_object(artifact_path)
    plan = _storyline_plan_from_json(raw_artifact)
    _validate_storyline_plan(plan, allowed_paths=allowed_paths)
    return plan


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


def _build_reel_variants(
    video_analyses: list[AssetAnalysis],
    *,
    hero_assets: tuple[AssetAnalysis, ...],
    max_items: int,
    max_duration_seconds: int,
) -> tuple[ReelVariant, ...]:
    if not hero_assets:
        return ()

    behind_the_scenes_assets = _limit_by_reel_budget(
        _rank_best_per_scene([analysis for analysis in video_analyses if _is_bts_candidate(analysis)])
        or _rank_best_per_scene(video_analyses),
        max_items=max_items,
        max_duration_seconds=_max_reel_variant_duration(max_duration_seconds),
    )
    fast_cut_assets = _limit_by_reel_budget(
        _rank_fast_cut_candidates(video_analyses),
        max_items=max_items,
        max_duration_seconds=_max_reel_variant_duration(max_duration_seconds),
    )

    return (
        ReelVariant(
            variant_id="hero",
            sequence=_reel_sequence(
                hero_assets,
                rationale="Hero reel variant mirrors the primary scene-diverse first cut for review.",
            ),
        ),
        ReelVariant(
            variant_id="behind_the_scenes",
            sequence=_reel_sequence(
                behind_the_scenes_assets,
                rationale="Behind-the-scenes reel variant prioritizes prep, detail, and BTS-tagged clips.",
            ),
        ),
        ReelVariant(
            variant_id="fast_cut",
            sequence=_reel_sequence(
                fast_cut_assets,
                rationale="Fast-cut reel variant prioritizes high-motion shorter clips for a punchier edit.",
            ),
        ),
    )


def _max_reel_variant_duration(max_duration_seconds: int) -> int:
    return max(1, min(max_duration_seconds, 45))


def _reel_sequence(assets: tuple[AssetAnalysis, ...], *, rationale: str) -> ContentSequence:
    return ContentSequence(
        output_kind="instagram_reel",
        aspect_ratio="9:16",
        asset_paths=tuple(asset.asset_path for asset in assets),
        total_duration_seconds=sum(_duration_for_video(asset) for asset in assets),
        rationale=rationale,
    )


def _is_bts_candidate(analysis: AssetAnalysis) -> bool:
    tokens = {_normalize_hint(analysis.scene_label)}
    tokens.update(_normalize_hint(tag) for tag in analysis.tags)
    return any(token in _BTS_HINTS for token in tokens)


def _normalize_hint(value: str) -> str:
    return value.strip().lower().replace("-", "_").replace(" ", "_")


def _rank_fast_cut_candidates(analyses: list[AssetAnalysis]) -> list[AssetAnalysis]:
    return sorted(analyses, key=_fast_cut_score, reverse=True)


def _fast_cut_score(analysis: AssetAnalysis) -> float:
    duration = _duration_for_video(analysis)
    short_clip_bonus = 1 / max(duration, 1)
    return analysis.motion_score * 0.5 + _quality_score(analysis) * 0.35 + short_clip_bonus * 0.15


def _duration_for_video(analysis: AssetAnalysis) -> float:
    if analysis.media_type != "video":
        return 0.0
    return analysis.duration_seconds or 0.0


def _storyline_artifact_path(workspace_root: Path | str) -> Path:
    root = Path(workspace_root)
    if root.is_symlink():
        raise StoryPlanError(f"Refusing storyline workspace symlink: {root}")
    artifact_relative_path = Path(STORYLINE_ARTIFACT_PATH)
    artifact_path = root / artifact_relative_path
    try:
        artifact_path.resolve().relative_to(root.resolve())
    except ValueError as exc:
        raise StoryPlanError(f"Storyline artifact escapes workspace: {STORYLINE_ARTIFACT_PATH}") from exc
    return artifact_path


def _validate_allowed_asset_paths(allowed_asset_paths: set[str] | frozenset[str]) -> frozenset[str]:
    if not isinstance(allowed_asset_paths, (set, frozenset)):
        raise TypeError("allowed_asset_paths must be a set or frozenset")
    if any(not isinstance(path, str) or not path.strip() for path in allowed_asset_paths):
        raise StoryPlanError("allowed_asset_paths must contain non-empty strings")
    return frozenset(allowed_asset_paths)


def _validate_storyline_plan(plan: StorylinePlan, *, allowed_paths: frozenset[str]) -> None:
    sequences = (plan.reel, plan.carousel, plan.photo_set)
    for sequence_name, sequence in zip(_SEQUENCE_NAMES, sequences, strict=True):
        expected_output_kind, expected_aspect_ratio = _SEQUENCE_METADATA[sequence_name]
        _validate_content_sequence(
            sequence_name,
            sequence,
            allowed_paths=allowed_paths,
            expected_output_kind=expected_output_kind,
            expected_aspect_ratio=expected_aspect_ratio,
        )

    if not isinstance(plan.reel_variants, tuple):
        raise StoryPlanError("reel_variants must be a tuple")
    variant_ids: set[str] = set()
    for variant in plan.reel_variants:
        if not isinstance(variant, ReelVariant):
            raise TypeError("reel variant must be a ReelVariant")
        _validate_variant_id(variant.variant_id)
        if variant.variant_id in variant_ids:
            raise StoryPlanError(f"Duplicate reel variant: {variant.variant_id}")
        variant_ids.add(variant.variant_id)
        _validate_content_sequence(
            f"reel variant {variant.variant_id}",
            variant.sequence,
            allowed_paths=allowed_paths,
            expected_output_kind="instagram_reel",
            expected_aspect_ratio="9:16",
        )


def _validate_content_sequence(
    sequence_name: str,
    sequence: ContentSequence,
    *,
    allowed_paths: frozenset[str],
    expected_output_kind: str,
    expected_aspect_ratio: str,
) -> None:
    if not isinstance(sequence, ContentSequence):
        raise TypeError(f"{sequence_name} must be a ContentSequence")
    if sequence.output_kind != expected_output_kind:
        raise StoryPlanError(f"Unexpected {sequence_name} output kind: {sequence.output_kind}")
    if sequence.aspect_ratio != expected_aspect_ratio:
        raise StoryPlanError(f"Unexpected {sequence_name} aspect ratio: {sequence.aspect_ratio}")
    if not isinstance(sequence.asset_paths, tuple):
        raise StoryPlanError(f"{sequence_name} asset paths must be a tuple")
    for asset_path in sequence.asset_paths:
        _validate_story_asset_path(asset_path, allowed_paths=allowed_paths)
    if sequence.total_duration_seconds is not None:
        if (
            isinstance(sequence.total_duration_seconds, bool)
            or not isinstance(sequence.total_duration_seconds, (int, float))
            or not math.isfinite(sequence.total_duration_seconds)
            or sequence.total_duration_seconds < 0
        ):
            raise StoryPlanError(f"{sequence_name} duration must be a non-negative number")
    if not isinstance(sequence.rationale, str) or not sequence.rationale.strip():
        raise StoryPlanError(f"{sequence_name} rationale cannot be empty")


def _validate_variant_id(variant_id: str) -> None:
    if not isinstance(variant_id, str) or _VARIANT_ID_PATTERN.fullmatch(variant_id) is None:
        raise StoryPlanError(f"Invalid reel variant id: {variant_id}")


def _validate_story_asset_path(asset_path: str, *, allowed_paths: frozenset[str]) -> None:
    if not isinstance(asset_path, str) or not asset_path.strip():
        raise StoryPlanError("Storyline asset path cannot be empty")
    path = Path(asset_path)
    if path.is_absolute() or ".." in path.parts:
        raise StoryPlanError(f"Unsafe storyline asset path: {asset_path}")
    if asset_path not in allowed_paths:
        raise StoryPlanError(f"Storyline references untrusted asset: {asset_path}")


def _storyline_plan_json(plan: StorylinePlan) -> str:
    return json.dumps(_storyline_plan_to_json(plan), indent=2, sort_keys=True) + "\n"


def _storyline_plan_to_json(plan: StorylinePlan) -> dict[str, object]:
    return {
        "reel_variants": [_reel_variant_to_json(variant) for variant in plan.reel_variants],
        "schema_version": _STORYLINE_SCHEMA_VERSION,
        "sequences": [
            _content_sequence_to_json("reel", plan.reel),
            _content_sequence_to_json("carousel", plan.carousel),
            _content_sequence_to_json("photo_set", plan.photo_set),
        ],
    }


def _reel_variant_to_json(variant: ReelVariant) -> dict[str, object]:
    return {
        "variant_id": variant.variant_id,
        "output_kind": variant.sequence.output_kind,
        "aspect_ratio": variant.sequence.aspect_ratio,
        "asset_paths": list(variant.sequence.asset_paths),
        "total_duration_seconds": variant.sequence.total_duration_seconds,
        "rationale": variant.sequence.rationale,
    }


def _content_sequence_to_json(name: str, sequence: ContentSequence) -> dict[str, object]:
    return {
        "name": name,
        "output_kind": sequence.output_kind,
        "aspect_ratio": sequence.aspect_ratio,
        "asset_paths": list(sequence.asset_paths),
        "total_duration_seconds": sequence.total_duration_seconds,
        "rationale": sequence.rationale,
    }


def _read_json_object(path: Path) -> dict[str, object]:
    try:
        raw = json.loads(_read_text_no_follow(path))
    except FileNotFoundError as exc:
        raise StoryPlanError(f"Missing storyline artifact: {path}") from exc
    except json.JSONDecodeError as exc:
        raise StoryPlanError(f"Invalid storyline artifact JSON: {path}") from exc
    if not isinstance(raw, dict):
        raise StoryPlanError(f"Storyline artifact root must be an object: {path}")
    return raw


def _storyline_plan_from_json(raw_artifact: dict[str, object]) -> StorylinePlan:
    schema_version = raw_artifact.get("schema_version")
    if schema_version == _LEGACY_STORYLINE_SCHEMA_VERSION:
        _validate_exact_keys(raw_artifact, allowed_keys=_LEGACY_ARTIFACT_KEYS, label="artifact")
        raw_reel_variants: list[object] = []
    elif schema_version == _STORYLINE_SCHEMA_VERSION:
        _validate_exact_keys(raw_artifact, allowed_keys=_ARTIFACT_KEYS, label="artifact")
        raw_reel_variants_value = raw_artifact.get("reel_variants")
        if not isinstance(raw_reel_variants_value, list):
            raise StoryPlanError("Storyline artifact reel_variants must be a list")
        raw_reel_variants = raw_reel_variants_value
    else:
        raise StoryPlanError("Unsupported storyline artifact schema version")
    raw_sequences = raw_artifact.get("sequences")
    if not isinstance(raw_sequences, list) or len(raw_sequences) != len(_SEQUENCE_NAMES):
        raise StoryPlanError("Storyline artifact must contain reel, carousel, and photo_set sequences")

    sequences_by_name: dict[str, ContentSequence] = {}
    for raw_sequence in raw_sequences:
        sequence = _content_sequence_from_json(raw_sequence)
        name = _required_sequence_name(raw_sequence)
        if name in sequences_by_name:
            raise StoryPlanError(f"Duplicate storyline sequence: {name}")
        sequences_by_name[name] = sequence

    if tuple(sequences_by_name) != _SEQUENCE_NAMES:
        raise StoryPlanError("Storyline sequences must be ordered as reel, carousel, and photo_set")
    return StorylinePlan(
        reel=sequences_by_name["reel"],
        carousel=sequences_by_name["carousel"],
        photo_set=sequences_by_name["photo_set"],
        reel_variants=tuple(_reel_variant_from_json(raw_variant) for raw_variant in raw_reel_variants),
    )


def _reel_variant_from_json(raw_variant: object) -> ReelVariant:
    if not isinstance(raw_variant, dict):
        raise StoryPlanError("Storyline reel variant must be an object")
    _validate_exact_keys(raw_variant, allowed_keys=_REEL_VARIANT_KEYS, label="reel variant")
    return ReelVariant(
        variant_id=_required_variant_id(raw_variant),
        sequence=ContentSequence(
            output_kind=_required_sequence_string(raw_variant, "output_kind"),
            aspect_ratio=_required_sequence_string(raw_variant, "aspect_ratio"),
            asset_paths=_required_asset_paths(raw_variant),
            total_duration_seconds=_optional_sequence_duration(raw_variant),
            rationale=_required_sequence_string(raw_variant, "rationale"),
        ),
    )


def _content_sequence_from_json(raw_sequence: object) -> ContentSequence:
    if not isinstance(raw_sequence, dict):
        raise StoryPlanError("Storyline sequence must be an object")
    _validate_exact_keys(raw_sequence, allowed_keys=_SEQUENCE_KEYS, label="sequence")
    return ContentSequence(
        output_kind=_required_sequence_string(raw_sequence, "output_kind"),
        aspect_ratio=_required_sequence_string(raw_sequence, "aspect_ratio"),
        asset_paths=_required_asset_paths(raw_sequence),
        total_duration_seconds=_optional_sequence_duration(raw_sequence),
        rationale=_required_sequence_string(raw_sequence, "rationale"),
    )


def _required_sequence_name(raw_sequence: object) -> str:
    if not isinstance(raw_sequence, dict):
        raise StoryPlanError("Storyline sequence must be an object")
    name = _required_sequence_string(raw_sequence, "name")
    if name not in _SEQUENCE_NAMES:
        raise StoryPlanError(f"Unknown storyline sequence: {name}")
    return name


def _required_variant_id(raw_variant: Mapping[str, object]) -> str:
    variant_id = _required_sequence_string(raw_variant, "variant_id")
    _validate_variant_id(variant_id)
    return variant_id


def _required_asset_paths(raw_sequence: Mapping[str, object]) -> tuple[str, ...]:
    asset_paths = raw_sequence.get("asset_paths")
    if not isinstance(asset_paths, list) or any(not isinstance(path, str) for path in asset_paths):
        raise StoryPlanError("Storyline sequence asset_paths must be a list of strings")
    return tuple(asset_paths)


def _required_sequence_string(raw_sequence: Mapping[str, object], key: str) -> str:
    value = raw_sequence.get(key)
    if not isinstance(value, str) or not value.strip():
        raise StoryPlanError(f"Storyline sequence field must be a non-empty string: {key}")
    return value


def _optional_sequence_duration(raw_sequence: Mapping[str, object]) -> float | None:
    value = raw_sequence.get("total_duration_seconds")
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise StoryPlanError("Storyline sequence duration must be a number or null")
    duration = float(value)
    if not math.isfinite(duration) or duration < 0:
        raise StoryPlanError("Storyline sequence duration must be non-negative")
    return duration


def _validate_exact_keys(
    raw_object: Mapping[str, object],
    *,
    allowed_keys: frozenset[str],
    label: str,
) -> None:
    actual_keys = set(raw_object)
    unexpected_keys = sorted(str(key) for key in actual_keys - allowed_keys)
    if unexpected_keys:
        raise StoryPlanError(
            f"Unexpected storyline {label} field: {', '.join(unexpected_keys)}"
        )
    missing_keys = sorted(allowed_keys - actual_keys)
    if missing_keys:
        raise StoryPlanError(f"Missing storyline {label} field: {', '.join(missing_keys)}")


def _reject_symlink(path: Path, label: str) -> None:
    if path.is_symlink():
        raise StoryPlanError(f"Refusing {label} symlink: {path}")


def _reject_symlink_path(path: Path, root: Path, label: str) -> None:
    current = path
    while True:
        if current.is_symlink():
            raise StoryPlanError(f"Refusing {label} symlink: {current}")
        if current == root or current.absolute() == root.absolute():
            break
        if current.parent == current:
            break
        current = current.parent


def _read_text_no_follow(path: Path) -> str:
    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        fd = os.open(path, flags)
    except FileNotFoundError:
        raise
    except OSError as exc:
        raise StoryPlanError(f"Unable to open storyline artifact: {path}") from exc
    try:
        with os.fdopen(fd, "r", encoding="utf-8") as f:
            return f.read()
    except Exception:
        os.close(fd)
        raise


def _write_bytes_no_follow(path: Path, content: bytes) -> None:
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        fd = os.open(path, flags, 0o600)
    except OSError as exc:
        raise StoryPlanError(
            f"Unable to create temporary storyline artifact: {path}"
        ) from exc
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(content)
    except OSError as exc:
        raise StoryPlanError(
            f"Unable to write temporary storyline artifact: {path}"
        ) from exc


def _quality_score(analysis: AssetAnalysis) -> float:
    return (
        analysis.aesthetic_score * 0.4
        + analysis.story_score * 0.3
        + analysis.technical_score * 0.2
        + analysis.motion_score * 0.1
    )
