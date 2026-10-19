"""Stage 5: reels in three length classes. Per event (thin consecutive days merged into a trip):

  short   7-15 s, several per event, each opening on a different shot with a different hook; the
          first short also gets a B version (another opening) for an A/B trial
  medium  30-60 s, one or two per event with an energy arc
  long    60 s-3 min, one recap per trip (consecutive days at one place) or big event

A story pass picks the format, the shots, cuts, transitions and speed changes and a licensed
track; snap() holds the plan to the hard rules (beat grid, length, clip bounds, the first second
moves, every still moves, at most one bordered 'fit' shot, few and motivated transitions); ffmpeg
renders it; automatic checks (prechecks.py, when present) and a per-class critic watch the result
and revise up to three times, else it waits in reels/_needs-attention/.

Outputs (cfg.output_dir / "reels"), one folder per event, <name> = <event>__<class>-NN (a B
version: ...-NNb):
  <event>/<name>.mp4, .caption.txt, .jpg (cover)   shipped
  _review/<event>/<name>.*            shipped, but the event matches `review_events` (other people)
  _needs-attention/<event>/<name>.*   the critic never passed it, or it could not get music
Each reel is a store row keyed <name>, so a stopped run resumes where it left off.
"""
from __future__ import annotations

import errno
import hashlib
import inspect
import logging
import math
import os
import re
import shutil
import threading
import time
import uuid
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from . import media, music, render
from .config import REEL_CLASSES, Config
from .judge import Backend, JudgeError, JudgeTask
from .models import (Asset, Critique, Curation, Metrics, MusicChoice, Point, ReelPlan, ReelSet, Score, Shot)
from .store import Store

log = logging.getLogger(__name__)
MIN_KEEPERS = 4      # an event needs this many usable shots to make a reel
MAX_OPTIONS = 30     # candidates shown to a short's story pass, best first
OPTIONS = {"short": MAX_OPTIONS, "medium": 48, "long": 90}   # candidates per class
SHEET_CHUNK = 30     # candidates per contact sheet image
CRITIC_ROUNDS = 3    # revisions before a failing reel is set aside for a human
HOOK_SECONDS = 2.0   # the opening gets its own, denser look
MIN_SHOT_S = 0.5     # with music: no shot shorter than this, whatever the tempo
MAX_SHOT_S = 6.0     # Shot.duration_s upper bound
MIN_SPEED = 0.35     # speed ramps stay gentle: never slower than this
SCENE_PAIR_S = 600   # "the shot vs the scene": a clip and a still of the same spot within 10 min
FIT_NOT_BEFORE_S = 3.0   # no bordered (fit) shot in the first seconds...
FIT_MAX_SHARE = 0.2      # ...nor for more than this share of the reel, and at most one
VIDEO_KINDS = ("video", "video360", "sequence")
STILL_KINDS = ("photo", "photo360")
WHIPS = ("whip-left", "whip-right", "zoom-in")
NO_MUSIC = "no music library"
NIGHT = re.compile(r"night|astro|star|milky|aurora|dark", re.I)
SHOTS = {"short": "8-16", "medium": "15-35", "long": "30-80"}

# How many reels of a class the material allows: at least GATE keepers, and one reel per
# PER_REEL keepers at most (a short needs ~8 shots, a medium ~20, a long ~45; overlap is fine). A short
# needs 8 distinct keepers: from fewer, its 8-16 shots repeat assets and the critic fails it every round.
GATE = {"short": 8, "medium": 12, "long": 30}
VARIANT_MIN_KEEPERS = 12   # the B version of short-01 only where the event can fill two different shorts
PER_REEL = {"short": 4, "medium": 12, "long": 30}


# --------------------------------------------------------------------------- events and trips


def merge_trips(groups: dict[str, list[tuple[Asset, Score]]]) -> dict[str, list[tuple[Asset, Score]]]:
    """Days too thin for a reel on their own join consecutive days with the same place and event
    (a road trip filmed a few clips a day becomes one reel, keyed 'first..last_Place_Event')."""
    out, thin = {}, defaultdict(list)
    for key, items in groups.items():
        day, _, rest = key.partition("_")
        if len(items) >= MIN_KEEPERS or not rest or "xx" in day:
            out[key] = items
        else:
            thin[rest].append((day, items))
    for rest, days in thin.items():
        days.sort()
        run = [days[0]]
        for day, items in days[1:]:
            prev = datetime.strptime(run[-1][0], "%Y-%m-%d")
            if (datetime.strptime(day, "%Y-%m-%d") - prev).days <= 2:
                run.append((day, items))
                continue
            out[_run_key(run, rest)] = [x for _, it in run for x in it]
            run = [(day, items)]
        out[_run_key(run, rest)] = [x for _, it in run for x in it]
    return out


def _run_key(run: list, rest: str) -> str:
    first, last = run[0][0], run[-1][0]
    return f"{first}_{rest}" if first == last else f"{first}..{last[5:]}_{rest}"


_SPAN = re.compile(r"^(\d{4})-(\d{2}-\d{2})(?:\.\.(\d{2}-\d{2}))?_(.+)$")


def day_span(key: str) -> tuple[datetime, datetime, str] | None:
    """(first day, last day, place/event part) of an event key such as '2026-10-04_Place' or
    '2026-10-04..10-07_Place_Event'; None for keys without a known date."""
    m = _SPAN.match(key)
    if not m:
        return None
    year, first, last, rest = m.groups()
    try:
        a = datetime.strptime(f"{year}-{first}", "%Y-%m-%d")
        b = datetime.strptime(f"{year}-{last or first}", "%Y-%m-%d")
    except ValueError:
        return None
    if b < a:                                           # a trip over new year
        b = b.replace(year=b.year + 1)
    return a, b, rest


def trip_groups(keys: list[str]) -> dict[str, list[str]]:
    """Events on consecutive days (gaps of at most two days) with the same place and event label
    form one trip, keyed 'first..last_Place[_Event]'; a lone event is a trip of its own key.
    Long reels are made per trip, so a multi-day trip gets one recap rather than one a day."""
    out: dict[str, list[str]] = {}
    by_rest: dict[str, list[tuple[datetime, datetime, str]]] = defaultdict(list)
    for k in keys:
        span = day_span(k)
        if span is None:
            out[k] = [k]
        else:
            by_rest[span[2]].append((span[0], span[1], k))

    def flush(run: list[tuple[datetime, datetime, str]], rest: str) -> None:
        if len(run) == 1:
            out[run[0][2]] = [run[0][2]]
            return
        first, last = run[0][0], max(r[1] for r in run)
        out[f"{first:%Y-%m-%d}..{last:%m-%d}_{rest}"] = [r[2] for r in run]

    for rest, items in by_rest.items():
        items.sort()
        run = [items[0]]
        for it in items[1:]:
            if (it[0] - max(r[1] for r in run)).days <= 2:
                run.append(it)
            else:
                flush(run, rest)
                run = [it]
        flush(run, rest)
    return out


def _when(a: Asset) -> datetime | None:
    t = a.taken_at or a.clock_time
    return t.replace(tzinfo=None) if t else None


def event_pool(store: Store, assets: list[Asset]) -> dict[str, list[tuple[Asset, Score]]]:
    """Every keeper per event (thin days merged), best first; frames the curator dropped as
    near-repeats of a better frame go to the end, so they are offered only when nothing else is."""
    dropped: set[str] = set()
    for _, c in store.all("curation", Curation):
        dropped |= set(c.drop)
    by_event: dict[str, list[tuple[Asset, Score]]] = defaultdict(list)
    for a in assets:
        s = store.get("scores", a.id, Score)
        if s and s.keep and s.role != "skip" and a.event_key:
            by_event[a.event_key].append((a, s))
    return {k: sorted(v, key=lambda x: (x[0].id in dropped, -x[1].score))
            for k, v in merge_trips(by_event).items() if len(v) >= MIN_KEEPERS}


def options_for(store: Store, assets: list[Asset]) -> dict[str, list[tuple[Asset, Score]]]:
    """The candidates of each event's (first) short: its best MAX_OPTIONS keepers."""
    return {k: v[:MAX_OPTIONS] for k, v in event_pool(store, assets).items()}


