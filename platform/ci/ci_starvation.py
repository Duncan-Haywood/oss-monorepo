#!/usr/bin/env python3
"""Say whether a red check actually ran, or never got a runner.

    python3 platform/ci/ci_starvation.py 99343045465        # one job
    python3 platform/ci/ci_starvation.py --run 33343422573  # every job in a run
    python3 platform/ci/ci_starvation.py --run <id> --json

From 2026-08-26 to 2026-09-01 every workflow in this repository came back red
without having run: GitHub assigned no runner, the job ended in 3-6 seconds,
and the check reported a failure with an empty body. `CLAUDE.md` documents the
signature, and sessions re-derived it by hand throughout with two `gh api`
one-liners pasted out of that file.

Runners returned on 2026-09-01, which makes this tool *more* useful, not
less. While every check was starved its answer was a foregone conclusion; now
that real failures and starved ones can both occur, it is the thing that tells
them apart -- and the mistake it prevents has inverted, from "fixing" green
code to waving a genuine failure through as a ghost of the outage. The
account-level ceiling looks like it cycles rather than being gone, so expect
to need both answers.

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

## How it reaches the Actions API

Three routes, tried in that order, because the sessions that most need this
tool are the ones least likely to have the first one:

  1. **The `gh` CLI**, if it is on PATH. What a laptop has.
  2. **Direct HTTPS** to `api.github.com` with `GH_TOKEN` or `GITHUB_TOKEN`.
     This is the route that matters. Claude-on-the-web sessions — where the
     scheduled routines that read this repository's CI actually run — have no
     `gh` CLI at all, so until 2026-08-31 the tool `CLAUDE.md` names as *the*
     way to tell starvation from a real failure exited 2 with "the gh CLI is
     not installed" in exactly that environment. It has a token and a route to
     the API; it only lacked the twelve lines below.
  3. **`--from-json`**, a saved API payload (or `-` for stdin), for a session
     with neither: read the jobs with whatever GitHub access it does have (the
     MCP `list_workflow_jobs` tool, say) and hand the JSON over. The verdict is
     computed from the payload, so this route needs no credential of its own.

Route 2 needs to know which repository to ask about, which route 1 got for
free from the local git remote. `--repo owner/name`, `GITHUB_REPOSITORY`, and
that same git remote are tried in order.

Exit status: 0 if every job examined ran on a real runner, 1 if any was
starved, 2 if there is no answer to give — a usage or API error, a run whose
jobs have not finished, or a run of GitHub's *managed* Pages builder, which is
not an Actions workflow and is never starved whatever the allowance is doing.
So `if ci_starvation.py --run $ID; then` reads as "these results are worth
believing", and only ever succeeds when there are results.
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

# GitHub's *managed* Pages builder. It is not a workflow in `.github/`, its
# runners are not the metered Actions pool, and it keeps working at full speed
# through a starvation window -- which is exactly why it is the wrong run to
# ask this question of.
#
# Measured 2026-09-17, by making the mistake. A session picked "the most recent
# run" from `/actions/runs` to check whether runners had come back, got run
# 35203941076, and this tool answered `All 3 job(s) that ran got a real runner.
# Any failure here is a real result.` on real runner ids in the 1000088xxx
# range. Every word of that was true about the run it was handed and entirely
# wrong as an answer about Actions: `Portfolio validate` and `Conflict markers`
# one minute earlier on the same repository were both `runner_id: 0`, and all
# 60 completed runs of `publish-pages-branch.yml` were starved.
#
# `infra_state.yaml`'s `github-actions-runners` row has warned in prose since
# 2026-09-06 that "it is not an Actions runner and is not metered against this
# allowance" -- and nothing stopped the tool CLAUDE.md names as *the* way to
# tell starvation from a real failure from reporting recovery during an outage.
# A green here is the single most expensive wrong answer this tool can give:
# it is the one that sends the next session to "fix" green code, or to trust a
# red check that means nothing.
MANAGED_PAGES_WORKFLOW = "pages build and deployment"


def is_managed_pages(job):
    """Is this job from GitHub's managed Pages builder rather than Actions?

    Read from the job payload's own `workflow_name`, which the jobs API has
    carried for years and which every route into this tool already has -- a
    bare job id, `--run`, and `--from-json` alike. Fetching the run to learn
    its `path` would work for `--run` only, and would make the credential-free
    `--from-json` route the one place the check could not fire.
    """
    return (job.get("workflow_name") or "").strip().lower() == MANAGED_PAGES_WORKFLOW


def classify(job):
    """Return (verdict, reason) for one job object from the Actions API.

    Decided on `runner_id` alone. Duration and an empty output body accompany
    the same condition but each has a benign explanation -- a real job can fail
    in three seconds, and a passing job can have an empty body -- so neither is
    allowed to change the verdict.
    """
    # A job that has not finished carries no runner_id yet. That is not the
    # "unknown shape" case below -- it is the ordinary state of a run you are
    # watching, and it used to abort the whole report with "has no runner_id
    # field", which reads like the tool is broken at the exact moment a session
    # is trying to use it on a live PR. Report it and let main() decide what an
    # unfinished run means for the exit status.
    status = job.get("status")
    if status in ("queued", "in_progress", "waiting", "requested", "pending"):
        return PENDING, f"still {status} — no verdict until it finishes"

    # A job a workflow's own `if:` excluded is never given a runner and never
    # wanted one. It carries no runner_id, so without this it read as the
    # unknown shape and aborted the report — and this repository has at least
    # one such job (`preflight`) sitting in the same run as the checks a
    # session is actually asking about.
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
    # started, so it renders as "-1s" — which looks like a bug in the tool
    # rather than the API quirk it is. There is no duration to report.
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
                "workflow": job.get("workflow_name"),
                "managed_pages": is_managed_pages(job),
                "conclusion": job.get("conclusion"),
                "verdict": verdict,
                "reason": reason,
                "seconds": seconds(job),
            }
        )
    return rows


def all_managed_pages(rows):
    """Is every job here from the managed Pages builder?

    All, not any: a mixed payload can only come from `--from-json` stitching
    two runs together, and there the Actions jobs are the ones with something
    to say, so the ordinary verdict should still be reached.
    """
    return bool(rows) and all(r.get("managed_pages") for r in rows)


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

    # Before any verdict: a run that is not an Actions workflow cannot answer
    # the question this tool exists for, and its answer would be reassuring.
    # Said here rather than folded into the branches below because it replaces
    # the verdict instead of qualifying it.
    if all_managed_pages(rows):
        lines.append(
            f"NO VERDICT: this is GitHub's managed Pages builder "
            f"({MANAGED_PAGES_WORKFLOW}), not\na workflow in .github/. Its runners are "
            "not the metered Actions pool, so it\nruns at full speed straight through a "
            "starvation window and says nothing\nabout whether Actions is starved — in "
            "either direction.\n\nClassify a run of an actual workflow instead "
            "(Portfolio validate, or any\ncheck on an open PR):\n"
            "    python3 platform/ci/ci_starvation.py --run <id of a .github/ workflow run>"
        )
        return "\n".join(lines)

    if starved:
        lines.append(
            f"{len(starved)} of {len(rows)} job(s) never got a runner. These red "
            "checks are not\nyour change failing. Verify locally, record what you "
            "ran, and report the\nunblock in gitops/ci/README.md rather than "
            "re-diagnosing this next session."
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

    Handles both remote spellings git uses here: `https://github.com/o/n.git`
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
                "User-Agent": "ci-starvation",
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
            if not isinstance(payload["jobs"], list):
                raise ValueError("'jobs' must be a list of job objects")
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

    # No jobs is no evidence that runners are fine (run not created yet, wrong
    # id), so it gets the "no answer" code rather than 0.
    if not rows:
        return 2

    # A run that is not an Actions workflow has no answer to give about
    # Actions, and 0 here would tell `if ci_starvation.py --run $ID` that
    # runners are fine in the middle of an outage. Checked before starvation
    # because the managed builder is never starved, so every other branch
    # below would return 0 for it.
    if all_managed_pages(rows):
        return 2

    # A decided starvation outranks an unfinished job: it is already true and
    # will not become less true when the rest settle. Otherwise an unfinished
    # run has no answer, and saying 0 there would tell `if ci_starvation.py
    # --run $ID` that results nobody has yet are worth believing.
    if any(r["verdict"] == STARVED for r in rows):
        return 1
    if any(r["verdict"] == PENDING for r in rows):
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
