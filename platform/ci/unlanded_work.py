#!/usr/bin/env python3
"""Is the work on this branch in a pull request, or only on a branch nobody reads?

## Why this exists

Work here counts when it is on `main`. Opened pull requests do get there:
in the two weeks to 2026-10-05, 1,251 merged and 23 were closed unmerged.
The leak is one step earlier. Measured that day over branch tips dated
2026-09-21 onward: **102 branches held 186 commits that were in no pull
request and not on `main`**, and 100 of those branches had never had a pull
request at all (the other two kept pushing after theirs closed). Among them
are four complete, tested ventures that `main` still does not have:
`sep-ira-contribution-calculator`, `recipe-costing-calculator`,
`s3-bucket-exposure-check` and `agent-permission-config-check`. Each was built,
committed and pushed, and then the session ended.

Nothing reported it, for a structural reason. Every guard in this repository
runs on a pull request or on `main`, so a branch with no PR is invisible to all
of them. `branch_cleanup.py` keys on a PR as well, so it never sees these
branches -- and a branch that moved after its PR closed it deliberately keeps
("branch has moved"). `git branch -r` lists ~1,200 refs, nearly all of them
spent. So the session that stops at `git push` gets the same silence as one
that shipped, and the next session cannot tell the difference either.

This is that silence turned into an exit code, the same move
`pages_state.py --require-current` makes against a stale snapshot.

## What it reads

Only git -- no token, no API. Two facts GitHub publishes through the ordinary
git protocol settle it:

  * `refs/heads/*` -- what each branch points at.
  * `refs/pull/<n>/head` -- the head of every pull request ever opened, open or
    closed. While a PR is open GitHub moves this ref with its branch; once it
    is merged or closed the ref stays where the PR ended.

A commit is **stranded** when it is reachable from the branch, not from
`main`, and not from any `refs/pull/*/head`: nobody can find it except by
already knowing the branch name. Merge commits are not counted -- a
"merge origin/main into my branch" carries nothing of its own. Squash merges
need no special case: the branch's commits stay off `main`, but they are
reachable from the PR's head ref, so they are not stranded.

The commit graph comes from a commit-only partial clone (`--filter=tree:0`)
kept beside your repository's `.git`, so it needs no history in your checkout
-- shallow web-session clones included -- and costs a few seconds.

## What it does not claim

Exit 0 means **nothing on this branch is stranded**: every commit is on `main`
or in some pull request. It does not mean that pull request is merged -- git
alone cannot see that. The report names the PR that carries your tip; merging
it is still your job (`.github/prompts/land-your-work.md`).

Usage:
  python3 platform/ci/unlanded_work.py                   # this branch; exit 1 = open a PR
  python3 platform/ci/unlanded_work.py --sweep           # every branch, tips from the last 14 days
  python3 platform/ci/unlanded_work.py --sweep --since 2026-09-01

Exit status: 0 nothing stranded, 1 stranded or unpushed work, 2 could not
answer (detached HEAD, no remote, fetch failed).
"""
from __future__ import annotations

import argparse
import os
import signal
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

PROBE_DIRNAME = "unlanded-probe.git"
DEFAULT_SINCE_DAYS = 14
# Branches that are never anyone's unlanded work.
NOT_WORK_BRANCHES = ("gh-pages",)
# Prefixes of branches that only preserve history, such as the copies of
# oss-research-monorepo's branches (research/_mirror/archive.py).
NOT_WORK_PREFIXES = ("archive/",)
LIST_LIMIT = 10


class GitError(RuntimeError):
    pass


def git(args, cwd, check=True):
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0")
    proc = subprocess.run(
        ["git", *args], cwd=cwd, capture_output=True, text=True, env=env
    )
    if check and proc.returncode != 0:
        raise GitError(f"git {' '.join(args)}: {proc.stderr.strip()}")
    return proc.stdout


@dataclass
class Commit:
    sha: str
    day: str
    subject: str


@dataclass
class Report:
    branch: str
    problems: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    stranded: list[Commit] = field(default_factory=list)

    @property
    def exit_code(self):
        return 1 if self.problems else 0


