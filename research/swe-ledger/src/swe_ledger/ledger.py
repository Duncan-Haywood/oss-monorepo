"""Measure what prompts/runs.jsonl can and cannot say about the agent loop.

Pure standard library. Every function takes parsed run records (dicts), so the
tests use small hand-made lists and the experiment feeds the real log.
"""
import json, math, re
from collections import Counter, defaultdict
from datetime import datetime

# Track prefix -> track number, as in PROJECTS.md ("Picking work").
TRACKS = {"selfrep": 1, "ambient": 2, "chip": 3, "robofab": 4, "simdesign": 5,
          "garment": 6, "eda": 7, "accel": 8, "osrobot": 9, "swe": 10, "mimic": 11,
          "free": 12}

FIELDS = ["started", "ended", "wall_minutes", "tokens_in", "tokens_out", "cost_usd",
          "tool_calls", "pr", "lines_added", "lines_removed", "merged",
          "ci_failures_before_green", "review_findings", "usage"]


def load(path):
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]


def track_of(slug):
    """Track label from a slug's first hyphen-separated word, 'other' if unknown."""
    head = slug.split("-", 1)[0]
    return head if head in TRACKS else "other"


def wilson(k, n, z=1.96):
    """Wilson score interval for k successes in n trials."""
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def coverage(runs):
    """Share of runs where each measurement field is present (not null)."""
    n = len(runs)
    return {f: sum(r.get(f) is not None for r in runs) / n if n else 0.0 for f in FIELDS}


def parse_minutes(r):
    """Wall minutes from started/ended when both parse, else None."""
    try:
        a = datetime.strptime(r["started"], "%Y-%m-%dT%H:%M:%SZ")
        b = datetime.strptime(r["ended"], "%Y-%m-%dT%H:%M:%SZ")
    except (TypeError, ValueError, KeyError):
        return None
    m = (b - a).total_seconds() / 60
    return m if m >= 0 else None


def project_owners(runs):
    """slug -> list of run indices that list it (a slug in two runs is a re-touch or a collision)."""
    d = defaultdict(list)
    for i, r in enumerate(runs):
        for s in r.get("projects") or []:
            d[s].append(i)
    return d


def per_track(runs):
    """For each track: distinct projects, runs touching it, tests added (by runs listing only that track)."""
    projects = defaultdict(set)
    run_ids = defaultdict(set)
    tests = defaultdict(int)
    for i, r in enumerate(runs):
        tr = {track_of(s) for s in r.get("projects") or []}
        for s in r.get("projects") or []:
            projects[track_of(s)].add(s)
        for t in tr:
            run_ids[t].add(i)
        if len(tr) == 1:
            tests[next(iter(tr))] += r.get("tests_added") or 0
    return {t: {"projects": len(projects[t]), "runs": len(run_ids[t]), "tests_added_single_track_runs": tests[t]}
            for t in sorted(projects, key=lambda t: -len(projects[t]))}


def family_concentration(slugs, min_size=3, min_stem=4):
    """Follow-up families: slugs of one track that share a name stem.

    Each slug joins the shortest stem (at least min_stem characters after the
    track prefix, trailing hyphen dropped) that at least min_size slugs of the
    same track share. Slugs with no recognised track prefix are grouped by their
    last hyphen word instead (for example '*-twin'). Returns {stem: set(slugs)}.
    """
    keyed = defaultdict(list)
    for s in slugs:
        t = track_of(s)
        keyed[t].append(s)
    fams = {}
    for t, ss in keyed.items():
        if t == "other":
            groups = defaultdict(set)
            for s in ss:
                if "-" in s:
                    groups["*-" + s.rsplit("-", 1)[1]].add(s)
            fams.update({k: v for k, v in groups.items() if len(v) >= min_size})
            continue
        rests = {s: s.split("-", 1)[1] if "-" in s else "" for s in ss}
        for s, rest in rests.items():
            for k in range(min_stem, len(rest) + 1):
                stem = rest[:k]
                members = {m for m, r in rests.items() if r.startswith(stem)}
                if len(members) >= min_size:
                    fams.setdefault(t + "-" + stem.rstrip("-"), set()).update(members)
                    break
    return fams


def rate_with_ci(flags):
    k, n = sum(flags), len(flags)
    lo, hi = wilson(k, n)
    return {"k": k, "n": n, "rate": k / n if n else None, "lo": lo, "hi": hi}


def summarise(runs):
    owners = project_owners(runs)
    slugs = set(owners)
    clean = [r["ci_failures_before_green"] == 0 for r in runs if r.get("ci_failures_before_green") is not None]
    has_err = [bool(r.get("errors")) for r in runs]
    has_integ = [bool(r.get("integrity_issues")) for r in runs]
    nonproj = [len(r.get("projects") or []) == 0 for r in runs]
    mins = [m for m in (parse_minutes(r) for r in runs) if m is not None]
    by_model = Counter(r.get("model") for r in runs)
    by_task = Counter(r.get("task") for r in runs)
    fam = family_concentration(slugs)
    in_fam = set().union(*fam.values()) if fam else set()
    return {
        "runs": len(runs),
        "distinct_projects": len(slugs),
        "slugs_in_more_than_one_run": sorted(s for s, v in owners.items() if len(v) > 1),
        "coverage": coverage(runs),
        "ci_clean_first_time": rate_with_ci(clean),
        "runs_with_errors": rate_with_ci(has_err),
        "runs_with_integrity_issue": rate_with_ci(has_integ),
        "runs_listing_no_project": rate_with_ci(nonproj),
        "wall_minutes": {"n": len(mins), "median": sorted(mins)[len(mins) // 2] if mins else None},
        "by_model": dict(by_model), "by_task": dict(by_task),
        "per_track": per_track(runs),
        "families": {k: len(v) for k, v in sorted(fam.items(), key=lambda kv: -len(kv[1]))},
        "share_of_projects_in_families": len(in_fam) / len(slugs) if slugs else 0.0,
    }
