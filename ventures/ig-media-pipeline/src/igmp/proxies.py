"""The proxy working set: reel-resolution copies of everything reels may draw on, so reels are
planned and rendered while the photo drives are disconnected (`igmp stage`).

What is staged is exactly what reels draw from (reels.event_pool: every keeper of an event with
enough of them; sequences are rendered from their frames and are left out), plus the shipped RAW
edits of those photos (an edit's "full" JPEG lives on output_dir, which may be away too):

  still     camera JPEG -> sRGB JPEG q90, upright (EXIF orientation applied), long edge just big
            enough for a 1080x1920 crop at 1.2x zoom (still_long_edge: ~3630 px for 3:2)
  raw       RAW-only still -> developed like reels._developed (camera WB, half size), then as above
  insp      Insta360 .insp -> the same JPEG bytes, full size, as .jpg (360 stills are reframed)
  video     H.264 yuv420p CRF 18, audio kept (AAC), long edge 1920, fps and length unchanged
  video360  .insv -> H.264 at 1920 px per lens (a 3840x1920 dual-fisheye frame), both lens streams
            kept and the .insv name, so render.py reads it exactly like the original

Only the stretches of a clip reels can use are kept (plan_stretches): the score's best window and
the prefilter's usable segments, each padded by PAD_S, merged, at most CAP_S seconds a clip (the
best window first, then the longest segments). The proxy keeps the clip's whole timeline - every
frame where it was, same timestamps, same length - and is black and silent between the stretches,
which H.264 stores for next to nothing. So a time in the clip is the same time in the proxy: the
renderer's seeks (-ss start_s), the cover frame and every probe need no translation and stay
frame-exact. The manifest records the stretches; reels.source_for refuses a shot that reaches
outside them (OutsideStretches) instead of rendering black.
  edit      a shipped edit's full JPEG, copied

Files live in `proxy_dir` (default <state_dir>/proxies; point it at a cloud-synced folder to keep
them in cloud storage) as <id[:2]>/<id>.<ext>, next to manifest.json: key -> source path, its size
and mtime, the recipe version and the proxy's relative path. A file whose source is unchanged is
never redone; every proxy is written to a temporary name and renamed, and the manifest is saved
as results arrive, so a stopped `igmp stage` resumes where it was.

At render time reels.source_for asks proxy_for(path) only when the original path is missing.
"""
from __future__ import annotations

import json
import logging
import math
import os
import shutil
import subprocess
import threading
import uuid
from concurrent.futures import FIRST_COMPLETED, ProcessPoolExecutor, wait
from dataclasses import dataclass, field
from pathlib import Path

from .config import Config

log = logging.getLogger(__name__)

OUT_W, OUT_H = 1080, 1920        # the reel frame (render.OUT_W/OUT_H)
ZOOM = 1.2                       # the deepest push-in a still should survive at full sharpness
MARGIN = 1.05                    # a little room for pans and rounding
VIDEO_LONG = 1920                # flat video
LENS_LONG = 1920                 # per 360 lens: a dual-fisheye frame 3840 wide
JPEG_Q = 90
CRF = 18
RAW_EXT = (".arw", ".dng")
VIDEO_KINDS = ("video", "video360")
# bump a recipe's number to redo its proxies after changing how they are made
RECIPES = {"still": 1, "raw": 1, "insp": 1, "video": 2, "video360": 2, "edit": 1}
PAD_S = 1.5                      # around each usable stretch (setting proxy_pad_s)
CAP_S = 60.0                     # seconds kept per clip at most (setting proxy_clip_seconds)
MANIFEST = "manifest.json"
SAVE_EVERY = 10


@dataclass
class Job:
    key: str            # asset id, or "edit:<asset id>"
    recipe: str         # a RECIPES key
    source: str
    rel: str            # proxy path relative to proxy_dir
    # video: what decides its stretches - [segments, best window, pad, cap]
    want: list = field(default_factory=list)


