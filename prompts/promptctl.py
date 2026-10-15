#!/usr/bin/env python3
"""Route, record, measure and validate runs of the master prompt.

    python3 prompts/promptctl.py route              # which sub-prompt this run follows
    python3 prompts/promptctl.py record --track T --version N --session URL
    python3 prompts/promptctl.py measure            # scores per track, version and model
    python3 prompts/promptctl.py backlog            # open process improvements, ranked
    python3 prompts/promptctl.py validate           # what CI runs

`prompt.md` at the repository root is the master prompt and tells a session
when to call each command; `prompts/README.md` describes the whole loop.

Run records live one per file under `prompts/runs/`, never in a shared log:
up to four sessions merge inside the same 15 minutes here, and two branches
that both append to one file always conflict.

Standard library only, so it runs in any session without an install step.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
import re
import statistics
import subprocess
import sys
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent

REVIEW = "review"
REDTEAM = "redteam"
# prompts/goals.md: the red team / blue team share of non-review runs.
REDTEAM_SHARE = (0.05, 0.10)
OUTCOMES = ("success", "partial", "failed")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
REPO_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
PROMPT_RE = re.compile(r"^prompt-(\d+)\.md$")

# The fields `record` writes. A record must carry the REQUIRED ones with valid
# values before it can merge; the rest are null until the session or a later
# review fills them in.
RECORD_FIELDS: dict[str, Any] = {
    "date": None,
    "session": None,
    "track": None,
    "prompt_version": None,
    "input": None,
    "input_sha256": None,
    "follow_up_inputs": [],
    "model": None,
    "models_seen": [],
    "started": None,
    "ended": None,
    "wall_minutes": None,
    "tokens_in": None,
    "tokens_out": None,
    "cost_usd": None,
    "tool_calls": None,
    "task": None,
    "projects": [],
    "pr": None,
    "repo": None,  # owner/name holding `pr`; null means this repository
    "commits": [],
    "lines_added": None,
    "lines_removed": None,
    "merged": None,
    "ci_failures_before_green": None,
    "review_findings": None,
    "tests_added": None,
    "outcome": None,
    "errors": [],
    "integrity_issues": [],
    "doc_friction": [],
    "deviations": [],
    "goal": None,
    "notes": "",
    "corrections": [],
    "redteam": None,
}
REQUIRED = ("date", "session", "track", "prompt_version", "outcome",
            "errors", "integrity_issues", "doc_friction")

# Instruction files whose length `measure` reports: what a run reads before it
# can start work is a cost the review track is asked to keep down.
INSTRUCTION_FILES = (
    "prompt.md",
    "prompts/goals.md",
    "prompts/steering.md",
    "CLAUDE.md",
    "AGENTS.md",
    "research/CLAUDE.md",
    ".github/prompts/land-your-work.md",
)

# Line budgets for always-read files (prompts/steering.md). `measure` reports
# overruns; nothing fails on them, because cutting a file well takes judgment
# a check cannot make. Sub-prompts share SUBPROMPT_BUDGET.
INSTRUCTION_BUDGET = {
    "prompt.md": 100,
    "prompts/steering.md": 120,
    "CLAUDE.md": 500,
    "AGENTS.md": 250,
    ".github/prompts/land-your-work.md": 160,
}
SUBPROMPT_BUDGET = 130

# prompts/process/backlog/: one improvement per file (prompts/steering.md).
BACKLOG_STATUSES = ("open", "in_progress", "done", "dropped")
BACKLOG_REQUIRED = ("id", "title", "status", "owner", "problem", "evidence",
                    "change", "metric", "effect", "cost", "opened")
BACKLOG_ID_RE = re.compile(r"^P\d{3,}$")


# --------------------------------------------------------------------------
# Loading


def load_routing(root: Path = ROOT) -> dict[str, Any]:
    return json.loads((root / "routing.json").read_text())


def prompt_path(root: Path, track: str, version: int) -> Path:
    return root / track / f"prompt-{version}.md"


def load_runs(root: Path = ROOT) -> list[tuple[Path, dict[str, Any]]]:
    """Every run record, oldest first (by date, then file name)."""
    runs = []
    for path in sorted((root / "runs").glob("*.json")):
        runs.append((path, json.loads(path.read_text())))
    runs.sort(key=lambda pr: (str(pr[1].get("date", "")), pr[0].name))
    return runs


def _landing_order(runs: list[tuple[Path, dict[str, Any]]]) -> dict[str, int]:
    """File name -> rank by when git first added it (0 = oldest). Records carry
    only a date, so within a day `load_runs` orders them by session id, which
    is random; that scrambled "since the last review" (five reviews in one day)."""
    if not runs:
        return {}
    try:
        out = subprocess.run(
            ["git", "log", "--diff-filter=A", "--name-only", "--format=", "--",
             str(runs[0][0].parent)],
            cwd=runs[0][0].parent, capture_output=True, text=True, timeout=60,
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return {}
    names = [Path(line).name for line in out.splitlines() if line.strip()]
    # git lists newest first; a record git does not list (bulk mirror) ranks oldest.
    return {name: len(names) - i for i, name in enumerate(names)}


def runs_since_review(runs: list[tuple[Path, dict[str, Any]]]) -> int:
    """Non-review runs recorded after the most recent review run."""
    rank = _landing_order(runs)
    ordered = sorted(
        enumerate(runs),
        key=lambda ir: (str(ir[1][1].get("date", "")), rank.get(ir[1][0].name, 0), ir[0]),
    )
    count = 0
    for _, (_, rec) in ordered:
        if rec.get("track") == REVIEW:
            count = 0
        else:
            count += 1
    return count


# --------------------------------------------------------------------------
# route


def route(root: Path = ROOT, track: str | None = None, skip_review: bool = False,
          rng: random.Random | None = None) -> dict[str, Any]:
    rng = rng or random.Random()
    routing = load_routing(root)
    tracks = routing["tracks"]
    every = int(routing["review_every"])
    since = runs_since_review(load_runs(root))

    if track is not None:
        if track not in tracks:
            raise SystemExit(f"unknown track {track!r}; tracks: {', '.join(tracks)}")
        reason = "chosen by the session (--track)"
    elif (since >= every and not skip_review
          and rng.random() < float(routing.get("review_when_due", 1))):
        # Scheduled runs start in the same minute, so a due review goes to a
        # share of them rather than all of them at once.
        track = REVIEW
        reason = f"{since} merged runs since the last review (review_every = {every})"
    else:
        weights = {t: float(c.get("weight", 0)) for t, c in tracks.items()
                   if t != REVIEW and float(c.get("weight", 0)) > 0}
        if not weights:
            raise SystemExit("routing.json gives no track a positive weight")
        total = sum(weights.values())
        pick = rng.random() * total
        for track, weight in weights.items():
            pick -= weight
            if pick < 0:
                break
        reason = (f"weighted draw ({track} has weight {weights[track]:g} of {total:g}; "
                  f"{since}/{every} runs toward the next review)")

    cfg = tracks[track]
    draw = rng.random()
    candidate = cfg.get("candidate")
    if candidate is not None and draw < float(cfg.get("candidate_share", 0)):
        version, role = int(candidate), "candidate"
    else:
        version, role = int(cfg["champion"]), "champion"
    return {
        "track": track,
        "version": version,
        "role": role,
        "path": str(prompt_path(root, track, version).relative_to(root.parent)),
        "trailer": f"Prompt-Version: {track}/{version}",
        "reason": reason,
        "draw": round(draw, 4),
    }


def print_route(r: dict[str, Any]) -> None:
    print(f"Follow:  {r['path']}")
    print(f"Track:   {r['track']}, version {r['version']} ({r['role']}; draw {r['draw']})")
    print(f"Why:     {r['reason']}")
    print(f"Trailer: add `{r['trailer']}` to every commit")
    print(f"Record:  python3 prompts/promptctl.py record --track {r['track']} "
          f"--version {r['version']} --session <session url>")


# --------------------------------------------------------------------------
# record


def record(root: Path, track: str, version: int, session: str, model: str | None = None,
           text: str | None = None, day: str | None = None, repo: str | None = None) -> Path:
    routing = load_routing(root)
    if track not in routing["tracks"]:
        raise SystemExit(f"unknown track {track!r}")
    if not prompt_path(root, track, version).is_file():
        raise SystemExit(f"no prompt file for {track}/{version}")
    day = day or date.today().isoformat()
    slug = re.sub(r"[^A-Za-z0-9_-]+", "-", session.rstrip("/").rsplit("/", 1)[-1]).strip("-")
    path = root / "runs" / f"{day}-{slug or 'session'}.json"
    if path.exists():
        raise SystemExit(f"{path.relative_to(root.parent)} already exists; edit it instead")
    rec = json.loads(json.dumps(RECORD_FIELDS))
    rec.update({"date": day, "session": session, "track": track, "prompt_version": version,
                "model": model, "input": text, "repo": repo,
                # Written at the end of the run, so reviews can order records
                # in time (P003/P006 verification found 281 of 369 had none).
                "ended": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "input_sha256": hashlib.sha256(text.encode()).hexdigest() if text else None})
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(rec, indent=2) + "\n")
    return path


# --------------------------------------------------------------------------
# validate


MIRRORED_RUNS_SOURCE = "oss-research-monorepo prompts/runs.jsonl"  # as research/_mirror/mirror.py writes it


def validate_record(root: Path, path: Path, rec: Any, tracks: dict[str, Any]) -> list[str]:
    where = str(path.relative_to(root.parent))
    if not isinstance(rec, dict):
        return [f"{where}: not a JSON object"]
    errors = [f"{where}: missing {key!r}" for key in REQUIRED if key not in rec]
    if errors:
        return errors
    day = rec["date"]
    # A mirrored upstream line that recorded no date: "never measured" is not
    # a fault to repair (inventing one would be worse), and the mirror pins it.
    unmeasured = (rec.get("source") == MIRRORED_RUNS_SOURCE and day is None)
    if unmeasured:
        pass
    elif not (isinstance(day, str) and DATE_RE.match(day)):
        errors.append(f"{where}: date must be YYYY-MM-DD")
    elif not path.name.startswith(day):
        errors.append(f"{where}: file name must start with the record's date {day}")
    if not (unmeasured and rec["session"] is None) and not (
            isinstance(rec["session"], str) and rec["session"].strip()):
        errors.append(f"{where}: session must be the session URL")
    track, version = rec["track"], rec["prompt_version"]
    if track not in tracks:
        errors.append(f"{where}: unknown track {track!r}")
    elif not isinstance(version, int) or isinstance(version, bool) or version < 0:
        errors.append(f"{where}: prompt_version must be a non-negative integer")
    elif not prompt_path(root, track, version).is_file():
        errors.append(f"{where}: no prompt file for {track}/{version}")
    if rec["outcome"] not in OUTCOMES:
        errors.append(f"{where}: outcome must be one of {', '.join(OUTCOMES)} "
                      f"(got {rec['outcome']!r}); fill it in before merging")
    repo = rec.get("repo")
    if repo is not None and not (isinstance(repo, str) and REPO_RE.match(repo)):
        errors.append(f"{where}: repo must be 'owner/name' (the repository holding pr) or null")
    if rec.get("merged") not in (None, True, False):
        errors.append(f"{where}: merged must be true, false or null")
    for key in ("errors", "integrity_issues", "doc_friction"):
        if not isinstance(rec[key], list):
            errors.append(f"{where}: {key} must be a list")
    if isinstance(rec["doc_friction"], list):
        for item in rec["doc_friction"]:
            if not (isinstance(item, dict) and isinstance(item.get("file"), str)
                    and isinstance(item.get("issue"), str)):
                errors.append(f"{where}: each doc_friction entry needs a 'file' and an 'issue'")
                break
    devs = rec.get("deviations", [])
    if not isinstance(devs, list) or not all(
            isinstance(d, dict) and isinstance(d.get("file"), str) and isinstance(d.get("why"), str)
            for d in devs):
        errors.append(f"{where}: deviations must be a list of entries with a 'file' and a 'why'")
    rt = rec.get("redteam")
    if rt is not None:
        errors.extend(validate_redteam(where, rt))
    return errors


def validate_redteam(where: str, rt: Any) -> list[str]:
    """Structure only: the rates are derived from the mutants, never stored."""
    if not isinstance(rt, dict) or not isinstance(rt.get("campaigns", []), list) \
            or not isinstance(rt.get("real_defects", []), list):
        return [f"{where}: redteam must be an object with 'campaigns' and 'real_defects' lists"]
    errors = []
    for camp in rt.get("campaigns", []):
        if not (isinstance(camp, dict) and isinstance(camp.get("target"), str)
                and isinstance(camp.get("mutants"), list)):
            errors.append(f"{where}: each redteam campaign needs a 'target' and a 'mutants' list")
            continue
        for m in camp["mutants"]:
            if not (isinstance(m, dict) and isinstance(m.get("caught"), bool)
                    and isinstance(m.get("line"), int) and isinstance(m.get("operator"), str)):
                errors.append(f"{where}: each mutant needs 'line', 'operator' and a boolean 'caught'")
                break
            if m.get("triage") not in (None, "gap", "equivalent"):
                errors.append(f"{where}: mutant triage must be null, 'gap' or 'equivalent'")
                break
            if m["caught"] and m.get("triage") == "equivalent":
                errors.append(f"{where}: a caught mutant cannot be 'equivalent'")
                break
    for d in rt.get("real_defects", []):
        if not (isinstance(d, dict) and isinstance(d.get("file"), str)
                and isinstance(d.get("issue"), str) and isinstance(d.get("patched"), bool)):
            errors.append(f"{where}: each real defect needs 'file', 'issue' and a boolean 'patched'")
            break
    return errors


def load_backlog(root: Path = ROOT) -> list[tuple[Path, Any]]:
    folder = root / "process" / "backlog"
    return [(p, json.loads(p.read_text())) for p in sorted(folder.glob("*.json"))] \
        if folder.is_dir() else []


def validate_backlog_item(root: Path, path: Path, item: Any) -> list[str]:
    where = str(path.relative_to(root.parent))
    if not isinstance(item, dict):
        return [f"{where}: not a JSON object"]
    errors = [f"{where}: missing {key!r}" for key in BACKLOG_REQUIRED if key not in item]
    if errors:
        return errors
    if not (isinstance(item["id"], str) and BACKLOG_ID_RE.match(item["id"])
            and path.name.startswith(item["id"] + "-")):
        errors.append(f"{where}: id must be P<nnn> and the file name must start with '<id>-'")
    if item["status"] not in BACKLOG_STATUSES:
        errors.append(f"{where}: status must be one of {', '.join(BACKLOG_STATUSES)}")
    if item["owner"] not in ("agent", "owner"):
        errors.append(f"{where}: owner must be 'agent' or 'owner'")
    for key in ("effect", "cost"):
        if item[key] not in (1, 2, 3):
            errors.append(f"{where}: {key} must be 1, 2 or 3")
    if not isinstance(item["evidence"], list) or not item["evidence"]:
        errors.append(f"{where}: evidence must be a non-empty list (where each number came from)")
    if not (isinstance(item["opened"], str) and DATE_RE.match(item["opened"])):
        errors.append(f"{where}: opened must be YYYY-MM-DD")
    if item["status"] == "done" and not item.get("pr"):
        errors.append(f"{where}: a done item names the pull request that did it ('pr')")
    if item["status"] == "dropped" and not item.get("result"):
        errors.append(f"{where}: a dropped item says why in 'result'")
    return errors


def backlog_rank(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Open items, best first: effect over cost, agent-owned before owner-owned, oldest first."""
    open_items = [i for i in items if i.get("status") in ("open", "in_progress")]
    return sorted(open_items, key=lambda i: (i.get("status") == "in_progress",
                                             i.get("owner") != "agent",
                                             -i["effect"] / i["cost"], i["opened"], i["id"]))


