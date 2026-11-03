#!/usr/bin/env python3
"""Guard the control plane: the files that steer every later agent.

Why this exists
---------------
Several agent families push to this repo, and the files that tell them what to
do (CLAUDE.md, prompts/), what to run on their own at session start
(.claude/settings.json hooks, .mcp.json), and what may merge (.github/,
platform/ci/agent_review/config.yaml) live in the same tree they edit. One
merged PR from a misbehaving agent could rewrite all of it for every session
after. `.github/CODEOWNERS` lists those paths, and the `main` ruleset's "Require
review from Code Owners" makes GitHub refuse to merge a change to them without
the owner's approval. This script backs that up in three ways:

  --check-coverage   fail if CODEOWNERS stops owning a path it must own, or
                     starts owning the run-data paths agents write every run
                     (a weakened CODEOWNERS is the first thing a rogue edit
                     would try, and the ruleset cannot notice it);
  --pr N             list the owned files a PR touches in the job summary, so
                     the reason it is waiting for the owner is visible;
  --audit-commit SHA after a push to main, fail if the commit touched owned
                     files without an owner's approving review (catches admin
                     bypasses, and the time before the ruleset is applied).

Standard library only; --pr and --audit-commit read the GitHub API with
GITHUB_TOKEN (read-only) and GITHUB_REPOSITORY. Setup and reasoning:
docs/security/agent-hardening.md.

    python3 platform/ci/control_plane_guard.py --check-coverage
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CODEOWNERS = REPO_ROOT / ".github" / "CODEOWNERS"
API = os.environ.get("GITHUB_API_URL", "https://api.github.com")

# Sample paths, not patterns: each must resolve to an owner (or to none).
MUST_BE_OWNED = [
    "CLAUDE.md",
    "AGENTS.md",
    "prompt.md",
    "ventures/CLAUDE.md",
    "research/CLAUDE.md",
    "prompts/goals.md",
    "prompts/promptctl.py",
    ".claude/settings.json",
    ".claude/hooks/block_pkill_f.py",
    ".cursor/environment.json",
    ".mcp.json",
    "platform/agents/tools.mjs",
    ".github/CODEOWNERS",
    ".github/rulesets/main.json",
    ".github/workflows/agent-pr-auto-merge.yml",
    ".github/prompts/land-your-work.md",
    "platform/ci/agent_review/config.yaml",
    "platform/ci/agent_review/review.py",
    "platform/ci/control_plane_guard.py",
    "portfolio/router/requirements.txt",
]
MUST_BE_UNOWNED = [
    "prompts/runs/2026-10-30-session_x.json",
    "prompts/derived/runs.json",
    "docs/posts/2026-10-30-example.md",
    "ventures/example/src/index.mjs",
]


def pattern_regex(pattern: str) -> re.Pattern[str]:
    """CODEOWNERS uses gitignore-style patterns; this covers the subset GitHub
    documents (anchoring, trailing-slash directories, `*`, `**`, `?`)."""
    anchored = pattern.startswith("/") or "/" in pattern.rstrip("/")
    body = pattern.strip("/")
    dir_only = pattern.endswith("/")
    out, i = [], 0
    while i < len(body):
        if body.startswith("**/", i):
            out.append("(?:.*/)?")
            i += 3
        elif body.startswith("/**", i) and i + 3 == len(body):
            out.append("/.*")
            i += 3
        elif body[i] == "*":
            out.append("[^/]*")
            i += 1
        elif body[i] == "?":
            out.append("[^/]")
            i += 1
        else:
            out.append(re.escape(body[i]))
            i += 1
    prefix = "^" if anchored else "^(?:.*/)?"
    suffix = "/.*$" if dir_only else "(?:/.*)?$"
    return re.compile(prefix + "".join(out) + suffix)


def parse_codeowners(text: str) -> list[tuple[re.Pattern[str], list[str]]]:
    rules = []
    for line in text.splitlines():
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        pattern, *owners = line.split()
        rules.append((pattern_regex(pattern), owners))
    return rules


def owners_for(path: str, rules) -> list[str]:
    """The last matching rule wins, as on GitHub; an owner-less rule unowns."""
    found: list[str] = []
    for regex, owners in rules:
        if regex.match(path):
            found = owners
    return found


def owner_logins(rules) -> set[str]:
    """Individual owners only; team owners (`@org/team`) are not logins."""
    return {
        o.lstrip("@").lower()
        for _, owners in rules
        for o in owners
        if o.startswith("@") and "/" not in o
    }


def check_coverage(rules) -> list[str]:
    problems = [f"{p} has no code owner" for p in MUST_BE_OWNED if not owners_for(p, rules)]
    problems += [
        f"{p} is owned by {' '.join(owners_for(p, rules))}; agents write it every run"
        for p in MUST_BE_UNOWNED
        if owners_for(p, rules)
    ]
    return problems


def gh_get(path: str) -> object:
    req = urllib.request.Request(
        f"{API}{path}",
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def gh_pages(path: str, limit: int = 30) -> list:
    items: list = []
    sep = "&" if "?" in path else "?"
    for page in range(1, limit + 1):
        batch = gh_get(f"{path}{sep}per_page=100&page={page}")
        items += batch
        if len(batch) < 100:
            break
    return items


def owned(files: list[str], rules) -> list[str]:
    return [f for f in files if owners_for(f, rules)]


def audit_verdict(touched: list[str], pr: dict | None, reviews: list, logins: set[str]):
    """Return (exit_code, message) for one commit on main."""
    if not touched:
        return 0, "no control-plane files touched"
    listing = "\n".join(f"  - {f}" for f in touched)
    if pr is None:
        return 1, f"pushed to main without a pull request, touching:\n{listing}"
    approvers = {
        r["user"]["login"].lower()
        for r in reviews
        if r.get("state") == "APPROVED" and r.get("user")
    }
    if approvers & logins:
        return 0, f"PR #{pr['number']}: owner approved {len(touched)} control-plane file(s)"
    author = (pr.get("user") or {}).get("login", "").lower()
    if author in logins:
        # Agents that push with the owner's own token look exactly like the
        # owner. Warn rather than fail until they have their own identities
        # (docs/security/agent-hardening.md, step 1).
        return 0, (
            f"::warning::PR #{pr['number']} changed control-plane files under the owner's own "
            f"identity with no separate approval; if an agent used that identity this was "
            f"unreviewed:\n{listing}"
        )
    return 1, f"PR #{pr['number']} by {author} merged control-plane changes without owner approval:\n{listing}"


def summarize(text: str) -> None:
    out = os.environ.get("GITHUB_STEP_SUMMARY")
    if out:
        with open(out, "a", encoding="utf-8") as fh:
            fh.write(text + "\n")
    print(text)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check-coverage", action="store_true")
    mode.add_argument("--pr", type=int)
    mode.add_argument("--audit-commit")
    args = ap.parse_args(argv)

    rules = parse_codeowners(CODEOWNERS.read_text(encoding="utf-8"))

    if args.check_coverage:
        problems = check_coverage(rules)
        for p in problems:
            print(f"::error file=.github/CODEOWNERS::{p}")
        if not problems:
            print(f"CODEOWNERS covers all {len(MUST_BE_OWNED)} control-plane samples")
        return 1 if problems else 0

    repo = os.environ["GITHUB_REPOSITORY"]
    if args.pr:
        files = [f["filename"] for f in gh_pages(f"/repos/{repo}/pulls/{args.pr}/files")]
        touched = owned(files, rules)
        if touched:
            summarize(
                "### Control-plane files in this PR\n\nThese need the code owner's approval "
                "before `main` accepts them (.github/CODEOWNERS):\n\n"
                + "\n".join(f"- `{f}`" for f in touched)
            )
        else:
            print("no control-plane files touched")
        return 0

    sha = args.audit_commit
    files = [f["filename"] for f in gh_get(f"/repos/{repo}/commits/{sha}").get("files", [])]
    prs = [p for p in gh_get(f"/repos/{repo}/commits/{sha}/pulls") if p.get("merged_at")]
    pr = prs[0] if prs else None
    reviews = gh_pages(f"/repos/{repo}/pulls/{pr['number']}/reviews") if pr else []
    code, message = audit_verdict(owned(files, rules), pr, reviews, owner_logins(rules))
    if code:
        print(f"::error::{message.splitlines()[0]}")
    summarize(message)
    return code


if __name__ == "__main__":
    sys.exit(main())
