#!/usr/bin/env python3
"""Has this catalogue ever actually been announced to IndexNow?

## Why this exists

`pages_state.py`'s `indexing` row measured that sitemap auto-discovery cannot
happen for this site: it is served from a project-Pages *subpath*
(`https://duncan-haywood.github.io/monorepo-projects/`), while crawlers fetch
`robots.txt` — and the `Sitemap:` line inside it — from the *host* root, which
belongs to the owner's separate user-level Pages site. The owner-only fixes
(submit the sitemap in Search Console, or set a custom domain) are queued.
IndexNow is the half that needs no owner login, and so it is the only
page-enumeration route the catalogue actually has.

It has never fired. Measured 2026-09-11, and the shape of the failure is why
this file exists rather than another paragraph of prose:

  - `platform/pages/publish-branch.sh` announces in `announce_to_indexnow`,
    inside its PUSH=1 branch. Every publish takes that branch — and every one
    of them runs in an agent sandbox, whose egress proxy answers `403 to
    CONNECT` for `api.indexnow.org`. It exits `EXIT_NO_EGRESS`, correctly,
    having announced nothing.
  - `.github/workflows/publish-pages-branch.yml` runs on a runner, which has
    real egress — but every one of its runs since IndexNow landed in #4366 came
    back `runner_id: 0` in 3-5 seconds. Starved. Not one executed a step.

So the route with egress never ran, and the route that ran had no egress, and
**nothing anywhere said so**. A submission leaves no trace in the tree: there
is no artifact, no commit, and IndexNow has no confirmation API. The catalogue
could go on publishing indefinitely, announcing nothing, with every check
green — which is the precise failure mode this repository has now recorded
against `platform/proposal/`, the browser checks, `validate_doc_consistency.py`
and `guard_state.py`: a mechanism that is correct, and unrun, and silent about
it. Nobody investigates a pass.

## What it reads, and what it refuses to infer

A reading, never a claim — and deliberately taken from something *present*.
The absence of evidence that a submission happened is not evidence that it did
not; an absence goes stale in silence, which is the error `pages_state.py`'s
own header records from the 2026-09-05 Pages reading. So this asks the one
route that *can* announce what it actually did, from GitHub's own run history:
each `publish-pages-branch.yml` run, its jobs classified by `ci_starvation`,
and — for a run that really took a runner — the conclusion of its announce
step by name.

That yields four verdicts, and the difference between the last three is the
whole point:

  announced   a run's announce step concluded `success`, with a run id and a
              date. The live snapshot may still be newer — see `covers`.
  never       no announce step has ever succeeded, *and* the reason is named:
              every run starved, or the step did not exist yet, or it ran and
              failed. "Never" without a reason would be indistinguishable from
              "this tool cannot see it".
  unknown     no token, or the API refused. Never rendered as `never`.

`announced` is still not "indexed". IndexNow has no confirmation API and a
2xx means the engines *accepted* the submission; Google does not participate
at all. Treat it as "asked", exactly as `indexnow.mjs`'s own header does.

## Usage

    python3 platform/ci/indexnow_state.py
    python3 platform/ci/indexnow_state.py --json
    python3 platform/ci/indexnow_state.py --require-announced

`--require-announced` exits 1 while the live snapshot is unannounced, for the
same reason `pages_state.py --require-current` and `guard_state.py
--require-runnable` do: a reminder competes with everything else in a long
file, and an exit code does not.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ci_starvation import (  # noqa: E402  (path shim must precede the import)
    REPO_PLACEHOLDER,
    STARVED,
    api_token,
    classify,
    http_api_for,
    resolve_repo,
)

PUBLISH_WORKFLOW = "publish-pages-branch.yml"
SERVING_BRANCH = "gh-pages"

RUNS_PATH = (
    f"repos/{REPO_PLACEHOLDER}/actions/workflows/{PUBLISH_WORKFLOW}"
    "/runs?per_page={per_page}"
)
JOBS_PATH = f"repos/{REPO_PLACEHOLDER}/actions/runs/{{run_id}}/jobs?per_page=100"
BRANCH_PATH = f"repos/{REPO_PLACEHOLDER}/branches/{SERVING_BRANCH}"

# Matched case-insensitively against a step's name. Both spellings are listed
# because the step was renamed when it moved: `Notify IndexNow` was the
# original (#4366), `Announce the live snapshot to IndexNow` is the current
# one. A historical run carries the name it ran under, so a reading that knew
# only today's name would report a genuine past submission as `never`.
ANNOUNCE_STEP_NAMES = ("notify indexnow", "announce the live snapshot to indexnow")

# How far back to look. A submission that happened but has aged out of this
# window reads as `never`, which is the safe direction: it would prompt a
# re-announcement, and IndexNow is explicitly resubmission-tolerant.
DEFAULT_RUN_LIMIT = 60


def is_announce_step(name):
    """Is this step the IndexNow announcement, under any name it has had?"""
    lowered = " ".join(str(name or "").split()).lower()
    return any(candidate in lowered for candidate in ANNOUNCE_STEP_NAMES)


def read_runs(api, limit=DEFAULT_RUN_LIMIT):
    """Completed runs of the publish workflow, newest first."""
    payload = api(RUNS_PATH.replace("{per_page}", str(min(limit, 100))))
    runs = payload.get("workflow_runs") or []
    return [r for r in runs if r.get("status") == "completed"][:limit]


def read_jobs(api, run_id):
    payload = api(JOBS_PATH.replace("{run_id}", str(run_id)))
    return payload.get("jobs") or []


def read_serving_branch(api):
    """The live snapshot's commit, or None if the branch does not exist."""
    try:
        payload = api(BRANCH_PATH)
    except RuntimeError:
        return None
    commit = payload.get("commit") or {}
    detail = commit.get("commit") or {}
    committer = detail.get("committer") or {}
    return {
        "sha": commit.get("sha"),
        "date": committer.get("date"),
        "author": (detail.get("author") or {}).get("name"),
    }


