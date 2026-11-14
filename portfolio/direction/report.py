#!/usr/bin/env python3
"""Direction report: what got worked on, how deep each project is, and where
the next runs should point.

The owner, 2026-11-02: "lets get directional daily and weekly reports of what's
getting worked on and what the depth of the projects are? ie the amount of work
on projects. with suggestions for the agents about what to do to move towards
higher value projects."

It reads only files and git history, so it costs nothing to run:

- commits on main in the window (`git log --numstat`), each given one home: the
  project or area holding most of its changed lines;
- run records (`prompts/runs/*.json`) for the track mix and how many sessions
  have named each project to date;
- `portfolio/flagships.yaml`, `portfolio/requests/requests.json` and
  `research/PROGRAMMES.md` for which projects count as high value (the owner's
  own rankings, not this script's);
- the tracked tree for a size proxy per project.

Depth is a proxy and the report says so. "Size hours" is code lines divided by
LINES_PER_HOUR, a coarse rule of thumb (agents write padding, and data files are
left out), shown beside the human-hour estimates runs recorded themselves.

Usage:
    python3 portfolio/direction/report.py                 # daily, to stdout
    python3 portfolio/direction/report.py --weekly
    python3 portfolio/direction/report.py --write         # also writes daily/<date>.md, LATEST.md and LATEST.json
    python3 portfolio/direction/report.py --weekly --write --json
"""
from __future__ import annotations

import argparse
import fnmatch
import json
import re
import subprocess
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

REPO = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent

# A rough rule of thumb for hand-written, tested code. It turns a tree's size
# into hours a person might need to write it; it is not an estimate of the
# work the agents did, which the run records' own estimates cover.
LINES_PER_HOUR = 20
DEEP_HOURS = 300  # owner, 2026-10-29: lean towards projects of about 300 hours
THIN_HOURS = 20   # owner, 2026-10-21: work under 20 human hours is rarely worth publishing alone
HIGH_SHARE_TARGET = 0.5  # suggestion threshold, not a rule
OVERHEAD_SHARE_FLAG = 0.35
UNRANKED_SHARE_FLAG = 0.05  # one unranked project taking 5%+ of project commits is a choice worth naming
PER_FILE_LINE_CAP = 2000  # one generated file should not decide a commit's home

CODE_EXT = {".py", ".mjs", ".js", ".ts", ".tsx", ".jsx", ".rs", ".go", ".c", ".h", ".cpp",
            ".hpp", ".java", ".kt", ".swift", ".sh", ".html", ".css", ".sql", ".v", ".sv",
            ".vhd", ".jl", ".r", ".R", ".lua", ".toml", ".yml", ".yaml", ".ipynb", ".scad", ".cs"}
DOC_EXT = {".md", ".tex", ".bib", ".txt"}

HIGH_TIERS = {"flagship", "request", "programme"}
TIER_ORDER = ["flagship", "request", "programme", "feeds-programme", "venture", "research",
              "calculator"]
TIER_LABEL = {
    "flagship": "flagship (portfolio/flagships.yaml)",
    "request": "website or owner request (portfolio/requests)",
    "programme": "research programme (research/PROGRAMMES.md)",
    "feeds-programme": "research project a programme builds on",
    "venture": "other venture",
    "research": "research project in no programme",
    "calculator": "calculator (maintain only)",
}
AREA_LABEL = {
    "writing": "blog posts and podcasts",
    "agent-docs": "agent docs and history (docs/reports, docs/history)",
    "guidance": "prompts and agent guidance",
    "ci": "CI, checks and workflows",
    "portfolio": "portfolio management (portfolio/)",
    "platform": "shared platform: site, edge, LLM, distribution (platform/, not CI)",
    "records": "run records only",
    "other": "everything else",
}
OVERHEAD_AREAS = {"guidance", "ci", "portfolio", "records"}


# --------------------------------------------------------------------------- git

def git(*args: str, timeout: int = 120) -> str:
    return subprocess.run(["git", *args], capture_output=True, text=True, cwd=REPO,
                          timeout=timeout).stdout


