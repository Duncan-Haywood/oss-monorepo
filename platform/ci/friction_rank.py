#!/usr/bin/env python3
"""Rank the doc friction that runs keep reporting, by file and by problem.

Every run record in prompts/runs/ carries a `doc_friction` list of
{"file", "issue"} entries. `promptctl.py` only totals them, so the same
problem got reported over and over without anyone seeing it was the same
problem: a missing `security-alerts` branch in prompt.md step 0 was written
up by dozens of runs, the redteam `--record` flag cost two wasted campaigns.

This groups entries by normalised file, then clusters the issues inside each
file by word overlap, and prints the clusters ranked by how many distinct
sessions reported them. A cluster whose last report is old has probably been
fixed; one still reported this week is the process track's next job.

    python3 platform/ci/friction_rank.py [--days 14] [--min 2] [--top 20] [--json]

Software for the routine (prompts/goals.md): the counting is done here, so a
run spends its time on the fix, not on grepping 4,000 records.
"""
import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUNS = ROOT / "prompts" / "runs"

STOP = set("""a an the and or of to in on for is are was were be been it its this that
with as at by from not no but so if then than into out up has have had do does did
one two all any can could would should may might must says said say only also when
which what who how why there their they them we i my me you your run runs step file
files""".split())

SIMILAR = 0.25  # Jaccard overlap with any member that puts an issue in a cluster
PROBE = 40  # members compared per cluster (single link), to keep this fast
NO_FRICTION = re.compile(r"\s*(none|no friction|nothing)\b[^.;:]{0,20}([.;:]|$)", re.I)  # as promptctl.py


def norm_file(f):
    """'prompts/polish/reports (2026-10-30-x)' -> 'prompts/polish/reports'."""
    f = (f or "").strip().strip("`")
    f = re.sub(r"\s*\(.*?\)\s*", "", f)
    f = re.split(r"\s+and\s+|,\s*", f)[0]
    f = re.sub(r":\d+(-\d+)?$", "", f)  # drop line numbers
    return f or "(unknown)"


def words(text):
    toks = re.findall(r"[a-z][a-z0-9_\-.]{2,}", (text or "").lower())
    return {t.strip(".-") for t in toks if t not in STOP}


def jaccard(a, b):
    return len(a & b) / len(a | b) if a and b else 0.0


def load(runs_dir=RUNS):
    """Yield (date, session, file, issue) for every friction entry."""
    for p in sorted(Path(runs_dir).glob("*.json")):
        try:
            rec = json.loads(p.read_text())
        except (OSError, ValueError):
            continue
        if not isinstance(rec, dict):
            continue
        date = str(rec.get("date") or p.name[:10])
        session = str(rec.get("session") or p.stem)
        items = rec.get("doc_friction") or []
        if not isinstance(items, list):
            continue
        for it in items:
            if isinstance(it, dict) and it.get("issue") and not NO_FRICTION.match(str(it["issue"])):
                yield date, session, norm_file(it.get("file")), str(it["issue"])


def cluster(entries):
    """Group entries into clusters of the same problem in the same file."""
    clusters = []  # each: {"file", "members": [word sets], "items": [...]}
    for date, session, f, issue in entries:
        w = words(issue)
        best, score = None, 0.0
        for c in clusters:
            if c["file"] != f:
                continue
            s = max(jaccard(w, m) for m in c["members"][-PROBE:])
            if s > score:
                best, score = c, s
        if best is not None and score >= SIMILAR:
            best["items"].append((date, session, issue))
            best["members"].append(w)
        else:
            clusters.append({"file": f, "members": [w], "items": [(date, session, issue)]})
    out = []
    for c in clusters:
        sessions = {s for _, s, _ in c["items"]}
        dates = sorted(d for d, _, _ in c["items"])
        out.append({
            "file": c["file"],
            "sessions": len(sessions),
            "reports": len(c["items"]),
            "first": dates[0],
            "last": dates[-1],
            "example": max((i for _, _, i in c["items"]), key=len)[:240],
        })
    out.sort(key=lambda c: (c["sessions"], c["last"]), reverse=True)
    return out


def rank(entries, days=None, today=None, min_sessions=2):
    entries = list(entries)
    if days is not None:
        today = today or dt.date.today()
        cut = (today - dt.timedelta(days=days)).isoformat()
        entries = [e for e in entries if e[0] >= cut]
    return [c for c in cluster(entries) if c["sessions"] >= min_sessions]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--runs", default=str(RUNS))
    ap.add_argument("--days", type=int, default=14, help="only reports this recent (0 = all)")
    ap.add_argument("--min", type=int, default=2, help="minimum distinct sessions")
    ap.add_argument("--top", type=int, default=20)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    ranked = rank(load(a.runs), days=a.days or None, min_sessions=a.min)[: a.top]
    if a.json:
        json.dump(ranked, sys.stdout, indent=2)
        print()
        return 0
    if not ranked:
        print("No friction reported by more than one session in that window.")
        return 0
    print(f"Repeated doc friction, last {a.days or 'all'} days (distinct sessions, first..last report):\n")
    for i, c in enumerate(ranked, 1):
        print(f"{i:>2}. {c['sessions']:>3}x  {c['file']}  ({c['first']}..{c['last']})")
        print(f"       {c['example']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
