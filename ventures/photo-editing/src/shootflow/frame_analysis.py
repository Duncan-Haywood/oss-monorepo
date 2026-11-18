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
- ``dhash_crops``: the same hash over a 5 x 5 grid of windows, each 88% of the
  frame, so two frames of one burst that the camera panned or zoomed a few
  percent between can still be matched window to window (``crop_distance``).
- ``dhash_zooms``: the hash over smaller windows (90-96% of the frame, 5 x 5
  positions each), so a frame zoomed 4-10% tighter than its neighbour matches
  that neighbour's window of the same size (``zoom_distance``).
- ``dhash_fine``: the same 88% windows at 24 more offsets (1% and 2% of the
  frame on either axis), so with the crop windows they form a 7 x 7 grid whose
  offsets differ by every whole percent from 0 to 12: a pan that moves the
  content by an amount between the crop grid's 3% steps still finds a window
  pair within half a percent of it (``fine_distance``).

These are technical signals. There is no face detector and no semantic model
here, so ``framing`` finds where the detail is, not what it is, and ``story``
is a proxy; the analysis payload says so.
"""

from __future__ import annotations

import math
import operator
import re
import subprocess
from dataclasses import dataclass
import tempfile
from collections.abc import Sequence
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
    dhash_crops: tuple[str, ...] = ()
    dhash_zooms: tuple[str, ...] = ()
    dhash_fine: tuple[str, ...] = ()

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
        dhash_crops=crop_dhashes(middle, width, height),
        dhash_zooms=zoom_dhashes(middle, width, height),
        dhash_fine=fine_dhashes(middle, width, height),
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


# Crop windows for burst grouping: each window is (1 - margin) of the frame, at
# CROP_STEPS x CROP_STEPS offsets from the top-left to the bottom-right corner.
# Measured 2026-11-17 on 331 real photos (eval/cull-crop-grouping-2026-11-17.md).
CROP_MARGIN = 0.12
CROP_STEPS = 5
_CROP_CENTRE = (CROP_STEPS * CROP_STEPS) // 2


def _integral(frame: bytes, width: int, height: int) -> list[list[int]]:
    rows = [[0] * (width + 1)]
    for y in range(height):
        previous = rows[-1]
        running = 0
        row = [0]
        base = y * width
        for x in range(width):
            running += frame[base + x]
            row.append(previous[x + 1] + running)
        rows.append(row)
    return rows


def _window_dhash(table: list[list[int]], x0: float, y0: float, w: float, h: float) -> int:
    cols, rows = 9, 8
    xs = [round(x0 + col * w / cols) for col in range(cols + 1)]
    ys = [round(y0 + row * h / rows) for row in range(rows + 1)]
    bits = 0
    for row in range(rows):
        top, bottom = table[ys[row]], table[ys[row + 1]]
        span = ys[row + 1] - ys[row]
        cells = [
            (bottom[xs[c + 1]] - bottom[xs[c]] - top[xs[c + 1]] + top[xs[c]]) / (span * (xs[c + 1] - xs[c]))
            for c in range(cols)
        ]
        for col in range(cols - 1):
            bits = (bits << 1) | (1 if cells[col] > cells[col + 1] else 0)
    return bits


def crop_dhashes(frame: bytes, width: int = FRAME_WIDTH, height: int = FRAME_HEIGHT) -> tuple[str, ...]:
    """Difference hashes of CROP_STEPS x CROP_STEPS windows, row by row; the middle one is centred."""

    table = _integral(frame, width, height)
    hashes = []
    for j in range(CROP_STEPS):
        for i in range(CROP_STEPS):
            x0 = CROP_MARGIN * width * i / (CROP_STEPS - 1)
            y0 = CROP_MARGIN * height * j / (CROP_STEPS - 1)
            bits = _window_dhash(table, x0, y0, (1 - CROP_MARGIN) * width, (1 - CROP_MARGIN) * height)
            hashes.append(f"{bits:016x}")
    return tuple(hashes)


def crop_distance(crops_a: Sequence[int], crops_b: Sequence[int]) -> int:
    """Smallest Hamming distance between one frame's centre window and any window of the other.

    A pan or zoom of a few percent moves the shared content by about one
    window step, so one of these pairs lines it up again. Takes parsed hashes
    (ints) because the cull compares every pair of photos. Returns 64 when
    either frame has no crop hashes.
    """

    if len(crops_a) != CROP_STEPS * CROP_STEPS or len(crops_b) != len(crops_a):
        return 64
    centre_a, centre_b = crops_a[_CROP_CENTRE], crops_b[_CROP_CENTRE]
    best = 64
    for a, b in zip(crops_a, crops_b):
        best = min(best, (a ^ centre_b).bit_count(), (centre_a ^ b).bit_count())
    return best


def _pan_pairs() -> tuple[tuple[int, int], ...]:
    """(window of a, window of b) for each window offset ``crop_distance`` cannot reach.

    ``crop_distance`` holds one frame at its centre window, so it reaches
    offsets of up to half the margin. A wider pan needs an off-centre window on
    both sides: for each offset beyond that, the one pair nearest the middle of
    both frames.
    """

    n, c = CROP_STEPS, CROP_STEPS // 2
    out = []
    for dy in range(1 - n, n):
        for dx in range(1 - n, n):
            if abs(dx) <= c and abs(dy) <= c:
                continue
            candidates = [
                (ay * n + ax, (ay - dy) * n + (ax - dx))
                for ay in range(n)
                for ax in range(n)
                if 0 <= ay - dy < n and 0 <= ax - dx < n
            ]

            def spread(pair: tuple[int, int]) -> int:
                return sum(abs(k // n - c) + abs(k % n - c) for k in pair)

            out.append(min(candidates, key=spread))
    return tuple(out)


_PAN_PAIRS = _pan_pairs()


def _pan_other_pairs() -> tuple[tuple[int, int], ...]:
    """Every other (window of a, window of b) at the offsets ``_PAN_PAIRS`` covers with one pair.

    A 10% pan moves the content 11.1%, between the grid's 9% and 12% offsets,
    and the one pair nearest the middle often sits a few bits too far apart
    while another pair at the same offset lines up (eval/cull-pan-all-pairs-2026-11-18.md).
    """

    n, c = CROP_STEPS, CROP_STEPS // 2
    chosen = set(_PAN_PAIRS)
    out = []
    for dy in range(1 - n, n):
        for dx in range(1 - n, n):
            if abs(dx) <= c and abs(dy) <= c:
                continue
            out += [
                pair
                for ay in range(n)
                for ax in range(n)
                if 0 <= ay - dy < n and 0 <= ax - dx < n
                and (pair := (ay * n + ax, (ay - dy) * n + (ax - dx))) not in chosen
            ]
    return tuple(out)


_PAN_OTHER_PAIRS = _pan_other_pairs()
# itemgetter and map keep the comparison in C: the cull runs it for most pairs.
_PAN_A = operator.itemgetter(*(x for x, _ in _PAN_PAIRS))
_PAN_B = operator.itemgetter(*(y for _, y in _PAN_PAIRS))


def pan_other_distance(crops_a: Sequence[int], crops_b: Sequence[int]) -> int:
    """Smallest Hamming distance over ``_PAN_OTHER_PAIRS``; 64 when either frame has no crop hashes."""

    if len(crops_a) != CROP_STEPS * CROP_STEPS or len(crops_b) != len(crops_a):
        return 64
    return min((crops_a[x] ^ crops_b[y]).bit_count() for x, y in _PAN_OTHER_PAIRS)


def pan_distance(crops_a: Sequence[int], crops_b: Sequence[int]) -> int:
    """Smallest Hamming distance over the window pairs offset further than ``crop_distance`` reaches.

    A pan of s keeps 1 - s of the scene, so after scaling to the frame the
    content moves s / (1 - s): 8.7% for an 8% pan and 11.1% for 10%, past the
    6% the centre window reaches with a 12% margin. Both directions are covered
    because ``_PAN_PAIRS`` holds every offset with its opposite. Returns 64 when
    either frame has no crop hashes (eval/cull-pan-windows-2026-11-18.md).
    """

    if len(crops_a) != CROP_STEPS * CROP_STEPS or len(crops_b) != len(crops_a):
        return 64
    return min(map(int.bit_count, map(int.__xor__, _PAN_A(crops_a), _PAN_B(crops_b))))


# Packed form for the cull's all-pairs scan: each frame's windows in _PAN_PAIRS
# order as one integer of 64-bit lanes, so one XOR compares all 56 pairs and a
# lane-wise (SWAR) popcount answers "is any lane within the limit" in about a
# dozen big-integer operations instead of 56 Python-level ones.
_PAN_LANES = len(_PAN_PAIRS)


def _lanes(byte: int) -> int:
    """``byte`` repeated in every byte of every lane."""

    return int.from_bytes(bytes([byte]) * (8 * _PAN_LANES), "little")


_M1, _M2, _M4 = _lanes(0x55), _lanes(0x33), _lanes(0x0F)
_LANE_LOW = sum(0xFF << (64 * k) for k in range(_PAN_LANES))
_LANE_ONE = _LANE_LOW // 0xFF  # 1 in each lane's low byte
_LANE_HIGH = _LANE_ONE * 0x80


def _pack(hashes: Sequence[int]) -> int:
    out = 0
    for k, h in enumerate(hashes):
        out |= h << (64 * k)
    return out


def pan_pack(crops: Sequence[int]) -> tuple[int, ...]:
    """(a side, b side) of a frame's crop hashes packed for ``pan_within``; () when incomplete."""

    if len(crops) != CROP_STEPS * CROP_STEPS:
        return ()
    return (_pack(_PAN_A(crops)), _pack(_PAN_B(crops)))


