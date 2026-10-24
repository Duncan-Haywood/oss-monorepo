"""Measured frame quality for the analysis stage: sharpness, exposure, motion, hash.

Replaces the sha256-derived stand-in scores with numbers read from the pixels.
ffmpeg decodes a few grayscale frames to a pipe and the metrics are plain
Python, so nothing beyond ffmpeg is needed:

- ``sharpness``: variance of the Laplacian (blur lowers it) with the grain's
  share taken out, squashed to 0..1. Grain alone raises a raw Laplacian
  variance, so a noisy high-ISO frame would otherwise read as sharp.
- ``noise_sigma`` / ``noise``: sensor grain as a standard deviation in 8-bit
  levels (Immerkaer's 3x3 mask, read with a median so edges do not count), and
  a 0..1 level of it; heavy grain costs up to 15% of ``technical_score``.
- ``exposure``: closeness of mean luma to mid-grey, minus clipped shadows and
  highlights.
- ``contrast``: luma standard deviation.
- ``motion``: mean absolute difference between sampled frames (video only).
- ``framing``: where the detail sits in the frame (detail-energy centroid against
  the rule-of-thirds points, and how much of the detail one region holds).
- ``tilt_degrees`` / ``level``: how far the dominant near-horizontal or
  near-vertical edges lean off the axes (positive: right side lower), and a
  0..1 score that is 1.0 when level; a crooked horizon costs a little story score.
- ``dhash``: 64-bit difference hash of the middle frame, for near-duplicate
  grouping by Hamming distance.

These are technical signals. There is no face detector and no semantic model
here, so ``framing`` finds where the detail is, not what it is, and ``story``
is a proxy; the analysis payload says so.
"""

from __future__ import annotations

import math
import re
import subprocess
from dataclasses import dataclass
import tempfile
from pathlib import Path

from shootflow.ffmpeg_media import FfmpegMediaError, FfmpegTools
from shootflow.raw_preview import extract_preview, is_raw_path

FRAME_WIDTH = 320
FRAME_HEIGHT = 180
MAX_VIDEO_FRAMES = 12
_FRAME_BYTES = FRAME_WIDTH * FRAME_HEIGHT
_DURATION_PATTERN = re.compile(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)")
_SHARPNESS_HALF_POINT = 60.0
_DECODE_TIMEOUT_SECONDS = 300.0
_TILT_FREE_DEGREES = 0.5
_TILT_FULL_PENALTY_DEGREES = 5.0
_TILT_STORY_WEIGHT = 0.08
_TILT_SEARCH_DEGREES = 15
_TILT_MIN_EDGES = 200
_NOISE_FREE_SIGMA = 2.0
_NOISE_FULL_PENALTY_SIGMA = 12.0
_NOISE_TECHNICAL_WEIGHT = 0.15
# Variance the 4-neighbour Laplacian (1, 1, 1, 1, -4) adds to white noise of sigma 1.
_LAPLACIAN_NOISE_GAIN = 20.0


@dataclass(frozen=True)
class FrameMetrics:
    sharpness: float
    exposure: float
    contrast: float
    motion: float
    framing: float
    subject_x: float
    subject_y: float
    mean_luma: float
    clipped_shadows: float
    clipped_highlights: float
    dhash: str
    tilt_degrees: float
    tilt_confidence: float
    noise_sigma: float
    frames_sampled: int
    duration_seconds: float | None

    @property
    def level(self) -> float:
        # Under half a degree is not noticed; 5 degrees or more is plainly crooked.
        excess = max(0.0, abs(self.tilt_degrees) - _TILT_FREE_DEGREES)
        return _clamp(1.0 - excess / (_TILT_FULL_PENALTY_DEGREES - _TILT_FREE_DEGREES))

    @property
    def noise(self) -> float:
        # Under 2 levels of grain is clean; 12 or more is plainly noisy.
        return _clamp((self.noise_sigma - _NOISE_FREE_SIGMA) / (_NOISE_FULL_PENALTY_SIGMA - _NOISE_FREE_SIGMA))

    @property
    def technical_score(self) -> float:
        return _clamp(0.6 * self.sharpness + 0.4 * self.exposure - _NOISE_TECHNICAL_WEIGHT * self.noise)

    @property
    def aesthetic_score(self) -> float:
        return _clamp(0.5 * self.exposure + 0.3 * self.contrast + 0.2 * self.sharpness)

    @property
    def story_score(self) -> float:
        # No semantic model: a documented blend of the measured scores.
        base = 0.6 * self.aesthetic_score + 0.4 * self.technical_score
        crooked = (1.0 - self.level) * self.tilt_confidence
        return _clamp(0.85 * base + 0.15 * self.framing - _TILT_STORY_WEIGHT * crooked)


