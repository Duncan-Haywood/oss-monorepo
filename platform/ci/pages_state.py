#!/usr/bin/env python3
"""Read what a session can actually learn about the GitHub Pages route.

    python3 platform/ci/pages_state.py
    python3 platform/ci/pages_state.py --json

## Why this exists

`portfolio/ledger/infra_state.yaml` carries a `github-pages-plan` row with
verdict `unknown`, and it says, in the `how:` field:

    There is no API call an agent session can make here -- the repository
    token cannot see billing, and guessing is what this file exists to stop.

The first clause is true of *billing* and was being read as true of *Pages*.
They are not the same question, and the difference decides whether the
`deploy-settings` route is worth an owner's thirty seconds:

  - **Billing** ("is this account on Free or Pro?") really is unreadable here.
    `GET /user` returns `"plan": null` for a fine-grained PAT without the Plan
    permission, which is the measurement that row already records.
  - **Pages configuration** ("does this repository have a Pages site?") is a
    plain field on the repository object, `has_pages`, and every token that can
    read the repository can read it.

That matters because of a constraint on GitHub's side: **Pages cannot be
enabled on a private repository on the Free plan.** The API refuses it and the
Settings pane does not offer it. So on a repository that is private *today*,
`has_pages: true` is evidence about the plan, arrived at without ever asking
about the plan.

## What the verdict means, and what it does not

Stated precisely, because the whole point of `infra_state.yaml` is that a
reading is not a claim:

  - `has_pages: false` on a private repo -- says nothing about the plan. Pages
    may simply never have been switched on.
  - `has_pages: true` on a private repo -- a Pages site is configured on a
    repository where the Free plan cannot configure one. The straightforward
    reading is that the plan supports it. The honest caveat is that
    `has_pages` is sticky: a repository that was public when Pages was enabled,
    or an account that has since downgraded, can carry `true` while serving
    nothing to a stranger.

So this tool reports `likely-up`, never `up`. `up` would need either the
billing page or an actual 200 from the published URL, and this tool has
neither. It narrows an unknown; it does not close it.

## What it deliberately does not do

It does not enable Pages, and it could not: `PUT /repos/{owner}/{repo}/pages`
is a publish-under-the-portfolio's-public-name action, which `CLAUDE.md`
reserves for the owner. It also does not try `/pages`, `/environments` or
`/deployments`: all three 403 from a Claude-on-the-web session, and a tool
whose central call 403s in the environment that most needs it is the failure
mode `ci_starvation.py` had until it stopped requiring the `gh` CLI. Every
call here is one the plain repository object answers.

**They do not all 403 for the same reason, and this docstring said they did
until it was measured on 2026-09-05.** Read the bodies, not just the status:

    /pages         403  "not permitted through this proxy"   (agent egress proxy)
    /environments  403  "not permitted through this proxy"   (agent egress proxy)
    /deployments   403  "Resource not accessible by integration"  (GitHub: token scope)

The first two never reach GitHub. The third does, and GitHub declines it —
the session token simply lacks `deployments: read`. That distinction is worth
keeping because it says which of these is *reachable in principle*, and
`/deployments` is the interesting one: when Pages serves from a branch,
GitHub records a `github-pages` environment deployment on it, so a caller
that could read deployments would settle the open `source_note` question —
branch route or Actions route — without the owner opening anything.

This tool still must not depend on it, for the reason above: the answer has
to come from a call that works in the environment that needs it. The place
that *can* make it is a runner, where `secrets.GITHUB_TOKEN` carries the
scope and no agent proxy sits in front of GitHub. That is a note for whoever
extends the runner-side probe once runners are back — not a reason to add an
owner ask, and not a call to add here.

## The freshness half

A verdict about the route is not much use without knowing whether the artifact
behind it is current. The runner-free route serves the `gh-pages` branch, which
`platform/pages/publish-branch.sh` commits by hand -- a snapshot, so it goes
stale the moment `main` moves and nothing refreshes it. This tool reports the
commit `gh-pages` was built from and whether that commit is still the tip of
`main`, so "the flip is ready" and "the flip would publish a month-old
catalogue" are distinguishable at a glance.

## The source half — measured 2026-09-05, and it closes the open question

Everything above this line was written believing the *source* question ("does
Pages serve the `gh-pages` branch, or the Actions workflow?") was unreadable
from a session. `source_note` said so in its own docstring, and the honest
output was a URL for the owner to open in a browser.

It is readable, and by a call this repository already makes on every
`ci_starvation.py` run:

    GET /repos/{owner}/{repo}/actions/workflows

When Pages serves **from a branch**, GitHub creates and runs a managed
workflow for it, and that workflow appears in this listing with the synthetic
path `dynamic/pages/pages-build-deployment` — the same shape as the
`dynamic/dependabot/...` and `dynamic/agents/...` entries this repository
already carries. When Pages serves **from Actions**, no such workflow is
created; the repository's own `portfolio-pages.yml` does the deploying.

So the absent entry is the measurement. Run on 2026-09-05 against all 232
workflows in this repository, the three `dynamic/` paths were
`dynamic/agents/copilot-pull-request-reviewer`,
`dynamic/dependabot/dependabot-updates` and `dynamic/dependabot/update-graph`.
No `dynamic/pages/`. With `has_pages: true`, that says the source is Actions
— which needs a runner, and the metered allowance is spent — so the site is
dark for a reason one Settings dropdown fixes.

**Why this counts as a measurement rather than an inference.** The failure
mode it has to avoid is the one this file already reasons about: a branch
source configured but never built would also show no workflow. That case is
excluded here by the branch itself — a Pages branch source builds on every
push to the branch it points at, and both candidate branches (`gh-pages` and
the default branch) have taken pushes. `verdict_source` therefore withholds
`actions` unless the publish branch actually exists with a commit, and
reports `unknown` rather than guessing when it does not.

**What it still does not prove.** That the site *serves*. `has_pages` is
sticky and a workflow listing is not an HTTP 200 — the reading is about
configuration, exactly as the plan verdict above is about billing. A stranger
opening the URL remains the only proof of serving.
"""

import argparse
import datetime as dt
import fnmatch
import json
import os
import re
import sys
import textwrap
import urllib.parse

