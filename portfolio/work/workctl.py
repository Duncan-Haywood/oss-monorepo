#!/usr/bin/env python3
"""Directions and tasks: list them, pick the next one, see which get work.

The owner, 2026-11-03: "i think it also makes sense to vamp up the structure
of the task and direction handling system." Directions were prose only, so no
script could say which were starved. This reads two files:

- portfolio/work/directions.yaml: the owner's directions, with a weight and
  the paths whose commits count as work on each;
- portfolio/work/tasks.yaml: concrete tasks under a direction.

Usage:
    python3 portfolio/work/workctl.py list [--direction ID] [--all]
    python3 portfolio/work/workctl.py next [-n 5] [--offline] [--days 7]
    python3 portfolio/work/workctl.py coverage [--days 7] [--fetch]
    python3 portfolio/work/workctl.py validate

`next` ranks open, unblocked tasks by direction weight times a starvation
factor (directions with fewer recent commits on main pull harder), and skips
tasks whose id appears as `[work:<id>]` in an open PR title. It reads only
files and git, plus one GitHub search when `gh` works; `--offline` skips it.
"""
from __future__ import annotations

import argparse
import fnmatch
import json
import re
import subprocess
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
DIRECTIONS = HERE / "directions.yaml"
TASKS = HERE / "tasks.yaml"
GH_REPO = "duncan-haywood/oss-monorepo"

KINDS = {"area", "principle"}
DIRECTION_STATUS = {"active", "paused", "retired"}
TASK_STATUS = {"open", "done", "dropped"}
SLUG = re.compile(r"^[a-z0-9][a-z0-9-]*$")


def load(path: Path, key: str) -> list[dict]:
    data = yaml.safe_load(path.read_text()) or {}
    return list(data.get(key) or [])


def _as_date(v) -> date | None:
    if isinstance(v, date):
        return v
    try:
        return date.fromisoformat(str(v))
    except ValueError:
        return None


def validate(directions: list[dict], tasks: list[dict], repo: Path = REPO,
             files: list[str] | None = None) -> tuple[list[str], list[str]]:
    """Return (errors, warnings)."""
    errors: list[str] = []
    warnings: list[str] = []
    ids: set[str] = set()
    areas: set[str] = set()
    for d in directions:
        did = d.get("id", "?")
        where = f"direction {did}"
        if not SLUG.match(str(did)):
            errors.append(f"{where}: id must be a lowercase slug")
        if did in ids:
            errors.append(f"{where}: duplicate id")
        ids.add(did)
        for f in ("title", "kind", "set", "source", "status"):
            if not d.get(f):
                errors.append(f"{where}: missing {f}")
        if d.get("kind") not in KINDS:
            errors.append(f"{where}: kind must be one of {sorted(KINDS)}")
        if d.get("status") not in DIRECTION_STATUS:
            errors.append(f"{where}: status must be one of {sorted(DIRECTION_STATUS)}")
        if d.get("set") is not None and _as_date(d.get("set")) is None:
            errors.append(f"{where}: set must be YYYY-MM-DD")
        src = str(d.get("source") or "").strip()
        if src and not (repo / src).exists():
            errors.append(f"{where}: source {src} does not exist")
        if d.get("kind") == "area":
            areas.add(did)
            w = d.get("weight", 1)
            if not isinstance(w, (int, float)) or w <= 0:
                errors.append(f"{where}: weight must be a positive number")
            paths = d.get("paths") or []
            if not paths:
                errors.append(f"{where}: an area needs at least one path glob")
            if files is not None:
                for g in paths:
                    if not any(fnmatch.fnmatch(f, g) for f in files):
                        warnings.append(f"{where}: {g} matches nothing yet")
    tids: set[str] = set()
    for t in tasks:
        tid = t.get("id", "?")
        where = f"task {tid}"
        if not SLUG.match(str(tid)):
            errors.append(f"{where}: id must be a lowercase slug")
        if tid in tids:
            errors.append(f"{where}: duplicate id")
        tids.add(tid)
        for f in ("direction", "title", "done_when", "status", "added"):
            if not t.get(f):
                errors.append(f"{where}: missing {f}")
        if t.get("direction") and t["direction"] not in areas:
            errors.append(f"{where}: direction {t['direction']} is not an area in directions.yaml")
        if t.get("status") not in TASK_STATUS:
            errors.append(f"{where}: status must be one of {sorted(TASK_STATUS)}")
        if t.get("status") == "done" and not (t.get("pr") or t.get("notes")):
            errors.append(f"{where}: a done task needs pr (or notes saying where it landed)")
        if t.get("added") is not None and _as_date(t.get("added")) is None:
            errors.append(f"{where}: added must be YYYY-MM-DD")
        h = t.get("hours")
        if h is not None and (not isinstance(h, (int, float)) or h <= 0):
            errors.append(f"{where}: hours must be a positive number")
    return errors, warnings


