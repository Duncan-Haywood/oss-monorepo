"""Stage 6: Instagram carousels. Per event, up to two kinds when the material allows:

  story         5-10 slides that tell the event (a photo dump of up to 20 when there are that
                many strong, varied frames): slide 1 opens a loop, the last is the best frame or
                a strong detail
  before-after  2-4 photos, each as two consecutive slides: the camera's own JPEG, then the
                shipped RAW edit, framed identically

Candidates: shipped RAW edits first; strong camera JPEGs when an event has few edits; flat views
of strong 360 shots (and a tiny planet of the strongest); a sequence's sharpest frame. Claude sees
a labelled sheet of them and returns the slides in swipe order with a caption (structured output);
a checklist critic ships the carousel or revises it up to twice, else it waits for a human.

Instagram gives every slide the first slide's shape, so every slide is 4:5 (1080x1350, sRGB JPEG
q92) and fills the frame: a picture of another shape is cropped around its focus. Only a frame whose
subject a crop would cut may be shown whole over a blurred copy of itself ('fit'), at most one per
carousel. Slides are photos only (no video slides yet).

Outputs (cfg.output_dir / "carousels"), one folder per event; <name> is <event>__NN for story
carousels (NN counts them) and <event>__before-after:
  <event>/<name>/01.jpg .. NN.jpg, cover.jpg (= slide 1), caption.txt     shipped
  _review/<event>/<name>/            shipped, but the event matches the `review_events` setting
                                     (other people in it: the owner approves them)
  _needs-attention/<event>/<name>/   the critic never passed it

Every step is saved as it happens, in the store's "carousels" table (one record per carousel,
keyed by <name>): the candidate list and its sheet once prepared, the plan the moment it arrives,
and each critic round (the plan it judged, the critique, the round). Slides are rendered under
cfg.state_dir / "carousels" / <name> and named by their settings, so a stopped run picks up at
the step it was on, reuses every slide already on the drive, and never redoes a finished carousel.
"""
from __future__ import annotations

import hashlib
import logging
import math
import os
import re
import shutil
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageCms, ImageDraw, ImageFilter

from . import colourmatch, media
from .config import Config
from .judge import Backend, JudgeError, JudgeTask
from .models import Asset, CarouselCritique, CarouselFrame, CarouselPlan, Curation, Metrics, Point, Score
from .store import Store

log = logging.getLogger(__name__)

OUT_W, OUT_H = 1080, 1350          # 4:5, Instagram's tallest feed shape
ASPECT = OUT_W / OUT_H
COVER_ASPECT = 3 / 4               # the profile grid shows the centre 3:4 of the cover
QUALITY = 92
MIN_FRAMES = 5                     # a story carousel: 5-10 slides,
MAX_STORY = 10
MAX_FRAMES = 20                    # a photo dump up to Instagram's 20
MIN_PAIRS, MAX_PAIRS = 2, 4        # a before/after carousel: 2-4 photos, two slides each
MIN_SHARED = 0.7                   # ...each pair showing at least this much of the edit's crop
MAX_FITS = 1                       # blurred-background slides per carousel (per photo, for before/after)
MAX_CANDIDATES = 30                # shown to the story pass (one sheet, 6 x 5)
MAX_PAIR_CANDIDATES = 12           # ...and to the before/after pass (4 x 3 pairs)
ENOUGH_EDITS = 10                  # with this many shipped edits an event's story is edits only
CAMERA_FLOOR = 5.0                 # camera JPEGs (no shipped edit) need this score
VIEW_FLOOR = 5.0                   # 360 shots need this score for a flat view
PLANET_FLOOR = 6.0                 # ...and this for a tiny planet
PLANETS_PER_EVENT = 2
MAX_HASHTAGS = 5
VIEW_HFOV = 75.0                   # flat 360 view: 75 deg wide is about 92 deg tall at 4:5
PLANET_HORIZON = 0.30              # tiny planet: horizon circle radius, as a share of the width
REVISIONS = 2                      # critic revisions before a carousel waits for a human
FIT_DIM = 0.78                     # the fit layout's blurred background, darkened
SHEET_CELL = 300
CONTACT_COLS = 5
STORY, BEFORE_AFTER = "story", "before-after"

TABLE = "carousels"                # one record per carousel: its progress, then the finished result
FINISHED = ("shipped", "review", "needs-attention")
FAILED = "carousel:"               # jobs table: the last error of a carousel (retried next run)
ALIGN_EDGE = 640                   # before/after registration works at about this long edge
ALIGN_MIN_NCC = 0.5                # ...and trusts a match at least this good


@dataclass
class Frame:
    """One picture a carousel can show: an asset seen one way."""
    id: str                        # what the plan names: the asset id, or "<asset id>-planet"
    asset: Asset
    score: Score
    source: str                    # "edit" | "camera" | "sequence" | "360" | "planet" | "before"
    path: Path                     # the picture: edit render, camera JPEG, sequence member, 360 file
    focus: Point                   # centre of the default 4:5 crop, as fractions of the picture
    yaw: float = 0.0               # 360: direction to look
    t: float | None = None         # 360 video: time of the frame
    aspect: float | None = None    # width / height of the picture (after `region`), once opened
    note: str = ""                 # words for the listing
    region: tuple[float, float, float, float] | None = None   # (x0, y0, x1, y1) fractions: cut first
    pair: tuple[Frame, Frame] | None = None   # an edit as a before/after: (camera JPEG, edit), same cut
    ig: Path | None = None         # an edit's own 4:5 Instagram export (the photo stage's "ig" file)

    @property
    def spherical(self) -> bool:
        return self.source in ("360", "planet")

    @property
    def when(self) -> datetime:
        return self.asset.taken_at or self.asset.clock_time or datetime.min


# --- candidates ----------------------------------------------------------------------------------