def backlog_summary(items: list[dict[str, Any]]) -> dict[str, Any]:
    counts = {s: sum(1 for i in items if i.get("status") == s) for s in BACKLOG_STATUSES}
    done = [i for i in items if i.get("status") == "done"]
    return {"counts": counts,
            "done_unverified": [i["id"] for i in done if not i.get("result")],
            "next": [f"{i['id']} {i['title']}" for i in backlog_rank(items)[:3]]}


def print_backlog(root: Path = ROOT) -> None:
    items = [item for _, item in load_backlog(root)]
    ranked = backlog_rank(items)
    s = backlog_summary(items)
    c = s["counts"]
    print(f"# Process backlog: {c['open']} open, {c['in_progress']} in progress, "
          f"{c['done']} done ({len(s['done_unverified'])} not yet verified), {c['dropped']} dropped\n")
    print("Ranked by effect/cost, agent-owned first. Before taking one, search open PRs for its id.\n")
    print("| id | owner | effect/cost | status | title |")
    print("|---|---|---|---|---|")
    for i in ranked:
        print(f"| {i['id']} | {i['owner']} | {i['effect']}/{i['cost']} | {i['status']} | {i['title']} |")
    if s["done_unverified"]:
        print(f"\nDone but metric not yet checked: {', '.join(s['done_unverified'])}")


