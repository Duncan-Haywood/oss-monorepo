"""Timelapses and stop-motion: a run of evenly spaced stills from a fixed camera becomes one
"sequence" asset, judged as a whole and rendered into a clip.

Detection (`detect`)
--------------------
Among still photos with metrics, per (event_key, camera) in time order, a run is a sequence
when it has at least MIN_FRAMES frames and

* a steady interval. Timestamps have 1 s resolution, so an intervalometer firing every T
  seconds leaves gaps of only floor(T) and ceil(T): the "normal" gaps of a run must all fit in
  a band max(GAP_TOL_S, GAP_TOL_RATIO * T) wide around the run's interval, and the median gap
  is within MIN_INTERVAL_S..MAX_INTERVAL_S. Gaps of 0 s break a run: two frames in one second
  are a burst, not an interval of 1 s or more. On the real library every intervalometer run
  had a gap spread of exactly 1 s, while handheld shooting near one frame a second wanders
  over 0, 1 and 2 s and so never qualifies.
* a few dropped frames at most: a gap of 2x or 3x the interval (within max(GAP_TOL_S,
  DROP_TOL_RATIO * T): a skipped frame keeps the beat, a pause does not) counts as skipped
  slots, up to max(MAX_DROPPED, MAX_DROPPED_SHARE of the frames).
* mostly fixed framing: at least FRAMING_MIN_SHARE of consecutive pairs have dHashes within
  FRAMING_MAX_HAMMING bits. Stop-motion moves the subject but not the camera, so its pairs
  stay close too; a handheld walk-around does not.

Each run becomes an Asset(kind="sequence") whose `members` are the member ids in time order;
its members stop being candidates (burst_id = the sequence id) and the sequence gets its own
Metrics (medians of its members) so it is judged once. Detection is deterministic and safe to
re-run: members of sequences already in the input are never wrapped again.

Rendering (`render_clip`)
-------------------------
Member camera JPEGs are decoded in a process pool just big enough for the output (JPEG DCT
scaling or the camera's embedded MPF preview, i.e. 1-2x the output), turned upright (EXIF
orientation), converted to sRGB, cut to the output aspect around a focus point and written as
numbered JPEGs into a temp folder; ffmpeg's image2 demuxer then plays them at `fps` through
`deflicker` (timelapses flicker: auto exposure and aperture jitter) into H.264 High, yuv420p,
BT.709, CRF 17, no audio. Clips are cached under cfg.state_dir/"sequences".
"""
from __future__ import annotations

import logging
import math
import os
import shutil
import sqlite3
import subprocess
import tempfile
import time
import uuid
from collections import defaultdict
from collections.abc import Sequence
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from pathlib import Path
from statistics import median

from PIL import Image, ImageDraw

from . import media
from .catalog import asset_id
from .config import Config
from .models import Asset, Metrics, Score
from .prefilter import BLANK_DHASH, hamming

log = logging.getLogger(__name__)

# --- detection ---------------------------------------------------------------------------
MIN_FRAMES = 15              # under ~0.6 s at 24 fps: too short to read as motion
MIN_INTERVAL_S = 1.0         # faster than this is a burst (and 1 s timestamps cannot resolve it)
MAX_INTERVAL_S = 600.0       # slower than 10 min is a series of separate shots, not a clip
GAP_TOL_S = 1.0              # timestamps are whole seconds: floor/ceil of the interval differ by 1
GAP_TOL_RATIO = 0.25         # long intervals jitter more (exposure + processing time vary)
DROPPED_MULTIPLES = (2, 3)   # a skipped or deleted frame or two leaves a gap of 2x or 3x the interval
DROP_TOL_RATIO = 0.05        # ...on the beat: k x interval within max(GAP_TOL_S, 5%); a pause of 1.8x is not a drop
MAX_DROPPED = 3              # skipped slots always allowed per run...
MAX_DROPPED_SHARE = 0.1      # ...or up to 10% of its frames
FRAMING_MAX_HAMMING = 16     # of 64 bits. Real tripod runs: median pair 0-10 bits; walk-arounds 19-25
FRAMING_MIN_SHARE = 0.6      # tripod runs had 65-100% of pairs within 16, walk-arounds under 30%