def pick_options(items: list[tuple[Asset, Score]], length_class: str) -> list[tuple[Asset, Score]]:
    """The candidates a story pass sees. `items` are best first. A short gets the best
    OPTIONS["short"], best first. Medium and long reels travel through the event, so they get the
    best of every stretch of it (the timeline cut into equal parts, each filling its share by
    rank, leftovers going to the best of the rest), listed in the order they were shot."""
    n = OPTIONS[length_class]
    if length_class == "short":
        return items[:n]
    if len(items) > n:
        rank = {id(x): i for i, x in enumerate(items)}
        timed = sorted(items, key=lambda x: (_when(x[0]) is None, _when(x[0]) or datetime.min, rank[id(x)]))
        parts = 6 if length_class == "medium" else 10
        size = math.ceil(len(timed) / parts)
        chosen: list = []
        for p in range(parts):
            chunk = sorted(timed[p * size:(p + 1) * size], key=lambda x: rank[id(x)])
            chosen += chunk[: n // parts]
        taken = {id(x) for x in chosen}
        chosen += [x for x in items if id(x) not in taken][: n - len(chosen)]
        items = chosen
    return sorted(items, key=lambda x: (_when(x[0]) is None, _when(x[0]) or datetime.min))


# --------------------------------------------------------------------------- the mix


AUTO_MAX_SHORTS = 4


@dataclass(frozen=True)
class Mix:
    """How many reels of each class to make per event (long: per trip). None = automatic, scaled
    by the event's keepers (short: one per 8, 1-4; medium: one from 16, two from 60; long: one
    from 40). A number asks for up to that many where the material allows (a class needs GATE
    keepers and gets at most one reel per PER_REEL keepers: no long reel from 15 keepers).
    variants: the event's first short also gets a B version with another opening (A/B trial)."""
    short: int | None = None
    medium: int | None = None
    long: int | None = None
    variants: bool = True

    @classmethod
    def parse(cls, text: str) -> "Mix":
        """'short=3,medium=1,long=0' (or '3,1,0'; 'auto' or '' for a class keeps it automatic;
        'variants=0' turns the B versions off)."""
        kw: dict = {}
        parts = [p.strip() for p in (text or "").split(",") if p.strip()]
        for i, part in enumerate(parts):
            name, _, value = part.rpartition("=")
            name = name.strip().lower() or (REEL_CLASSES[i] if i < len(REEL_CLASSES) else "")
            value = value.strip().lower()
            if name == "variants":
                kw["variants"] = value not in ("0", "false", "no", "off")
            elif name in REEL_CLASSES:
                kw[name] = None if value in ("", "auto") else max(0, int(value))
            else:
                raise ValueError(f"unknown reel mix part {part!r}; use short=N,medium=N,long=N")
        return cls(**kw)

    def count(self, length_class: str, keepers: int) -> int:
        if keepers < GATE[length_class]:
            return 0
        room = max(1, keepers // PER_REEL[length_class])
        n = getattr(self, length_class)
        if n is None:
            n = auto_count(length_class, keepers)
        return max(0, min(int(n), room))


def auto_count(length_class: str, keepers: int) -> int:
    if length_class == "short":
        return 0 if keepers < MIN_KEEPERS else min(AUTO_MAX_SHORTS, max(1, keepers // 8))
    if length_class == "medium":
        return 0 if keepers < 16 else 2 if keepers >= 60 else 1
    return 1 if keepers >= 40 else 0


def reel_name(group: str, length_class: str, index: int, variant: str = "") -> str:
    """Store key and file name of one reel: '<event>__short-01', a B version '<event>__short-01b'."""
    return f"{group}__{length_class}-{index:02d}{variant}"


_NAME = re.compile(r"^(?P<group>.+)__(?P<cls>short|medium|long)-(?P<index>\d+)(?P<variant>[a-z]?)$")


def parse_name(name: str) -> tuple[str, str, int, str]:
    """(group, class, index, variant) of a reel name; a key from before classes is short-01."""
    m = _NAME.match(name)
    if not m:
        return name, "short", 1, ""
    return m["group"], m["cls"], int(m["index"]), m["variant"]


@dataclass(frozen=True)
class Job:
    group: str                      # the event (short, medium) or trip (long) key
    length_class: str
    index: int
    variant: str = ""               # "b": the A/B version of index 1
    events: tuple[str, ...] = ()    # the events whose keepers it draws on

    @property
    def name(self) -> str:
        return reel_name(self.group, self.length_class, self.index, self.variant)


def plan_jobs(pool: dict[str, list], mix: Mix) -> list[list[Job]]:
    """The reels to make, as independent units of work, each planned by one story pass (the main
    edit first, then the cut-downs derived from it): per event its long reel when the event is a
    trip of its own, its mediums, its shorts (the first one's B version right after it); per
    multi-day trip its long reels. Units come richest first (most keepers, then by key), so the
    events with the most material are made before the thin ones."""
    ranked: list[tuple[int, str, list[Job]]] = []
    trips = trip_groups(list(pool))
    for key in sorted(pool):
        n, unit = len(pool[key]), []
        if trips.get(key) == [key]:
            unit += [Job(key, "long", i, events=(key,)) for i in range(1, mix.count("long", n) + 1)]
        unit += [Job(key, "medium", i, events=(key,)) for i in range(1, mix.count("medium", n) + 1)]
        for i in range(1, mix.count("short", n) + 1):
            unit.append(Job(key, "short", i, events=(key,)))
            if i == 1 and mix.variants and n >= VARIANT_MIN_KEEPERS:
                unit.append(Job(key, "short", 1, "b", events=(key,)))
        if unit:
            ranked.append((n, key, unit))
    for trip, events in sorted(trips.items()):
        if events == [trip]:
            continue
        n = sum(len(pool[e]) for e in events)
        longs = [Job(trip, "long", i, events=tuple(events)) for i in range(1, mix.count("long", n) + 1)]
        if longs:
            ranked.append((n, trip, longs))
    return [u for _, _, u in sorted(ranked, key=lambda r: (-r[0], r[1]))]


# --------------------------------------------------------------------------- what the story pass sees


def sheet(images: list[Path], labels: list[str], cols: int = 6, cell: int = 300) -> Image.Image:
    rows = math.ceil(len(images) / cols)
    out = Image.new("RGB", (cols * cell, rows * (cell + 24)), "white")
    draw = ImageDraw.Draw(out)
    for i, (p, label) in enumerate(zip(images, labels)):
        im = Image.open(p).convert("RGB")
        im.thumbnail((cell, cell))
        x, y = (i % cols) * cell, (i // cols) * (cell + 24)
        out.paste(im, (x + (cell - im.width) // 2, y + (cell - im.height) // 2))
        draw.text((x + 6, y + cell + 4), label, fill="black")
    return out


def _sheets(opts: list[tuple[Asset, Score]], cfg: Config, work: Path) -> list[Path]:
    previews = [media.preview_image(a, cfg) for a, _ in opts]
    out = []
    for k in range(0, max(1, len(previews)), SHEET_CHUNK):
        path = work / ("candidates.jpg" if len(previews) <= SHEET_CHUNK else f"candidates-{k // SHEET_CHUNK + 1}.jpg")
        part = previews[k:k + SHEET_CHUNK]
        sheet(part, [f"#{i}" for i in range(k, k + len(part))]).save(path, quality=85)
        out.append(path)
    return out


def source_for(a: Asset, store: Store, cfg: Config | None = None, shot: Shot | None = None) -> dict:
    if a.kind == "sequence":    # timelapse / stop-motion: the rendered clip, or its sharpest frame (needs cfg)
        from . import sequences
        if cfg is None:
            raise ValueError(f"sequence {a.id}: source_for needs cfg to render the clip")
        keep = shot is not None and (shot.layout == "fit" or shot.focus_to is not None)
        return sequences.reel_source(a, store, cfg, keep_aspect=keep)
    edit = store.get("edits", a.id)
    if a.kind == "photo" and edit and edit.get("status") == "shipped":
        return {"kind": "photo", "path": edit["full"]}
    if a.kind in ("video", "video360"):
        return {"kind": a.kind, "path": a.preview}
    return {"kind": a.kind, "path": _ffmpeg_readable(a.preview or a.raw, cfg)}


def _move_across(src: Path, dst: Path) -> None:
    """Move a finished file into place, also from the state disk to an output drive: a rename
    cannot cross drives (EXDEV), so it is copied next to its destination and renamed there, which
    keeps the arrival atomic."""
    try:
        os.replace(src, dst)
    except OSError as e:
        if e.errno != errno.EXDEV:
            raise
        tmp = dst.with_name(f".{dst.name}.{uuid.uuid4().hex[:8]}")
        shutil.copyfile(src, tmp)
        os.replace(tmp, dst)
        src.unlink(missing_ok=True)


def _ffmpeg_readable(path: str | None, cfg: Config | None) -> str | None:
    """An Insta360 .insp is a JPEG, but ffmpeg refuses the extension ("Operation not permitted"):
    hand it a .jpg-named link to the same file instead."""
    if not path or cfg is None or Path(path).suffix.lower() != ".insp":
        return path
    link = cfg.state_dir / "links" / (Path(path).stem + ".jpg")
    if not link.exists():
        link.parent.mkdir(parents=True, exist_ok=True)
        try:
            link.symlink_to(path)
        except FileExistsError:
            pass
    return str(link)


def _dims(a: Asset, cfg: Config | None) -> tuple[int, int] | None:
    if cfg is None or a.kind.endswith("360"):
        return None
    try:
        if a.kind == "video":
            info = media.probe(a.preview, cfg)
            return info.get("width") or None, info.get("height") or None
        if a.kind == "photo":
            with Image.open(media.preview_image(a, cfg)) as im:
                return im.size
    except Exception:
        return None
    return None


def aspect_of(a: Asset, cfg: Config | None) -> float | None:
    d = _dims(a, cfg)
    return d[0] / d[1] if d and d[0] and d[1] else None


def shape(a: Asset, cfg: Config | None) -> str:
    """'landscape 3:2', 'portrait 4:5', '16:9'... so the story pass knows what a 9:16 crop would cost."""
    r = aspect_of(a, cfg)
    if not r:
        return ""
    named = min(((3 / 2, "3:2"), (16 / 9, "16:9"), (4 / 3, "4:3"), (1, "1:1"), (2 / 3, "2:3"), (4 / 5, "4:5"),
                 (3 / 4, "3:4"), (9 / 16, "9:16")), key=lambda x: abs(x[0] - r))[1]
    kind = "landscape" if r > 1.05 else "portrait" if r < 0.95 else "square"
    return f", {kind} {named}"


def _fps(a: Asset, cfg: Config | None) -> float | None:
    if cfg is None or a.kind not in ("video", "video360") or not a.preview:
        return None
    try:
        return float(media.probe(a.preview, cfg).get("fps") or 0) or None
    except Exception:
        return None


def candidate_notes(opts: list[tuple[Asset, Score]], store: Store) -> dict[str, list[str]]:
    """What formats each candidate allows: 'before/after' (it has a shipped RAW edit and the
    camera's own JPEG) and 'the shot vs the scene' pairs (a clip and a still from another camera
    within 10 minutes of each other)."""
    idx = {a.id: i for i, (a, _) in enumerate(opts)}
    notes: dict[str, list[str]] = defaultdict(list)
    for a, _ in opts:
        e = store.get("edits", a.id)
        if (a.kind == "photo" and e and e.get("status") == "shipped" and e.get("full") and a.preview
                and str(a.preview) != str(e["full"])):
            notes[a.id].append("before/after available")
    clips = [(a, _when(a)) for a, _ in opts if a.kind in ("video", "video360") and _when(a)]
    stills = [(a, _when(a)) for a, _ in opts if a.kind == "photo" and _when(a)]
    for c, tc in clips:
        near = sorted((abs((ts - tc).total_seconds()), s.id, s, ts) for s, ts in stills
                      if s.camera != c.camera and abs((ts - tc).total_seconds()) <= SCENE_PAIR_S)
        for _, _, s, ts in near[:3]:
            mins = round((ts - tc).total_seconds() / 60)
            notes[c.id].append(f"scene: #{idx[s.id]} ({mins:+d} min)")
            notes[s.id].append(f"the shot of it: #{idx[c.id]}")
    return dict(notes)


def listing(opts: list[tuple[Asset, Score]], cfg: Config | None = None,
            notes: dict[str, list[str]] | None = None) -> str:
    days = {t.date() for a, _ in opts if (t := _when(a))}
    lines = []
    for i, (a, s) in enumerate(opts):
        extra = shape(a, cfg)
        if a.kind.startswith("video"):
            fps = _fps(a, cfg)
            extra = (f", clip {a.duration_s or 0:.1f}s" + (f" at {fps:.0f} fps" if fps else "")
                     + f", best {s.best_in_s}-{s.best_out_s}s")
        if a.kind.endswith("360"):
            extra += f", look yaw {s.view_yaw_deg}"
        if a.kind == "sequence":
            extra += f", {s.sequence_style or 'sequence'} clip" if s.sequence_style in ("timelapse", "stop-motion") \
                else ", a still (sharpest frame of a sequence)"
        t = _when(a)
        when = f", at {t:%m-%d %H:%M}" if t and len(days) > 1 else f", at {t:%H:%M}" if t else ""
        more = "; " + "; ".join(notes[a.id]) if notes and notes.get(a.id) else ""
        lines.append(f"#{i} id={a.id} {a.kind}, score {s.score:.1f}, role {s.role}, {s.subject}, mood {s.mood}"
                     f"{when}, focus ({s.vertical_focus.x:.2f},{s.vertical_focus.y:.2f}){extra}{more}")
    return "\n".join(lines)


FORMATS = (
    "Formats (set `format`): 'photo-dump' - stills cut on every beat or every other beat with one hero hold; "
    "'shot-vs-scene' - a clip of the photographer at a spot cut on a beat to the finished still from there "
    "(pairs marked 'scene:'); 'before-after' - the camera's own JPEG then the RAW edit of the same frame "
    "(marked 'before/after available'): two shots of that id, version 'camera' then version 'edit' arriving "
    "with transition 'wipe', same focus, the zoom continuing (1.00->1.04 then 1.04->1.08), 7-12 s; "
    "'day-to-night' - one place from golden hour through blue hour to stars (medium); 'road-trip' - driving "
    "clips sped up with ramps into the stops (long, or a 15 s cut-down); 'city-night' - a montage on the "
    "beat, one spot after another; '360-moves' - 360 shots: view 'tiny-planet' as opener or closer, a spin "
    "(view_yaw_to) as a transition; 'awe-loop' - one place, 2-4 shots, 7-10 s, seamless loop; 'story' - "
    "hook, place, moments, payoff; 'recap' - a trip in chapters (long).")

CLASS_GUIDE = {
    "short": (
        "Pacing: cut on every beat or every other beat - stills about 0.5-0.8 s, clips 0.8-1.5 s, one hero "
        "hold of about 2 s that moves. One clear idea."),
    "medium": (
        "Pacing: an energy arc - a fast open (the hook and 3-4 quick cuts), a slower core with longer holds "
        "(2-4 s, a breath), a fast close into the loop. Pace by contrast: wide against detail, motion "
        "against stillness. No run of near-identical shots; the middle must hold attention."),
    "long": (
        "Pacing: three acts - drop in (a cold-open hook from the trip's strongest moving shots), build "
        "through contrasting moments in chapters (by day, place or time of day, each opening with a sense "
        "of place), payoff. Re-hook about every 20 s (a striking shot or a change of pace); change pace "
        "between chapters; no sag in the middle third - it needs shots as strong as the opening. Clips and "
        "timelapses carry it where the event has them; stills are accents. dip-black only between "
        "chapters."),
}

HARD_RULES = (
    "Hard rules (automatic checks and the critic fail a reel that breaks them): "
    "1) The first second MOVES: shot 1 is a clip, a speed ramp, a 360 spin or a still with a real pan "
    "(focus_to well away from focus), or shot 2 arrives by a whip inside the first second. A still with a "
    "gentle push-in is not a hook; no fade from black, no title card. "
    "2) Nothing static: something changes at least every ~1.5 s, and every still moves (a push-in or "
    "pull-out of at least 1.00->1.06, or a pan). "
    "3) No borders: layout 'fit' at most once, never in the first 3 s, never more than 20% of the reel. For a "
    "wide frame prefer a slow full-bleed pan (focus_to) over a tighter crop on the subject over another shot. "
    "4) Never crop the subject: faces, buildings, a road's curve, a summit stay inside the centre 80% of the "
    "9:16 frame (and out of the top and bottom 15%). "
    "5) Loop: the last shot cuts cleanly back to the first (matching motion, colour or composition). "
    "6) Transitions: hard cuts on the beat, except on motion moments: whip-left/whip-right between two fast "
    "moves or to hide a speed ramp's cut, zoom-in through to a new place, crossfade for a change of time or "
    "mood, dip-black only between chapters of a long reel, wipe only for a before/after. Never two in a row; "
    "at most one in four cuts. "
    "7) Speed (clips only): 1 normal; slow motion 0.35-0.5 for a peak moment (clean on clips shot at 60 fps "
    "or more); 1.5-3 to compress a walk or a drive; a ramp with speed_to (1.0 -> 0.4 into the moment, 2.0 "
    "-> 1.0 arriving at a stop), gentle, never below 0.35. ")


def _length_rules(cfg: Config, length_class: str) -> str:
    floor, target, cap = cfg.reel_length(length_class)
    return (f"Length: about {target:g} s, between {floor:g} and {cap:g} s, {SHOTS[length_class]} shots "
            "(a long clip may give several shots at different start_s). ")


def _earlier_text(earlier: list[dict], opts: list[tuple[Asset, Score]]) -> str:
    if not earlier:
        return ""
    idx = {a.id: i for i, (a, _) in enumerate(opts)}

    def ref(i: str | None) -> str:
        return f"#{idx[i]} (id={i})" if i in idx else f"id={i}"
    lines = [f"- {e['name']} ({e.get('format') or 'story'}, '{e.get('title') or ''}'): opens with "
             f"{ref(e.get('opening'))}, then {', '.join(ref(x) for x in e.get('next', []))}" for e in earlier]
    return ("Reels already made from this event:\n" + "\n".join(lines) + "\n"
            "Open with a different shot than every one of these, with a different hook, and take another angle "
            "on the event (one moment, the light, the people, a detail series, a time of day, a format they "
            "did not use) rather than retelling it.\n\n")


def _timing(cfg: Config, length_class: str, tracks: dict[str, music.Track] | None,
            used: dict[str, int] | None) -> str:
    floor, target, cap = cfg.reel_length(length_class)
    if tracks:
        return (
            "Music: pick the track for this reel from the licensed library below (id, title, tempo, beat "
            "length, energy, tone and key, mood, length, suggested start, licence). Set music.track_id to its "
            "id and music.start_s to its listed start. Match the track's energy and mood to the footage; "
            f"when two fit equally, prefer the one used less.\n"
            f"{music.listing(tracks, cap if length_class == 'short' else target, used)}\n\n"
            "Give shot durations in seconds, roughly whole numbers of the chosen track's beats: every cut is "
            "moved onto that track's nearest beat and the reel ends on a bar line; a transition is centred on "
            "its cut. ")
    return (f"Shot durations are multiples of {cfg.beat_seconds:g} s (the beat grid; music is added later, so "
            "music is null). ")


def story_task(key: str, opts: list[tuple[Asset, Score]], cfg: Config, sheet_path: Path | list[Path],
               tracks: dict[str, music.Track] | None = None, used: dict[str, int] | None = None, *,
               length_class: str = "short", earlier: list[dict] | None = None,
               notes: dict[str, list[str]] | None = None) -> JudgeTask:
    sheets = [sheet_path] if isinstance(sheet_path, (str, Path)) else list(sheet_path)
    which = "images show" if len(sheets) > 1 else "image shows"
    return JudgeTask(
        key=f"story:{key}", output=ReelPlan, images=sheets, effort="high",
        max_tokens=32000 if length_class == "long" else 16000,
        instructions=(
            f"Build one {length_class} Instagram reel (length_class '{length_class}') for the event '{key}'. The "
            f"{which} the candidates, labelled #n. Candidates:\n{listing(opts, cfg, notes)}\n\n"
            + _earlier_text(earlier or [], opts) + FORMATS + "\n\n" + CLASS_GUIDE[length_class] + " "
            + _length_rules(cfg, length_class) + "\n\n" + HARD_RULES + "\n\n"
            + _timing(cfg, length_class, tracks, used) + "Follow the style guide's reel rules. "
            + TRANSITIONS_NOTE + "\n\n"
            "Use the candidate ids exactly. For videos set start_s inside the clip (use the best stretch); for "
            "stills start_s is 0. focus is the centre of the 9:16 crop. Set view_yaw_deg for 360 items. A 9:16 "
            "crop keeps only about a third of a landscape frame's width: when the subject or the composition "
            "spans the width (a building, a skyline, a road curve), don't crop it off - pan across it with "
            "focus_to (the crop travels across the frame over the shot, e.g. left third to right third), or, "
            "once at most and not in the first 3 s, use layout 'fit'. Portrait frames and tight details suit "
            "'fill'. Pick cover_asset_id from the shots used: the frame that reads best as a grid tile (the "
            "centre 3:4 of the 9:16), subject clear. Write the caption by the style guide."))


def variant_task(key: str, base: ReelPlan, opts: list[tuple[Asset, Score]], cfg: Config, sheets: list[Path],
                 notes: dict[str, list[str]] | None = None) -> JudgeTask:
    """The B version of a shipped short: the same reel with another opening, for an A/B trial."""
    idx = {a.id: i for i, (a, _) in enumerate(opts)}
    first = base.shots[0].asset_id if base.shots else ""
    return JudgeTask(
        key=f"variant:{key}", output=ReelPlan, images=sheets, effort="high", max_tokens=16000,
        instructions=(
            "This reel shipped. Make its B version for an A/B test (Instagram's trial reels show it to "
            "non-followers; the better opening wins): keep the body, the music (same track_id and start_s), the "
            "length, the format and the caption's idea, but open with a different first shot than "
            f"#{idx.get(first, '?')} (id={first}) and a different hook - the most kinetic clip, a whip into the "
            "hero, a before/after flash, a detail that makes people ask where. Change only the first one to "
            "three shots and what keeping the timing needs. A different first caption line is welcome.\n"
            f"The A version: {base.model_dump_json()}\n\nCandidates:\n{listing(opts, cfg, notes)}\n\n"
            + HARD_RULES + "\nUse the candidate ids exactly."))


TRANSITIONS_NOTE = (
    "Transitions: set them only where the story needs one (a before/after 'wipe', a 'dip-black' between chapters "
    "of a long reel); every other cut is chosen later by a transition director from measurements of the rendered "
    "shots (motion, brightness, similarity at each cut), so leave those 'cut'.")


SLOT_ROLES = {
    "main": ("the MAIN EDIT of the event: the whole story at this length; the other slots are cut down from "
             "it"),
    "cut": ("a cut-down derived from the main edit: its strongest moments re-cut to this length and pace, with a "
            "hook of its own (not a trim of the main edit's first seconds)"),
    "short": ("a short with its own hook: it opens on a different shot than every other short in this set and "
              "takes another angle (one moment, the light, a detail series, a format the others don't use)"),
}


def slot_name(job_name: str) -> str:
    """'short-01b' for '<event>__short-01b'."""
    return job_name.rpartition("__")[2]


def bundle_task(key: str, opts: list[tuple[Asset, Score]], cfg: Config, sheets: list[Path],
                slots: list[tuple[str, str, str]], tracks: dict[str, music.Track] | None = None,
                used: dict[str, int] | None = None, *, earlier: list[dict] | None = None,
                notes: dict[str, list[str]] | None = None) -> JudgeTask:
    """ONE creative pass for several reels of an event: the main edit (the first slot) and the
    cut-downs derived from it, each a complete plan. slots: (slot name, length class, role), the
    role 'main', 'cut', 'short' or 'variant:<slot>' (the B version of that slot, for an A/B trial)."""
    lines, classes = [], []
    for name, cls, role in slots:
        floor, target, cap = cfg.reel_length(cls)
        if role.startswith("variant:"):
            what = (f"the B version of '{role[8:]}' for an A/B trial (Instagram's trial reels): the same body, "
                    "music (track and start), length and format, but a different first shot and a different hook")
        else:
            what = SLOT_ROLES.get(role, SLOT_ROLES["cut"])
        lines.append(f"- '{name}': {cls}, about {target:g} s ({floor:g}-{cap:g} s, {SHOTS[cls]} shots) - {what}")
        if cls not in classes:
            classes.append(cls)
    main_cls = slots[0][1] if slots else "short"
    timing = _timing(cfg, main_cls, tracks, used)
    if tracks:
        timing += ("Each plan picks its own track (a medium or long reel needs one at least as long as the reel; "
                   "cut-downs may share the main edit's track). ")
    return JudgeTask(
        key=f"bundle:{key}", output=ReelSet, images=sheets, effort="high",
        max_tokens=64000 if "long" in classes else 32000,
        instructions=(
            f"Plan {len(slots)} Instagram reels for the event '{key}' in one go, each a complete plan. The images "
            f"show the candidates, labelled #n. Candidates:\n{listing(opts, cfg, notes)}\n\n"
            "Slots (return one plan per slot, in this order, with plan.length_class set to the slot's class):\n"
            + "\n".join(lines) + "\n\n"
            + _earlier_text(earlier or [], opts) + FORMATS + "\n\n"
            + "\n".join(f"{c}: {CLASS_GUIDE[c]}" for c in classes) + "\n\n" + HARD_RULES + "\n\n" + timing
            + "Follow the style guide's reel rules. " + TRANSITIONS_NOTE + "\n\n"
            "Use the candidate ids exactly. For videos set start_s inside the clip (use the best stretch); for "
            "stills start_s is 0. focus is the centre of the 9:16 crop. Set view_yaw_deg for 360 items. A 9:16 "
            "crop keeps only about a third of a landscape frame's width: when the subject or the composition "
            "spans the width, pan across it with focus_to, or, once at most and not in the first 3 s, use layout "
            "'fit'. Each plan picks its cover_asset_id from its own shots (the frame that reads best as a grid "
            "tile: the centre 3:4 of the 9:16) and has its own caption by the style guide (a short's caption "
            "fits its own angle)."))


def fix_task(key: str, plan: ReelPlan, facts: str, opts: list[tuple[Asset, Score]], cfg: Config,
             sheets: list[Path], notes: dict[str, list[str]] | None = None) -> JudgeTask:
    """A revision from measured facts alone (automatic checks failed): no critic call is spent on
    a reel that is not technically fit to post."""
    floor, target, cap = cfg.reel_length(plan.length_class)
    return JudgeTask(
        key=f"fix:{key}", output=ReelPlan, images=sheets, effort="medium", max_tokens=32000,
        instructions=(
            f"Automatic checks failed this {plan.length_class} reel ({floor:g}-{cap:g} s). These are measured "
            f"facts, not opinions:\n{facts}\n\nRevise the plan so that every one is fixed, and keep everything that "
            "is not part of the problem (the story, the music track and start, the caption, length_class). "
            f"The plan:\n{plan.model_dump_json()}\n\nCandidates (the images show them, labelled #n):\n"
            f"{listing(opts, cfg, notes)}\n\n" + HARD_RULES + "\nUse the candidate ids exactly."))


# --------------------------------------------------------------------------- holding the plan to the rules


def _mean_speed(s: Shot) -> float:
    return s.speed if s.speed_to is None else (s.speed + s.speed_to) / 2


def _clamp_start(s: Shot, a: Asset, d: float) -> float:
    start = s.start_s
    if a.duration_s:
        need = d * (_mean_speed(s) if a.kind in VIDEO_KINDS else 1.0)
        start = min(max(0.0, start), max(0.0, a.duration_s - need))
    return start


def _fit_clip(s: Shot, a: Asset, d: float) -> Shot:
    """A shot of d seconds: its start inside the clip, and a speed-up slowed (never below 1x)
    when the clip has too little footage for it."""
    upd: dict = {"duration_s": d}
    if a.kind in VIDEO_KINDS and a.duration_s and _mean_speed(s) > 1 and d * _mean_speed(s) > a.duration_s:
        f = max(a.duration_s / (d * _mean_speed(s)), 1 / _mean_speed(s))
        upd["speed"] = max(1.0, round(s.speed * f, 3))
        if s.speed_to is not None:
            upd["speed_to"] = max(1.0, round(s.speed_to * f, 3))
    s = s.model_copy(update=upd)
    return s.model_copy(update={"start_s": _clamp_start(s, a, d)})


def _speeds(s: Shot, a: Asset) -> Shot:
    if a.kind not in VIDEO_KINDS:
        return s.model_copy(update={"speed": 1.0, "speed_to": None})
    sp = min(max(float(s.speed), MIN_SPEED), 4.0)
    to = None if s.speed_to is None else min(max(float(s.speed_to), MIN_SPEED), 4.0)
    if to is not None and abs(to - sp) < 0.05:
        to = None
    return s.model_copy(update={"speed": sp, "speed_to": to})


def _before_after(kept: list[tuple[Shot, Asset]], editable: set[str] | None) -> list[tuple[Shot, Asset]]:
    """A 'camera' version needs a shipped edit to reveal (else it would repeat the next shot):
    without one the shot is dropped."""
    out = []
    for s, a in kept:
        if s.version == "camera" and (a.kind != "photo" or (editable is not None and a.id not in editable)):
            continue
        out.append((s, a))
    return out


def _fixed_grid(kept: list[tuple[Shot, Asset]], cfg: Config, limit: float | None = None) -> list[Shot]:
    beat, shots, total = cfg.beat_seconds, [], 0.0
    limit = cfg.reel_cap("short") if limit is None else limit
    for s, a in kept:
        d = max(beat, round(s.duration_s / beat) * beat)
        if total + d > limit + 1e-6:
            d = math.floor((limit - total) / beat + 1e-9) * beat
            if d < beat:
                break
        shots.append(_fit_clip(s, a, d))
        total += d
    return shots


def window_length(plan: ReelPlan, cfg: Config) -> float:
    """How much music a reel needs: a short's cap (it may run that long); a medium or long reel
    its planned length, inside its class's floor and cap."""
    floor, _, cap = cfg.reel_length(plan.length_class)
    if plan.length_class == "short":
        return cap
    return min(cap, max(floor, sum(s.duration_s for s in plan.shots)))


def pick_music(plan: ReelPlan, cfg: Config, tracks: dict[str, music.Track]) -> MusicChoice:
    """The plan's track and a start on one of its bar lines with a whole reel after it. A missing
    or unknown track id gets a library track chosen from the event key (stable across runs); a
    start that is not a bar line, or leaves too little music, gets the track's best window."""
    length = window_length(plan, cfg)
    t = tracks.get(plan.music.track_id) if plan.music else None
    start = plan.music.start_s if t is not None else None
    if t is None:
        ids = sorted(tracks)
        t = tracks[ids[int(hashlib.sha1(plan.event_key.encode()).hexdigest(), 16) % len(ids)]]
        log.warning("reel %s: no usable music choice (%s); using %s", plan.event_key,
                    plan.music.track_id if plan.music else "none", t.id)
    if start is not None:
        bar = music.nearest_downbeat(t.info, start)
        ok = bar is not None and abs(bar - start) <= 0.1 and bar + length <= t.info.duration_s - 0.2
        start = bar if ok else None
    if start is None:
        start = music.best_window(t.info, length)
    return MusicChoice(track_id=t.id, start_s=round(start, 4))


def _music_grid(kept: list[tuple[Shot, Asset]], cfg: Config, info: music.TrackInfo, start: float,
                limit_s: float | None = None) -> list[Shot]:
    """Cuts on the track's beats. Each boundary moves to the beat nearest where Claude's duration
    puts it (counted from the previous, already snapped boundary), keeping every shot between
    MIN_SHOT_S and MAX_SHOT_S and the reel within limit_s (default: the short cap); the last cut
    then moves to a bar line when one is within a beat. Boundaries are whole frames, so each
    shot's frame count is exact and cuts stay within half a frame of the beat over the whole reel."""
    fps = render.FPS
    limit_s = cfg.reel_cap("short") if limit_s is None else limit_s
    limit = int(math.floor(limit_s * fps + 1e-6))
    frames = sorted({round(g * fps) for g in music.beat_grid(info, start, limit_s)} - {0})
    frames = [f for f in frames if f <= limit]
    bars = {round(g * fps) for g in music.beat_grid(info, start, limit_s, downbeats_only=True)}
    lo, hi = math.ceil(MIN_SHOT_S * fps - 1e-6), math.floor(MAX_SHOT_S * fps + 1e-6)
    beat_f = info.beat_s * fps
    # a plan that runs to the full length ends on the last bar line, if that is not far back
    last_bar = max((f for f in bars if 0 < f <= limit), default=None)
    if (last_bar is not None and sum(s.duration_s for s, _ in kept) * fps >= limit - beat_f / 2
            and limit - last_bar <= max(beat_f, min(info.beats_per_bar * beat_f, 2.0 * fps)) + 0.5):
        limit = last_bar
        frames = [f for f in frames if f <= limit]
    cuts, prev = [], 0
    for s, a in kept:
        want = prev + s.duration_s * fps
        options = [f for f in frames if lo <= f - prev <= hi]
        if not options:
            break
        end = min(options, key=lambda f: (abs(f - want), f))
        cuts.append([s, a, prev, end])
        prev = end
    if cuts and cuts[-1][3] not in bars:
        s, a, p, end = cuts[-1]
        near = [f for f in bars if lo <= f - p <= hi and f <= limit and abs(f - end) <= beat_f + 0.5]
        if near:
            cuts[-1][3] = min(near, key=lambda f: (abs(f - end), -f))
    return [_fit_clip(s, a, (e - p) / fps) for s, a, p, e in cuts]


def _is_pair(prev: Shot, cur: Shot) -> bool:
    """A before/after reveal: the camera version, then the edit of the same frame."""
    return prev.asset_id == cur.asset_id and prev.version == "camera" and cur.version == "edit"


def _pan_room(aspect: float | None) -> float:
    """How far (in fractions of the frame width) a 9:16 crop can travel across a frame."""
    r = aspect if aspect else 1.5
    return max(0.0, 1.0 - (9 / 16) / r) if r > 9 / 16 else 0.0


def _bleed(s: Shot, aspect: float | None) -> Shot:
    """A border-free stand-in for a fit shot: a slow full-bleed pan across a wide frame (the
    whole width over the shot), else a plain fill."""
    upd: dict = {"layout": "fill"}
    if (aspect or 1.5) > 1.05:
        x = s.focus.x
        upd["focus"] = Point(x=max(0.0, x - 0.3), y=s.focus.y)
        upd["focus_to"] = Point(x=min(1.0, x + 0.3), y=s.focus.y)
    return s.model_copy(update=upd)


def _moves(s: Shot) -> bool:
    if s.view_yaw_to is not None and abs(s.view_yaw_to - (s.view_yaw_deg or 0.0)) >= 10:
        return True
    if s.focus_to is not None and abs(s.focus_to.x - s.focus.x) + abs(s.focus_to.y - s.focus.y) > 1e-6:
        return True
    return abs(s.zoom_to - s.zoom_from) >= 0.06 - 1e-9


def _opens_moving(shots: list[Shot], kinds: list[str]) -> bool:
    s, kind = shots[0], kinds[0]
    if kind in VIDEO_KINDS:
        return True
    if kind == "photo360":
        return (s.view_yaw_to is not None and abs(s.view_yaw_to - (s.view_yaw_deg or 0.0)) >= 20)
    if s.focus_to is not None and abs(s.focus_to.x - s.focus.x) + abs(s.focus_to.y - s.focus.y) >= 0.1:
        return True
    return len(shots) > 1 and s.duration_s <= 1.0 + 1e-9 and shots[1].transition in WHIPS


def _make_opening_move(s: Shot, kind: str, aspect: float | None) -> Shot:
    """The fallback when a plan opens on a still that doesn't move: a pan across it that keeps
    the subject inside the centre 80%, and a stronger push where the frame has little room."""
    if kind == "photo360":
        yaw = s.view_yaw_deg or 0.0
        return s.model_copy(update={"view_yaw_to": yaw + 35.0})
    room = _pan_room(aspect)
    half = min(0.08, room / 2)
    upd: dict = {}
    if half >= 0.03:
        x = min(max(s.focus.x, half), 1 - half)
        upd["focus"] = Point(x=x - half, y=s.focus.y)
        upd["focus_to"] = Point(x=x + half, y=s.focus.y)
    if half < 0.06:
        upd["zoom_from"], upd["zoom_to"] = 1.0, 1.15
    upd["layout"] = "fill"
    return s.model_copy(update=upd)


def enforce_rules(shots: list[Shot], valid: dict[str, Asset], aspects: dict[str, float | None] | None = None
                  ) -> list[Shot]:
    """The hard rules a plan is held to after its cuts are on the grid (durations unchanged):
    transitions (none into shot 1, never two in a row, at most one cut in four, wipe only for a
    before/after, which always gets one); stills never speed-ramp and always move; at most one
    bordered 'fit' shot, not in the first FIT_NOT_BEFORE_S, at most FIT_MAX_SHARE of the reel (the
    others become full-bleed pans); and the first second moves."""
    if not shots:
        return shots
    aspects = aspects or {}
    out = list(shots)
    kinds = [valid[s.asset_id].kind if s.asset_id in valid else "photo" for s in out]
    # transitions
    out[0] = out[0].model_copy(update={"transition": "cut"})
    for i in range(1, len(out)):
        if _is_pair(out[i - 1], out[i]):
            out[i] = out[i].model_copy(update={"transition": "wipe"})
        elif out[i].transition == "wipe":
            out[i] = out[i].model_copy(update={"transition": "cut"})
    for i in range(2, len(out)):
        if out[i].transition != "cut" and out[i - 1].transition != "cut":
            j = i - 1 if out[i].transition == "wipe" else i
            out[j] = out[j].model_copy(update={"transition": "cut"})
    allowed = max(1, math.ceil((len(out) - 1) / 4))
    fancy = sorted((i for i in range(1, len(out)) if out[i].transition != "cut"),
                   key=lambda i: (out[i].transition != "wipe", i))
    for i in fancy[allowed:]:
        out[i] = out[i].model_copy(update={"transition": "cut"})
    # borders, and every still moves
    total = sum(s.duration_s for s in out)
    t, fit_used = 0.0, False
    for i, s in enumerate(out):
        a_kind = kinds[i]
        if s.layout == "fit" and a_kind in ("photo", "video", "sequence"):
            ok = (not fit_used and t >= FIT_NOT_BEFORE_S - 1e-6 and s.duration_s <= FIT_MAX_SHARE * total + 1e-6)
            if ok:
                fit_used = True
            else:
                s = _bleed(s, aspects.get(s.asset_id))
        if a_kind in STILL_KINDS and not _moves(s):
            if s.zoom_from > s.zoom_to:
                s = s.model_copy(update={"zoom_from": min(1.6, s.zoom_to + 0.08)})
            else:
                s = s.model_copy(update={"zoom_to": min(1.6, s.zoom_from + 0.08)})
                if not _moves(s):
                    s = s.model_copy(update={"zoom_from": max(1.0, s.zoom_to - 0.08)})
        out[i] = s
        t += s.duration_s
    if not _opens_moving(out, kinds):
        out[0] = _make_opening_move(out[0], kinds[0], aspects.get(out[0].asset_id))
    return out


def snap(plan: ReelPlan, cfg: Config, valid: dict[str, Asset],
         tracks: dict[str, music.Track] | None = None, *, aspects: dict[str, float | None] | None = None,
         editable: set[str] | None = None) -> ReelPlan:
    """Hold Claude's plan to the hard rules: known ids, beat grid, its class's length cap, clip
    bounds and speeds, then enforce_rules(). With a music library (`tracks`) the plan always gets
    a track and its cuts go on that track's beats; without one the fixed cfg.beat_seconds grid is
    used and music is dropped. `aspects` (id -> width/height) and `editable` (ids with a shipped
    edit, for before/after) refine the rules when known."""
    _, _, cap = cfg.reel_length(plan.length_class)
    kept = [(_speeds(s, valid[s.asset_id]), valid[s.asset_id]) for s in plan.shots if s.asset_id in valid]
    kept = _before_after(kept, editable)
    choice = pick_music(plan, cfg, tracks) if tracks else None
    if choice is None:
        shots = _fixed_grid(kept, cfg, cap)
    else:
        info = tracks[choice.track_id].info
        shots = _music_grid(kept, cfg, info, choice.start_s, min(cap, info.duration_s - choice.start_s - 0.2))
    if not shots:
        raise JudgeError("plan had no usable shots")
    shots = enforce_rules(shots, valid, aspects)
    cover = plan.cover_asset_id if plan.cover_asset_id in {s.asset_id for s in shots} else shots[0].asset_id
    return plan.model_copy(update={"shots": shots, "cover_asset_id": cover, "music": choice})


# --------------------------------------------------------------------------- what the critic sees


def hook_strip(video: Path, cfg: Config, out: Path, step: float = 0.25) -> Path:
    """The first seconds at a quarter-second pitch, so the critic can judge the hook."""
    times = [round(i * step, 2) for i in range(int(HOOK_SECONDS / step))]
    frames = [media.frame_at(video, t, cfg, size=360) for t in times]
    strip = Image.new("RGB", (sum(f.width for f in frames), max(f.height for f in frames) + 24), "white")
    draw, x = ImageDraw.Draw(strip), 0
    for t, f in zip(times, frames):
        strip.paste(f, (x, 0))
        draw.text((x + 6, f.height + 4), f"{t:.2f}s", fill="black")
        x += f.width
    strip.save(out, quality=85)
    return out


def _font(size: int):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:                                   # Pillow without FreeType
        return ImageFont.load_default()


def grab_frames(video: Path, indices: list[int], cfg: Config, height: int = 320) -> dict[int, Image.Image]:
    """Frames of a reel by frame number (one decoding pass), each `height` px tall."""
    want = sorted({max(0, int(i)) for i in indices})
    if not want:
        return {}
    w = max(2, 2 * round(height * render.OUT_W / render.OUT_H / 2))
    expr = "+".join(f"eq(n,{i})" for i in want)
    out = render._run([cfg.ffmpeg, "-hide_banner", "-nostdin", "-v", "error", "-i", str(video), "-an",
                       "-vf", f"select='{expr}',scale={w}:{height}:flags=area,format=rgb24",
                       "-fps_mode", "passthrough", "-f", "rawvideo", "-"], timeout=600).stdout
    size = w * height * 3
    frames = [Image.fromarray(np.frombuffer(out[k:k + size], np.uint8).reshape(height, w, 3).copy())
              for k in range(0, len(out) - size + 1, size)]
    return dict(zip(want, frames))


def _starts(plan: ReelPlan) -> list[int]:
    starts, n = [], 0
    for s in plan.shots:
        starts.append(n)
        n += render.frames_for(s.duration_s)
    return starts


def _tile_grid(tiles: list[tuple[Image.Image, str]], cols: int) -> Image.Image:
    tw, th = tiles[0][0].size
    gap, rows = 4, math.ceil(len(tiles) / cols)
    out = Image.new("RGB", (cols * tw + (cols + 1) * gap, rows * th + (rows + 1) * gap), (24, 24, 24))
    draw, font = ImageDraw.Draw(out), _font(max(11, th // 16))
    for k, (im, label) in enumerate(tiles):
        x, y = gap + (k % cols) * (tw + gap), gap + (k // cols) * (th + gap)
        out.paste(im, (x, y))
        for j, line in enumerate(label.split("\n")):
            box = draw.textbbox((0, 0), line, font=font)
            yy = y + 2 + j * (box[3] + 4)
            draw.rectangle((x, yy, x + box[2] + 6, yy + box[3] + 4), fill=(0, 0, 0))
            draw.text((x + 3, yy + 1), line, fill=(255, 255, 255), font=font)
    return out


def shot_sheet(video: Path, plan: ReelPlan, cfg: Config, cols: int = 10, height: int = 240) -> Image.Image:
    """One frame from the middle of every shot, labelled with the shot number, its start time
    and length, and how it arrives: a medium or long reel at a glance (arc, pacing, repeats)."""
    starts = _starts(plan)
    mids = [st + render.frames_for(s.duration_s) // 2 for st, s in zip(starts, plan.shots)]
    got = grab_frames(video, mids, cfg, height)
    tiles = []
    for k, (s, st, m) in enumerate(zip(plan.shots, starts, mids)):
        im = got.get(m) or Image.new("RGB", (max(2, 2 * round(height * 9 / 32)), height))
        how = "" if k == 0 or s.transition == "cut" else f" {s.transition}>"
        sp = "" if s.speed == 1 and s.speed_to is None else (
            f" {s.speed:g}x" if s.speed_to is None else f" {s.speed:g}-{s.speed_to:g}x")
        tiles.append((im, f"#{k + 1} {st / render.FPS:.1f}s\n{s.duration_s:.1f}s{how}{sp}"))
    return _tile_grid(tiles, min(cols, len(tiles)))


def _spec_of(t) -> tuple[str, float]:
    """(kind, duration_s) of a transition in any of its shapes (aitx Transition, dict, ...)."""
    if isinstance(t, dict):
        return str(t.get("kind", "cut")), float(t.get("duration_s") or 0.0)
    return str(getattr(t, "kind", "cut")), float(getattr(t, "duration_s", 0.0) or 0.0)


def cut_list(plan: ReelPlan, transitions: list | None = None) -> list[tuple[str, int]]:
    """(kind, frames) per cut: the chosen transitions, else the plan's own (about 8 frames each)."""
    if transitions is not None:
        out = []
        for t in transitions:
            kind, d = _spec_of(t)
            out.append(("cut", 0) if kind in ("cut", "none") else (kind, max(2, int(round(d * render.FPS)))))
        return out
    return [("cut", 0) if s.transition == "cut" else (s.transition, 8) for s in plan.shots[1:]]


def motion_rows(plan: ReelPlan, transitions: list | None = None) -> list[tuple[str, list[int]]]:
    """Frame numbers the critic needs to judge transitions and speed changes: for every cut that
    is not hard, five frames across the transition; for every slowed, sped-up or ramped clip,
    five consecutive frames from its middle (interpolation artefacts show frame to frame)."""
    starts, rows = _starts(plan), []
    cuts = cut_list(plan, transitions)
    for k, s in enumerate(plan.shots):
        if k and k - 1 < len(cuts) and cuts[k - 1][0] != "cut":
            kind, d = cuts[k - 1]
            t = starts[k]
            idx = [t - d // 2 - 1, t - d // 4, t, t + d // 4, t + d // 2]
            rows.append((f"{t / render.FPS:.2f}s {kind} into #{k + 1}", idx))
        if s.speed != 1 or s.speed_to is not None:
            m = starts[k] + render.frames_for(s.duration_s) // 2
            sp = f"{s.speed:g}x" if s.speed_to is None else f"{s.speed:g}->{s.speed_to:g}x"
            rows.append((f"#{k + 1} at {sp}, consecutive frames", [m - 2, m - 1, m, m + 1, m + 2]))
    return rows[:10]


def motion_strip(video: Path, plan: ReelPlan, cfg: Config, height: int = 320,
                 transitions: list | None = None) -> Image.Image | None:
    rows = motion_rows(plan, transitions)
    if not rows:
        return None
    total = sum(render.frames_for(s.duration_s) for s in plan.shots)
    got = grab_frames(video, [min(max(0, i), total - 1) for _, idx in rows for i in idx], cfg, height)
    w = max(2, 2 * round(height * 9 / 32))
    label_h, gap = 26, 4
    out = Image.new("RGB", (5 * (w + gap) + gap, len(rows) * (height + label_h + gap) + gap), (24, 24, 24))
    draw, font = ImageDraw.Draw(out), _font(16)
    for r, (label, idx) in enumerate(rows):
        y = gap + r * (height + label_h + gap)
        draw.text((gap + 2, y + 4), label, fill=(255, 255, 255), font=font)
        for c, i in enumerate(idx):
            im = got.get(min(max(0, i), total - 1))
            if im is not None:
                out.paste(im, (gap + c * (w + gap), y + label_h))
    return out


def critic_images(video: Path, plan: ReelPlan, cfg: Config, work: Path, round_: int,
                  transitions: list | None = None) -> list[Path]:
    """[hook strip, the whole reel, (transitions and speed changes)] for the critic."""
    hook = hook_strip(video, cfg, work / f"hook-{round_}.jpg")
    contact = work / f"contact-{round_}.jpg"
    if plan.length_class == "short":
        render.reel_contact_sheet(video, cfg).save(contact, quality=85)
    else:
        shot_sheet(video, plan, cfg).save(contact, quality=85)
    images = [hook, contact]
    if motion_rows(plan, transitions):
        try:
            strip = motion_strip(video, plan, cfg, transitions=transitions)
        except (RuntimeError, OSError, ValueError) as e:     # an extra view: the critic can do without it
            log.warning("reel %s: no transition strip: %s", plan.event_key, e)
            strip = None
        if strip is not None:
            path = work / f"motion-{round_}.jpg"
            strip.save(path, quality=85)
            images.append(path)
    return images


CRITIC_CHECKS = {
    "short": (
        "a short: hook - the first second moves and earns a pause, and it opens differently from the event's "
        "other reels; cuts on the beat or every other beat, stills about 0.5-0.8 s and clips 0.8-1.5 s with "
        "one ~2 s hero hold that moves; one clear idea (arc_ok); the last shot loops back to the first"),
    "medium": (
        "a medium reel: the hook as for a short; an energy arc (arc_ok) - a fast open, a slower core with "
        "longer holds and one breath, a fast close into the loop; pace by contrast (wide vs detail, motion vs "
        "stillness); no run of near-identical shots; the middle holds attention"),
    "long": (
        "a long recap: a cold-open hook; three acts in chapters (arc_ok) - drop in, build through contrasting "
        "moments, payoff - with pace changes between chapters and a re-hook about every 20 s; NO SAG in the "
        "middle third (it needs shots as strong as the opening; fail pacing_ok if it drags); clips and "
        "timelapses carry it where the event has them; the closer lands and loops"),
}


def critic_task(key: str, plan: ReelPlan, hook: Path, contact: Path, options: str,
                music_note: str = "", earlier: list[str] | None = None, *, extra_images: list[Path] | None = None,
                issues: list[str] | None = None, openings: list[str] | None = None,
                band: tuple[float, float] | None = None, measured: str = "",
                transitions: list | None = None, changes: list[str] | None = None) -> JudgeTask:
    cls = plan.length_class
    memory = ""
    if earlier:
        memory = ("Earlier critiques of this reel (each led to the revision you are looking at):\n"
                  + "\n".join(f"- round {i + 1}: {n}" for i, n in enumerate(earlier)) + "\n"
                  "Stay consistent with them: don't reverse an earlier call (such as which shot should open) "
                  "unless this render shows something new, and don't re-raise problems that are now fixed. "
                  "Judge the hook against the best the candidates allow, not against an ideal they don't contain.\n\n")
    whole = ("the whole reel, a frame every half second" if cls == "short" else
             "one frame from the middle of every shot, labelled with its number, start time, length, how it "
             "arrives and its speed")
    extra = extra_images or []
    motion = ("; the third shows, frame by frame, every transition that is not a hard cut and a few consecutive "
              "frames of every slowed, sped-up or ramped clip") if extra else ""
    facts = ""
    if issues:
        facts = ("Automatic checks measured these problems in this render. They are facts, not opinions:\n"
                 + "\n".join(f"- {i}" for i in issues) + "\nThe reel cannot ship with them: verdict 'revise', "
                 "with a revised plan that fixes every one.\n\n")
    if measured:
        facts += ("Automatic measurements of this render (warnings, for your judgment):\n" + measured + "\n\n")
    if changes:
        facts += ("Since your last critique, your revised plan was changed before this render (hard rules and "
                  "automatic-check fixes, not a choice to ignore you):\n" + "\n".join(f"- {c}" for c in changes)
                  + "\nJudge this render with that in mind; if a change undid something you need, say so and "
                  "ask for it again in a way the rules allow.\n\n")
    if transitions:
        named = [f"cut {i + 1} at {(_starts(plan)[i + 1]) / render.FPS:.2f}s: {k}"
                 for i, (k, _) in enumerate(cut_list(plan, transitions)) if k != "cut" and i + 1 < len(plan.shots)]
        if named:
            facts += "Transitions in this render (chosen by the transition director): " + "; ".join(named) + ".\n\n"
    avoid = ""
    if openings:
        avoid = ("Other reels of this event already open with: " + "; ".join(openings) + ". This reel must open "
                 "differently (part of hook_ok), and a revision must not open with those either.\n\n")
    length = f" ({band[0]:g}-{band[1]:g} s)" if band else ""
    return JudgeTask(
        key=key, output=Critique, images=[hook, contact, *extra], effort="high",
        max_tokens=32000 if cls == "long" else 16000,
        instructions=(
            f"You did not make this reel. Judge it as a strict outside editor would before it goes on the "
            f"account. It is a {cls} reel{length} in the '{plan.format}' format. The first image is its opening, "
            f"a frame every quarter second; the second is {whole}{motion}. The plan that made it: "
            f"{plan.model_dump_json()}\n"
            + (f"Music: {music_note}\n" if music_note else "") +
            f"Candidates it could have used:\n{options}\n\n" + memory + facts + avoid +
            f"Checklist for {CRITIC_CHECKS[cls]}. Then the hard rules: the first second moves (a still with a "
            "gentle push-in is not a hook); something changes every ~1.5 s; no borders beyond one 'fit' shot "
            "(not in the first 3 s, at most 20% of the reel); the subject is never cropped and stays in the "
            "centre 80% and out of the UI bands; the last shot loops cleanly back to the first. "
            "transitions_ok: every transition that is not a hard cut is motivated (a whip between fast moves, "
            "zoom-in through to a new place, a crossfade on a change of time or mood, dip-black between "
            "chapters, a wipe for a before/after) and none looks gimmicky or broken. slowmo_ok: slow motion and "
            "ramps look clean (no warping, ghosting or judder in the consecutive frames) and serve a moment. "
            "Fill in every check from the style guide's critique checklist and these. verdict 'ship' only if "
            "every check passes. Otherwise 'revise' with a complete revised plan (keep length_class "
            f"'{cls}'), using only candidate ids."))


# --------------------------------------------------------------------------- music


def music_note(plan: ReelPlan, tracks: dict[str, music.Track], cfg: Config) -> str:
    """What the critic is told about the sound."""
    if not plan.music or plan.music.track_id not in tracks:
        return "none; a sound is added later in the Instagram app"
    t = tracks[plan.music.track_id]
    others = {k: v for k, v in tracks.items() if k != t.id}
    length = window_length(plan, cfg)
    note = (f"{music.listing([t], length)}; the reel starts {plan.music.start_s:.2f} s into the "
            "track and every cut is on its beat. In a revised plan keep this music unless it clearly fights "
            "the footage")
    if others:
        note += f"; the other tracks:\n{music.listing(others, length)}"
    return note


def _music_used(store: Store) -> dict[str, int]:
    used: dict[str, int] = defaultdict(int)
    for _, rec in store.all("reels"):
        m = (rec.get("plan") or {}).get("music") if isinstance(rec, dict) else None
        if m and m.get("track_id"):
            used[m["track_id"]] += 1
    return dict(used)


def _tracks_for(cfg: Config, length_class: str) -> dict[str, music.Track]:
    """Licensed tracks long enough for this class (empty when music is off or there are none)."""
    if not music.enabled(cfg):
        return {}
    lib = music.load_library(cfg)
    if length_class == "short":
        return lib
    need = cfg.reel_length(length_class)[0] + music.MIN_EXTRA_S
    return {k: t for k, t in lib.items() if t.info is not None and t.info.duration_s >= need}


_RENDER_LOCK = threading.Lock()
_RENDER_SLOTS: dict[int, threading.BoundedSemaphore] = {}


def _slots(cfg: Config) -> threading.BoundedSemaphore:
    """Reels rendering at once (setting reel_render_slots, default 2): each render already spreads
    its segments over every core, so more would only queue; Claude calls run alongside."""
    n = max(1, int((cfg.extra or {}).get("reel_render_slots", 2)))
    with _RENDER_LOCK:
        return _RENDER_SLOTS.setdefault(n, threading.BoundedSemaphore(n))


def _render_params() -> set[str]:
    try:
        return set(inspect.signature(render.render_reel).parameters)
    except (TypeError, ValueError):
        return set()


def _supports_draft() -> bool:
    return "draft" in _render_params()


def _segment_pipeline() -> bool:
    """The renderer renders shots as cached segments and takes the transitions per cut."""
    return "transitions" in _render_params() and hasattr(render, "render_segments")


def _render_reel(plan: ReelPlan, sources: dict, video: Path, cfg: Config, music_path, draft: bool,
                 transitions: list | None = None) -> None:
    params = _render_params()
    kw: dict = {}
    if "draft" in params:
        kw["draft"] = draft
    if transitions is not None and "transitions" in params:
        kw["transitions"] = transitions
    with _slots(cfg):
        if music_path is None:
            render.render_reel(plan, sources, video, cfg, **kw)
        else:
            render.render_reel(plan, sources, video, cfg, music=music_path, **kw)


def _render(plan: ReelPlan, sources: dict, video: Path, cfg: Config, tracks: dict[str, music.Track],
            draft: bool = False, transitions: list | None = None) -> ReelPlan:
    """Render with the plan's music; if the mix fails, render silent rather than lose the reel.
    Returns the plan as rendered. draft: the quick render the critic watches (when the renderer
    has one); a shipped reel is rendered final."""
    track = tracks.get(plan.music.track_id) if plan.music else None
    if track is None:
        plan = plan.model_copy(update={"music": None})
        _render_reel(plan, sources, video, cfg, None, draft, transitions)
        return plan
    try:
        _render_reel(plan, sources, video, cfg, track.path, draft, transitions)
        return plan
    except (RuntimeError, OSError, ValueError) as e:
        log.warning("reel %s: music mix failed, rendering without music: %s", plan.event_key, e)
        plan = plan.model_copy(update={"music": None})
        _render_reel(plan, sources, video, cfg, None, draft, transitions)
        return plan


# --------------------------------------------------------------------------- one reel


CAMERA_ALIAS = "@camera"


def _night(a: Asset, s: Score | None, m: Metrics | None) -> bool:
    text = f"{s.mood} {s.subject}" if s else ""
    return bool(NIGHT.search(text)) or (m is not None and m.brightness < 0.18)


def render_inputs(plan: ReelPlan, valid: dict[str, Asset], store: Store, cfg: Config
                  ) -> tuple[dict[str, dict], ReelPlan]:
    """The renderer's sources and the plan as it renders: a 'camera' version (the before of a
    before/after) shows the camera's own JPEG under an alias id; night and astro clips are marked
    for denoising (Instagram's encoder turns noise into blocks)."""
    sources: dict[str, dict] = {}
    shots = []
    for s in plan.shots:
        a = valid[s.asset_id]
        if s.version == "camera" and a.kind == "photo" and a.preview:
            alias = s.asset_id + CAMERA_ALIAS
            sources[alias] = {"kind": "photo", "path": a.preview}
            shots.append(s.model_copy(update={"asset_id": alias}))
            continue
        src = source_for(a, store, cfg, s)
        if src["kind"] in ("video", "video360") and _night(a, store.get("scores", a.id, Score),
                                                           store.get("metrics", a.id, Metrics)):
            src = {**src, "denoise": True}
        sources[s.asset_id] = src
        shots.append(s)
    return sources, plan.model_copy(update={"shots": shots})


def _qc():
    try:
        from . import qc
        return qc
    except ImportError:
        return None


def base_id(asset_id: str) -> str:
    return asset_id[: -len(CAMERA_ALIAS)] if asset_id.endswith(CAMERA_ALIAS) else asset_id


def kinds_for(plan: ReelPlan, valid: dict[str, Asset]) -> dict[str, str]:
    """asset id -> kind, for the automatic checks (a camera version is a photo)."""
    return {s.asset_id: (valid[base_id(s.asset_id)].kind if base_id(s.asset_id) in valid else "photo")
            for s in plan.shots}


def plan_problems(plan: ReelPlan, valid: dict[str, Asset], taken: list[str] | tuple = ()) -> tuple[list[str], str]:
    """Hard problems of a plan before it is rendered: qc.check_plan's failures, and a short opening
    on another short's opening shot. (one line per problem, the facts for the reviser)."""
    fails, facts = [], []
    qc = _qc()
    if qc is not None:
        try:
            bad = [f for f in qc.check_plan(plan, kinds=kinds_for(plan, valid)) if f.severity == "fail" and not f.ok]
            fails += [f"{f.rule}: {f.detail}" for f in bad]
            if bad:
                facts.append(qc.findings_for_llm(bad))
        except Exception as e:                          # a broken check must not lose the reel
            log.warning("reel %s: plan checks could not run: %s", plan.event_key, e)
    if plan.length_class == "short" and plan.shots and plan.shots[0].asset_id in set(taken):
        msg = (f"opening: shot 1 (id={plan.shots[0].asset_id}) already opens another short of this event; open "
               "with a different shot and a different hook")
        fails.append(msg)
        facts.append(f"- FAIL {msg}")
    return fails, "\n".join(facts)


def reel_report(video: Path, plan: ReelPlan, cfg: Config, valid: dict[str, Asset], draft: bool):
    """qc.check_reel on a render (None when the checks are not available or cannot read it)."""
    qc = _qc()
    if qc is None:
        return None
    try:
        return qc.check_reel(video, cfg, plan.length_class, allow_silent=not music.enabled(cfg), draft=draft,
                             plan=plan, kinds=kinds_for(plan, valid))
    except Exception as e:
        log.warning("reel %s: automatic checks could not run: %s", plan.event_key, e)
        return None


def review_patterns(cfg: Config) -> list[str]:
    v = (cfg.extra or {}).get("review_events", [])
    return [v] if isinstance(v, str) else [str(x) for x in v or []]


def needs_review(key: str, cfg: Config) -> bool:
    """Events that feature other people (a wedding...) wait for the owner's approval."""
    return any(p and p.lower() in key.lower() for p in review_patterns(cfg))


LEGACY_FOLDERS = (*REEL_CLASSES, "_review", "_needs-attention")   # before reels were filed by event


def out_folder(cfg: Config, key: str, length_class: str, shipped: bool) -> Path:
    """reels/<event>/, or reels/_review/<event>/ and reels/_needs-attention/<event>/: every reel of
    an event sits together, its length class is in its name."""
    base = cfg.output_dir / "reels"
    if not shipped:
        return base / "_needs-attention" / key
    return (base / "_review" / key) if needs_review(key, cfg) else base / key


def _clear_other_copies(cfg: Config, name: str, keep: Path, key: str = "") -> None:
    """A reel made again (say once music arrived) may land in another folder: drop the old copy."""
    base = cfg.output_dir / "reels"
    folders = [base / key, base / "_review" / key, base / "_needs-attention" / key] if key else []
    for d in folders + [base / f for f in LEGACY_FOLDERS]:
        if d == keep or not d.is_dir():
            continue
        for suffix in (".mp4", ".caption.txt", ".jpg"):
            (d / f"{name}{suffix}").unlink(missing_ok=True)


MAX_HASHTAGS = 5


def tidy_caption(text: str, max_tags: int = MAX_HASHTAGS) -> str:
    """The caption as written, with at most max_tags hashtags (the first ones)."""
    seen = 0

    def keep(m: re.Match) -> str:
        nonlocal seen
        seen += 1
        return m.group(0) if seen <= max_tags else ""
    out = re.sub(r"(?<!\w)#\w+", keep, text.strip())
    return "\n".join(re.sub(r"[ \t]{2,}", " ", line).rstrip() for line in out.splitlines()).strip()


def caption_text(plan: ReelPlan, track: music.Track | None) -> str:
    """The .caption.txt: the caption to post (with the music credit its licence asks for), then,
    under a rule, the track it was cut to, so a trending sound can be swapped in when posting."""
    credit = music.attribution_line(track) if track else None
    text = tidy_caption(plan.caption) + (f"\n\n{credit}" if credit else "")
    if track is None:
        sound = "Sound: none - add one in the Instagram app."
    else:
        lic = track.license
        where = ", ".join(x for x in (lic.source, lic.license, lic.url) if x)
        sound = (f'Sound: "{track.title}" ({where}), from {plan.music.start_s:.2f} s. Swapping in a trending '
                 "sound in the app? Keep the cuts' tempo" + ("; then drop the credit line." if credit else "."))
    return f"{text}\n\n---\n{sound}\n"


COVER_W, COVER_H = render.OUT_W, render.OUT_H
COVER_BAND = (0.125, 0.875)      # the profile grid shows the centre 3:4 (1080x1440) of a 9:16 cover
COVER_MARGIN = 0.1               # the subject's centre stays this far inside that band
COVER_MAX_ZOOM = 1.6


def cover_box(w: float, h: float, focus: tuple[float, float]) -> tuple[float, float, float, float]:
    """The 9:16 box (x, y, w, h) a cover is cut from: the largest one around focus, zoomed in only
    as far as it takes to bring the focus inside the centre 3:4 band (with COVER_MARGIN) and away
    from the side edges - a box clamped at the frame's top or bottom can leave a subject near the
    frame's edge outside what the profile grid shows."""
    lo, hi = COVER_BAND[0] + COVER_MARGIN, COVER_BAND[1] - COVER_MARGIN
    for k in range(61):
        z = 1 + k * (COVER_MAX_ZOOM - 1) / 60
        x, y, bw, bh = render.fit_box(w, h, render.ASPECT, focus, z)
        fx, fy = (focus[0] * w - x) / bw, (focus[1] * h - y) / bh
        if lo - 1e-9 <= fy <= hi + 1e-9 and 0.1 - 1e-9 <= fx <= 0.9 + 1e-9:
            return x, y, bw, bh
    return render.fit_box(w, h, render.ASPECT, focus, COVER_MAX_ZOOM)


def make_cover(plan: ReelPlan, valid: dict[str, Asset], store: Store, cfg: Config, video: Path,
               out: Path) -> Path | None:
    """The cover (1080x1920 JPEG, no text) from the story pass's cover_asset_id: a photo or a flat
    clip's frame is cut afresh from the source at full resolution with cover_box() around the
    shot's focus; 360 views, fit layouts and sequences use the frame the reel shows mid-shot."""
    shots = [s for s in plan.shots if s.asset_id == plan.cover_asset_id] or plan.shots[:1]
    shot = next((s for s in shots if s.version == "edit"), shots[0])
    a = valid.get(shot.asset_id)
    try:
        img = None
        if a is not None and a.kind in ("photo", "video") and shot.layout == "fill":
            src = source_for(a, store, cfg, shot)
            if a.kind == "photo" and src["kind"] == "photo":
                img = render._open_srgb(src["path"])
            elif a.kind == "video" and src["kind"] == "video":
                info = media.probe(src["path"], cfg)
                t = shot.start_s + shot.duration_s * _mean_speed(shot) / 2
                img = media.frame_at(src["path"], t, cfg, size=max(info["width"], info["height"]))
        if img is not None:
            x, y, w, h = cover_box(img.width, img.height, (shot.focus.x, shot.focus.y))
            cover = img.resize((COVER_W, COVER_H), Image.LANCZOS, box=(x, y, x + w, y + h), reducing_gap=3.0)
        else:
            k = plan.shots.index(shot)
            mid = _starts(plan)[k] + render.frames_for(shot.duration_s) // 2
            cover = media.frame_at(video, mid / render.FPS, cfg, size=COVER_H)
            if cover.size != (COVER_W, COVER_H):
                cover = cover.resize((COVER_W, COVER_H), Image.LANCZOS)
        out.parent.mkdir(parents=True, exist_ok=True)
        cover.convert("RGB").save(out, quality=92)
        return out
    except Exception as e:                              # a reel without a cover still ships
        log.warning("reel %s: no cover: %s", plan.event_key, e)
        return None


def _own(plan: ReelPlan, key: str, length_class: str) -> ReelPlan:
    return plan.model_copy(update={"event_key": key, "length_class": length_class})


def summary(name: str, rec: dict) -> dict:
    """What a later story pass is told about an earlier reel of the same event."""
    plan = rec.get("plan") or {}
    ids = [s.get("asset_id") for s in plan.get("shots", [])]
    return {"name": name, "title": plan.get("title", ""), "format": plan.get("format", "story"),
            "opening": ids[0] if ids else None, "next": ids[1:3], "status": rec.get("status")}


# --------------------------------------------------------------------------- saved as it goes


def save_plan(store: Store, name: str, plan: ReelPlan, source: str) -> None:
    """A story-pass plan, the moment it arrives: a stopped run picks it up instead of paying again."""
    store.put("reel_plans", name, {"plan": plan.model_dump(mode="json"), "source": source, "at": time.time()})


def saved_plan(store: Store, name: str) -> ReelPlan | None:
    rec = store.get("reel_plans", name)
    if not rec:
        return None
    try:
        return ReelPlan.model_validate(rec["plan"])
    except (KeyError, ValueError):
        return None


def _round_key(name: str, n: int) -> str:
    return f"{name}#{n:02d}"


def load_rounds(store: Store, name: str) -> list[dict]:
    """The saved rounds of a reel, in order (round 0 up to the first gap)."""
    out = []
    for n in range(CRITIC_ROUNDS + 2):
        rec = store.get("reel_rounds", _round_key(name, n))
        if rec is None:
            break
        out.append(rec)
    return out


def save_round(store: Store, name: str, n: int, **fields) -> None:
    """One round of a reel: the plan it rendered, the transitions, the automatic checks, the critique
    (when one was asked for), the outcome ('revise', 'ship' or 'stop') and the next plan."""
    store.put("reel_rounds", _round_key(name, n), {"name": name, "round": n, "at": time.time(), **fields})


def clear_rounds(store: Store, name: str) -> None:
    for n in range(CRITIC_ROUNDS + 2):
        store.delete("reel_rounds", _round_key(name, n))


# --------------------------------------------------------------------------- one reel, round by round


class _Aspects(dict):
    """width/height per asset id, measured on first use (opening every preview up front is slow)."""

    def __init__(self, valid: dict[str, Asset], cfg: Config):
        super().__init__()
        self._valid, self._cfg = valid, cfg

    def get(self, key, default=None):
        if key not in self:
            a = self._valid.get(key)
            self[key] = aspect_of(a, self._cfg) if a is not None and a.kind in ("photo", "video") else None
        return super().get(key, default)


@dataclass
class Context:
    """What the reels of one event (or trip) share: the candidates shown to Claude (opts, on sheets),
    every keeper a saved plan may use (valid), and what is known about them."""
    key: str
    opts: list
    valid: dict
    notes: dict
    editable: set
    aspects: dict
    sheets: list


def make_context(key: str, opts: list[tuple[Asset, Score]], cfg: Config, store: Store, work: Path,
                 items: list[tuple[Asset, Score]] | None = None) -> Context:
    work.mkdir(parents=True, exist_ok=True)
    every = list(items or []) + list(opts)
    valid = {a.id: a for a, _ in every}
    notes = candidate_notes(opts, store)
    editable = set()
    for a in valid.values():
        e = store.get("edits", a.id) if a.kind == "photo" else None
        if e and e.get("status") == "shipped" and e.get("full") and a.preview and str(a.preview) != str(e["full"]):
            editable.add(a.id)
    return Context(key, list(opts), valid, notes, editable, _Aspects(valid, cfg), _sheets(opts, cfg, work))


def _chapters(plan: ReelPlan, valid: dict[str, Asset]) -> list[bool]:
    """Where a reel changes chapter (for the transition director): a dip to black the story asked
    for, a new day, or three hours or more between two shots."""
    out = []
    for a, b in zip(plan.shots, plan.shots[1:]):
        ta, tb = _when(valid[base_id(a.asset_id)]) if base_id(a.asset_id) in valid else None, \
            _when(valid[base_id(b.asset_id)]) if base_id(b.asset_id) in valid else None
        gap = ta is not None and tb is not None and (ta.date() != tb.date() or abs((tb - ta).total_seconds()) >= 3 * 3600)
        out.append(b.transition == "dip-black" or gap)
    return out


WIPE_S = 0.8


def choose_transitions(plan: ReelPlan, sources: dict, ctx: Context, cfg: Config, judge: Backend,
                       track: music.Track | None, name: str, work: Path, critic_notes: str = "") -> list[dict] | None:
    """The transition at every cut, chosen by the transition director (direction.direct: one Claude
    call for the whole reel) from measurements of the rendered draft segments; the story's own
    before/after wipes stay. None when the renderer has no segment pipeline (the plan's own
    transitions are rendered) or the measurements fail."""
    if not _segment_pipeline() or len(plan.shots) < 2:
        return None
    try:
        from . import direction
        with _slots(cfg):
            segments = render.render_segments(plan, sources, cfg, draft=True)
        kinds = ["still" if ctx.valid.get(base_id(s.asset_id)) is not None
                 and ctx.valid[base_id(s.asset_id)].kind in STILL_KINDS else "video" for s in plan.shots]
        feats = direction.reel_features(segments, cfg, focus=[(s.focus.x, s.focus.y) for s in plan.shots],
                                        kinds=kinds)
        scores = {a.id: s for a, s in ctx.opts}
        notes = {s.asset_id: (f"{scores[base_id(s.asset_id)].subject}, {scores[base_id(s.asset_id)].role}"
                              if base_id(s.asset_id) in scores else base_id(s.asset_id)) for s in plan.shots}
        info = track.info if track is not None else None
        cuts = direction.cuts_from_plan(plan, info, notes)
        cuts = [c.model_copy(update={"chapter": ch}) for c, ch in zip(cuts, _chapters(plan, ctx.valid))]
        sheet = direction.boundary_sheet(segments, work / "cuts.jpg", cfg)
        seconds = sum(render.frames_for(s.duration_s) for s in plan.shots) / render.FPS
        style = None
        if critic_notes:                                # the critic's transition calls are the director's brief too
            style = (direction.guide_text() + "\n\nThe reel's critic, on the previous render (follow its calls on "
                     "transitions, such as which cut carries a zoom-through and in which direction):\n"
                     + critic_notes + "\n")
        chosen = direction.direct(cuts, feats, judge, style, key=name, reel_seconds=seconds,
                                  beat_s=info.beat_s if info is not None else None, sheet=sheet, cfg=cfg)
    except Exception as e:                              # the plan's own transitions still render
        log.warning("reel %s: transition direction failed (%s); using the plan's transitions", name, e)
        return None
    out = []
    for i, t in enumerate(chosen):
        if plan.shots[i + 1].transition == "wipe":
            out.append({"kind": "wipe", "duration_s": WIPE_S, "params": {}, "reason": "the before/after reveal"})
        else:
            out.append(t.model_dump(mode="json") if hasattr(t, "model_dump") else dict(t))
    return out


def _keep_opening(p: ReelPlan, want: Shot) -> ReelPlan:
    """The critic's opening shot back at the front of a fix pass's plan: the fix answers measured
    faults, and which shot opens is the critic's call (its own shot when the fix dropped it)."""
    if p.shots and p.shots[0].asset_id == want.asset_id:
        return p
    shots = list(p.shots)
    i = next((k for k, s in enumerate(shots) if s.asset_id == want.asset_id), None)
    first = shots.pop(i) if i is not None else want
    return p.model_copy(update={"shots": [first, *shots]})


def _push_opening(p: ReelPlan, valid: dict[str, Asset], aspects=None) -> ReelPlan:
    """A measured-still opening: a pan (or a stronger push) across the shot's own frame, so the
    opener the critic chose keeps its place and the first second moves."""
    if not p.shots:
        return p
    s = p.shots[0]
    a = valid.get(base_id(s.asset_id))
    kind = a.kind if a is not None else "photo"
    moved = _make_opening_move(s, kind, (aspects or {}).get(s.asset_id))
    return p.model_copy(update={"shots": [moved, *p.shots[1:]]})


def _ids(p: ReelPlan) -> list[str]:
    return [s.asset_id for s in p.shots]


def finish_reel(ctx: Context, plan: ReelPlan, cfg: Config, store: Store, judge: Backend, length_class: str,
                index: int, *, variant: str = "", taken: list[str] | tuple = (), trial_of: str = "") -> dict:
    """Take one story plan to a finished reel, round by round, every round saved as it ends:
    snap -> plan checks (a hard failure goes straight back for a fix, no render) -> draft render
    with the director's transitions -> reel checks (a hard failure goes back for a fix, no critic
    call) -> the critic (ship, or revise). A shipped reel is rendered final; the rest keep their
    draft in _needs-attention/. Returns the store record."""
    key = ctx.key
    name = reel_name(key, length_class, index, variant)
    work = cfg.state_dir / "reels" / name
    work.mkdir(parents=True, exist_ok=True)
    tracks = _tracks_for(cfg, length_class)
    no_music = music.enabled(cfg) and not tracks
    if no_music:
        log.info("music: no licensed tracks in %s; reel %s renders silent and waits in _needs-attention",
                 music.music_dir(cfg), name)
    lo, _, hi = cfg.reel_length(length_class)
    idx = {a.id: i for i, (a, _) in enumerate(ctx.opts)}
    openings = [f"#{idx[i]} (id={i})" if i in idx else f"id={i}" for i in dict.fromkeys(taken)]

    def settle(p: ReelPlan, track_from: ReelPlan | None = None) -> ReelPlan:
        p = _own(p, key, length_class)
        if track_from is not None and tracks and (p.music is None or p.music.track_id not in tracks):
            p = p.model_copy(update={"music": track_from.music})     # keep the track
        return snap(p, cfg, ctx.valid, tracks, aspects=ctx.aspects, editable=ctx.editable)

    # The critic's latest revision as it asked for it (its opening shot), and what the critic must hear
    # about changes made to that revision before the next render (hard rules, automatic-check fixes).
    asked: Shot | None = None
    told: list[str] = []

    def fix(p: ReelPlan, facts: str, fails: list[str]) -> ReelPlan:
        hold = asked if (asked is not None and asked.asset_id in ctx.valid and asked.asset_id not in set(taken)) else None
        if hold is not None:
            facts += (f"\nThe critic chose shot 1 (id={hold.asset_id}) in its last revision. Keep it as the opening "
                      "shot and fix the problems another way (a pan or a stronger push on it, or a cut inside the "
                      "first second).")
        raw = judge.judge(fix_task(name, p, facts, ctx.opts, cfg, ctx.sheets, ctx.notes))
        what = [f"the automatic checks failed ({'; '.join(fails)}) and a fix pass revised the plan"]
        if hold is not None and raw.shots and raw.shots[0].asset_id != hold.asset_id:
            what.append(f"the fix pass tried to open on id={raw.shots[0].asset_id}; your opening shot "
                        f"(id={hold.asset_id}) was put back first")
            raw = _keep_opening(raw, hold)
        new = settle(raw, p)
        if (hold is not None and new.shots and new.shots[0].asset_id == hold.asset_id
                and any(f.startswith("hook_motion") for f in fails)):
            new = _push_opening(new, ctx.valid, ctx.aspects)
            what.append(f"your opening shot (id={hold.asset_id}) measured too still in the first second, so it "
                        "keeps its place with a pan/push added across its frame")
        if hold is not None:
            told.extend(what)
        return new

    # resume: a stopped run continues at its next round with the plan that round was given
    rounds = load_rounds(store, name)
    if rounds and rounds[-1].get("reason") == NO_MUSIC and not no_music:
        clear_rounds(store, name)                       # music has arrived since: start again
        rounds = []
    history = [r["critique"] for r in rounds if r.get("critique")]
    checks = [{"round": r["round"], "stage": r.get("stage"), "fails": r.get("qc", [])} for r in rounds if r.get("qc")]
    shipped, reason, transitions, done = False, None, None, False
    asked_at = max((i for i, r in enumerate(rounds) if r.get("stage") == "critic" and r.get("next_plan")),
                   default=None)
    if asked_at is not None:                            # resume: the critic's ask and what it has not heard yet
        rec = rounds[asked_at]
        asked = (Shot.model_validate(rec["asked"]) if rec.get("asked")
                 else ReelPlan.model_validate(rec["next_plan"]).shots[0])
        told = [t for r in rounds[asked_at:] for t in r.get("told", [])]
    if rounds:
        last = rounds[-1]
        transitions = last.get("transitions")
        if last.get("outcome") in ("ship", "stop"):
            plan, done = ReelPlan.model_validate(last["plan"]), True
            shipped, reason = last["outcome"] == "ship", last.get("reason")
        else:
            plan = ReelPlan.model_validate(last["next_plan"])
            transitions = None
            if tracks and (plan.music is None or plan.music.track_id not in tracks):
                plan = settle(plan)                     # the library changed since: a track it has
    else:
        plan = settle(plan)
    round_ = len(rounds)
    video = work / "draft.mp4"
    rendered_now = False
    while not done and round_ <= CRITIC_ROUNDS:
        final_round = round_ == CRITIC_ROUNDS
        fails, facts = plan_problems(plan, ctx.valid, taken)
        if fails and not final_round:
            before = len(told)
            new = fix(plan, facts, fails)
            save_round(store, name, round_, stage="plan", plan=plan.model_dump(mode="json"), qc=fails,
                       outcome="revise", next_plan=new.model_dump(mode="json"), told=told[before:])
            checks.append({"round": round_, "stage": "plan", "fails": fails})
            plan, round_ = new, round_ + 1
            continue
        sources, as_rendered = render_inputs(plan, ctx.valid, store, cfg)
        track = tracks.get(plan.music.track_id) if plan.music else None
        transitions = choose_transitions(as_rendered, sources, ctx, cfg, judge, track, name, work,
                                         critic_notes=history[-1].get("notes", "") if history else "")
        rendered = _render(as_rendered, sources, video, cfg, tracks, draft=True, transitions=transitions)
        rendered_now = True
        plan = plan.model_copy(update={"music": rendered.music})
        if no_music or (tracks and rendered.music is None):
            reason = NO_MUSIC if no_music else "the music mix failed; rendered silent"
            save_round(store, name, round_, stage="render", plan=plan.model_dump(mode="json"),
                       transitions=transitions, outcome="stop", reason=reason)
            break
        report = reel_report(video, plan, cfg, ctx.valid, draft=_supports_draft())
        rfails = fails + ([f"{f.rule}: {f.detail}" for f in report.failures] if report is not None else [])
        if rfails:
            checks.append({"round": round_, "stage": "render", "fails": rfails})
            if final_round:
                reason = "automatic checks: " + "; ".join(rfails)
                save_round(store, name, round_, stage="render", plan=plan.model_dump(mode="json"),
                           transitions=transitions, qc=rfails, outcome="stop", reason=reason)
                break
            text = "\n".join(x for x in (facts, report.summary_for_llm() if report is not None else "") if x)
            before = len(told)
            new = fix(plan, text, rfails)
            save_round(store, name, round_, stage="render", plan=plan.model_dump(mode="json"), transitions=transitions,
                       qc=rfails, outcome="revise", next_plan=new.model_dump(mode="json"), told=told[before:])
            plan, round_ = new, round_ + 1
            continue
        qc = _qc()
        measured = qc.findings_for_llm(report.warnings) if (qc is not None and report is not None) else ""
        images = critic_images(video, plan, cfg, work, round_, transitions)
        verdict = judge.judge(critic_task(
            name, plan, images[0], images[1], listing(ctx.opts, cfg, ctx.notes), music_note(plan, tracks, cfg),
            [h["notes"] for h in history], extra_images=images[2:], openings=openings, band=(lo, hi),
            measured=measured, transitions=transitions, changes=told))
        told = []
        history.append(verdict.model_dump(mode="json"))
        common = {"plan": plan.model_dump(mode="json"), "transitions": transitions,
                  "critique": verdict.model_dump(mode="json")}
        if verdict.verdict == "ship" and verdict.passes:
            shipped = True
            save_round(store, name, round_, stage="critic", outcome="ship", **common)
            break
        if not verdict.revised or final_round:
            reason = "the critic did not pass it"
            save_round(store, name, round_, stage="critic", outcome="stop", reason=reason, **common)
            break
        new = settle(verdict.revised, plan)
        want = [i for i in _ids(verdict.revised) if i in ctx.valid]
        asked = next((s for s in verdict.revised.shots if s.asset_id in ctx.valid), new.shots[0])
        if _ids(new)[:1] != want[:1]:
            told.append(f"you asked to open on id={want[0] if want else '?'}; the hard rules open on "
                        f"id={new.shots[0].asset_id} (that shot could not be used as planned)")
        elif _ids(new) != want:
            told.append(f"the hard rules (known ids, before/after needs an edit, the length cap) changed your shot "
                        f"list from {want} to {_ids(new)}")
        save_round(store, name, round_, stage="critic", outcome="revise", next_plan=new.model_dump(mode="json"),
                   asked=asked.model_dump(mode="json"), told=list(told), **common)
        plan, round_ = new, round_ + 1

    # Shipped reels are rendered final; the others keep their draft (rendered again when this run
    # resumed past their last round). Only reels the critic passed land in their class folder (or
    # _review/); the rest wait in reels/_needs-attention/.
    sources, as_rendered = render_inputs(plan, ctx.valid, store, cfg)
    if shipped and (_supports_draft() or not rendered_now):
        video = work / "final.mp4"
        _render(as_rendered, sources, video, cfg, tracks, draft=False, transitions=transitions)
    elif not rendered_now:
        _render(as_rendered, sources, video, cfg, tracks, draft=True, transitions=transitions)
    out_dir = out_folder(cfg, key, length_class, shipped)
    out_dir.mkdir(parents=True, exist_ok=True)
    _clear_other_copies(cfg, name, out_dir, key)
    final = out_dir / f"{name}.mp4"
    _move_across(video, final)
    track = tracks.get(plan.music.track_id) if plan.music else None
    caption_file = out_dir / f"{name}.caption.txt"
    caption_file.write_text(caption_text(plan, track))
    cover = make_cover(plan, ctx.valid, store, cfg, final, out_dir / f"{name}.jpg")
    credit = music.attribution_line(track) if track else None
    sound = None if track is None else {
        "track_id": track.id, "start_s": plan.music.start_s, "file": str(track.path), "title": track.title,
        "license": track.license.license, "source": track.license.source, "url": track.license.url,
        "attribution": credit}
    return {"status": "shipped" if shipped else "needs-attention", "reason": reason,
            "review": shipped and needs_review(key, cfg), "event": key, "length_class": length_class,
            "index": index, "variant": variant, "trial_of": trial_of, "format": plan.format, "title": plan.title,
            "video": str(final), "caption_file": str(caption_file), "cover": str(cover) if cover else None,
            "seconds": round(sum(render.frames_for(s.duration_s) for s in plan.shots) / render.FPS, 3),
            "rendered": "final" if shipped and _supports_draft() else "draft" if _supports_draft() else "single",
            "plan": plan.model_dump(mode="json"), "transitions": transitions, "critic": history, "checks": checks,
            "music": sound}


def _taken(store: Store, group: str, index: int, variant: str) -> list[str]:
    """Openings a short must avoid: those of the event's shorts before it (short-01 before its B
    version, both before short-02...), finished or only planned so far."""
    out = []
    for i in range(1, index + 1):
        for v in ("", "b"):
            if (i, v) >= (index, variant):
                continue
            name = reel_name(group, "short", i, v)
            rec = store.get("reels", name) or (store.get("reels", group) if (i, v) == (1, "") else None)
            plan = (rec or {}).get("plan") if rec else None
            if plan and plan.get("shots"):
                out.append(plan["shots"][0]["asset_id"])
            elif (p := saved_plan(store, name)) is not None and p.shots:
                out.append(p.shots[0].asset_id)
    return out


def build(key: str, opts: list[tuple[Asset, Score]], cfg: Config, store: Store, judge: Backend,
          length_class: str = "short", index: int = 1, *, variant: str = "", earlier: list[dict] | None = None,
          base: dict | None = None) -> dict:
    """Make one reel of `key` (an event, or a trip for long reels) and return its store record:
    a story pass (saved; or the plan a stopped run already saved), then finish_reel(). `earlier`:
    summaries of the event's reels made before (their openings are avoided); `base`: the record of
    the shipped reel this is the B version of (variant 'b')."""
    name = reel_name(key, length_class, index, variant)
    ctx = make_context(key, opts, cfg, store, cfg.state_dir / "reels" / name)
    plan = saved_plan(store, name)
    a_plan = ReelPlan.model_validate(base["plan"]) if base is not None else None
    if plan is None:
        if a_plan is not None:
            plan = judge.judge(variant_task(key, a_plan, opts, cfg, ctx.sheets, ctx.notes))
            if a_plan.music and (plan.music is None or plan.music.track_id != a_plan.music.track_id):
                plan = plan.model_copy(update={"music": a_plan.music})
        else:
            plan = judge.judge(story_task(key, opts, cfg, ctx.sheets, _tracks_for(cfg, length_class),
                                          _music_used(store), length_class=length_class, earlier=earlier or [],
                                          notes=ctx.notes))
        save_plan(store, name, plan, "variant" if a_plan is not None else "story")
    taken = [e["opening"] for e in earlier or [] if e.get("opening") and parse_name(e["name"])[1] == "short"] \
        if length_class == "short" else []
    if a_plan is not None and a_plan.shots:
        taken.append(a_plan.shots[0].asset_id)
    return finish_reel(ctx, plan, cfg, store, judge, length_class, index, variant=variant, taken=taken,
                       trial_of=reel_name(key, length_class, index) if variant else "")


# --------------------------------------------------------------------------- every event


def _existing(store: Store, job: Job) -> dict | None:
    rec = store.get("reels", job.name)
    if rec is None and job.length_class == "short" and job.index == 1 and not job.variant:
        rec = store.get("reels", job.group)             # a reel from before length classes: the first short
    return rec


def _earlier(store: Store, job: Job) -> list[dict]:
    groups = {job.group, *job.events}
    out = []
    for name, rec in store.all("reels"):
        group, _, _, _ = parse_name(name)
        if group in groups and name != job.name and isinstance(rec, dict) and rec.get("plan"):
            out.append(summary(name, rec))
    return out


class _Gate:
    """Caps the Claude calls the reel workers make at once (cfg.parallel); judge_many passes through
    (it has its own pool)."""

    def __init__(self, inner: Backend, n: int):
        self._inner, self._sem = inner, threading.BoundedSemaphore(max(1, n))

    def judge(self, task):
        with self._sem:
            return self._inner.judge(task)

    def judge_many(self, tasks, on_result=None):
        return judge_many(self._inner, tasks, on_result)


def judge_many(judge: Backend, tasks: list[JudgeTask], on_result=None) -> dict:
    """judge.judge_many with on_result (each answer handled the moment it arrives), or one by one
    for a backend without it."""
    fn = getattr(judge, "judge_many", None)
    if fn is not None:
        try:
            takes = "on_result" in inspect.signature(fn).parameters
        except (TypeError, ValueError):
            takes = False
        if takes:
            return fn(tasks, on_result=on_result)
    out: dict = {}
    for t in tasks:
        try:
            out[t.key] = judge.judge(t)
        except JudgeError as e:
            out[t.key] = e
        if on_result is not None:
            on_result(t.key, out[t.key])
    return out


def _slot_plans(answer: ReelSet, jobs: list[Job]) -> dict[str, ReelPlan]:
    """The plans of a bundle answer by job name: by slot name, else by position."""
    by_slot = {str(sp.slot).strip().lower().strip("'\""): sp.plan for sp in answer.reels}
    out = {}
    for i, job in enumerate(jobs):
        p = by_slot.get(slot_name(job.name)) or (answer.reels[i].plan if i < len(answer.reels) else None)
        if p is not None:
            out[job.name] = p
    return out


def build_all(cfg: Config, store: Store, judge: Backend, assets: list[Asset], mix: Mix | None = None, *,
              only: str | None = None, limit: int | None = None) -> int:
    """Make every reel the mix asks for that the store doesn't have yet, then refresh
    ready/index.jpg and ready/index.csv. Returns how many reels were made.

    One creative pass per event: a single story call plans the event's main edit and the cut-downs
    derived from it (medium, shorts, the B version of the first short); the story calls of all
    events go out together (judge_many) and each answer is saved and its reels start the moment it
    arrives, so rendering and critic rounds overlap the story calls still running. Reels run in a
    pool (setting reel_workers, default 4), Claude calls at most cfg.parallel at once, renders at
    most reel_render_slots (2). Every step is saved: plans (reel_plans), rounds (reel_rounds),
    segments (state/segments); a stopped run continues where it was. A reel that waited for a music
    library is made again once there is one.
    only: events whose key contains this text; limit: at most this many reels in this run."""
    from . import ready
    mix = mix or Mix()
    pool = event_pool(store, assets)
    units = plan_jobs(pool, mix)
    if only:
        units = [u for u in units if any(only in g for g in (u[0].group, *u[0].events))]
    music_ready = not music.enabled(cfg) or bool(music.load_library(cfg))

    def todo(job: Job) -> bool:
        rec = _existing(store, job)
        return rec is None or (rec.get("reason") == NO_MUSIC and music_ready)

    work: list[tuple[list[Job], list[Job]]] = []
    budget = limit
    for unit in units:
        pending = [j for j in unit if todo(j)]
        if budget is not None:
            pending, budget = pending[:max(0, budget)], budget - min(len(pending), max(0, budget))
        if pending:
            work.append((unit, pending))
    gate = _Gate(judge, cfg.parallel)
    lock = threading.Lock()
    made = [0]
    futures = []
    reel_pool = ThreadPoolExecutor(max(1, int((cfg.extra or {}).get("reel_workers", 4))))

    def items_of(job: Job) -> list[tuple[Asset, Score]]:
        if len(job.events) > 1:
            return sorted((x for e in job.events for x in pool[e]), key=lambda x: -x[1].score)
        return pool[job.group]

    def run_job(ctx: Context, job: Job) -> None:
        try:
            plan = saved_plan(store, job.name)
            a_name = reel_name(job.group, job.length_class, job.index)
            a_plan = None
            if job.variant:
                a_rec = _existing(store, Job(job.group, job.length_class, job.index, events=job.events))
                a_plan = (ReelPlan.model_validate(a_rec["plan"]) if a_rec and a_rec.get("plan")
                          else saved_plan(store, a_name))
                if plan is None and a_plan is None:
                    return                                  # nothing to make a B version of
            if plan is None:
                if a_plan is not None:
                    plan = gate.judge(variant_task(job.group, a_plan, ctx.opts, cfg, ctx.sheets, ctx.notes))
                    if a_plan.music and (plan.music is None or plan.music.track_id != a_plan.music.track_id):
                        plan = plan.model_copy(update={"music": a_plan.music})
                else:
                    plan = gate.judge(story_task(job.group, ctx.opts, cfg, ctx.sheets,
                                                 _tracks_for(cfg, job.length_class), _music_used(store),
                                                 length_class=job.length_class, earlier=_earlier(store, job),
                                                 notes=ctx.notes))
                save_plan(store, job.name, plan, "variant" if a_plan is not None else "story")
            taken = _taken(store, job.group, job.index, job.variant) if job.length_class == "short" else []
            rec = finish_reel(ctx, plan, cfg, store, gate, job.length_class, job.index, variant=job.variant,
                              taken=taken, trial_of=a_name if job.variant else "")
            store.put("reels", job.name, rec)
            with lock:
                made[0] += 1
            log.info("reel done: %s (%s)", job.name, rec["status"])
        except Exception as e:                          # one bad reel must not stop the others
            store.put("jobs", f"reel:{job.name}", {"error": str(e)})
            log.warning("reel failed: %s: %s", job.name, e, exc_info=not isinstance(e, (JudgeError, OSError)))

    def submit(ctx: Context, pending: list[Job]) -> None:
        for job in pending:
            futures.append(reel_pool.submit(run_job, ctx, job))

    story: dict[str, tuple[Context, list[Job], list[Job]]] = {}
    tasks = []

    def context(pending: list[Job]) -> Context:
        first = pending[0]
        items = items_of(first)
        return make_context(first.group, pick_options(items, first.length_class), cfg, store,
                            cfg.state_dir / "reels" / f"{first.group}__candidates", items=items)
    with ThreadPoolExecutor(4) as prep:                 # contact sheets and previews: I/O bound
        contexts = list(prep.map(context, [pending for _, pending in work]))
    for (unit, pending), ctx in zip(work, contexts):
        first = pending[0]
        group = first.group
        need = [j for j in pending if saved_plan(store, j.name) is None]
        names = {j.name for j in pending}
        # a B version is planned with its A; one whose A is not in this pass waits for the A's record
        need = [j for j in need if not j.variant or reel_name(j.group, j.length_class, j.index) in names]
        if len(need) >= 2:
            slots = []
            for k, j in enumerate(need):
                if j.variant:
                    role = f"variant:{slot_name(reel_name(j.group, j.length_class, j.index))}"
                elif k == 0:
                    role = "main"
                else:
                    role = "short" if j.length_class == "short" else "cut"
                slots.append((slot_name(j.name), j.length_class, role))
            tracks = _tracks_for(cfg, "short")          # every licensed track; the listing gives lengths
            task = bundle_task(group, ctx.opts, cfg, ctx.sheets, slots, tracks, _music_used(store),
                               earlier=_earlier(store, first), notes=ctx.notes)
            tasks.append(task)
            story[task.key] = (ctx, pending, need)
        else:
            submit(ctx, pending)                        # one plan to make: its job makes it

    def on_story(key: str, answer) -> None:
        ctx, pending, need = story[key]
        try:
            if isinstance(answer, ReelSet):
                for name, plan in _slot_plans(answer, need).items():
                    save_plan(store, name, plan, key)
            else:
                log.warning("story pass %s failed (%s); its reels are planned one by one", key, answer)
        finally:
            submit(ctx, pending)

    try:
        if tasks:
            judge_many(gate, tasks, on_story)
        while futures:                                  # submit() may add more while we wait
            futures.pop(0).result()
    finally:
        reel_pool.shutdown(wait=True)
    # a B version whose A did not ship is just another short
    for _, pending in work:
        for job in pending:
            if not job.variant:
                continue
            rec = store.get("reels", job.name)
            a = store.get("reels", reel_name(job.group, job.length_class, job.index))
            if rec and rec.get("trial_of") and (not a or a.get("status") != "shipped"):
                store.put("reels", job.name, {**rec, "trial_of": ""})
    ready.refresh(cfg, store)
    return made[0]
