"""Cheap local quality measurements, so Claude only sees shots worth judging.

Everything here is numpy + Pillow on small grey images:

* sharpness  - variance of the 4-neighbour Laplacian, computed on 0..255 grey values.
  Stills are measured on the 1024px preview (typical: < 20 visibly soft, 100s-1000s crisp).
  Videos are measured on 320px frames, where the same scene scores very differently, so
  video sharpness is NOT comparable with photo sharpness - only ever compare like with like.
* exposure   - mean brightness (0..1) and the shares of pixels clipped at either end.
* dhash      - 64-bit difference hash for near-duplicate (burst) detection.
* segments   - for videos, the stretches (seconds) that are not black, soft or shaking.

`select_candidates` then keeps the best shot of every burst and drops shots that are
technically broken, so the expensive judging stage sees one frame per moment. When vision.py
has added Apple Vision fields (faces, aesthetics, utility, feature prints), they choose the
burst's frame, drop document/screen captures and extreme junk, and fold semantic near-repeats
across bursts and cameras into the best of them; without those fields nothing changes.
"""
from __future__ import annotations

import bisect
import os
from collections import defaultdict
from collections.abc import Callable, Sequence
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image

from .config import Config
from .models import Asset, Metrics

# --- measurement sizes -------------------------------------------------------------------
PHOTO_EDGE = 1024           # stills are measured on media's cached 1024px preview, so no extra resample
VIDEO_FPS = 2.0             # two samples a second resolve 1.5 s stretches yet stay cheap on long clips
VIDEO_EDGE = 320            # plenty for blur/exposure/motion and ~10x cheaper than 1024px
MOTION_EDGE = 160           # phase correlation runs on a 2x-reduced frame; detail beyond that is noise

# --- exposure ----------------------------------------------------------------------------
CLIP_HIGH_LEVEL = 250       # 8-bit level counted as blown: JPEG highlights roll off into 255 within a few levels
CLIP_LOW_LEVEL = 5          # 8-bit level counted as crushed: below this only sensor noise is left

# --- bursts and candidates ---------------------------------------------------------------
BURST_GAP_S = 3.0           # continuous shooting and quick re-takes of one moment land within a few seconds
BURST_MAX_HAMMING = 10      # of 64 bits: same framing with a small shift or exposure change; new scenes sit at 20+
MIN_GROUP_FOR_MEDIAN = 5    # with fewer shots the "median" is just another shot, not a norm for the event
SOFT_VS_GROUP_RATIO = 0.1   # 10x below the group median is missed focus or shake, not merely a smoother subject
NEAR_BLACK_MEAN = 0.03      # mean under ~8/255: lens cap or pocket shot, even allowing for noise
NEAR_WHITE_MEAN = 0.97      # mean over ~247/255: a white-out with nothing recoverable in the JPEG
CLIPPED_BROKEN_SHARE = 0.95  # 95% of pixels clipped at one end leaves nothing to edit

# --- Apple Vision signals (vision.py; every rule is skipped when its field is None/empty) --
# Calibrated on a 9.5k-asset library (people, night city, astro, landscape, 360); see the notes.
FACE_QUALITY_TIE = 0.05     # a 2 px shift + JPEG re-encode moves face capture quality by <= 0.05 (p90 0.03)
FACE_PICK_MIN_SHARPNESS = 0.5   # a better face never wins from a frame under half the burst's sharpest (shake/missed focus)
SHARPNESS_TIE_RATIO = 0.9   # within 10% Laplacian variance frames look equally sharp: aesthetics may decide...
AESTHETICS_TIE = 0.05       # ...by more than this: a 2 px shift + re-encode moves aesthetics by up to ~0.05
NEAR_DUP_WINDOW_S = 90.0    # re-takes of one set-up (portrait series, a view from one spot) land within a minute or so
NEAR_DUP_DISTANCE = 0.30    # feature-print distance: a 2 px shift + re-encode reads 0.09-0.17; every sampled pair
                            # under 0.30 was the same picture; 0.30-0.40 starts to differ in pose, smile, framing