# --- preview and clip --------------------------------------------------------------------
SHEET_FRAMES = 12            # frames on the contact sheet Claude judges the motion from
CLIP_SIZE = (1080, 1920)     # reel frame
CLIP_LONG_EDGE = 1920        # size=None: source aspect at this long edge
CLIP_CRF = 17
CLIP_PRESET = "fast"         # an intermediate (the reel re-encodes it): 2x medium, same size at CRF 17
DEFLICKER_FRAMES = 7         # brightness averaged over +-3 frames: kills flicker, keeps sunsets moving
JPEG_QUALITY = 95            # intermediate frames; x264 at CRF 17 sees no JPEG artefacts at this level
INLINE_MAX = 8               # fewer frames than this decode in-process (pool start-up costs more)
UPSCALE_SLACK = 0.02         # decoded frames may be this much smaller than the crop needs
DEFAULT_FPS = {"timelapse": 24, "stop-motion": 10}


# --- detection ---------------------------------------------------------------------------

def _unreadable(m: Metrics) -> bool:
    return m.sharpness <= 0 and m.dhash == BLANK_DHASH


def _extend(gaps: Sequence[float], s: int) -> tuple[int, float, int]:
    """Grow a run from frame s while the gaps stay steady. Returns (last frame index, interval
    estimate in seconds, skipped slots). The interval is seeded with the median of the next
    MIN_FRAMES-1 gaps, so the first gap of a run may itself be a dropped frame."""
    window = gaps[s:s + MIN_FRAMES - 1]
    if not window:
        return s, 0.0, 0
    seed = float(median(window))
    if not MIN_INTERVAL_S <= seed <= MAX_INTERVAL_S:
        return s, seed, 0
    tol = max(GAP_TOL_S, GAP_TOL_RATIO * seed)
    lo = hi = None
    total = count = 0.0         # sum and number of normal gaps: their mean tracks the true interval
    dropped = 0
    e = s
    for g in gaps[s:]:
        frames = e - s + 1
        interval = total / count if count >= 3 else seed
        if (g >= MIN_INTERVAL_S and abs(g - seed) <= tol
                and max(hi if hi is not None else g, g) - min(lo if lo is not None else g, g) <= tol):
            lo = g if lo is None else min(lo, g)
            hi = g if hi is None else max(hi, g)
            total += g
            count += 1
        else:
            drop_tol = max(GAP_TOL_S, DROP_TOL_RATIO * interval)
            k = next((k for k in DROPPED_MULTIPLES if abs(g - k * interval) <= drop_tol), None)
            if k is None or dropped + k - 1 > max(MAX_DROPPED, int(MAX_DROPPED_SHARE * (frames + 1))):
                break
            dropped += k - 1
        e += 1
    interval = total / count if count else seed
    return e, interval, dropped


def _fixed_framing(frames: Sequence[Asset], metrics: dict[str, Metrics]) -> bool:
    pairs = list(zip(frames, frames[1:]))
    close = sum(hamming(metrics[a.id].dhash, metrics[b.id].dhash) <= FRAMING_MAX_HAMMING for a, b in pairs)
    return bool(pairs) and close >= FRAMING_MIN_SHARE * len(pairs)


def find_runs(frames: Sequence[Asset], metrics: dict[str, Metrics]) -> list[tuple[int, int, float]]:
    """(first, last, interval_s) of every sequence among `frames` (one event and camera, sorted
    by time). Greedy from the left: a run that qualifies is taken whole and the search goes on
    after it; otherwise the search moves on by one frame."""
    times = [a.taken_at.timestamp() for a in frames]
    gaps = [b - a for a, b in zip(times, times[1:])]
    out = []
    s = 0
    while s <= len(frames) - MIN_FRAMES:
        e, _, dropped = _extend(gaps, s)
        if e - s + 1 >= MIN_FRAMES and _fixed_framing(frames[s:e + 1], metrics):
            slots = e - s + dropped
            out.append((s, e, (times[e] - times[s]) / slots))
            s = e + 1
        else:
            s += 1
    return out