class OutsideStretches(FileNotFoundError):
    """A shot needs frames of an offline clip that were not staged."""


def plan_stretches(duration: float, segments, best=None, pad: float = PAD_S, cap: float = CAP_S
                   ) -> list[tuple[float, float]]:
    """The stretches of a clip to stage, sorted and merged: the best window, then the usable
    segments longest first, each padded by pad, until cap seconds are kept (a window longer than
    what is left is cut down around its middle). Without either, the clip's start, up to cap."""
    end = duration if duration and duration > 0 else math.inf

    def clip(a, b):
        return max(0.0, float(a)), min(end, float(b))

    wanted = []
    if best and best[0] is not None and best[1] is not None and best[1] > best[0]:
        wanted.append(clip(best[0] - pad, best[1] + pad))
    wanted += sorted((clip(a - pad, b + pad) for a, b in (segments or []) if b > a),
                     key=lambda s: -(s[1] - s[0]))
    if not wanted:
        wanted = [clip(0.0, min(end, cap))]
    kept: list[tuple[float, float]] = []

    def total():
        return sum(b - a for a, b in kept)

    def uncovered(a, b):
        out, cur = [], a
        for x, y in kept:
            if y <= cur or x >= b:
                continue
            if x > cur:
                out.append((cur, x))
            cur = max(cur, y)
        if cur < b:
            out.append((cur, b))
        return out

    for a, b in wanted:
        for x, y in uncovered(a, b):
            room = cap - total()
            if room <= 1e-3:
                break
            if y - x > room:
                mid = (x + y) / 2
                x, y = mid - room / 2, mid + room / 2
            kept = sorted([*kept, (x, y)])
    merged: list[list[float]] = []
    for a, b in kept:
        if merged and a <= merged[-1][1] + 1e-6:
            merged[-1][1] = max(merged[-1][1], b)
        else:
            merged.append([a, b])
    return [(round(a, 3), round(b, 3)) for a, b in merged if b - a > 1e-3]


# --------------------------------------------------------------------------- what to stage

def still_long_edge(w: int, h: int) -> int:
    """The long edge a w x h still needs so the largest 9:16 crop of it holds OUT_W x OUT_H at
    ZOOM (plus MARGIN); never more than it has. A frame wider than 9:16 is cropped to its full
    height (3:2 landscape: 1920 * 1.2 * 1.5 * 1.05 = 3629), a taller one to its full width."""
    if w <= 0 or h <= 0:
        return max(w, h)
    scale = OUT_H * ZOOM / h if w / h > OUT_W / OUT_H else OUT_W * ZOOM / w
    return min(max(w, h), math.ceil(max(w, h) * scale * MARGIN))


def _recipe_for(kind: str, source: str) -> str | None:
    suffix = Path(source).suffix.lower()
    if kind in VIDEO_KINDS:
        return "video360" if suffix == ".insv" else "video"
    if suffix in RAW_EXT:
        return "raw"
    if suffix == ".insp":
        return "insp"
    if suffix in (".jpg", ".jpeg"):
        return "still"
    return None


EXT = {"still": ".jpg", "raw": ".jpg", "insp": ".jpg", "video": ".mp4", "video360": ".insv", "edit": ".jpg"}


def _rel(key: str, recipe: str) -> str:
    name = key.replace(":", "-")
    aid = key.split(":")[-1]
    return f"{aid[:2]}/{name}{EXT[recipe]}"


def reel_assets(store, assets) -> list:
    """The assets reels draw from (reels.event_pool), sequences aside, best events first."""
    from .reels import event_pool
    seen, out = set(), []
    for items in event_pool(store, assets).values():
        for a, _ in items:
            if a.kind != "sequence" and a.id not in seen:
                seen.add(a.id)
                out.append(a)
    return out