import yaml

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ci_starvation import (  # noqa: E402  (path shim must precede the import)
    REPO_PLACEHOLDER,
    api_token,
    http_api_for,
    resolve_repo,
)

# The canonical site build, whose `DEFAULT_BASE_URL` export is the origin every
# generated page names in its canonical tag. Read, never restated.
BUILD_MJS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "pages", "build.mjs")


def pages_base_url(path=None):
    """The origin `platform/pages/build.mjs` publishes to, or None if not found.

    Moved here from the retired `public_surface.py` on 2026-10-30.
    """
    path = path or BUILD_MJS
    if not os.path.isfile(path):
        return None
    with open(path, encoding="utf-8") as fh:
        match = re.search(
            r"^export\s+const\s+DEFAULT_BASE_URL\s*=\s*['\"]([^'\"]+)['\"]",
            fh.read(),
            re.MULTILINE,
        )
    return match.group(1) if match else None

REPO_PATH = f"repos/{REPO_PLACEHOLDER}"
BRANCH_PATH = f"repos/{REPO_PLACEHOLDER}/branches/{{branch}}"
WORKFLOWS_PATH = (
    f"repos/{REPO_PLACEHOLDER}/actions/workflows?per_page=100&page={{page}}"
)
# Runs of the managed builder, newest first. Filtered to the publish branch
# server-side so a busy repository's run history cannot push the one that
# matters off the first page.
PAGES_RUNS_PATH = (
    f"repos/{REPO_PLACEHOLDER}/actions/runs"
    f"?branch={{branch}}&per_page=20&page=1"
)
# Files changed between the snapshot's source commit and the tip of the default
# branch. GitHub caps the `files` array at 300 entries, which `read_changed_paths`
# treats as "could not read" rather than as a short list -- see there.
COMPARE_PATH = f"repos/{REPO_PLACEHOLDER}/compare/{{base}}...{{head}}"

PUBLISH_BRANCH = "gh-pages"

# The site workflow, read for its `paths:` filter rather than restated here.
# Its `pull_request` filter *is* the set of inputs `build.mjs` reads (its `push`
# trigger has no filter: every merge deploys). This read
# `publish-pages-branch.yml` until that workflow was retired on 2026-10-20,
# when the Pages source moved to GitHub Actions. The repository
# has now twice paid for a constant copied out of the file that owns it
# (CLAUDE.md, "168 became 169"), so this parses the one source of truth and
# `test_pages_state.py` asserts the file still parses.
PUBLISH_WORKFLOW = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    ".github",
    "workflows",
    "portfolio-pages.yml",
)

# GitHub's managed builder for a *branch*-sourced Pages site. It is not a file
# in `.github/workflows/`; GitHub synthesises it and lists it under this path
# prefix, the same way it lists `dynamic/dependabot/...`. Matching on the
# prefix rather than the full name is deliberate — the leaf has been renamed
# before (`pages-build-deployment` today), and any future managed Pages
# builder still has to live under this namespace to be a Pages builder.
PAGES_BUILDER_PREFIX = "dynamic/pages/"

# The `infra_state.yaml` row this module's `deployed` verdict measures, and the
# file it lives in. `--record` writes the reading back into that row.
#
# Why writing it back is worth code rather than a reminder. `decision_queue.py`
# ages any reading older than its `STALE_AFTER_DAYS` (3) out to `unknown`, and
# `serving_origins()` then drops this origin -- which flips the queue's header
# from "PARTIAL OUTAGE ... the rows below are NOT all waiting on this" to
# "OUTAGE: the public surface is down ... every other row here is downstream of
# a host answering at all". The ageing is correct and must not be widened: an
# un-re-measured origin must never keep suppressing that banner. But the row it
# ages out is one this module can re-measure on demand, with no credential
# beyond the repository read a session already has -- so the gap between "we
# can measure this" and "somebody remembered to hand-edit the YAML" is the
# whole defect, and it has now cost the same false OUTAGE twice (2026-09-10,
# then again 2026-09-16 six days later, with the row's own prose in between
# saying "if the banner regresses again, retake it").
#
# So this is the reminder turned into a command, the same move
# `--require-current` is against a stale snapshot and `guard_state.py
# --require-runnable` is against a fixable skip.
INFRA_STATE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "portfolio",
    "ledger",
    "infra_state.yaml",
)
ORIGIN_READING = "github-pages-branch-route"

# What a `deployed` verdict means for that row's `verdict:` field. `unknown` is
# deliberately absent: a reading that measured nothing must not overwrite a
# reading that measured something, it must let the existing row age out on its
# own. That is the same direction `reading()` errs in, and the direction the
# 2026-08-30..09-04 "nothing is served" episode failed in.
DEPLOYED_TO_VERDICT = {"served": "up", "failed": "down"}

# How GitHub's managed builder reports a build it abandoned because a newer
# push to the same branch overtook it. It is the *ordinary* outcome here, not
# an error: `publish-branch.sh` force-pushes the whole snapshot, so two
# sessions publishing minutes apart -- which CLAUDE.md records as the normal
# case, up to 4 inside a 15-minute window -- reliably leave a `cancelled` run
# behind the one that wins. Measured 2026-09-07: of runs 111-125 on this
# branch, five concluded `cancelled` and every one of them was immediately
# followed by a `success` on a newer commit.
#
# Reading it as a deploy failure is therefore not a rare race but a structural
# false alarm, and it fires exactly where it does the most damage -- see
# `verdict_deployment`.
SUPERSEDED_CONCLUSION = "cancelled"

# One guard against a silent misread. If GitHub ever stops listing *any*
# `dynamic/` workflow through this endpoint — a scope change, a token that
# sees only repository-defined workflows — then "no dynamic/pages/ entry"
# would stop being evidence of anything, and this tool would report `actions`
# on a repository serving happily from a branch. So the absence only counts
# when some other dynamic workflow is visible to prove the namespace is.
DYNAMIC_PREFIX = "dynamic/"

# `publish-branch.sh` writes exactly this subject line, and the SHA in it is
# the whole reason the freshness check can be done without a second API call.
BUILT_FROM = re.compile(r"Publish site built from ([0-9a-f]{7,40})")