def redteam_share(tracks: dict[str, Any]) -> float | None:
    """The red-team share of the non-review routing weight, or None without the track."""
    if REDTEAM not in tracks:
        return None
    weights = {t: float(c.get("weight", 0)) for t, c in tracks.items() if t != REVIEW}
    total = sum(weights.values())
    return weights[REDTEAM] / total if total else 0.0


def validate(root: Path = ROOT) -> list[str]:
    errors: list[str] = []
    for name in ("routing.json", "goals.md", "experiments.md", "README.md"):
        if not (root / name).is_file():
            errors.append(f"prompts/{name} is missing")
    master = root.parent / "prompt.md"
    if not master.is_file() or "promptctl.py route" not in master.read_text():
        errors.append("prompt.md must exist and send runs through `promptctl.py route`")
    if errors:
        return errors

    routing = load_routing(root)
    every = routing.get("review_every")
    if not isinstance(every, int) or isinstance(every, bool) or every < 1:
        errors.append("routing.json: review_every must be a positive integer")
    share = routing.get("review_when_due", 1)
    if not isinstance(share, (int, float)) or isinstance(share, bool) or not 0 < share <= 1:
        errors.append("routing.json: review_when_due must be in (0, 1]")
    tracks = routing.get("tracks")
    if not isinstance(tracks, dict) or REVIEW not in tracks:
        return errors + ["routing.json: tracks must be an object that includes 'review'"]
    if not any(float(c.get("weight", 0)) > 0 for t, c in tracks.items() if t != REVIEW):
        errors.append("routing.json: at least one non-review track needs a positive weight")
    share = redteam_share(tracks)
    if share is not None and not REDTEAM_SHARE[0] <= share <= REDTEAM_SHARE[1]:
        low, high = REDTEAM_SHARE
        errors.append(f"routing.json: redteam is {share:.1%} of non-review weight; "
                      f"prompts/goals.md holds it between {low:.0%} and {high:.0%}")

    for track, cfg in tracks.items():
        label = f"routing.json: {track}"
        weight = cfg.get("weight", 0)
        if not isinstance(weight, (int, float)) or weight < 0:
            errors.append(f"{label}: weight must be a number >= 0")
        champion, candidate = cfg.get("champion"), cfg.get("candidate")
        share = cfg.get("candidate_share", 0)
        if not isinstance(champion, int) or not prompt_path(root, track, champion).is_file():
            errors.append(f"{label}: champion must name an existing prompts/{track}/prompt-<n>.md")
        if candidate is None:
            if share:
                errors.append(f"{label}: candidate_share must be 0 when there is no candidate")
        elif not isinstance(candidate, int) or not prompt_path(root, track, candidate).is_file():
            errors.append(f"{label}: candidate must name an existing prompts/{track}/prompt-<n>.md")
        elif candidate == champion:
            errors.append(f"{label}: candidate and champion are the same version")
        if not isinstance(share, (int, float)) or not 0 <= share <= 1:
            errors.append(f"{label}: candidate_share must be between 0 and 1")
        for path in sorted((root / track).glob("*.md")):
            if not PROMPT_RE.match(path.name):
                errors.append(f"prompts/{track}/{path.name}: prompt files are named prompt-<n>.md")
            elif "goals.md" not in path.read_text():
                # Every version must point at the goals and guardrails, so no
                # candidate can drop them by omission.
                errors.append(f"prompts/{track}/{path.name}: must link to prompts/goals.md")

    for path in sorted((root / "runs").glob("*")):
        if path.name == "README.md":
            continue
        if path.suffix != ".json":
            errors.append(f"prompts/runs/{path.name}: run records are .json files")
            continue
        try:
            rec = json.loads(path.read_text())
        except json.JSONDecodeError as exc:
            errors.append(f"prompts/runs/{path.name}: invalid JSON ({exc})")
            continue
        errors.extend(validate_record(root, path, rec, tracks))

    seen: dict[str, str] = {}
    for path in sorted((root / "process" / "backlog").glob("*.json")) \
            if (root / "process" / "backlog").is_dir() else []:
        try:
            item = json.loads(path.read_text())
        except json.JSONDecodeError as exc:
            errors.append(f"prompts/process/backlog/{path.name}: invalid JSON ({exc})")
            continue
        errors.extend(validate_backlog_item(root, path, item))
        if isinstance(item, dict) and isinstance(item.get("id"), str):
            if item["id"] in seen:
                errors.append(f"prompts/process/backlog/{path.name}: id {item['id']} is also "
                              f"used by {seen[item['id']]}; take the next free number")
            seen[item["id"]] = path.name
    return errors