def analyze_media(tools: FfmpegTools, source: Path, *, media_type: str) -> FrameMetrics:
    """Measure one photo or video; raise ``FfmpegMediaError`` if it cannot be decoded."""

    if media_type == "photo" and is_raw_path(source):
        return _analyze_raw_preview(tools, source)
    duration = _probe_duration(tools, source) if media_type == "video" else None
    frames = _decode_frames(tools, source, media_type=media_type, duration=duration)
    if not frames:
        raise FfmpegMediaError(f"ffmpeg decoded no frames from {source.name}")
    return metrics_from_frames(frames, duration_seconds=duration)


def _analyze_raw_preview(tools: FfmpegTools, source: Path) -> FrameMetrics:
    """Score a RAW still from the JPEG preview the camera embedded in it."""

    preview = extract_preview(source)
    if preview is None:
        raise FfmpegMediaError(f"no embedded JPEG preview in {source.name}; develop it first")
    with tempfile.TemporaryDirectory(prefix="shootflow-raw-") as scratch:
        jpeg = Path(scratch) / "preview.jpg"
        jpeg.write_bytes(preview)
        frames = _decode_frames(tools, jpeg, media_type="photo", duration=None)
    if not frames:
        raise FfmpegMediaError(f"ffmpeg decoded no frames from the preview in {source.name}")
    return metrics_from_frames(frames)


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
    noise_sigmas = [noise_sigma_from_frame(frame, width, height) for frame in frames]
    sharpness_values = [
        max(0.0, _laplacian_variance(frame, width, height) - _LAPLACIAN_NOISE_GAIN * sigma * sigma)
        for frame, sigma in zip(frames, noise_sigmas)
    ]
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
    framing, subject_x, subject_y = framing_from_frame(frames[best], width, height)
    tilt, tilt_confidence = tilt_from_frame(frames[best], width, height)
    noise_sigma = noise_sigmas[best]
    return FrameMetrics(
        sharpness=round(variance / (variance + _SHARPNESS_HALF_POINT), 6),
        exposure=round(_clamp(exposure), 6),
        contrast=round(_clamp(std / 64.0), 6),
        motion=round(motion, 6),
        framing=round(framing, 6),
        subject_x=round(subject_x, 6),
        subject_y=round(subject_y, 6),
        mean_luma=round(mean, 3),
        clipped_shadows=round(shadows, 6),
        clipped_highlights=round(highlights, 6),
        dhash=dhash_hex(middle, width, height),
        tilt_degrees=round(tilt, 3),
        tilt_confidence=round(tilt_confidence, 6),
        noise_sigma=round(noise_sigma, 3),
        frames_sampled=len(frames),
        duration_seconds=duration_seconds,
    )


_FRAMING_GRID = 8
_THIRDS = ((1 / 3, 1 / 3), (2 / 3, 1 / 3), (1 / 3, 2 / 3), (2 / 3, 2 / 3))