def read_repo(api):
    """The three repository fields this tool votes on."""
    repo = api(REPO_PATH)
    return {
        "private": bool(repo.get("private")),
        "has_pages": bool(repo.get("has_pages")),
        "default_branch": repo.get("default_branch") or "main",
    }


def read_publish_branch(api, branch=PUBLISH_BRANCH):
    """What `gh-pages` is, or None if there is no such branch.

    A missing branch is a normal answer here, not an error: it means the
    runner-free route has nothing staged yet.
    """
    try:
        payload = api(BRANCH_PATH.replace("{branch}", branch))
    except RuntimeError:
        return None

    commit = payload.get("commit") or {}
    message = ((commit.get("commit") or {}).get("message") or "").strip()
    match = BUILT_FROM.search(message)
    return {
        "sha": commit.get("sha"),
        "date": ((commit.get("commit") or {}).get("committer") or {}).get("date"),
        "built_from": match.group(1) if match else None,
    }


def read_default_head(api, branch):
    """The tip commit of the default branch, or None if it cannot be read."""
    try:
        payload = api(BRANCH_PATH.replace("{branch}", branch))
    except RuntimeError:
        return None
    return ((payload.get("commit") or {}).get("sha")) or None


def build_input_patterns(path=PUBLISH_WORKFLOW):
    """The `paths:` filter of the publishing workflow, or None if unreadable.

    None means "I could not look", and `freshness` treats that the same way it
    treats an unreadable comparison: as a reason to keep saying `stale`, never
    as licence to call a snapshot current. The distinction matters because this
    is the only thing standing between a real drift and a quiet pass.
    """
    try:
        with open(path, encoding="utf-8") as handle:
            document = yaml.safe_load(handle)
    except (OSError, yaml.YAMLError):
        return None
    # `on:` is the YAML 1.1 boolean `True` once parsed, which is why this looks
    # for both spellings rather than the obvious one.
    triggers = document.get("on") if isinstance(document, dict) else None
    if triggers is None and isinstance(document, dict):
        triggers = document.get(True)
    paths = None
    for event in ("push", "pull_request"):
        trigger = (triggers or {}).get(event) if isinstance(triggers, dict) else None
        paths = (trigger or {}).get("paths") if isinstance(trigger, dict) else None
        if paths:
            break
    if not paths:
        return None
    return [str(pattern) for pattern in paths]


def is_build_input(changed_path, patterns):
    """Whether one changed file is an input the published artifact is built from."""
    for pattern in patterns:
        # `dir/**` is the only glob this filter uses, and it means the subtree.
        if pattern.endswith("/**"):
            if changed_path.startswith(pattern[:-2]):
                return True
        elif fnmatch.fnmatch(changed_path, pattern):
            return True
    return False


def read_changed_paths(api, base, head):
    """Files changed between two commits, or None when that cannot be trusted.

    Returns None rather than a partial list when GitHub truncates the response.
    The comparison endpoint caps `files` at 300 entries, and a truncated list
    read as a complete one is exactly how a genuinely stale snapshot would be
    waved through as current -- the failure this whole function exists to avoid
    creating.
    """
    if not base or not head:
        return None
    try:
        payload = api(COMPARE_PATH.replace("{base}", base).replace("{head}", head))
    except RuntimeError:
        return None
    files = payload.get("files")
    if not isinstance(files, list):
        return None
    if len(files) >= 300:
        return None
    return [str(entry.get("filename") or "") for entry in files]


def read_workflow_paths(api):
    """Every workflow path GitHub lists for this repository, or None.

    None means the listing could not be read at all (no Actions scope, a
    proxy refusal, a transport error). That is deliberately distinct from an
    empty list: "I could not look" and "I looked and there are none" support
    opposite conclusions in `verdict_source`, and collapsing them is how a
    tool starts asserting things it did not measure.

    Pages the listing rather than trusting the first 100. This repository has
    232 workflows and the `dynamic/` entries sort wherever GitHub puts them,
    so a single-page read could miss the one field this vote turns on.
    """
    paths = []
    for page in range(1, 21):  # 2000 workflows is far past any real repository
        try:
            payload = api(WORKFLOWS_PATH.replace("{page}", str(page)))
        except RuntimeError:
            return None
        batch = payload.get("workflows") or []
        if not batch:
            break
        paths.extend(w.get("path") or "" for w in batch)
        if len(batch) < 100:
            break
    return paths


def read_pages_deployment(api, branch=PUBLISH_BRANCH):
    """The most recent managed Pages build on `branch`, or None.

    This is the strongest credential-free reading available, and it is
    strictly stronger than `verdict_source`'s. That one asks whether GitHub
    *lists* a branch builder, which establishes that some branch source is
    configured but names no branch and proves no build ever happened. This
    asks whether that builder has actually *run on this branch and
    succeeded* -- which names the branch (a managed Pages build is triggered
    only by a push to the configured source) and shows a real deployment of a
    known commit.

    The distinction is the one the module docstring left open: "configured"
    and "deployed" are different claims, and the repository has been reading
    the first as the second. It still is not an HTTP 200 -- a successful
    deploy can still 404 for plan reasons -- but it moves the owner-facing
    answer from "open this URL and tell us" to a measurement.
    """
    try:
        payload = api(PAGES_RUNS_PATH.replace("{branch}", branch))
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None

    latest = None
    in_flight = None
    last_success = None
    for run in payload.get("workflow_runs") or []:
        # `event: dynamic` and the synthetic path together are what mark this
        # as GitHub's own builder rather than a repository workflow that
        # happens to run on the same branch.
        if not str(run.get("path", "")).startswith(PAGES_BUILDER_PREFIX):
            continue
        summary = {
            "branch": run.get("head_branch"),
            "conclusion": run.get("conclusion"),
            "head_sha": (run.get("head_sha") or "")[:8],
            "run_id": run.get("id"),
            "updated_at": run.get("updated_at"),
        }
        if run.get("status") != "completed":
            # A build that is still running says nothing about what is served
            # *yet*, so it does not become the reading -- but it is carried,
            # because "the answer below is about an older commit and a newer
            # build is in flight" is a materially different statement from the
            # same answer with nothing running.
            if in_flight is None:
                in_flight = summary
            continue
        if latest is None:
            latest = summary
        if last_success is None and run.get("conclusion") == "success":
            last_success = summary
        if latest is not None and last_success is not None:
            break

    if latest is None:
        # No completed managed build on the branch. A first-ever build that is
        # still running lands here and reads as `unknown`, which is the honest
        # answer: nothing has deployed yet.
        return None
    latest["in_flight"] = in_flight
    # A *copy*, because when the newest completed build is itself the
    # successful one, `last_success` and `latest` are the same object -- and
    # `latest["last_success"] = last_success` then makes the dict reference
    # itself. Nothing that reads a field off it notices (`verdict_deployment`
    # only ever reads the summary keys), which is why this survived: the one
    # caller that walks the whole structure is `--json`, and it died with
    # `ValueError: Circular reference detected` on every healthy repository.
    # Broken precisely when the site is fine, working only when the newest
    # build had failed -- the inversion is why it read as "nobody uses
    # --json" rather than as a bug.
    latest["last_success"] = dict(last_success) if last_success is not None else None
    return latest