# --------------------------------------------------------------------------
# measure


def wilson(successes: int, n: int, z: float = 1.96) -> tuple[float, float]:
    """95% Wilson score interval for a proportion; (0, 1) when n is 0."""
    if n == 0:
        return 0.0, 1.0
    p = successes / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return max(0.0, centre - half), min(1.0, centre + half)


def summarise(recs: list[dict[str, Any]]) -> dict[str, Any]:
    n = len(recs)
    ok = sum(1 for r in recs if r.get("outcome") == "success" and r.get("merged") is not False)
    low, high = wilson(ok, n)
    ci = [r["ci_failures_before_green"] for r in recs
          if isinstance(r.get("ci_failures_before_green"), (int, float))]
    minutes = [r["wall_minutes"] for r in recs if isinstance(r.get("wall_minutes"), (int, float))]
    return {
        "runs": n,
        "success": ok,
        "success_rate": round(ok / n, 3) if n else None,
        "success_ci95": [round(low, 3), round(high, 3)],
        "integrity_issues": sum(len(r.get("integrity_issues") or []) for r in recs),
        "leaked": sum(1 for r in recs if r.get("merged") is False),
        "merged_unknown": sum(1 for r in recs if r.get("merged") is None),
        "errors_per_run": round(sum(len(r.get("errors") or []) for r in recs) / n, 2) if n else None,
        "ci_failures_mean": round(statistics.mean(ci), 2) if ci else None,
        "wall_minutes_median": statistics.median(minutes) if minutes else None,
        "doc_friction": sum(len(r.get("doc_friction") or []) for r in recs),
    }