def shallow_boundary() -> set[str]:
    path = Path(git("rev-parse", "--git-path", "shallow").strip() or ".git/shallow")
    path = path if path.is_absolute() else REPO / path
    return set(path.read_text().split()) if path.exists() else set()


def _shallow_fetch(args, cwd, timeout=None):
    """`git fetch <args>` through platform/ci/shallow_repair.py, which drops the bogus
    `.git/shallow` entry a --shallow-since fetch can leave (every later fetch then failed with
    "error in object: unshallow", 2026-11-14). Falls back to a plain fetch if it cannot load."""
    try:
        sys.path.insert(0, str(REPO / "platform" / "ci"))
        import shallow_repair
        return shallow_repair.fetch(args, cwd=cwd, timeout=timeout, run=subprocess.run)
    except ImportError:
        return subprocess.run(["git", "fetch", *args], cwd=cwd, capture_output=True, text=True, timeout=timeout)


def ensure_history(since: datetime, ref: str) -> None:
    """A cloud clone holds about 50 commits; fetch main back to `since`."""
    if git("rev-parse", "--is-shallow-repository").strip() != "true":
        return
    oldest = git("log", ref, "--format=%ct").split()
    if oldest and int(oldest[-1]) <= since.timestamp():
        return
    print(f"(shallow clone: fetching main since {since:%Y-%m-%d})", file=sys.stderr)
    try:
        _shallow_fetch(["-q", f"--shallow-since={since:%Y-%m-%d}", "origin", "main"], cwd=REPO, timeout=600)
    except subprocess.TimeoutExpired:
        print("(fetch timed out; counts cover what is local)", file=sys.stderr)


@dataclass
class Commit:
    sha: str
    ts: int
    subject: str
    lines: dict[str, int] = field(default_factory=dict)  # path -> changed lines


def read_commits(ref: str, since: datetime, until: datetime) -> list[Commit]:
    out = git("log", ref, "--no-merges", f"--since={since.isoformat()}",
              f"--until={until.isoformat()}", "--numstat", "--format=%x00%H%x09%ct%x09%s",
              timeout=300)
    boundary = shallow_boundary()
    commits = []
    for chunk in out.split("\0"):
        if not chunk.strip():
            continue
        head, *rest = chunk.strip("\n").split("\n")
        sha, ts, subject = (head.split("\t", 2) + ["", ""])[:3]
        if sha in boundary:  # its diff is the whole tree, not a change
            continue
        c = Commit(sha, int(ts), subject)
        for line in rest:
            parts = line.split("\t")
            if len(parts) != 3:
                continue
            a, d, path = parts
            if " => " in path:  # a rename: {old => new} or old => new
                path = re.sub(r"\{[^}]* => ([^}]*)\}", r"\1", path)
                path = path.split(" => ")[-1]
            n = (int(a) if a.isdigit() else 1) + (int(d) if d.isdigit() else 0)
            c.lines[path.replace("//", "/")] = min(n, PER_FILE_LINE_CAP)
        commits.append(c)
    return commits


# ----------------------------------------------------------------- classification

def bucket(path: str) -> str:
    """`venture:<slug>`, `research:<slug>`, or an area name."""
    parts = path.split("/")
    if parts[0] == "ventures" and len(parts) > 2:
        return f"venture:{parts[1]}"
    if parts[0] == "research" and len(parts) > 2 and not parts[1].startswith("_"):
        return f"research:{parts[1]}"
    if parts[0] == "prompts":
        return "records" if len(parts) > 1 and parts[1] in ("runs", "derived") else "guidance"
    if parts[0] == "docs" and len(parts) > 1:
        if parts[1] in ("posts", "agent-posts", "podcast"):
            return "writing"
        if parts[1] in ("reports", "history"):
            return "agent-docs"
    if parts[0] == ".github" or path.startswith("platform/ci/"):
        return "ci"
    if parts[0] in ("CLAUDE.md", "AGENTS.md", "prompt.md") or parts[-1] in ("CLAUDE.md", "AGENTS.md"):
        return "guidance"
    if parts[0] == "portfolio":
        return "portfolio"
    if parts[0] == "platform":
        return "platform"
    if len(parts) == 1 and path.endswith(".md"):
        return "guidance"
    return "other"