def verdict_deployment(deployment, publish):
    """`(verdict, reason)` for whether GitHub has actually deployed the branch.

    `served` is the only verdict that lets a session stop asking the owner to
    flip a Settings dropdown, so it requires a *successful* completed run, not
    merely a recent one: a build that failed is a configured source that is
    serving whatever it served before.

    It reads a `cancelled` build as supersession rather than as failure, and
    that distinction is the whole reason this function was rewritten on
    2026-09-07. It used to test `conclusion != "success"`, which folded
    GitHub's ordinary "a newer push overtook this build" into the same bucket
    as a broken deploy and reported `failed` -- "this snapshot did not
    deploy" -- about a site that was serving perfectly.

    Two things made that worse than an ordinary off-by-one. `read_pages_deployment`
    skips a build that is still running and answers from the last *completed*
    one, so during the seconds after a publish the reading falls through the
    real build onto the superseded predecessor. And `publish-branch.sh` prints
    this very report immediately after it force-pushes the branch -- so the
    false alarm did not merely exist, it was rendered to the operator at the
    one moment it was guaranteed to be wrong, and the autonomous worker is
    pointed at the same row (`gitops/agents/workers/mandate.md`).

    Measured on this repository: at 03:21 the row read `failed`, citing run
    34079362071 (`cancelled`, superseded 11 seconds later); at 03:22 the same
    command on the same commit read `served`, citing run 34079370768. A gate
    whose verdict depends on when you ask is worse than no gate, because the
    repository's own guidance says to prefer this row to any prose -- and this
    file has twice recorded what a red signal nobody believes costs when the
    failure is finally real.
    """
    if deployment is None:
        return (
            "unknown",
            f"no completed `{PAGES_BUILDER_PREFIX}` run on `{PUBLISH_BRANCH}` is "
            "visible, so nothing here says GitHub has built this branch",
        )

    in_flight = deployment.get("in_flight")
    building = ""
    if in_flight:
        building = (
            f" A newer build is in flight on {in_flight['head_sha']} "
            f"(run {in_flight['run_id']}), so this reading is about the last "
            f"build that finished, not about that one."
        )

    superseded = deployment["conclusion"] == SUPERSEDED_CONCLUSION
    last_success = deployment.get("last_success")

    if deployment["conclusion"] != "success" and not superseded:
        return (
            "failed",
            f"GitHub's managed builder last ran on `{deployment['branch']}` at "
            f"{deployment['head_sha']} and concluded `{deployment['conclusion']}` "
            f"(run {deployment['run_id']}) -- the branch IS the Pages source, but "
            f"this snapshot did not deploy.{building}",
        )

    if superseded and not last_success:
        # Cancelled with nothing successful behind it. Not a failure, but
        # nothing here shows a deploy either, so it must not read as `served`.
        return (
            "unknown",
            f"the newest completed `{PAGES_BUILDER_PREFIX}` run on "
            f"`{deployment['branch']}` was superseded (run "
            f"{deployment['run_id']}, `{SUPERSEDED_CONCLUSION}`) and no "
            f"successful build is visible behind it, so nothing here says this "
            f"branch has ever deployed.{building}",
        )

    # Either the newest completed build succeeded, or it was superseded and an
    # earlier one succeeded. In both cases a managed build *has* run to
    # completion on this branch, which is what names the source.
    served = last_success if superseded else deployment
    note = ""
    if superseded:
        note = (
            f" The newest completed build (run {deployment['run_id']}, "
            f"{deployment['head_sha']}) was `{SUPERSEDED_CONCLUSION}` -- that is "
            f"GitHub abandoning a build a newer push overtook, which is routine "
            f"here and is not a deploy failure."
        )

    fresh = ""
    if publish and publish.get("sha", "")[:8] != served["head_sha"]:
        fresh = (
            f" NOTE: `{PUBLISH_BRANCH}` has since moved to "
            f"{publish['sha'][:8]}, which may not be deployed yet"
        )
    return (
        "served",
        f"GitHub's managed builder ran on `{served['branch']}` at "
        f"{served['head_sha']} and succeeded (run {served['run_id']}, "
        f"{served['updated_at']}). A managed Pages build is triggered only "
        f"by a push to the configured source, so `{PUBLISH_BRANCH}` IS that "
        f"source and this snapshot deployed. `deploy-settings` is already "
        f"granted.{note}{building}{fresh}"
    )