def _sequence_asset(members: Sequence[Asset], interval: float) -> Asset:
    first = members[0]
    return Asset(id=asset_id("sequence", first.id), kind="sequence", files=[], preview=None,
                 taken_at=first.taken_at, date_label=first.date_label, location=first.location,
                 event=first.event, camera=first.camera, members=[a.id for a in members],
                 interval_s=round(interval, 3))


def _sequence_metrics(seq: Asset, metrics: dict[str, Metrics]) -> Metrics | None:
    """Medians of the members' measurements. Always a candidate: night runs (stars, the moon)
    read as near-black frame by frame, yet make the best timelapses."""
    ms = [metrics[m] for m in seq.members if m in metrics]
    if not ms:
        return None
    med = {k: float(median(getattr(m, k) for m in ms))
           for k in ("sharpness", "brightness", "clipped_high", "clipped_low")}
    return Metrics(asset_id=seq.id, dhash=ms[0].dhash, burst_id=seq.id, candidate=True, **med)


def detect(assets: list[Asset], metrics: dict[str, Metrics]) -> tuple[list[Asset], dict[str, Metrics]]:
    """Find timelapse / stop-motion runs among still photos (see the module docstring).

    Returns (new sequence assets, updated metrics). The metrics dict is a copy of `metrics` in
    which every member of a sequence - new or already in `assets` - has candidate=False and
    burst_id=<sequence id>, plus one entry per sequence. Same input, same ids
    (catalog.asset_id("sequence", first member id)); members of sequences already in `assets`
    are never wrapped again, so feeding the output back in finds nothing new."""
    out = dict(metrics)
    existing = [a for a in assets if a.kind == "sequence"]
    wrapped = {m for s in existing for m in s.members}
    groups: dict[tuple[str, str], list[Asset]] = defaultdict(list)
    for a in assets:
        m = metrics.get(a.id)
        if (a.kind == "photo" and a.taken_at is not None and m is not None
                and a.id not in wrapped and not _unreadable(m)):
            groups[(a.event_key, a.camera)].append(a)

    new: list[Asset] = []
    for key in sorted(groups):
        frames = sorted(groups[key], key=lambda a: (a.taken_at, a.id))
        for s, e, interval in find_runs(frames, metrics):
            new.append(_sequence_asset(frames[s:e + 1], interval))

    for seq in existing + new:
        for mid in seq.members:
            if mid in out:
                out[mid] = out[mid].model_copy(update={"candidate": False, "burst_id": seq.id}, deep=True)
        # The run is judged as a clip, but its best frame still competes as a photo: a moon or star
        # frame can be a feed post, and a held-down burst the camera slowed to ~1.5 s (which looks
        # exactly like an intervalometer run) is really a set of moments.
        best = _best_member(seq, metrics)
        if best:
            out[best] = out[best].model_copy(update={"candidate": True}, deep=True)
        sm = _sequence_metrics(seq, metrics)
        if sm is not None:
            out[seq.id] = sm
    if new:
        log.info("sequences: %d new (%d frames)", len(new), sum(len(s.members) for s in new))
    return new, out


def _best_member(seq: Asset, metrics: dict[str, Metrics]) -> str | None:
    """Best face capture when the frames have faces, otherwise the sharpest frame."""
    ms = [metrics[m] for m in seq.members if m in metrics and not _unreadable(metrics[m])]
    if not ms:
        return None
    if any(m.faces for m in ms):
        return max(ms, key=lambda m: (m.face_quality or 0, m.sharpness)).asset_id
    return max(ms, key=lambda m: (m.sharpness, m.aesthetics or 0)).asset_id


# --- members -----------------------------------------------------------------------------

