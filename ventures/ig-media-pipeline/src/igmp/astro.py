"""Night sky: find the astro shooting in the library, let Claude decide what to make of it, make it.

A run of night-sky frames from a fixed camera can become several different things, and which
one is right depends on the frames: a Milky Way set of 8 x 15 s wants stacking (noise falls by
about sqrt(N) and the foreground stays sharp); 200 frames over an hour want star trails or a
timelapse; a run where clouds roll in halfway wants only its clear stretch. Code measures, Claude
decides, code renders, Claude checks the result.

Groups (`find_groups`)
----------------------
* night sequences: intervalometer runs `sequences.detect` already made, whose members are dark
  (median brightness under NIGHT_BRIGHTNESS) or carry an Apple Vision night label;
* stack runs: 3+ dark photos from one camera, each within STACK_MAX_GAP_S of the last and with
  near-identical framing (dHash), that are not part of a sequence - a manual stack of a few long
  exposures is too short or too irregular to be an intervalometer run.

Measurements (`measure`), local and free
----------------------------------------
Exposure, ISO, aperture and focal length (exiftool) and, on downscaled previews of the first,
middle and last frames, the number of stars (`astro_core.find_stars`) and how far the sky turned
between first and last (`astro_core.estimate_transform`). A group whose frames are short
exposures with few stars - a city at night, a dark restaurant - is recorded as not astro and
never sent to Claude.

Plan (`AstroPlan`), one Claude call per group
---------------------------------------------
Claude sees a contact sheet of the run and one large frame, both stretched so the sky is
visible, with a 10% grid, plus the measurements as text. It answers: is this a night sky at all;
which outputs to make (`stack`, `star-trails`, `timelapse`, `trail-timelapse`), best first;
which frames to use and which to drop (planes, headlights, cloud, a torch); the horizon as a
polyline, so the sky is aligned on the stars while the foreground is not; how to treat the
foreground; and the grade.

Rendering
---------
Frames are developed linear from RAW (rawpy, camera white balance, no auto-brightening; the
camera JPEG, linearised, when there is no RAW) at WORK_LONG_EDGE. The sky and foreground layers
are cached as float16 .npy, so a revised grade or horizon re-renders in seconds.

* stack: every frame's stars are matched to the middle frame's, the sky is warped onto it and
  sigma-clip averaged; the foreground is the per-pixel median of the unaligned frames (or one
  chosen frame); the two meet along the horizon, feathered.
* star-trails: per-pixel maximum of the unaligned sky over the median foreground.
* trail-timelapse: a running maximum with decay, one video frame per input frame.
* timelapse: left to `sequences.render_clip` (night clips get denoised at reel render).

Each still goes to a critic with the plan; it ships it, revises the grade/horizon/frames (up to
REVISIONS times) or rejects it. Shipped stills become the `edits` record of the run's lead frame,
which is how reels, carousels and the posting queue pick up edited photos; sequence outputs are
returned by `reel_source` in place of the plain clip.
"""
from __future__ import annotations

import json
import logging
import math
import shutil
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path
from statistics import median
from typing import Literal

import numpy as np
from PIL import Image, ImageDraw, ImageOps
from pydantic import BaseModel, Field

from . import astro_core as core
from . import media
from .catalog import asset_id
from .config import Config
from .judge import Backend, JudgeError, JudgeTask
from .models import Asset, Metrics, Point, Score
from .prefilter import NIGHT_LABELS, hamming

log = logging.getLogger(__name__)

NIGHT_BRIGHTNESS = 0.18      # same cut as reels._night: below this a frame reads as night
DARK_SHARE = 0.6             # share of a sequence's members that must be dark
STACK_MIN_FRAMES = 3
STACK_MAX_GAP_S = 180.0      # a 30 s exposure plus long-exposure noise reduction is ~60 s apart
STACK_MAX_HAMMING = 12       # of 64 dHash bits: a tripod, not a handheld walk
LONG_EXPOSURE_S = 1.0        # at least this, or MIN_STARS stars, or it is not astro
MIN_STARRY_EXPOSURE_S = 0.25  # ...or this with MIN_STARS: a fast lens at high ISO can catch stars
MIN_STARS = 25               # stars on a ~1024 px preview of a clear sky: hundreds; a lit street: a few
WORK_LONG_EDGE = 3000        # px; outputs are 1080 wide, this leaves room for crops
MAX_STACK = 40               # sqrt(40) ~ 6x less noise; more frames add little but time
REVISIONS = 2
FEED_SIZE = (1080, 1350)
SHEET_FRAMES = 12

Output = Literal["stack", "star-trails", "timelapse", "trail-timelapse"]