def jobs(store, assets, cfg: Config | None = None) -> list[Job]:
    """One job per file reels may read: the asset's own source (what reels.source_for reads) and,
    for a photo with a shipped edit, the edit's full JPEG. A clip's job carries what decides its
    stretches: the prefilter's segments and the score's best window."""
    x = (cfg.extra if cfg else None) or {}
    pad, cap = float(x.get("proxy_pad_s", PAD_S)), float(x.get("proxy_clip_seconds", CAP_S))
    out = []
    for a in reel_assets(store, assets):
        source = a.preview if a.kind in VIDEO_KINDS else (a.preview or a.raw)
        recipe = _recipe_for(a.kind, source) if source else None
        if recipe:
            want = []
            if recipe in VIDEO_KINDS:
                m, s = store.get("metrics", a.id) or {}, store.get("scores", a.id) or {}
                want = [[list(seg) for seg in m.get("segments") or []],
                        [s.get("best_in_s"), s.get("best_out_s")], pad, cap]
            out.append(Job(a.id, recipe, source, _rel(a.id, recipe), want))
        edit = store.get("edits", a.id) if a.kind == "photo" else None
        if edit and edit.get("status") == "shipped" and edit.get("full"):
            key = f"edit:{a.id}"
            out.append(Job(key, "edit", edit["full"], _rel(key, "edit")))
    return out


# --------------------------------------------------------------------------- the manifest

_cache: dict[str, tuple[float, dict[str, str]]] = {}
_cache_lock = threading.Lock()


def load_manifest(proxy_dir: Path) -> dict:
    try:
        data = json.loads((proxy_dir / MANIFEST).read_text())
        return data if isinstance(data.get("items"), dict) else {"version": 1, "items": {}}
    except (OSError, ValueError, AttributeError):
        return {"version": 1, "items": {}}


def save_manifest(proxy_dir: Path, manifest: dict) -> None:
    proxy_dir.mkdir(parents=True, exist_ok=True)
    tmp = proxy_dir / f".{MANIFEST}.{uuid.uuid4().hex[:8]}"
    tmp.write_text(json.dumps(manifest, indent=1, sort_keys=True))
    os.replace(tmp, proxy_dir / MANIFEST)


def _by_source(proxy_dir: Path) -> dict[str, dict]:
    """source path -> manifest entry; re-read when the manifest changes."""
    path = proxy_dir / MANIFEST
    try:
        mtime = path.stat().st_mtime
    except OSError:
        return {}
    key = str(proxy_dir)
    with _cache_lock:
        hit = _cache.get(key)
        if hit and hit[0] == mtime:
            return hit[1]
    items = load_manifest(proxy_dir)["items"]
    table = {e["source"]: e for e in items.values() if e.get("source") and e.get("proxy")}
    with _cache_lock:
        _cache[key] = (mtime, table)
    return table


def proxy_for(cfg: Config | None, path: str | Path | None) -> Path | None:
    """The staged proxy of a library (or output) file, when there is one on disk."""
    e = entry_for(cfg, path)
    if e is None:
        return None
    p = cfg.proxy_dir / e["proxy"]
    return p if p.exists() else None


def entry_for(cfg: Config | None, path: str | Path | None) -> dict | None:
    """The manifest entry of a source file (its proxy, stretches, recorded probe), if staged."""
    if cfg is None or not path:
        return None
    return _by_source(cfg.proxy_dir).get(str(path))


def recorded_info(cfg: Config | None, path: str | Path | None) -> dict | None:
    """media.probe() of an offline original, as recorded when it was staged (None: not recorded)."""
    e = entry_for(cfg, path)
    return dict(e["info"]) if e and e.get("info") else None