def remote_refs(repo, remote):
    """(branch -> sha, sha -> [PR numbers]) as the remote advertises them."""
    out = git(["ls-remote", remote, "refs/heads/*", "refs/pull/*/head"], repo)
    heads, pulls = {}, {}
    for line in out.splitlines():
        sha, _, ref = line.partition("\t")
        if ref.startswith("refs/heads/"):
            heads[ref[len("refs/heads/"):]] = sha
        elif ref.startswith("refs/pull/") and ref.endswith("/head"):
            number = ref[len("refs/pull/"):-len("/head")]
            if number.isdigit():
                pulls.setdefault(sha, []).append(int(number))
    return heads, pulls


def probe_path(repo):
    common = git(["rev-parse", "--git-common-dir"], repo).strip()
    return (Path(repo) / common).resolve() / PROBE_DIRNAME


def refresh_probe(probe, url, branch_refspecs, prune=False):
    """Fetch commits only (no trees, no blobs) for `main`, every PR head, and
    the given branches into a bare repository at `probe`."""
    if not (probe / "HEAD").exists():
        probe.mkdir(parents=True, exist_ok=True)
        git(["init", "-q", "--bare", str(probe)], probe)
    git(["config", "remote.origin.url", url], probe)
    git(["config", "remote.origin.promisor", "true"], probe)
    git(["config", "remote.origin.partialclonefilter", "tree:0"], probe)
    args = ["fetch", "-q", "--no-tags", "--filter=tree:0"]
    if prune:
        args.append("--prune")
    git(args + ["origin", "+refs/pull/*/head:refs/pull/*", *branch_refspecs], probe)


def stranded_commits(probe, tip_ref, base_ref):
    """Non-merge commits reachable from tip_ref but from neither base_ref nor
    any pull request head, newest first."""
    out = git(
        ["log", "--no-merges", "--format=%H%x09%cs%x09%s", tip_ref,
         "--not", base_ref, "--glob=refs/pull/*"],
        probe,
    )
    commits = []
    for line in out.splitlines():
        sha, day, subject = (line.split("\t", 2) + ["", ""])[:3]
        commits.append(Commit(sha, day, subject))
    return commits


def earlier_prs(probe, tip_ref, base_ref):
    """PRs whose head is in this branch's history but not in base's: the PRs
    this branch has already had."""
    out = git(
        ["for-each-ref", "--format=%(refname)", f"--merged={tip_ref}",
         f"--no-merged={base_ref}", "refs/pull"],
        probe,
    )
    numbers = []
    for ref in out.split():
        tail = ref.rsplit("/", 1)[-1]
        if tail.isdigit():
            numbers.append(int(tail))
    return sorted(numbers)


def is_ancestor(probe, tip_ref, base_ref):
    """True when every commit on tip_ref is already on base_ref."""
    proc = subprocess.run(
        ["git", "merge-base", "--is-ancestor", tip_ref, base_ref],
        cwd=probe, capture_output=True, text=True,
        env=dict(os.environ, GIT_TERMINAL_PROMPT="0"),
    )
    return proc.returncode == 0


def uncommitted_paths(repo):
    out = git(["status", "--porcelain", "--untracked-files=normal"], repo)
    return [line[3:] for line in out.splitlines() if line.strip()]


