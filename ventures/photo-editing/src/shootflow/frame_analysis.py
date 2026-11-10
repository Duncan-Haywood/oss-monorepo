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
from shootflow.raw_develop import DevelopError, still_for_review
from shootflow.raw_preview import is_raw_path

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
_TILT_MIN_EDGES = 30
_TILT_MIN_ENERGY = 40.0
_TILT_MIN_COHERENCE = 0.5
_TILT_WINDOW_DEGREES = 1.5
_TILT_BINS_PER_DEGREE = 4
_TILT_SMOOTH_DEGREES = 1.5
_VIDEO_SIZE_PATTERN = re.compile(r"Video:.*?[\s,](\d{2,5})x(\d{2,5})[\s,\[]")
_SAMPLE_ASPECT_PATTERN = re.compile(r"SAR\s+(\d+):(\d+)")
_ROTATION_PATTERN = re.compile(r"rotation of\s+(-?\d+(?:\.\d+)?)")
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
    duration, aspect = _probe_stream(tools, source)
    if media_type != "video":
        duration = None
    frames = _decode_frames(tools, source, media_type=media_type, duration=duration)
    if not frames:
        raise FfmpegMediaError(f"ffmpeg decoded no frames from {source.name}")
    return metrics_from_frames(frames, duration_seconds=duration, source_aspect=aspect)


def _analyze_raw_preview(tools: FfmpegTools, source: Path) -> FrameMetrics:
    """Score a RAW still from its embedded JPEG preview, or a half-size DNG development."""

    with tempfile.TemporaryDirectory(prefix="shootflow-raw-") as scratch:
        try:
            still = still_for_review(source, scratch)
        except DevelopError as exc:
            raise FfmpegMediaError(f"could not develop {source.name}: {exc}") from exc
        if still is None:
            raise FfmpegMediaError(f"no embedded JPEG preview in {source.name}; convert it to DNG to develop it")
        _, aspect = _probe_stream(tools, still)
        frames = _decode_frames(tools, still, media_type="photo", duration=None)
    if not frames:
        raise FfmpegMediaError(f"ffmpeg decoded no frames from the preview in {source.name}")
    return metrics_from_frames(frames, source_aspect=aspect)


def metrics_from_frames(
    frames: list[bytes],
    *,
    duration_seconds: float | None = None,
    width: int = FRAME_WIDTH,
    height: int = FRAME_HEIGHT,
    source_aspect: float | None = None,
) -> FrameMetrics:
    """Compute metrics from raw 8-bit grayscale frames of ``width`` x ``height``.

    ``source_aspect`` is the picture's displayed width over height. The frames
    are stretched to ``width`` x ``height`` whatever the picture's shape, which
    squashes every angle; the tilt reading undoes that. ``None`` means the
    frames are taken as undistorted.
    """

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
    stretch = 1.0 if not source_aspect else source_aspect / (width / height)
    tilt, tilt_confidence = tilt_from_frame(frames[best], width, height, stretch)
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