UTILITY_LABELS = frozenset({    # isUtility alone also fires on bazaar stalls, a park sign, a 360 restaurant: it
    "document", "printed_page", "screenshot", "receipt", "handwriting", "whiteboard", "flipchart",
    "diagram", "chart", "calendar", "ticket", "credit_card", "gift_card", "checkbook",
    "newspaper", "magazine"})   # rejects only when a label confirms a document or screen
EXTREME_LOW_AESTHETICS = -0.95  # every photo under this was black, white or smeared; real night shots sit above
NIGHT_LABELS = frozenset({"night_sky", "celestial_body", "celestial_body_other", "moon", "aurora", "fireworks"})

# --- video segments ----------------------------------------------------------------------
DARK_FRAME_P99 = 0.15       # brightest 1% under 15% grey: covered lens or black lead-in (also limited-range 16/255 black)
BLOWN_FRAME_P1 = 0.90       # darkest 1% over 90% grey: pointed into the sun or a white-out
BLUR_REF_PERCENTILE = 75    # the clip's own "in focus" level; robust to a minority of soft frames
BLUR_RATIO = 0.3            # under 30% of that is a focus hunt or motion blur, beyond normal content variation
FLAT_FRAME_SHARPNESS = 2.0  # below this (0..255 scale, 320px) a frame has no detail at all, whatever the clip does
PHASE_MIN_PEAK = 0.08       # weaker correlation peaks mean the two samples share too little to trust the shift
STATIC_PEAK = 0.03          # ~4x the noise floor (std ~0.007 at 160px): a static background exists, camera steady
SHAKE_JERK = 0.08           # shift changing by >8% of the frame between 0.5 s steps; a steady pan changes ~0
MIN_SEGMENT_S = 1.5         # shortest stretch worth a cut in a 15 s reel on a 0.5 s beat grid
MERGE_GAP_S = 0.6           # a lone soft/shaky sample at 2 fps is more likely noise than unusable footage

# --- batch -------------------------------------------------------------------------------
INLINE_MAX = 4              # below this many assets, worker start-up (~0.5 s each on macOS) costs more than it saves

BLANK_DHASH = "0" * 16
STILL_KINDS = ("photo", "photo360")


# --- pixel helpers -----------------------------------------------------------------------

def grey_array(img: Image.Image | Path | str, size: int = PHOTO_EDGE) -> np.ndarray:
    """Float32 grey image in 0..1 with its long edge resized to `size`.

    JPEG paths are opened with `draft`, which decodes only luma at a reduced DCT scale.
    """
    if isinstance(img, (str, Path)):
        with Image.open(img) as im:
            im.draft("L", _target_size(im.size, size))
            return grey_array(im.convert("L"), size)
    im = img if img.mode == "L" else img.convert("L")
    target = _target_size(im.size, size)
    if im.size != target:
        im = im.resize(target, Image.Resampling.BILINEAR, reducing_gap=2.0)
    return np.asarray(im, dtype=np.float32) / 255.0


def _target_size(wh: tuple[int, int], size: int) -> tuple[int, int]:
    w, h = wh
    scale = size / max(w, h)
    return max(1, round(w * scale)), max(1, round(h * scale))


def _levels(grey: np.ndarray) -> np.ndarray:
    """Grey values on the 0..255 scale as float32 (uint8 as is, floats assumed 0..1)."""
    if grey.dtype == np.uint8:
        return grey.astype(np.float32)
    return np.asarray(grey, dtype=np.float32) * 255.0


def laplacian_variance(grey: np.ndarray) -> float:
    """Variance of the 3x3 4-neighbour Laplacian, on the 0..255 scale.

    `grey` is uint8 0..255 or float 0..1; either way the result is what the Laplacian of
    8-bit values gives, so 1024px stills read roughly 0-20 soft, 100s-1000s crisp. The value
    depends on resolution: 320px video frames are not comparable with 1024px stills.
    """
    g = _levels(grey)
    if g.shape[0] < 3 or g.shape[1] < 3:
        return 0.0
    lap = g[1:-1, :-2] + g[1:-1, 2:] + g[:-2, 1:-1] + g[2:, 1:-1] - 4.0 * g[1:-1, 1:-1]
    return float(lap.var(dtype=np.float64))


