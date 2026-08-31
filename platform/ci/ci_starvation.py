#!/usr/bin/env python3
"""Say whether a red check actually ran, or never got a runner.

    python3 platform/ci/ci_starvation.py 99343045465        # one job
    python3 platform/ci/ci_starvation.py --run 33343422573  # every job in a run
    python3 platform/ci/ci_starvation.py --run <id> --json

Since 2026-08-26 every workflow in this repository comes back red without
having run: GitHub assigns no runner, the job ends in 3-6 seconds, and the
check reports a failure with an empty body. `CLAUDE.md` documents the
signature, and sessions have been re-deriving it by hand ever since with two
`gh api` one-liners pasted out of that file.

Doing it by hand is where it goes wrong. The two mistakes both cost a session:

  - Reading a *starved* job as a real failure, and "fixing" green code. Four
    PRs were triaged this way on 2026-08-27.
  - Reading a real failure as starvation because it also finished quickly, and
    merging something broken. Duration alone cannot tell them apart — a real
    job can fail fast.

`runner_id` is what settles it. A job GitHub never scheduled carries
`runner_id: 0` and `runner_name: ""`; no runner was assigned, so no step ran,
and that cannot be anything else. Duration and an empty output body are
corroborating, not deciding, so they are reported but never voted on.

## What this does not tell you

Only that a job did or did not get a runner. It cannot tell you *why* the
account stopped being given runners — exhausted included minutes, a spending
limit, a payment problem, or Actions disabled all look identical from here, and
the run-timing API is no help either (it reports `billable.UBUNTU.total_ms: 0`
for this repo even on a pre-cliff run that held a runner for 99 seconds). That
distinction lives on the owner's billing page.

The fix does not depend on knowing which one it is: self-hosted runners are not
metered and restore CI either way. See `gitops/ci/README.md`.

Exit status: 0 if every job examined ran on a real runner, 1 if any was
starved, 2 on a usage or API error. So `if ci_starvation.py --run $ID; then`
reads as "these results are worth believing".
"""

import argparse
import json
import subprocess
import sys
from datetime import datetime

STARVED = "starved"
RAN = "ran"

# A job GitHub never scheduled reports this runner id. The field is absent on
# some job shapes (very old runs), which is not the same as zero, so a missing
# value is treated as unknown rather than quietly as starvation.
UNASSIGNED_RUNNER_ID = 0


def classify(job):
    """Return (verdict, reason) for one job object from the Actions API.

    Decided on `runner_id` alone. Duration and an empty output body accompany
    the same condition but each has a benign explanation -- a real job can fail
    in three seconds, and a passing job can have an empty body -- so neither is
    allowed to change the verdict.
    """
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
        return int(
            (
                datetime.strptime(completed, fmt) - datetime.strptime(started, fmt)
            ).total_seconds()
        )
    except ValueError:
        return None


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

    lines = []
    for row in rows:
        secs = "?" if row["seconds"] is None else f"{row['seconds']}s"
        mark = "!!" if row["verdict"] == STARVED else "ok"
        lines.append(
            f"  {mark}  {row['name']}  [{row['conclusion']}, {secs}]\n"
            f"        {row['reason']}"
        )

    starved = [r for r in rows if r["verdict"] == STARVED]
    lines.append("")
    if starved:
        lines.append(
            f"{len(starved)} of {len(rows)} job(s) never got a runner. These red "
            "checks are not\nyour change failing. Verify locally, record what you "
            "ran, and report the\nunblock in gitops/ci/README.md rather than "
            "re-diagnosing this next session."
        )
    else:
        lines.append(
            f"All {len(rows)} job(s) ran on a real runner. Any failure here is a "
            "real result."
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


def fetch(args, api=gh_api):
    repo = "repos/{owner}/{repo}"
    if args.run:
        return api(f"{repo}/actions/runs/{args.run}/jobs").get("jobs", [])
    return [api(f"{repo}/actions/jobs/{args.job}")]


def main(argv=None, api=gh_api):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("job", nargs="?", help="a job id")
    parser.add_argument("--run", help="a run id; classifies every job in it")
    parser.add_argument("--json", action="store_true", help="machine-readable")
    args = parser.parse_args(argv)

    if not args.job and not args.run:
        parser.error("give a job id, or --run with a run id")

    try:
        rows = report(fetch(args, api=api))
    except (RuntimeError, ValueError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    except FileNotFoundError:
        print(
            "error: the gh CLI is not installed; this needs it to reach the "
            "Actions API",
            file=sys.stderr,
        )
        return 2

    print(json.dumps(rows, indent=2) if args.json else render(rows))
    return 1 if any(r["verdict"] == STARVED for r in rows) else 0


if __name__ == "__main__":
    sys.exit(main())
