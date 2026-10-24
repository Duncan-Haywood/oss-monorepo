#!/usr/bin/env python3
"""How much of the work here is spent on other sessions working at the same time?

Many agents (16 at once is normal) branch from the same `main` and merge back
into it. Each one that edits a file every other one also edits will conflict,
merge `main` back in, regenerate, and push again. This measures that cost
from git alone, so it can be re-read after a change meant to reduce it
(docs/parallel-agents.md has the reading of 2026-10-16 and the plan).

It reports, over a range of pull requests:

  * **merge-main rounds**: merge commits inside each PR's own history, that
    is, how often a branch had to take `main` back in before it could land;
  * **housekeeping commits**: the PR's own non-merge commits whose subject
    is regeneration, count syncing or conflict repair rather than the work;
  * **hotspots**: the files touched by the largest share of PRs that landed
    on `main` in the window. Any two PRs open at once that both touch one of
    these will conflict.

Reads `refs/pull/<n>/head` and `main` through the same commit-only probe as
`unlanded_work.py` (trees are fetched lazily for the hotspot pass only).

Usage:
  python3 platform/ci/concurrency_tax.py                     # last 14 days
  python3 platform/ci/concurrency_tax.py --since 2026-10-02 --first-pr 6800
  python3 platform/ci/concurrency_tax.py --local --since 2026-10-17 --first-pr 7800
"""
from __future__ import annotations

import argparse
import re
import sys
from collections import Counter
from datetime import date, timedelta

import unlanded_work as uw

HOUSEKEEPING = re.compile(
    r"regen|sync.*count|tree count|mirror|conflict|after merg|\bcounts?\b", re.I)
# A PR with more own commits than this is a repository import (the research
# mirror merges hundreds), not one session's work.
MAX_OWN_COMMITS = 50


def refresh_local(repo, since):
    """Fetch main and every PR head into this repository, trees and blobs lazily.

    One filtered fetch of the pull refs is far cheaper than refreshing a second
    clone (38 s for 8,350 refs in a cloud session), and `--shallow-since` keeps
    a shallow checkout from being deepened past the window.
    """
    cutoff = (date.fromisoformat(since) - timedelta(days=30)).isoformat()
    uw.git(["fetch", "--quiet", "--filter=blob:none", f"--shallow-since={cutoff}", "origin",
            "+refs/heads/main:refs/remotes/origin/main", "+refs/pull/*/head:refs/pull/*/head"],
           repo)


def refresh(repo, probe):
    url = uw.git(["remote", "get-url", "origin"], repo).strip()
    uw.refresh_probe(probe, url, ["+refs/heads/main:refs/remotes/origin/main"])


def pull_numbers(repo):
    """PR numbers with a ref, whether stored as refs/pull/<n> or refs/pull/<n>/head."""
    refs = uw.git(["for-each-ref", "--format=%(refname)", "refs/pull"], repo).split()
    return [int(r.split("/")[2]) for r in refs if r.split("/")[2].isdigit()]


def pr_rounds(probe, first, last, local=False):
    """[(n, own commits, merge-main rounds, housekeeping commits)]"""
    rows = []
    for n in range(first, last + 1):
        ref = f"refs/pull/{n}/head" if local else f"refs/pull/{n}"
        if not uw.git(["rev-parse", "-q", "--verify", ref], probe, check=False).strip():
            continue
        fork = uw.git(["merge-base", ref, "refs/remotes/origin/main"], probe, check=False).strip()
        if not fork:
            continue
        own = uw.git(["log", "--no-merges", "--format=%s", ref, f"^{fork}"], probe).splitlines()
        if len(own) > MAX_OWN_COMMITS:
            continue
        merges = int(uw.git(["rev-list", "--count", "--merges", ref, f"^{fork}"], probe).strip())
        rows.append((n, len(own), merges, sum(bool(HOUSEKEEPING.search(s)) for s in own)))
    return rows


def hotspots(probe, since):
    shas = uw.git(["log", "--first-parent", f"--since={since}", "--format=%H",
                   "refs/remotes/origin/main"], probe).split()
    files, prefixes = Counter(), Counter()
    for sha in shas:
        paths = uw.git(["diff-tree", "--no-commit-id", "--name-only", "-r", "-m",
                        "--first-parent", sha], probe).split()
        files.update(set(paths))
        prefixes.update({"/".join(p.split("/")[:2]) for p in paths})
    return len(shas), files, prefixes


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--repo", default=".")
    parser.add_argument("--since", default=(date.today() - timedelta(days=14)).isoformat())
    parser.add_argument("--first-pr", type=int, help="first PR number to sample (default: last 400)")
    parser.add_argument("--last-pr", type=int)
    parser.add_argument("--local", action="store_true",
                        help="read this repository instead of the probe clone (faster in a cloud session)")
    parser.add_argument("--top", type=int, default=12)
    args = parser.parse_args(argv)
    try:
        repo = uw.git(["rev-parse", "--show-toplevel"], args.repo).strip()
        if args.local:
            probe = repo
            refresh_local(repo, args.since)
        else:
            probe = uw.probe_path(repo)
            refresh(repo, probe)
        numbers = pull_numbers(probe)
        if not numbers and not args.last_pr:
            raise uw.GitError("no pull request refs to sample")
        last = args.last_pr or max(numbers)
        first = args.first_pr or max(1, last - 400)
        rows = pr_rounds(probe, first, last, local=args.local)
        landed, files, prefixes = hotspots(probe, args.since)
    except uw.GitError as exc:
        print(f"concurrency_tax: could not answer: {exc}", file=sys.stderr)
        return 2

    own = sum(r[1] for r in rows)
    merges = sum(r[2] for r in rows)
    chores = sum(r[3] for r in rows)
    print(f"concurrency_tax: PRs #{first}-#{last}: {len(rows)} sampled")
    print(f"  PRs that merged main back in at least once: "
          f"{sum(r[2] > 0 for r in rows)} ({100 * sum(r[2] > 0 for r in rows) / max(len(rows), 1):.0f}%)")
    print(f"  commits: {own} own + {merges} merge-main; {chores} of the own are housekeeping")
    print(f"  share of all commits that is concurrency tax (housekeeping + merge-main): "
          f"{100 * (chores + merges) / max(own + merges, 1):.0f}%")
    print(f"\n  {landed} PRs landed on main since {args.since}. Files the most of them touched:")
    for path, n in files.most_common(args.top):
        print(f"    {100 * n / landed:4.0f}%  {path}")
    print("  Top-level areas:")
    for path, n in prefixes.most_common(6):
        print(f"    {100 * n / landed:4.0f}%  {path}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