def announce_outcome(jobs):
    """What the announce step did in this run, from its own steps.

    Returns one of: `success`, another step conclusion, `starved` when no job
    took a runner (so no step ran at all), or `absent` when the run really ran
    and carried no announce step — the three being genuinely different facts
    about why nothing was announced.
    """
    if not jobs:
        return "unknown"
    # `classify` returns a (verdict, detail) pair, not a bare verdict. Comparing
    # the tuple to the string silently never matched, so every starved run --
    # which has no steps at all -- fell through to `absent`, reporting "the
    # workflow carried no announce step" for runs that never executed a step of
    # any kind. Both readings say "not announced", which is why it looked right;
    # they prescribe different actions, which is why it was not.
    if all(classify(job)[0] == STARVED for job in jobs):
        return STARVED
    for job in jobs:
        for step in job.get("steps") or []:
            if is_announce_step(step.get("name")):
                return step.get("conclusion") or "unknown"
    return "absent"


def collect(api, limit=DEFAULT_RUN_LIMIT):
    """The whole reading, as plain data so `--json` and `render` agree."""
    runs = read_runs(api, limit)
    serving = read_serving_branch(api)

    examined = []
    announced = None
    for run in runs:
        # A per-run read can fail on its own (a deleted run, a rate limit)
        # without making the whole reading unreadable. Record it as `unknown`
        # for that run rather than aborting, and let the all-unknown case below
        # decide that the reading as a whole cannot be trusted.
        try:
            outcome = announce_outcome(read_jobs(api, run["id"]))
        except RuntimeError:
            outcome = "unknown"
        row = {
            "run": run["id"],
            "at": run.get("run_started_at") or run.get("created_at"),
            "head_sha": (run.get("head_sha") or "")[:9],
            "outcome": outcome,
            "url": run.get("html_url"),
        }
        examined.append(row)
        if announced is None and outcome == "success":
            announced = row

    if announced:
        verdict = "announced"
        reason = (
            f"run {announced['run']} announced the snapshot at {announced['at']}. "
            "Accepted means the engines were asked, not that anything was indexed "
            "— IndexNow has no confirmation API and Google does not participate."
        )
    elif not examined:
        verdict = "never"
        reason = (
            f"no completed run of {PUBLISH_WORKFLOW} exists, so nothing has ever "
            "had the chance to announce."
        )
    elif all(row["outcome"] == "unknown" for row in examined):
        # Deliberately not `never`. Every run being unreadable is a statement
        # about this reading, not about the catalogue, and collapsing the two
        # is the exact direction `pages_state.py`'s header warns against: an
        # absent measurement must never read as a measured absence.
        verdict = "unknown"
        reason = (
            f"none of the {len(examined)} completed run(s) could be read, so whether "
            "anything was announced is unknown. This is not a reading of `never`."
        )
    else:
        verdict = "never"
        reason = _never_reason(examined)

    covers = _covers(announced, serving)

    return {
        "verdict": verdict,
        "reason": reason,
        "announced": announced,
        "serving": serving,
        "covers": covers,
        "examined": examined[:10],
        "examined_count": len(examined),
    }


def _never_reason(examined):
    """Why nothing was announced — named, never left as a bare 'never'."""
    counts = {}
    for row in examined:
        counts[row["outcome"]] = counts.get(row["outcome"], 0) + 1

    if counts.get(STARVED) == len(examined):
        return (
            f"every one of the {len(examined)} completed run(s) was starved "
            "(`runner_id: 0`, no step executed), so the only route with egress to "
            "api.indexnow.org has never run. The by-hand publish route does reach "
            "the call and has no egress. Nothing is broken; nothing was announced."
        )
    if counts.get("absent") and not counts.get("success"):
        return (
            f"{counts['absent']} run(s) executed but carried no announce step — the "
            "workflow at that time announced only through publish-branch.sh's PUSH=1 "
            "branch, which a run that does not push never reaches."
        )
    detail = ", ".join(f"{name}: {n}" for name, n in sorted(counts.items()))
    return (
        f"no announce step has concluded `success` across {len(examined)} completed "
        f"run(s) ({detail})."
    )