def tilt_from_frame(
    frame: bytes, width: int = FRAME_WIDTH, height: int = FRAME_HEIGHT, stretch: float = 1.0
) -> tuple[float, float]:
    """Estimate how far the frame leans off level: ``(tilt_degrees, confidence)``.

    Sobel gradients are pooled over 5x5 windows into a structure tensor, which
    gives each window one edge direction and a coherence (1 for a straight edge,
    near 0 for texture, a corner or noise). Only coherent windows vote, with
    their edge energy times coherence, for the angle they sit off the nearest
    axis (horizon, doorframe, wall: the world is mostly axis aligned). The votes
    within 15 degrees of an axis go into quarter-degree bins, smoothed, and the
    estimate is the weighted mean of the votes within 1.5 degrees of the
    smoothed peak. Confidence is the share of near-axis vote weight inside that
    window beyond what an even spread would put there (chance, 10%), 0 when there are too few coherent edges (a plain sky, a texture) to
    say. Positive tilt means the right side is lower. A frame of tilted subjects
    (a diagonal staircase, a dancer) has confidence near 0 and is not penalised.

    ``stretch`` is the picture's aspect over the frame's: a 3:2 photo squashed
    into a 16:9 frame has stretch 0.84, and vertical differences are scaled by it
    so a 5 degree lean reads 5 degrees, not 4.
    """

    count = width * height
    gx = [0.0] * count
    gy = [0.0] * count
    for y in range(1, height - 1):
        above, row, below = (y - 1) * width, y * width, (y + 1) * width
        for x in range(1, width - 1):
            gx[row + x] = (
                frame[above + x + 1] + 2 * frame[row + x + 1] + frame[below + x + 1]
                - frame[above + x - 1] - 2 * frame[row + x - 1] - frame[below + x - 1]
            )
            gy[row + x] = (
                frame[below + x - 1] + 2 * frame[below + x] + frame[below + x + 1]
                - frame[above + x - 1] - 2 * frame[above + x] - frame[above + x + 1]
            ) * stretch
    reach = 2
    votes: list[tuple[float, float]] = []
    for y in range(reach, height - reach, 2):
        for x in range(reach, width - reach, 2):
            sxx = sxy = syy = 0.0
            for yy in range(y - reach, y + reach + 1):
                base = yy * width
                for xx in range(x - reach, x + reach + 1):
                    ax, ay = gx[base + xx], gy[base + xx]
                    sxx += ax * ax
                    sxy += ax * ay
                    syy += ay * ay
            energy = sxx + syy
            if energy < 4.0 * _TILT_MIN_ENERGY * _TILT_MIN_ENERGY:
                continue
            coherence = math.hypot(sxx - syy, 2.0 * sxy) / energy
            if coherence < _TILT_MIN_COHERENCE:
                continue
            # Direction of the gradient; the edge runs at right angles to it.
            angle = math.degrees(0.5 * math.atan2(2.0 * sxy, sxx - syy)) % 90.0
            votes.append((angle - 90.0 if angle > 45.0 else angle, math.sqrt(energy) * coherence))
    near = [(d, w) for d, w in votes if abs(d) <= _TILT_SEARCH_DEGREES]
    near_weight = sum(w for _, w in near)
    if len(near) < _TILT_MIN_EDGES or near_weight <= 0.0:
        return 0.0, 0.0
    per = _TILT_BINS_PER_DEGREE
    bins = [0.0] * (2 * _TILT_SEARCH_DEGREES * per + 1)
    for deviation, weight in near:
        bins[round((deviation + _TILT_SEARCH_DEGREES) * per)] += weight
    spread = int(3 * _TILT_SMOOTH_DEGREES * per)
    kernel = [math.exp(-0.5 * (i / (_TILT_SMOOTH_DEGREES * per)) ** 2) for i in range(-spread, spread + 1)]
    smooth = [
        sum(bins[j + i] * kernel[i + spread] for i in range(-spread, spread + 1) if 0 <= j + i < len(bins))
        for j in range(len(bins))
    ]
    peak = max(range(len(smooth)), key=lambda index: smooth[index]) / per - _TILT_SEARCH_DEGREES
    window = [(d, w) for d, w in near if abs(d - peak) <= _TILT_WINDOW_DEGREES]
    window_weight = sum(w for _, w in window)
    if window_weight <= 0.0:
        return 0.0, 0.0
    mean = sum(d * w for d, w in window) / window_weight
    # Votes spread evenly over the search range would still put this share
    # inside the window by chance; only the excess over that counts.
    chance = _TILT_WINDOW_DEGREES / _TILT_SEARCH_DEGREES
    return mean, _clamp((window_weight / near_weight - chance) / (1.0 - chance))


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


def _probe_stream(tools: FfmpegTools, source: Path) -> tuple[float | None, float | None]:
    """Read ``(duration seconds, displayed width / height)`` from ffmpeg's banner.

    Either is ``None`` when ffmpeg does not print it. The aspect allows for a
    non-square pixel and a sideways phone photo (a 90 degree display matrix).
    """

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
        return None, None
    banner = completed.stderr.decode("utf-8", errors="replace")
    duration = None
    match = _DURATION_PATTERN.search(banner)
    if match is not None:
        hours, minutes, seconds = match.groups()
        duration = round(int(hours) * 3600 + int(minutes) * 60 + float(seconds), 3)
    return duration, _aspect_from_banner(banner)


def _aspect_from_banner(banner: str) -> float | None:
    size = _VIDEO_SIZE_PATTERN.search(banner)
    if size is None:
        return None
    width, height = float(size.group(1)), float(size.group(2))
    sample = _SAMPLE_ASPECT_PATTERN.search(banner)
    if sample is not None and int(sample.group(1)) > 0 and int(sample.group(2)) > 0:
        width = width * int(sample.group(1)) / int(sample.group(2))
    rotation = _ROTATION_PATTERN.search(banner)
    if rotation is not None and round(float(rotation.group(1)) / 90.0) % 2 != 0:
        width, height = height, width
    return width / height


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