def exposure_stats(grey: np.ndarray) -> tuple[float, float, float]:
    """(mean brightness 0..1, share of pixels >= CLIP_HIGH_LEVEL, share <= CLIP_LOW_LEVEL)."""
    g = _levels(grey)
    if g.size == 0:
        return 0.0, 0.0, 0.0
    # +-0.5 absorbs float rounding of values that came from uint8 / 255
    high = np.count_nonzero(g >= CLIP_HIGH_LEVEL - 0.5) / g.size
    low = np.count_nonzero(g <= CLIP_LOW_LEVEL + 0.5) / g.size
    return float(g.mean(dtype=np.float64) / 255.0), float(high), float(low)


def dhash(img_or_grey: Image.Image | np.ndarray | Path | str, hash_size: int = 8) -> str:
    """Difference hash: grey resized to (hash_size+1) x hash_size, bit = left < right neighbour.

    Returns hash_size**2 bits as lowercase hex, first row first, most significant bit first
    (16 hex chars for the default 8) - the same layout as the `imagehash` package.
    """
    if isinstance(img_or_grey, np.ndarray):
        im = Image.fromarray(np.clip(np.rint(_levels(img_or_grey)), 0, 255).astype(np.uint8))
    elif isinstance(img_or_grey, (str, Path)):
        with Image.open(img_or_grey) as src:
            src.draft("L", (hash_size * 16, hash_size * 16))
            im = src.convert("L")
    else:
        im = img_or_grey.convert("L")
    px = np.asarray(im.resize((hash_size + 1, hash_size), Image.Resampling.LANCZOS), dtype=np.int16)
    bits = (px[:, 1:] > px[:, :-1]).ravel()
    value = int("".join("1" if b else "0" for b in bits), 2)
    return f"{value:0{(bits.size + 3) // 4}x}"


def hamming(a: str, b: str) -> int:
    """Number of differing bits between two hex hashes."""
    return (int(a, 16) ^ int(b, 16)).bit_count()


# --- video -------------------------------------------------------------------------------

@dataclass
class _FrameStats:
    sharpness: np.ndarray       # Laplacian variance per frame (0..255 scale, at frame size)
    brightness: np.ndarray      # mean 0..1
    clipped_high: np.ndarray
    clipped_low: np.ndarray
    dark: np.ndarray            # bool: nothing to see
    blown: np.ndarray           # bool: white-out


def _frame_stats(frames: Sequence[np.ndarray]) -> _FrameStats:
    n = len(frames)
    out = {k: np.zeros(n) for k in ("sharpness", "brightness", "clipped_high", "clipped_low", "p01", "p99")}
    for i, f in enumerate(frames):
        u8 = f if f.dtype == np.uint8 else np.clip(np.rint(_levels(f)), 0, 255).astype(np.uint8)
        hist = np.bincount(u8.ravel(), minlength=256)
        cdf = np.cumsum(hist) / max(u8.size, 1)
        out["sharpness"][i] = laplacian_variance(u8)
        out["brightness"][i] = float(np.dot(hist, np.arange(256))) / max(u8.size, 1) / 255.0
        out["clipped_high"][i] = 1.0 - cdf[CLIP_HIGH_LEVEL - 1]
        out["clipped_low"][i] = cdf[CLIP_LOW_LEVEL]
        out["p01"][i] = np.searchsorted(cdf, 0.01) / 255.0
        out["p99"][i] = np.searchsorted(cdf, 0.99) / 255.0
    return _FrameStats(
        sharpness=out["sharpness"], brightness=out["brightness"],
        clipped_high=out["clipped_high"], clipped_low=out["clipped_low"],
        dark=out["p99"] < DARK_FRAME_P99, blown=out["p01"] > BLOWN_FRAME_P1,
    )


@lru_cache(maxsize=8)
def _window(shape: tuple[int, int]) -> np.ndarray:
    return np.outer(np.hanning(shape[0]), np.hanning(shape[1])).astype(np.float32)


