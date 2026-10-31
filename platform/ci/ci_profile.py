#!/usr/bin/env python3
"""Where does this repository's CI time go?

    python3 platform/ci/ci_profile.py                    # last 300 completed runs
    python3 platform/ci/ci_profile.py --runs 1000 --top 25
    python3 platform/ci/ci_profile.py --save runs.json   # keep the raw payload
    python3 platform/ci/ci_profile.py --from-json runs.json --json

The repository runs 500+ workflows on 100-150 merges a day. It is public, so
standard runners cost nothing, but the account's concurrent-job ceiling is
real (CLAUDE.md "Reading CI", `ci_starvation.py`). A minute one job spends
cloning history it never reads is a minute every queued job waits. This tool
reads recent runs' job and step timings and reports:

  * **job-minutes per workflow**, the share of the runner pool it takes;
  * **overhead share**: time in `actions/checkout`, `setup-*`, and the
    runner's own set-up/tear-down, against the steps that do the work;
  * **queue time**: job created to job started, which is the cost the
    ceiling imposes on everyone;
  * **heaviest steps**, so a slow step is named, not just its workflow.

It does not decide anything. A large number names where to look; read the
workflow before changing it (a full-history checkout can be load-bearing:
`page-integrity-ci.yml` reads historical blobs). The first reading and what
was changed because of it: `docs/history/ci-perf-2026-10-21.md`.

API route: `GH_TOKEN`/`GITHUB_TOKEN` if set, else unauthenticated HTTPS (a
cloud session's proxy authenticates it; elsewhere expect 60 requests an hour,
enough for ~50 runs). One request per 100 runs listed, plus one per run.
"""
from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from collections import defaultdict
from datetime import datetime

API_ROOT = "https://api.github.com/"
DEFAULT_REPO = "duncan-haywood/oss-monorepo"

CHECKOUT = "checkout"
SETUP = "setup"
WORK = "work"

# Step names GitHub writes for the runner's own bookkeeping, and the setup
# actions whose time is install, not the job's purpose.
RUNNER_STEPS = ("Set up job", "Complete job")
SETUP_ACTIONS = ("actions/setup-", "actions/cache")


def parse_time(value):
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def span(start, end):
    """Seconds between two API timestamps, or None if either is missing.

    A skipped job can report completed_at before started_at; that is not
    negative work, so it counts as zero.
    """
    a, b = parse_time(start), parse_time(end)
    if a is None or b is None:
        return None
    return max(0.0, (b - a).total_seconds())


def step_kind(name):
    if "actions/checkout" in name and not name.startswith("Post "):
        return CHECKOUT
    if name in RUNNER_STEPS or name.startswith("Post ") or any(a in name for a in SETUP_ACTIONS):
        return SETUP
    return WORK


def job_profile(job):
    """One job's time, split by step kind. None for a job that never ran."""
    if not job.get("runner_id") or job.get("conclusion") == "skipped":
        return None
    total = span(job.get("started_at"), job.get("completed_at"))
    if total is None:
        return None
    kinds = {CHECKOUT: 0.0, SETUP: 0.0, WORK: 0.0}
    steps = []
    for step in job.get("steps") or []:
        seconds = span(step.get("started_at"), step.get("completed_at")) or 0.0
        kind = step_kind(step.get("name", ""))
        kinds[kind] += seconds
        if kind == WORK:
            steps.append((step.get("name", ""), seconds))
    return {
        "workflow": job.get("workflow_name") or "?",
        "job": job.get("name") or "?",
        "seconds": total,
        "queue": span(job.get("created_at"), job.get("started_at")) or 0.0,
        "kinds": kinds,
        "work_steps": steps,
    }


def percentile(values, q):
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round(q * (len(ordered) - 1))))
    return ordered[index]


def summarise(jobs):
    """Aggregate job profiles per workflow, heaviest first."""
    by_workflow = defaultdict(list)
    for job in jobs:
        profile = job_profile(job)
        if profile:
            by_workflow[profile["workflow"]].append(profile)

    rows = []
    for workflow, profiles in by_workflow.items():
        total = sum(p["seconds"] for p in profiles)
        checkout = sum(p["kinds"][CHECKOUT] for p in profiles)
        setup = sum(p["kinds"][SETUP] for p in profiles)
        step_totals = defaultdict(float)
        for p in profiles:
            for name, seconds in p["work_steps"]:
                step_totals[name] += seconds
        heaviest = sorted(step_totals.items(), key=lambda kv: -kv[1])[:3]
        rows.append({
            "workflow": workflow,
            "jobs": len(profiles),
            "job_minutes": round(total / 60, 1),
            "median_job_seconds": round(statistics.median(p["seconds"] for p in profiles)),
            "checkout_share": round(checkout / total, 2) if total else 0.0,
            "setup_share": round(setup / total, 2) if total else 0.0,
            "median_checkout_seconds": round(
                statistics.median(p["kinds"][CHECKOUT] for p in profiles)),
            "queue_p50_seconds": round(percentile([p["queue"] for p in profiles], 0.5)),
            "queue_p90_seconds": round(percentile([p["queue"] for p in profiles], 0.9)),
            "heaviest_steps": [
                {"name": name, "minutes": round(seconds / 60, 1)} for name, seconds in heaviest
            ],
        })
    rows.sort(key=lambda r: -r["job_minutes"])
    return rows


