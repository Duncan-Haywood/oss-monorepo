#!/usr/bin/env python3
"""Measure what a run record can be measured on instead of typed: PR facts and rework.

    python3 prompts/derive.py fetch     # PR facts from the GitHub API into derived/github.json
    python3 prompts/derive.py build     # join records, PR facts and git into derived/runs.json
    python3 prompts/derive.py report    # coverage and rework, by track, version and model

Most run-record fields are typed by the agent at the end of its run, and most
runs never type them: of 441 records on 2026-10-16, 31 said whether their PR
merged and 5 had a cost. Every one of those facts already exists somewhere a
script can read it. This file reads them, so the record only has to carry what
needs judgment (outcome, friction, deviations).

What it measures, per record that names a pull request:

- From the GitHub API: whether the PR merged, when, how long it was open, its
  size, and how many of its commits had a failing check run (`ci_red_commits`).
- From git, once the PR has been on its branch for `WINDOW_DAYS`:
  `reverted` (a later commit says "This reverts commit <sha>"),
  `followups` (later commits on the same branch that name the PR's number),
  and `survival`, the share of the lines the PR added that `git blame` still
  attributes to it at the end of the window. Low survival means the work was
  rewritten soon after it landed, which is the rework the scoring rules in
  `goals.md` ask about and no record has ever typed.

Records are never edited: their files belong to the run that wrote them, and
mirrored records are pinned by `research/_mirror/mirror.py`. The measured
values live in `prompts/derived/`, which this script regenerates, and
`promptctl.py measure` reads them where a record's own field is null.

Standard library only. The API calls go through the session's proxy, which
authenticates them; a `GITHUB_TOKEN` in the environment is used when present.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

import promptctl

ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parent
DERIVED = ROOT / "derived"
GITHUB_CACHE = DERIVED / "github.json"
RUNS_OUT = DERIVED / "runs.json"

HOME_REPO = "Duncan-Haywood/oss-monorepo"
RESEARCH_REPO = "Duncan-Haywood/oss-research-monorepo"
MIRROR_STATE = REPO_ROOT / "research" / "_mirror" / "state.json"
WINDOW_DAYS = 14
RED = {"failure", "timed_out", "startup_failure"}
# A PR's last commits checked for CI: a history merge carries thousands, and CI
# runs only on pushed heads, so older commits mostly have no check runs at all.
CI_COMMITS = 30
PR_URL_RE = re.compile(r"github\.com/([^/\s]+/[^/\s]+)/pull/(\d+)")
# Machine-written or vendored paths: churn there says nothing about rework.
EXCLUDED = (re.compile(r"^(gitops/prod/|prompts/runs/|prompts/derived/)"),
            re.compile(r"(^|/)(package-lock\.json|[^/]*\.min\.(js|css)|[^/]*\.lock)$"))
# In this repository research/ is a copy of the upstream repository, whose own PRs measure it.
MIRRORED = re.compile(r"^research/")


def parse_pr(rec: dict[str, Any]) -> tuple[str, int] | None:
    """The (owner/repo, number) a record's `pr` names, or None."""
    pr = rec.get("pr")
    default = rec.get("repo") or (RESEARCH_REPO if rec.get("source") == promptctl.MIRRORED_RUNS_SOURCE
                                  else HOME_REPO)
    if isinstance(pr, bool):
        return None
    if isinstance(pr, int):
        return (default, pr) if pr > 0 else None
    if not isinstance(pr, str):
        return None
    m = PR_URL_RE.search(pr)
    if m:
        return m.group(1), int(m.group(2))
    m = re.fullmatch(r"\s*#?(\d+)\s*", pr)
    return (default, int(m.group(1))) if m else None


def key(repo: str, number: int) -> str:
    return f"{repo.lower()}#{number}"


# --------------------------------------------------------------------------
# fetch


def http_get(path: str) -> Any:
    req = urllib.request.Request(f"https://api.github.com{path}",
                                 headers={"Accept": "application/vnd.github+json",
                                          "User-Agent": "prompts-derive"})
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code not in (403, 429, 500, 502, 503) or attempt == 3:
                raise
        except urllib.error.URLError:
            if attempt == 3:
                raise
        time.sleep(2 ** (attempt + 1))
    return None