def tracked_files(repo: Path = REPO) -> list[str]:
    out = subprocess.run(["git", "ls-files"], cwd=repo, capture_output=True, text=True)
    return out.stdout.splitlines()


def commit_files(days: int, repo: Path = REPO, ref: str = "origin/main") -> tuple[list[list[str]], str | None]:
    """Files changed per non-merge commit on `ref` in the last `days` days.

    Returns (commits, oldest local commit date) so a caller can say when a
    shallow clone does not reach back far enough."""
    since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    out = subprocess.run(
        ["git", "log", ref, "--no-merges", f"--since={since}", "--name-only", "--format=@@%H"],
        cwd=repo, capture_output=True, text=True)
    commits: list[list[str]] = []
    for line in out.stdout.splitlines():
        if line.startswith("@@"):
            commits.append([])
        elif line.strip() and commits:
            commits[-1].append(line.strip())
    oldest = subprocess.run(["git", "log", ref, "--reverse", "--format=%cs"],
                            cwd=repo, capture_output=True, text=True).stdout.split("\n", 1)[0] or None
    return commits, oldest


def coverage(directions: list[dict], commits: list[list[str]]) -> dict[str, int]:
    """Commits touching each area's paths. One commit can count for several."""
    counts: dict[str, int] = {}
    for d in directions:
        if d.get("kind") != "area" or d.get("status") != "active":
            continue
        globs = d.get("paths") or []
        counts[d["id"]] = sum(
            1 for files in commits
            if any(fnmatch.fnmatch(f, g) for f in files for g in globs))
    return counts


def taken_ids(offline: bool) -> tuple[set[str], str]:
    """Task ids named as [work:<id>] in open PR titles."""
    if offline:
        return set(), "open PRs not checked (--offline)"
    try:
        out = subprocess.run(
            ["gh", "api", "-X", "GET", "search/issues",
             "-f", f"q=repo:{GH_REPO} is:pr is:open in:title \"work:\"",
             "--jq", "[.items[].title]"],
            capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.TimeoutExpired):
        return set(), "open PRs not checked (gh unavailable)"
    if out.returncode != 0:
        return set(), "open PRs not checked (gh search failed)"
    try:
        titles = json.loads(out.stdout or "[]")
    except json.JSONDecodeError:
        return set(), "open PRs not checked (unreadable gh output)"
    found = {m for t in titles for m in re.findall(r"\[work:([a-z0-9-]+)\]", t)}
    return found, f"checked {len(titles)} open PR title(s) naming work:"


def rank(directions: list[dict], tasks: list[dict], counts: dict[str, int],
         taken: set[str]) -> list[tuple[float, dict]]:
    by_id = {d["id"]: d for d in directions}
    total = sum(counts.values()) or 1
    ranked = []
    for t in tasks:
        d = by_id.get(t.get("direction"))
        if (t.get("status") != "open" or t.get("blocked_on") or t["id"] in taken
                or not d or d.get("status") != "active"):
            continue
        share = counts.get(d["id"], 0) / total
        score = float(d.get("weight", 1)) / (1.0 + 10.0 * share)
        ranked.append((round(score, 3), t))
    ranked.sort(key=lambda st: (-st[0], str(st[1].get("added")), st[1]["id"]))
    return ranked


