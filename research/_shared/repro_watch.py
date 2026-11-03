#!/usr/bin/env python3
"""Weekly reproducibility watch: re-run a rotating sample of research projects.

`research/swe-audit` showed, once, that committed results reproduce (86 of 92
in October 2026). A one-off check cannot see drift: a tool upgrade changing an
output format (Yosys 0.70's `stat` broke verified-dse rung 1 on 2026-11-01), a
dependency bump, a sibling project edited underneath a project that imports it.
This re-runs a different seeded sample each ISO week, plus any projects whose
files changed recently, with the same harness (`swe_audit.audit`), and says
which ones no longer give their committed `experiments/results.txt`.

    python3 research/_shared/repro_watch.py [--n 12] [--seed WEEK] [--timeout 600]
        [--changed-days 7] [--max-changed 8] [--out DIR] [--strict]

Exit 1 when a project ran to the end and gave different numbers (`differs`),
which is a research-integrity question, not an environment one. `--strict`
also fails on `crashed`. `tool-missing` and `timeout` are listed, not failed:
they say the environment drifted, and the summary names the tool.

Nothing in the repository is written: each project runs in a temporary copy.
"""
import argparse
import datetime as dt
import json
import os
import subprocess
import sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
RESEARCH = HERE.parent
ROOT = RESEARCH.parent
sys.path.insert(0, str(RESEARCH / "swe-audit" / "src"))
from swe_audit.audit import (candidates, readme_traceability, run_project,  # noqa: E402
                             sample, summarise)

FAIL = {"differs"}


def week_seed(today=None):
    y, w, _ = (today or dt.date.today()).isocalendar()
    return y * 100 + w


BULK = 20  # a commit touching more projects than this is a sweep (or a shallow clone's graft), not a change


def changed_projects(days, pool, root=ROOT):
    """Projects in `pool` touched by a non-bulk commit in the last `days` days, newest first."""
    try:
        out = subprocess.run(["git", "log", f"--since={days} days ago", "--name-only", "--format=@@%H", "--", "research/"],
                             cwd=root, capture_output=True, text=True, timeout=60, check=True).stdout
    except (OSError, subprocess.SubprocessError):
        return []
    seen = []
    for commit in out.split("@@")[1:]:
        slugs = []
        for line in commit.splitlines()[1:]:
            parts = line.split("/")
            if len(parts) > 2 and parts[1] in pool and parts[1] not in slugs:
                slugs.append(parts[1])
        if len(slugs) <= BULK:
            seen += [x for x in slugs if x not in seen]
    return seen


def pick(n, seed, changed_days, max_changed, research=RESEARCH):
    pool = candidates(str(research))
    recent = changed_projects(changed_days, set(pool))[:max_changed] if changed_days else []
    rest = [s for s in sample(pool, n + len(recent), seed) if s not in recent][:n]
    return recent, rest


def render(rows, seed, recent):
    c = Counter(r["status"] for r in rows)
    s = summarise(rows) if rows else None
    lines = [f"# Reproducibility watch, seed {seed}", "",
             f"{len(rows)} projects re-run ({len(recent)} changed recently, the rest a seeded sample).", ""]
    if s:
        lo, hi = s["ci_reproduced"]
        lines.append(f"Reproduced (identical or timing-only): {s['reproduced']}/{s['n']} (95% Wilson {lo:.0%} to {hi:.0%}).")
    lines.append("Status counts: " + ", ".join(f"{k} {v}" for k, v in sorted(c.items())) + ".")
    lines += ["", "| project | status | diff lines | seconds | why recent | last stderr line |", "|---|---|---|---|---|---|"]
    for r in sorted(rows, key=lambda r: (r["status"] in ("identical", "timing-only"), r["slug"])):
        lines.append(f"| {r['slug']} | {r['status']} | {r['diff_lines']} | {r['seconds']} | "
                     f"{'changed' if r['slug'] in recent else 'sample'} | {r['error'].replace('|', '/')} |")
    return "\n".join(lines) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--n", type=int, default=12, help="seeded sample size")
    ap.add_argument("--seed", type=int, default=None, help="default: YYYYWW of this ISO week")
    ap.add_argument("--timeout", type=int, default=600)
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--changed-days", type=int, default=7)
    ap.add_argument("--max-changed", type=int, default=8)
    ap.add_argument("--out", default=None, help="directory for repro-watch.json and .md")
    ap.add_argument("--strict", action="store_true", help="also fail on crashed")
    ap.add_argument("--dry-run", action="store_true", help="print the projects, run nothing")
    a = ap.parse_args(argv)
    seed = a.seed if a.seed is not None else week_seed()
    recent, rest = pick(a.n, seed, a.changed_days, a.max_changed)
    slugs = recent + rest
    if a.dry_run:
        print("\n".join(f"{s}\t{'changed' if s in recent else 'sample'}" for s in slugs))
        return 0
    with ThreadPoolExecutor(a.workers) as ex:
        rows = list(ex.map(lambda s: run_project(str(RESEARCH), s, a.timeout), slugs))
    for r in rows:
        r["readme"] = readme_traceability(str(RESEARCH), r["slug"])
    md = render(rows, seed, recent)
    print(md)
    if a.out:
        out = Path(a.out)
        out.mkdir(parents=True, exist_ok=True)
        (out / "repro-watch.md").write_text(md)
        (out / "repro-watch.json").write_text(json.dumps({"seed": seed, "recent": recent, "rows": rows}, indent=2) + "\n")
    bad = FAIL | ({"crashed"} if a.strict else set())
    failed = [r["slug"] for r in rows if r["status"] in bad]
    if failed:
        print("NO LONGER REPRODUCE: " + ", ".join(failed), file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
