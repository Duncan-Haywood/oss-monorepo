"""What is ready to post: output_dir/ready/index.jpg (one row per shipped piece: its cover, class,
format, event and the start of its caption) and ready/index.csv, both in posting-queue order.

The queue: about posts_per_week pieces a week (setting, default 3: Mon/Wed/Fri) from the next
posting day on, the best first, mixing classes, formats and events, never three from one event in
a row. A B version (an A/B hook variant for Instagram's trial reels) goes out with its A, on the
same day. Pieces of `review_events` stay in the queue marked "review": approve them before posting.
Other stages can add their pieces (carousels...) with refresh(cfg, store, extra=[...]).
"""
from __future__ import annotations

import csv
import logging
import math
import textwrap
from dataclasses import asdict, dataclass, fields
from datetime import date, timedelta
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

from .config import Config
from .store import Store

log = logging.getLogger(__name__)

ROW_H = 200                     # index.jpg: one row per piece, the cover 9:16 at this height
PAGE_ROWS = 50                  # rows per image (index.jpg, index-2.jpg, ...)
WIDTH = 1200
WEEKDAYS = {1: (2,), 2: (1, 4), 3: (0, 2, 4), 4: (0, 1, 3, 5), 5: (0, 1, 2, 3, 4), 6: (0, 1, 2, 3, 4, 5),
            7: (0, 1, 2, 3, 4, 5, 6)}


@dataclass
class Piece:
    kind: str                   # "reel" (other stages may add "carousel", "photo")
    name: str                   # store key / file stem
    event: str
    length_class: str = ""
    format: str = ""
    status: str = "ready"       # "ready" | "review" (approve first)
    path: str = ""              # the video (or folder) to post
    cover: str = ""
    caption: str = ""
    caption_file: str = ""
    seconds: float = 0.0
    score: float = 0.0          # the critic's last score
    trial_of: str = ""          # a B version: the name of its A

    @property
    def place(self) -> str:
        day, _, rest = self.event.partition("_")
        return rest or self.event


def _caption(path: str) -> str:
    """The postable part of a .caption.txt (above its '---' rule)."""
    try:
        text = Path(path).read_text()
    except OSError:
        return ""
    return text.split("\n---\n", 1)[0].strip()


def reel_pieces(store: Store) -> list[Piece]:
    out = []
    for name, rec in store.all("reels"):
        if not isinstance(rec, dict) or rec.get("status") != "shipped":
            continue
        plan = rec.get("plan") or {}
        critic = rec.get("critic") or [{}]
        out.append(Piece(
            kind="reel", name=name, event=rec.get("event") or plan.get("event_key") or name,
            length_class=rec.get("length_class") or plan.get("length_class") or "short",
            format=rec.get("format") or plan.get("format") or "story",
            status="review" if rec.get("review") else "ready", path=rec.get("video", ""),
            cover=rec.get("cover") or "", caption=_caption(rec.get("caption_file", "")) or plan.get("caption", ""),
            caption_file=rec.get("caption_file", ""), seconds=float(rec.get("seconds") or 0.0),
            score=float(critic[-1].get("score") or 0.0), trial_of=rec.get("trial_of") or ""))
    return out


def order(pieces: list[Piece]) -> list[Piece]:
    """Posting order: greedily the best piece that repeats least of what went just before (event,
    place, class, format); three from one event in a row only when nothing else is left. B
    versions follow their A."""
    mains = sorted((p for p in pieces if not p.trial_of), key=lambda p: (-p.score, p.name))
    names = {p.name for p in mains}
    trials: dict[str, list[Piece]] = {}
    for p in pieces:
        if p.trial_of:
            trials.setdefault(p.trial_of if p.trial_of in names else "", []).append(p)
    out: list[Piece] = []

    def penalty(p: Piece) -> float:
        if not out:
            return 0.0
        last = out[-1]
        c = 0.0
        if len(out) >= 2 and out[-2].event == last.event == p.event:
            c += 100.0
        c += 3.0 * (last.event == p.event) + 1.0 * (last.place == p.place)
        c += 1.5 * (last.length_class == p.length_class) + 1.0 * (last.format == p.format)
        return c

    while mains:
        best = min(mains, key=lambda p: (penalty(p), -p.score, p.name))
        mains.remove(best)
        out.append(best)
    queue = []
    for p in out:
        queue.append(p)
        queue += trials.get(p.name, [])
    return queue + trials.get("", [])