def video_for_shot(path: str | None, cfg: Config | None, shot=None, kind: str = "video") -> str | None:
    """A clip for the renderer: the original while it is there, else its proxy. The proxy keeps the
    clip's timeline, so the shot's times apply unchanged; a shot that needs frames outside the
    staged stretches raises OutsideStretches (the reel is recorded as failed and retried once the
    drive is back) rather than render black."""
    if not path or cfg is None or Path(path).exists():
        return path
    e = entry_for(cfg, path)
    proxy = cfg.proxy_dir / e["proxy"] if e else None
    if proxy is None or not proxy.exists():
        return path
    stretches = e.get("stretches")
    if shot is not None and stretches is not None:
        from .render import source_span
        span = source_span(shot, kind)
        duration = float(e.get("duration") or 0.0)
        start = float(shot.start_s)
        if duration > 0:                                # as render._start clamps it
            start = min(start, max(0.0, duration - span))
        start = max(0.0, start)
        frame = 1.0 / float(e.get("fps") or 30.0)
        if not any(a - 1e-3 <= start and start + span + frame <= b + 1e-3 for a, b in stretches):
            raise OutsideStretches(
                f"{Path(path).name} is not connected and its shot {start:.2f}-{start + span:.2f} s lies outside "
                f"the staged stretches {[(a, b) for a, b in stretches]}: reconnect the drive (or re-stage)")
    return str(proxy)


def stretch_times(stretches, n: int) -> list[float]:
    """n times spread evenly over the stretches (as _sample_times spreads them over a clip)."""
    total = sum(b - a for a, b in stretches)
    out = []
    for i in range(n):
        pos = total * (i + 0.5) / n
        for a, b in stretches:
            if pos <= b - a:
                out.append(round(a + pos, 3))
                break
            pos -= b - a
    return out


def available(path: str | None, cfg: Config | None) -> str | None:
    """path when it exists; else its proxy when one is staged; else path unchanged."""
    if not path or cfg is None or Path(path).exists():
        return path
    p = proxy_for(cfg, path)
    return str(p) if p is not None else path


# --------------------------------------------------------------------------- making proxies

def _tmp(dest: Path) -> Path:
    return dest.with_name(f".{dest.stem}.{uuid.uuid4().hex[:8]}{dest.suffix}")


def _save_rgb(img, dest: Path) -> None:
    t = _tmp(dest)
    try:
        img.save(t, "JPEG", quality=JPEG_Q, optimize=True)
        os.replace(t, dest)
    finally:
        t.unlink(missing_ok=True)


def make_still(src: Path, dest: Path) -> None:
    from PIL import Image, ImageOps
    from .media import _to_srgb
    with Image.open(src) as im:
        w, h = im.size
        orientation = im.getexif().get(0x0112, 1)
        dw, dh = (h, w) if orientation in (5, 6, 7, 8) else (w, h)
        long_edge = still_long_edge(dw, dh)
        s = long_edge / max(w, h)
        im.draft("RGB", (math.ceil(w * s), math.ceil(h * s)))     # JPEG DCT scaling: decode less
        img = _to_srgb(ImageOps.exif_transpose(im))
    _save_rgb(_resize(img, long_edge), dest)


def _resize(img, long_edge: int):
    from PIL import Image
    w, h = img.size
    if max(w, h) <= long_edge:
        return img
    s = long_edge / max(w, h)
    return img.resize((max(1, round(w * s)), max(1, round(h * s))), Image.Resampling.LANCZOS)


def make_raw(src: Path, dest: Path) -> None:
    """Developed as reels._developed does it (camera white balance, half size), then sized."""
    import rawpy
    from PIL import Image
    with rawpy.imread(str(src)) as r:
        rgb = r.postprocess(use_camera_wb=True, half_size=True, output_bps=8)
    img = Image.fromarray(rgb)
    _save_rgb(_resize(img, still_long_edge(*img.size)), dest)


def _copy(src: Path, dest: Path) -> None:
    t = _tmp(dest)
    try:
        shutil.copyfile(src, t)
        if t.stat().st_size != src.stat().st_size:
            raise OSError(f"short copy of {src}")
        os.replace(t, dest)
    finally:
        t.unlink(missing_ok=True)