SIDE_AREAS = {"writing", "agent-docs", "records"}  # ride along with the work, rarely its point


def home(c: Commit) -> str:
    """The bucket holding most changed lines, preferring a project over side areas."""
    per: Counter[str] = Counter()
    for path, n in c.lines.items():
        per[bucket(path)] += max(n, 1)
    if not per:
        return "other"
    main = {b: n for b, n in per.items() if b not in SIDE_AREAS}
    pick = main or per
    return max(sorted(pick), key=lambda b: pick[b])


def is_calculator(slug: str) -> bool:
    return slug.rsplit("-", 1)[-1] in ("calculator", "estimator")


@dataclass
class Rankings:
    flagships: dict[str, tuple[int, str]]      # slug -> (rank, next)
    requests: dict[str, tuple[str, str, str]]  # bucket -> (id, title, next)
    programmes: dict[str, str]                 # slug -> question
    builds_on: dict[str, list[str]]            # programme -> patterns
    blocked: set[str]                          # research slugs with BLOCKED


def load_rankings(root: Path = REPO) -> Rankings:
    import yaml  # local: the rest of the script runs on a bare python3

    flags = {}
    fy = yaml.safe_load((root / "portfolio/flagships.yaml").read_text()) or {}
    for i, f in enumerate(fy.get("flagships") or []):
        flags[f["venture"]] = (i + 1, " ".join(str(f.get("next") or "").split()))
    reqs = {}
    rpath = root / "portfolio/requests/requests.json"
    if rpath.exists():
        for r in json.loads(rpath.read_text()).get("requests", []):
            proj = (r.get("project") or "").strip("/")
            if r.get("status") in ("done", "declined", "closed") or not proj:
                continue
            kind, _, slug = proj.partition("/")
            b = {"ventures": "venture", "research": "research"}.get(kind)
            if b and slug:
                reqs[f"{b}:{slug.split('/')[0]}"] = (r.get("id", ""), r.get("title", ""),
                                                     r.get("next", ""))
    progs, builds = {}, {}
    ptext = (root / "research/PROGRAMMES.md").read_text() if (root / "research/PROGRAMMES.md").exists() else ""
    section = ptext.split("## Open programmes", 1)[-1].split("\n## ", 1)[0]
    for line in section.splitlines():
        m = re.match(r"\|\s*\[`([^`]+)`\]\([^)]*\)\s*\|([^|]*)\|([^|]*)\|", line)
        if m:
            slug = m.group(1)
            progs[slug] = " ".join(m.group(2).split())
            builds[slug] = [p for p in re.findall(r"`([^`]+)`", m.group(3))
                            if re.fullmatch(r"[a-z0-9*-]+", p)]
    blocked = {p.parent.name for p in (root / "research").glob("*/BLOCKED")}
    return Rankings(flags, reqs, progs, builds, blocked)


def tier(b: str, rk: Rankings) -> str | None:
    kind, _, slug = b.partition(":")
    if not slug:
        return None
    if kind == "venture" and slug in rk.flagships:
        return "flagship"
    if b in rk.requests:
        return "request"
    if kind == "research":
        if slug in rk.programmes:
            return "programme"
        if feeds(slug, rk):
            return "feeds-programme"
        return "research"
    return "calculator" if is_calculator(slug) else "venture"


def feeds(slug: str, rk: Rankings) -> str | None:
    for prog, pats in rk.builds_on.items():
        for p in pats:
            if fnmatch.fnmatch(slug, p) or (p.endswith("-") and slug.startswith(p)):
                return prog
    return None


# ------------------------------------------------------------------------- depth

