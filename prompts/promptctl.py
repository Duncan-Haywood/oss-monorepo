#!/usr/bin/env python3
"""Route, record, measure and validate runs of the master prompt.

    python3 prompts/promptctl.py route              # which sub-prompt this run follows
    python3 prompts/promptctl.py record --track T --version N --session URL
    python3 prompts/promptctl.py measure            # scores per track, version and model
    python3 prompts/promptctl.py backlog            # open process improvements, ranked
    python3 prompts/promptctl.py map [--track T]    # the guidance files, by layer
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
import contextlib
import hashlib
import io
import json
import math
import random
import re
import statistics
import subprocess
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent

REVIEW = "review"
REDTEAM = "redteam"
# prompts/goals.md: the red team / blue team share of non-review runs.
REDTEAM_SHARE = (0.05, 0.10)
OUTCOMES = ("success", "partial", "failed")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
PR_REQUIRED_FROM = "2026-10-19"  # earlier records left `pr` null (34 of 34 red-team records, 2026-10-17/18)
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
    "writeups": [],  # repo paths of the agent doc and post this run wrote or extended (goals.md)
    "goal": None,
    "notes": "",
    "corrections": [],
    "redteam": None,
}
REQUIRED = ("date", "session", "track", "prompt_version", "outcome",
            "errors", "integrity_issues", "doc_friction")

# Every agent-guidance file, its layer and its line budget, live in
# prompts/system.json (prompts/SYSTEM.md explains the layers). `measure`
# reports the length of the always-read ones against their budget: what a run
# reads before it can start work is a cost the review track is asked to keep
# down. Nothing fails on a budget, because cutting a file well takes judgment
# a check cannot make; `validate` fails only on a file the map does not know.


def load_system(root: Path = ROOT) -> dict[str, Any]:
    path = root / "system.json"
    return json.loads(path.read_text()) if path.is_file() else {"layers": [], "docs": []}


def glob_re(pattern: str) -> re.Pattern[str]:
    """`*` stays inside one directory; `**/` spans any number of them, a bare `**` anything."""
    out, i = "", 0
    while i < len(pattern):
        if pattern.startswith("**/", i):
            out, i = out + "(?:.*/)?", i + 3
        elif pattern.startswith("**", i):
            out, i = out + ".*", i + 2
        elif pattern[i] == "*":
            out, i = out + "[^/]*", i + 1
        else:
            out, i = out + re.escape(pattern[i]), i + 1
    return re.compile(out + r"\Z")


def doc_for(rel: str, system: dict[str, Any]) -> dict[str, Any] | None:
    """The map entry covering `rel`: an exact path first, then the first glob."""
    for doc in system.get("docs", []):
        if doc.get("path") == rel:
            return doc
    for doc in system.get("docs", []):
        if "glob" in doc and glob_re(doc["glob"]).match(rel):
            return doc
    return None


_SYSTEM = load_system()
INSTRUCTION_FILES = tuple(d["path"] for d in _SYSTEM["docs"] if d.get("always_read") and "path" in d)
INSTRUCTION_BUDGET = {d["path"]: d["budget"] for d in _SYSTEM["docs"] if "path" in d and "budget" in d}
SUBPROMPT_BUDGET = next((d["budget"] for d in _SYSTEM["docs"]
                         if d.get("glob") == "prompts/*/prompt-*.md" and "budget" in d), 130)

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


BULK_ADD = 50  # records added by one commit before its order is ignored


def _landing_order(runs: list[tuple[Path, dict[str, Any]]]) -> dict[str, int]:
    """File name -> rank by when git first added it (0 = oldest). Records carry
    only a date, so within a day `load_runs` orders them by session id, which
    is random; that scrambled "since the last review" (five reviews in one day)."""
    if not runs:
        return {}
    try:
        out = subprocess.run(
            ["git", "log", "--diff-filter=A", "--name-only", "--format=tformat:@@", "--",
             str(runs[0][0].parent)],
            cwd=runs[0][0].parent, capture_output=True, text=True, timeout=60,
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return {}
    # A commit adding many records at once (a shallow clone's root, a bulk
    # mirror) says nothing about their order: rank those as unknown (oldest)
    # and let `runs_since_review` fall back to the record's `ended` time.
    names = []
    for chunk in out.split("@@"):
        files = [Path(line).name for line in chunk.splitlines() if line.strip()]
        if len(files) <= BULK_ADD:
            names.extend(files)
    # git lists newest first; a record git does not list (bulk mirror) ranks oldest.
    return {name: len(names) - i for i, name in enumerate(names)}


def runs_since_review(runs: list[tuple[Path, dict[str, Any]]]) -> int:
    """Non-review runs recorded after the most recent review run.

    Records mirrored from the upstream research repo (they carry `source`) are
    not runs of this repository and do not make a review due."""
    rank = _landing_order(runs)
    ordered = sorted(
        enumerate(runs),
        key=lambda ir: (str(ir[1][1].get("date", "")), rank.get(ir[1][0].name, 0),
                        str(ir[1][1].get("ended") or ""), ir[0]),
    )
    count = 0
    for _, (_, rec) in ordered:
        if rec.get("track") == REVIEW:
            count = 0
        elif not rec.get("source"):
            count += 1
    return count


# --------------------------------------------------------------------------
# route


def expired(cfg: dict[str, Any], today: date | None = None) -> bool:
    """A track with an `until` date (a share the owner set for a period) stops
    being drawn after that day; `--track` still reaches it."""
    until = cfg.get("until")
    return bool(until) and (today or date.today()) > date.fromisoformat(until)


# Phrases in the message that started a run which name a track's work. The
# first track with a hit wins; no hit leaves the weighted draw alone. Doc
# friction, 2026-10-27 to 29: eight runs asked for revenue products, were drawn
# research or process, and followed the prompt by hand.
TASK_HINTS: list[tuple[str, tuple[str, ...]]] = [
    ("ventures", ("revenue", "products in production", "venture", "sell and support",
                  "ios android", "marketing sites", "portfolio site")),
    ("research", ("research programme", "research program", "phd", "paper")),
    ("process", ("the prompts", "the process", "routing", "backlog")),
]


def infer_track(task: str, tracks: dict[str, Any]) -> str | None:
    """The track a run's starting message asks for, or None when it names none."""
    low = task.lower()
    for track, words in TASK_HINTS:
        if track in tracks and any(w in low for w in words):
            return track
    return None