def _scale(long_edge: int) -> str:
    """Long edge at most long_edge (never upscaled), even dimensions, aspect kept."""
    return (f"scale=w='if(gte(iw,ih),min({long_edge},iw),-2)':h='if(gte(iw,ih),-2,min({long_edge},ih))'"
            ":flags=lanczos,setsar=1")


def _outside(stretches) -> str:
    """An ffmpeg expression, true for a frame time t outside every stretch."""
    return "not(" + "+".join(f"between(t,{a:.3f},{b:.3f})" for a, b in stretches) + ")"


def video_args(src: Path, dest: Path, recipe: str, cfg: Config, streams: int, threads: int = 0,
               stretches=None, audio: bool = True) -> list[str]:
    """The ffmpeg command for a video proxy (pure, for tests). With stretches, every frame outside
    them is painted black and the sound there muted; timestamps pass through untouched."""
    x = cfg.extra or {}
    enc = ["-c:v", "libx264", "-crf", str(x.get("proxy_crf", CRF)), "-preset", str(x.get("proxy_preset", "medium")),
           "-pix_fmt", "yuv420p"]
    args = [cfg.ffmpeg, "-nostdin", "-hide_banner", "-v", "error", "-y", "-i", str(src)]
    gaps = f",drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable='{_outside(stretches)}'" if stretches else ""
    if recipe == "video360" and streams >= 2:
        # X5: one fisheye stream per lens; both kept, in order, so render stacks them as before
        args += ["-map", "0:v:0", "-map", "0:v:1", "-filter:v:0", _scale(LENS_LONG) + gaps,
                 "-filter:v:1", _scale(LENS_LONG) + gaps]
    else:
        args += ["-map", "0:v:0", "-vf", _scale(2 * LENS_LONG if recipe == "video360" else VIDEO_LONG) + gaps]
    if audio:
        args += ["-map", "0:a:0", "-c:a", "aac", "-b:a", "192k"]
        if stretches:
            args += ["-af", f"volume=volume=0:enable='{_outside(stretches)}'"]
    args += [*enc, "-fps_mode", "passthrough", "-map_metadata", "0", "-movflags", "+faststart"]
    if threads:
        args += ["-threads", str(threads)]
    return args + ["-f", "mp4", str(dest)]


def make_video(src: Path, dest: Path, recipe: str, cfg: Config, threads: int = 0, want: list | None = None) -> dict:
    """Write a clip's proxy; returns what the manifest records of it: the original's probe (info),
    duration, fps and the stretches kept (None: the whole clip)."""
    from .media import probe
    info = probe(src, cfg)
    stretches = None
    if want:
        segments, best, pad, cap = want
        stretches = plan_stretches(info["duration_s"], segments, best, pad, cap)
        if info["duration_s"] and sum(b - a for a, b in stretches) >= info["duration_s"] - 1e-3:
            stretches = None                             # all of it is kept anyway
    t = _tmp(dest)
    try:
        streams = info["video_streams"] if recipe == "video360" else 1
        res = subprocess.run(video_args(src, t, recipe, cfg, streams, threads, stretches, info["has_audio"]),
                             capture_output=True, text=True)
        if res.returncode != 0 or not t.exists() or t.stat().st_size == 0:
            err = (res.stderr or "").strip().splitlines()
            raise RuntimeError(f"ffmpeg {src.name}: {err[-1] if err else 'no output'}")
        os.replace(t, dest)
    finally:
        t.unlink(missing_ok=True)
    return {"info": info, "duration": info["duration_s"], "fps": info["fps"],
            "stretches": [list(s) for s in stretches] if stretches is not None else None}