def tree_size(b: str, root: Path = REPO) -> dict[str, int]:
    kind, _, slug = b.partition(":")
    rel = f"{'ventures' if kind == 'venture' else 'research'}/{slug}"
    files = [f for f in git("ls-files", "-z", "--", rel).split("\0") if f]
    code = tests = docs = 0
    for f in files:
        p = root / f
        ext = p.suffix
        if ext not in CODE_EXT and ext not in DOC_EXT:
            continue
        if "node_modules/" in f or "/vendor/" in f or f.endswith((".min.js", "lock.yaml")):
            continue
        try:
            n = p.read_bytes().count(b"\n")
        except OSError:
            continue
        if ext in DOC_EXT:
            docs += n
        elif re.search(r"(^|[/_.-])tests?([/_.-]|$)", f):
            tests += n
        else:
            code += n
    return {"files": len(files), "code_lines": code, "test_lines": tests, "doc_lines": docs,
            "size_hours": round((code + tests) / LINES_PER_HOUR)}


# ------------------------------------------------------------------- run records

def load_records(root: Path = REPO) -> list[dict]:
    recs = []
    for p in sorted((root / "prompts/runs").glob("*.json")):
        try:
            r = json.loads(p.read_text())
        except (OSError, ValueError):
            continue
        if isinstance(r, dict):
            r["_file"] = p.name
            recs.append(r)
    return recs


def record_date(r: dict) -> date | None:
    for key in ("ended", "started", "date"):
        v = r.get(key)
        if isinstance(v, str) and len(v) >= 10:
            try:
                return date.fromisoformat(v[:10])
            except ValueError:
                pass
    return None


def record_words(r: dict) -> set[str]:
    text = " ".join(str(r.get(k) or "") for k in ("notes", "task", "goal", "outcome"))
    text += " " + " ".join(str(x) for x in (r.get("projects") or []) + (r.get("writeups") or []))
    return set(re.findall(r"[a-z0-9][a-z0-9-]*[a-z0-9]", text.lower()))


def human_hours(r: dict) -> float | None:
    u = r.get("usage")
    h = (u.get("human_equivalent") or {}).get("hours") if isinstance(u, dict) else None
    return float(h) if isinstance(h, (int, float)) else None


# ------------------------------------------------------------------------ report

@dataclass
class Window:
    start: datetime
    end: datetime
    commits: list[Commit]

    def homes(self) -> Counter[str]:
        return Counter(home(c) for c in self.commits)