# --- what Claude answers -----------------------------------------------------------------
class AstroGrade(BaseModel):
    stretch: float = Field(0.5, ge=0, le=1, description="How hard to lift the faint sky: 0 linear, 1 very strong "
                                                       "(Milky Way core and dust lanes); 0.4-0.7 is typical")
    black_point: float = Field(0.3, ge=0, le=1, description="How dark the background sky goes: 0 grey and airy, "
                                                           "1 deep black; keep some sky tone, 0.2-0.5 is typical")
    gradient_removal: float = Field(0.5, ge=0, le=1, description="Remove light pollution and horizon glow "
                                                                "gradients from the sky: 0 none, 1 all")
    saturation: float = Field(1.2, ge=0, le=2, description="1 = as shot; 1.1-1.4 brings out star colour and the core")
    warmth: float = Field(0, ge=-1, le=1, description="-1 cool/blue night, 0 camera white balance, +1 warm")
    foreground_lift: float = Field(0.3, ge=0, le=1, description="Brighten the land below the horizon so it reads "
                                                               "as a silhouette with detail (0) or a lit scene (1)")


class AstroPlan(BaseModel):
    is_night_sky: bool = Field(description="False when this is not a starry sky (city lights, a dark room, fireworks)")
    outputs: list[Output] = Field(
        description="What to make, best first, at most 3. stack: one clean still from aligned frames (Milky Way, "
                    "constellations; needs 3+ frames of the same sky). star-trails: one still where the stars draw "
                    "arcs (needs ~15+ min of frames). timelapse: the run played as video (needs ~40+ frames). "
                    "trail-timelapse: video where stars leave growing trails. Empty when is_night_sky is false.")
    frame_from: int | None = Field(None, description="First frame index to use; null = 0")
    frame_to: int | None = Field(None, description="Last frame index to use; null = the last frame")
    drop_frames: list[int] = Field([], description="Frame indices to leave out of stacks and trails: a plane, a "
                                                   "car's headlights, a torch, a passing cloud, a bumped tripod")
    horizon: list[Point] = Field(
        [], description="Where sky meets land, left to right, in the grid's fractions of the large frame (x 0-1 "
                        "left to right, y 0-1 top to bottom); 3-12 points following the skyline. Empty when the "
                        "frame is all sky. Everything above is aligned on the stars, below is held still.")
    foreground: Literal["median", "frame", "none"] = Field(
        "median", description="median: the land from all frames (cleanest); frame: from foreground_frame (light "
                              "painting, a person who stood still for one frame); none: all sky")
    foreground_frame: int | None = Field(None, description="Frame index for foreground='frame'")
    trail_decay: float = Field(0.97, ge=0.5, le=1, description="trail-timelapse: 1 keeps whole trails, 0.9 short "
                                                               "comet tails")
    fps: int = Field(24, ge=8, le=60, description="timelapse and trail-timelapse playback rate")
    grade: AstroGrade = Field(default_factory=AstroGrade)
    vertical_focus: Point = Field(description="Centre of the 9:16 crop for video and reels")
    feed_focus: Point = Field(description="Centre of the 4:5 feed crop for stills")
    reason: str = Field(description="One or two sentences on why these outputs and settings")


class AstroReview(BaseModel):
    verdict: Literal["ship", "revise", "reject"]
    notes: str = Field(description="What is wrong or right, specifically (noise, trailing stars, a seam at the "
                                   "horizon, clipped core, colour cast, gradient left in the sky)")
    revised: AstroPlan | None = Field(None, description="revise only: the whole plan with your changes; change the "
                                                        "grade, horizon, frames or drop_frames, keep outputs")


class AstroGroup(BaseModel):
    id: str
    kind: Literal["sequence", "stack-run"]
    members: list[str]
    event_key: str
    camera: str = ""
    interval_s: float | None = None


# --- finding the groups ------------------------------------------------------------------
def _dark(m: Metrics | None) -> bool:
    return m is not None and (m.brightness < NIGHT_BRIGHTNESS or bool(set(m.labels) & NIGHT_LABELS))


