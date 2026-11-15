#!/usr/bin/env python3
"""Which creative shelf is due for a piece, and whether new audio fits.

    python3 platform/ci/creative_due.py          # table, then a `due:` line and the audio line
    python3 platform/ci/creative_due.py --json

The creative track spreads its runs by picking "the project that has gone
longest without a new piece". It suggested reading that from `git log -15`
over the creative folders, but a cloud clone is shallow: the log held 3 to 5
commits, so it could not answer, and runs fell back to reading `published:`
front matter by hand (84 of 591 creative run records mention it,
`grep -il 'longest\\|shallow'` over prompts/runs/*.json, 2026-11-15). The
front matter is in every checkout, so this reads it instead.

A shelf's last date is its newest `published:` (stories, episodes) or
`date:` (podcast scripts). Many shelves share today's date at ~29 creative
runs a day, so ties break on the fewest pieces in the last seven days, then
the fewest pieces overall. Dates only: two sessions started in the same
minute still get the same answer, so search open PRs before writing.

The audio line is the creative prompt's `du -cm` check (disk blocks, MiB)
against its 400 MB cap. The writing podcast is an audio-only shelf, so at or
over the cap it is listed but never named due (the prompt skips it then).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIO_CAP_MB = 400
AUDIO_DIRS = ("ventures/hearth-and-horizon/audio", "ventures/saints-by-candlelight/audio", "docs/podcast/audio")
HH = "ventures/hearth-and-horizon/stories"

AUDIO_ONLY = {"writing-podcast"}
# (shelf, folder, date field, shelf: value or None for every file)
SHELVES = (
    ("hearth-and-horizon", HH, "published", "hearth-and-horizon"),
    ("for-other-minds", HH, "published", "for-other-minds"),
    ("little-lamps", HH, "published", "little-lamps"),
    ("saints-by-candlelight", "ventures/saints-by-candlelight/episodes", "published", None),
    ("writing-podcast", "docs/podcast", "date", None),
)
FRONT = re.compile(r"\A---\n(.*?)\n---\n", re.S)
DATE = re.compile(r"\d{4}-\d{2}-\d{2}")


def front_matter(text: str) -> dict:
    m = FRONT.match(text)
    if not m:
        return {}
    out = {}
    for line in m.group(1).splitlines():
        k, sep, v = line.partition(":")
        if sep and not line.startswith((" ", "\t")):
            out[k.strip()] = v.strip().strip("\"'")
    return out


def shelf_dates(root: Path = ROOT) -> dict[str, list[dt.date]]:
    """Every piece's date, per shelf. Files without a parseable date are skipped."""
    out: dict[str, list[dt.date]] = {name: [] for name, *_ in SHELVES}
    for name, folder, field, shelf in SHELVES:
        for p in sorted((root / folder).glob("*.md")):
            fm = front_matter(p.read_text(encoding="utf-8", errors="replace"))
            if shelf is not None and fm.get("shelf") != shelf:
                continue
            m = DATE.match(fm.get(field, ""))
            if m:
                out[name].append(dt.date.fromisoformat(m.group(0)))
    return out


def rank(dates: dict[str, list[dt.date]], today: dt.date) -> list[dict]:
    """Shelves, the most due first."""
    week = today - dt.timedelta(days=7)
    rows = []
    for name, ds in dates.items():
        last = max(ds) if ds else None
        rows.append({
            "shelf": name,
            "last": last.isoformat() if last else None,
            "days_since": (today - last).days if last else None,
            "last_7_days": sum(1 for d in ds if d > week),
            "pieces": len(ds),
        })
    rows.sort(key=lambda r: (r["last"] or "", r["last_7_days"], r["pieces"], r["shelf"]))
    return rows


def due_shelf(rows: list[dict], mb: int) -> str:
    """The first ranked shelf a run can finish: not an audio-only one over the cap."""
    over = mb >= AUDIO_CAP_MB
    return next(r["shelf"] for r in rows if not (over and r["shelf"] in AUDIO_ONLY))


def audio_mb(root: Path = ROOT) -> int:
    """`du -cm ... | tail -1` over the audio folders: disk blocks, total rounded up to MiB."""
    blocks = 0
    for d in AUDIO_DIRS:
        for dirpath, _, files in os.walk(root / d):
            blocks += os.lstat(dirpath).st_blocks
            for f in files:
                blocks += os.lstat(os.path.join(dirpath, f)).st_blocks
    return -(-blocks * 512 // (1 << 20))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--today", help="YYYY-MM-DD (default: UTC today)")
    ap.add_argument("--root", type=Path, default=ROOT)
    a = ap.parse_args(argv)
    today = dt.date.fromisoformat(a.today) if a.today else dt.datetime.now(dt.timezone.utc).date()
    rows = rank(shelf_dates(a.root), today)
    mb = audio_mb(a.root)
    if a.json:
        print(json.dumps({"shelves": rows, "due": due_shelf(rows, mb), "audio_mb": mb,
                          "audio_cap_mb": AUDIO_CAP_MB}, indent=1))
        return 0
    print(f"{'shelf':<24}{'last':<12}{'days':>5}{'7d':>4}{'pieces':>8}")
    for r in rows:
        print(f"{r['shelf']:<24}{r['last'] or '-':<12}{r['days_since'] if r['days_since'] is not None else '-':>5}"
              f"{r['last_7_days']:>4}{r['pieces']:>8}")
    over = mb >= AUDIO_CAP_MB
    due = due_shelf(rows, mb)
    skipped = " (writing-podcast skipped: it needs audio)" if over and rows[0]["shelf"] in AUDIO_ONLY else ""
    print(f"due: {due} (oldest newest piece, then fewest in 7 days){skipped}; "
          "search open PRs for it before writing")
    verdict = "text only, no new audio" if mb >= AUDIO_CAP_MB else "new audio fits"
    print(f"audio: {mb} MB of {AUDIO_CAP_MB} MB cap ({verdict})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