def member_assets(seq: Asset, cfg: Config) -> list[Asset]:
    """The member stills of a sequence, in order, read (read-only) from the state database:
    a sequence asset carries only member ids. Raises media.MediaError if any is missing."""
    path = Path(cfg.db_path)
    if not path.exists():
        raise media.MediaError(f"sequence {seq.id}: no catalog at {path}")
    rows: dict[str, str] = {}
    db = sqlite3.connect(f"{path.resolve().as_uri()}?mode=ro", uri=True)
    try:
        ids = list(seq.members)
        for i in range(0, len(ids), 500):
            chunk = ids[i:i + 500]
            rows.update(db.execute(f"SELECT key, value FROM assets WHERE key IN ({','.join('?' * len(chunk))})",
                                   chunk).fetchall())
    finally:
        db.close()
    missing = [m for m in seq.members if m not in rows]
    if missing:
        raise media.MediaError(f"sequence {seq.id}: {len(missing)} member(s) not in the catalog")
    return [Asset.model_validate_json(rows[m]) for m in seq.members]


def _frame_file(a: Asset) -> Path:
    if not a.preview and not a.raw:
        raise media.MediaError(f"member {a.id} has no image file")
    return Path(a.preview or a.raw)


# --- contact sheet -----------------------------------------------------------------------

def _seconds_label(s: float) -> str:
    return f"{s:.1f}" if s < 10 else f"{s:.0f}"


