"""Measured frame quality for the analysis stage: sharpness, exposure, motion, hash.

Replaces the sha256-derived stand-in scores with numbers read from the pixels.
ffmpeg decodes a few grayscale frames to a pipe and the metrics are plain
Python, so nothing beyond ffmpeg is needed:

- ``sharpness``: variance of the Laplacian (blur lowers it), squashed to 0..1.
- ``exposure``: closeness of mean luma to mid-grey, minus clipped shadows and
  highlights.
- ``contrast``: luma standard deviation.
- ``motion``: mean absolute difference between sampled frames (video only).
- ``dhash``: 64-bit difference hash of the middle frame, for near-duplicate
  grouping by Hamming distance.

These are technical signals. There is no face detector and no semantic model
here, so ``story`` is a proxy and the analysis payload says so.
"""

from __future__ import annotations

import math
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

from shootflow.ffmpeg_media import FfmpegMediaError, FfmpegTools

FRAME_WIDTH = 320
FRAME_HEIGHT = 180
MAX_VIDEO_FRAMES = 12
_FRAME_BYTES = FRAME_WIDTH * FRAME_HEIGHT
_DURATION_PATTERN = re.compile(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)")
_SHARPNESS_HALF_POINT = 60.0
_DECODE_TIMEOUT_SECONDS = 300.0


@dataclass(frozen=True)
class FrameMetrics:
    sharpness: float
    exposure: float
    contrast: float
    motion: float
    mean_luma: float
    clipped_shadows: float
    clipped_highlights: float
    dhash: str
    frames_sampled: int
    duration_seconds: float | None

    @property
    def technical_score(self) -> float:
        return _clamp(0.6 * self.sharpness + 0.4 * self.exposure)

    @property
    def aesthetic_score(self) -> float:
        return _clamp(0.5 * self.exposure + 0.3 * self.contrast + 0.2 * self.sharpness)

    @property
    def story_score(self) -> float:
        # No semantic model: a documented blend of the two measured scores.
        return _clamp(0.6 * self.aesthetic_score + 0.4 * self.technical_score)


def analyze_media(tools: FfmpegTools, source: Path, *, media_type: str) -> FrameMetrics:
    """Measure one photo or video; raise ``FfmpegMediaError`` if it cannot be decoded."""

    duration = _probe_duration(tools, source) if media_type == "video" else None
    frames = _decode_frames(tools, source, media_type=media_type, duration=duration)
    if not frames:
        raise FfmpegMediaError(f"ffmpeg decoded no frames from {source.name}")
    return metrics_from_frames(frames, duration_seconds=duration)