def verdict_source(repo, publish, workflow_paths):
    """Which source an already-configured Pages site serves from.

    Returns `(verdict, reason)` where verdict is one of:

      `branch`   -- GitHub's managed branch builder exists, so Pages is
                    serving (or has served) from a branch. The queued
                    `deploy-settings` ask is already granted.
      `actions`  -- Pages is configured, the managed branch builder does not
                    exist, and the publish branch does have commits that
                    would have triggered one. The source is the Actions
                    workflow, which needs a runner.
      `unknown`  -- anything else, including every case where the evidence
                    would have to be stretched to reach a verdict.

    The asymmetry is on purpose. `branch` is a *positive* reading of a
    workflow that is present; `actions` is a reading of an absence, so it
    carries the two extra conditions above before it will fire.
    """
    if not repo["has_pages"]:
        return "unknown", "no Pages site is configured, so it has no source"
    if workflow_paths is None:
        return (
            "unknown",
            "the Actions workflow listing could not be read (no Actions: read "
            "scope, or the call was refused), and this vote is read from it",
        )
    if any(p.startswith(PAGES_BUILDER_PREFIX) for p in workflow_paths):
        return (
            "branch",
            f"GitHub's managed `{PAGES_BUILDER_PREFIX}` builder is listed, "
            "which it creates only for a branch-sourced Pages site",
        )
    if not any(p.startswith(DYNAMIC_PREFIX) for p in workflow_paths):
        return (
            "unknown",
            f"no `{DYNAMIC_PREFIX}` workflow of any kind is listed, so this "
            "listing is not showing GitHub's managed workflows and the "
            f"absence of `{PAGES_BUILDER_PREFIX}` is not evidence",
        )
    if publish is None or not publish.get("sha"):
        return (
            "unknown",
            f"no `{PUBLISH_BRANCH}` branch with a commit, so a branch source "
            "may simply never have been built -- absence proves nothing yet",
        )
    return (
        "actions",
        f"Pages is configured but GitHub lists no `{PAGES_BUILDER_PREFIX}` "
        f"builder, while `{PUBLISH_BRANCH}` has commits that would have "
        "triggered one. The source is the Actions workflow, which needs a "
        "runner the metered allowance no longer buys",
    )


def plan_verdict(repo):
    """One of `likely-up`, `unknown`, or `not-applicable`, with the reason.

    `not-applicable` is for a public repository: Pages serves a public repo on
    every plan, so `has_pages` carries no information about billing there and
    saying `likely-up` would be reading a fact that is not in evidence.
    """
    if not repo["private"]:
        return (
            "not-applicable",
            "the repository is public, so Pages serves it on any plan and "
            "has_pages says nothing about the account's plan",
        )
    if repo["has_pages"]:
        return (
            "likely-up",
            "a Pages site is configured on a PRIVATE repository, which the "
            "Free plan does not permit -- so the plan most likely supports "
            "private Pages. Sticky flag: confirm in Settings -> Billing",
        )
    # `has_pages` false is the one case where "flip Pages on" is the whole
    # action. Every other branch reaches `source_note` below, which is about
    # *which source* an already-configured site points at.
    return (
        "unknown",
        "no Pages site is configured, which is what both a Free plan and an "
        "unflipped switch look like from here",
    )


def freshness(publish, head_sha, changed_paths=None, patterns=None):
    """Whether re-publishing would change what the site serves.

    The question this answers used to be "was the snapshot built from the tip
    of `main`?", which is a different and worse question. Measured 2026-09-06:
    `main` was one docs-only commit ahead of the snapshot (#3452, touching
    `AGENTS.md`, `portfolio/DIRECTION.md` and a ledger file), this reported
    `stale`, and rebuilding produced a tree **byte-identical** to the published
    one -- 2053 files, zero diff.

    That false alarm is not free. It asks every session after a docs merge to
    force-push an identical 2000-file artifact, which spends a managed Pages
    build to change nothing; and a warning that cries wolf after every docs
    merge is one the fleet learns to skim, which costs exactly on the day the
    drift is real. So the comparison is now against the build's *inputs* --
    the `paths:` filter of the workflow that publishes the branch, which is the
    same set `build.mjs` reads.

    Both unreadable cases (no comparison, no filter) keep the old `stale`
    answer. An absent measurement must never read as a healthy one.
    """
    if publish is None:
        return "absent", f"no `{PUBLISH_BRANCH}` branch: nothing is staged to serve"
    if not publish["built_from"]:
        return (
            "unknown",
            f"`{PUBLISH_BRANCH}` exists but its tip commit does not name the "
            "revision it was built from, so staleness cannot be read from here",
        )
    if not head_sha:
        return "unknown", "could not read the default branch tip to compare against"
    if head_sha.startswith(publish["built_from"]) or publish["built_from"].startswith(
        head_sha[: len(publish["built_from"])]
    ):
        return "current", f"built from the tip of the default branch ({head_sha[:8]})"
    if changed_paths is not None and patterns:
        touched = [path for path in changed_paths if is_build_input(path, patterns)]
        if not touched:
            return (
                "current",
                f"built from {publish['built_from'][:8]} and the default branch is "
                f"now at {head_sha[:8]}, but nothing changed since touches a path "
                f"the site is built from ({', '.join(patterns)}) -- re-publishing "
                "would produce the same tree",
            )
        return (
            "stale",
            f"built from {publish['built_from'][:8]}, but the default branch is now "
            f"at {head_sha[:8]} and {len(touched)} changed file(s) feed the build "
            f"(e.g. {touched[0]}) -- re-run publish-branch.sh",
        )
    return (
        "stale",
        f"built from {publish['built_from'][:8]}, but the default branch is now "
        f"at {head_sha[:8]} -- re-run publish-branch.sh before the flip",
    )