def ci_summary(runs_by_commit: list[list[dict[str, Any]]]) -> dict[str, Any]:
    """CI over a PR's commits, oldest first: how many had a red check run, and the head's state."""
    def state(runs: list[dict[str, Any]]) -> str:
        if not runs:
            return "none"
        if any(r.get("conclusion") in RED for r in runs):
            return "red"
        if any(r.get("status") != "completed" for r in runs):
            return "pending"
        return "green"
    states = [state(r) for r in runs_by_commit]
    return {"commits_checked": len(states), "red_commits": states.count("red"),
            "unchecked_commits": states.count("none"), "head": states[-1] if states else "none"}


def fetch_pr(repo: str, number: int, get: Callable[[str], Any] = http_get) -> dict[str, Any] | None:
    pr = get(f"/repos/{repo}/pulls/{number}")
    if not pr:
        return None
    facts = {k: pr.get(k) for k in ("state", "merged", "created_at", "merged_at", "closed_at",
                                     "additions", "deletions", "changed_files", "commits",
                                     "merge_commit_sha")}
    facts["base"] = (pr.get("base") or {}).get("ref")
    facts["head_sha"] = (pr.get("head") or {}).get("sha")
    facts["same_repo"] = ((pr.get("head") or {}).get("repo") or {}).get("full_name", "").lower() == repo.lower()
    shas = [c["sha"] for c in (get(f"/repos/{repo}/pulls/{number}/commits?per_page=100") or [])]
    shas = shas[-CI_COMMITS:]
    runs_by_commit = []
    for sha in shas:
        runs, page = [], 1
        while True:
            body = get(f"/repos/{repo}/commits/{sha}/check-runs?per_page=100&page={page}") or {}
            batch = body.get("check_runs") or []
            runs += batch
            if len(batch) < 100:
                break
            page += 1
        runs_by_commit.append(runs)
    facts["ci"] = ci_summary(runs_by_commit)
    facts["fetched_at"] = now_iso()
    return facts


def is_final(facts: dict[str, Any]) -> bool:
    return facts.get("state") == "closed" and facts.get("ci", {}).get("head") != "pending"


def fetch(root: Path = ROOT, refresh: bool = False, get: Callable[[str], Any] = http_get,
          log: Callable[[str], None] = print) -> dict[str, Any]:
    cache = load_json(root / "derived" / "github.json", {})
    wanted = sorted({key(*ref): ref for _, rec in promptctl.load_runs(root)
                     if (ref := parse_pr(rec))}.items())
    todo = [(k, ref) for k, ref in wanted if refresh or k not in cache or not is_final(cache[k])]
    log(f"{len(wanted)} pull request(s) named by run records; fetching {len(todo)}")
    def safe(item: Any) -> tuple[str, Any]:
        try:
            return item[0], fetch_pr(*item[1], get)
        except (urllib.error.URLError, OSError) as e:  # 403 without a token, network down
            return item[0], e

    failed = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = pool.map(safe, todo)
        for i, (k, facts) in enumerate(results, 1):
            if isinstance(facts, Exception):
                failed += 1  # leave it uncached so the next fetch retries it
                continue
            cache[k] = facts if facts is not None else {"missing": True, "fetched_at": now_iso()}
            if i % 25 == 0:
                log(f"  {i}/{len(todo)}")
                write_json(root / "derived" / "github.json", cache)
    write_json(root / "derived" / "github.json", cache)
    if failed:
        log(f"{failed} of {len(todo)} could not be fetched (set GITHUB_TOKEN if the proxy returns 403); "
            "kept the cache and carried on")
    return cache


# --------------------------------------------------------------------------
# rework, from git


def git(*args: str, cwd: Path = REPO_ROOT, check: bool = True) -> str:
    out = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True)
    if check and out.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)}: {out.stderr.strip()}")
    return out.stdout


