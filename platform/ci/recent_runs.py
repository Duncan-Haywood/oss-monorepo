#!/usr/bin/env python3
"""What recent runs of one track did, read from their run records, not git.

    python3 platform/ci/recent_runs.py --track explore            # last 7 days
    python3 platform/ci/recent_runs.py --track creative --days 2 --grep lamps
    python3 platform/ci/recent_runs.py --track research --limit 50 --json

One line per run, newest first: when it ended, outcome, PR, and what it was
about (the record's `task` or `goal`, else its first post's title, else the
start of `notes`), plus the projects it touched.

Why: runs that must avoid repeating recent work kept asking git, and a cloud
clone is shallow. `git log -15 -- <creative dirs>` showed one to three commits
(three creative records, 2026-11-12/13), and an explore run grepped
`prompts/runs/*.json` by hand to list recent ideas because no command did it
(explore record, 2026-11-13T01:51). The records are in every checkout in full,
so this answers "what did the last runs of my track do" in under a second.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUNS = ROOT / "prompts" / "runs"
TOPIC_CHARS = 110


def _when(rec: dict) -> str:
    """Best timestamp a record carries: `ended`, then `started`, then `date`."""
    for key in ("ended", "started", "date"):
        v = rec.get(key)
        if isinstance(v, str) and v:
            return v
    return ""


def _parse(stamp: str) -> datetime | None:
    try:
        d = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def pr_number(pr) -> int | None:
    if isinstance(pr, int):
        return pr
    if isinstance(pr, str):
        m = re.search(r"(\d+)\s*$", pr.strip().rstrip("/"))
        return int(m.group(1)) if m else None
    if isinstance(pr, list) and pr:
        return pr_number(pr[0])
    return None


def post_title(path: str, root: Path = ROOT) -> str | None:
    """`title:` from a docs/posts/*.md front matter, or None."""
    if not isinstance(path, str) or not path.startswith("docs/posts/"):
        return None
    f = root / path.split("#", 1)[0]
    try:
        head = f.read_text(encoding="utf-8")[:2000]
    except OSError:
        return None
    m = re.search(r"^title:\s*(.+)$", head, re.M)
    return m.group(1).strip().strip("\"'") if m else None


def topic(rec: dict, root: Path = ROOT) -> str:
    for key in ("task", "goal"):
        v = rec.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()
    for w in rec.get("writeups") or []:
        t = post_title(w, root)
        if t:
            return f"post: {t}"
    notes = rec.get("notes")
    if isinstance(notes, list):
        notes = " ".join(str(n) for n in notes)
    if isinstance(notes, str) and notes.strip():
        return notes.strip()
    return "(record names no task, goal, post or notes)"


def _short(text: str, n: int = TOPIC_CHARS) -> str:
    text = " ".join(text.split())
    return text if len(text) <= n else text[: n - 3].rstrip() + "..."


def load(runs: Path = RUNS, track: str | None = None) -> list[dict]:
    out = []
    for f in runs.glob("*.json"):
        try:
            rec = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if not isinstance(rec, dict) or (track and rec.get("track") != track):
            continue
        rec["_file"] = f.name
        out.append(rec)
    out.sort(key=_when, reverse=True)
    return out


def select(recs: list[dict], days: float | None, limit: int, grep: str | None,
           now: datetime | None = None, root: Path = ROOT) -> list[dict]:
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days) if days else None
    pat = re.compile(grep, re.I) if grep else None
    rows = []
    for rec in recs:
        when = _parse(_when(rec))
        if cutoff and (when is None or when < cutoff):
            continue
        row = {
            "when": _when(rec)[:16].replace("T", " "),
            "outcome": rec.get("outcome"),
            "pr": pr_number(rec.get("pr")),
            "topic": topic(rec, root),
            "projects": [p for p in (rec.get("projects") or []) if isinstance(p, str)],
            "record": rec["_file"],
        }
        if pat and not pat.search(json.dumps({k: v for k, v in rec.items() if k != "input"})):
            continue
        rows.append(row)
        if len(rows) >= limit:
            break
    return rows


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--track", help="explore, creative, research, ventures, ... (default: every track)")
    ap.add_argument("--days", type=float, default=7.0, help="look back this many days (0: no cutoff)")
    ap.add_argument("--limit", type=int, default=30)
    ap.add_argument("--grep", help="keep records whose text matches this regex (case-insensitive)")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    recs = load(track=a.track)
    if a.track and not recs:
        tracks = sorted({r.get("track") for r in load() if isinstance(r.get("track"), str)})
        print(f"no records for track {a.track!r}; tracks with records: {', '.join(tracks)}", file=sys.stderr)
        return 2
    rows = select(recs, a.days or None, a.limit, a.grep)
    if a.json:
        print(json.dumps(rows, indent=1))
        return 0
    span = f"last {a.days:g} days" if a.days else "all time"
    print(f"{len(rows)} {a.track or 'run'} record(s), {span}, newest first"
          + (f", matching /{a.grep}/" if a.grep else ""))
    for r in rows:
        pr = f"#{r['pr']}" if r["pr"] else "no PR"
        proj = f"  [{', '.join(r['projects'][:3])}]" if r["projects"] else ""
        print(f"{r['when']}  {str(r['outcome'] or '?'):8} {pr:7} {_short(r['topic'])}{proj}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