def build(kind: str, end: datetime, ref: str = "origin/main", root: Path = REPO,
          fetch: bool = True) -> dict:
    days = 7 if kind == "weekly" else 1
    start = end - timedelta(days=days)
    base_start = end - timedelta(days=14 if kind == "weekly" else 8)
    if fetch:
        ensure_history(base_start - timedelta(days=1), ref)
    rk = load_rankings(root)
    cur = Window(start, end, read_commits(ref, start, end))
    base = Window(base_start, start, read_commits(ref, base_start, start))
    base_days = (start - base_start).days

    homes = cur.homes()
    base_homes = base.homes()
    total = sum(homes.values()) or 1
    projects = {b: n for b, n in homes.items() if ":" in b}
    proj_total = sum(projects.values()) or 0
    touched: Counter[str] = Counter()
    for c in cur.commits:
        for b in {bucket(p) for p in c.lines}:
            if ":" in b:
                touched[b] += 1

    # Projects worth sizing: everything with a home this window plus every
    # high-value project, so an untouched flagship still shows its depth.
    wanted = set(projects) | {f"venture:{s}" for s in rk.flagships} | set(rk.requests) \
        | {f"research:{s}" for s in rk.programmes}
    records = load_records(root)
    words = [(record_words(r), r) for r in records]
    rows = {}
    for b in sorted(wanted):
        slug = b.split(":", 1)[1]
        if not (root / ("ventures" if b.startswith("venture:") else "research") / slug).is_dir():
            continue
        mentions = [r for w, r in words if slug in w]
        hours = [h for r in mentions if (h := human_hours(r)) is not None]
        t = tier(b, rk)
        rows[b] = {
            "project": b, "tier": t, "commits": projects.get(b, 0), "touched": touched.get(b, 0),
            "baseline_per_period": round(base_homes.get(b, 0) * days / max(base_days, 1), 1),
            **tree_size(b, root),
            "sessions_to_date": len(mentions),
            "recorded_human_hours": round(sum(hours), 1) if hours else None,
            "feeds": feeds(slug, rk) if b.startswith("research:") else None,
            "new": _is_new(b, ref, start),
            "blocked": b.startswith("research:") and slug in rk.blocked,
        }

    tiers = Counter()
    for b, n in projects.items():
        tiers[tier(b, rk)] += n
    base_proj = {b: n for b, n in base_homes.items() if ":" in b}
    base_tiers = Counter()
    for b, n in base_proj.items():
        base_tiers[tier(b, rk)] += n
    areas = {a: n for a, n in homes.items() if ":" not in a}

    in_window = [r for r in records if (d := record_date(r)) and start.date() <= d < end.date()]
    tracks = Counter(str(r.get("track") or "unknown") for r in in_window)
    outcomes = Counter(str(r.get("outcome") or "unknown") for r in in_window)
    weights = {}
    try:
        rj = json.loads((root / "prompts/routing.json").read_text())
        weights = {k: v.get("weight") for k, v in (rj.get("tracks") or {}).items() if isinstance(v, dict)}
    except (OSError, ValueError):
        pass

    report = {
        "kind": kind, "start": start.isoformat(), "end": end.isoformat(), "ref": ref,
        "commits": len(cur.commits), "baseline_commits_per_period": round(len(base.commits) * days / max(base_days, 1), 1),
        "project_commits": proj_total,
        "high_value_share": round(sum(tiers[t] for t in HIGH_TIERS) / proj_total, 3) if proj_total else None,
        "baseline_high_value_share": (round(sum(base_tiers[t] for t in HIGH_TIERS) / sum(base_proj.values()), 3)
                                      if base_proj else None),
        "tiers": {t: tiers.get(t, 0) for t in TIER_ORDER},
        "areas": dict(sorted(areas.items(), key=lambda kv: -kv[1])),
        "overhead_share": round(sum(areas.get(a, 0) for a in OVERHEAD_AREAS) / total, 3),
        "runs": len(in_window), "tracks": dict(tracks.most_common()), "track_weights": weights,
        "outcomes": dict(outcomes.most_common()),
        "projects": sorted(rows.values(), key=lambda r: (-r["commits"], -r["touched"], r["project"])),
    }
    report["suggestions"] = suggest(report, rk)
    return report


def _is_new(b: str, ref: str, start: datetime) -> bool:
    kind, _, slug = b.partition(":")
    rel = f"{'ventures' if kind == 'venture' else 'research'}/{slug}"
    before = git("rev-list", "-1", f"--before={start.isoformat()}", ref).strip()
    if not before:
        return False
    return subprocess.run(["git", "cat-file", "-e", f"{before}:{rel}"], cwd=REPO,
                          capture_output=True).returncode != 0


def _pct(x: float | None) -> str:
    return "n/a" if x is None else f"{round(100 * x)}%"


