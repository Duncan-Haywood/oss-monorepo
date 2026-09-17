#!/usr/bin/env python3
"""Tell a real GitHub Actions failure apart from a check that never ran.

    python3 check.py 99343045465         # one job id
    python3 check.py --run 33343422573   # every job in a run
    python3 check.py --run <id> --json   # machine-readable

GitHub Actions can silently stop assigning your jobs a runner — included
minutes spent, a spending limit hit, a payment problem, or Actions disabled
on the account. When that happens every check on every PR turns red within a
few seconds, with an empty output body, and nothing in the GitHub UI says
why: the checks list looks exactly like a real, fast failure. Teams have
spent hours "fixing" code that was never broken, and just as often waved
through a real regression because it also failed quickly and got blamed on
"probably CI again."

## Why duration doesn't answer this

Duration is the signal people reach for by instinct, and it is the one that
misleads in both directions:

  - A job GitHub never scheduled fails in 3-6 seconds. So does a job that
    *did* run and hit a real, fast error (a syntax error, a failed assertion
    on the first test). Same duration, opposite cause.
  - A starved job can also sit "in progress" for a while before GitHub gives
    up on it, which reads as a slow job rather than an absent one.

## The field that actually decides

`runner_id`. A job GitHub scheduled onto a machine carries a real,
nonzero id. A job it never scheduled reports `runner_id: 0` and
`runner_name: ""` — no runner was ever assigned, so no step in the job ever
ran, and that cannot be explained any other way. This tool decides on that
field alone; duration and an empty output body are reported for context but
never vote, because each has an innocent explanation on its own.

## What this does not tell you

Only that a job did or did not get a runner. It cannot tell you *why* your
account stopped getting them — GitHub's own run-timing endpoint reports
`billable.*.total_ms: 0` for private repos regardless of what actually ran,
so it cannot be used to attribute cost either. That answer lives on your
GitHub billing page. What this tool buys you: whether the next few minutes
are worth spending on your code, or on your Actions minutes balance.

## How it reaches the Actions API

Three routes, tried in this order:

  1. **The `gh` CLI**, if it is on PATH and already authenticated.
  2. **Direct HTTPS** to `api.github.com` with `GH_TOKEN` or `GITHUB_TOKEN`
     (a fine-grained PAT with "Actions: read" is enough). This is the route
     that matters for a hosted agent or a CI-triggered check with no `gh`
     CLI installed.
  3. **`--from-json`**, a saved API payload (or `-` for stdin) — for when
     you already pulled the jobs some other way and just want the verdict.
     This route calls no API and needs no credential.

Exit status: 0 if every job examined ran on a real runner (a red one among
them is a real failure), 1 if any job was starved (nothing here is your
fault — go check your Actions usage), 2 if there is no answer yet (a usage
or API error, or a run whose jobs have not finished).
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime

STARVED = "starved"
RAN = "ran"
PENDING = "pending"
SKIPPED = "skipped"

API_ROOT = "https://api.github.com/"

# `gh api` expands this from the local git remote. The HTTPS route has no such
# context, so it substitutes the resolved repository itself.
REPO_PLACEHOLDER = "{owner}/{repo}"

# A job GitHub never scheduled reports this runner id. The field is absent on
# some job shapes (very old runs), which is not the same as zero, so a missing
# value is treated as unknown rather than quietly as starvation.
UNASSIGNED_RUNNER_ID = 0


def classify(job):
    """Return (verdict, reason) for one job object from the Actions API.

    Decided on `runner_id` alone. Duration and an empty output body accompany
    the same condition but each has a benign explanation -- a real job can
    fail in three seconds, and a passing job can have an empty body -- so
    neither is allowed to change the verdict.
    """
    status = job.get("status")
    if status in ("queued", "in_progress", "waiting", "requested", "pending"):
        return PENDING, f"still {status} — no verdict until it finishes"

    # A job a workflow's own `if:` excluded is never given a runner and never
    # wanted one -- that is not starvation.
    if job.get("conclusion") == "skipped" and job.get("runner_id") is None:
        return SKIPPED, "skipped by the workflow — never needed a runner"

    runner_id = job.get("runner_id")
    if runner_id is None:
        raise ValueError(
            f"job {job.get('id', '?')} has no runner_id field; "
            "cannot classify without it"
        )

    if runner_id == UNASSIGNED_RUNNER_ID:
        return STARVED, "runner_id: 0 — no runner was ever assigned, so no step ran"
    return RAN, f"ran on runner {runner_id} ({job.get('runner_name') or 'unnamed'})"


def seconds(job):
    """Wall-clock seconds between started_at and completed_at, or None.

    Reported for context only. A job still in flight has no completed_at.
    """
    started, completed = job.get("started_at"), job.get("completed_at")
    if not started or not completed:
        return None

    fmt = "%Y-%m-%dT%H:%M:%SZ"
    try:
        elapsed = int(
            (
                datetime.strptime(completed, fmt) - datetime.strptime(started, fmt)
            ).total_seconds()
        )
    except ValueError:
        return None

    # A job the workflow skipped is stamped completed a second *before* it
    # started, so it renders as "-1s" -- an API quirk, not a duration to show.
    return elapsed if elapsed >= 0 else None


def report(jobs):
    """Build the per-job rows. Raises ValueError if any job cannot be classified."""
    rows = []
    for job in jobs:
        verdict, reason = classify(job)
        rows.append(
            {
                "id": job.get("id"),
                "name": job.get("name"),
                "conclusion": job.get("conclusion"),
                "verdict": verdict,
                "reason": reason,
                "seconds": seconds(job),
            }
        )
    return rows


def render(rows):
    if not rows:
        return "no jobs found"

    marks = {STARVED: "!!", PENDING: "..", SKIPPED: "--", RAN: "ok"}
    lines = []
    for row in rows:
        secs = "?" if row["seconds"] is None else f"{row['seconds']}s"
        mark = marks.get(row["verdict"], "ok")
        lines.append(
            f"  {mark}  {row['name']}  [{row['conclusion'] or row['verdict']}, {secs}]\n"
            f"        {row['reason']}"
        )

    starved = [r for r in rows if r["verdict"] == STARVED]
    pending = [r for r in rows if r["verdict"] == PENDING]
    lines.append("")
    if starved:
        lines.append(
            f"{len(starved)} of {len(rows)} job(s) never got a runner. These red "
            "checks are not your\ncode failing — go check your GitHub Actions "
            "usage/billing before you debug anything."
        )
    elif pending:
        lines.append(
            f"{len(pending)} of {len(rows)} job(s) have not finished, so this run "
            "has no verdict\nyet. Nothing that did finish was starved. Re-run this "
            "once the checks settle."
        )
    else:
        ran = [r for r in rows if r["verdict"] == RAN]
        skipped = len(rows) - len(ran)
        tail = f" ({skipped} skipped by the workflow.)" if skipped else ""
        lines.append(
            f"All {len(ran)} job(s) that ran got a real runner. Any failure here "
            f"is a real result.{tail}"
        )
    if starved and pending:
        lines.append(
            f"({len(pending)} job(s) still running — the starvation above is "
            "already decided.)"
        )
    return "\n".join(lines)


def gh_api(path):
    """Fetch one Actions API path via the gh CLI."""
    proc = subprocess.run(
        ["gh", "api", path], capture_output=True, text=True, check=False
    )
    if proc.returncode != 0:
        raise RuntimeError(f"gh api {path} failed: {proc.stderr.strip()}")
    return json.loads(proc.stdout)


def git_remote_repo():
    """`owner/name` from the origin remote, or None if it cannot be read.

    Handles both remote spellings git uses: `https://github.com/o/n.git`
    and `git@github.com:o/n.git`.
    """
    try:
        proc = subprocess.run(
            ["git", "remote", "get-url", "origin"],
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError:
        return None
    if proc.returncode != 0:
        return None

    match = re.search(r"github\.com[/:]([^/]+/[^/]+?)(?:\.git)?/*$", proc.stdout.strip())
    return match.group(1) if match else None


def resolve_repo(explicit=None, env=None):
    """Which repository the HTTPS route should ask about.

    Explicit flag, then `GITHUB_REPOSITORY` (set inside Actions), then the git
    remote. Raises rather than guessing: asking the wrong repository would
    return a clean 404 that reads like a deleted run.
    """
    env = os.environ if env is None else env
    repo = explicit or env.get("GITHUB_REPOSITORY") or git_remote_repo()
    if not repo:
        raise RuntimeError(
            "cannot tell which repository to ask about; pass --repo owner/name "
            "or set GITHUB_REPOSITORY"
        )
    if repo.count("/") != 1:
        raise RuntimeError(f"--repo must be owner/name, got {repo!r}")
    return repo


def api_token(env=None):
    """The first usable token, or None. `GH_TOKEN` wins, as it does for gh."""
    env = os.environ if env is None else env
    for name in ("GH_TOKEN", "GITHUB_TOKEN"):
        value = (env.get(name) or "").strip()
        if value:
            return value
    return None


def http_api_for(repo, token, opener=urllib.request.urlopen):
    """An api(path) callable that talks to api.github.com directly.

    Bound to one repository and one token so the returned callable has the same
    one-argument shape as `gh_api` and stays substitutable in tests.
    """

    def call(path):
        url = API_ROOT + path.replace(REPO_PLACEHOLDER, repo).lstrip("/")
        request = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "actions-runner-starvation-check",
            },
        )
        try:
            with opener(request) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            # 404 here usually means the token cannot see this repository
            # rather than that the run is gone, so say both.
            detail = f"HTTP {exc.code}"
            if exc.code == 404:
                detail += " (run not found, or the token cannot read this repo)"
            elif exc.code in (401, 403):
                detail += " (token rejected or lacking Actions: read)"
            raise RuntimeError(f"GET {url} failed: {detail}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"GET {url} failed: {exc.reason}") from exc

    return call


def jobs_from_payload(payload):
    """Normalise whatever shape a saved Actions payload arrived in.

    `/actions/runs/<id>/jobs` returns `{"jobs": [...]}`; `/actions/jobs/<id>`
    returns one job object; some tools hand over a bare list. All three are the
    same question, so accept all three rather than making the caller reshape.
    """
    if isinstance(payload, dict):
        if "jobs" in payload:
            return payload["jobs"]
        return [payload]
    if isinstance(payload, list):
        return payload
    raise ValueError("expected a job object, a list of jobs, or {'jobs': [...]}")


def read_json_file(path):
    if path == "-":
        return json.load(sys.stdin)
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def choose_api(args, env=None, has_gh=None):
    """Pick the API route, or explain why none is available.

    Order is gh, then HTTPS, because `gh` needs no repository resolution and is
    already authenticated wherever it is installed.
    """
    env = os.environ if env is None else env
    if has_gh is None:
        has_gh = shutil.which("gh") is not None
    if has_gh:
        return gh_api

    token = api_token(env)
    if token:
        return http_api_for(resolve_repo(args.repo, env=env), token)

    raise RuntimeError(
        "no route to the Actions API: the gh CLI is not installed and neither "
        "GH_TOKEN nor GITHUB_TOKEN is set. Either install gh, export a token "
        "with Actions: read, or fetch the jobs with whatever GitHub access you "
        "do have and pass the payload to --from-json (see the module docstring)"
    )


def fetch(args, api=gh_api):
    repo = f"repos/{REPO_PLACEHOLDER}"
    if args.run:
        return api(f"{repo}/actions/runs/{args.run}/jobs").get("jobs", [])
    return [api(f"{repo}/actions/jobs/{args.job}")]


def main(argv=None, api=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("job", nargs="?", help="a job id")
    parser.add_argument("--run", help="a run id; classifies every job in it")
    parser.add_argument("--json", action="store_true", help="machine-readable")
    parser.add_argument(
        "--repo",
        help="owner/name for the HTTPS route (default: GITHUB_REPOSITORY, "
        "then the origin remote)",
    )
    parser.add_argument(
        "--from-json",
        dest="from_json",
        metavar="PATH",
        help="classify a saved Actions jobs payload instead of calling the API "
        "('-' reads stdin)",
    )
    args = parser.parse_args(argv)

    if not args.from_json and not args.job and not args.run:
        parser.error("give a job id, --run with a run id, or --from-json")

    try:
        if args.from_json:
            jobs = jobs_from_payload(read_json_file(args.from_json))
        else:
            jobs = fetch(args, api=api or choose_api(args))
        rows = report(jobs)
    except (RuntimeError, ValueError, OSError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    print(json.dumps(rows, indent=2) if args.json else render(rows))

    # A decided starvation outranks an unfinished job: it is already true and
    # will not become less true when the rest settle. Otherwise an unfinished
    # run has no answer, and saying 0 there would tell `if check.py --run $ID`
    # that results nobody has yet are worth believing.
    if any(r["verdict"] == STARVED for r in rows):
        return 1
    if any(r["verdict"] == PENDING for r in rows):
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