def verdict(champ: dict[str, Any], cand: dict[str, Any], min_runs: int = 10) -> str:
    """A suggestion for the review track, never a decision; the rule is in prompts/README.md."""
    if min(champ["runs"], cand["runs"]) < min_runs:
        return (f"keep collecting: {cand['runs']} candidate and {champ['runs']} champion "
                f"runs, fewer than {min_runs} each")
    champ_ir = champ["integrity_issues"] / champ["runs"]
    cand_ir = cand["integrity_issues"] / cand["runs"]
    if cand_ir > champ_ir:
        return "retire: more integrity issues per run than the champion"
    if cand["success_ci95"][1] < champ["success_rate"]:
        return "retire: clearly lower success rate"
    if cand["success_ci95"][0] > champ["success_rate"]:
        return "promote: clearly higher success rate, no more integrity issues"
    return "keep collecting: the intervals overlap"


def measure(root: Path = ROOT) -> dict[str, Any]:
    routing = load_routing(root)
    runs = [rec for _, rec in load_runs(root)]
    by_version: dict[tuple[str, int], list[dict[str, Any]]] = defaultdict(list)
    by_model: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    by_input: dict[str, list[dict[str, Any]]] = defaultdict(list)
    friction: dict[str, list[str]] = defaultdict(list)
    deviations: dict[str, list[str]] = defaultdict(list)
    for rec in runs:
        by_version[(rec["track"], rec["prompt_version"])].append(rec)
        by_model[(rec["track"], rec.get("model") or "unknown")].append(rec)
        by_input[rec.get("input_sha256") or "unknown"].append(rec)
        for item in rec.get("doc_friction") or []:
            if not isinstance(item, dict):  # malformed free-text entry: keep it countable
                item = {"file": "(unattributed)", "issue": str(item)}
            friction[item["file"]].append(f"{rec['date']}: {item['issue']}")
        for item in rec.get("deviations") or []:
            if not isinstance(item, dict):
                item = {"file": "(unattributed)", "why": str(item)}
            deviations[item["file"]].append(
                f"{rec['date']}: {item.get('did') or item.get('instruction') or '?'} "
                f"(why: {item.get('why')}; result: {item.get('result') or 'unknown'})")

    candidates = {}
    for track, cfg in routing["tracks"].items():
        if cfg.get("candidate") is None:
            continue
        champ = summarise(by_version.get((track, cfg["champion"]), []))
        cand = summarise(by_version.get((track, cfg["candidate"]), []))
        candidates[track] = {"champion": cfg["champion"], "candidate": cfg["candidate"],
                             "suggestion": verdict(champ, cand)}

    sizes = {}
    for rel in INSTRUCTION_FILES:
        path = root.parent / rel
        if path.is_file():
            sizes[rel] = len(path.read_text().splitlines())
    for track, cfg in routing["tracks"].items():
        path = prompt_path(root, track, cfg["champion"])
        if path.is_file():
            sizes[str(path.relative_to(root.parent))] = len(path.read_text().splitlines())

    from redteam import tally  # prompts/redteam.py, alongside this file
    recent = runs[-100:]
    share = (sum(1 for r in recent if r.get("track") == REDTEAM) / len(recent)) if recent else None
    return {
        "runs": len(runs),
        "redteam": {**tally(runs), "routed_share": redteam_share(routing["tracks"]),
                    "recorded_share_last_100": round(share, 3) if share is not None else None},
        "since_review": runs_since_review(load_runs(root)),
        "review_every": routing["review_every"],
        "by_version": {f"{t}/{v}": summarise(r) for (t, v), r in sorted(by_version.items())},
        "by_model": {f"{t} {m}": summarise(r) for (t, m), r in sorted(by_model.items())},
        "by_input": {k: summarise(r) for k, r in sorted(by_input.items())},
        "candidates": candidates,
        "doc_friction": {f: {"reports": len(v), "recent": v[-3:]}
                         for f, v in sorted(friction.items(), key=lambda kv: -len(kv[1]))},
        "deviations": {f: {"reports": len(v), "recent": v[-3:]}
                       for f, v in sorted(deviations.items(), key=lambda kv: -len(kv[1]))},
        "instruction_lines": sizes,
        "instruction_budget": {rel: budget_for(rel) for rel in sizes},
        "backlog": backlog_summary([item for _, item in load_backlog(root)]),
    }