def find_groups(assets: list[Asset], metrics: dict[str, Metrics]) -> list[AstroGroup]:
    groups: list[AstroGroup] = []
    in_seq: set[str] = set()
    for a in assets:
        if a.kind != "sequence":
            continue
        in_seq.update(a.members)
        dark = sum(_dark(metrics.get(m)) for m in a.members)
        if a.members and dark >= DARK_SHARE * len(a.members):
            groups.append(AstroGroup(id=a.id, kind="sequence", members=list(a.members), event_key=a.event_key,
                                     camera=a.camera, interval_s=a.interval_s))
    lanes: dict[tuple[str, str], list[Asset]] = {}
    for a in assets:
        if a.kind == "photo" and a.id not in in_seq and _dark(metrics.get(a.id)) and (a.taken_at or a.clock_time):
            lanes.setdefault((a.event_key, a.camera), []).append(a)
    for (event_key, camera), shots in lanes.items():
        shots.sort(key=lambda a: a.taken_at or a.clock_time)
        run = [shots[0]]
        for prev, cur in zip(shots, shots[1:]):
            gap = ((cur.taken_at or cur.clock_time) - (prev.taken_at or prev.clock_time)).total_seconds()
            close = hamming(metrics[prev.id].dhash, metrics[cur.id].dhash) <= STACK_MAX_HAMMING
            if gap <= STACK_MAX_GAP_S and close:
                run.append(cur)
                continue
            if len(run) >= STACK_MIN_FRAMES:
                groups.append(_stack_run(run, event_key, camera))
            run = [cur]
        if len(run) >= STACK_MIN_FRAMES:
            groups.append(_stack_run(run, event_key, camera))
    return groups


def _stack_run(run: list[Asset], event_key: str, camera: str) -> AstroGroup:
    return AstroGroup(id=asset_id("astro", run[0].id), kind="stack-run", members=[a.id for a in run],
                      event_key=event_key, camera=camera)


# --- measuring ---------------------------------------------------------------------------
def _exif(paths: list[str], cfg: Config) -> list[dict]:
    try:
        out = subprocess.run([cfg.exiftool, "-json", "-n", "-ExposureTime", "-ISO", "-FNumber", "-FocalLength",
                              *paths], capture_output=True, text=True, timeout=120)
        return json.loads(out.stdout or "[]")
    except (OSError, ValueError, subprocess.SubprocessError):
        return []


def _gray(path: Path, edge: int = 1024) -> np.ndarray:
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im).convert("L")
        im.thumbnail((edge, edge))
        return np.asarray(im, np.float32) / 255.0