def totals(rows):
    minutes = sum(r["job_minutes"] for r in rows)
    checkout = sum(r["job_minutes"] * r["checkout_share"] for r in rows)
    setup = sum(r["job_minutes"] * r["setup_share"] for r in rows)
    return {
        "workflows": len(rows),
        "jobs": sum(r["jobs"] for r in rows),
        "job_minutes": round(minutes, 1),
        "checkout_minutes": round(checkout, 1),
        "setup_minutes": round(setup, 1),
    }


def render(rows, top, window):
    t = totals(rows)
    lines = [
        f"{t['jobs']} jobs in {t['workflows']} workflows, {window}: "
        f"{t['job_minutes']} job-minutes, of which checkout {t['checkout_minutes']} "
        f"and setup/teardown {t['setup_minutes']}.",
        "",
        f"{'workflow':40} {'jobs':>5} {'min':>7} {'med s':>6} {'chk%':>5} "
        f"{'set%':>5} {'q50':>5} {'q90':>5}  heaviest step",
    ]
    for r in rows[:top]:
        step = r["heaviest_steps"][0] if r["heaviest_steps"] else {"name": "-", "minutes": 0}
        lines.append(
            f"{r['workflow'][:40]:40} {r['jobs']:>5} {r['job_minutes']:>7} "
            f"{r['median_job_seconds']:>6} {round(100 * r['checkout_share']):>5} "
            f"{round(100 * r['setup_share']):>5} {r['queue_p50_seconds']:>5} "
            f"{r['queue_p90_seconds']:>5}  {step['name'][:50]} ({step['minutes']}m)"
        )
    heavy_overhead = [
        r for r in rows
        if r["median_job_seconds"] >= 60 and r["checkout_share"] + r["setup_share"] >= 0.5
    ]
    if heavy_overhead:
        lines += ["", "Spends half or more of a minute-plus job before its first real step:"]
        for r in heavy_overhead:
            lines.append(
                f"  {r['workflow']}: median job {r['median_job_seconds']}s, "
                f"checkout median {r['median_checkout_seconds']}s"
            )
    return "\n".join(lines)


def http_api(token=None, opener=urllib.request.urlopen):
    def call(path):
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "ci-profile",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"
        url = API_ROOT + path.lstrip("/")
        try:
            with opener(urllib.request.Request(url, headers=headers), timeout=60) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raise RuntimeError(f"GET {url} failed: HTTP {exc.code}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"GET {url} failed: {exc.reason}") from exc
    return call


def fetch(api, repo, runs):
    """The jobs of the `runs` most recent completed runs, newest first."""
    listed = []
    page = 1
    while len(listed) < runs:
        payload = api(f"repos/{repo}/actions/runs?status=completed&per_page=100&page={page}")
        batch = payload.get("workflow_runs") or []
        if not batch:
            break
        listed += batch
        page += 1
    listed = listed[:runs]
    # One request per run: 600 runs read serially took minutes with no output
    # (doc_friction 2026-10-31), so fetch in parallel and report progress on stderr.
    done = [0]

    def run_jobs(run):
        found = api(f"repos/{repo}/actions/runs/{run['id']}/jobs?per_page=100").get("jobs") or []
        done[0] += 1
        if done[0] % 50 == 0:
            print(f"ci_profile: read jobs of {done[0]}/{len(listed)} runs", file=sys.stderr)
        return found

    with ThreadPoolExecutor(max_workers=8) as pool:
        jobs = [job for found in pool.map(run_jobs, listed) for job in found]
    window = ""
    if listed:
        window = f"{listed[-1]['created_at']} to {listed[0]['created_at']} ({len(listed)} runs)"
    return {"window": window, "jobs": jobs}


def main(argv=None, api=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY") or DEFAULT_REPO)
    parser.add_argument("--runs", type=int, default=300, help="recent completed runs to read")
    parser.add_argument("--top", type=int, default=20, help="workflows to list")
    parser.add_argument("--json", action="store_true", help="machine-readable rows")
    parser.add_argument("--save", metavar="PATH", help="also write the raw jobs payload here")
    parser.add_argument("--from-json", dest="from_json", metavar="PATH",
                        help="profile a payload saved with --save instead of calling the API")
    args = parser.parse_args(argv)

    try:
        if args.from_json:
            with open(args.from_json, encoding="utf-8") as handle:
                payload = json.load(handle)
        else:
            token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
            payload = fetch(api or http_api(token), args.repo, args.runs)
            if args.save:
                with open(args.save, "w", encoding="utf-8") as handle:
                    json.dump(payload, handle)
    except (RuntimeError, OSError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    rows = summarise(payload.get("jobs") or [])
    if args.json:
        print(json.dumps({"window": payload.get("window"), "totals": totals(rows), "rows": rows},
                         indent=2))
    else:
        print(render(rows, args.top, payload.get("window") or "saved payload"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