def has_commit(sha: str | None, cwd: Path) -> bool:
    return bool(sha) and subprocess.run(["git", "cat-file", "-e", f"{sha}^{{commit}}"], cwd=cwd,
                                        capture_output=True).returncode == 0


def lineage_head(repo: str, cwd: Path) -> str | None:
    """The tip of the branch a repo's PRs landed on, as this clone has it."""
    if repo.lower() == HOME_REPO.lower():
        for ref in ("origin/main", "main"):
            if git("rev-parse", "--verify", "-q", ref, cwd=cwd, check=False).strip():
                return ref
        return None
    if repo.lower() == RESEARCH_REPO.lower() and MIRROR_STATE.is_file():
        return json.loads(MIRROR_STATE.read_text()).get("upstream_commit")
    return None


def excluded(path: str, mirrored: bool = False) -> bool:
    return any(p.search(path) for p in EXCLUDED) or (mirrored and bool(MIRRORED.search(path)))


def rework(sha: str, number: int, merged_at: str, head: str, cwd: Path = REPO_ROOT,
           now: datetime | None = None, window_days: int = WINDOW_DAYS,
           skip_mirror: bool = False) -> dict[str, Any]:
    """Revert, follow-ups and 14-day line survival of one landed commit."""
    landed = parse_time(merged_at)
    end_time = landed + timedelta(days=window_days)
    if (now or datetime.now(timezone.utc)) < end_time:
        return {"window": "open", "window_closes": end_time.strftime("%Y-%m-%dT%H:%M:%SZ")}
    if not has_commit(sha, cwd) or subprocess.run(
            ["git", "merge-base", "--is-ancestor", sha, head], cwd=cwd,
            capture_output=True).returncode != 0:
        return {"window": "unavailable", "why": "landing commit not on this clone's branch"}
    tip = datetime.fromtimestamp(int(git("log", "-1", "--format=%ct", head, cwd=cwd)), timezone.utc)
    if tip < end_time:  # e.g. the mirror pins an upstream commit older than the window's end
        return {"window": "open", "window_closes": end_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "why": "this clone's branch tip is older than the window's end"}
    end = git("rev-list", "-1", "--first-parent", f"--before={end_time.isoformat()}", head,
              cwd=cwd).strip() or sha
    later = git("log", "--first-parent", "--format=%H%x00%B%x01", f"{sha}..{end}", cwd=cwd)
    reverted = followups = 0
    own = re.compile(rf"(?<![\w/])#{number}\b")
    for entry in filter(None, (e.strip() for e in later.split("\x01"))):
        _, _, body = entry.partition("\x00")
        if f"This reverts commit {sha}" in body or f"reverts commit {sha[:10]}" in body:
            reverted += 1
        elif own.search(body):
            followups += 1
    # The commits that carry the PR's lines: the squash commit itself, or a merge's branch side.
    parents = git("rev-list", "--parents", "-n1", sha, cwd=cwd).split()[1:]
    ours = set(git("rev-list", f"{parents[0]}..{sha}", cwd=cwd).split()) if parents else {sha}
    base = parents[0] if parents else git("hash-object", "-t", "tree", "/dev/null", cwd=cwd).strip()
    added = {}
    for line in git("diff", "--numstat", "--no-renames", base, sha, cwd=cwd).splitlines():
        a, _, path = line.split("\t", 2)
        if a != "-" and int(a) > 0 and not excluded(path, skip_mirror):
            added[path] = int(a)
    alive = 0
    for path in added:
        blame = git("blame", "--porcelain", "-M", end, "--", path, cwd=cwd, check=False)
        alive += sum(1 for ln in blame.splitlines()
                     if re.match(r"^[0-9a-f]{40} \d+ \d+", ln) and ln[:40] in ours)
    total = sum(added.values())
    return {"window": "closed", "window_end": end, "reverted": reverted, "followups": followups,
            "lines_added": total, "lines_alive": min(alive, total),
            "survival": round(min(alive, total) / total, 3) if total else None}


# --------------------------------------------------------------------------
# build