def budget_for(rel: str) -> int | None:
    if rel in INSTRUCTION_BUDGET:
        return INSTRUCTION_BUDGET[rel]
    return SUBPROMPT_BUDGET if PROMPT_RE.match(Path(rel).name) else None


def print_measure(m: dict[str, Any]) -> None:
    print(f"# Prompt scores ({m['runs']} recorded runs; {m['since_review']} since the last "
          f"review, one is due every {m['review_every']})\n")

    def table(title: str, rows: dict[str, dict[str, Any]]) -> None:
        print(f"## {title}\n")
        print("| | runs | success | 95% CI | integrity | leaked | merged? | errors/run | CI fails | minutes | friction |")
        print("|---|---|---|---|---|---|---|---|---|---|---|")
        for key, s in rows.items():
            rate = "-" if s["success_rate"] is None else f"{s['success_rate']:.0%}"
            lo, hi = s["success_ci95"]
            print(f"| {key} | {s['runs']} | {rate} | {lo:.0%}-{hi:.0%} | {s['integrity_issues']} | "
                  f"{s['leaked']} | {s['merged_unknown']} unknown | {s['errors_per_run']} | "
                  f"{s['ci_failures_mean']} | {s['wall_minutes_median']} | {s['doc_friction']} |")
        print()

    table("By track and prompt version", m["by_version"])
    table("By track and model", m["by_model"])
    table("By starting message (input_sha256)", m["by_input"])
    print("## Active candidates\n")
    if not m["candidates"]:
        print("None. The review track writes the next one.\n")
    for track, c in m["candidates"].items():
        print(f"- {track}: candidate {c['candidate']} vs champion {c['champion']}: {c['suggestion']}")
    print("\n## Doc friction by file\n")
    if not m["doc_friction"]:
        print("None reported.\n")
    for path, f in m["doc_friction"].items():
        print(f"- `{path}`: {f['reports']} report(s); latest: " + " | ".join(f["recent"]))
    print("\n## Deviations by file (judgment calls; prompts/steering.md)\n")
    if not m["deviations"]:
        print("None recorded.\n")
    for path, f in m["deviations"].items():
        print(f"- `{path}`: {f['reports']} deviation(s); latest: " + " | ".join(f["recent"]))
    b = m["backlog"]
    c = b["counts"]
    print("\n## Process backlog (`promptctl.py backlog`)\n")
    print(f"- {c['open']} open, {c['in_progress']} in progress, {c['done']} done, {c['dropped']} dropped")
    if b["done_unverified"]:
        print(f"- Done, metric not yet checked: {', '.join(b['done_unverified'])}")
    if b["next"]:
        print("- Next: " + "; ".join(b["next"]))
    rt = m["redteam"]
    print("\n## Red team / blue team\n")
    if not rt["seeded"]:
        print("No faults seeded yet: catch rate never measured (not zero).\n")
    else:
        print(f"- Catch rate: {rt['catch_rate']:.0%} of {rt['seeded'] - rt['equivalent']} "
              f"non-equivalent seeded faults ({rt['caught']} caught, {rt['escaped']} escaped, "
              f"{rt['equivalent']} equivalent, {rt['untriaged']} untriaged)")
        print(f"- After the blue team's guards: {rt['catch_rate_after_fix']:.0%}")
        print(f"- Real defects: {rt['real_defects']} found in {rt['redteam_runs']} run(s), "
              f"{rt['real_defects_patched']} patched ({rt['defects_per_run']} per run)")
    routed = rt["routed_share"]
    recorded = rt["recorded_share_last_100"]
    print(f"- Share of runs: routed {routed:.1%}" if routed is not None else "- Share of runs: no track",
          end="")
    print(f", recorded {recorded:.1%} of the last 100 (goal 5-10%)\n" if recorded is not None else "\n")
    print("## Instruction lines a run may read\n")
    for path, lines in m["instruction_lines"].items():
        budget = m["instruction_budget"].get(path)
        over = f" (budget {budget}, over by {lines - budget})" if budget and lines > budget \
            else (f" (budget {budget})" if budget else "")
        print(f"- `{path}`: {lines}{over}")
    print("\nFewer than about 10 runs per row is too few to compare; say so rather than conclude.")


