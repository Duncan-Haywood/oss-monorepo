#!/usr/bin/env python3
"""Which creative shelf is due for a piece, and whether new audio fits.

    python3 platform/ci/creative_due.py          # table, then a `due:` line and the audio line
    python3 platform/ci/creative_due.py --json
    python3 platform/ci/creative_due.py --seed X   # draw for another seed (default: this session)

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
the fewest pieces overall.

That ranking alone gave every concurrent session the same shelf, and each
shelf's bible holds about one proposal, so sessions started minutes apart
wrote the same story: at least seven creative run records from 2026-11-14 to
2026-11-15 report a duplicate of a piece merged or opened by another session
(#15876/#15886, #16091/#16092, #16124). So `due:` is now a draw, seeded by
the session (CLAUDE_CODE_SESSION_ID, else --seed, else random): every
writable shelf has weight (days since its newest piece + 1) / (pieces in the
last 7 days + 1), so a shelf that is days behind still almost always wins,
while shelves tied on today spread across sessions. The same session gets the
same answer on every call. `then:` lists the rest of the draw, the order to
fall back on when an open PR already covers the first. Still search open PRs
before writing.

The audio line is the creative prompt's `du -cm` check (disk blocks, MiB)
against its 400 MB cap. The writing podcast is an audio-only shelf, so at or
over the cap it is listed but never named due (the prompt skips it then).
"""
from __future__ import annotations

import argparse
import hashlib
import datetime as dt
import json
import os
import random
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


def weight(row: dict) -> float:
    """How strongly the draw favours a shelf: days behind over pieces this week."""
    days = row["days_since"] if row["days_since"] is not None else 365
    return (days + 1) / (row["last_7_days"] + 1)


def draw(rows: list[dict], mb: int, seed: str) -> list[tuple[str, float]]:
    """Writable shelves in a seeded weighted order (without replacement), each
    with its chance of coming first. Same seed, same order."""
    over = mb >= AUDIO_CAP_MB
    pool = [(r["shelf"], weight(r)) for r in rows if not (over and r["shelf"] in AUDIO_ONLY)]
    total = sum(w for _, w in pool)
    chance = {s: w / total for s, w in pool}
    rng = random.Random(int.from_bytes(hashlib.sha256(seed.encode()).digest()[:8], "big"))
    order = []
    while pool:
        x = rng.random() * sum(w for _, w in pool)
        for i, (s, w) in enumerate(pool):
            x -= w
            if x < 0 or i == len(pool) - 1:
                order.append((s, chance[s]))
                pool.pop(i)
                break
    return order


def session_seed(arg: str | None) -> str:
    return arg or os.environ.get("CLAUDE_CODE_SESSION_ID") or os.urandom(8).hex()


def audio_mb(root: Path = ROOT) -> int:
    """`du -cm ... | tail -1` over the audio folders: disk blocks, total rounded up to MiB."""
    blocks = 0
    for d in AUDIO_DIRS:
        for dirpath, _, files in os.walk(root / d):
            blocks += os.lstat(dirpath).st_blocks
            for f in files:
                blocks += os.lstat(os.path.join(dirpath, f)).st_blocks
    return -(-blocks * 512 // (1 << 20))


def post_limits_line() -> str:
    """The front-matter caps for the post a creative PR carries, printed with the draw
    (the 160-character description cap was the top repeated friction, 2026-11-12..15)."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    try:
        from check_post_frontmatter import limits_line
    except ImportError:
        return "post front matter: python3 platform/ci/check_post_frontmatter.py --limits"
    return "post " + limits_line()


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--today", help="YYYY-MM-DD (default: UTC today)")
    ap.add_argument("--root", type=Path, default=ROOT)
    ap.add_argument("--seed", help="seed for the draw (default: CLAUDE_CODE_SESSION_ID)")
    a = ap.parse_args(argv)
    today = dt.date.fromisoformat(a.today) if a.today else dt.datetime.now(dt.timezone.utc).date()
    rows = rank(shelf_dates(a.root), today)
    mb = audio_mb(a.root)
    order = draw(rows, mb, session_seed(a.seed))
    if a.json:
        print(json.dumps({"shelves": rows, "due": order[0][0], "then": [s for s, _ in order[1:]],
                          "chance": dict(order), "most_due": due_shelf(rows, mb), "audio_mb": mb,
                          "audio_cap_mb": AUDIO_CAP_MB}, indent=1))
        return 0
    chance = dict(order)
    print(f"{'shelf':<24}{'last':<12}{'days':>5}{'7d':>4}{'pieces':>8}{'draw':>6}")
    for r in rows:
        c = f"{chance[r['shelf']]:.0%}" if r["shelf"] in chance else "-"
        print(f"{r['shelf']:<24}{r['last'] or '-':<12}{r['days_since'] if r['days_since'] is not None else '-':>5}"
              f"{r['last_7_days']:>4}{r['pieces']:>8}{c:>6}")
    over = mb >= AUDIO_CAP_MB
    skipped = " (writing-podcast skipped: it needs audio)" if over and rows[0]["shelf"] in AUDIO_ONLY else ""
    print(f"due: {order[0][0]} (drawn for this session, weighted to the shelf longest without a piece "
          f"and fewest this week, so concurrent runs spread){skipped}; search open PRs for it before writing")
    if len(order) > 1:
        print("then: " + ", ".join(s for s, _ in order[1:]) + " (if an open PR already covers the one above)")
    verdict = "text only, no new audio" if mb >= AUDIO_CAP_MB else "new audio fits"
    print(f"audio: {mb} MB of {AUDIO_CAP_MB} MB cap ({verdict})")
    print(post_limits_line())
    return 0


if __name__ == "__main__":
    sys.exit(main())
