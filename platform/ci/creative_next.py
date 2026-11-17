#!/usr/bin/env python3
"""Which creative project has gone longest without a new piece, and may it carry audio?

The creative prompt says "pick the project that has gone longest without a
new piece" and to check the audio cap first. Runs answered both by hand: a
`git log` that a shallow clone truncates, then `du`, and a tie whenever
several projects landed on the same day (16 doc_friction reports against
prompts/creative/prompt-0.md, 2026-11-10 to 2026-11-14; one run took "the
lowest PR number", another read per-project git logs by hand).

This reads the pieces' own front matter (`published:` / `date:`), which a
shallow clone has in full, so it needs no history:

    python3 platform/ci/creative_next.py          # table, most overdue first
    python3 platform/ci/creative_next.py --json

Order: oldest newest-piece date first; a tie goes to the project with fewer
pieces in the last 7 days, then fewer pieces overall. It is a default for the
prompt's "unless something is more urgent", not a rule. It does not see open
PRs: search them for the slug it names before writing.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HH = Path("ventures/hearth-and-horizon")
SBC = Path("ventures/saints-by-candlelight")
POD = Path("docs/podcast")
AUDIO_DIRS = (HH / "audio", SBC / "audio", POD / "audio")
# prompts/creative/prompt-0.md, "Audio size": over this, land text only.
AUDIO_CAP_MB = 400
# The writing podcast is audio or nothing (the prompt skips it while over the
# cap); the other projects land text alone then.
AUDIO_ONLY = "Writing podcast (episode per post)"
HH_SHELVES = {
    "hearth-and-horizon": "Hearth & Horizon (science fiction)",
    "for-other-minds": "For Other Minds",
    "little-lamps": "Little Lamps",
}


def front_matter(text: str) -> dict[str, str]:
    m = re.match(r"---\n(.*?)\n---\n", text, re.S)
    out = {}
    for line in (m.group(1).splitlines() if m else []):
        k, sep, v = line.partition(":")
        if sep and not line.startswith((" ", "-")):
            out[k.strip()] = v.strip().strip("\"'")
    return out


def _day(value: str | None) -> str | None:
    m = re.match(r"\d{4}-\d{2}-\d{2}", value or "")
    return m.group(0) if m else None


def pieces(root: Path = ROOT) -> dict[str, list[tuple[str, str]]]:
    """{project label: [(date, slug)]} for every dated piece."""
    out: dict[str, list[tuple[str, str]]] = {label: [] for label in HH_SHELVES.values()}
    for f in sorted((root / HH / "stories").glob("*.md")):
        fm = front_matter(f.read_text(encoding="utf-8"))
        label, day = HH_SHELVES.get(fm.get("shelf", "")), _day(fm.get("published"))
        if label and day:
            out[label].append((day, f.stem))
    sbc = out.setdefault("Saints by Candlelight (podcast)", [])
    for f in sorted((root / SBC / "episodes").glob("*.md")):
        day = _day(front_matter(f.read_text(encoding="utf-8")).get("published"))
        if day:
            sbc.append((day, f.stem))
    pod = out.setdefault(AUDIO_ONLY, [])
    for f in sorted((root / POD).glob("*.md")):
        day = _day(front_matter(f.read_text(encoding="utf-8")).get("date")) or _day(f.name)
        if day:
            pod.append((day, f.stem))
    return out


def ranked(found: dict[str, list[tuple[str, str]]], today: dt.date) -> list[dict]:
    week = (today - dt.timedelta(days=7)).isoformat()
    rows = []
    for label, items in found.items():
        newest = max(items) if items else (None, None)
        rows.append({
            "project": label,
            "pieces": len(items),
            "last_date": newest[0],
            "last_slug": newest[1],
            "days_since": (today - dt.date.fromisoformat(newest[0])).days if newest[0] else None,
            "last_7_days": sum(1 for d, _ in items if d > week),
        })
    rows.sort(key=lambda r: (r["last_date"] or "", r["last_7_days"], r["pieces"], r["project"]))
    return rows


def audio_mb(root: Path = ROOT) -> float:
    # Allocated blocks, as `du -cm` (the prompt's command) counts them.
    total = sum(f.stat().st_blocks * 512 for d in AUDIO_DIRS for f in (root / d).rglob("*") if f.is_file())
    return total / (1 << 20)


def podcast_gap(root: Path = ROOT) -> int:
    """Blog posts with no writing-podcast episode (`post:` in an episode names the post's slug)."""
    covered = {front_matter(f.read_text(encoding="utf-8")).get("post") for f in (root / POD).glob("*.md")}
    posts = {re.sub(r"^\d{4}-\d{2}-\d{2}-", "", f.stem) for f in (root / "docs" / "posts").glob("*.md")}
    return len(posts - covered)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--root", default=str(ROOT))
    ap.add_argument("--today", help="YYYY-MM-DD (default: today, UTC)")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)
    root = Path(args.root)
    today = dt.date.fromisoformat(args.today) if args.today else dt.datetime.now(dt.timezone.utc).date()
    rows = ranked(pieces(root), today)
    mb = audio_mb(root)
    result = {"today": today.isoformat(), "projects": rows, "audio_mb": round(mb),
              "audio_cap_mb": AUDIO_CAP_MB, "audio_allowed": mb <= AUDIO_CAP_MB,
              "posts_without_episode": podcast_gap(root)}
    open_rows = [r for r in rows if result["audio_allowed"] or r["project"] != AUDIO_ONLY]
    result["next"] = open_rows[0]["project"] if open_rows else None
    if args.json:
        print(json.dumps(result, indent=2))
        return 0
    print(f"Creative projects, most overdue first (front-matter dates; today {today}, UTC):")
    for r in rows:
        since = "never" if r["days_since"] is None else f"{r['days_since']:>3} d ago"
        skip = "  (needs audio: skipped while over cap)" if r not in open_rows else ""
        print(f"  {r['project']:<38} {since}  {r['last_7_days']:>3} in 7 d  {r['pieces']:>4} total"
              f"  last: {r['last_slug'] or '-'}{skip}")
    if result["next"]:
        print(f"Next by this order: {result['next']}. Search open PRs for its name before writing.")
    verdict = "audio allowed" if result["audio_allowed"] else "over cap: text only, or move enclosures off Pages"
    print(f"Audio: {mb:.0f} MB of {AUDIO_CAP_MB} MB ({verdict}); "
          f"{result['posts_without_episode']} blog posts have no podcast episode.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