def contact_sheet(seq: Asset, members: list[Asset], size: int = media.PREVIEW_SIZE,
                  n: int = SHEET_FRAMES) -> Image.Image:
    """n evenly spaced member frames in a grid, each labelled '#index t=+Ns' (index in the
    run, seconds after the first frame), under a header 'N frames every X s'."""
    if not members:
        raise media.MediaError(f"sequence {seq.id} has no members")
    k = min(n, len(members))
    picks = sorted({round(i * (len(members) - 1) / max(1, k - 1)) for i in range(k)})
    t0 = members[0].taken_at

    def tile(i: int) -> Image.Image:
        return media._fit(media._load_still(_frame_file(members[i]), size // 2), size // 2)

    with ThreadPoolExecutor(max_workers=min(4, len(picks))) as pool:
        tiles = list(pool.map(tile, picks))
    grid, cols, cw, ch = media._grid(tiles, size)
    for j, i in enumerate(picks):
        dt = (members[i].taken_at - t0).total_seconds() if t0 and members[i].taken_at else 0.0
        media._label(grid, f"#{i} t=+{dt:.0f}s", ((j % cols) * cw + 4, (j // cols) * ch + 4), px=14)

    interval = seq.interval_s or 0.0
    span = (members[-1].taken_at - t0).total_seconds() if t0 and members[-1].taken_at else 0.0
    header = f"{len(members)} frames every {_seconds_label(interval)} s"
    if span >= 60:
        header += f" ({span / 60:.0f} min)"
    top = 26
    sheet = Image.new("RGB", (grid.width, grid.height + top), (0, 0, 0))
    sheet.paste(grid, (0, top))
    ImageDraw.Draw(sheet).text((6, 4), header, fill=(255, 255, 255), font=media._font(16))
    return sheet


# --- clip --------------------------------------------------------------------------------

def _even(v: float) -> int:
    return max(2, int(round(v / 2)) * 2)


def _upright_size(path: Path) -> tuple[int, int]:
    """(width, height) as displayed, without decoding pixels."""
    try:
        with Image.open(path) as im:
            w, h = im.size
            if im.getexif().get(0x0112, 1) in (5, 6, 7, 8):
                w, h = h, w
    except (OSError, ValueError) as e:
        raise media.MediaError(f"cannot read image {path}: {e}") from e
    return w, h


def _cover_box(w: int, h: int, aspect: float, focus: tuple[float, float]) -> tuple[float, float, float, float]:
    """Largest box of `aspect` (w/h) inside w x h, centred on focus as far as the frame allows."""
    if w / h > aspect:
        bw, bh = h * aspect, float(h)
    else:
        bw, bh = float(w), w / aspect
    x = min(max(focus[0] * w - bw / 2, 0.0), w - bw)
    y = min(max(focus[1] * h - bh / 2, 0.0), h - bh)
    return x, y, x + bw, y + bh


def _frame_job(job: tuple[str, str, tuple[int, int], tuple[float, float]]) -> str:
    """Worker: one member JPEG -> one upright, sRGB, cropped, resized frame. Module level so it
    pickles into a process pool."""
    src, dest, (ow, oh), focus = job
    path = Path(src)
    uw, uh = _upright_size(path)
    x0, y0, x1, y1 = _cover_box(uw, uh, ow / oh, focus)
    # long edge at which the crop is ow wide; 2% short is invisible and lets a 16:9 frame use the
    # camera's 1920x1080 MPF preview (~0.05 s) instead of decoding 61 MP at 1/4 scale (~0.5 s)
    need = math.floor(max(uw, uh) * ow / (x1 - x0) * (1 - UPSCALE_SLACK))
    img = media._load_still(path, min(need, max(uw, uh)))
    sx, sy = img.width / uw, img.height / uh             # decoded scale (draft / MPF picked it)
    box = (max(0.0, x0 * sx), max(0.0, y0 * sy), min(float(img.width), x1 * sx), min(float(img.height), y1 * sy))
    img.resize((ow, oh), Image.Resampling.LANCZOS, box=box, reducing_gap=3.0).save(
        dest, "JPEG", quality=JPEG_QUALITY)
    return dest


def clip_path(seq: Asset, cfg: Config, fps: int, start: int, end: int,
              size: tuple[int, int] | None = CLIP_SIZE, focus: tuple[float, float] = (0.5, 0.5)) -> Path:
    """Cache location: state/sequences/<id>_<fps>_<start>_<end>.mp4 for the reel frame cut around
    the centre; other sizes or focus points add a suffix."""
    name = f"{seq.id}_{fps}_{start}_{end}"
    if size is None:
        name += "_src"
    elif tuple(size) != CLIP_SIZE:
        name += f"_{size[0]}x{size[1]}"
    if size is not None and (round(focus[0], 2), round(focus[1], 2)) != (0.5, 0.5):
        name += f"_f{focus[0]:.2f}-{focus[1]:.2f}"
    return cfg.state_dir / "sequences" / f"{name}.mp4"


def ffmpeg_args(frames_pattern: str | Path, fps: int, out_path: str | Path, cfg: Config) -> list[str]:
    """The ffmpeg command that plays numbered JPEGs at fps, deflickered, into H.264 (pure)."""
    vf = (f"deflicker=size={DEFLICKER_FRAMES}:mode=am,"
          "scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p")
    return [cfg.ffmpeg, "-nostdin", "-hide_banner", "-v", "error", "-y",
            "-framerate", str(fps), "-start_number", "0", "-i", str(frames_pattern),
            "-vf", vf, "-an", "-c:v", "libx264", "-preset", CLIP_PRESET, "-crf", str(CLIP_CRF),
            "-profile:v", "high", "-pix_fmt", "yuv420p", "-g", str(2 * fps),
            "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
            "-movflags", "+faststart", str(out_path)]


def render_clip(seq: Asset, members: list[Asset], cfg: Config, fps: int, start: int, end: int,
                out_path: str | Path | None = None, size: tuple[int, int] | None = CLIP_SIZE, *,
                focus: tuple[float, float] = (0.5, 0.5), workers: int | None = None) -> Path:
    """Render members start..end (indices into seq.members, inclusive) at `fps` into an MP4.

    size (w, h) is the output frame, cut from each photo as the largest box of that aspect
    around `focus` (0..1, default the centre); None keeps the photos' aspect at a long edge of
    CLIP_LONG_EDGE. `members` are the member Assets in any order (see member_assets). The
    result is cached under cfg.state_dir/"sequences" (see clip_path) and reused; with out_path
    the cached clip is also copied there. Raises media.MediaError for unreadable frames,
    RuntimeError when ffmpeg fails."""
    by_id = {a.id: a for a in members}
    if not seq.members:
        raise media.MediaError(f"sequence {seq.id} has no members")
    last = len(seq.members) - 1
    start = min(max(int(start), 0), last)
    end = min(max(int(end), start), last)
    fps = max(1, int(fps))
    missing = [m for m in seq.members[start:end + 1] if m not in by_id]
    if missing:
        raise media.MediaError(f"sequence {seq.id}: {len(missing)} member(s) not given")
    paths = [_frame_file(by_id[m]) for m in seq.members[start:end + 1]]

    cached = clip_path(seq, cfg, fps, start, end, size, focus)
    if not (cached.exists() and cached.stat().st_size > 0):
        if size is None:
            uw, uh = _upright_size(paths[0])
            s = CLIP_LONG_EDGE / max(uw, uh)
            out_size = (_even(uw * s), _even(uh * s))
        else:
            out_size = (_even(size[0]), _even(size[1]))
        cached.parent.mkdir(parents=True, exist_ok=True)
        work = Path(tempfile.mkdtemp(prefix=f".{seq.id}-", dir=cached.parent))
        tmp_out = cached.with_name(f".{cached.stem}.{uuid.uuid4().hex[:8]}.mp4")
        try:
            t0 = time.monotonic()
            jobs = [(str(p), str(work / f"{i:06d}.jpg"), out_size, (float(focus[0]), float(focus[1])))
                    for i, p in enumerate(paths)]
            workers = workers or os.cpu_count() or 1
            if workers <= 1 or len(jobs) < INLINE_MAX:
                for j in jobs:
                    _frame_job(j)
            else:
                with ProcessPoolExecutor(max_workers=min(workers, len(jobs))) as pool:
                    list(pool.map(_frame_job, jobs, chunksize=4))
            t1 = time.monotonic()
            args = ffmpeg_args(work / "%06d.jpg", fps, tmp_out, cfg)
            proc = subprocess.run(args, capture_output=True)
            if proc.returncode != 0 or not tmp_out.exists():
                err = proc.stderr.decode(errors="replace").strip()[-2000:]
                raise RuntimeError(f"ffmpeg failed on sequence {seq.id}: {err}")
            os.replace(tmp_out, cached)
            log.info("sequence %s: %d frames decoded in %.1f s, encoded in %.1f s", seq.id, len(jobs),
                     t1 - t0, time.monotonic() - t1)
        finally:
            tmp_out.unlink(missing_ok=True)
            shutil.rmtree(work, ignore_errors=True)
    if out_path is None or Path(out_path) == cached:
        return cached
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(cached, out)
    return out


# --- reels -------------------------------------------------------------------------------

def reel_source(seq: Asset, store, cfg: Config, keep_aspect: bool = False) -> dict:
    """What a reel shows for a sequence: the clip Claude asked for when it judged the run a
    timelapse or stop-motion ({"kind": "video"}), else its sharpest frame as a still. A night run
    the astro stage made a stack, star trails or a trail timelapse of uses that instead."""
    from . import astro
    made = astro.reel_source(seq, store)
    if made is not None and not (keep_aspect and made["kind"] == "video"):
        return made
    score = store.get("scores", seq.id, Score)
    members = [store.get("assets", m, Asset) for m in seq.members]
    if any(m is None for m in members) or not members:
        raise media.MediaError(f"sequence {seq.id}: members missing from the catalog")
    last = len(members) - 1
    start = 0 if score is None or score.sequence_from is None else min(max(score.sequence_from, 0), last)
    end = last if score is None or score.sequence_to is None else min(max(score.sequence_to, start), last)
    if score is not None and score.sequence_style in ("timelapse", "stop-motion"):
        fps = min(max(score.sequence_fps or DEFAULT_FPS[score.sequence_style], 1), 60)
        focus = (score.vertical_focus.x, score.vertical_focus.y)
        # a fit or pan shot needs the whole frame; otherwise cut the 9:16 clip here, around the focus
        clip = render_clip(seq, members, cfg, fps, start, end, size=None if keep_aspect else CLIP_SIZE,
                           focus=(0.5, 0.5) if keep_aspect else focus)
        return {"kind": "video", "path": str(clip)}
    stretch = members[start:end + 1]

    def rank(i: int) -> tuple[float, int]:          # sharpest; ties go to the middle of the stretch
        m = store.get("metrics", stretch[i].id, Metrics)
        return (m.sharpness if m else 0.0), -abs(i - len(stretch) // 2)

    best = stretch[max(range(len(stretch)), key=rank)]
    return {"kind": "photo", "path": str(_frame_file(best))}