def framing_from_frame(frame: bytes, width: int = FRAME_WIDTH, height: int = FRAME_HEIGHT) -> tuple[float, float, float]:
    """Score subject placement from where the detail is: ``(framing, x, y)``.

    Gradient energy is summed on an 8x8 grid. The subject is taken to be the
    detail-weighted centroid (x, y in 0..1). Placement scores 1.0 on a
    rule-of-thirds point or the exact centre and falls off with distance;
    isolation rewards a frame whose detail sits in a few cells (a subject
    against a plain background) over an even texture. A frame with no detail
    has no subject and scores 0.5, so it neither wins nor loses on framing.
    """

    grid = _FRAMING_GRID
    cells = [0.0] * (grid * grid)
    for y in range(1, height - 1):
        row, below = y * width, (y + 1) * width
        gy = y * grid // height
        for x in range(1, width - 1):
            gx = x * grid // width
            cells[gy * grid + gx] += abs(frame[row + x + 1] - frame[row + x - 1]) + abs(frame[below + x] - frame[row - width + x])
    total = sum(cells)
    if total < 1.0 * len(cells):
        return 0.5, 0.5, 0.5
    cx = sum(cells[r * grid + c] * (c + 0.5) for r in range(grid) for c in range(grid)) / total / grid
    cy = sum(cells[r * grid + c] * (r + 0.5) for r in range(grid) for c in range(grid)) / total / grid
    nearest = min(math.hypot(cx - px, cy - py) for px, py in (*_THIRDS, (0.5, 0.5)))
    placement = max(0.0, 1.0 - nearest / 0.25)
    top_quarter = sum(sorted(cells, reverse=True)[: len(cells) // 4]) / total
    isolation = _clamp((top_quarter - 0.25) / 0.65)
    return _clamp(0.6 * placement + 0.4 * isolation), cx, cy


def tilt_from_frame(frame: bytes, width: int = FRAME_WIDTH, height: int = FRAME_HEIGHT) -> tuple[float, float]:
    """Estimate how far the frame leans off level: ``(tilt_degrees, confidence)``.

    Strong edges vote with their gradient magnitude for the angle they sit off
    the nearest axis (horizon, doorframe, wall: the world is mostly axis
    aligned). The estimate is the weighted mean angle of the votes within
    15 degrees of an axis, around the busiest degree. Confidence is the share
    of strong-edge weight inside that window, 0 when there are too few strong
    edges (a plain sky, a texture) to say. Positive tilt means the right side is
    lower. A frame of tilted subjects (a diagonal staircase, a dancer) has
    confidence near 0 and is not penalised.
    """

    votes: list[tuple[float, float]] = []
    for y in range(1, height - 1):
        row, below, above = y * width, (y + 1) * width, (y - 1) * width
        for x in range(1, width - 1):
            gx = frame[row + x + 1] - frame[row + x - 1]
            gy = frame[below + x] - frame[above + x]
            magnitude = math.hypot(gx, gy)
            if magnitude < 20.0:
                continue
            angle = math.degrees(math.atan2(gy, gx)) % 90.0
            votes.append((angle - 90.0 if angle > 45.0 else angle, magnitude))
    if len(votes) < _TILT_MIN_EDGES:
        return 0.0, 0.0
    # Votes near +-45 degrees are diagonals, not horizons; the window ignores them.
    bins = [0.0] * (2 * _TILT_SEARCH_DEGREES + 1)
    for deviation, weight in votes:
        if abs(deviation) <= _TILT_SEARCH_DEGREES:
            bins[round(deviation) + _TILT_SEARCH_DEGREES] += weight
    peak = max(range(len(bins)), key=lambda index: bins[index]) - _TILT_SEARCH_DEGREES
    window = [(d, w) for d, w in votes if abs(d - peak) <= 1.5]
    window_weight = sum(w for _, w in window)
    if window_weight <= 0.0:
        return 0.0, 0.0
    mean = sum(d * w for d, w in window) / window_weight
    confidence = window_weight / sum(w for _, w in votes)
    return mean, _clamp(confidence)


def noise_sigma_from_frame(frame: bytes, width: int = FRAME_WIDTH, height: int = FRAME_HEIGHT) -> float:
    """Estimate sensor grain as a standard deviation in 8-bit levels.

    Immerkaer's mask (1 -2 1 / -2 4 -2 / 1 -2 1) cancels smooth gradients and
    straight edges, and its response to white noise of sigma has standard
    deviation 6 * sigma. Reading the median absolute response (0.6745 of the
    standard deviation for a Gaussian) instead of the mean keeps edges and
    texture, which are a minority of pixels, from being counted as grain. Frames
    are downscaled before this runs, so it reads grain that survives at that
    size; a frame with more than half its pixels in texture overstates it.
    """

    responses: list[int] = []
    for y in range(1, height - 1):
        above, row, below = (y - 1) * width, y * width, (y + 1) * width
        for x in range(1, width - 1):
            responses.append(
                abs(
                    frame[above + x - 1] + frame[above + x + 1] + frame[below + x - 1] + frame[below + x + 1]
                    - 2 * (frame[above + x] + frame[below + x] + frame[row + x - 1] + frame[row + x + 1])
                    + 4 * frame[row + x]
                )
            )
    if not responses:
        return 0.0
    responses.sort()
    return responses[len(responses) // 2] / (0.6745 * 6.0)


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