def check_branch(repo, remote="origin", base="main", probe=None):
    branch = git(["symbolic-ref", "--short", "-q", "HEAD"], repo, check=False).strip()
    if not branch:
        raise GitError("HEAD is detached; check out your work branch first")
    report = Report(branch)
    if branch == base:
        raise GitError(f"you are on {base}; run this on the branch you worked on")

    dirty = uncommitted_paths(repo)
    if dirty:
        shown = ", ".join(dirty[:LIST_LIMIT]) + (" ..." if len(dirty) > LIST_LIMIT else "")
        report.problems.append(
            f"{len(dirty)} uncommitted path(s): {shown}\n"
            "    Commit them (or delete them if they are scratch files), then re-run."
        )

    url = git(["remote", "get-url", remote], repo).strip()
    heads, pulls = remote_refs(repo, remote)
    local_tip = git(["rev-parse", "HEAD"], repo).strip()
    remote_tip = heads.get(branch)

    if remote_tip is None:
        if local_tip == heads.get(base):
            report.notes.append(f"{branch} has no commits of its own yet; nothing to land.")
        else:
            report.problems.append(
                f"{branch} is not on {remote}.\n"
                f"    git push -u {remote} {branch}   -- then open a pull request for it."
            )
        return report
    if remote_tip != local_tip:
        report.problems.append(
            f"local {branch} is at {local_tip[:9]} but {remote}/{branch} is at "
            f"{remote_tip[:9]}.\n"
            f"    Push your commits (git push {remote} {branch}), or pull if someone "
            "else pushed, then re-run."
        )
        return report

    probe = probe or probe_path(repo)
    refresh_probe(
        probe, url,
        [f"+refs/heads/{base}:refs/remotes/origin/{base}",
         f"+refs/heads/{branch}:refs/remotes/origin/{branch}"],
    )
    tip_ref = f"refs/remotes/origin/{branch}"
    base_ref = f"refs/remotes/origin/{base}"
    report.stranded = stranded_commits(probe, tip_ref, base_ref)
    carrying = sorted(pulls.get(remote_tip, []))

    if report.stranded:
        lines = [
            f"{len(report.stranded)} commit(s) on {branch} are in no pull request "
            f"and not on {base}:"
        ]
        lines += [
            f"      {c.sha[:9]} {c.day} {c.subject[:90]}"
            for c in report.stranded[:LIST_LIMIT]
        ]
        if len(report.stranded) > LIST_LIMIT:
            lines.append(f"      ... and {len(report.stranded) - LIST_LIMIT} more")
        before = earlier_prs(probe, tip_ref, base_ref)
        if before:
            lines.append(
                f"    This branch already had PR #{before[-1]}, which no longer "
                "tracks it (merged or closed), so these commits came after it.\n"
                f"    Open a NEW pull request from {branch}; do not assume "
                f"#{before[-1]} carries them."
            )
        else:
            lines.append(f"    Open a pull request from {branch}, verify it, and merge it.")
        report.problems.append("\n".join(lines))
    elif is_ancestor(probe, tip_ref, base_ref):
        # Nothing is lost, so not a problem -- but this push recreated a
        # spent branch (872 of 875 surviving merged-PR branches, 2026-10-16).
        report.notes.append(
            f"{remote}/{branch} holds nothing beyond {base}: it was pushed with no "
            "new commit (often a reset to main after a merge).\n"
            "  Do not push a spent branch; push it again only with a new commit, "
            "and open a new PR. branch_cleanup.py deletes it otherwise."
        )
    elif carrying:
        prs = ", ".join(f"#{n}" for n in carrying)
        report.notes.append(
            f"PR {prs} carries this tip. Nothing is stranded -- but git cannot see "
            "whether it is merged. If it is open and green, merge it now."
        )
    else:
        report.notes.append(f"Every commit on {branch} is on {base} or in a pull request.")
    return report


