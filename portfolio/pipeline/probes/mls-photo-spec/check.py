"""Apply the dated floor spec to one photo in the context of its folder."""

from __future__ import annotations

from pathlib import Path
from typing import NamedTuple

from image_header import ImageInfo, read_header
from spec import (
    ALLOWED_FORMATS,
    ASPECT_RATIOS,
    ASPECT_TOLERANCE,
    BRANDING_FILENAME_TOKENS,
    MAX_BYTES,
    MIN_LONG_EDGE_PX,
    SPEC_ID,
    STAGING_TOKENS,
)


class Finding(NamedTuple):
    rule: str
    path: Path
    detail: str
    severity: str  # blocking | degrading


class PhotoReport(NamedTuple):
    info: ImageInfo
    findings: tuple[Finding, ...]


IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}


def listing_photos(folder: Path) -> list[Path]:
    return sorted(
        p
        for p in folder.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_SUFFIXES
    )


def check_folder(folder: Path) -> list[PhotoReport]:
    photos = listing_photos(folder)
    names = {p.name.lower() for p in photos}
    return [check_photo(path, names) for path in photos]


def check_photo(path: Path, sibling_names: set[str] | None = None) -> PhotoReport:
    info = read_header(path)
    siblings = sibling_names if sibling_names is not None else set()
    findings: list[Finding] = []

    if info.unreadable:
        findings.append(
            Finding("unreadable", path, info.unreadable, "blocking")
        )
        return PhotoReport(info, tuple(findings))

    assert info.format is not None
    if info.format not in ALLOWED_FORMATS:
        findings.append(
            Finding(
                "format",
                path,
                f"{info.format} is not in {sorted(ALLOWED_FORMATS)}",
                "blocking",
            )
        )

    if info.nbytes > MAX_BYTES:
        findings.append(
            Finding(
                "byte_size",
                path,
                f"{info.nbytes} bytes exceeds {MAX_BYTES}",
                "blocking",
            )
        )

    if info.width is None or info.height is None:
        findings.append(
            Finding("long_edge", path, "dimensions missing after header parse", "blocking")
        )
    else:
        long_edge = max(info.width, info.height)
        if long_edge < MIN_LONG_EDGE_PX:
            findings.append(
                Finding(
                    "long_edge",
                    path,
                    f"long edge {long_edge}px < {MIN_LONG_EDGE_PX}px",
                    "blocking",
                )
            )
        if not _aspect_ok(info.width, info.height):
            findings.append(
                Finding(
                    "aspect",
                    path,
                    f"{info.width}x{info.height} matches no accepted ratio "
                    f"{list(ASPECT_RATIOS)} ±{ASPECT_TOLERANCE}",
                    "degrading",
                )
            )

    stem = path.stem.lower()
    hit = next((tok for tok in BRANDING_FILENAME_TOKENS if tok in stem), None)
    if hit:
        findings.append(
            Finding(
                "branding_filename",
                path,
                f"filename contains branding token {hit!r}",
                "blocking",
            )
        )

    if any(tok in stem for tok in STAGING_TOKENS) and not _has_original(path, siblings):
        findings.append(
            Finding(
                "staging_pair",
                path,
                "staged derivative has no sibling original (strip staged/virtual- tokens)",
                "blocking",
            )
        )

    return PhotoReport(info, tuple(findings))


def _aspect_ok(width: int, height: int) -> bool:
    if height == 0:
        return False
    ratio = width / height
    for w, h in ASPECT_RATIOS:
        expected = w / h
        if abs(ratio - expected) / expected <= ASPECT_TOLERANCE:
            return True
        # portrait of the same crop
        expected_p = h / w
        if abs(ratio - expected_p) / expected_p <= ASPECT_TOLERANCE:
            return True
    return False


def _has_original(path: Path, sibling_names: set[str]) -> bool:
    stem = path.stem
    lowered = stem.lower()
    stripped = stem
    for tok in STAGING_TOKENS:
        stripped = _replace_ci(stripped, tok, "")
    stripped = stripped.strip("-_ ")
    if not stripped:
        return False
    suffix = path.suffix.lower()
    candidates = {
        f"{stripped}{suffix}",
        f"{stripped}-original{suffix}",
        f"{stripped}_original{suffix}",
    }
    own = path.name.lower()
    return any(c.lower() != own and c.lower() in sibling_names for c in candidates)


def _replace_ci(text: str, token: str, repl: str) -> str:
    lower = text.lower()
    idx = lower.find(token)
    if idx < 0:
        return text
    return text[:idx] + repl + text[idx + len(token) :]


def spec_id() -> str:
    return SPEC_ID