def cmd_list(args, directions, tasks) -> int:
    by_dir: dict[str, list[dict]] = {}
    for t in tasks:
        if args.all or t.get("status") == "open":
            by_dir.setdefault(t["direction"], []).append(t)
    for d in directions:
        if args.direction and d["id"] != args.direction:
            continue
        if d.get("kind") != "area" and not args.all:
            continue
        mine = by_dir.get(d["id"], [])
        print(f"{d['id']}  [{d.get('kind')}, {d.get('status')}, weight {d.get('weight', '-')}]  {d['title']}")
        print(f"    source: {d.get('source')}" + (f", \"{d['section']}\"" if d.get("section") else ""))
        for t in mine:
            extra = f"  (blocked: {t['blocked_on']})" if t.get("blocked_on") else ""
            pr = f"  PR {t['pr']}" if t.get("pr") else ""
            print(f"    - {t['id']} [{t['status']}, ~{t.get('hours', '?')} h]{pr}{extra}: {t['title']}")
    return 0


def cmd_next(args, directions, tasks) -> int:
    commits, oldest = commit_files(args.days)
    counts = coverage(directions, commits)
    taken, note = taken_ids(args.offline)
    ranked = rank(directions, tasks, counts, taken)
    print(f"Open tasks, best first ({note}; {len(commits)} commits on main in {args.days} days"
          + (f", local history from {oldest}" if oldest else "") + "):")
    for score, t in ranked[: args.n]:
        print(f"  {score:>5}  {t['id']}  ({t['direction']}, {counts.get(t['direction'], 0)} recent commits)")
        print(f"         {t['title']}")
        print(f"         done when: {' '.join(str(t['done_when']).split())}")
    if not ranked:
        print("  none open: add tasks to portfolio/work/tasks.yaml under a starved direction")
    elif ranked:
        print(f"\nPut [work:{ranked[0][1]['id']}] in the PR title so other sessions skip it.")
    return 0


def _shallow_fetch(args, cwd, timeout=None):
    """`git fetch <args>` through platform/ci/shallow_repair.py, which drops the bogus
    `.git/shallow` entry a --shallow-since fetch can leave (every later fetch then failed with
    "error in object: unshallow", 2026-11-14). Falls back to a plain fetch if it cannot load."""
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "platform" / "ci"))
        import shallow_repair
        return shallow_repair.fetch(args, cwd=cwd, timeout=timeout, run=subprocess.run)
    except ImportError:
        return subprocess.run(["git", "fetch", *args], cwd=cwd, capture_output=True, text=True, timeout=timeout)


def cmd_coverage(args, directions, tasks) -> int:
    if args.fetch:
        since = (datetime.now(timezone.utc) - timedelta(days=args.days + 1)).strftime("%Y-%m-%d")
        _shallow_fetch(["-q", f"--shallow-since={since}", "origin", "main"], cwd=REPO)
    commits, oldest = commit_files(args.days)
    counts = coverage(directions, commits)
    open_by = {}
    for t in tasks:
        if t.get("status") == "open":
            open_by[t["direction"]] = open_by.get(t["direction"], 0) + 1
    print(f"Commits on main touching each active area, last {args.days} days "
          f"({len(commits)} commits" + (f"; local history from {oldest}, use --fetch if that is too short" if oldest else "") + "):")
    for did, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])):
        flag = "  <- no work in the window" if n == 0 else ""
        print(f"  {n:>5}  {did}  ({open_by.get(did, 0)} open task(s)){flag}")
    return 0


def cmd_validate(args, directions, tasks) -> int:
    errors, warnings = validate(directions, tasks, files=tracked_files())
    for w in warnings:
        print(f"note: {w}")
    for e in errors:
        print(f"error: {e}")
    if errors:
        return 1
    print(f"ok: {len(directions)} direction(s), {len(tasks)} task(s)")
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("list", help="directions and their open tasks")
    s.add_argument("--direction")
    s.add_argument("--all", action="store_true", help="include principles and closed tasks")
    s = sub.add_parser("next", help="the best open tasks to start")
    s.add_argument("-n", type=int, default=5)
    s.add_argument("--days", type=int, default=7)
    s.add_argument("--offline", action="store_true")
    s = sub.add_parser("coverage", help="recent commits per direction")
    s.add_argument("--days", type=int, default=7)
    s.add_argument("--fetch", action="store_true", help="deepen a shallow clone to cover the window")
    sub.add_parser("validate", help="check both files")
    args = p.parse_args(argv)
    directions = load(DIRECTIONS, "directions")
    tasks = load(TASKS, "tasks")
    return {"list": cmd_list, "next": cmd_next, "coverage": cmd_coverage,
            "validate": cmd_validate}[args.cmd](args, directions, tasks)


if __name__ == "__main__":
    sys.exit(main())