def source_note(repo, base_url, source="unknown", source_reason=""):
    """What is actually left to do, given `has_pages` and the source verdict.

    Why this is separate from `plan_verdict`
    ----------------------------------------
    Added 2026-09-05, because the two questions had been collapsed into one and
    the answer to the second was wrong. `has_pages: true` was read purely as
    evidence about *billing* -- which it is, and that inference stands -- and
    the tool then printed "The flip: Settings -> Pages -> Source ..." as though
    Pages were switched off. It is not. `has_pages: true` means a Pages site is
    **already configured on this repository**; what nobody here has read is
    which *source* it points at, and the two possibilities need opposite
    actions:

      * Source = "GitHub Actions" (what `portfolio-pages.yml` configures). The
        site is dark because that workflow needs a runner and the metered
        allowance is spent. The owner's move is to switch the source to the
        `gh-pages` branch, which needs no runner at all.
      * Source = `gh-pages` branch already. Then the catalogue **is being
        served** and the queued `deploy-settings` ask is already granted.

    Nothing in this repository can tell those apart: `GET /repos/{o}/{r}/pages`
    carries the answer and is one of the paths the agent egress proxy refuses
    (403), which is why this module reads only the plain repository object.
    And the credential-free check that could settle it from a runner --
    the since-retired `public_surface.py` Pages probe -- never once executed:
    it landed in dbf614c74, one commit *after* run 33887885219, the last run to
    get a real runner. Every dispatch since has come back `runner_id: 0`.

    So the honest output is not a flip instruction. It is the one URL that
    settles it, which anyone with a browser can open in five seconds and no
    session running behind the proxy can.

    **Superseded in part, 2026-09-05.** The paragraph above is right that
    `/pages` is refused and that only a fetch proves *serving*. It was wrong
    that nothing here can tell the two sources apart: the Actions workflow
    listing does, and `verdict_source` now reads it. When that vote lands on
    `branch` or `actions` this function says so and names the action; when it
    lands on `unknown` it falls back to the URL, which is still the right
    answer for a question nothing measured.
    """
    if not repo["has_pages"]:
        # Deliberately not a flip instruction. `has_pages: false` on a private
        # repository is what a Free plan and an unflipped switch look like
        # alike, so naming the switch here would send the owner to a Settings
        # page that may have nothing to offer them. The plan is the question
        # that comes first, and it is the one this cannot read.
        return (
            "No Pages site is configured. On a private repository that is what "
            "a Free plan and an unflipped switch look like alike, so the "
            "question ahead of the switch is the plan: Settings -> Billing."
        )
    target = base_url or "the repository's github.io origin"

    if source == "actions":
        # The one case with a concrete, owner-sized action attached. Say the
        # action, not the investigation -- this is the whole value of having
        # measured the source rather than sending the owner to look.
        return (
            "Pages is configured, and its source is the ACTIONS workflow.\n"
            f"    Measured: {source_reason}.\n"
            "    THE FLIP (one dropdown, ~30 seconds, no secret to paste):\n"
            f"      Settings -> Pages -> Source -> 'Deploy from a branch' -> "
            f"'{PUBLISH_BRANCH}' / (root) -> Save\n"
            "    That route needs no runner, no k3s cluster and no Hetzner "
            "SSH key, so it is the only published-catalogue path that is not "
            "downstream of an outage. Check the snapshot line above first: "
            "the flip publishes whatever `gh-pages` holds right now.\n"
            f"    Confirm afterwards by opening:  {target}"
        )

    if source == "branch":
        return (
            "Pages is configured and its source is a BRANCH.\n"
            f"    Measured: {source_reason}.\n"
            "    So `deploy-settings` is already granted and this catalogue "
            "has a public URL. What is left is keeping the snapshot fresh -- "
            "see the line above, and `platform/pages/publish-branch.sh` after "
            "any merge that touches a served surface.\n"
            f"    Confirm it serves by opening:  {target}"
        )

    return (
        "Pages is ALREADY configured here (has_pages: true). What is unread is "
        f"which source it points at: {source_reason or 'not measured'}. The "
        "/pages API path is refused by the agent egress proxy, and the "
        "runner-side probe that would answer it has never run on a real "
        "runner (added after run 33887885219; every dispatch since is "
        "runner_id: 0).\n"
        f"    Settle it by opening:  {target}\n"
        "      serves  -> the branch route is already live; deploy-settings is "
        "already granted, and this catalogue has a public URL.\n"
        "      404/dark -> the source is still 'GitHub Actions', which needs a "
        f"runner. Switch it to '{PUBLISH_BRANCH} / (root)' -- no runner, no "
        "cluster, no secret."
    )


def indexing_verdict(base_url):
    """Can a crawler discover this site's sitemap on its own?

    `robots.txt` is fetched **per origin, at the origin root** -- that is the
    protocol, not a GitHub detail. A project Pages site is served from a
    subpath, so the `robots.txt` this repository publishes lands at

        https://<owner>.github.io/<repo>/robots.txt

    and the file a crawler actually reads is

        https://<owner>.github.io/robots.txt

    which belongs to the owner's *user* Pages site and is nothing to do with
    this repository. So the `Sitemap:` directive `build.mjs` writes -- the one
    line that tells a crawler all 881 published pages exist -- is in a file no
    crawler fetches, and sitemap auto-discovery does not happen at all.

    This is not a defect in anything the repository builds. `renderRobots` is
    correct, `check.mjs` is right to require the file, and a custom domain
    would put it at a root where it works. It is a property of *where the site
    is currently served*, which is exactly the class of thing that goes stale
    in prose and had gone unrecorded anywhere: nothing in this tree said the
    published `robots.txt` is never read.

    It matters more here than it would almost anywhere else. Nothing links to
    this catalogue from outside, so link-following gives a crawler very little
    to go on, and the sitemap is the whole discovery story for a portfolio
    whose `portfolio/usage/usage.yaml` has never taken a visitor reading at
    all -- `live_url_visitors` is null on every row, never measured rather
    than measured-as-zero (`usage_state.py`).
    `portfolio/router/allocate.py` opens every venture's top task
    with "test the untested hypothesis", and every one of those needs traffic.

    Three things fix it and all are the owner's, which is why this reports
    rather than acts: submitting `sitemap.xml` in Google Search Console (and
    Bing Webmaster Tools); publishing a `robots.txt` at the *user* Pages site
    root carrying this catalogue's `Sitemap:` line; or configuring a custom
    domain, after which the site is at an origin root and its own `robots.txt`
    governs.

    **The middle one was added 2026-09-17 and is the cheapest of the three,
    which is why it is named first in the report.** The sitemaps protocol lets
    a `Sitemap:` directive in robots.txt reference any sitemap on the *same
    host*; cross-host is what needs verification. Every `<loc>` this catalogue
    publishes is on `duncan-haywood.github.io` under the one subpath, and the
    index at `<base>sitemap.xml` names only children beneath it (verified
    against `origin/gh-pages` on the day this was written), so a two-line file
    in a repository named `<owner>.github.io` restores enumeration with no
    DNS, no registrar, no certificate wait, and no per-engine console login.

    It is also the only one of the three that reaches crawlers the owner has
    no console for -- DuckDuckGo, the AI crawlers, anything that appears next
    year -- because it is read at fetch time rather than submitted once. The
    Search Console route is per-engine and manual; the custom domain costs
    money and a DNS round trip.

    The caveat that makes it an owner ask rather than an agent action, beyond
    the repository simply being out of an agent session's reach: if that user
    Pages site already exists, its `robots.txt` is the live one and must be
    *edited* rather than created, and it must not `Disallow` the subpath.
    Creating it also publishes under the owner's personal namespace, which is
    the "publishing under the portfolio's public name" gate in CLAUDE.md.

    Crawling itself is *not* blocked by this. A missing `robots.txt` at the
    origin root reads as "allow all", so pages reached by a link are still
    fetched. What is lost is the enumeration.
    """
    if not base_url:
        return "unknown", (
            "no base URL could be read from build.mjs, so where robots.txt "
            "lands is unknown -- never assume it is at an origin root"
        )
    parsed = urllib.parse.urlsplit(base_url)
    if parsed.path in ("", "/"):
        return "root", (
            f"the site is at an origin root ({base_url}), so the robots.txt it "
            "publishes is the one crawlers fetch and its `Sitemap:` line is "
            "discoverable"
        )
    root = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    return "subpath-robots", (
        f"the site is served from a subpath ({base_url}), so the robots.txt it "
        f"publishes at {base_url}robots.txt is NOT the file crawlers read -- "
        f"that is {root}, which belongs to the owner's user Pages site. The "
        "`Sitemap:` line is therefore never seen and sitemap auto-discovery "
        "does not happen. Crawling is still allowed; only enumeration is lost. "
        "Owner fix, cheapest first: (1) publish a robots.txt at "
        f"{root} -- a repository named after that host, holding two lines, "
        f"`User-agent: *` and `Sitemap: {base_url}sitemap.xml`. Same-host, so "
        "the sitemaps protocol needs no verification, and it reaches every "
        "crawler at once rather than one console at a time. If that user "
        "Pages site already exists, edit its robots.txt instead and make sure "
        "it does not Disallow this subpath. (2) Submit sitemap.xml in Google "
        "Search Console and Bing Webmaster Tools -- per engine, manual. "
        "(3) Configure a custom domain for this repository, after which "
        "publish-branch.sh carries the CNAME forward and the site is at an "
        "origin root where its own robots.txt governs"
    )