def _numbers(v) -> list[float]:
    """The edits table keeps tuples as text ('(6350, 6350)'); lists survive as lists."""
    if isinstance(v, (list, tuple)):
        return [float(x) for x in v]
    return [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?", str(v or ""))]


def _edit_geometry(edit: dict) -> tuple[list[float], list[float]] | None:
    frame, crop = _numbers(edit.get("frame")), _numbers(edit.get("crop"))
    if len(frame) != 2 or len(crop) != 4 or min(frame) <= 0 or crop[2] <= 0 or crop[3] <= 0:
        return None
    return frame, crop


def edit_focus(score: Score, edit: dict) -> Point:
    """The score's feed focus (a point of the whole frame) moved into the edit's own crop."""
    geo = _edit_geometry(edit)
    if geo is None:
        return Point(x=0.5, y=0.5)
    (fw, fh), (cx, cy, cw, ch) = geo
    x = (score.feed_focus.x * fw - cx) / cw
    y = (score.feed_focus.y * fh - cy) / ch
    return Point(x=min(max(x, 0.0), 1.0), y=min(max(y, 0.0), 1.0))


Region = tuple[float, float, float, float]


def pair_geometry(edit: dict, jpeg_size: tuple[int, int] | None, focus: Point
                  ) -> tuple[Region, Region, Point] | None:
    """Where a before/after pair is cut so both slides show exactly the same scene: the part of
    the edit's crop that the camera JPEG also shows, as (x0, y0, x1, y1) fractions of the camera
    JPEG and of the edit render, plus the feed focus inside it. The edit's crop is in RAW frame
    pixels; the camera JPEG is the largest centred box of its own shape on that frame (a camera's
    16:9 or 1:1 mode crops the sensor; 3:2 covers all of it). None when the edit has no
    geometry, or the JPEG shows less than MIN_SHARED of the edit's crop."""
    geo = _edit_geometry(edit)
    if geo is None or not jpeg_size or min(jpeg_size) <= 0:
        return None
    (fw, fh), (cx, cy, cw, ch) = geo
    ja = jpeg_size[0] / jpeg_size[1]
    bw, bh = (fw, fw / ja) if ja > fw / fh else (fh * ja, fh)
    bx, by = (fw - bw) / 2, (fh - bh) / 2
    ix0, iy0 = max(cx, bx), max(cy, by)
    ix1, iy1 = min(cx + cw, bx + bw), min(cy + ch, by + bh)
    if ix1 <= ix0 or iy1 <= iy0 or (ix1 - ix0) * (iy1 - iy0) < MIN_SHARED * cw * ch:
        return None
    before = ((ix0 - bx) / bw, (iy0 - by) / bh, (ix1 - bx) / bw, (iy1 - by) / bh)
    after = ((ix0 - cx) / cw, (iy0 - cy) / ch, (ix1 - cx) / cw, (iy1 - cy) / ch)
    px, py = focus.x * fw, focus.y * fh
    inside = Point(x=min(max((px - ix0) / (ix1 - ix0), 0.0), 1.0), y=min(max((py - iy0) / (iy1 - iy0), 0.0), 1.0))
    return before, after, inside


def align_pair(frame: Frame) -> bool:
    """Refine a before/after pair so the before shows exactly what the after shows. The geometry
    (pair_geometry) gets the shape and position right, but a camera's JPEG engine and RawTherapee
    can differ by a few percent of scale (lens correction, sensor margins). This finds the edit on
    the camera JPEG by normalised cross-correlation of band-passed luma (+-6 % scale, any shift) and
    cuts both slides to the scene they share. Returns False (pair unchanged) if no match is
    trusted."""
    before, after = frame.pair
    try:
        jpeg = media._load_still(before.path, ALIGN_EDGE)
    except (media.MediaError, OSError, ValueError):
        return False
    k = ALIGN_EDGE / max(jpeg.size)
    jw, jh = max(16, round(jpeg.width * k)), max(16, round(jpeg.height * k))
    j_s = colourmatch._structure(colourmatch.to_array(jpeg.resize((jw, jh), Image.Resampling.LANCZOS)))
    bx0, by0, bx1, by1 = before.region or (0.0, 0.0, 1.0, 1.0)
    tw, th = max(16, round((bx1 - bx0) * jw)), max(16, round((by1 - by0) * jh))
    try:
        edit = load_picture(after.path, "fit", (tw, th), after.region)
    except (media.MediaError, OSError, ValueError):
        return False
    a_s = colourmatch._structure(colourmatch.to_array(edit.resize((tw, th), Image.Resampling.LANCZOS)))
    best = colourmatch._best_placement(j_s, a_s, np.linspace(0.94, 1.06, 25))
    best = colourmatch._best_placement(j_s, a_s, best[1] * np.linspace(0.9965, 1.0035, 15))
    ncc, scale, x, y = best
    if ncc < ALIGN_MIN_NCC:
        log.info("before/after %s: no trusted match (ncc %.2f); keeping the geometric cut", frame.id, ncc)
        return False
    w, h = tw * scale, th * scale                  # the after's whole picture, in jpeg-work px
    u0, v0 = max(0.0, -x / w), max(0.0, -y / h)    # ...trimmed to what the jpeg also shows
    u1, v1 = min(1.0, (jw - x) / w), min(1.0, (jh - y) / h)
    if (u1 - u0) * (v1 - v0) < MIN_SHARED:
        return False
    before.region = ((x + u0 * w) / jw, (y + v0 * h) / jh, (x + u1 * w) / jw, (y + v1 * h) / jh)
    ax0, ay0, ax1, ay1 = after.region or (0.0, 0.0, 1.0, 1.0)
    after.region = (ax0 + u0 * (ax1 - ax0), ay0 + v0 * (ay1 - ay0), ax0 + u1 * (ax1 - ax0), ay0 + v1 * (ay1 - ay0))
    fx, fy = after.focus.x, after.focus.y          # the focus stays on the same point of the scene
    focus = Point(x=min(max((fx - u0) / (u1 - u0), 0.0), 1.0), y=min(max((fy - v0) / (v1 - v0), 0.0), 1.0))
    before.focus = after.focus = focus
    return True


def _sequence_still(seq: Asset, score: Score, store: Store) -> Path | None:
    """A sequence's sharpest frame in its best stretch (as a reel shows a run that isn't a clip)."""
    members = [store.get("assets", m, Asset) for m in seq.members]
    if not members or any(m is None for m in members):
        return None
    last = len(members) - 1
    start = 0 if score.sequence_from is None else min(max(score.sequence_from, 0), last)
    end = last if score.sequence_to is None else min(max(score.sequence_to, start), last)
    stretch = members[start:end + 1]

    def rank(i: int) -> tuple[float, int]:
        m = store.get("metrics", stretch[i].id, Metrics)
        return (m.sharpness if m else 0.0), -abs(i - len(stretch) // 2)

    best = stretch[max(range(len(stretch)), key=rank)]
    first = best.preview or best.raw
    return Path(first) if first else None


def _still_file(p: str | None) -> Path | None:
    return Path(p) if p and Path(p).suffix.lower() not in media.RAW_EXT and Path(p).exists() else None


def event_frames(items: list[tuple[Asset, Score]], store: Store, dropped: set[str]) -> list[Frame]:
    """Everything one event could show, best first by source and score, at most MAX_CANDIDATES.
    A shipped edit whose camera JPEG shows the same scene also carries the two slides of a
    before/after (`pair`)."""
    edits, others, spheres = [], [], []
    for a, s in items:
        if a.kind == "photo":
            rec = store.get("edits", a.id)
            if rec and rec.get("status") == "shipped" and rec.get("full") and Path(rec["full"]).exists():
                note = f"shipped RAW edit, cropped {rec.get('params', {}).get('aspect', '?')} by the editor"
                ig = Path(rec["ig"]) if rec.get("ig") and Path(rec["ig"]).exists() else None
                edit = Frame(a.id, a, s, "edit", Path(rec["full"]), edit_focus(s, rec), note=note, ig=ig)
                cam = _still_file(a.preview)
                geo = None if cam is None else pair_geometry(rec, _upright_size(cam), s.feed_focus)
                if geo is not None:            # both slides of a before/after cut to the same scene
                    edit.pair = (Frame(a.id, a, s, "before", cam, geo[2], region=geo[0], note="camera JPEG"),
                                 Frame(a.id, a, s, "edit", edit.path, geo[2], region=geo[1], note=note))
                edits.append(edit)
                continue
            if (rec and rec.get("status") == "rejected") or a.id in dropped or s.score < CAMERA_FLOOR:
                continue
            if (p := _still_file(a.preview)) is not None:
                others.append(Frame(a.id, a, s, "camera", p, s.feed_focus, note="camera JPEG"))
        elif a.kind == "sequence" and s.score >= CAMERA_FLOOR:
            if (p := _sequence_still(a, s, store)) is not None and p.exists():
                others.append(Frame(a.id, a, s, "sequence", p, s.feed_focus,
                                    note=f"sharpest frame of a {len(a.members)}-photo sequence"))
        elif a.kind in ("photo360", "video360") and s.score >= VIEW_FLOOR and a.preview and Path(a.preview).exists():
            t = None
            if a.kind == "video360":
                lo = s.best_in_s or 0.0
                t = (lo + s.best_out_s) / 2 if s.best_out_s and s.best_out_s > lo else lo
            yaw = float(s.view_yaw_deg or 0.0)
            spheres.append(Frame(a.id, a, s, "360", Path(a.preview), Point(x=0.5, y=0.5), yaw, t, ASPECT,
                                 note="flat view out of a 360 " + ("photo" if t is None else f"clip at {t:.1f}s")))
    edits.sort(key=lambda f: -f.score.score)
    picks = edits[:MAX_CANDIDATES]
    if len(edits) < ENOUGH_EDITS:
        rest = sorted(others + spheres, key=lambda f: -f.score.score)
        picks += rest[:MAX_CANDIDATES - len(picks)]
    else:
        picks += sorted(spheres, key=lambda f: -f.score.score)[:max(0, MAX_CANDIDATES - len(picks))]
    planets = [Frame(f"{f.id}-planet", f.asset, f.score, "planet", f.path, f.focus, f.yaw, None, ASPECT,
                     note="tiny planet (stereographic) of the same 360 photo, its look direction at the top")
               for f in sorted((f for f in picks if f.source == "360" and f.t is None
                                and f.score.score >= PLANET_FLOOR), key=lambda f: -f.score.score)]
    room = MAX_CANDIDATES - len(picks)
    picks += planets[:min(PLANETS_PER_EVENT, room)]
    if room <= 0 and planets:       # a full sheet still gets the best planet, in place of the weakest
        weakest = min((f for f in picks if f.source in ("camera", "sequence")),
                      key=lambda f: f.score.score, default=None)
        if weakest is not None:
            picks.remove(weakest)
            picks.append(planets[0])
    return picks


def pair_frames(frames: list[Frame]) -> list[Frame]:
    """The edits that can be shown as before/after, best first."""
    return sorted((f for f in frames if f.pair is not None), key=lambda f: -f.score.score)[:MAX_PAIR_CANDIDATES]


def candidates(store: Store, assets: list[Asset], cfg: Config | None = None) -> dict[str, list[Frame]]:
    """Per event (thin consecutive days of one trip merged, as for reels), its carousel candidates.
    Events with material for neither kind of carousel are left out."""
    from .reels import merge_trips
    by_event: dict[str, list[tuple[Asset, Score]]] = defaultdict(list)
    for a in assets:
        if not a.event_key or a.kind not in ("photo", "photo360", "video360", "sequence"):
            continue
        s = store.get("scores", a.id, Score)
        if s and s.keep and s.role != "skip":
            by_event[a.event_key].append((a, s))
    dropped: set[str] = set()
    for _, c in store.all("curation", Curation):
        dropped |= set(c.drop)
    out = {}
    for key, items in merge_trips(by_event).items():
        frames = event_frames(items, store, dropped)
        if len(frames) >= MIN_FRAMES or len(pair_frames(frames)) >= MIN_PAIRS:
            out[key] = frames
    return out


def review_patterns(cfg: Config) -> list[str]:
    v = cfg.extra.get("review_events", [])
    return [v] if isinstance(v, str) else [str(x) for x in v or []]


def needs_review(key: str, cfg: Config) -> bool:
    """Events that feature other people (a wedding...) wait for the owner's approval."""
    return any(p and p.lower() in key.lower() for p in review_patterns(cfg))


def about(frames: list[Frame], cfg: Config) -> str:
    """Where and when, for a keyword-rich first caption line: the place labels with what the
    settings know of them (city, region, country), the event's name and its dates."""
    places = []
    for loc in sorted({f.asset.location for f in frames if f.asset.location}):
        info = cfg.places.get(loc) or {}
        parts = [loc.replace("-", " ")] + [str(info[k]) for k in ("city", "state", "country") if info.get(k)]
        places.append(", ".join(dict.fromkeys(parts)))
    events = sorted({f.asset.event.replace("-", " ") for f in frames if f.asset.event})
    days = sorted({(f.asset.taken_at - timedelta(hours=5)).date() for f in frames if f.asset.taken_at})
    if not days:
        when = "date unknown"
    elif days[0] == days[-1]:
        when = f"{days[0].day} {days[0]:%B %Y}"
    else:
        when = f"{days[0].day} {days[0]:%B} to {days[-1].day} {days[-1]:%B %Y}"
    return (f"Where: {'; '.join(places) or 'unknown'}. What: {', '.join(events) or 'not named'}. When: {when}. "
            "Use only what the pictures and these facts support.")


# --- pictures --------------------------------------------------------------------------------------

@lru_cache(maxsize=1)
def _srgb_icc() -> bytes:
    return ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()


def _upright_size(path: Path) -> tuple[int, int] | None:
    try:
        with Image.open(path) as im:
            w, h = im.size
            if im.getexif().get(0x0112, 1) in (5, 6, 7, 8):
                w, h = h, w
            return w, h
    except (OSError, ValueError):
        return None


def load_picture(path: Path, layout: str = "fill", out: tuple[int, int] = (OUT_W, OUT_H),
                 region: tuple[float, float, float, float] | None = None) -> Image.Image:
    """A still, upright and sRGB, cut to `region` (fractions), decoded just big enough for one
    slide in `layout`."""
    rx0, ry0, rx1, ry1 = region or (0.0, 0.0, 1.0, 1.0)
    need = 4096                       # size unknown (a RAW's embedded preview ignores it anyway)
    size = _upright_size(path) if path.suffix.lower() not in media.RAW_EXT else None
    if size:
        w, h = size[0] * (rx1 - rx0), size[1] * (ry1 - ry0)
        if layout == "fit":
            s = min(out[0] / w, out[1] / h)
        else:
            s = out[1] / h if w / h >= out[0] / out[1] else out[0] / w
        need = min(max(size), math.ceil(max(size) * s * 1.05))
    img = media._load_still(path, need).convert("RGB")
    if region:
        img = img.crop((round(rx0 * img.width), round(ry0 * img.height),
                        round(rx1 * img.width), round(ry1 * img.height)))
    return img


def crop_box(w: int, h: int, focus: Point | tuple[float, float], aspect: float = ASPECT
             ) -> tuple[float, float, float, float]:
    """The largest box of `aspect` inside w x h, centred on focus and shifted (never shrunk) to fit."""
    fx, fy = (focus.x, focus.y) if isinstance(focus, Point) else focus
    if w / h > aspect:
        bw, bh = h * aspect, float(h)
    else:
        bw, bh = float(w), w / aspect
    x = min(max(fx * w - bw / 2, 0.0), w - bw)
    y = min(max(fy * h - bh / 2, 0.0), h - bh)
    return x, y, bw, bh


def _sharpen(img: Image.Image) -> Image.Image:
    return img.filter(ImageFilter.UnsharpMask(radius=0.8, percent=40, threshold=2))


def fill(img: Image.Image, focus: Point, out: tuple[int, int] = (OUT_W, OUT_H)) -> Image.Image:
    x, y, bw, bh = crop_box(img.width, img.height, focus, out[0] / out[1])
    return _sharpen(img.resize(out, Image.Resampling.LANCZOS, box=(x, y, x + bw, y + bh), reducing_gap=3.0))


def fit(img: Image.Image, out: tuple[int, int] = (OUT_W, OUT_H)) -> Image.Image:
    """The whole picture at full width (or full height, if taller than the slide) over a blurred,
    darkened copy of itself filling the slide."""
    ow, oh = out
    x, y, bw, bh = crop_box(img.width, img.height, (0.5, 0.5), ow / oh)
    small = (max(1, ow // 8), max(1, oh // 8))
    bg = img.resize(small, Image.Resampling.BILINEAR, box=(x, y, x + bw, y + bh), reducing_gap=2.0)
    bg = bg.filter(ImageFilter.GaussianBlur(4)).resize(out, Image.Resampling.BICUBIC)
    bg = bg.point(lambda v: round(v * FIT_DIM))
    s = min(ow / img.width, oh / img.height)
    fw, fh = min(ow, round(img.width * s)), min(oh, round(img.height * s))
    fg = _sharpen(img.resize((fw, fh), Image.Resampling.LANCZOS, reducing_gap=3.0))
    bg.paste(fg, ((ow - fw) // 2, (oh - fh) // 2))
    return bg


def planet_rays(w: int, h: int, yaw_deg: float, horizon_px: float) -> np.ndarray:
    """World rays (x right, y up, z forward; media's frame) of a stereographic 'tiny planet': the
    nadir in the middle, the horizon a circle of horizon_px, the sky outside it, and yaw_deg
    straight up from the centre (turning right goes clockwise, so nothing is mirrored)."""
    f = horizon_px / 2.0                              # r = 2 f tan(theta / 2); theta from the nadir
    xs = np.arange(w, dtype=np.float32) + 0.5 - w / 2
    ys = h / 2 - (np.arange(h, dtype=np.float32) + 0.5)
    dx, dy = np.meshgrid(xs, ys)
    theta = 2.0 * np.arctan(np.hypot(dx, dy) / (2.0 * f))
    yaw = math.radians(yaw_deg) + (math.pi / 2 - np.arctan2(dy, dx))
    s = np.sin(theta)
    return np.stack([s * np.sin(yaw), -np.cos(theta), s * np.cos(yaw)], -1).astype(np.float32)


def tiny_planet(path: str | Path, yaw_deg: float, cfg: Config, out: tuple[int, int] = (OUT_W, OUT_H),
                t: float | None = None) -> Image.Image:
    """A tiny planet of an X5 360 photo (or clip frame), straight from its two fisheyes."""
    w, h = out
    horizon = PLANET_HORIZON * w
    # the horizon ring is the most detailed part that matters: sample the lenses that finely
    dual, fov = media._load_dual(Path(path), cfg, max(4.0, 2 * math.pi * horizon / 360.0 * 2), t)
    return Image.fromarray(media._render(dual, planet_rays(w, h, yaw_deg, horizon), fov, seamless=False))


def render_slide(frame: Frame, slide: CarouselFrame, cfg: Config, out: tuple[int, int] = (OUT_W, OUT_H)
                 ) -> Image.Image:
    """One 4:5 slide as it will be posted."""
    if frame.source == "planet":
        yaw = frame.yaw if slide.view_yaw_deg is None else slide.view_yaw_deg
        return _sharpen(tiny_planet(frame.path, yaw, cfg, out, frame.t))
    if frame.source == "360":
        yaw = frame.yaw if slide.view_yaw_deg is None else slide.view_yaw_deg
        return _sharpen(media.reframe_360_image(frame.path, yaw, 0.0, VIEW_HFOV, out[0], out[1], cfg, t=frame.t))
    if (frame.ig is not None and frame.region is None and slide.layout == "fill" and slide.focus is None
            and out == (OUT_W, OUT_H) and _upright_size(frame.ig) == out):
        # a 4:5 edit at its own framing: the photo stage's Instagram export, exactly as the feed has it
        with Image.open(frame.ig) as im:
            return media._to_srgb(im).convert("RGB")
    img = load_picture(frame.path, slide.layout, out, frame.region)
    if slide.layout == "fit":
        return fit(img, out)
    return fill(img, slide.focus or frame.focus, out)


def save_jpeg(img: Image.Image, dest: Path) -> Path:
    """sRGB JPEG q92 (4:4:4, profile embedded, no camera metadata), written atomically."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(f".{dest.name}.tmp")
    img.convert("RGB").save(tmp, "JPEG", quality=QUALITY, subsampling=0, optimize=True, icc_profile=_srgb_icc())
    os.replace(tmp, dest)
    return dest


# --- sheets ----------------------------------------------------------------------------------------

def thumbnail(frame: Frame, cfg: Config, size: int = SHEET_CELL) -> Image.Image:
    """What the story pass sees of a candidate. A still that isn't 4:5 is shown whole with its
    default 4:5 crop bright and the rest dimmed; 360 views and planets as they would be posted.
    Sets frame.aspect."""
    if frame.spherical:
        h = size
        w = round(h * ASPECT)
        w -= w % 2
        return render_slide(frame, CarouselFrame(frame_id=frame.id), cfg, (w, h))
    img = media._load_still(frame.path, size * 2).convert("RGB")
    if frame.region:
        x0, y0, x1, y1 = frame.region
        img = img.crop((round(x0 * img.width), round(y0 * img.height), round(x1 * img.width), round(y1 * img.height)))
    frame.aspect = img.width / img.height
    img.thumbnail((size, size), Image.Resampling.LANCZOS)
    if abs(frame.aspect - ASPECT) / ASPECT > 0.02:
        x, y, bw, bh = crop_box(img.width, img.height, frame.focus)
        dim = img.point(lambda v: round(v * 0.45))
        dim.paste(img.crop((round(x), round(y), round(x + bw), round(y + bh))), (round(x), round(y)))
        ImageDraw.Draw(dim).rectangle((round(x), round(y), round(x + bw) - 1, round(y + bh) - 1),
                                      outline=(255, 255, 255), width=2)
        img = dim
    return img


def pair_thumbnail(frame: Frame, cfg: Config, h: int = SHEET_CELL) -> Image.Image:
    """A before/after candidate as it would be posted: its two 4:5 slides side by side."""
    w = round(h * ASPECT)
    slide = CarouselFrame(frame_id=frame.id, layout=default_layout(frame.pair[1]))
    out = Image.new("RGB", (2 * w + 6, h), (24, 24, 24))
    before, after = frame.pair
    out.paste(render_slide(before, slide, cfg, (w, h)), (0, 0))
    out.paste(render_slide(after, slide, cfg, (w, h)), (w + 6, 0))
    return out


def grid(tiles: list[Image.Image], labels: list[str], cols: int, cell: tuple[int, int],
         label_px: int = 18) -> Image.Image:
    rows = math.ceil(len(tiles) / cols)
    cw, ch = cell
    out = Image.new("RGB", (cols * cw, rows * ch), (24, 24, 24))
    for i, (im, label) in enumerate(zip(tiles, labels)):
        im = im.copy()
        im.thumbnail((cw - 4, ch - 4), Image.Resampling.LANCZOS)
        x, y = (i % cols) * cw, (i // cols) * ch
        out.paste(im, (x + (cw - im.width) // 2, y + (ch - im.height) // 2))
        media._label(out, label, (x + 6, y + 6), px=label_px)
    return out


def candidate_sheet(thumbs: list[Image.Image], kind: str = STORY) -> Image.Image:
    labels = [f"#{i}" for i in range(len(thumbs))]
    if kind == BEFORE_AFTER:
        return grid(thumbs, labels, 4, (2 * round(SHEET_CELL * ASPECT) + 20, SHEET_CELL + 8), label_px=20)
    return grid(thumbs, labels, 6, (SHEET_CELL, SHEET_CELL), label_px=20)


def carousel_sheet(slides: list[Path], labels: list[str]) -> Image.Image:
    """The whole carousel in swipe order, five slides a row, each labelled."""
    cw, ch = OUT_W // CONTACT_COLS, OUT_H // CONTACT_COLS
    tiles = []
    for p in slides:
        with Image.open(p) as im:
            tiles.append(im.convert("RGB").resize((cw - 4, ch - 4), Image.Resampling.LANCZOS))
    return grid(tiles, labels, CONTACT_COLS, (cw, ch), label_px=13)


def cover_check(slide1: Path) -> Image.Image:
    """Slide 1 with what the profile grid's centre 3:4 leaves out dimmed, for the critic."""
    with Image.open(slide1) as im:
        img = im.convert("RGB")
    keep = round(img.height * COVER_ASPECT)
    x0 = (img.width - keep) // 2
    out = img.point(lambda v: round(v * 0.35))
    out.paste(img.crop((x0, 0, x0 + keep, img.height)), (x0, 0))
    ImageDraw.Draw(out).rectangle((x0, 0, x0 + keep - 1, img.height - 1), outline=(255, 255, 255), width=2)
    return out


def _shape(f: Frame) -> str:
    if f.spherical or f.aspect is None:
        return ""
    r = f.aspect
    named = min(((3 / 2, "3:2"), (16 / 9, "16:9"), (1.91, "1.91:1"), (4 / 3, "4:3"), (1, "1:1"), (2 / 3, "2:3"),
                 (4 / 5, "4:5"), (3 / 4, "3:4"), (9 / 16, "9:16"), (2, "2:1"), (3, "3:1")),
                key=lambda x: abs(x[0] - r))[1]
    kind = "landscape" if r > 1.05 else "portrait" if r < 0.95 else "square"
    if abs(r - ASPECT) / ASPECT <= 0.02:
        return f", {kind} {named} (already 4:5)"
    keeps = f"{ASPECT / r:.0%} of the width" if r > ASPECT else f"{r / ASPECT:.0%} of the height"
    return f", {kind} {named} (a 4:5 crop keeps {keeps})"


def listing(frames: list[Frame]) -> str:
    lines = []
    for i, f in enumerate(frames):
        s = f.score
        when = f.asset.taken_at.strftime("%H:%M") if f.asset.taken_at else "time unknown"
        where = (f", look yaw {f.yaw:+.0f}" if f.spherical
                 else f", crop focus ({f.focus.x:.2f},{f.focus.y:.2f})")
        lines.append(f"#{i} id={f.id} {f.note}, {when}, score {s.score:.1f}, role {s.role}, {s.subject}"
                     f"{_shape(f)}{where}")
    return "\n".join(lines)


# --- Claude ----------------------------------------------------------------------------------------

CAPTION_RULES = (
    "Caption, by the style guide: the first line is specific and keyword-rich - the place, what it is and "
    "when (Instagram search reads captions); then one or two lines of story or a useful tip; then 3-5 "
    "relevant hashtags on the last line (specific to the subject, the place, the kind of photography or the "
    "camera; nothing broad or unrelated). No emoji strings, no names of people.")

FILL_RULES = (
    "Every slide fills the 4:5 frame: layout 'fill' crops around focus (null keeps the marked crop; set focus, "
    "as fractions of the whole picture, to move it). At most one slide in the carousel may use 'fit' - the "
    "whole picture at full width over a blurred copy of itself - and only for a frame worth keeping whose "
    "subject or composition a 4:5 crop would cut (a skyline, a building, a group, a landscape that needs its "
    "width); otherwise leave such a frame out.")


def story_task(name: str, key: str, frames: list[Frame], sheet_path: Path, context: str,
               options: str | None = None) -> JudgeTask:
    return JudgeTask(
        key=name, output=CarouselPlan, images=[sheet_path], effort="high", max_tokens=16000,
        instructions=(
            f"Build one Instagram carousel for the event '{key}': a swipeable post, every slide 4:5 portrait "
            f"(1080x1350). {context}\n"
            "The image shows the candidates, each labelled #n. A photo that isn't 4:5 is shown whole, with its "
            "default 4:5 crop (around its scored focus) bright and the rest dimmed; 360 views and tiny planets are "
            "shown as they would be posted.\n"
            f"Candidates, in the order they were shot:\n{options or listing(frames)}\n\n"
            "How to build it:\n"
            f"- style 'story': {MIN_FRAMES}-{MAX_STORY} slides that tell the event. Use 'photo-dump' (up to "
            f"{MAX_FRAMES} slides, looser) only when the event has that many strong, varied frames. Fewer strong "
            "slides beat padding: every slide must hold up on its own.\n"
            "- Slide 1 opens a loop: a striking frame that gives a reason to swipe (a question the next slides "
            "answer, a reveal still to come). It is also the cover on the profile grid, which shows only its "
            "centre 3:4: keep its subject inside that.\n"
            "- The last slide closes the loop: the best frame or a strong detail.\n"
            "- In between, tell the event: place, moments, details. Vary scale (wide, medium, detail). Never use "
            "two near-identical frames: keep the better one.\n"
            "- The set must read as one in colour: leave out a frame whose white balance or grade fights the rest.\n"
            "- Shipped RAW edits are finished; prefer one to a camera JPEG of a similar frame. A tiny planet is a "
            "surprise: at most one, and not slide 1 unless it is the best frame.\n"
            f"- {FILL_RULES} 360 views and tiny planets stay 'fill' with focus null; their view_yaw_deg may turn "
            "the view (null keeps the listed direction).\n"
            f"- {CAPTION_RULES}\n"
            "Use the candidate ids exactly."))


def pairs_task(name: str, key: str, frames: list[Frame], sheet_path: Path, context: str,
               options: str | None = None) -> JudgeTask:
    return JudgeTask(
        key=name, output=CarouselPlan, images=[sheet_path], effort="high", max_tokens=16000,
        instructions=(
            f"Build one before/after Instagram carousel for the event '{key}'. {context}\n"
            f"It shows {MIN_PAIRS}-{MAX_PAIRS} photos, each as two consecutive 4:5 slides: first the camera's own "
            "JPEG, then the finished RAW edit, framed identically, so every second swipe reveals an edit. The "
            "image shows each candidate as it would be posted, the camera JPEG on the left and the edit on the "
            "right, labelled #n.\n"
            f"Candidates, in the order they were shot:\n{options or listing(frames)}\n\n"
            "How to build it (style 'before-after'; list each photo once, by candidate id; the before and after "
            "slides follow from it):\n"
            f"- Pick the {MIN_PAIRS}-{MAX_PAIRS} photos where the edit makes the clearest, most convincing "
            "difference (light shaped, colour corrected, shadows or sky recovered) and the after is a strong "
            "picture. No two of nearly the same picture.\n"
            "- The first 'before' opens the loop: a frame that already intrigues and pays off on the first swipe. "
            "It is also the profile-grid cover (its centre 3:4). End on the most striking after.\n"
            f"- {FILL_RULES} A 'fit' photo shows both its slides that way; null focus keeps the edit's framing.\n"
            f"- {CAPTION_RULES} Say it is a before/after of the RAW edit, and make the story line a tip about "
            "what the edit did."))


CHECKS = {
    STORY: ("hook_ok (slide 1 is striking and gives a reason to swipe), cover_ok (image 1: its subject sits "
            "inside the bright centre 3:4 the profile grid shows), scale_varied (wide, medium and detail frames), "
            "no_near_duplicates (no two slides show nearly the same picture), colour_consistent (white balance, "
            "contrast and grade read as one set), crops_ok (every slide fills the frame, keeps its subject whole "
            "and is sharp and well exposed; at most one blurred-background slide), closer_ok (the last slide is "
            "the best frame or a strong detail), caption_ok"),
    BEFORE_AFTER: (
        "hook_ok (the first before already intrigues and its after pays off), cover_ok (image 1: its subject "
        "sits inside the bright centre 3:4 the profile grid shows), scale_varied (the photos differ in subject "
        "or scale), no_near_duplicates (no two photos of nearly the same picture), colour_consistent (the "
        "afters read as one set), crops_ok (each before is framed exactly like its after, every slide fills the "
        "frame and keeps its subject whole; at most one photo shown over a blurred background), closer_ok (the "
        "last after is the most striking), caption_ok (also says it is a before/after)"),
}


def critic_task(name: str, kind: str, plan: CarouselPlan, cover: Path, contact: Path, sheet_path: Path,
                options: str, earlier: list[str] | None = None) -> JudgeTask:
    memory = ""
    if earlier:
        memory = ("Earlier critiques of this carousel (each led to the revision you are looking at):\n"
                  + "\n".join(f"- round {i + 1}: {n}" for i, n in enumerate(earlier)) + "\n"
                  "Stay consistent with them: don't reverse an earlier call (such as which frame should open) "
                  "unless these slides show something new, and don't re-raise problems that are now fixed.\n\n")
    what = ("before/after carousel (each photo is two slides: camera JPEG, then RAW edit)" if kind == BEFORE_AFTER
            else "carousel")
    limits = (f"{MIN_PAIRS}-{MAX_PAIRS} photos, style 'before-after'" if kind == BEFORE_AFTER
              else f"{MIN_FRAMES}-{MAX_STORY} slides as a story, up to {MAX_FRAMES} as a photo-dump")
    return JudgeTask(
        key=name, output=CarouselCritique, images=[cover, contact, sheet_path], effort="high", max_tokens=16000,
        instructions=(
            f"You did not make this {what}. Judge it as a strict outside editor would before it goes on the "
            "account. Image 1 is slide 1 as posted, with what the profile grid crops off its sides dimmed; image 2 "
            "is the whole carousel in swipe order, slides labelled with their number and frame id; image 3 shows "
            "every candidate it could have used, labelled #n.\n"
            f"The plan that made it: {plan.model_dump_json()}\n"
            f"Candidates:\n{options}\n\n" + memory +
            f"Fill in every check: {CHECKS[kind]}. For caption_ok: {CAPTION_RULES} Judge against the best these "
            "candidates allow, not against an ideal they don't contain. verdict 'ship' only if every check passes. "
            f"Otherwise 'revise' with a complete revised plan ({limits}; candidate ids only): swap a weak or "
            "odd-one-out frame, drop a near-duplicate, move a crop's focus, reorder for the opening and the close, "
            "rewrite the caption."))


# --- plans -----------------------------------------------------------------------------------------

HASHTAG = re.compile(r"#\w+")


def tidy_caption(text: str, max_tags: int = MAX_HASHTAGS) -> str:
    """Trim; more than max_tags hashtags (or repeats) are cut to the first max_tags, on the last line."""
    text = text.strip()
    tags = HASHTAG.findall(text)
    if len(tags) <= max_tags and len({t.lower() for t in tags}) == len(tags):
        return text
    keep: list[str] = []
    for t in tags:
        if t.lower() not in {k.lower() for k in keep} and len(keep) < max_tags:
            keep.append(t)
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in HASHTAG.sub("", text).splitlines()]
    body = re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()
    return f"{body}\n\n{' '.join(keep)}" if body else " ".join(keep)


def default_layout(f: Frame) -> str:
    """For slides the plan didn't lay out itself: fit when a crop would keep under half the width."""
    return "fit" if not f.spherical and f.aspect and f.aspect > 1.6 else "fill"


def snap(plan: CarouselPlan, frames: list[Frame], key: str, kind: str = STORY) -> CarouselPlan:
    """Hold Claude's plan to the hard rules: known ids, each once; 360 slides as rendered; at most
    MAX_FITS blurred-background slides (later ones are left out rather than cropped); the slide
    count of its style (the closer stays last; a short plan gets the best unused frames before it)."""
    if kind == BEFORE_AFTER:
        pool, style, lo, hi = pair_frames(frames), BEFORE_AFTER, MIN_PAIRS, MAX_PAIRS
    else:
        style = plan.style if plan.style in (STORY, "photo-dump") else STORY
        pool, lo, hi = frames, MIN_FRAMES, MAX_STORY if style == STORY else MAX_FRAMES
    by_id = {f.id: f for f in pool}
    seen: set[str] = set()
    fits = 0
    slides: list[CarouselFrame] = []
    for s in plan.frames:
        f = by_id.get(s.frame_id)
        if f is None or s.frame_id in seen:
            continue
        if f.spherical:
            s = s.model_copy(update={"layout": "fill", "focus": None})
        else:
            s = s.model_copy(update={"view_yaw_deg": None})
        if s.layout == "fit":
            if fits >= MAX_FITS:
                log.info("carousel %s: leaving out %s, a second blurred-background slide", key, s.frame_id)
                continue
            fits += 1
        seen.add(s.frame_id)
        slides.append(s)
    if len(slides) > hi:
        slides = slides[:hi - 1] + slides[-1:]
    if len(slides) < lo:
        extra = []
        for f in sorted(pool, key=lambda f: -f.score.score):
            if len(slides) + len(extra) >= lo:
                break
            layout = default_layout(f.pair[1] if kind == BEFORE_AFTER else f)
            if f.id in seen or (layout == "fit" and fits >= MAX_FITS):
                continue
            fits += layout == "fit"
            extra.append(CarouselFrame(frame_id=f.id, layout=layout))
        if extra:
            log.warning("carousel %s: plan had %d usable slides; added %s", key, len(slides),
                        ", ".join(e.frame_id for e in extra))
        # the closer stays last; a lone surviving slide is the opener
        slides = slides[:-1] + extra + slides[-1:] if len(slides) >= 2 else slides + extra
    if len(slides) < lo:
        raise JudgeError(f"carousel {key}: only {len(slides)} usable {'photos' if kind == BEFORE_AFTER else 'slides'}")
    return plan.model_copy(update={"event_key": key, "style": style, "frames": slides,
                                   "caption": tidy_caption(plan.caption)})


def slides_of(plan: CarouselPlan, by_id: dict[str, Frame], kind: str) -> list[tuple[Frame, CarouselFrame]]:
    """The slides in swipe order: one per plan frame, or before then after for a before/after."""
    out = []
    for s in plan.frames:
        f = by_id[s.frame_id]
        out.extend([(f.pair[0], s), (f.pair[1], s)] if kind == BEFORE_AFTER else [(f, s)])
    return out


# --- build -----------------------------------------------------------------------------------------

@dataclass
class Job:
    """One carousel to make: its name, event, kind and the frames it may use (in sheet order
    once prepared)."""
    name: str
    key: str
    kind: str
    pool: list[Frame]
    sheet: Path | None = None


def work_dir(cfg: Config, name: str) -> Path:
    return cfg.state_dir / "carousels" / name


def _slide_key(f: Frame, s: CarouselFrame) -> tuple:
    return (f.source, f.region, s.frame_id, s.layout,
            None if s.focus is None else (round(s.focus.x, 3), round(s.focus.y, 3)),
            None if s.view_yaw_deg is None else round(s.view_yaw_deg, 1))


def slide_path(cfg: Config, name: str, f: Frame, s: CarouselFrame) -> Path:
    """Where a slide is rendered: named by everything that decides its pixels, so a slide already
    on the drive is reused by a later round or a resumed run."""
    digest = hashlib.sha1(repr(_slide_key(f, s)).encode()).hexdigest()[:10]
    return work_dir(cfg, name) / "slides" / f"{f.source}_{s.frame_id}_{digest}.jpg"


def _destinations(cfg: Config, name: str) -> dict[str, Path]:
    root, event = cfg.output_dir / "carousels", name.split("__")[0]
    return {"shipped": root / event / name, "review": root / "_review" / event / name,
            "needs-attention": root / "_needs-attention" / event / name}


def publish(slides: list[Path], caption: str, dest: Path, stale: list[Path] = ()) -> None:
    """01.jpg..NN.jpg, cover.jpg and caption.txt, moved into place in one step."""
    tmp = dest.parent / f".{dest.name}.tmp"
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True)
    for i, p in enumerate(slides, 1):
        shutil.copyfile(p, tmp / f"{i:02d}.jpg")
    shutil.copyfile(slides[0], tmp / "cover.jpg")
    (tmp / "caption.txt").write_text(caption.strip() + "\n")
    for old in [dest, *stale]:          # an earlier, unrecorded attempt at this carousel
        if old.exists():
            shutil.rmtree(old)
    os.replace(tmp, dest)


def _saved_candidate(f: Frame, kind: str) -> dict:
    if kind != BEFORE_AFTER:
        return {"id": f.id, "aspect": f.aspect}
    before, after = f.pair
    return {"id": f.id, "aspect": after.aspect, "before_region": before.region, "after_region": after.region,
            "focus": [after.focus.x, after.focus.y]}


def _restore(f: Frame, saved: dict, kind: str) -> Frame:
    if kind != BEFORE_AFTER:
        f.aspect = saved.get("aspect")
        return f
    before, after = f.pair
    after.aspect = saved.get("aspect")
    before.region = tuple(saved["before_region"]) if saved.get("before_region") else None
    after.region = tuple(saved["after_region"]) if saved.get("after_region") else None
    before.focus = after.focus = Point(x=saved["focus"][0], y=saved["focus"][1])
    return f


def prepare(job: Job, cfg: Config, store: Store) -> Job:
    """The candidate sheet the selection pass sees (and, for a before/after, each pair registered
    so its two slides line up). Saved in the carousel's record; a resumed run reuses it."""
    rec = store.get(TABLE, job.name) or {}
    saved, sheet = rec.get("candidates"), Path(rec["sheet"]) if rec.get("sheet") else None
    by_id = {f.id: f for f in job.pool}
    if saved and sheet is not None and sheet.exists() and all(c["id"] in by_id for c in saved):
        job.pool = [_restore(by_id[c["id"]], c, job.kind) for c in saved]
        job.sheet = sheet
        return job

    def thumb(f: Frame):
        try:
            if job.kind == BEFORE_AFTER:
                align_pair(f)
                thumbnail(f.pair[1], cfg, size=64)     # the shared cut's shape: the pair's default layout
                return pair_thumbnail(f, cfg)
            return thumbnail(f, cfg)
        except (media.MediaError, OSError, ValueError) as e:
            log.warning("carousel %s: dropping %s: %s", job.name, f.id, e)
            return None

    with ThreadPoolExecutor(4) as ex:
        thumbs = list(ex.map(thumb, job.pool))
    pool = [f for f, t in zip(job.pool, thumbs) if t is not None]
    thumbs = [t for t in thumbs if t is not None]
    if len(pool) < (MIN_PAIRS if job.kind == BEFORE_AFTER else MIN_FRAMES):
        raise media.MediaError(f"carousel {job.name}: only {len(pool)} readable candidates")
    order = sorted(range(len(pool)), key=lambda i: (pool[i].when, pool[i].id))
    job.pool = [pool[i] for i in order]
    job.sheet = work_dir(cfg, job.name) / "candidates.jpg"
    job.sheet.parent.mkdir(parents=True, exist_ok=True)
    candidate_sheet([thumbs[i] for i in order], job.kind).save(job.sheet, quality=88)
    store.put(TABLE, job.name, {**rec, "status": rec.get("status", "prepared"), "kind": job.kind,
                                "event_key": job.key, "sheet": str(job.sheet),
                                "candidates": [_saved_candidate(f, job.kind) for f in job.pool]})
    return job


def options(job: Job) -> str:
    """The candidate listing, as the selection pass and the critic read it."""
    return listing([f.pair[1] for f in job.pool] if job.kind == BEFORE_AFTER else job.pool)


def plan_task(job: Job, cfg: Config) -> JudgeTask:
    ask = pairs_task if job.kind == BEFORE_AFTER else story_task
    return ask(job.name, job.key, job.pool, job.sheet, about(job.pool, cfg), options(job))


def finish(job: Job, cfg: Config, store: Store, judge: Backend) -> dict:
    """Critic rounds from where the record left off (each saved as it ends), then publish.
    Returns the finished record (also saved)."""
    t0 = time.monotonic()
    rec = store.get(TABLE, job.name)
    # held to the current frames again: a frame that has gone since the plan was saved is dropped
    plan = snap(CarouselPlan.model_validate(rec["plan"]), job.pool, job.key, job.kind)
    history: list[dict] = list(rec.get("history") or [])
    shipped, decided = bool(rec.get("shipped")), bool(rec.get("decided"))
    by_id = {f.id: f for f in job.pool}
    work = work_dir(cfg, job.name)
    listed = options(job)

    def slide_file(item: tuple[Frame, CarouselFrame]) -> Path:
        f, s = item
        dest = slide_path(cfg, job.name, f, s)
        if not (dest.exists() and dest.stat().st_size > 0):
            save_jpeg(render_slide(f, s, cfg), dest)
        return dest

    def render(p: CarouselPlan) -> tuple[list[Path], list[tuple[Frame, CarouselFrame]]]:
        items = slides_of(p, by_id, job.kind)
        with ThreadPoolExecutor(4) as ex:      # slides already on the drive are reused
            return list(ex.map(slide_file, items)), items

    while not decided:
        round_ = len(history)
        slides, items = render(plan)
        labels = [f"{i + 1:02d} {f.source + ' ' if job.kind == BEFORE_AFTER else ''}{s.frame_id}"
                  for i, (f, s) in enumerate(items)]
        contact, cover = work / f"contact-{round_}.jpg", work / f"cover-{round_}.jpg"
        carousel_sheet(slides, labels).save(contact, quality=88)
        cover_check(slides[0]).save(cover, quality=88)
        verdict = judge.judge(critic_task(job.name, job.kind, plan, cover, contact, job.sheet, listed,
                                          [h["critique"]["notes"] for h in history]))
        history.append({"round": round_ + 1, "plan": plan.model_dump(),
                        "critique": verdict.model_dump(exclude={"revised"}),
                        "revised": verdict.revised.model_dump() if verdict.revised else None})
        if verdict.verdict == "ship" and verdict.passes:
            shipped = decided = True
        elif not verdict.revised or round_ >= REVISIONS:
            decided = True
        else:
            try:
                plan = snap(verdict.revised, job.pool, job.key, job.kind)
            except JudgeError as e:
                log.warning("carousel %s: unusable revision: %s", job.name, e)
                decided = True
        rec = {**rec, "status": "planned", "plan": plan.model_dump(), "round": len(history),
               "history": history, "shipped": shipped, "decided": decided}
        store.put(TABLE, job.name, rec)        # each critic round is on the drive before the next starts

    slides, items = render(plan)
    status = ("review" if needs_review(job.key, cfg) else "shipped") if shipped else "needs-attention"
    places = _destinations(cfg, job.name)
    dest = places[status]
    publish(slides, plan.caption, dest, [p for s, p in places.items() if s != status])
    shutil.rmtree(work / "slides", ignore_errors=True)
    done = {k: v for k, v in rec.items() if k not in ("candidates", "decided", "round")}
    done.update({"status": status, "kind": job.kind, "event_key": job.key, "dir": str(dest), "count": len(slides),
                 "plan": plan.model_dump(), "caption": plan.caption, "critic": history, "rounds": len(history),
                 "frames": [{"id": s.frame_id, "asset_id": f.asset.id, "source": f.source, "path": str(f.path)}
                            for f, s in items],
                 "seconds": round(float(rec.get("seconds") or 0) + time.monotonic() - t0, 1)})
    store.put(TABLE, job.name, done)
    return done


def record(store: Store, name: str) -> dict | None:
    """The finished carousel `name` (<event>__NN or <event>__before-after), or None (not made yet,
    or still in progress)."""
    rec = store.get(TABLE, name)
    return rec if rec and rec.get("status") in FINISHED else None


def _jobs(groups: dict[str, list[Frame]], store: Store, tier: int, with_pairs: bool) -> list[Job]:
    """The carousels of one tier still to finish: each event's tier-th story (once its earlier
    stories are planned, so it can use other frames) and, with with_pairs, its before/after.
    Carousels already in progress come first."""
    out = []
    for key, frames in sorted(groups.items()):
        name = f"{key}__{tier:02d}"
        rec = store.get(TABLE, name)
        if not (rec and rec.get("status") in FINISHED):
            used: set[str] | None = set()
            for n in range(1, tier):
                earlier = store.get(TABLE, f"{key}__{n:02d}")
                if not (earlier and earlier.get("plan")):
                    used = None
                    break
                ids = {s["frame_id"] for s in earlier["plan"]["frames"]}
                used |= {f.asset.id for f in frames if f.id in ids}
            if used is not None:
                pool = [f for f in frames if f.asset.id not in used]
                if len(pool) >= MIN_FRAMES or (rec and rec.get("plan")):
                    out.append(Job(name, key, STORY, pool))
        if with_pairs:
            name = f"{key}__{BEFORE_AFTER}"
            rec = store.get(TABLE, name)
            pairs = pair_frames(frames)
            if not (rec and rec.get("status") in FINISHED) and (len(pairs) >= MIN_PAIRS or (rec and rec.get("plan"))):
                out.append(Job(name, key, BEFORE_AFTER, pairs))
    started = {j.name for j in out if (store.get(TABLE, j.name) or {}).get("plan")}
    return sorted(out, key=lambda j: j.name not in started)


def build_all(cfg: Config, store: Store, judge: Backend, assets: list[Asset], per_event: int = 1,
              before_after: bool = True, limit: int | None = None) -> int:
    """Per event: up to `per_event` story carousels (each from frames its earlier ones don't use)
    and, with before_after and at least MIN_PAIRS shipped edits whose camera JPEG shows the same
    scene, one before/after. At most `limit` carousels are worked on in a run (those in progress
    first). Every step is saved as it ends, so a stopped run resumes where it was; finished
    carousels are never redone. Returns how many were finished."""
    groups = candidates(store, assets, cfg)
    log.info("carousels: %d events with enough frames", len(groups))
    made = 0
    for tier in range(1, per_event + 1):
        jobs = _jobs(groups, store, tier, before_after and tier == 1)
        if limit is not None:
            jobs = jobs[:max(0, limit - made)]
        if not jobs:
            continue

        def ready(job: Job) -> Job | None:
            try:
                return prepare(job, cfg, store)
            except (RuntimeError, OSError, ValueError) as e:
                store.put("jobs", FAILED + job.name, {"error": str(e)})
                log.warning("carousel failed: %s: %s", job.name, e)
                return None

        with ThreadPoolExecutor(max(1, cfg.parallel)) as ex:
            jobs = [j for j in ex.map(ready, jobs) if j is not None]
        by_name = {j.name: j for j in jobs}

        def planned(name: str, answer) -> None:          # saved the moment each plan arrives
            try:
                if isinstance(answer, JudgeError):
                    raise answer
                job = by_name[name]
                plan = snap(answer, job.pool, job.key, job.kind)
            except JudgeError as e:
                store.put("jobs", FAILED + name, {"error": str(e)})
                log.warning("carousel plan failed: %s: %s", name, e)
                return
            rec = store.get(TABLE, name) or {}
            store.put(TABLE, name, {**rec, "status": "planned", "plan": plan.model_dump(), "round": 0,
                                    "history": [], "shipped": False, "decided": False})

        unplanned = [j for j in jobs if not (store.get(TABLE, j.name) or {}).get("plan")]
        if unplanned:
            judge.judge_many([plan_task(j, cfg) for j in unplanned], on_result=planned)

        def one(job: Job) -> int:
            if not (store.get(TABLE, job.name) or {}).get("plan"):
                return 0
            try:
                done = finish(job, cfg, store, judge)
            except (JudgeError, RuntimeError, OSError, ValueError) as e:
                store.put("jobs", FAILED + job.name, {"error": str(e)})
                log.warning("carousel failed: %s: %s", job.name, e)
                return 0
            store.delete("jobs", FAILED + job.name)
            log.info("carousel %s: %s, %d slides, %d critic rounds, %.0f s", job.name, done["status"],
                     done["count"], done["rounds"], done["seconds"])
            return 1

        with ThreadPoolExecutor(max(1, cfg.parallel)) as ex:
            made += sum(ex.map(one, jobs))
    return made
