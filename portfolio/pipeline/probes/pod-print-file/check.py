"""Apply the dated floor spec to one art file in a folder."""

from __future__ import annotations

import re
from pathlib import Path
from typing import NamedTuple

from image_header import ImageInfo, read_header
from spec import (
    ALLOWED_FORMATS,
    ASPECT_TOLERANCE,
    MAX_BYTES,
    MIN_IMPLIED_DPI,
    PIXEL_FLOOR_SHORT_EDGE,
    PRINT_SIZES_IN,
    SPEC_ID,
    WEB_FILENAME_TOKENS,
)

SIZE_TOKEN = re.compile(r"(?<![0-9])(\d{1,2})x(\d{1,2})(?![0-9])", re.I)


class Finding(NamedTuple):
    rule: str
    path: Path
    detail: str
    severity: str  # blocking | degrading


class FileReport(NamedTuple):
    info: ImageInfo
    findings: tuple[Finding, ...]
    size_token: str | None


IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}


def print_files(folder: Path) -> list[Path]:
    return sorted(
        p
        for p in folder.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_SUFFIXES
    )


def check_folder(folder: Path) -> list[FileReport]:
    return [check_file(path) for path in print_files(folder)]


def check_file(path: Path) -> FileReport:
    info = read_header(path)
    findings: list[Finding] = []
    token = _size_token(path)

    if info.unreadable:
        findings.append(Finding("unreadable", path, info.unreadable, "blocking"))
        return FileReport(info, tuple(findings), token)

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

    stem = path.stem.lower()
    hit = next((tok for tok in WEB_FILENAME_TOKENS if tok in stem), None)
    if hit:
        findings.append(
            Finding(
                "web_filename",
                path,
                f"filename contains web-export token {hit!r}",
                "blocking",
            )
        )

    if info.width is None or info.height is None:
        findings.append(
            Finding(
                "pixel_floor",
                path,
                "dimensions missing after header parse",
                "blocking",
            )
        )
        return FileReport(info, tuple(findings), token)

    if token is None:
        short = min(info.width, info.height)
        if short < PIXEL_FLOOR_SHORT_EDGE:
            findings.append(
                Finding(
                    "pixel_floor",
                    path,
                    f"short edge {short}px < {PIXEL_FLOOR_SHORT_EDGE}px "
                    f"and filename names no print size",
                    "blocking",
                )
            )
    else:
        inches = PRINT_SIZES_IN[token]
        oriented = _orient(info.width, info.height, inches)
        implied = (
            info.width / oriented[0],
            info.height / oriented[1],
        )
        min_dpi = min(implied)
        if min_dpi < MIN_IMPLIED_DPI:
            findings.append(
                Finding(
                    "implied_dpi",
                    path,
                    f"implied DPI {min_dpi:.1f} at {token} "
                    f"({info.width}x{info.height}px / {oriented[0]}x{oriented[1]}in) "
                    f"< {MIN_IMPLIED_DPI}",
                    "blocking",
                )
            )
        if not _aspect_ok(info.width, info.height, inches):
            findings.append(
                Finding(
                    "named_aspect",
                    path,
                    f"{info.width}x{info.height} matches neither "
                    f"{inches[0]}:{inches[1]} nor {inches[1]}:{inches[0]} "
                    f"±{ASPECT_TOLERANCE}",
                    "degrading",
                )
            )

    return FileReport(info, tuple(findings), token)


def _size_token(path: Path) -> str | None:
    match = SIZE_TOKEN.search(path.stem)
    if not match:
        return None
    a, b = int(match.group(1)), int(match.group(2))
    key = f"{min(a, b)}x{max(a, b)}"
    return key if key in PRINT_SIZES_IN else None


def _orient(width: int, height: int, inches: tuple[int, int]) -> tuple[int, int]:
    """Pick the inch pair whose aspect is closer to the pixel aspect."""
    if height == 0:
        return inches
    ratio = width / height
    portrait = inches
    landscape = (inches[1], inches[0])
    err_p = abs(ratio - portrait[0] / portrait[1])
    err_l = abs(ratio - landscape[0] / landscape[1])
    return landscape if err_l < err_p else portrait


def _aspect_ok(width: int, height: int, inches: tuple[int, int]) -> bool:
    if height == 0 or inches[1] == 0:
        return False
    ratio = width / height
    for w, h in (inches, (inches[1], inches[0])):
        expected = w / h
        if abs(ratio - expected) / expected <= ASPECT_TOLERANCE:
            return True
    return False


def spec_id() -> str:
    return SPEC_ID