def collect(api):
    repo = read_repo(api)
    publish = read_publish_branch(api)
    head_sha = read_default_head(api, repo["default_branch"])
    # Read from build.mjs by the module that already owns that parse, rather
    # than restated here -- the copied-constant mistake CLAUDE.md records twice.
    base_url = pages_base_url()
    verdict, reason = plan_verdict(repo)
    # Only pay for the comparison when the cheap check would say `stale`: when
    # the snapshot was built from the tip there is nothing to compare, and the
    # docstring's promise that this reads without a second API call still holds
    # for the common case.
    changed_paths = None
    patterns = None
    if publish and publish.get("built_from") and head_sha:
        if not head_sha.startswith(publish["built_from"]):
            patterns = build_input_patterns()
            if patterns:
                changed_paths = read_changed_paths(api, publish["built_from"], head_sha)
    fresh, fresh_reason = freshness(publish, head_sha, changed_paths, patterns)
    source, source_reason = verdict_source(repo, publish, read_workflow_paths(api))
    deployment = read_pages_deployment(api)
    deployed, deployed_reason = verdict_deployment(deployment, publish)
    indexing, indexing_reason = indexing_verdict(base_url)
    return {
        "indexing": indexing,
        "indexing_reason": indexing_reason,
        "source": source,
        "source_reason": source_reason,
        "deployed": deployed,
        "deployed_reason": deployed_reason,
        "deployment": deployment,
        "private": repo["private"],
        "has_pages": repo["has_pages"],
        "default_branch": repo["default_branch"],
        "default_head": head_sha,
        "publish_branch": PUBLISH_BRANCH,
        "publish": publish,
        "plan_verdict": verdict,
        "plan_reason": reason,
        "snapshot": fresh,
        "snapshot_reason": fresh_reason,
        "pages_url": base_url,
        "source_note": source_note(repo, base_url, source, source_reason),
    }


def record_reading(state, path=INFRA_STATE, today=None):
    """Write this run's `deployed` measurement into `infra_state.yaml`'s row.

    Returns `(changed, message)`. `changed` is False for every refusal, and the
    message says why -- a refusal is a normal outcome here, not an error.

    It edits the three *measured* fields (`verdict`, `measured`, `run`) by line
    and touches nothing else. That is not fussiness about diff size: this file
    is roughly nine parts hand-written prose to one part data, and every one of
    those paragraphs is a dated lesson the repository paid for. `yaml.safe_load`
    followed by `yaml.dump` would round-trip the data perfectly and silently
    delete all of it, which is a far worse outcome than the stale row this
    function exists to fix.

    The division of labour in the row is deliberate: prose says how to
    re-measure and what was learned, and carries no date; the three fields
    below carry the date and are machine-maintained. A dated claim inside the
    prose would go stale against the fields the moment this ran.
    """
    verdict = DEPLOYED_TO_VERDICT.get(state.get("deployed"))
    if verdict is None:
        return False, (
            f"deployed is '{state.get('deployed')}', which measures nothing about "
            f"whether the origin serves, so `{ORIGIN_READING}` is left alone to "
            "age out on its own rather than being overwritten with a non-reading"
        )

    success = (state.get("deployment") or {}).get("last_success") or {}
    run_id = success.get("run_id") or (state.get("deployment") or {}).get("run_id")
    if not run_id:
        return False, (
            "the reading carries no run id, and a verdict without the run it was "
            "taken from is exactly the unfalsifiable claim this file forbids"
        )

    today = dt.date.today() if today is None else today
    try:
        with open(path, encoding="utf-8") as fh:
            lines = fh.read().splitlines(keepends=True)
    except OSError as exc:
        return False, f"could not read {path}: {exc}"

    # Find the row, then its block: every following line indented deeper than
    # the key itself, plus blank lines. Anything at the key's indent or less
    # ends it, so a neighbouring row can never be edited by mistake.
    head = f"  {ORIGIN_READING}:"
    try:
        start = next(i for i, ln in enumerate(lines) if ln.rstrip("\n") == head)
    except StopIteration:
        return False, f"no `{ORIGIN_READING}:` row in {path}"

    end = len(lines)
    for i in range(start + 1, len(lines)):
        stripped = lines[i].strip()
        if not stripped:
            continue
        if len(lines[i]) - len(lines[i].lstrip(" ")) <= 2:
            end = i
            break

    wanted = {
        "verdict": f"    verdict: {verdict}\n",
        "measured": f'    measured: "{today.isoformat()}"\n',
        "run": f"    run: {run_id}\n",
    }
    seen = set()
    for i in range(start + 1, end):
        key = lines[i].strip().split(":", 1)[0]
        if key in wanted and lines[i].startswith(f"    {key}:"):
            lines[i] = wanted[key]
            seen.add(key)

    missing = sorted(set(wanted) - seen)
    if missing:
        return False, (
            f"`{ORIGIN_READING}` has no {', '.join(missing)} field to update; "
            "refusing to guess where it belongs"
        )

    new = "".join(lines)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(new)
    return True, (
        f"{ORIGIN_READING}: {verdict} (run {run_id}, measured {today.isoformat()})"
    )