def _covers(announced, serving):
    """Does the last announcement cover what is live now?

    Compared by date rather than by sha: the announcement names URLs, not a
    commit, so the question is whether the live contents post-date the last
    time anyone asked the engines to look. A snapshot pushed after the last
    announcement contains pages that have never been announced.
    """
    if not announced or not serving:
        return None
    announced_at, serving_at = announced.get("at"), serving.get("date")
    if not announced_at or not serving_at:
        return None
    return "current" if announced_at >= serving_at else "stale"


def render(state):
    lines = ["Has this catalogue been announced to IndexNow?", ""]
    lines.append(f"  verdict           {state['verdict']}")
    for chunk in _wrap(state["reason"]):
        lines.append(f"                    {chunk}")
    lines.append("")

    serving = state.get("serving")
    if serving:
        sha = (serving.get("sha") or "?")[:9]
        lines.append(
            f"  live snapshot     {sha} pushed {serving.get('date')} "
            f"by {serving.get('author')}"
        )
    else:
        lines.append(f"  live snapshot     `{SERVING_BRANCH}` is not published")

    covers = state.get("covers")
    if covers == "current":
        lines.append("  coverage          the live snapshot post-dates nothing newer than the announcement")
    elif covers == "stale":
        lines.append(
            "  coverage          STALE -- the live snapshot was pushed after the last "
            "announcement, so its pages have not been announced"
        )
    lines.append("")

    if state["examined"]:
        lines.append(f"  last {len(state['examined'])} run(s) of {PUBLISH_WORKFLOW}:")
        for row in state["examined"]:
            lines.append(
                f"    {row['run']}  {row['at']}  {row['head_sha']}  {row['outcome']}"
            )
        lines.append("")

    lines.append("  next")
    for chunk in _wrap(_next_step(state)):
        lines.append(f"    {chunk}")
    return "\n".join(lines) + "\n"


def _next_step(state):
    if state["verdict"] == "announced" and state.get("covers") != "stale":
        return (
            "Nothing. The live snapshot has been announced. Google is still the "
            "owner's to do (Search Console), since it does not participate in "
            "IndexNow -- see decision_queue.py."
        )
    if state["verdict"] == "unknown":
        return (
            "Re-run with a token that can read Actions. This tool never reports an "
            "unreadable state as an unannounced one."
        )
    return (
        "Announce from a host with real egress -- a GitHub Actions runner, or the "
        "Hetzner box once host mode is installed. An agent sandbox cannot: its proxy "
        "403s api.indexnow.org. The command is "
        f"`node platform/marketing/indexnow.mjs --submit --ref {SERVING_BRANCH}`, and "
        f"{PUBLISH_WORKFLOW} runs exactly that on every merge to main once a runner is "
        "available again."
    )


def _wrap(text, width=72):
    import textwrap

    return textwrap.wrap(" ".join(str(text).split()), width=width) or [""]


def exit_code(state, require_announced=False):
    if not require_announced:
        return 0
    if state["verdict"] == "unknown":
        return 2
    if state["verdict"] == "announced" and state.get("covers") != "stale":
        return 0
    return 1


def main(argv=None, api=None):
    parser = argparse.ArgumentParser(
        description="Read whether the live catalogue has been announced to IndexNow."
    )
    parser.add_argument("--json", action="store_true", help="machine-readable")
    parser.add_argument("--repo", help="owner/name (default: origin remote)")
    parser.add_argument(
        "--limit",
        type=int,
        default=DEFAULT_RUN_LIMIT,
        help=f"how many completed runs to examine (default {DEFAULT_RUN_LIMIT})",
    )
    parser.add_argument(
        "--require-announced",
        action="store_true",
        help="exit non-zero unless the live snapshot has been announced",
    )
    args = parser.parse_args(argv)

    if api is None:
        token = api_token()
        if not token:
            print(
                "neither GH_TOKEN nor GITHUB_TOKEN is set; this tool needs a token "
                "that can read Actions runs. Reporting `unknown` rather than "
                "guessing -- an unreadable state is not an unannounced one.",
                file=sys.stderr,
            )
            return 2
        api = http_api_for(resolve_repo(args.repo), token)

    try:
        state = collect(api, args.limit)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    print(json.dumps(state, indent=2) if args.json else render(state), end="")

    code = exit_code(state, args.require_announced)
    if code == 1:
        print(
            "\nFAIL: the live catalogue has pages that have never been announced to "
            "IndexNow, which is its only page-enumeration route. See `next` above.",
            file=sys.stderr,
        )
    return code


if __name__ == "__main__":
    raise SystemExit(main())