def metrics_from_frames(
    frames: list[bytes],
    *,
    duration_seconds: float | None = None,
    width: int = FRAME_WIDTH,
    height: int = FRAME_HEIGHT,
) -> FrameMetrics:
    """Compute metrics from raw 8-bit grayscale frames of ``width`` x ``height``."""

    if not frames:
        raise ValueError("at least one frame is required")
    sharpness_values = [_laplacian_variance(frame, width, height) for frame in frames]
    # The sharpest frame is the representative one for a clip's exposure and hash.
    best = max(range(len(frames)), key=lambda index: sharpness_values[index])
    middle = frames[len(frames) // 2]
    mean, std, shadows, highlights = _luma_stats(frames[best])
    exposure = max(0.0, 1.0 - abs(mean - 120.0) / 120.0) * (1.0 - min(1.0, 2.0 * (shadows + highlights)))
    motion = 0.0
    if len(frames) > 1:
        diffs = [_mean_abs_diff(a, b) for a, b in zip(frames, frames[1:])]
        motion = _clamp(sum(diffs) / len(diffs) / 32.0)
    variance = sorted(sharpness_values)[len(sharpness_values) // 2]
    return FrameMetrics(
        sharpness=round(variance / (variance + _SHARPNESS_HALF_POINT), 6),
        exposure=round(_clamp(exposure), 6),
        contrast=round(_clamp(std / 64.0), 6),
        motion=round(motion, 6),
        mean_luma=round(mean, 3),
        clipped_shadows=round(shadows, 6),
        clipped_highlights=round(highlights, 6),
        dhash=dhash_hex(middle, width, height),
        frames_sampled=len(frames),
        duration_seconds=duration_seconds,
    )


def dhash_hex(frame: bytes, width: int = FRAME_WIDTH, height: int = FRAME_HEIGHT) -> str:
    """64-bit difference hash: compare horizontally adjacent cells of a 9x8 box average."""

    cols, rows = 9, 8
    cells = [[0.0] * cols for _ in range(rows)]
    for row in range(rows):
        y0, y1 = row * height // rows, (row + 1) * height // rows
        for col in range(cols):
            x0, x1 = col * width // cols, (col + 1) * width // cols
            total = 0
            for y in range(y0, y1):
                base = y * width
                total += sum(frame[base + x0 : base + x1])
            cells[row][col] = total / ((y1 - y0) * (x1 - x0))
    bits = 0
    for row in range(rows):
        for col in range(cols - 1):
            bits = (bits << 1) | (1 if cells[row][col] > cells[row][col + 1] else 0)
    return f"{bits:016x}"


def hamming_distance(hash_a: str, hash_b: str) -> int:
    return bin(int(hash_a, 16) ^ int(hash_b, 16)).count("1")


def _decode_frames(
    tools: FfmpegTools, source: Path, *, media_type: str, duration: float | None
) -> list[bytes]:
    scale = f"scale={FRAME_WIDTH}:{FRAME_HEIGHT}:flags=area,format=gray"
    command = [tools.ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin", "-i", f"file:{source}"]
    if media_type == "video":
        span = duration if duration and duration > 0 else float(MAX_VIDEO_FRAMES)
        rate = max(0.01, min(2.0, MAX_VIDEO_FRAMES / span))
        command += ["-vf", f"fps={rate:.6f},{scale}", "-frames:v", str(MAX_VIDEO_FRAMES)]
    else:
        command += ["-vf", scale, "-frames:v", "1"]
    command += ["-an", "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"]
    try:
        completed = subprocess.run(
            command,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=_DECODE_TIMEOUT_SECONDS,
            check=False,
        )
    except FileNotFoundError as exc:
        raise FfmpegMediaError(f"ffmpeg executable not found: {tools.ffmpeg}") from exc
    except subprocess.TimeoutExpired as exc:
        raise FfmpegMediaError("ffmpeg frame decode timed out") from exc
    if completed.returncode != 0:
        detail = completed.stderr.decode("utf-8", errors="replace").strip()[-300:]
        raise FfmpegMediaError(f"ffmpeg could not decode {source.name}: {detail or 'no stderr'}")
    data = completed.stdout
    return [data[i : i + _FRAME_BYTES] for i in range(0, len(data) - _FRAME_BYTES + 1, _FRAME_BYTES)]


def _probe_duration(tools: FfmpegTools, source: Path) -> float | None:
    try:
        completed = subprocess.run(
            [tools.ffmpeg, "-hide_banner", "-nostdin", "-i", f"file:{source}"],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            timeout=60.0,
            check=False,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None
    match = _DURATION_PATTERN.search(completed.stderr.decode("utf-8", errors="replace"))
    if match is None:
        return None
    hours, minutes, seconds = match.groups()
    return round(int(hours) * 3600 + int(minutes) * 60 + float(seconds), 3)


def _laplacian_variance(frame: bytes, width: int, height: int) -> float:
    total = 0.0
    total_sq = 0.0
    count = 0
    for y in range(1, height - 1):
        above, row, below = (y - 1) * width, y * width, (y + 1) * width
        for x in range(1, width - 1):
            value = frame[above + x] + frame[below + x] + frame[row + x - 1] + frame[row + x + 1] - 4 * frame[row + x]
            total += value
            total_sq += value * value
            count += 1
    mean = total / count
    return max(0.0, total_sq / count - mean * mean)


def _luma_stats(frame: bytes) -> tuple[float, float, float, float]:
    histogram = [0] * 256
    for value in frame:
        histogram[value] += 1
    n = len(frame)
    mean = sum(level * count for level, count in enumerate(histogram)) / n
    variance = sum(count * (level - mean) ** 2 for level, count in enumerate(histogram)) / n
    shadows = sum(histogram[:8]) / n
    highlights = sum(histogram[248:]) / n
    return mean, math.sqrt(variance), shadows, highlights


def _mean_abs_diff(a: bytes, b: bytes) -> float:
    return sum(abs(x - y) for x, y in zip(a, b)) / len(a)


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, value))