# --------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("route", help="pick this run's sub-prompt and version")
    p.add_argument("--track", help="force a track (the session's task decides it)")
    p.add_argument("--skip-review", action="store_true",
                   help="a review is due but another run has already claimed it")
    p.add_argument("--seed", type=int, help="deterministic draw, for tests")
    p.add_argument("--json", action="store_true")
    p = sub.add_parser("record", help="write this run's record skeleton")
    p.add_argument("--track", required=True)
    p.add_argument("--version", type=int, required=True)
    p.add_argument("--session", required=True, help="the session URL")
    p.add_argument("--model", help="the model id that made the commits")
    p.add_argument("--input", help="the message that started the run, secrets redacted")
    p.add_argument("--date", help="YYYY-MM-DD, default today")
    p.add_argument("--repo", help="owner/name of the repository that holds the PR, if not this one "
                   "(e.g. the upstream research repo), so a review can look the PR up")
    p = sub.add_parser("measure", help="score prompt versions from the run records")
    p.add_argument("--json", action="store_true")
    sub.add_parser("backlog", help="list open process improvements, best first")
    sub.add_parser("validate", help="check routing, prompts, run records and the backlog")
    args = parser.parse_args(argv)

    if args.cmd == "route":
        rng = random.Random(args.seed) if args.seed is not None else None
        r = route(ROOT, args.track, args.skip_review, rng)
        print(json.dumps(r, indent=2)) if args.json else print_route(r)
        return 0
    if args.cmd == "record":
        path = record(ROOT, args.track, args.version, args.session, args.model, args.input, args.date, args.repo)
        print(f"Wrote {path.relative_to(ROOT.parent)}. Fill in outcome, pr, errors, "
              "integrity_issues and doc_friction, then commit it as the last commit on your "
              "work branch, before merging.\n"
              f"Shapes the validator enforces: outcome is one of {', '.join(OUTCOMES)} "
              "(a bare word, not a sentence; put the story in notes); doc_friction is a list of "
              '{"file": ..., "issue": ...}; deviations a list of {"file": ..., "why": ...}. '
              "Check with: python3 prompts/promptctl.py validate")
        return 0
    if args.cmd == "measure":
        m = measure(ROOT)
        print(json.dumps(m, indent=2)) if args.json else print_measure(m)
        return 0
    if args.cmd == "backlog":
        print_backlog(ROOT)
        return 0
    errors = validate(ROOT)
    for err in errors:
        print(f"error: {err}", file=sys.stderr)
    if errors:
        return 1
    print(f"ok: routing, prompts and {len(load_runs(ROOT))} run record(s) are valid")
    return 0


if __name__ == "__main__":
    sys.exit(main())