def suggest(rep: dict, rk: Rankings) -> list[dict]:
    """Rule-based suggestions, each with the numbers behind it. Advice, not orders."""
    out: list[dict] = []
    rows = {r["project"]: r for r in rep["projects"]}
    share = rep["high_value_share"]
    if share is not None and share < HIGH_SHARE_TARGET:
        out.append({"kind": "shift", "text": (
            f"{_pct(share)} of project commits went to flagships, requests or research programmes "
            f"(previous period {_pct(rep['baseline_high_value_share'])}). With a free choice, take one "
            "of the untouched high-value items below before starting anything new.")})

    idle = []
    for slug, (rank, nxt) in sorted(rk.flagships.items(), key=lambda kv: kv[1][0]):
        r = rows.get(f"venture:{slug}")
        if r and r["commits"] == 0:
            idle.append((f"flagship {rank}: ventures/{slug}", nxt))
    for b, (rid, title, nxt) in rk.requests.items():
        r = rows.get(b)
        if r and r["commits"] == 0 and r["tier"] == "request":
            idle.append((f"request {rid} ({title}): {b.replace('venture:', 'ventures/').replace('research:', 'research/')}", nxt))
    for slug, q in rk.programmes.items():
        r = rows.get(f"research:{slug}")
        if r and r["commits"] == 0 and not r["blocked"]:
            idle.append((f"programme research/{slug}", q))
    for label, nxt in idle[:8]:
        out.append({"kind": "untouched", "text": f"No commits this period on {label}. "
                    f"Next: {_clip(nxt, 260)}"})

    calc = [r for r in rep["projects"] if r["tier"] == "calculator" and r["commits"]]
    if calc:
        names = ", ".join(f"{r['project'].split(':')[1]} ({r['commits']})" for r in calc[:6])
        out.append({"kind": "calculator", "text": (
            f"{sum(r['commits'] for r in calc)} commits landed on calculators: {names}. "
            "They are maintain-only (prompts/goals.md, 'Depth over calculators'); fixes are fine, "
            "features are effort better spent on a flagship.")})

    new_thin = [r for r in rep["projects"] if r["new"] and r["size_hours"] < THIN_HOURS
                and r["tier"] not in HIGH_TIERS]
    if new_thin:
        names = ", ".join(r["project"].split(":")[1] for r in new_thin[:8])
        out.append({"kind": "sprawl", "text": (
            f"{len(new_thin)} new projects under {THIN_HOURS} size-hours started this period "
            f"({names}{', ...' if len(new_thin) > 8 else ''}). Fold the idea into an existing "
            "flagship or programme, or write the 300-hour plan before the next slice.")})

    orphans = [r for r in rep["projects"] if r["tier"] == "research" and r["commits"]]
    if orphans:
        names = ", ".join(r["project"].split(":")[1] for r in orphans[:8])
        out.append({"kind": "orphan-research", "text": (
            f"{sum(r['commits'] for r in orphans)} commits went to research projects no programme "
            f"builds on ({names}). Attach each to a programme in research/PROGRAMMES.md, "
            "or propose one if three or more share a question.")})

    proj_total = sum(r["commits"] for r in rep["projects"]) or 1
    unranked = [r for r in rep["projects"] if r["tier"] in ("venture", "research")
                and r["commits"] >= max(3, UNRANKED_SHARE_FLAG * proj_total)]
    if unranked:
        names = ", ".join(f"{r['project'].split(':')[1]} ({r['commits']} commits, ~{r['size_hours']} h"
                          f"{', new' if r['new'] else ''})" for r in unranked[:5])
        out.append({"kind": "unranked", "text": (
            f"A large share of effort went to projects on no ranked list: {names}. If they earn it, "
            "add them to portfolio/flagships.yaml (venture) or research/PROGRAMMES.md (research) with "
            "a `next`, in a PR that says why; if not, point the next runs back at the ranked list.")})

    if rep["overhead_share"] > OVERHEAD_SHARE_FLAG:
        out.append({"kind": "overhead", "text": (
            f"{_pct(rep['overhead_share'])} of commits had their home in guidance, CI, portfolio "
            "bookkeeping or run records. If a chore keeps recurring, move it into a script or "
            "scheduled build and spend the run on a project.")})

    deep = [r for r in rep["projects"] if r["size_hours"] >= DEEP_HOURS and r["commits"]]
    if deep:
        names = ", ".join(f"{r['project'].split(':')[1]} (~{r['size_hours']} h)" for r in deep[:6])
        out.append({"kind": "keep-going", "text": (
            f"Deep projects that got work: {names}. Keep slices on these landing; each run should "
            "leave the next one a working step and an updated `next`.")})

    busy_thin = [r for r in rep["projects"] if r["commits"] >= 3 and r["size_hours"] < THIN_HOURS
                 and r["tier"] not in HIGH_TIERS]
    if busy_thin:
        names = ", ".join(r["project"].split(":")[1] for r in busy_thin[:6])
        out.append({"kind": "busy-thin", "text": (
            f"Several commits on small projects ({names}). Check whether this is depth or churn: "
            "a project that keeps getting touch-ups but stays small may belong inside a bigger one.")})
    return out