def route(root: Path = ROOT, track: str | None = None, skip_review: bool = False,
          rng: random.Random | None = None, today: date | None = None,
          task: str | None = None) -> dict[str, Any]:
    rng = rng or random.Random()
    routing = load_routing(root)
    tracks = routing["tracks"]
    every = int(routing["review_every"])
    since = runs_since_review(load_runs(root))
    inferred = infer_track(task, tracks) if task and track is None else None
    if inferred:
        track = inferred

    if inferred:
        reason = f"the starting message asks for {inferred} work (--task)"
    elif track is not None:
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
                   if t != REVIEW and float(c.get("weight", 0)) > 0 and not expired(c, today)}
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
    n = 1
    while path.exists():  # scheduled routines reuse a session id across firings
        n += 1
        path = root / "runs" / f"{day}-{slug or 'session'}-{n}.json"
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


MIRRORED_RUNS_SOURCE = "oss-research-monorepo prompts/runs.jsonl"  # as the retired research mirror wrote it (records before the 2026-10-16 cutover)


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
    if (rec["outcome"] == "success" and rec.get("pr") is None and rec.get("merged") is not False
            and isinstance(day, str) and day >= PR_REQUIRED_FROM):
        errors.append(f"{where}: a successful run names its pull request in `pr` (it is open "
                      f"since the first push); records that leave it null cannot be joined to PRs")
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
    ups = rec.get("writeups", [])
    if not isinstance(ups, list) or not all(isinstance(u, str) for u in ups):
        errors.append(f"{where}: writeups must be a list of repository paths")
    rt = rec.get("redteam")
    if rt is not None:
        errors.extend(validate_redteam(where, rt))
    usage = rec.get("usage")
    if usage is not None:
        errors.extend(validate_usage(where, usage))
    return errors


def validate_usage(where: str, usage: Any) -> list[str]:
    """The block prompts/runcost.py writes. A block without `measured_by` predates
    the tool (one record, 2026-10-14): it is left alone and runcost.py report skips it."""
    if not isinstance(usage, dict):
        return [f"{where}: usage must be the object `prompts/runcost.py attach` writes"]
    by = usage.get("measured_by")
    if by is None:
        return []
    if not (isinstance(by, str) and by.startswith("prompts/runcost.py")):
        return [f"{where}: usage.measured_by must name prompts/runcost.py; do not type usage by hand"]
    errors = []
    for key in ("models", "totals", "time", "certainty"):
        if not isinstance(usage.get(key), dict):
            errors.append(f"{where}: usage.{key} must be an object")
    human = usage.get("human_equivalent")
    if human is not None and not (isinstance(human, dict) and isinstance(human.get("basis"), str)
                                  and human["basis"].strip()):
        errors.append(f"{where}: usage.human_equivalent needs the basis of the estimate")
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
        errors.append(f"{where}: a done item names the pull request that did it ('pr', or \"this\" while its PR is unopened)")
    if item["status"] == "dropped" and not item.get("result"):
        errors.append(f"{where}: a dropped item says why in 'result'")
    return errors