def post_dates(n: int, start: date, per_week: int = 3) -> list[date]:
    """n posting days from `start` on (inclusive), per_week a week on fixed weekdays."""
    days = WEEKDAYS[min(7, max(1, per_week))]
    out, d = [], start
    while len(out) < n:
        if d.weekday() in days:
            out.append(d)
        d += timedelta(days=1)
    return out


def schedule(pieces: list[Piece], start: date, per_week: int = 3) -> list[tuple[date, Piece]]:
    queue = order(pieces)
    dates = post_dates(sum(1 for p in queue if not p.trial_of), start, per_week)
    out, k = [], -1
    for p in queue:
        if not p.trial_of or k < 0:
            k += 1
        out.append((dates[min(k, len(dates) - 1)], p))
    return out


def _font(size: int):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def _thumb(path: str, h: int) -> Image.Image:
    w = round(h * 9 / 16)
    try:
        with Image.open(path) as im:
            return ImageOps.fit(im.convert("RGB"), (w, h), Image.LANCZOS)
    except (OSError, ValueError):
        return Image.new("RGB", (w, h), (60, 60, 60))


def sheet(rows: list[tuple[int, date, Piece]]) -> Image.Image:
    img = Image.new("RGB", (WIDTH, max(1, len(rows)) * ROW_H), "white")
    draw = ImageDraw.Draw(img)
    big, small = _font(22), _font(17)
    for r, (n, day, p) in enumerate(rows):
        y = r * ROW_H
        if r % 2:
            draw.rectangle((0, y, WIDTH, y + ROW_H), fill=(244, 244, 244))
        thumb = _thumb(p.cover, ROW_H - 12)
        img.paste(thumb, (8, y + 6))
        x = 8 + thumb.width + 18
        head = f"{n}. {day:%a %Y-%m-%d}   {p.length_class.upper() or p.kind.upper()} · {p.format}"
        if p.seconds:
            head += f" · {p.seconds:.0f} s"
        if p.score:
            head += f" · critic {p.score:.1f}"
        draw.text((x, y + 10), head, fill=(0, 0, 0), font=big)
        tags = []
        if p.status == "review":
            tags.append("REVIEW: approve first")
        if p.trial_of:
            tags.append(f"TRIAL (B) of {p.trial_of}")
        draw.text((x, y + 42), p.name + ("   " + " · ".join(tags) if tags else ""),
                  fill=(160, 30, 30) if tags else (60, 60, 60), font=small)
        lines = textwrap.wrap(" ".join(p.caption.split()), 95)[:4]
        for j, line in enumerate(lines):
            draw.text((x, y + 76 + j * 26), line, fill=(30, 30, 30), font=small)
    return img


CSV_FIELDS = ["queue", "post_date", *[f.name for f in fields(Piece)]]


def write(cfg: Config, pieces: list[Piece], start: date | None = None) -> dict[str, list[Path] | Path]:
    """Write ready/index.jpg (more pages as index-2.jpg...) and ready/index.csv in queue order.
    Old pages are removed. Returns the files written."""
    out = cfg.output_dir / "ready"
    out.mkdir(parents=True, exist_ok=True)
    per_week = int((cfg.extra or {}).get("posts_per_week", 3))
    start = start or date.today() + timedelta(days=1)
    planned = schedule(pieces, start, per_week)
    rows, n = [], 0
    for day, p in planned:
        if not p.trial_of:
            n += 1
        rows.append((n, day, p))
    for old in out.glob("index*.jpg"):
        old.unlink()
    pages = []
    for k in range(0, max(1, len(rows)), PAGE_ROWS):
        path = out / ("index.jpg" if k == 0 else f"index-{k // PAGE_ROWS + 1}.jpg")
        sheet(rows[k:k + PAGE_ROWS]).save(path, quality=88)
        pages.append(path)
    csv_path = out / "index.csv"
    with csv_path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        w.writeheader()
        for n, day, p in rows:
            w.writerow({"queue": n, "post_date": day.isoformat(), **asdict(p)})
    log.info("ready: %d pieces queued (%d pages)", len(rows), math.ceil(len(rows) / PAGE_ROWS) or 1)
    return {"pages": pages, "csv": csv_path}


def refresh(cfg: Config, store: Store, extra: list[Piece] | None = None, start: date | None = None) -> dict:
    """Rebuild the index from everything shipped so far (reels, plus `extra` pieces)."""
    return write(cfg, reel_pieces(store) + list(extra or []), start)