def pan_within(packed_a: tuple[int, ...], packed_b: tuple[int, ...], limit: int) -> bool:
    """Whether ``pan_distance`` of the two frames is at most ``limit`` (0-63), from ``pan_pack`` of each.

    Same decision as ``pan_distance(a, b) <= limit``; False when either frame
    has no crop hashes.
    """

    if not packed_a or not packed_b or limit < 0:
        return False
    x = packed_a[0] ^ packed_b[1]
    x -= (x >> 1) & _M1
    x = (x & _M2) + ((x >> 2) & _M2)
    x = (x + (x >> 4)) & _M4
    x += x >> 8
    x += x >> 16
    x += x >> 32
    # Each lane's low byte is now its popcount (0-64). Adding 127 - limit sets
    # the byte's top bit exactly when the count is above the limit.
    counts = (x & _LANE_LOW) + _LANE_ONE * (127 - limit)
    return counts & _LANE_HIGH != _LANE_HIGH


# Crop and wide-pan windows in one packed check (2026-11-18,
# eval/cull-crop-gate-2026-11-18.md). Once the crop pass's gate rose to the pan
# pass's 44 bits both ran for most pairs, so the cull now compares a frame's
# 49 crop pairs (its centre window against each window of the other, and each
# of its windows against the other's centre; the centre pair once) and its 56
# wide-pan pairs in one XOR of 105 lanes, each kind against its own limit.
_CROP_LANE_A = (_CROP_CENTRE,) * (CROP_STEPS * CROP_STEPS) + tuple(
    k for k in range(CROP_STEPS * CROP_STEPS) if k != _CROP_CENTRE
)
_CROP_LANE_B = tuple(range(CROP_STEPS * CROP_STEPS)) + (_CROP_CENTRE,) * (CROP_STEPS * CROP_STEPS - 1)
_CROP_LANES = len(_CROP_LANE_A)
_WINDOW_A = operator.itemgetter(*_CROP_LANE_A, *(x for x, _ in _PAN_PAIRS))
_WINDOW_B = operator.itemgetter(*_CROP_LANE_B, *(y for _, y in _PAN_PAIRS))
_WINDOW_LANES = _CROP_LANES + _PAN_LANES
_W_BYTES = 8 * _WINDOW_LANES
_WM1, _WM2, _WM4 = (int.from_bytes(bytes([b]) * _W_BYTES, "little") for b in (0x55, 0x33, 0x0F))
_W_LOW = sum(0xFF << (64 * k) for k in range(_WINDOW_LANES))
_W_HIGH = (_W_LOW // 0xFF) * 0x80
_CROP_ONE = sum(1 << (64 * k) for k in range(_CROP_LANES))
_PAN_ONE = sum(1 << (64 * k) for k in range(_CROP_LANES, _WINDOW_LANES))
_WINDOW_BIAS: dict[tuple[int, int], int] = {}


def window_pack(crops: Sequence[int]) -> tuple[int, ...]:
    """(a side, b side) of a frame's crop hashes packed for ``windows_within``; () when incomplete."""

    if len(crops) != CROP_STEPS * CROP_STEPS:
        return ()
    return (_pack(_WINDOW_A(crops)), _pack(_WINDOW_B(crops)))


def windows_within(packed_a: tuple[int, ...], packed_b: tuple[int, ...], crop_limit: int, pan_limit: int) -> bool:
    """Whether ``crop_distance`` is at most ``crop_limit`` or ``pan_distance`` at most ``pan_limit``.

    From ``window_pack`` of each frame. A limit below 0 switches that kind off;
    False when either frame has no crop hashes.
    """

    if not packed_a or not packed_b:
        return False
    crop_limit, pan_limit = max(-1, min(63, crop_limit)), max(-1, min(63, pan_limit))
    if crop_limit < 0 and pan_limit < 0:
        return False
    bias = _WINDOW_BIAS.get((crop_limit, pan_limit))
    if bias is None:
        # 127 - limit added to a lane's count (0-64) sets its top bit exactly
        # when the count is above the limit; at limit -1 the bit is always set.
        bias = _WINDOW_BIAS[(crop_limit, pan_limit)] = _CROP_ONE * (127 - crop_limit) + _PAN_ONE * (127 - pan_limit)
    x = packed_a[0] ^ packed_b[1]
    x -= (x >> 1) & _WM1
    x = (x & _WM2) + ((x >> 2) & _WM2)
    x = (x + (x >> 4)) & _WM4
    # One multiply sums each lane's eight byte counts into its top byte (no
    # carry: a lane's bytes total at most 64), about 20% faster than three
    # shift-and-adds on these 6,720-bit integers.
    x = ((x * 0x0101010101010101) >> 56) & _W_LOW
    return (x + bias) & _W_HIGH != _W_HIGH


# The other wide-pan pairs (2026-11-18, eval/cull-pan-all-pairs-2026-11-18.md)
# packed on their own: 208 lanes, checked only for the pairs the cull's index
# finds within their limit, so most pairs never pay for the bigger integers.
_OTHER_LANES = len(_PAN_OTHER_PAIRS)
_OTHER_A = operator.itemgetter(*(x for x, _ in _PAN_OTHER_PAIRS))
_OTHER_B = operator.itemgetter(*(y for _, y in _PAN_OTHER_PAIRS))
_O_BYTES = 8 * _OTHER_LANES
_OM1, _OM2, _OM4 = (int.from_bytes(bytes([b]) * _O_BYTES, "little") for b in (0x55, 0x33, 0x0F))
_O_LOW = sum(0xFF << (64 * k) for k in range(_OTHER_LANES))
_O_ONE = _O_LOW // 0xFF
_O_HIGH = _O_ONE * 0x80


def other_pack(crops: Sequence[int]) -> tuple[int, ...]:
    """(a side, b side) of a frame's crop hashes packed for ``other_within``; () when incomplete."""

    if len(crops) != CROP_STEPS * CROP_STEPS:
        return ()
    return (_pack(_OTHER_A(crops)), _pack(_OTHER_B(crops)))


def other_within(packed_a: tuple[int, ...], packed_b: tuple[int, ...], limit: int) -> bool:
    """Whether ``pan_other_distance`` is at most ``limit``, from ``other_pack`` of each frame.

    False when either frame has no crop hashes or ``limit`` is below 0.
    """

    if not packed_a or not packed_b or limit < 0:
        return False
    x = packed_a[0] ^ packed_b[1]
    x -= (x >> 1) & _OM1
    x = (x & _OM2) + ((x >> 2) & _OM2)
    x = (x + (x >> 4)) & _OM4
    x = ((x * 0x0101010101010101) >> 56) & _O_LOW
    return (x + _O_ONE * (127 - min(63, limit))) & _O_HIGH != _O_HIGH


# Fine offsets (2026-11-18, eval/cull-fine-offsets-2026-11-18.md). The crop
# grid's windows sit at 0, 3, 6, 9 and 12% of the frame, so two windows can be
# offset only by multiples of 3%. A pan of s moves the content s / (1 - s): a
# 10% pan moves it 11.1%, 0.9% from the nearest 12%, and on real photos that
# residue alone costs 6-10 bits where the exact offset costs 0-3. The marks
# below (a sparse ruler) add windows at 1% and 2% on each axis; the differences
# of {0, 1, 2, 3, 6, 9, 12} are every whole percent from 0 to 12, so every
# whole-percent offset has a window pair and no pan is more than 0.5% off one.
FINE_MARKS = (0, 1, 2, 3, 6, 9, 12)  # percent of the frame; the crop grid is (0, 3, 6, 9, 12)
_FINE_N = len(FINE_MARKS)
_FINE_EXTRA = tuple(
    (j, i) for j in range(_FINE_N) for i in range(_FINE_N)
    if FINE_MARKS[i] % 3 or FINE_MARKS[j] % 3
)


def _fine_grid() -> tuple[int, ...]:
    """Index of each 7 x 7 grid cell, row by row, in (crop hashes + fine hashes)."""

    out = []
    for jj in range(_FINE_N):
        for ii in range(_FINE_N):
            x, y = FINE_MARKS[ii], FINE_MARKS[jj]
            if x % 3 == 0 and y % 3 == 0:
                out.append((y // 3) * CROP_STEPS + x // 3)
            else:
                out.append(CROP_STEPS * CROP_STEPS + _FINE_EXTRA.index((jj, ii)))
    return tuple(out)


_FINE_GRID = _fine_grid()


def fine_dhashes(frame: bytes, width: int = FRAME_WIDTH, height: int = FRAME_HEIGHT) -> tuple[str, ...]:
    """Difference hashes of the 88% windows at the fine marks the crop grid lacks (24), row by row."""

    table = _integral(frame, width, height)
    out = []
    for j, i in _FINE_EXTRA:
        x0 = width * FINE_MARKS[i] / 100
        y0 = height * FINE_MARKS[j] / 100
        bits = _window_dhash(table, x0, y0, (1 - CROP_MARGIN) * width, (1 - CROP_MARGIN) * height)
        out.append(f"{bits:016x}")
    return tuple(out)


def _fine_pairs() -> tuple[tuple[int, int], ...]:
    """(cell of a, cell of b) on the 7 x 7 grid for each whole-percent offset the 3% lattice misses.

    Offsets that are multiples of 3% on both axes are left to the crop and
    wide-pan passes. For each other offset, the pair nearest the middle of
    both frames, as ``_pan_pairs`` does.
    """

    n, marks = _FINE_N, FINE_MARKS
    mid = 6
    out = []
    for dy in range(-12, 13):
        for dx in range(-12, 13):
            if dx % 3 == 0 and dy % 3 == 0:
                continue
            candidates = [
                (ay * n + ax, by * n + bx)
                for ay in range(n) for ax in range(n) for by in range(n) for bx in range(n)
                if marks[ax] - marks[bx] == dx and marks[ay] - marks[by] == dy
            ]

            def spread(pair: tuple[int, int]) -> int:
                return sum(abs(marks[k // n] - mid) + abs(marks[k % n] - mid) for k in pair)

            out.append(min(candidates, key=spread))
    return tuple(out)


_FINE_PAIRS = _fine_pairs()
_FINE_A = operator.itemgetter(*(_FINE_GRID[a] for a, _ in _FINE_PAIRS))
_FINE_B = operator.itemgetter(*(_FINE_GRID[b] for _, b in _FINE_PAIRS))
_FINE_LANES = len(_FINE_PAIRS)
_F_BYTES = 8 * _FINE_LANES
_FM1, _FM2, _FM4 = (int.from_bytes(bytes([b]) * _F_BYTES, "little") for b in (0x55, 0x33, 0x0F))
_F_LOW = sum(0xFF << (64 * k) for k in range(_FINE_LANES))
_F_ONE = _F_LOW // 0xFF
_F_HIGH = _F_ONE * 0x80


def _fine_windows(crops: Sequence[int], fine: Sequence[int]) -> tuple[int, ...] | None:
    if len(crops) != CROP_STEPS * CROP_STEPS or len(fine) != len(_FINE_EXTRA):
        return None
    return (*crops, *fine)


def fine_distance(crops_a: Sequence[int], fine_a: Sequence[int], crops_b: Sequence[int], fine_b: Sequence[int]) -> int:
    """Smallest Hamming distance over the window pairs at whole-percent offsets off the 3% lattice.

    Takes each frame's crop hashes and fine hashes (ints). Returns 64 when
    either frame lacks them (a frame analysed before 2026-11-18).
    """

    wa, wb = _fine_windows(crops_a, fine_a), _fine_windows(crops_b, fine_b)
    if wa is None or wb is None:
        return 64
    return min(map(int.bit_count, map(int.__xor__, _FINE_A(wa), _FINE_B(wb))))


def fine_pack(crops: Sequence[int], fine: Sequence[int]) -> tuple[int, ...]:
    """(a side, b side) of a frame's windows packed for ``fine_within``; () when incomplete."""

    windows = _fine_windows(crops, fine)
    if windows is None:
        return ()
    return (_pack(_FINE_A(windows)), _pack(_FINE_B(windows)))


def fine_within(packed_a: tuple[int, ...], packed_b: tuple[int, ...], limit: int) -> bool:
    """Whether ``fine_distance`` is at most ``limit`` (0-63), from ``fine_pack`` of each frame."""

    if not packed_a or not packed_b or limit < 0:
        return False
    x = packed_a[0] ^ packed_b[1]
    x -= (x >> 1) & _FM1
    x = (x & _FM2) + ((x >> 2) & _FM2)
    x = (x + (x >> 4)) & _FM4
    x = ((x * 0x0101010101010101) >> 56) & _F_LOW
    return (x + _F_ONE * (127 - min(63, limit))) & _F_HIGH != _F_HIGH


# Zoom windows (2026-11-18, eval/cull-zoom-windows-2026-11-18.md): the equal-size
# crop windows line up a pan exactly but a zoom only roughly, so a frame zoomed
# in by z is compared whole against the other frame's window of size 1 - z.
# ZOOM_STEPS x ZOOM_STEPS positions per scale, from the top-left to the
# bottom-right corner. Picked on 165 tune photos.
ZOOM_SCALES = (0.96, 0.94, 0.92, 0.90)
ZOOM_STEPS = 5


def zoom_dhashes(frame: bytes, width: int = FRAME_WIDTH, height: int = FRAME_HEIGHT) -> tuple[str, ...]:
    """Difference hashes of the zoom windows: scale by scale, then row by row."""

    table = _integral(frame, width, height)
    hashes = []
    for scale in ZOOM_SCALES:
        for j in range(ZOOM_STEPS):
            for i in range(ZOOM_STEPS):
                x0 = (1 - scale) * width * i / (ZOOM_STEPS - 1)
                y0 = (1 - scale) * height * j / (ZOOM_STEPS - 1)
                hashes.append(f"{_window_dhash(table, x0, y0, scale * width, scale * height):016x}")
    return tuple(hashes)


def zoom_distance(hash_a: int, zooms_a: Sequence[int], hash_b: int, zooms_b: Sequence[int]) -> int:
    """Smallest Hamming distance between one frame's whole-frame hash and any zoom window of the other.

    Either frame may be the tighter one, so both directions are tried. Takes
    parsed hashes (ints). Returns 64 when either frame has no zoom hashes
    (a catalogue analysed before 2026-11-18).
    """

    expected = len(ZOOM_SCALES) * ZOOM_STEPS * ZOOM_STEPS
    if len(zooms_a) != expected or len(zooms_b) != expected:
        return 64
    # map() keeps the loop in C: the cull calls this for every pair within
    # ZOOM_CANDIDATE_MAX_DISTANCE, a sizeable share of all pairs.
    return min(
        min(map(int.bit_count, map(hash_b.__xor__, zooms_a))),
        min(map(int.bit_count, map(hash_a.__xor__, zooms_b))),
    )


def _zoom_blocks() -> tuple[tuple[int, ...], ...]:
    """Index groups of nearby zoom windows: per scale, the 5 x 5 positions cut 3 + 2 by 3 + 2."""

    halves = (tuple(range(0, 3)), tuple(range(3, ZOOM_STEPS)))
    per_scale = ZOOM_STEPS * ZOOM_STEPS
    return tuple(
        tuple(s * per_scale + y * ZOOM_STEPS + x for y in ys for x in xs)
        for s in range(len(ZOOM_SCALES))
        for ys in halves
        for xs in halves
    )


_ZOOM_BLOCKS = _zoom_blocks()

ZoomIndex = tuple[tuple[int, int, tuple[int, ...]], ...]


def zoom_index(zooms: Sequence[int]) -> ZoomIndex:
    """(pivot, radius, member hashes) per block of nearby windows, for ``zoom_distance_within``.

    The pivot is the block's medoid and the radius its largest distance to a
    member, so by the triangle inequality no member is closer to a hash ``h``
    than ``distance(h, pivot) - radius``. Empty when ``zooms`` is incomplete.
    """

    if len(zooms) != len(ZOOM_SCALES) * ZOOM_STEPS * ZOOM_STEPS:
        return ()
    out = []
    for block in _ZOOM_BLOCKS:
        members = tuple(zooms[k] for k in block)
        radius, pivot = min((max((c ^ m).bit_count() for m in members), c) for c in members)
        out.append((pivot, radius, members))
    return tuple(out)


def _nearest_within(hash_: int, index: ZoomIndex, limit: int) -> int:
    best = limit + 1
    for pivot, radius, members in index:
        if (hash_ ^ pivot).bit_count() - radius >= best:
            continue
        best = min(best, min(map(int.bit_count, map(hash_.__xor__, members))))
    return best


def zoom_distance_within(hash_a: int, index_a: ZoomIndex, hash_b: int, index_b: ZoomIndex, limit: int) -> int:
    """``zoom_distance`` when it is at most ``limit``, otherwise some value above ``limit``.

    Same answer as ``zoom_distance`` for every decision of the form
    ``distance <= limit``, but skips blocks of windows that cannot get there
    (on 331 real photos, 86% of the scans for pairs inside the cull's candidate
    distance). Takes ``zoom_index`` of each frame.
    """

    if not index_a or not index_b:
        return 64
    best = _nearest_within(hash_b, index_a, limit)
    return min(best, _nearest_within(hash_a, index_b, min(limit, best - 1)))


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