def backlog_rank(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Open items, best first: effect over cost, agent-owned before owner-owned, oldest first."""
    open_items = [i for i in items if i.get("status") in ("open", "in_progress")]
    return sorted(open_items, key=lambda i: (i.get("status") == "in_progress",
                                             i.get("owner") != "agent",
                                             -i["effect"] / i["cost"], i["opened"], i["id"]))


def backlog_blocked(item: dict[str, Any]) -> bool:
    """An item whose `change` opens with "Blocked on" waits on something an agent cannot supply."""
    return str(item.get("change") or "").lstrip().lower().startswith("blocked on")


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
        tag = " (blocked)" if backlog_blocked(i) else ""
        print(f"| {i['id']} | {i['owner']} | {i['effect']}/{i['cost']} | {i['status']} | {i['title']}{tag} |")
    if ranked and not [i for i in ranked if i["owner"] == "agent" and not backlog_blocked(i)]:
        print("\nNo agent-owned item can be worked now (owner rows or blocked ones only): "
              "use Critique mode (process prompt, \"What to do\"); a Verify-only run usually ends partial.")
    started = [i for i in ranked if i["status"] == "in_progress" and i.get("history")]
    if started:
        print("\nIn progress, latest history line (what is left):")
        for i in started:
            last = i["history"][-1]
            last = last.get("note", "") if isinstance(last, dict) else last
            print(f"- {i['id']}: {last[:300]}")
    if s["done_unverified"]:
        print(f"\nDone but metric not yet checked: {', '.join(s['done_unverified'])}")


def redteam_share(tracks: dict[str, Any]) -> float | None:
    """The red-team share of the non-review routing weight, or None without the track."""
    if REDTEAM not in tracks:
        return None
    weights = {t: float(c.get("weight", 0)) for t, c in tracks.items() if t != REVIEW}
    total = sum(weights.values())
    return weights[REDTEAM] / total if total else 0.0


def redteam_band_warning(root: Path = ROOT) -> str | None:
    """A default, not a hard limit (goals.md, "Strong defaults"): warn, don't fail."""
    try:
        tracks = load_routing(root).get("tracks")
    except (OSError, ValueError):
        return None
    share = redteam_share(tracks) if isinstance(tracks, dict) else None
    if share is None or REDTEAM_SHARE[0] <= share <= REDTEAM_SHARE[1]:
        return None
    low, high = REDTEAM_SHARE
    return (f"routing.json: redteam is {share:.1%} of non-review weight; "
            f"prompts/goals.md aims for {low:.0%}-{high:.0%}")


def validate_posts(root: Path) -> list[str]:
    """Blog posts that CI's front-matter check would reject (over-long description,
    missing tags). Posts reached main red four times in three days because the
    only gate was a CI job runs merged past; this puts it where every run looks."""
    checker = root.parent / "platform" / "ci" / "check_post_frontmatter.py"
    posts = root.parent / "docs" / "posts"
    if not (checker.is_file() and posts.is_dir()):
        return []
    done = subprocess.run([sys.executable, str(checker), "--root", str(root.parent)],
                          capture_output=True, text=True)
    if done.returncode == 0:
        return []
    return [f"docs/posts/{line}" for line in done.stdout.splitlines() if line.strip()]


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

    for track, cfg in tracks.items():
        label = f"routing.json: {track}"
        weight = cfg.get("weight", 0)
        if not isinstance(weight, (int, float)) or weight < 0:
            errors.append(f"{label}: weight must be a number >= 0")
        until = cfg.get("until")
        if until is not None:
            try:
                date.fromisoformat(until)
            except (TypeError, ValueError):
                errors.append(f"{label}: until must be a YYYY-MM-DD date")
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
    errors.extend(validate_system(root))
    errors.extend(validate_posts(root))
    return errors


def tracked_files(repo: Path) -> list[str]:
    try:
        out = subprocess.run(["git", "ls-files"], cwd=repo, capture_output=True, text=True, check=True)
        files = out.stdout.splitlines()
        if files:
            return files
    except (OSError, subprocess.CalledProcessError):
        pass
    return [str(p.relative_to(repo)) for p in repo.rglob("*.md")
            if p.is_file() and "node_modules" not in p.parts and ".git" not in p.parts]


def validate_system(root: Path = ROOT) -> list[str]:
    """prompts/system.json must know every guidance file, and only real ones."""
    if not (root / "system.json").is_file():
        return []
    where = "prompts/system.json"
    try:
        system = load_system(root)
    except json.JSONDecodeError as exc:
        return [f"{where}: invalid JSON ({exc})"]
    errors: list[str] = []
    layers = [layer.get("id") for layer in system.get("layers", [])]
    changers = set(system.get("changed_by", []))
    repo = root.parent
    seen: set[str] = set()
    for doc in system.get("docs", []):
        key = doc.get("path") or doc.get("glob")
        if not key or ("path" in doc) == ("glob" in doc):
            errors.append(f"{where}: each doc names exactly one of path or glob ({doc})")
            continue
        if key in seen:
            errors.append(f"{where}: {key} is listed twice")
        seen.add(key)
        if doc.get("layer") not in layers:
            errors.append(f"{where}: {key} has layer {doc.get('layer')!r}; layers are {layers}")
        if doc.get("changed_by") not in changers:
            errors.append(f"{where}: {key} has changed_by {doc.get('changed_by')!r}; one of {sorted(changers)}")
        if not doc.get("answers"):
            errors.append(f"{where}: {key} must say which question it answers")
        if "path" in doc and not (repo / key).is_file():
            errors.append(f"{where}: {key} does not exist; remove it or fix the path")
        budget = doc.get("budget")
        if budget is not None and (not isinstance(budget, int) or isinstance(budget, bool) or budget < 1):
            errors.append(f"{where}: {key} budget must be a positive integer of lines")
    if any(d.get("layer") == "goals" and d.get("changed_by") != "owner" for d in system.get("docs", [])):
        errors.append(f"{where}: the goals layer belongs to the owner (changed_by: owner)")

    patterns = [glob_re(g) for g in system.get("guidance_patterns", [])]
    ignored = [glob_re(g) for g in system.get("ignore", [])]
    for rel in tracked_files(repo):
        if not any(p.match(rel) for p in patterns) or any(p.match(rel) for p in ignored):
            continue
        if doc_for(rel, system) is None:
            errors.append(f"{rel}: agent guidance with no entry in {where}; add it with its "
                          "layer and the question it answers (prompts/SYSTEM.md, \"Where new guidance goes\")")
    return errors


def print_map(root: Path = ROOT, track: str | None = None) -> None:
    """The guidance a run reads, by layer, highest precedence first."""
    system = load_system(root)
    repo = root.parent
    print("# Guidance map (prompts/SYSTEM.md); a higher layer wins a conflict\n")
    for layer in system.get("layers", []):
        docs = [d for d in system.get("docs", []) if d.get("layer") == layer["id"]
                and (track is None or not d.get("for") or track in d["for"])]
        if not docs:
            continue
        print(f"## {layer['id']}: {layer['question']}\n")
        for d in docs:
            key = d.get("path") or d.get("glob")
            if track and "glob" in d and d["glob"] == "prompts/*/prompt-*.md":
                cfg = load_routing(root)["tracks"].get(track)
                if cfg:
                    key = f"prompts/{track}/prompt-{cfg['champion']}.md"
            tags = []
            if d.get("always_read"):
                tags.append("always read")
            path = repo / key
            if path.is_file():
                lines = len(path.read_text().splitlines())
                budget = d.get("budget")
                tags.append(f"{lines} lines" + (f" / budget {budget}" if budget else "")
                            + (" OVER" if budget and lines > budget else ""))
            tags.append(f"changed by {d['changed_by']}")
            print(f"- `{key}` ({', '.join(tags)}): {d['answers']}")
        print()


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


def merged_of(rec: dict[str, Any]) -> bool | None:
    """The record's own `merged`, else what prompts/derive.py measured from GitHub."""
    if rec.get("merged") is not None:
        return rec["merged"]
    return (rec.get("_measured") or {}).get("merged")


def summarise(recs: list[dict[str, Any]]) -> dict[str, Any]:
    n = len(recs)
    ok = sum(1 for r in recs if r.get("outcome") == "success" and merged_of(r) is not False)
    low, high = wilson(ok, n)
    ci = [r["ci_failures_before_green"] for r in recs
          if isinstance(r.get("ci_failures_before_green"), (int, float))]
    minutes = [r["wall_minutes"] for r in recs if isinstance(r.get("wall_minutes"), (int, float))]
    # API-equivalent dollars, measured by prompts/runcost.py where a record has
    # a `usage` block; the free-typed cost_usd otherwise.
    usd = [r["cost_usd"] for r in recs if isinstance(r.get("cost_usd"), (int, float))]
    rework = [w for r in recs
              if (w := (r.get("_measured") or {}).get("rework") or {}).get("window") == "closed"]
    alive = [w["survival"] for w in rework if isinstance(w.get("survival"), (int, float))]
    return {
        "runs": n,
        "success": ok,
        "success_rate": round(ok / n, 3) if n else None,
        "success_ci95": [round(low, 3), round(high, 3)],
        "integrity_issues": sum(len(r.get("integrity_issues") or []) for r in recs),
        "leaked": sum(1 for r in recs if merged_of(r) is False),
        "merged_unknown": sum(1 for r in recs if merged_of(r) is None),
        "errors_per_run": round(sum(len(r.get("errors") or []) for r in recs) / n, 2) if n else None,
        "ci_failures_mean": round(statistics.mean(ci), 2) if ci else None,
        "wall_minutes_median": statistics.median(minutes) if minutes else None,
        "doc_friction": sum(len(r.get("doc_friction") or []) for r in recs),
        "cost_usd_median": round(statistics.median(usd), 2) if usd else None,
        "cost_measured": sum(1 for r in recs if isinstance(r.get("usage"), dict)),
        # Rework, measured by prompts/derive.py once a PR's 14-day window has closed.
        "rework_measured": len(rework),
        "reverted": sum(1 for w in rework if w["reverted"]),
        "survival_median": round(statistics.median(alive), 3) if alive else None,
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
    from derive import load_measured  # prompts/derive.py, alongside this file
    routing = load_routing(root)
    measured = load_measured(root)
    runs = [{**rec, "_measured": measured.get(path.name)} for path, rec in load_runs(root)]
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
            if _NO_FRICTION.match(str(item.get("issue") or "")):
                continue  # "none significant" says there was no friction; counting it buries real reports
            if _SELF_FIXED.search(str(item.get("issue") or "")):
                continue  # the reporting run fixed it in its own PR; listing it sends the next run to re-check
            # the run's end time (minutes) when known, so a same-day report can be told from a stale one
            friction[item["file"]].append(f"{(rec.get('ended') or rec['date'])[:16]}: {item['issue']}")
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
        "doc_friction": {f: {"reports": len(v), "recent": _newest(v, 8)}
                         for f, v in sorted(friction.items(), key=lambda kv: -len(kv[1]))},
        "deviations": {f: {"reports": len(v), "recent": v[-3:]}
                       for f, v in sorted(deviations.items(), key=lambda kv: -len(kv[1]))},
        "writeups": writeup_share(runs),
        "posts_per_day": posts_per_day(root),
        "instruction_lines": sizes,
        "instruction_budget": {rel: budget_for(rel) for rel in sizes},
        "backlog": backlog_summary([item for _, item in load_backlog(root)]),
    }


WRITEUPS_FROM = "2026-10-21"  # the owner asked for an agent doc and a post from most runs
FRICTION_MAX_FILES = 25  # files listed in "Doc friction by file"; the rest are counted
FRICTION_MAX_CHARS = 200  # per report; the full text is in the run record
FRICTION_FRESH_DAYS = 3  # "measure" lists friction reports from this many days before the newest


def writeup_share(runs: list[dict[str, Any]]) -> dict[str, Any]:
    """How many of the last 100 records since WRITEUPS_FROM name an agent doc and a post."""
    recent = [r for r in runs if str(r.get("date") or "") >= WRITEUPS_FROM][-100:]
    def has(r: dict[str, Any], prefix: str) -> bool:
        return any(str(u).startswith(prefix) for u in r.get("writeups") or [])
    return {"runs": len(recent),
            "agent_doc": sum(has(r, "docs/reports/") for r in recent),
            "post": sum(has(r, "docs/posts/") for r in recent)}


POSTS_DAYS = 14  # days of docs/posts/ shown by "measure" (owner, 2026-10-24: more posts per day)


def posts_per_day(root: Path, days: int = POSTS_DAYS) -> list[tuple[str, int]]:
    """New posts per day in docs/posts/, from the YYYY-MM-DD filename prefix, newest day last."""
    counts: dict[str, int] = {}
    for f in (root.parent / "docs" / "posts").glob("*.md"):
        day = f.name[:10]
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
            counts[day] = counts.get(day, 0) + 1
    if not counts:
        return []
    last = date.fromisoformat(max(counts))
    span = [(last - timedelta(days=n)).isoformat() for n in range(days - 1, -1, -1)]
    return [(d, counts.get(d, 0)) for d in span]


def filter_sections(text: str, section: str | None) -> str:
    """Keep only the `## ` sections whose title contains `section` (case-insensitive)."""
    if not section:
        return text
    out: list[str] = []
    keep = False
    for line in text.splitlines():
        if line.startswith("## "):
            keep = section.lower() in line.lower()
        if keep:
            out.append(line)
    if not out:
        raise SystemExit(f"no '## ' section title contains {section!r}")
    return "\n".join(out)


def print_measure_section(m: dict[str, Any], section: str | None) -> None:
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        print_measure(m)
    print(filter_sections(buf.getvalue(), section))


def budget_for(rel: str) -> int | None:
    if rel in INSTRUCTION_BUDGET:
        return INSTRUCTION_BUDGET[rel]
    return SUBPROMPT_BUDGET if PROMPT_RE.match(Path(rel).name) else None


def print_measure(m: dict[str, Any]) -> None:
    print(f"# Prompt scores ({m['runs']} recorded runs; {m['since_review']} since the last "
          f"review, one is due every {m['review_every']})\n")

    def table(title: str, rows: dict[str, dict[str, Any]], min_runs: int = 1) -> None:
        print(f"## {title}\n")
        print("| | runs | success | 95% CI | integrity | leaked | merged? | errors/run | CI fails | minutes | friction | API $ (median) | 14-day survival (reverted) |")
        print("|---|---|---|---|---|---|---|---|---|---|---|---|---|")
        small = [k for k, s in rows.items() if s["runs"] < min_runs]
        for key, s in rows.items():
            if key in small:
                continue
            rate = "-" if s["success_rate"] is None else f"{s['success_rate']:.0%}"
            lo, hi = s["success_ci95"]
            print(f"| {key} | {s['runs']} | {rate} | {lo:.0%}-{hi:.0%} | {s['integrity_issues']} | "
                  f"{s['leaked']} | {s['merged_unknown']} unknown | {s['errors_per_run']} | "
                  f"{s['ci_failures_mean']} | {s['wall_minutes_median']} | {s['doc_friction']} | "
                  f"{s['cost_usd_median']} ({s['cost_measured']} measured) | "
                  f"{s['survival_median']} ({s['reverted']} of {s['rework_measured']}) |")
        if small:
            print(f"\n({len(small)} groups with fewer than {min_runs} runs, "
                  f"{sum(rows[k]['runs'] for k in small)} runs in all, not shown)")
        print()

    table("By track and prompt version", m["by_version"])
    table("By track and model", m["by_model"])
    table("By starting message (input_sha256)", m["by_input"], min_runs=3)
    print("## Active candidates\n")
    if not m["candidates"]:
        print("None. The review track writes the next one.\n")
    for track, c in m["candidates"].items():
        print(f"- {track}: candidate {c['candidate']} vs champion {c['champion']}: {c['suggestion']}")
    print("\n## Doc friction by file\n")
    if not m["doc_friction"]:
        print("None reported.\n")
    if m["doc_friction"] and _is_shallow():
        print("(Shallow clone: a file's \"last changed\" date is only as old as the fetched history, so "
              "[file changed since] tags may be wrong. `measure` deepens it for you unless --no-fetch.)\n")
    stamps = [t for f in m["doc_friction"].values() for r in f["recent"] if (t := _when(r))]
    cutoff = max(stamps) - timedelta(days=FRICTION_FRESH_DAYS) if stamps else None
    rows = []
    for path, f in m["doc_friction"].items():
        note, changed = _changed_note(path)
        # Older reports are mostly fixed by now and each costs a run several calls to check.
        fresh = [r for r in f["recent"] if not (t := _when(r)) or t >= cutoff] or f["recent"][-1:]
        tagged = [_flag_stale(r, _latest(changed, _named_files_changed(r))) for r in fresh]
        live = [r for r in tagged if not r.startswith("[file changed since]")]
        if _FILE_LIKE_RE.fullmatch(path) and not (ROOT.parent / path).exists():
            # A complaint about a deleted or renamed file cannot be live (2026-10-27: test_lowcomm.py).
            note, live = " (file no longer exists)", []
        rows.append((path, f, note, tagged, live))
    # Files with live recent reports come first, most live reports first; the all-time
    # count only breaks ties, so a file with 300 old reports no longer crowds out a new fault.
    rows.sort(key=lambda x: -len(x[4]))
    for path, f, note, tagged, live in rows[:FRICTION_MAX_FILES]:
        shown = [r if len(r) <= FRICTION_MAX_CHARS else r[:FRICTION_MAX_CHARS - 1] + "…"
                 for r in (live or tagged)[-3:]]
        hidden = f["reports"] - len(shown)
        tail = f" (+{hidden} older or since-changed, not shown)" if hidden > 0 else ""
        print(f"- `{path}`{note}: {f['reports']} report(s), {len(live)} live in the last "
              f"{FRICTION_FRESH_DAYS} days; latest: " + " | ".join(shown) + tail)
    if len(rows) > FRICTION_MAX_FILES:
        print(f"\n(+{len(rows) - FRICTION_MAX_FILES} more files with fewer reports, not shown)")
    if m["doc_friction"]:
        print("\nA report can predate its fix without the file changing (a new tool, a doc elsewhere). "
              "Before building on one, grep `git log origin/main --since=<report time> -i --grep=<keyword>` "
              "and the tree for the tool it asks for.")
    print("\n## Deviations by file (judgment calls; prompts/steering.md)\n")
    if not m["deviations"]:
        print("None recorded.\n")
    for path, f in m["deviations"].items():
        print(f"- `{path}`: {f['reports']} deviation(s); latest: " + " | ".join(f["recent"]))
    w = m["writeups"]
    print("\n## Write-ups (goals.md, \"Write about the work\")\n")
    print(f"- Last {w['runs']} records since {WRITEUPS_FROM}: {w['agent_doc']} name an agent doc "
          f"(docs/reports/), {w['post']} a post (docs/posts/)")
    if m["posts_per_day"]:
        print(f"- New posts per day, last {len(m['posts_per_day'])} days: "
              + ", ".join(f"{d[5:]} {n}" for d, n in m["posts_per_day"]))
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


def _is_shallow() -> bool:
    try:
        out = subprocess.run(["git", "rev-parse", "--is-shallow-repository"], cwd=ROOT.parent,
                             capture_output=True, text=True, timeout=20).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return False
    return out == "true"


def _deepen_shallow_history() -> None:
    """Fetch two weeks of main into a shallow clone so a file's last-change date is real and the
    friction table can tell a stale complaint from a live one (2026-10-24: it listed fixed entries
    because every file read 'changed on or before the shallow edge'). Best effort: any failure
    leaves the clone as it was and the table's own shallow note applies."""
    if not _is_shallow():
        return
    print("(shallow clone: fetching 14 days of main to date the friction reports, about 70 s, "
          "holds git's shallow.lock so a parallel `git fetch` fails meanwhile; --no-fetch skips)",
          file=sys.stderr)
    try:
        subprocess.run(["git", "fetch", "-q", "--shallow-since=14 days ago", "origin", "main"],
                       cwd=ROOT.parent, capture_output=True, timeout=180)
    except (OSError, subprocess.SubprocessError):
        pass


def _shallow_boundary() -> set[str]:
    """Commits a shallow clone cuts history at; git shows every file as changed there."""
    try:
        out = subprocess.run(["git", "rev-parse", "--git-path", "shallow"], cwd=ROOT.parent,
                             capture_output=True, text=True, timeout=20).stdout.strip()
        return set((ROOT.parent / out).read_text().split())
    except (OSError, subprocess.SubprocessError):
        return set()


def _changed_note(path: str) -> tuple[str, str]:
    """(' (file last changed D)', D): so a reader can tell a stale complaint from a live one.
    When the last change git can see is the shallow boundary, the real date is unknown: say so and
    return '' so no report is tagged stale against it (2026-10-20: every file read "changed 10-20")."""
    try:
        out = subprocess.run(["git", "log", "-1", "--format=%H %cI", "--", path], cwd=ROOT.parent,
                             capture_output=True, text=True, timeout=20).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return "", ""
    sha, _, when = out.partition(" ")
    if not when:
        return "", ""
    if sha in _shallow_boundary():
        return f" (file last changed on or before {when[:10]}, the shallow-clone edge)", ""
    return f" (file last changed {when[:10]})", when


_FILE_LIKE_RE = re.compile(r"[\w.-]+(?:/[\w.-]+)*\.\w+")
_PATH_RE = re.compile(r"[\w./-]+\.(?:py|sh|mjs|md|json|yaml)\b")


def _named_files_changed(report: str) -> str:
    """Latest commit time of the repo files a report names (a complaint about pyenv.py is stale once
    pyenv.py changes, even when the file whose list it sits under did not). '' if none resolve.
    A bare file name resolves only when exactly one tracked file has it."""
    latest = ""
    for token in dict.fromkeys(_PATH_RE.findall(report)):
        path = token
        if "/" not in token:
            hits = subprocess.run(["git", "ls-files", f"*{token}"], cwd=ROOT.parent,
                                  capture_output=True, text=True, timeout=20).stdout.split()
            hits = [h for h in hits if h.rsplit("/", 1)[-1] == token]
            if len(hits) != 1:
                continue
            path = hits[0]
        if (ROOT.parent / path).is_file():
            latest = _latest(latest, _changed_note(path)[1])
    return latest


_SELF_FIXED = re.compile(r"(?<!not )(?<!un)\bfixed (here|in this PR)\W*$|\((now )?fixed\)\W*$", re.I)
_NO_FRICTION = re.compile(r"\s*(none|no friction|nothing)\b[^.;:]{0,20}([.;:]|$)", re.I)


def _latest(a: str, b: str) -> str:
    """The later of two ISO times ('' loses)."""
    wa, wb = _when(a) if a else None, _when(b) if b else None
    return b if wa is None or (wb is not None and wb > wa) else a


def _when(text: str) -> datetime | None:
    """Parse a leading 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM' (UTC unless it has an offset)."""
    m = re.match(r"\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})?)?", text)
    if not m:
        return None
    try:
        t = datetime.fromisoformat(m.group(0).replace("Z", "+00:00"))
    except ValueError:
        return None
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def _newest(reports: list[str], n: int) -> list[str]:
    """The n latest reports, oldest first. Run records are read in file-name order, not time order."""
    floor = datetime.min.replace(tzinfo=timezone.utc)
    return sorted(reports, key=lambda r: _when(r) or floor)[-n:]


def _flag_stale(report: str, changed: str) -> str:
    """Tag a report written before the file last changed: check it still reproduces.
    Reports carry the run's end time when it is known, else only a date (then same-day is not stale)."""
    when, file_changed = _when(report), _when(changed)
    if when and file_changed and when < file_changed and (report[10:11] == "T" or when.date() < file_changed.date()):
        return f"[file changed since] {report}"
    return report


def backfill_prs(root: Path, write: bool = True) -> list[tuple[str, str]]:
    """Fill a null `pr` in run records from the squash-merge subject "... (#N)" of the
    commit that added the record. A record is committed before its PR exists, so many
    (68 of 69 red-team ones) never name it. Needs real history: a shallow clone finds none."""
    found = []
    for path in sorted((root / "runs").glob("*.json")):
        text = path.read_text()
        try:
            rec = json.loads(text)
        except ValueError:
            continue
        if not isinstance(rec, dict) or rec.get("pr") or rec.get("repo"):
            continue
        out = subprocess.run(["git", "log", "HEAD", "--diff-filter=A", "--format=%s", "--", str(path)],
                             cwd=root.parent, capture_output=True, text=True).stdout.splitlines()
        m = re.search(r"\(#(\d+)\)$", out[-1].strip()) if out else None
        if m:
            found.append((path.name, m.group(1)))
            if write:
                rec["pr"] = m.group(1)
                path.write_text(json.dumps(rec, indent=2) + ("\n" if text.endswith("\n") else ""))
    return found


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("route", help="pick this run's sub-prompt and version")
    p.add_argument("--track", help="force a track (the session's task decides it)")
    p.add_argument("--task", help="the message that started the run; names like 'revenue "
                   "products' pick the track, otherwise the draw stands")
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
    p.add_argument("--no-fetch", action="store_true", help="do not deepen a shallow clone's history "
                   "(about 70 s) to date the friction reports' files")
    p.add_argument("--section", help="print only the '## ' sections whose title contains this "
                   "text (case-insensitive), e.g. 'friction' or 'candidates'; the full output is 50KB+")
    sub.add_parser("backlog", help="list open process improvements, best first")
    p = sub.add_parser("backfill-pr", help="fill empty `pr` in run records from the merge commit subject")
    p.add_argument("--dry-run", action="store_true")
    sub.add_parser("validate", help="check routing, prompts, run records, the backlog and the guidance map")
    p = sub.add_parser("map", help="the guidance files, by layer and precedence (prompts/SYSTEM.md)")
    p.add_argument("--track", help="only what this track reads")
    args = parser.parse_args(argv)

    if args.cmd == "route":
        rng = random.Random(args.seed) if args.seed is not None else None
        r = route(ROOT, args.track, args.skip_review, rng, task=args.task)
        print(json.dumps(r, indent=2)) if args.json else print_route(r)
        return 0
    if args.cmd == "record":
        path = record(ROOT, args.track, args.version, args.session, args.model, args.input, args.date, args.repo)
        print(f"Wrote {path.relative_to(ROOT.parent)}. Fill in outcome, pr, errors, "
              "integrity_issues and doc_friction, then commit it as a final commit on your "
              "work branch (after the PR is open, so `pr` is known) and push, before merging.\n"
              f"Shapes the validator enforces: outcome is one of {', '.join(OUTCOMES)} "
              "(a bare word, not a sentence; put the story in notes); doc_friction is a list of "
              '{"file": ..., "issue": ...}; deviations a list of {"file": ..., "why": ...}, '
              'plus "did" and "result" when you can say them (measure needs a result to tell '
              'whether a departure worked). '
              "Check with: python3 prompts/promptctl.py validate")
        return 0
    if args.cmd == "measure":
        if not (args.json or args.no_fetch) and (not args.section or "friction" in args.section.lower()):
            _deepen_shallow_history()
        m = measure(ROOT)
        if args.json:
            print(json.dumps(m, indent=2))
        else:
            print_measure_section(m, args.section)
        return 0
    if args.cmd == "backfill-pr":
        found = backfill_prs(ROOT, not args.dry_run)
        print(f"{len(found)} record(s) {'would get' if args.dry_run else 'got'} a pr number")
        return 0
    if args.cmd == "backlog":
        print_backlog(ROOT)
        return 0
    if args.cmd == "map":
        print_map(ROOT, args.track)
        return 0
    warning = redteam_band_warning(ROOT)
    if warning:
        print(f"warning: {warning}", file=sys.stderr)
    errors = validate(ROOT)
    for err in errors:
        print(f"error: {err}", file=sys.stderr)
    if errors:
        return 1
    print(f"ok: routing, prompts and {len(load_runs(ROOT))} run record(s) are valid")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BrokenPipeError:  # `promptctl.py measure | head`: stop quietly
        sys.stderr.close()
        sys.exit(0)