def render(state):
    lines = [
        "GitHub Pages route — what this session can read without the owner",
        "",
        f"  repository        {'private' if state['private'] else 'public'}",
        f"  has_pages         {str(state['has_pages']).lower()}",
        "",
        f"  plan              {state['plan_verdict']}",
        f"                    {state['plan_reason']}",
        "",
        f"  source            {state['source']}",
        f"                    {state['source_reason']}",
        "",
        f"  deployed          {state['deployed']}",
        f"                    {state['deployed_reason']}",
        "",
        f"  {PUBLISH_BRANCH} snapshot  {state['snapshot']}",
        f"                    {state['snapshot_reason']}",
        "",
        f"  indexing          {state['indexing']}",
    ]
    # Wrapped, unlike the rows above: this reason is a paragraph because it has
    # to name the file that is read instead, and an unwrapped line would run
    # off a terminal and be skipped by the reader it exists for.
    lines += [
        f"                    {line}"
        for line in textwrap.wrap(state["indexing_reason"], width=76)
    ]
    lines += ["", "  next"]
    lines += [f"    {line}" for line in state["source_note"].split("\n")]
    return "\n".join(lines) + "\n"


def exit_code(state):
    """0 when the route looks worth the owner's thirty seconds, else 1.

    Deliberately not keyed on snapshot freshness: a stale snapshot is a
    `publish-branch.sh` re-run away and does not change whether the route
    exists, so folding it into the exit code would make a green run mean two
    different things.

    `--require-current` is the other question, and it gets its own function
    below rather than a flag threaded through this one, for exactly the reason
    this docstring already gives.
    """
    return 0 if state["plan_verdict"] == "likely-up" else 1


def freshness_exit_code(state):
    """0 when the published snapshot is `current`, 1 when it is not.

    A separate contract from `exit_code` on purpose. That one answers "is this
    route worth having?", which is a question about configuration and barely
    changes; this one answers "is the site a stranger reaches right now the
    same as `main`?", which changes on every merge that touches a served
    surface.

    This exists because that second question had no gate at all. GitHub Pages
    serves `gh-pages`, a *committed artifact*: nothing rebuilds it when `main`
    moves, so the live site silently falls behind and there is no error
    anywhere to say so. The documented remedy was a paragraph in CLAUDE.md
    telling each session to re-run `publish-branch.sh` by hand -- and on
    2026-09-06 the snapshot was found stale (built from `1afe50c5` while
    `main` was at `565cc635`) by a session that had *read* that paragraph.
    A guard nobody can forget beats a reminder everybody has already read.

    Note what this deliberately does not do: it never publishes. It reports a
    failure and names the one command that fixes it. Publishing rewrites a
    branch, which is not something a check should do as a side effect.
    """
    return 0 if state["snapshot"] == "current" else 1


def main(argv=None, api=None):
    parser = argparse.ArgumentParser(
        description="Read the GitHub Pages route's state without owner credentials."
    )
    parser.add_argument("--json", action="store_true", help="machine-readable")
    parser.add_argument("--repo", help="owner/name (default: origin remote)")
    parser.add_argument(
        "--require-current",
        action="store_true",
        help=(
            "exit non-zero unless the published snapshot is `current`; use "
            "after merging a change that touches a served surface"
        ),
    )
    parser.add_argument(
        "--record",
        action="store_true",
        help=(
            "write this reading into `portfolio/ledger/infra_state.yaml`'s "
            f"`{ORIGIN_READING}` row, so `decision_queue.py` stops ageing a "
            "measurable origin out into a false OUTAGE banner; run it after "
            "publishing, and commit what it rewrites"
        ),
    )
    args = parser.parse_args(argv)

    if api is None:
        token = api_token()
        if not token:
            print(
                "neither GH_TOKEN nor GITHUB_TOKEN is set; this tool needs a "
                "token that can read the repository object",
                file=sys.stderr,
            )
            return 2
        api = http_api_for(resolve_repo(args.repo), token)

    try:
        state = collect(api)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    print(json.dumps(state, indent=2) if args.json else render(state), end="")

    if args.record:
        changed, message = record_reading(state)
        # Both outcomes go to stdout and both are exit 0 on their own: a
        # refusal means the reading measured nothing worth writing, which is
        # not a failure of this command. `--record` composes with the verdict
        # flags below rather than replacing them.
        print(f"\nrecorded: {message}" if changed else f"\nnot recorded: {message}")

    if args.require_current:
        code = freshness_exit_code(state)
        if code:
            # To stderr and spelled out: the caller is a verification step that
            # may only surface the last line, and "stale" alone does not say
            # what to do about it.
            print(
                f"\nFAIL: the published snapshot is '{state['snapshot']}', not "
                "'current', so the live site is not serving what `main` "
                "contains.\n"
                f"  reason: {state['snapshot_reason']}\n"
                "  fix:    CONFIRM=publish-pages-branch PUSH=1 "
                "./platform/pages/publish-branch.sh\n"
                "This needs no runner, no cluster and no credential beyond the "
                "push you already have.",
                file=sys.stderr,
            )
        return code

    return exit_code(state)


if __name__ == "__main__":
    raise SystemExit(main())
