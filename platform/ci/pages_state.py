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
`/deployments`: all three are refused before they reach GitHub by the agent
egress proxy that Claude-on-the-web sessions run behind, and a tool whose
central call 403s in the environment that most needs it is the failure mode
`ci_starvation.py` had until it stopped requiring the `gh` CLI. Every call
here is one the plain repository object answers.

## The freshness half

A verdict about the route is not much use without knowing whether the artifact
behind it is current. The runner-free route serves the `gh-pages` branch, which
`platform/pages/publish-branch.sh` commits by hand -- a snapshot, so it goes
stale the moment `main` moves and nothing refreshes it. This tool reports the
commit `gh-pages` was built from and whether that commit is still the tip of
`main`, so "the flip is ready" and "the flip would publish a month-old
catalogue" are distinguishable at a glance.
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

REPO_PATH = f"repos/{REPO_PLACEHOLDER}"
BRANCH_PATH = f"repos/{REPO_PLACEHOLDER}/branches/{{branch}}"

PUBLISH_BRANCH = "gh-pages"

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


def collect(api):
    repo = read_repo(api)
    publish = read_publish_branch(api)
    head_sha = read_default_head(api, repo["default_branch"])
    verdict, reason = plan_verdict(repo)
    fresh, fresh_reason = freshness(publish, head_sha)
    return {
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
        f"  {PUBLISH_BRANCH} snapshot  {state['snapshot']}",
        f"                    {state['snapshot_reason']}",
    ]
    if state["plan_verdict"] == "likely-up":
        lines += [
            "",
            "  The flip, if the plan confirms: Settings -> Pages -> Source",
            "  'Deploy from a branch' -> gh-pages / (root). No Actions runner,",
            "  no k3s cluster, no secret.",
        ]
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