def _motion_spectrum(frame: np.ndarray) -> tuple[np.ndarray, tuple[int, int]]:
    """(rfft2, real shape) of a block-reduced, zero-mean, Hann-windowed frame."""
    g = frame.astype(np.float32)
    step = max(1, round(max(g.shape) / MOTION_EDGE))
    if step > 1:
        h, w = g.shape[0] // step * step, g.shape[1] // step * step
        g = g[:h, :w].reshape(h // step, step, w // step, step).mean(axis=(1, 3))
    g = (g - g.mean()) * _window(g.shape)
    return np.fft.rfft2(g), g.shape


def global_motion(frames: Sequence[np.ndarray]) -> tuple[np.ndarray, np.ndarray]:
    """Phase-correlation shift between consecutive frames.

    Returns (shifts, peaks): shifts is (n-1, 2) as (dx, dy) in fractions of the frame's long
    edge (content moving right/down is positive); peaks is (n-1,) correlation peak heights,
    1.0 for identical frames and a few hundredths for unrelated ones. When the correlation at
    zero shift reaches STATIC_PEAK, part of the scene did not move, so the camera held still
    and the strongest peak is a moving subject: the shift is reported as 0.
    """
    n = len(frames)
    shifts = np.zeros((max(n - 1, 0), 2))
    peaks = np.zeros(max(n - 1, 0))
    if n < 2:
        return shifts, peaks
    prev, prev_shape = _motion_spectrum(frames[0])
    for i in range(1, n):
        cur, shape = _motion_spectrum(frames[i])
        if shape == prev_shape:
            cross = cur * np.conj(prev)
            cross /= np.abs(cross) + 1e-9
            r = np.fft.irfft2(cross, s=shape)
            y, x = np.unravel_index(int(np.argmax(r)), shape)
            h, w = shape
            dy = y - h if y > h // 2 else y
            dx = x - w if x > w // 2 else x
            if r[0, 0] < STATIC_PEAK:       # else part of the scene held still: subject motion, not camera
                shifts[i - 1] = (dx / max(h, w), dy / max(h, w))
            peaks[i - 1] = r[y, x]
        prev, prev_shape = cur, shape
    return shifts, peaks


def _shaky(frames: Sequence[np.ndarray], limit: float | None) -> np.ndarray:
    """Frames where the global motion jerks: the shift into the frame and the shift out of it
    differ by more than `limit`. Steady pans keep the shift constant and pass; a pair whose
    correlation peak is too weak to trust never flags anything (motion blur is left to the
    sharpness test)."""
    n = len(frames)
    flags = np.zeros(n, dtype=bool)
    if limit is None or n < 3:
        return flags
    shifts, peaks = global_motion(frames)
    reliable = peaks >= PHASE_MIN_PEAK
    jerk = np.linalg.norm(shifts[1:] - shifts[:-1], axis=1)       # centred on frames 1..n-2
    flags[1:-1] = (jerk > limit) & reliable[1:] & reliable[:-1]
    return flags


def video_segments(times: Sequence[float], frames: Sequence[np.ndarray], *,
                   duration: float | None = None,
                   shake_limit: float | None = SHAKE_JERK) -> list[tuple[float, float]]:
    """Usable stretches of a clip from evenly spaced grey samples, as (start_s, end_s).

    A sample is bad when it is near-black or blown out (hard faults), soft relative to the
    clip's own sharpness distribution, or inside a jerky stretch (soft faults). Gaps of
    soft-only samples up to MERGE_GAP_S between good runs are forgiven.

    Samples are point samples, so a boundary between a bad and a good sample is put halfway
    between them: a good run t_i..t_j becomes (t_i - dt/2, t_j + dt/2), except that a run
    touching the first sample starts at 0 and one touching the last sample ends at `duration`
    when it is known. Everything is clamped to [0, duration]. Runs shorter than MIN_SEGMENT_S
    (1.5 s: three samples at 2 fps) are dropped.
    """
    return _segments(list(times), frames, _frame_stats(frames), duration, shake_limit)


def _segments(times: list[float], frames: Sequence[np.ndarray], stats: _FrameStats,
              duration: float | None, shake_limit: float | None) -> list[tuple[float, float]]:
    n = len(times)
    if n < 2 or len(frames) != n:
        return []
    t = np.asarray(times, dtype=float)
    dt = float(np.median(np.diff(t)))
    if dt <= 0:
        return []
    hard = stats.dark | stats.blown
    soft = stats.sharpness < FLAT_FRAME_SHARPNESS
    if (~hard).any():
        reference = np.percentile(stats.sharpness[~hard], BLUR_REF_PERCENTILE)
        soft |= stats.sharpness < BLUR_RATIO * reference
    soft |= _shaky(frames, shake_limit)
    good = ~(hard | soft)

    # forgive short soft-only gaps between good runs
    for i, j in _runs(~good):
        if i > 0 and j < n - 1 and (j - i + 1) * dt <= MERGE_GAP_S and not hard[i:j + 1].any():
            good[i:j + 1] = True

    out = []
    for i, j in _runs(good):
        start = 0.0 if i == 0 else max(0.0, t[i] - dt / 2)
        end = t[j] + dt / 2
        if duration is not None:
            end = duration if j == n - 1 else min(end, duration)
        if end - start >= MIN_SEGMENT_S - 1e-9:
            out.append((round(float(start), 3), round(float(end), 3)))
    return out


def _runs(mask: np.ndarray) -> list[tuple[int, int]]:
    """Inclusive (first, last) index pairs of the True runs in a 1-D bool array."""
    edges = np.diff(np.concatenate(([0], mask.astype(np.int8), [0])))
    return list(zip(np.flatnonzero(edges == 1), np.flatnonzero(edges == -1) - 1))


# --- measuring assets --------------------------------------------------------------------

def measure(asset: Asset, cfg: Config) -> Metrics:
    """Measure one asset: stills from media's 1024px preview, videos from 2 fps 320px samples.

    Raises media.MediaError / OSError for unreadable files (measure_all turns those into a
    "broken" record).
    """
    if asset.kind in STILL_KINDS:
        return _measure_still(asset, cfg)
    return _measure_video(asset, cfg)


def _measure_still(asset: Asset, cfg: Config) -> Metrics:
    from . import media  # imported late: media pulls in ffmpeg plumbing the pure helpers don't need

    path = media.preview_image(asset, cfg, size=PHOTO_EDGE)
    if asset.kind == "photo360":
        # media's 360 preview is a sheet: the 2:1 panorama on top, then a labelled yaw scale and
        # flat views; text and black bars would skew sharpness and clipping, so use the panorama
        with Image.open(path) as im:
            if abs(im.width - 2 * im.height) > 2:
                im = im.crop((0, 0, im.width, im.width // 2))
            grey = grey_array(im, PHOTO_EDGE)
    else:
        grey = grey_array(path, PHOTO_EDGE)
    brightness, high, low = exposure_stats(grey)
    return Metrics(asset_id=asset.id, sharpness=laplacian_variance(grey), brightness=brightness,
                   clipped_high=high, clipped_low=low, dhash=dhash(grey))


def _measure_video(asset: Asset, cfg: Config) -> Metrics:
    """Asset-level numbers are medians over samples inside segments (all samples if none).

    Sharpness here is measured on 320px frames and is not comparable with photo sharpness.
    """
    from . import media

    samples = media.sample_frames(asset, cfg, fps=VIDEO_FPS, size=VIDEO_EDGE)
    if not samples:
        return broken_metrics(asset.id)
    times = [float(t) for t, _ in samples]
    frames = [f for _, f in samples]
    stats = _frame_stats(frames)
    segments = _segments(times, frames, stats, asset.duration_s, SHAKE_JERK)

    t = np.asarray(times)
    inside = np.zeros(len(t), dtype=bool)
    for start, end in segments:
        inside |= (t >= start) & (t <= end)
    use = inside if inside.any() else np.ones(len(t), dtype=bool)
    if segments:
        start, end = max(segments, key=lambda s: s[1] - s[0])
        key = int(np.argmin(np.abs(t - (start + end) / 2)))
    else:
        key = len(frames) // 2
    return Metrics(
        asset_id=asset.id,
        sharpness=float(np.median(stats.sharpness[use])),
        brightness=float(np.median(stats.brightness[use])),
        clipped_high=float(np.median(stats.clipped_high[use])),
        clipped_low=float(np.median(stats.clipped_low[use])),
        dhash=dhash(frames[key]),
        segments=segments,
        candidate=bool(segments),
    )


def broken_metrics(asset_id: str) -> Metrics:
    """The record for a file that could not be read: never a candidate."""
    return Metrics(asset_id=asset_id, sharpness=0.0, brightness=0.0, clipped_high=0.0,
                   clipped_low=0.0, dhash=BLANK_DHASH, candidate=False)


def _measure_safe(asset: Asset, cfg: Config) -> Metrics:
    """Worker entry point (module level so it pickles): unreadable files become broken records."""
    from .media import MediaError

    try:
        return measure(asset, cfg)
    except (MediaError, OSError, Image.DecompressionBombError):
        return broken_metrics(asset.id)


def measure_all(assets: Sequence[Asset], cfg: Config, workers: int | None = None,
                progress: Callable[[int, int], object] | None = None) -> dict[str, Metrics]:
    """Measure many assets in a process pool; one unreadable file never stops the run."""
    total = len(assets)
    workers = workers or min(os.cpu_count() or 1, 8)
    out: dict[str, Metrics] = {}
    if workers <= 1 or total <= INLINE_MAX:
        for done, asset in enumerate(assets, 1):
            out[asset.id] = _measure_safe(asset, cfg)
            if progress:
                progress(done, total)
        return out
    with ProcessPoolExecutor(max_workers=min(workers, total)) as pool:
        futures = {pool.submit(_measure_safe, a, cfg): a.id for a in assets}
        for done, fut in enumerate(as_completed(futures), 1):
            out[futures[fut]] = fut.result()
            if progress:
                progress(done, total)
    return out


# --- choosing candidates -----------------------------------------------------------------

def _hard_broken(asset: Asset, m: Metrics) -> bool:
    """Unreadable, black, white, or a video with nothing usable: its dHash means nothing."""
    if m.sharpness <= 0 or m.brightness < NEAR_BLACK_MEAN or m.brightness > NEAR_WHITE_MEAN:
        return True
    if m.clipped_low >= CLIPPED_BROKEN_SHARE or m.clipped_high >= CLIPPED_BROKEN_SHARE:
        return True
    return asset.kind not in STILL_KINDS and not m.segments


def select_candidates(assets: Sequence[Asset], metrics: dict[str, Metrics]) -> dict[str, Metrics]:
    """Group near-duplicates into bursts, keep the best non-broken shot of each, then drop
    document/junk shots and semantic near-duplicates.

    Returns new Metrics (keyed by asset id, only for assets that have metrics) with
    `burst_id` and `candidate` set. Bursts form within one event among stills, and
    separately among videos: in time order, a shot joins a burst when it was taken at most
    BURST_GAP_S after the burst's latest shot and its dHash is within BURST_MAX_HAMMING of
    it. A shot is technically broken when it is black/white/unreadable, a video with no
    segments, or far softer than the median of its event's same-kind, same-camera shots.

    With Apple Vision fields (vision.py; each rule is skipped where they are None):
    * the burst's pick is the best face (`_burst_pick`) or, without faces, the sharpest with
      aesthetics breaking near-ties;
    * stills Vision calls a document/screen capture, and flat photos of extreme junk
      aesthetics, are not candidates (`_not_a_photograph`);
    * among the remaining still candidates of one event and kind, two shots taken within
      NEAR_DUP_WINDOW_S whose feature prints are closer than NEAR_DUP_DISTANCE are the same
      picture: only the better one (`_quality`) stays a candidate.
    Low aesthetics alone never rejects (beyond EXTREME_LOW_AESTHETICS): night skies and moody
    frames score low on it.
    """
    known = [a for a in assets if a.id in metrics]
    hard = {a.id for a in known if _hard_broken(a, metrics[a.id])}

    # sharpness norm per (event, kind, camera): different cameras and kinds read on different scales
    peers: dict[tuple[str, str, str], list[float]] = defaultdict(list)
    for a in known:
        if a.id not in hard:
            peers[(a.event_key, a.kind, a.camera)].append(metrics[a.id].sharpness)
    soft = set()
    for a in known:
        values = peers[(a.event_key, a.kind, a.camera)]
        if a.id not in hard and len(values) >= MIN_GROUP_FOR_MEDIAN:
            if metrics[a.id].sharpness < SOFT_VS_GROUP_RATIO * float(np.median(values)):
                soft.add(a.id)

    burst_of = _bursts([a for a in known if a.id not in hard], metrics)
    members: dict[str, list[str]] = defaultdict(list)
    for a in known:
        if a.id in burst_of:
            members[burst_of[a.id]].append(a.id)
    # a document or junk frame neither represents its burst nor blocks a good one in it
    unfit = soft | {a.id for a in known if _not_a_photograph(a, metrics[a.id])}
    best = {b: _burst_pick(ids, metrics, unfit) for b, ids in members.items()}

    candidate = {a.id: a.id not in hard and a.id not in unfit
                 and best.get(burst_of.get(a.id, a.id)) == a.id
                 for a in known}
    for dup in _near_duplicates([a for a in known if candidate[a.id]], metrics):
        candidate[dup] = False

    return {a.id: metrics[a.id].model_copy(
                update={"burst_id": burst_of.get(a.id, a.id), "candidate": candidate[a.id]}, deep=True)
            for a in known}


def _not_a_photograph(asset: Asset, m: Metrics) -> bool:
    """Vision says this still is a document/screen capture, or junk beyond doubt.

    Utility needs a confirming label (UTILITY_LABELS): on a camera library isUtility alone
    mostly flags shop displays and signs. Aesthetics only rejects flat photos under
    EXTREME_LOW_AESTHETICS that Vision does not see as a night sky (it scores astro low);
    360 panoramas and videos are never rejected on aesthetics (the model sees a distorted
    equirect, or a single small frame).
    """
    if asset.kind not in STILL_KINDS:
        return False
    if m.utility and UTILITY_LABELS.intersection(m.labels):
        return True
    return (asset.kind == "photo" and m.aesthetics is not None and m.aesthetics < EXTREME_LOW_AESTHETICS
            and not NIGHT_LABELS.intersection(m.labels))


def _burst_pick(ids: list[str], metrics: dict[str, Metrics], unfit: set[str]) -> str:
    """The shot that represents a burst.

    With faces (any member has a face capture quality): among members at least
    FACE_PICK_MIN_SHARPNESS as sharp as the burst's sharpest, the best face quality, the
    sharpest of those within FACE_QUALITY_TIE of it. A member without a detected face counts
    as worst (the face turned away or was covered). Without faces: the sharpest, unless a
    member within SHARPNESS_TIE_RATIO of it has aesthetics more than AESTHETICS_TIE higher
    (without aesthetics that is the pick without Vision). Unfit members (soft, documents,
    junk) are only picked when every member is unfit (then none becomes a candidate anyway).
    """
    pool = [i for i in ids if i not in unfit] or ids
    top = max(metrics[i].sharpness for i in pool)
    if any(metrics[i].face_quality is not None for i in pool):
        sharp_enough = [i for i in pool if metrics[i].sharpness >= FACE_PICK_MIN_SHARPNESS * top]
        best_face = max(_face(metrics[i]) for i in sharp_enough)
        tied = [i for i in sharp_enough if _face(metrics[i]) >= best_face - FACE_QUALITY_TIE]
        return max(tied, key=lambda i: (metrics[i].sharpness, i))
    sharpest = max(pool, key=lambda i: (metrics[i].sharpness, i))
    tied = [i for i in pool if metrics[i].sharpness >= SHARPNESS_TIE_RATIO * top]
    nicest = max(tied, key=lambda i: (_aesthetics(metrics[i]), metrics[i].sharpness, i))
    if _aesthetics(metrics[nicest]) > _aesthetics(metrics[sharpest]) + AESTHETICS_TIE:
        return nicest
    return sharpest


def _face(m: Metrics) -> float:
    """A frame's face score: the best face, or in a group shot the worst one - one person
    blinking should lose to the frame where everyone looks good."""
    if m.faces > 1 and m.face_quality_min is not None:
        return m.face_quality_min
    return m.face_quality if m.face_quality is not None and m.faces > 0 else -1.0


def _when(a: Asset):
    """Capture time for ordering: local time, or the camera clock when the zone isn't known."""
    return a.taken_at or a.clock_time


def _aesthetics(m: Metrics) -> float:
    return m.aesthetics if m.aesthetics is not None else -np.inf


def _quality(m: Metrics) -> tuple:
    """Which of two near-duplicates to keep: a better face (in FACE_QUALITY_TIE steps), then
    higher aesthetics, then sharper."""
    face = _face(m)
    return (np.floor(face / FACE_QUALITY_TIE) if face >= 0 else -1.0, _aesthetics(m), m.sharpness)


def _near_duplicates(candidates: Sequence[Asset], metrics: dict[str, Metrics]) -> set[str]:
    """Ids of still candidates that repeat a better candidate of the same event and kind:
    taken within NEAR_DUP_WINDOW_S of it, feature prints closer than NEAR_DUP_DISTANCE.

    Greedy, best first: a shot is dropped only for a shot that is itself kept, so a chain of
    small changes (a slow pan) never removes more than its near neighbours, and the best of
    each cluster always survives. Shots without a time or a feature print are never dropped.
    """
    from .vision import decode_print

    groups: dict[tuple[str, str], list[Asset]] = defaultdict(list)
    for a in candidates:
        if a.kind in STILL_KINDS and _when(a) is not None and metrics[a.id].feature_print:
            groups[(a.event_key, a.kind)].append(a)
    dropped: set[str] = set()
    for group in groups.values():
        t0 = min(_when(a) for a in group)
        when = {a.id: (_when(a) - t0).total_seconds() for a in group}
        prints = {a.id: decode_print(metrics[a.id].feature_print).astype(np.float64) for a in group}
        kept: list[tuple[float, str]] = []         # (seconds, id) of kept shots, in time order
        for a in sorted(group, key=lambda a: (_quality(metrics[a.id]), a.id), reverse=True):
            t, p = when[a.id], prints[a.id]
            near = kept[bisect.bisect_left(kept, t - NEAR_DUP_WINDOW_S, key=lambda kt: kt[0]):
                        bisect.bisect_right(kept, t + NEAR_DUP_WINDOW_S, key=lambda kt: kt[0])]
            if any(prints[k].shape == p.shape and float(np.linalg.norm(prints[k] - p)) < NEAR_DUP_DISTANCE
                   for _, k in near):
                dropped.add(a.id)
            else:
                bisect.insort(kept, (t, a.id))
    return dropped


def _bursts(assets: Sequence[Asset], metrics: dict[str, Metrics]) -> dict[str, str]:
    """asset id -> burst id (the id of the burst's first shot), assets in time order per group."""
    groups: dict[tuple[str, bool], list[Asset]] = defaultdict(list)
    burst_of: dict[str, str] = {}
    for a in assets:
        if _when(a) is None:
            burst_of[a.id] = a.id
        else:
            groups[(a.event_key, a.kind in STILL_KINDS)].append(a)
    for members in groups.values():
        members.sort(key=lambda a: (_when(a), a.id))
        open_bursts: list[tuple[str, Asset]] = []      # (burst id, latest member)
        for a in members:
            # in time order, a burst whose latest shot is too old can never grow again
            open_bursts = [ob for ob in open_bursts if _seconds(_when(a), _when(ob[1])) <= BURST_GAP_S]
            match = _join(a, open_bursts, metrics)
            if match is None:
                open_bursts.append((a.id, a))
                burst_of[a.id] = a.id
            else:
                burst_of[a.id] = open_bursts[match][0]
                open_bursts[match] = (open_bursts[match][0], a)
    return burst_of


def _join(a: Asset, open_bursts: list[tuple[str, Asset]], metrics: dict[str, Metrics]) -> int | None:
    """Index of the open (recent enough) burst `a` continues - closest dHash wins - or None."""
    best, best_d = None, BURST_MAX_HAMMING + 1
    for i, (_, last) in enumerate(open_bursts):
        d = hamming(metrics[a.id].dhash, metrics[last.id].dhash)
        if d < best_d:
            best, best_d = i, d
    return best


def _seconds(a: datetime | None, b: datetime | None) -> float:
    if a is None or b is None:
        return float("inf")
    return abs((a - b).total_seconds())