def _clip(s: str, n: int) -> str:
    s = " ".join(str(s).split())
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0] + " ..."


def render(rep: dict) -> str:
    kind = rep["kind"]
    start, end = rep["start"][:16].replace("T", " "), rep["end"][:16].replace("T", " ")
    title = "Weekly" if kind == "weekly" else "Daily"
    per = "week" if kind == "weekly" else "day"
    L = [f"# {title} direction report, {start} to {end} UTC", "",
         "Generated by `python3 portfolio/direction/report.py"
         + (" --weekly" if kind == "weekly" else "") + "` from git history on main, run records "
         "and the owner's rankings (flagships, requests, programmes). Every number is "
         "recomputable; method and caveats in [`README.md`](../README.md).", ""]
    L += ["## Suggestions for the next runs", ""]
    if rep["suggestions"]:
        L += [f"- **{s['kind']}**: {s['text']}" for s in rep["suggestions"]]
    else:
        L.append("- Nothing stands out: effort is on high-value work. Keep going.")
    L += ["", "## Where the work went", "",
          f"{rep['commits']} commits on main (previous {per}s averaged {rep['baseline_commits_per_period']}); "
          f"{rep['project_commits']} had their home in a project. "
          f"High-value share (flagships, requests, programmes): **{_pct(rep['high_value_share'])}**, "
          f"previous period {_pct(rep['baseline_high_value_share'])}.", "",
          "| Kind of work | Commits | Share of project commits |", "|---|---:|---:|"]
    pt = rep["project_commits"] or 1
    for t in TIER_ORDER:
        n = rep["tiers"].get(t, 0)
        L.append(f"| {TIER_LABEL[t]} | {n} | {_pct(n / pt) if rep['project_commits'] else 'n/a'} |")
    L += ["", "| Area outside projects | Commits |", "|---|---:|"]
    for a, n in rep["areas"].items():
        L.append(f"| {AREA_LABEL.get(a, a)} | {n} |")
    L += ["", f"Overhead share (guidance, CI, portfolio, records): {_pct(rep['overhead_share'])}.", ""]
    if rep["runs"]:
        L += [f"{rep['runs']} run records dated in the period. Track mix against the routing weights "
              "in `prompts/routing.json`:", "", "| Track | Runs | Share | Routing weight |",
              "|---|---:|---:|---:|"]
        for t, n in rep["tracks"].items():
            w = rep["track_weights"].get(t)
            L.append(f"| {t} | {n} | {_pct(n / rep['runs'])} | {'' if w is None else _pct(w)} |")
        L += ["", "Outcomes: " + ", ".join(f"{k} {v}" for k, v in rep["outcomes"].items()) + ".", ""]

    L += ["## Projects: work this period and depth", "",
          f"Size hours = (code + test lines) / {LINES_PER_HOUR}, a coarse proxy for what the tree "
          f"would take a person to write; {DEEP_HOURS}+ is the owner's rule of thumb for depth. "
          "Sessions = run records naming the project to date; recorded hours = the runs' own "
          "human-hour estimates, where they gave one.", "",
          "| Project | Kind | Commits | Prev avg | Size hours | Code / test lines | Sessions | Recorded hours |",
          "|---|---|---:|---:|---:|---:|---:|---:|"]
    shown = [r for r in rep["projects"] if r["commits"] or r["tier"] in HIGH_TIERS]
    for r in shown[:40]:
        kind_label = r["tier"] + (" (new)" if r["new"] else "") + (" (blocked)" if r["blocked"] else "")
        if r["feeds"]:
            kind_label += f" -> {r['feeds']}"
        path = r["project"].replace("venture:", "ventures/").replace("research:", "research/")
        L.append(f"| `{path}` | {kind_label} | {r['commits']} | {r['baseline_per_period']} | "
                 f"{r['size_hours']} | {r['code_lines']} / {r['test_lines']} | {r['sessions_to_date']} | "
                 f"{'' if r['recorded_human_hours'] is None else r['recorded_human_hours']} |")
    rest = len([r for r in rep["projects"] if r["commits"]]) - len([r for r in shown[:40] if r["commits"]])
    if rest > 0:
        L.append(f"\n{rest} more projects with commits are in the `--json` output.")
    return "\n".join(L) + "\n"