def measured(rec: dict[str, Any], facts: dict[str, Any] | None, cwd: Path,
             now: datetime | None = None) -> dict[str, Any]:
    ref = parse_pr(rec)
    if ref is None:
        return {"why": "the record names no pull request"}
    if facts is None:
        return {"why": "not fetched yet: run derive.py fetch"}
    if facts.get("missing"):
        return {"why": f"{ref[0]}#{ref[1]} does not exist or is not visible"}
    out: dict[str, Any] = {
        "merged": bool(facts.get("merged")) if facts.get("state") == "closed" else None,
        "state": facts.get("state"),
        "merged_at": facts.get("merged_at"),
        "hours_open": hours(facts.get("created_at"), facts.get("merged_at") or facts.get("closed_at")),
        "additions": facts.get("additions"), "deletions": facts.get("deletions"),
        "changed_files": facts.get("changed_files"), "pr_commits": facts.get("commits"),
        "ci_red_commits": facts.get("ci", {}).get("red_commits"),
        "ci_head": facts.get("ci", {}).get("head"),
    }
    if out["merged"] and facts.get("merge_commit_sha"):
        head = lineage_head(ref[0], cwd)
        home = ref[0].lower() == HOME_REPO.lower()
        out["rework"] = (rework(facts["merge_commit_sha"], ref[1], facts["merged_at"], head, cwd, now,
                                skip_mirror=home)
                         if head else {"window": "unavailable", "why": f"no local branch for {ref[0]}"})
    return out


def build(root: Path = ROOT, cwd: Path = REPO_ROOT, now: datetime | None = None) -> list[dict[str, Any]]:
    cache = load_json(root / "derived" / "github.json", {})
    rows = []
    for path, rec in promptctl.load_runs(root):
        ref = parse_pr(rec)
        rows.append({"record": path.name, "date": rec.get("date"), "track": rec.get("track"),
                     "prompt_version": rec.get("prompt_version"), "model": rec.get("model"),
                     "pr": f"{ref[0]}#{ref[1]}" if ref else None,
                     "measured": measured(rec, cache.get(key(*ref)) if ref else None, cwd, now)})
    write_json(root / "derived" / "runs.json",
               {"generated": now_iso(), "window_days": WINDOW_DAYS, "rows": rows})
    return rows


def load_measured(root: Path = ROOT) -> dict[str, dict[str, Any]]:
    """record file name -> measured block, for promptctl.measure; empty when never built."""
    data = load_json(root / "derived" / "runs.json", {})
    return {r["record"]: r["measured"] for r in data.get("rows", [])}


# --------------------------------------------------------------------------
# report


TYPED = ("merged", "lines_added", "ci_failures_before_green", "wall_minutes", "cost_usd")