def make(job: Job, cfg: Config, threads: int = 0) -> dict:
    """Write one proxy; returns its manifest entry. Runs in a worker process."""
    src = Path(job.source)
    st = src.stat()
    dest = cfg.proxy_dir / job.rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    extra = {}
    if job.recipe == "still":
        make_still(src, dest)
    elif job.recipe == "raw":
        make_raw(src, dest)
    elif job.recipe in ("insp", "edit"):
        _copy(src, dest)
    else:
        extra = make_video(src, dest, job.recipe, cfg, threads, job.want)
    return {"source": job.source, "size": st.st_size, "mtime": st.st_mtime, "recipe": job.recipe,
            "version": RECIPES[job.recipe], "proxy": job.rel, "bytes": dest.stat().st_size,
            "want": job.want, **extra}


def _make(args):
    job, cfg, threads = args
    try:
        return job.key, make(job, cfg, threads)
    except Exception as e:          # one bad file must not stop the pass
        return job.key, e


def current(job: Job, entry: dict | None, proxy_dir: Path) -> bool | None:
    """True: the proxy is up to date. False: (re)make it. None: the source is offline (a proxy, if
    any, is kept as it is)."""
    try:
        st = os.stat(job.source)
    except OSError:
        return None
    return bool(entry) and entry.get("source") == job.source and entry.get("size") == st.st_size \
        and entry.get("mtime") == st.st_mtime and entry.get("recipe") == job.recipe \
        and entry.get("version") == RECIPES[job.recipe] and (entry.get("want") or []) == job.want \
        and (proxy_dir / entry.get("proxy", "")).is_file()


def workers_for(cfg: Config) -> int:
    n = (cfg.extra or {}).get("stage_workers")
    return max(1, int(n)) if n else max(1, min(4, (os.cpu_count() or 4) // 4))


def stage(cfg: Config, store, assets, *, workers: int | None = None, limit: int | None = None) -> dict:
    """Make every missing or outdated proxy. Returns counts: staged, current, offline, failed, and
    bytes (the proxy set's size on disk)."""
    todo_all = jobs(store, assets, cfg)
    proxy_dir = cfg.proxy_dir
    manifest = load_manifest(proxy_dir)
    items = manifest["items"]
    todo, fresh, offline = [], 0, 0
    for j in todo_all:
        ok = current(j, items.get(j.key), proxy_dir)
        if ok is None:
            offline += 1
        elif ok:
            fresh += 1
        else:
            todo.append(j)
    if limit is not None:
        todo = todo[:max(0, limit)]
    # videos first: they take longest, so the pool ends on quick stills
    todo.sort(key=lambda j: j.recipe not in VIDEO_KINDS)
    workers = workers or workers_for(cfg)
    threads = max(2, (os.cpu_count() or 4) // workers)
    log.info("stage: %d proxies to make, %d current, %d with their drive away (%s)",
             len(todo), fresh, offline, proxy_dir)
    staged = failed = 0
    if todo:
        proxy_dir.mkdir(parents=True, exist_ok=True)
        it = iter(todo)
        with ProcessPoolExecutor(max_workers=workers) as pool:
            running = set()
            for j in it:                                   # a bounded queue: at most 2x workers in flight
                running.add(pool.submit(_make, (j, cfg, threads)))
                if len(running) >= 2 * workers:
                    break
            while running:
                done, running = wait(running, return_when=FIRST_COMPLETED)
                for f in done:
                    key, result = f.result()
                    if isinstance(result, Exception):
                        failed += 1
                        log.warning("stage: %s failed: %s", key, result)
                        if store is not None:
                            store.put("jobs", f"stage:{key}", {"error": str(result)})
                    else:
                        items[key] = result
                        staged += 1
                        if staged % SAVE_EVERY == 0:
                            save_manifest(proxy_dir, manifest)
                    nxt = next(it, None)
                    if nxt is not None:
                        running.add(pool.submit(_make, (nxt, cfg, threads)))
        save_manifest(proxy_dir, manifest)
    total = sum(int(e.get("bytes") or 0) for e in items.values())
    log.info("stage: %d made, %d failed; %d proxies, %.1f GB", staged, failed, len(items), total / 1e9)
    return {"staged": staged, "current": fresh, "offline": offline, "failed": failed,
            "proxies": len(items), "bytes": total}