def sweep(repo, remote="origin", base="main", since=None, probe=None):
    """[(day, branch, stranded commits, earlier PRs)] for every remote branch
    whose tip is dated on or after `since` and carries stranded work."""
    url = git(["remote", "get-url", remote], repo).strip()
    heads, pulls = remote_refs(repo, remote)
    probe = probe or probe_path(repo)
    refresh_probe(probe, url, ["+refs/heads/*:refs/remotes/origin/*"], prune=True)
    base_ref = f"refs/remotes/origin/{base}"
    dated = git(
        ["for-each-ref",
         "--format=%(objectname)\t%(committerdate:short)\t%(refname:lstrip=3)",
         "refs/remotes/origin"],
        probe,
    )
    tips = {}
    for line in dated.splitlines():
        sha, day, branch = line.split("\t", 2)
        if (branch in (base, "HEAD") or branch in NOT_WORK_BRANCHES
                or branch.startswith(NOT_WORK_PREFIXES)):
            continue
        if since and day < since:
            continue
        # A tip that is itself some PR's head has nothing stranded above it.
        if sha in pulls or heads.get(branch) in pulls:
            continue
        tips[branch] = (sha, day)
    if not tips:
        return []

    # One walk over the union, not one per branch: excluding ~6,000 PR heads
    # costs the same for one tip as for a thousand, and per-branch it took
    # minutes. Each branch's share is then a walk of this small graph.
    out = git(
        ["log", "--format=%H%x09%P%x09%cs%x09%s",
         *(f"refs/remotes/origin/{b}" for b in tips),
         "--not", base_ref, "--glob=refs/pull/*"],
        probe,
    )
    graph = {}
    for line in out.splitlines():
        sha, parents, day, subject = (line.split("\t", 3) + ["", "", ""])[:4]
        graph[sha] = (parents.split(), Commit(sha, day, subject))

    found = []
    for branch, (tip, day) in tips.items():
        seen, stack, commits, before = set(), [tip], [], set()
        while stack:
            sha = stack.pop()
            if sha in seen:
                continue
            seen.add(sha)
            if sha not in graph:
                # The walk's edge. If it stops on a PR's head, the branch kept
                # going after that PR -- the "pushed after it merged" shape.
                # (`earlier_prs` answers this exactly, but costs ~0.4s a
                # branch against ~6,000 refs; the edge is free.)
                before.update(pulls.get(sha, []))
                continue
            parents, commit = graph[sha]
            if len(parents) <= 1:
                commits.append(commit)
            stack.extend(parents)
        if commits:
            commits.sort(key=lambda c: c.day, reverse=True)
            found.append((day, branch, commits, sorted(before)))
    found.sort(key=lambda row: (row[0], row[1]), reverse=True)
    return found


def print_report(report):
    status = "STRANDED" if report.problems else "ok"
    print(f"unlanded_work: {report.branch}: {status}")
    for problem in report.problems:
        print(f"  - {problem}")
    for note in report.notes:
        print(f"  {note}")
    if report.problems:
        print(
            "\nA pushed branch with no pull request is invisible to every check, to "
            "branch cleanup,\nand to the next session. See "
            ".github/prompts/land-your-work.md."
        )


def print_sweep(found, since):
    total = sum(len(row[2]) for row in found)
    print(
        f"unlanded_work --sweep: {len(found)} branch(es) carry {total} commit(s) "
        f"in no pull request and not on main (tips since {since or 'ever'})"
    )
    for day, branch, commits, before in found:
        after = f", after PR #{before[-1]}" if before else ""
        print(f"  {day}  {branch}  {len(commits)} commit(s){after}")
        print(f"      {commits[0].subject[:100]}")
    if found:
        print(
            "\nBefore landing one: read it. A tip saying 'not for merge' or 'parked' "
            "was left on purpose,\nand a new venture may duplicate one already on "
            "main (portfolio/pipeline/duplicate_check.py)."
        )


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--sweep", action="store_true",
                        help="report every remote branch carrying stranded commits")
    parser.add_argument("--since", help="with --sweep: only tips dated on/after YYYY-MM-DD "
                        f"(default: {DEFAULT_SINCE_DAYS} days ago; 'all' for no limit)")
    parser.add_argument("--remote", default="origin")
    parser.add_argument("--base", default="main")
    parser.add_argument("--repo", default=".")
    args = parser.parse_args(argv)
    if hasattr(signal, "SIGPIPE"):
        # `--sweep | head` should stop quietly, not with a traceback.
        signal.signal(signal.SIGPIPE, signal.SIG_DFL)

    try:
        repo = git(["rev-parse", "--show-toplevel"], args.repo).strip()
        if args.sweep:
            since = args.since or (date.today() - timedelta(days=DEFAULT_SINCE_DAYS)).isoformat()
            if since == "all":
                since = None
            print_sweep(sweep(repo, args.remote, args.base, since), since)
            return 0
        report = check_branch(repo, args.remote, args.base)
    except GitError as exc:
        print(f"unlanded_work: could not answer: {exc}", file=sys.stderr)
        return 2
    print_report(report)
    return report.exit_code


if __name__ == "__main__":
    sys.exit(main())