def render_latest(daily: dict | None, weekly: dict | None) -> str:
    L = ["# Direction: latest suggestions", "",
         "Read this before picking work with a free choice. Regenerated by "
         "`python3 portfolio/direction/report.py --write` (daily) and `--weekly --write`; "
         "full reports in [`daily/`](daily/) and [`weekly/`](weekly/). Suggestions, not orders: "
         "a run with a better reason does that instead and says why.", ""]
    for rep, name in ((weekly, "This week"), (daily, "Today")):
        if not rep:
            continue
        L += [f"## {name} ({rep['start'][:10]} to {rep['end'][:10]})", "",
              f"High-value share {_pct(rep['high_value_share'])} "
              f"(previous {_pct(rep['baseline_high_value_share'])}), overhead {_pct(rep['overhead_share'])}, "
              f"{rep['commits']} commits.", ""]
        L += [f"- **{s['kind']}**: {s['text']}" for s in rep["suggestions"]] or ["- Nothing stands out."]
        L.append("")
    return "\n".join(L)


def period_end(kind: str, today: date) -> datetime:
    """Daily: midnight UTC starting `today`. Weekly: the latest Monday 00:00 UTC on or before it."""
    d = today if kind == "daily" else today - timedelta(days=today.weekday())
    return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)


def out_path(rep: dict) -> Path:
    start = datetime.fromisoformat(rep["start"]).date()
    if rep["kind"] == "weekly":
        y, w, _ = start.isocalendar()
        return HERE / "weekly" / f"{y}-W{w:02d}.md"
    return HERE / "daily" / f"{start.isoformat()}.md"


def _load_latest() -> dict:
    """The other period's headline and suggestions, kept so LATEST.md can show both."""
    try:
        d = json.loads((HERE / "LATEST.json").read_text())
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def main(argv: Iterable[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--weekly", action="store_true", help="the last full ISO week instead of the last day")
    ap.add_argument("--date", help="report for the period ending at this date (YYYY-MM-DD, UTC midnight)")
    ap.add_argument("--now", action="store_true", help="end the window now rather than at the last midnight / Monday")
    ap.add_argument("--ref", default="origin/main")
    ap.add_argument("--json", action="store_true", help="print JSON instead of Markdown")
    ap.add_argument("--write", action="store_true", help="write daily|weekly/<period>.md and refresh LATEST.md and LATEST.json")
    ap.add_argument("--no-fetch", action="store_true", help="never deepen a shallow clone")
    a = ap.parse_args(list(argv) if argv is not None else None)
    kind = "weekly" if a.weekly else "daily"
    if a.now:
        end = datetime.now(timezone.utc).replace(microsecond=0)
    else:
        end = period_end(kind, date.fromisoformat(a.date) if a.date else datetime.now(timezone.utc).date())
    rep = build(kind, end, ref=a.ref, fetch=not a.no_fetch)
    if a.write:
        p = out_path(rep)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(render(rep))
        latest = _load_latest()
        latest[kind] = {k: v for k, v in rep.items() if k != "projects"}
        (HERE / "LATEST.json").write_text(json.dumps(latest, indent=1) + "\n")
        (HERE / "LATEST.md").write_text(render_latest(latest.get("daily"), latest.get("weekly")))
        print(f"wrote {p.relative_to(REPO)} and portfolio/direction/LATEST.md", file=sys.stderr)
    print(json.dumps(rep, indent=1) if a.json else render(rep))
    return 0


if __name__ == "__main__":
    sys.exit(main())
