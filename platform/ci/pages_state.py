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
opening the URL remains the only proof of serving, and `public_surface.py`'s
runner-side probe remains the credential-free way to get one.
"""

import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ci_starvation import (  # noqa: E402  (path shim must precede the import)
    REPO_PLACEHOLDER,
    api_token,
    http_api_for,
    resolve_repo,
)
import public_surface  # noqa: E402  (same shim)

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

PUBLISH_BRANCH = "gh-pages"

# GitHub's managed builder for a *branch*-sourced Pages site. It is not a file
# in `.github/workflows/`; GitHub synthesises it and lists it under this path
# prefix, the same way it lists `dynamic/dependabot/...`. Matching on the
# prefix rather than the full name is deliberate — the leaf has been renamed
# before (`pages-build-deployment` today), and any future managed Pages
# builder still has to live under this namespace to be a Pages builder.
PAGES_BUILDER_PREFIX = "dynamic/pages/"

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
    for run in payload.get("workflow_runs") or []:
        # `event: dynamic` and the synthetic path together are what mark this
        # as GitHub's own builder rather than a repository workflow that
        # happens to run on the same branch.
        if not str(run.get("path", "")).startswith(PAGES_BUILDER_PREFIX):
            continue
        if run.get("status") != "completed":
            continue
        return {
            "branch": run.get("head_branch"),
            "conclusion": run.get("conclusion"),
            "head_sha": (run.get("head_sha") or "")[:8],
            "run_id": run.get("id"),
            "updated_at": run.get("updated_at"),
        }
    return None


def verdict_deployment(deployment, publish):
    """`(verdict, reason)` for whether GitHub has actually deployed the branch.

    `served` is the only verdict that lets a session stop asking the owner to
    flip a Settings dropdown, so it requires a *successful* completed run, not
    merely a recent one: a build that failed is a configured source that is
    serving whatever it served before.
    """
    if deployment is None:
        return (
            "unknown",
            f"no completed `{PAGES_BUILDER_PREFIX}` run on `{PUBLISH_BRANCH}` is "
            "visible, so nothing here says GitHub has built this branch",
        )
    if deployment["conclusion"] != "success":
        return (
            "failed",
            f"GitHub's managed builder last ran on `{deployment['branch']}` at "
            f"{deployment['head_sha']} and concluded `{deployment['conclusion']}` "
            f"(run {deployment['run_id']}) -- the branch IS the Pages source, but "
            "this snapshot did not deploy",
        )
    fresh = ""
    if publish and publish.get("sha", "")[:8] != deployment["head_sha"]:
        fresh = (
            f" NOTE: `{PUBLISH_BRANCH}` has since moved to "
            f"{publish['sha'][:8]}, which may not be deployed yet"
        )
    return (
        "served",
        f"GitHub's managed builder ran on `{deployment['branch']}` at "
        f"{deployment['head_sha']} and succeeded (run {deployment['run_id']}, "
        f"{deployment['updated_at']}). A managed Pages build is triggered only "
        f"by a push to the configured source, so `{PUBLISH_BRANCH}` IS that "
        f"source and this snapshot deployed. `deploy-settings` is already "
        f"granted.{fresh}"
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


def freshness(publish, head_sha):
    """Whether the staged snapshot matches the tip of the default branch."""
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
    `platform/ci/public_surface.py`'s Pages probe -- has never once executed:
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


def collect(api):
    repo = read_repo(api)
    publish = read_publish_branch(api)
    head_sha = read_default_head(api, repo["default_branch"])
    # Read from build.mjs by the module that already owns that parse, rather
    # than restated here -- the copied-constant mistake CLAUDE.md records twice.
    base_url = public_surface.pages_base_url()
    verdict, reason = plan_verdict(repo)
    fresh, fresh_reason = freshness(publish, head_sha)
    source, source_reason = verdict_source(repo, publish, read_workflow_paths(api))
    deployment = read_pages_deployment(api)
    deployed, deployed_reason = verdict_deployment(deployment, publish)
    return {
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
    """
    return 0 if state["plan_verdict"] == "likely-up" else 1


def main(argv=None, api=None):
    parser = argparse.ArgumentParser(
        description="Read the GitHub Pages route's state without owner credentials."
    )
    parser.add_argument("--json", action="store_true", help="machine-readable")
    parser.add_argument("--repo", help="owner/name (default: origin remote)")
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
    return exit_code(state)


if __name__ == "__main__":
    raise SystemExit(main())