def report(root: Path = ROOT) -> str:
    runs = promptctl.load_runs(root)
    got = load_measured(root)
    n = len(runs)
    lines = [f"# Measured run facts ({n} run records, window {WINDOW_DAYS} days)", ""]
    named = [(p, r) for p, r in runs if parse_pr(r)]
    meas = [got.get(p.name, {}) for p, _ in named]
    merged = sum(1 for m in meas if m.get("merged") is True)
    closed = sum(1 for m in meas if m.get("merged") is False)
    still_open = sum(1 for m in meas if m.get("state") == "open")
    lines += ["## Coverage: typed by the run, against measured here", "",
              "| field | typed | measured |", "|---|---|---|",
              f"| merged | {sum(1 for _, r in runs if r.get('merged') is not None)} | "
              f"{merged + closed} ({merged} merged, {closed} closed unmerged, {still_open} open) |",
              f"| lines added | {sum(1 for _, r in runs if r.get('lines_added') is not None)} | "
              f"{sum(1 for m in meas if m.get('additions') is not None)} |",
              f"| CI failures | {sum(1 for _, r in runs if r.get('ci_failures_before_green') is not None)} | "
              f"{sum(1 for m in meas if m.get('ci_red_commits') is not None)} (commits with a red check run) |",
              f"| rework | 0 | {sum(1 for m in meas if (m.get('rework') or {}).get('window') == 'closed')} "
              f"(window closed) |", "",
              f"{n - len(named)} record(s) name no pull request, so nothing about them can be measured.", ""]

    groups: dict[str, dict[str, list[dict[str, Any]]]] = {"track and prompt version": defaultdict(list),
                                                          "model": defaultdict(list)}
    for (p, r), m in zip(named, meas):
        groups["track and prompt version"][f"{r.get('track')}/{r.get('prompt_version')}"].append(m)
        groups["model"][str(r.get("model") or "unknown")].append(m)
    for title, rows in groups.items():
        lines += [f"## By {title}", "",
                  "| | PRs | merged | merged on red | median hours open | median +lines | red-CI commits/PR | "
                  "rework measured | reverted | follow-ups/PR | median 14-day survival |",
                  "|---|---|---|---|---|---|---|---|---|---|---|"]
        for name, ms in sorted(rows.items()):
            s = summarise(ms)
            lines.append(f"| {name} | {s['prs']} | {s['merged']} | {s['merged_red']} | "
                         f"{fmt(s['hours_open_median'])} | "
                         f"{fmt(s['additions_median'])} | {fmt(s['ci_red_per_pr'])} | {s['rework_measured']} | "
                         f"{s['reverted']} | {fmt(s['followups_per_pr'])} | {fmt(s['survival_median'])} |")
        lines.append("")
    lines += ["Rows with fewer than about 10 measured PRs are too few to compare. "
              "Survival counts lines `git blame -M` still attributes to the PR; a file moved "
              "across files or rewritten by a generator reads as churn, and generated paths "
              "are excluded (`EXCLUDED` in `prompts/derive.py`)."]
    return "\n".join(lines) + "\n"


def summarise(ms: list[dict[str, Any]]) -> dict[str, Any]:
    def med(vals: list[Any]) -> float | None:
        vals = [v for v in vals if isinstance(v, (int, float))]
        return round(statistics.median(vals), 3) if vals else None
    rw = [m["rework"] for m in ms if (m.get("rework") or {}).get("window") == "closed"]
    ci = [m["ci_red_commits"] for m in ms if isinstance(m.get("ci_red_commits"), int)]
    return {
        "prs": len(ms),
        "merged": sum(1 for m in ms if m.get("merged") is True),
        # A failing check run on the head commit when it merged: the PR's own, or the base's.
        "merged_red": sum(1 for m in ms if m.get("merged") is True and m.get("ci_head") == "red"),
        "hours_open_median": med([m.get("hours_open") for m in ms]),
        "additions_median": med([m.get("additions") for m in ms]),
        "ci_red_per_pr": round(sum(ci) / len(ci), 2) if ci else None,
        "rework_measured": len(rw),
        "reverted": sum(1 for r in rw if r["reverted"]),
        "followups_per_pr": round(sum(r["followups"] for r in rw) / len(rw), 2) if rw else None,
        "survival_median": med([r["survival"] for r in rw]),
    }


# --------------------------------------------------------------------------
# helpers


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_time(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def hours(start: str | None, end: str | None) -> float | None:
    if not (start and end):
        return None
    return round((parse_time(end) - parse_time(start)).total_seconds() / 3600, 2)


def fmt(v: Any) -> str:
    return "-" if v is None else str(v)


def load_json(path: Path, default: Any) -> Any:
    return json.loads(path.read_text()) if path.is_file() else default


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=1, sort_keys=True) + "\n")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("fetch", help="PR facts from the GitHub API, cached in derived/github.json")
    p.add_argument("--refresh", action="store_true", help="refetch PRs already final in the cache")
    sub.add_parser("build", help="join records, PR facts and git rework into derived/runs.json")
    sub.add_parser("report", help="coverage and rework by track, version and model")
    args = parser.parse_args(argv)
    if args.cmd == "fetch":
        fetch(ROOT, args.refresh)
    elif args.cmd == "build":
        rows = build(ROOT)
        print(f"ok: {len(rows)} row(s) in {RUNS_OUT.relative_to(REPO_ROOT)}")
    else:
        print(report(ROOT), end="")
    return 0


if __name__ == "__main__":
    sys.exit(main())