def measure(group: AstroGroup, members: list[Asset], cfg: Config) -> dict:
    """Cheap facts about a group, for the astro gate and for Claude's prompt."""
    n = len(members)
    probe = sorted({0, n // 2, n - 1})
    ex = _exif([members[i].raw or members[i].preview for i in probe if members[i].raw or members[i].preview], cfg)
    exposures = [float(e["ExposureTime"]) for e in ex if e.get("ExposureTime")]
    stars, fields = [], []
    for i in probe:
        try:
            g = _gray(media.preview_image(members[i], cfg))
        except (media.MediaError, OSError):
            continue
        s = core.find_stars(g)
        stars.append(len(s))
        fields.append((i, s, g.shape))
    drift = None
    if len(fields) >= 2 and len(fields[0][1]) >= 8 and len(fields[-1][1]) >= 8:
        fit = core.estimate_transform(fields[0][1], fields[-1][1])
        t0, t1 = members[fields[0][0]], members[fields[-1][0]]
        dt = ((t1.taken_at or t1.clock_time) - (t0.taken_at or t0.clock_time)).total_seconds() \
            if (t1.taken_at or t1.clock_time) and (t0.taken_at or t0.clock_time) else 0
        if fit is not None and dt > 0:
            drift = round(core.drift_px_per_min(fit[0], dt, fields[0][2]), 2)
    first, last = members[0], members[-1]
    span = ((last.taken_at or last.clock_time) - (first.taken_at or first.clock_time)).total_seconds() \
        if (last.taken_at or last.clock_time) and (first.taken_at or first.clock_time) else None
    return {
        "frames": n,
        "span_min": round(span / 60, 1) if span is not None else None,
        "interval_s": group.interval_s,
        "exposure_s": median(exposures) if exposures else None,
        "iso": ex[0].get("ISO") if ex else None,
        "f_number": ex[0].get("FNumber") if ex else None,
        "focal_mm": ex[0].get("FocalLength") if ex else None,
        "stars_on_preview": stars,
        "sky_drift_px_per_min_at_1024": drift,
        "has_raw": all(m.raw for m in members),
    }


def looks_astro(facts: dict) -> bool:
    """Worth a Claude call: a long exposure, or a fairly long one full of point sources. A
    handheld 1/100 s at ISO 12800 shows hundreds of "stars" that are city lights and noise, so
    stars alone never qualify when the exposure is known to be short."""
    stars = facts.get("stars_on_preview") or []
    starry = bool(stars) and median(stars) >= MIN_STARS
    exp = facts.get("exposure_s")
    if exp is None:
        return starry
    return exp >= LONG_EXPOSURE_S or (exp >= MIN_STARRY_EXPOSURE_S and starry)


# --- what Claude sees --------------------------------------------------------------------
def stretched(path: Path, edge: int) -> Image.Image:
    """A preview lifted so a dark sky shows its stars and a horizon its shape."""
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        im.thumbnail((edge, edge))
        x = np.asarray(im, np.float32) / 255.0
    lo, hi = np.percentile(x, 1), np.percentile(x, 99.7)
    y = np.clip((x - lo) / max(hi - lo, 1e-3), 0, 1)
    y = np.arcsinh(20 * y) / np.arcsinh(20)
    return Image.fromarray((y * 255).astype(np.uint8))


def _grid(im: Image.Image) -> Image.Image:
    im = im.copy()
    d = ImageDraw.Draw(im)
    w, h = im.size
    for k in range(1, 10):
        x, y = w * k // 10, h * k // 10
        d.line([(x, 0), (x, h)], fill=(255, 220, 0), width=1)
        d.line([(0, y), (w, y)], fill=(255, 220, 0), width=1)
        d.text((x + 3, 3), f"{k / 10:.1f}", fill=(255, 220, 0))
        d.text((3, y + 3), f"{k / 10:.1f}", fill=(255, 220, 0))
    return im


def views(group: AstroGroup, members: list[Asset], cfg: Config) -> list[Path]:
    """[contact sheet, large middle frame with a grid], both stretched, cached under state/astro."""
    out = cfg.state_dir / "astro" / group.id
    out.mkdir(parents=True, exist_ok=True)
    sheet_p, big_p = out / "sheet.jpg", out / "frame.jpg"
    if not sheet_p.exists():
        n = len(members)
        idx = sorted({round(i * (n - 1) / max(SHEET_FRAMES - 1, 1)) for i in range(min(SHEET_FRAMES, n))})
        tiles = []
        for i in idx:
            t = stretched(media.preview_image(members[i], cfg), 400)
            ImageDraw.Draw(t).text((6, 6), f"#{i}", fill=(255, 255, 0))
            tiles.append(t)
        cols = 4
        tw, th = max(t.width for t in tiles), max(t.height for t in tiles)
        sheet = Image.new("RGB", (cols * tw, math.ceil(len(tiles) / cols) * th))
        for k, t in enumerate(tiles):
            sheet.paste(t, ((k % cols) * tw, (k // cols) * th))
        sheet.save(sheet_p, quality=88)
    if not big_p.exists():
        _grid(stretched(media.preview_image(members[len(members) // 2], cfg), 1400)).save(big_p, quality=90)
    return [sheet_p, big_p]


def instructions(group: AstroGroup, facts: dict) -> str:
    n = len(group.members)
    kind = ("an intervalometer run" if group.kind == "sequence"
            else "a short run of photos from a fixed camera, likely meant for stacking")
    return (
        f"These are {n} night photos, {kind}, frame indices 0..{n - 1}. Image 1 is a contact sheet of evenly "
        "spaced frames labelled #index; image 2 is the middle frame, large, with a grid in fractions (0-1) for "
        "the horizon. Both are brightened a lot so you can see the sky: judge the stars and the composition, not "
        "the brightness or noise of these previews. Measurements (local, exact): "
        + json.dumps(facts) +
        ". Decide what to make. Stack when the frames show the same sky for a clean still (Milky Way, a "
        "constellation over a landmark) - ideal for 3-40 frames of 5-30 s. Star trails when the run spans 15+ "
        "minutes. Timelapse when there are 40+ frames and something moves (stars wheeling, clouds, the Milky Way "
        "rising); trail-timelapse adds trails to that. A run can make more than one: e.g. stack the clearest 20 "
        "frames AND make a trail-timelapse of all of them. Drop frames with a plane, satellite flare, headlights, "
        "a torch, cloud over the subject, or a bumped camera; use frame_from/frame_to for a clear stretch. Trace "
        "the horizon on image 2 carefully - trees, mountains, rooftops - because the sky above it is aligned on "
        "the stars and the land below is not; a wrong horizon smears the land or doubles the stars. The median "
        "foreground is cleanest for rock, sand and buildings; for grass or bushes that moved in the wind, or a "
        "foreground lit differently frame to frame (light painting, a passing car), use foreground='frame' with "
        "the best-lit sharp frame, or a median would ghost it. Grade like a "
        "careful astro photographer: natural star colour, a sky that is dark but not crushed, no clipped core, "
        "no neon. vertical_focus centres the 9:16 reel crop; feed_focus the 4:5 still crop (keep the land "
        "anchor in it). If this is not a starry sky at all, set is_night_sky false and outputs empty.")


# --- developing frames -------------------------------------------------------------------
def _area_resize(x: np.ndarray, edge: int) -> np.ndarray:
    f = max(1, math.ceil(max(x.shape[:2]) / edge))
    if f == 1:
        return x
    h, w = (x.shape[0] // f) * f, (x.shape[1] // f) * f
    return x[:h, :w].reshape(h // f, f, w // f, f, -1).mean(axis=(1, 3))


def _srgb_to_linear(x: np.ndarray) -> np.ndarray:
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)


def load_linear(a: Asset, edge: int) -> np.ndarray:
    """Linear RGB float32 0..1 at about `edge` px on the long side."""
    if a.raw:
        try:
            import rawpy
            with rawpy.imread(a.raw) as raw:
                rgb = raw.postprocess(gamma=(1, 1), no_auto_bright=True, output_bps=16, use_camera_wb=True,
                                      half_size=True)
            return _area_resize(rgb.astype(np.float32) / 65535.0, edge).astype(np.float32)
        except Exception as e:          # an unreadable RAW: fall back to its JPEG
            log.warning("astro: raw %s unreadable (%s); using the JPEG", a.raw, e)
    with Image.open(a.preview) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        im.thumbnail((edge, edge), Image.Resampling.LANCZOS)
        x = np.asarray(im, np.float32) / 255.0
    return _srgb_to_linear(x).astype(np.float32)


def _strip_apply(fn, arrays: list[np.ndarray], rows: int = 128, **kw) -> np.ndarray:
    """Run a per-pixel reducer over row strips to keep the cube small."""
    h = arrays[0].shape[0]
    parts = [fn([a[y:y + rows] for a in arrays], **kw) for y in range(0, h, rows)]
    return np.concatenate(parts, axis=0)


def _median(frames: list[np.ndarray]) -> np.ndarray:
    return np.median(np.stack(frames), axis=0).astype(np.float32)


def chosen(plan: AstroPlan, n: int) -> list[int]:
    a = 0 if plan.frame_from is None else min(max(plan.frame_from, 0), n - 1)
    b = n - 1 if plan.frame_to is None else min(max(plan.frame_to, a), n - 1)
    drop = set(plan.drop_frames)
    keep = [i for i in range(a, b + 1) if i not in drop]
    return keep or list(range(a, b + 1))


def _even(idx: list[int], k: int) -> list[int]:
    if len(idx) <= k:
        return idx
    mid = len(idx) // 2       # the middle of the run: least field rotation against the reference
    lo = max(0, mid - k // 2)
    return idx[lo:lo + k]


def _layers_path(group: AstroGroup, cfg: Config, mode: str, idx: list[int], edge: int) -> Path:
    key = f"{mode}_{edge}_{idx[0]}-{idx[-1]}_{len(idx)}_{abs(hash(tuple(idx))) % 10**8}"
    return cfg.state_dir / "astro" / group.id / f"{key}.npz"


def sky_layers(group: AstroGroup, members: list[Asset], plan: AstroPlan, cfg: Config, mode: str,
               edge: int) -> tuple[np.ndarray, np.ndarray]:
    """(sky, foreground) linear float32 layers for `mode` in ("stack", "star-trails"), cached."""
    idx = chosen(plan, len(members))
    if mode == "stack":
        idx = _even(idx, int(cfg.extra.get("astro_max_stack", MAX_STACK)))
    path = _layers_path(group, cfg, mode, idx, edge)
    if path.exists():
        z = np.load(path)
        return z["sky"].astype(np.float32), z["fg"].astype(np.float32)
    frames = [load_linear(members[i], edge) for i in idx]
    shape = min(f.shape for f in frames)
    frames = [f[:shape[0], :shape[1]] for f in frames]
    if mode == "stack":
        ref = frames[len(frames) // 2]
        sky_mask = core.horizon_mask([(p.x, p.y) for p in plan.horizon], ref.shape[:2])
        ref_stars = core.find_stars(core.luminance(ref), mask=sky_mask)
        warped, cover = [], []
        for i, f in zip(idx, frames):
            if f is ref:
                warped.append(f)
                cover.append(np.ones(f.shape[:2], np.float32))
                continue
            fit = core.estimate_transform(ref_stars, core.find_stars(core.luminance(f), mask=sky_mask))
            if fit is None:
                log.info("astro %s: frame %d did not align; left out of the sky", group.id, i)
                continue
            warped.append(core.warp(f, fit[0]))
            cover.append(core.warp(np.ones(f.shape[:2], np.float32), fit[0]))
        sky = _clip_strips(warped, cover)
    else:
        sky = core.lighten(frames)
    fg = frames[min(max((plan.foreground_frame or 0) - idx[0], 0), len(frames) - 1)] \
        if plan.foreground == "frame" else _strip_apply(_median, frames)
    path.parent.mkdir(parents=True, exist_ok=True)
    np.savez(path, sky=sky.astype(np.float16), fg=fg.astype(np.float16))
    return sky, fg


def _clip_strips(frames: list[np.ndarray], cover: list[np.ndarray], rows: int = 128) -> np.ndarray:
    h = frames[0].shape[0]
    return np.concatenate([core.sigma_clip_mean([f[y:y + rows] for f in frames],
                                                weights=[c[y:y + rows] for c in cover])
                           for y in range(0, h, rows)], axis=0)


# --- grading -----------------------------------------------------------------------------
def levels(lin: np.ndarray, g: AstroGrade, sky: np.ndarray | None = None) -> tuple[float, float]:
    """Black and white points from the sky's own statistics, fixed per output so a video does
    not pump."""
    lum = core.luminance(lin)
    sample = lum[sky] if sky is not None and sky.any() else lum
    bg = float(np.median(sample))
    noise = core.robust_sigma(sample[:: max(1, sample.size // 500_000)])
    black = max(0.0, bg - (3.0 - 4.0 * g.black_point) * noise)
    white = float(np.percentile(lum, 99.95))
    return black, max(white, black + 1e-4)


def grade(lin: np.ndarray, g: AstroGrade, sky_alpha: np.ndarray, lv: tuple[float, float] | None = None) -> np.ndarray:
    """Linear layers -> display RGB 0..1."""
    x = lin.copy()
    if g.gradient_removal > 0:
        # per channel, so a coloured glow (teal airglow, orange town light, a magenta corner) goes
        # with its brightness; each channel keeps its own floor, so the white balance stays put
        sky = sky_alpha > 0.5
        for c in range(3):
            bg = core.background(x[..., c])
            floor = np.percentile(bg[sky], 5) if sky.any() else np.percentile(bg, 5)
            x[..., c] -= g.gradient_removal * np.clip(bg - floor, 0, None) * sky_alpha
        x = np.clip(x, 0, None)
    fg_alpha = (1.0 - sky_alpha)[..., None]
    x = x * (1.0 + 3.0 * g.foreground_lift * fg_alpha)
    black, white = lv or levels(x, g, sky_alpha > 0.5)
    x = np.clip((x - black) / (white - black), 0, None)
    a = 1.0 + 300.0 * g.stretch ** 2
    x = np.arcsinh(a * x) / np.arcsinh(a)
    lum = core.luminance(x)[..., None]
    x = lum + (x - lum) * g.saturation
    x *= np.array([1 + 0.08 * g.warmth, 1.0, 1 - 0.08 * g.warmth], np.float32)
    return np.clip(x, 0, 1)


def composite(sky: np.ndarray, fg: np.ndarray, plan: AstroPlan) -> tuple[np.ndarray, np.ndarray]:
    mask = core.horizon_mask([(p.x, p.y) for p in plan.horizon], sky.shape[:2])
    alpha = core.feather(mask, 0.004 * max(sky.shape[:2])) if plan.foreground != "none" else np.ones(mask.shape, np.float32)
    return sky * alpha[..., None] + fg * (1 - alpha[..., None]), alpha


def _to_image(x: np.ndarray) -> Image.Image:
    return Image.fromarray((np.clip(x, 0, 1) * 255 + 0.5).astype(np.uint8))


def _crop(im: Image.Image, size: tuple[int, int], focus: Point) -> Image.Image:
    return ImageOps.fit(im, size, Image.Resampling.LANCZOS, centering=(focus.x, focus.y))


# --- rendering ---------------------------------------------------------------------------
def out_dir(group: AstroGroup, cfg: Config) -> Path:
    return cfg.output_dir / "photos" / group.event_key / "astro"


def render_still(group: AstroGroup, members: list[Asset], plan: AstroPlan, cfg: Config, mode: str) -> dict:
    edge = int(cfg.extra.get("astro_long_edge", WORK_LONG_EDGE))
    sky, fg = sky_layers(group, members, plan, cfg, mode, edge)
    lin, alpha = composite(sky, fg, plan)
    im = _to_image(grade(lin, plan.grade, alpha))
    d = out_dir(group, cfg)
    d.mkdir(parents=True, exist_ok=True)
    full, ig = d / f"{group.id}__{mode}.jpg", d / f"{group.id}__{mode}.ig.jpg"
    im.save(full, quality=95)
    _crop(im, FEED_SIZE, plan.feed_focus).save(ig, quality=95)
    return {"full": str(full), "ig": str(ig)}


def render_trail_timelapse(group: AstroGroup, members: list[Asset], plan: AstroPlan, cfg: Config) -> dict:
    from . import sequences
    idx = chosen(plan, len(members))
    d = cfg.state_dir / "astro" / group.id
    clip = d / f"trails_{plan.fps}_{idx[0]}-{idx[-1]}_{len(idx)}_{int(plan.trail_decay * 1000)}.mp4"
    if clip.exists():
        return {"video": str(clip)}
    edge = 1920 * 2
    first = load_linear(members[idx[0]], edge)
    mask = core.horizon_mask([(p.x, p.y) for p in plan.horizon], first.shape[:2])
    alpha = core.feather(mask, 0.004 * max(first.shape[:2])) if plan.foreground != "none" \
        else np.ones(mask.shape, np.float32)
    lv = levels(first, plan.grade, mask)
    tmp = Path(tempfile.mkdtemp(prefix="igmp-astro-"))
    try:
        acc = None
        for k, i in enumerate(idx):
            cur = first if k == 0 else load_linear(members[i], edge)[: first.shape[0], : first.shape[1]]
            acc = cur if acc is None else np.maximum(acc * plan.trail_decay, cur)
            lin = acc * alpha[..., None] + cur * (1 - alpha[..., None])
            _crop(_to_image(grade(lin, plan.grade, alpha, lv)), (1080, 1920), plan.vertical_focus) \
                .save(tmp / f"{k:06d}.jpg", quality=93)
        clip.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(sequences.ffmpeg_args(tmp / "%06d.jpg", plan.fps, clip, cfg), check=True,
                       capture_output=True)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return {"video": str(clip)}


# --- the stage ---------------------------------------------------------------------------
def plan_task(group: AstroGroup, members: list[Asset], facts: dict, cfg: Config) -> JudgeTask:
    return JudgeTask(key=f"astro:{group.id}", output=AstroPlan, images=views(group, members, cfg),
                     instructions=instructions(group, facts), effort="medium", max_tokens=8000)


def review(group: AstroGroup, plan: AstroPlan, mode: str, still: dict, cfg: Config, judge: Backend,
           notes: list[str]) -> AstroReview:
    text = (f"You planned this {mode} from {len(group.members)} night frames with: {plan.model_dump_json()}. "
            "The image is the result, full frame. Check it as a demanding astro photographer would: stars round "
            "and sharp (not doubled or trailed in a stack), no seam or halo along the horizon, land not smeared, "
            "no leftover light-pollution gradient or colour cast, a foreground that is sharp and not ghosted (if a "
            "median of moving plants ghosted it, switch to foreground='frame'), core not clipped, background not crushed to "
            "black or left grey and noisy, star colour natural. Ship it if it is good enough to post; revise "
            "with a full corrected plan (grade, horizon, frames) if a change would clearly fix something; "
            "reject if the frames cannot make a good image." + (f" Earlier rounds: {' | '.join(notes)}" if notes else ""))
    return judge.judge(JudgeTask(key=f"astro-review:{group.id}:{mode}", output=AstroReview,
                                 images=[Path(still["full"])], instructions=text, effort="medium"))


def _lead(group: AstroGroup, store, metrics: dict[str, Metrics]) -> str:
    """The frame of a stack run that stands for it in edits: the best scored, else a candidate,
    else the middle."""
    scored = [(store.get("scores", m, Score), m) for m in group.members]
    scored = [(s.score, m) for s, m in scored if s is not None]
    if scored:
        return max(scored)[1]
    cands = [m for m in group.members if metrics.get(m) and metrics[m].candidate]
    return cands[0] if cands else group.members[len(group.members) // 2]


def run(cfg: Config, store, judge: Backend, assets: list[Asset], only: str | None = None) -> int:
    """Find, plan, render and review every night-sky group not yet done. Returns outputs made."""
    metrics = dict(store.all("metrics", Metrics))
    by_id = dict(store.all("assets", Asset)) | {a.id: a for a in assets}
    groups = [g for g in find_groups(list(by_id.values()), metrics) if not only or only in g.event_key]
    todo = []
    for g in groups:
        rec = store.get("astro", g.id) or {}
        if rec.get("status") in ("done", "not-astro"):
            continue
        members = [by_id.get(m) for m in g.members]
        if any(m is None for m in members):
            continue
        if "facts" not in rec:
            try:
                rec = {"group": g.model_dump(), "facts": measure(g, members, cfg)}
            except (media.MediaError, OSError) as e:
                store.put("jobs", f"astro:{g.id}", {"error": f"cannot measure: {e}"})
                continue
            if not looks_astro(rec["facts"]):
                rec["status"] = "not-astro"
            store.put("astro", g.id, rec)
            if rec.get("status") == "not-astro":
                continue
        todo.append((g, members, rec))
    log.info("astro: %d night-sky groups to do (%d found)", len(todo), len(groups))

    need_plan = [(g, m, r) for g, m, r in todo if "plan" not in r]
    tasks, keyed = [], {}
    for g, members, rec in need_plan:
        try:
            tasks.append(plan_task(g, members, rec["facts"], cfg))
            keyed[f"astro:{g.id}"] = (g, rec)
        except (media.MediaError, OSError) as e:
            store.put("jobs", f"astro:{g.id}", {"error": f"no preview: {e}"})

    def planned(key: str, result) -> None:
        g, rec = keyed[key]
        if isinstance(result, JudgeError):
            store.put("jobs", key, {"error": str(result)})
            return
        rec["plan"] = result.model_dump()
        if not result.is_night_sky or not result.outputs:
            rec["status"] = "not-astro"
        store.put("astro", g.id, rec)

    judge.judge_many(tasks, on_result=planned)

    made = 0
    for g, members, _ in todo:
        rec = store.get("astro", g.id) or {}
        if "plan" not in rec or rec.get("status") == "not-astro":
            continue
        try:
            made += finish(g, members, rec, cfg, store, judge, metrics)
        except (JudgeError, OSError, subprocess.CalledProcessError, media.MediaError, ValueError) as e:
            store.put("jobs", f"astro:{g.id}", {"error": str(e)})
    return made


def finish(group: AstroGroup, members: list[Asset], rec: dict, cfg: Config, store, judge: Backend,
           metrics: dict[str, Metrics]) -> int:
    plan = AstroPlan.model_validate(rec["plan"])
    outputs = rec.setdefault("outputs", {})
    made = 0
    for mode in plan.outputs:
        if mode in outputs:
            continue
        if mode == "timelapse":
            if group.kind != "sequence" or len(members) < 2:
                continue
            outputs[mode] = {"status": "shipped"}        # sequences.render_clip makes it on demand
        elif mode == "trail-timelapse":
            if len(members) < 10:
                continue
            outputs[mode] = {"status": "shipped", **render_trail_timelapse(group, members, plan, cfg)}
        else:
            outputs[mode] = _still_rounds(group, members, plan, mode, cfg, judge)
        made += outputs[mode]["status"] == "shipped"
        store.put("astro", group.id, rec)
    rec["status"] = "done"
    store.put("astro", group.id, rec)
    if group.kind == "stack-run":
        best = next((outputs[m] for m in plan.outputs if outputs.get(m, {}).get("status") == "shipped"
                     and "full" in outputs[m]), None)
        if best:
            lead = _lead(group, store, metrics)
            prev = store.get("edits", lead)
            store.put("edits", lead, {"status": "shipped", "full": best["full"], "ig": best["ig"],
                                      "astro": group.id, "single_frame_edit": prev})
    return made


def _still_rounds(group, members, plan: AstroPlan, mode: str, cfg: Config, judge: Backend) -> dict:
    notes: list[str] = []
    for round_ in range(REVISIONS + 1):
        still = render_still(group, members, plan, cfg, mode)
        verdict = review(group, plan, mode, still, cfg, judge, notes)
        notes.append(verdict.notes)
        if verdict.verdict == "ship":
            return {"status": "shipped", **still, "plan": plan.model_dump(), "notes": notes, "rounds": round_ + 1}
        if verdict.verdict == "reject" or verdict.revised is None or round_ == REVISIONS:
            return {"status": "rejected" if verdict.verdict == "reject" else "held", **still,
                    "plan": plan.model_dump(), "notes": notes, "rounds": round_ + 1}
        revised = verdict.revised
        revised.outputs = plan.outputs
        plan = revised
    raise AssertionError("unreachable")


def reel_source(seq: Asset, store) -> dict | None:
    """What a reel shows for a night sequence, when the astro stage made something for it: its
    trail-timelapse as video, or its shipped stack / star-trail still. None = the plain clip."""
    rec = store.get("astro", seq.id)
    if not rec or rec.get("status") != "done":
        return None
    plan = AstroPlan.model_validate(rec["plan"])
    for mode in plan.outputs:
        out = rec.get("outputs", {}).get(mode, {})
        if out.get("status") != "shipped":
            continue
        if mode == "timelapse":
            return None
        if mode == "trail-timelapse" and Path(out["video"]).exists():
            return {"kind": "video", "path": out["video"], "denoise": True}
        if "full" in out and Path(out["full"]).exists():
            return {"kind": "photo", "path": out["full"]}
    return None
