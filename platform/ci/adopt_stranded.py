#!/usr/bin/env python3
"""Open a draft pull request for every branch a session pushed and then left.

## Why this exists

`unlanded_work.py` finds pushed commits that are in no pull request and not on
`main`. It runs inside a session, so it only helps when that session reaches
the end of its own checklist. The sessions that leave branches behind are the
ones that don't: they hit the tool limit, their container is reclaimed, or they
stop at `git push`. Nobody runs a check on their behalf, so the branch stays
invisible to CI, to the review layer, to branch cleanup and to the next session.

Measured on 2026-10-15 with `unlanded_work.py --sweep`: 9 branches in this
repository (tips since 2026-10-01) and 32 in `oss-research-monorepo` (tips
since 2026-09-15) carried commits in no pull request. Among them were a
link fix for a CI failure on `main` and a finished research project.

This script is the missing step, run on a schedule instead of by the session
that died: it turns each stranded branch into a **draft** pull request. Once a
branch has a PR, every process that already works on PRs takes over: the next
session's "land before you build" queue, the reviewers, auto-merge, and
`branch_cleanup.py` if it is closed.

## What it skips, and says so

  * a tip newer than `--min-age-hours` (default 6): its session may still be
    working on it;
  * a branch whose stranded commits only touch run logs or derived files
    (`DERIVED_GLOBS`: the regenerated mirror, ledger notes, state readings):
    `main` has moved since, so the next regen or reading supersedes them, and
    `oss-research-monorepo/prompt.md` says to leave run-log branches alone;
  * a branch whose authored files already match `main` byte for byte: the
    work landed through another PR;
  * a branch with more than `--max-files` unlanded files: a tree-wide
    migration or stale fork, too big for a draft anyone could review;
  * a branch where `main` has since rewritten every file it touched: almost
    always a stale housekeeping commit (the skip line names the files, so a
    real fix in a busy file is still visible to whoever reads the log).

What is left is a branch with at least one file only it has changed since it
left `main` -- a new venture, a new page, a fix nobody else made.
  * a branch whose commit says it was left on purpose ("do not merge",
    "not for merge", "parked");
  * a second branch for the same venture or research project (`area_key`):
    only the newest tip, or the draft already open for that area, gets a PR,
    and that PR's body names the siblings to compare.

## Sibling drafts, and closing the losers (`--reap`)

Sessions that die mid-task are often re-run, so one task can strand two or
three branches: on 2026-10-16 the four batches opened 38 drafts, among them
two comparison pages each for `pool-plaster-bid-calculator` and
`actions-permissions-check`, and nothing ever closed one. By 2026-10-24 all 38
were still open, and 35 had nothing left that `main` lacked or had not
rewritten. So the job now opens one draft per area, and `--reap` closes an
adopted draft once the same rule that would skip it today holds: none of its
authored files is still unlanded (each one matches `main`, or `main` has
rewritten it since the branch forked). It leaves alone a draft someone has
pushed to or marked ready, and its comment names the PR that last changed
those files on `main` when the API says.

It opens draft PRs only. It pushes nothing, merges nothing, closes nothing and
calls no paid API: one GitHub REST call per PR it opens, at most `--max-open`
per run.

A PR opened with the workflow's `GITHUB_TOKEN` does not start other workflows
(GitHub's rule), so its CI runs once someone pushes to the branch. The PR body
says so.

Usage:
  python3 platform/ci/adopt_stranded.py                       # plan only, prints what it would open
  python3 platform/ci/adopt_stranded.py --repo ../oss-research-monorepo
  GITHUB_TOKEN=... python3 platform/ci/adopt_stranded.py --apply --github-repo owner/name

Exit status: 0 done (plan printed or PRs opened), 1 some PR failed to open,
2 could not answer (no remote, fetch failed, no token for --apply).
"""
from __future__ import annotations

import argparse
import fnmatch
import json
import os
import re
import signal
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

import unlanded_work as uw

DEFAULT_MIN_AGE_HOURS = 6
DEFAULT_SINCE_DAYS = 14
DEFAULT_MAX_OPEN = 10
DEFAULT_MAX_CLOSE = 40
# Past this many unlanded files a branch is a migration or a stale fork of the
# whole tree (measured: "Move 253 calculator ventures", 4,714 files), not one
# session's work, and a draft PR of it would be unreviewable.
DEFAULT_MAX_FILES = 300
RUN_LOG_GLOBS = ("prompts/runs.jsonl", "prompts/runs/*")
# Files a session rewrites from `main` rather than authors: run logs, the
# regenerated front-door mirror and its counts, ledger notes and state readings.
# A branch that only changed these is stale the moment `main` moves -- the next
# regen or reading supersedes it -- so adopting it buys a PR nobody should merge.
DERIVED_GLOBS = RUN_LOG_GLOBS + (
    "gitops/prod/*", "gitops/ci/README.md", "portfolio/ledger/*", "platform/ci/*_state.json",
)
PATH_CHUNK = 400
LEFT_ON_PURPOSE = re.compile(r"do not merge|don't merge|not for merge|\bparked\b", re.I)
TITLE_LIMIT = 200
TITLE_PREFIX = "Adopt stranded branch "
ADOPTER_LOGIN = "github-actions[bot]"
# A path's "area" is the unit one task works in: a venture or research project
# directory. Two stranded branches whose unlanded files sit in the same single
# area are almost always two attempts at one task (measured 2026-10-24: every
# same-venture pair among the 38 adopted drafts was).
AREA_ROOTS = ("ventures", "research")
# GitHub's 403 text when the repository forbids Actions from opening PRs.
ACTIONS_MAY_NOT_OPEN_PRS = "not permitted to create or approve pull requests"
ACTIONS_SETTING_REMEDY = (
    "adopt_stranded: this repository does not let GitHub Actions open pull requests.\n"
    "  Owner, once: Settings -> Actions -> General -> Workflow permissions -> tick\n"
    "  'Allow GitHub Actions to create and approve pull requests'. Until then, a session\n"
    "  can run this script without --apply and open the listed PRs itself."
)


@dataclass
class Candidate:
    branch: str
    day: str
    commits: list
    earlier_prs: list
    files: list = field(default_factory=list)
    age_hours: float = 0.0
    skip: str = ""  # why it is not adopted; empty means adopt
    siblings: list = field(default_factory=list)  # same-area branches it won over

    def title(self):
        subject = self.commits[0].subject.strip() or self.branch
        return f"Adopt stranded branch {self.branch}: {subject}"[:TITLE_LIMIT]

    def body(self):
        lines = [
            "This branch was pushed to the repository and then left without a pull "
            "request, so nothing could see it. `platform/ci/adopt_stranded.py` "
            "opened this draft so the work is not lost.",
            "",
            f"**{len(self.commits)} commit(s) not on `main` and in no other pull request:**",
            "",
        ]
        lines += [f"- `{c.sha[:9]}` {c.day} {c.subject[:120]}" for c in self.commits[:20]]
        if len(self.commits) > 20:
            lines.append(f"- ... and {len(self.commits) - 20} more")
        shown = ", ".join(f"`{f}`" for f in self.files[:8])
        more = f" and {len(self.files) - 8} more" if len(self.files) > 8 else ""
        lines += ["", f"**{len(self.files)} file(s) only this branch has changed since it left `main`:** "
                      f"{shown}{more}"]
        if self.siblings:
            lines += ["", "**Other stranded branches for the same area** (not opened as PRs, "
                          "so there is one draft per task): "
                          + ", ".join(f"`{b}`" for b in self.siblings)
                          + ". Compare them before landing this one."]
        if self.earlier_prs:
            lines += ["", f"These came after PR #{self.earlier_prs[-1]}, which no longer "
                          "tracks the branch."]
        lines += [
            "",
            "**Next session:** read it first. If the work is wanted, merge `main` into "
            "the branch, verify it, mark it ready and merge it. If `main` already has "
            "it under another name, or it is not wanted, close it with a one-line "
            "reason (`portfolio/ledger/supersede_check.py` and "
            "`portfolio/pipeline/duplicate_check.py` help decide).",
            "",
            "CI has not run here yet: GitHub does not start workflows for pull requests "
            "opened by Actions. The first push to the branch starts it.",
        ]
        return "\n".join(lines)


def changed_files(probe, branch, base):
    out = uw.git(
        ["log", "--no-merges", "--name-only", "--format=", f"refs/remotes/origin/{branch}",
         "--not", f"refs/remotes/origin/{base}", "--glob=refs/pull/*"],
        probe,
    )
    return sorted({line for line in out.splitlines() if line.strip()})


def tip_age_hours(probe, branch, now):
    stamp = uw.git(["log", "-1", "--format=%ct", f"refs/remotes/origin/{branch}"], probe).strip()
    return (now - int(stamp)) / 3600


def is_derived(path, globs=DERIVED_GLOBS):
    return any(fnmatch.fnmatch(path, g) for g in globs)


def blobs(probe, ref, paths):
    """{path: blob id} at ref, for those of `paths` that exist there."""
    found = {}
    for i in range(0, len(paths), PATH_CHUNK):
        out = uw.git(["ls-tree", "-r", ref, "--", *paths[i:i + PATH_CHUNK]], probe)
        for line in out.splitlines():
            meta, _, path = line.partition("\t")
            found[path] = meta.split()[2]
    return found


def area_key(paths):
    """The one venture or research directory all `paths` sit in, else None."""
    areas = set()
    for path in paths:
        parts = path.split("/")
        if len(parts) < 3 or parts[0] not in AREA_ROOTS:
            return None
        areas.add("/".join(parts[:2]))
    return areas.pop() if len(areas) == 1 else None


def classify_paths(probe, branch, base, paths, tip_ref=None):
    """Three-way compare each path: where the branch forked from `main`, the
    branch tip, and `main` now. Returns (unlanded, contested):

      tip == main            landed (another PR carried it): neither list
      main == fork point     only the branch changed it: unlanded
      otherwise              both changed it since the fork: contested

    `contested` is what an old housekeeping branch looks like -- `main` has
    rewritten every shared file it touched -- and also what a real fix in a
    busy file looks like, which is why a contested-only branch is skipped
    with the files named rather than adopted or dropped silently.
    """
    tip_ref = tip_ref or f"refs/remotes/origin/{branch}"
    base_ref = f"refs/remotes/origin/{base}"
    fork = uw.git(["merge-base", tip_ref, base_ref], probe, check=False).strip()
    tip, main = blobs(probe, tip_ref, paths), blobs(probe, base_ref, paths)
    forked = blobs(probe, fork, paths) if fork else {}
    unlanded, contested = [], []
    for path in paths:
        if tip.get(path) == main.get(path):
            continue
        (unlanded if main.get(path) == forked.get(path) else contested).append(path)
    return unlanded, contested


def plan(repo, remote="origin", base="main", since=None, min_age_hours=DEFAULT_MIN_AGE_HOURS,
         probe=None, now=None, derived=DERIVED_GLOBS, max_files=DEFAULT_MAX_FILES,
         adopted=()):
    """`adopted` lists the open drafts this job opened earlier (`list_adopted`);
    an area one of them covers gets no second draft."""
    probe = probe or uw.probe_path(repo)
    now = now if now is not None else time.time()
    candidates = []
    for day, branch, commits, before in uw.sweep(repo, remote, base, since, probe=probe):
        cand = Candidate(branch, day, commits, before)
        cand.age_hours = tip_age_hours(probe, branch, now)
        if cand.age_hours < min_age_hours:
            cand.skip = f"tip is {cand.age_hours:.1f}h old; its session may still be working"
        elif any(LEFT_ON_PURPOSE.search(c.subject) for c in commits):
            cand.skip = "a commit says it was left on purpose"
        else:
            authored = [f for f in changed_files(probe, branch, base) if not is_derived(f, derived)]
            if not authored:
                cand.skip = "only run logs or derived files; main has moved past them"
            else:
                cand.files, contested = classify_paths(probe, branch, base, authored)
                if not cand.files and not contested:
                    cand.skip = "its authored files already match main"
                elif not cand.files:
                    shown = ", ".join(contested[:3]) + (" ..." if len(contested) > 3 else "")
                    cand.skip = ("main has changed every file it touched since; probably "
                                 f"superseded (read by hand if it matters: {shown})")
                elif len(cand.files) > max_files:
                    cand.skip = (f"{len(cand.files)} unlanded files: a migration or a stale "
                                 "copy of the tree, not one session's work; read it by hand")
        candidates.append(cand)
    one_per_area(candidates, claimed_areas(probe, adopted, base) if adopted else None)
    return candidates


def one_per_area(candidates, claimed=None):
    """Keep the newest adoptable candidate per area; skip the rest, naming the
    winner, and list them on the winner so its PR says what to compare."""
    owner = dict(claimed or {})
    winners = {}
    for cand in sorted((c for c in candidates if not c.skip), key=lambda c: c.age_hours):
        key = area_key(cand.files)
        if key is None:
            continue
        if key in owner:
            cand.skip = f"same area ({key}) as {owner[key]}: one draft per task"
            if key in winners:
                winners[key].siblings.append(cand.branch)
            continue
        owner[key], winners[key] = cand.branch, cand


@dataclass
class Adopted:
    """An open pull request this job opened."""
    number: int
    branch: str
    created: float  # epoch seconds
    draft: bool = True


def authored_paths(probe, tip_ref, base, derived=DERIVED_GLOBS):
    fork = uw.git(["merge-base", tip_ref, f"refs/remotes/origin/{base}"], probe, check=False).strip()
    if not fork:
        return []
    out = uw.git(["diff", "--name-only", fork, tip_ref], probe)
    return sorted({f for f in out.splitlines() if f.strip() and not is_derived(f, derived)})


def reap_reason(probe, pr, base="main", derived=DERIVED_GLOBS):
    """Why the adopted draft `pr` should be closed now, or "" to keep it.

    The test is the adoption rule run again: a branch with no authored file
    that only it has changed would not be adopted today, so its draft is
    holding nothing a session could land."""
    tip_ref = f"refs/pull/{pr.number}"
    if not pr.draft:
        return ""  # someone marked it ready: theirs now
    stamp = uw.git(["log", "-1", "--format=%ct", tip_ref], probe, check=False).strip()
    if not stamp or int(stamp) > pr.created:
        return ""  # pushed to after adoption (or unreadable): someone is working on it
    paths = authored_paths(probe, tip_ref, base, derived)
    if not paths:
        return "it changes only run logs or derived files, which main has moved past"
    unlanded, contested = classify_paths(probe, pr.branch, base, paths, tip_ref=tip_ref)
    if unlanded:
        return ""
    if not contested:
        return "every file it changed now matches main"
    shown = ", ".join(contested[:3]) + (" ..." if len(contested) > 3 else "")
    return f"main has rewritten every file it changed since it forked ({shown})"


def _api(github_repo, token, path, method="GET", body=None, api="https://api.github.com"):
    req = urllib.request.Request(
        f"{api}/repos/{github_repo}/{path}", method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {token}",
                 "Accept": "application/vnd.github+json",
                 "X-GitHub-Api-Version": "2022-11-28",
                 "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def list_adopted(github_repo, token, max_pages=10):
    """Open PRs this job opened, read from the API (title prefix + bot author)."""
    found = []
    for page in range(1, max_pages + 1):
        rows = _api(github_repo, token, f"pulls?state=open&per_page=100&page={page}")
        for row in rows:
            if (row.get("user") or {}).get("login") != ADOPTER_LOGIN:
                continue
            if not row.get("title", "").startswith(TITLE_PREFIX):
                continue
            created = datetime.strptime(row["created_at"], "%Y-%m-%dT%H:%M:%SZ")
            found.append(Adopted(row["number"], row["head"]["ref"],
                                 created.replace(tzinfo=timezone.utc).timestamp(),
                                 bool(row.get("draft"))))
        if len(rows) < 100:
            break
    return found


def claimed_areas(probe, adopted, base="main"):
    """{area: "#N"} for the open adopted drafts that sit in one area."""
    claimed = {}
    for pr in adopted:
        key = area_key(authored_paths(probe, f"refs/pull/{pr.number}", base))
        if key:
            claimed.setdefault(key, f"#{pr.number}")
    return claimed


def survivor(github_repo, token, path):
    """The `(#N)` of the last commit on main that touched `path`, or ""."""
    if not path:
        return ""
    try:
        rows = _api(github_repo, token, f"commits?path={urllib.parse.quote(path)}&per_page=1")
    except (urllib.error.URLError, ValueError):
        return ""
    if not rows:
        return ""
    match = re.search(r"\(#(\d+)\)", rows[0]["commit"]["message"].splitlines()[0])
    return f"#{match.group(1)}" if match else ""


def close_adopted(github_repo, token, number, reason, survivor_ref=""):
    """Comment with the reason, then close. Returns "" or an error message."""
    tail = f" Last changed on main by {survivor_ref}." if survivor_ref else ""
    comment = (f"Closing: {reason}.{tail} Nothing on this branch is left that main lacks or has "
               "not since rewritten, so there is nothing here to land "
               "(`platform/ci/adopt_stranded.py --reap`). Reopen it if that is wrong; "
               "`refs/pull/%d/head` keeps the commits." % number)
    try:
        _api(github_repo, token, f"issues/{number}/comments", "POST", {"body": comment})
        _api(github_repo, token, f"pulls/{number}", "PATCH", {"state": "closed"})
    except urllib.error.HTTPError as exc:
        return f"HTTP {exc.code}: {exc.read().decode(errors='replace')[:300]}"
    return ""


def first_path(probe, pr, base, derived=DERIVED_GLOBS):
    paths = authored_paths(probe, f"refs/pull/{pr.number}", base, derived)
    return paths[0] if paths else ""


def github_repo_from_remote(repo, remote):
    url = uw.git(["remote", "get-url", remote], repo).strip()
    match = re.search(r"github\.com[:/]+([^/]+/[^/]+?)(?:\.git)?/?$", url)
    if not match:
        match = re.search(r"/git/([^/]+/[^/]+?)(?:\.git)?/?$", url)  # session proxy remotes
    return match.group(1) if match else None


def open_draft(github_repo, token, cand, base, api="https://api.github.com"):
    """Open the draft PR. Returns (number or None, message)."""
    payload = json.dumps({
        "title": cand.title(), "head": cand.branch, "base": base,
        "body": cand.body(), "draft": True, "maintainer_can_modify": True,
    }).encode()
    req = urllib.request.Request(
        f"{api}/repos/{github_repo}/pulls", data=payload, method="POST",
        headers={"Authorization": f"Bearer {token}",
                 "Accept": "application/vnd.github+json",
                 "X-GitHub-Api-Version": "2022-11-28",
                 "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.load(resp)
            return data.get("number"), data.get("html_url", "")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:300]
        return None, f"HTTP {exc.code}: {detail}"


def print_plan(candidates, since, min_age_hours):
    adopt = [c for c in candidates if not c.skip]
    print(f"adopt_stranded: {len(candidates)} stranded branch(es) since {since or 'ever'}; "
          f"{len(adopt)} to adopt, {len(candidates) - len(adopt)} skipped "
          f"(min age {min_age_hours}h)")
    for c in candidates:
        mark = "ADOPT" if not c.skip else "skip "
        print(f"  {mark} {c.day}  {c.branch}  {len(c.commits)} commit(s)")
        print(f"        {c.commits[0].subject[:100]}")
        if not c.skip:
            print(f"        {len(c.files)} file(s) only this branch changed, e.g. {c.files[0]}")
        if c.skip:
            print(f"        why skipped: {c.skip}")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--repo", default=".")
    parser.add_argument("--remote", default="origin")
    parser.add_argument("--base", default="main")
    parser.add_argument("--since", help=f"only tips dated on/after YYYY-MM-DD (default: "
                        f"{DEFAULT_SINCE_DAYS} days ago; 'all' for no limit)")
    parser.add_argument("--min-age-hours", type=float, default=DEFAULT_MIN_AGE_HOURS)
    parser.add_argument("--max-open", type=int, default=DEFAULT_MAX_OPEN,
                        help="open at most this many PRs per run, oldest tips last")
    parser.add_argument("--max-files", type=int, default=DEFAULT_MAX_FILES)
    parser.add_argument("--derived", action="append", default=[], metavar="GLOB",
                        help="also treat paths matching GLOB as derived (repeatable), e.g. "
                        "'prompts/*' in oss-research-monorepo")
    parser.add_argument("--apply", action="store_true", help="open the draft PRs (needs GITHUB_TOKEN)")
    parser.add_argument("--reap", action="store_true",
                        help="also close open adopted drafts that hold nothing main lacks (needs GITHUB_TOKEN)")
    parser.add_argument("--max-close", type=int, default=DEFAULT_MAX_CLOSE,
                        help="close at most this many adopted drafts per run")
    parser.add_argument("--github-repo", default=os.environ.get("GITHUB_REPOSITORY"),
                        help="owner/name for the API (default: $GITHUB_REPOSITORY, else the remote URL)")
    args = parser.parse_args(argv)
    if hasattr(signal, "SIGPIPE"):
        signal.signal(signal.SIGPIPE, signal.SIG_DFL)  # `| head` stops quietly

    since = args.since or (date.today() - timedelta(days=DEFAULT_SINCE_DAYS)).isoformat()
    if since == "all":
        since = None
    token = os.environ.get("GITHUB_TOKEN")
    derived = DERIVED_GLOBS + tuple(args.derived)
    try:
        repo = uw.git(["rev-parse", "--show-toplevel"], args.repo).strip()
        github_repo = args.github_repo or github_repo_from_remote(repo, args.remote)
        adopted = []
        if token and github_repo:
            try:
                adopted = list_adopted(github_repo, token)
            except (urllib.error.URLError, ValueError, KeyError) as exc:
                print(f"adopt_stranded: could not list open adopted drafts ({exc}); "
                      "the sibling check covers this run's branches only", file=sys.stderr)
        candidates = plan(repo, args.remote, args.base, since, args.min_age_hours,
                          derived=derived, max_files=args.max_files, adopted=adopted)
        probe = uw.probe_path(repo)
        reap = [(pr, reap_reason(probe, pr, args.base, derived)) for pr in adopted] if args.reap else []
    except uw.GitError as exc:
        print(f"adopt_stranded: could not answer: {exc}", file=sys.stderr)
        return 2
    print_plan(candidates, since, args.min_age_hours)
    reap = [(pr, why) for pr, why in reap if why]
    if args.reap:
        print(f"\nadopt_stranded --reap: {len(adopted)} open adopted draft(s), {len(reap)} to close")
        for pr, why in reap:
            print(f"  close #{pr.number} {pr.branch}: {why}")
    if not args.apply:
        print("\nPlan only. Re-run with --apply to open (and with --reap, close) these.")
        return 0

    if not token or not github_repo:
        print("adopt_stranded: --apply needs GITHUB_TOKEN and --github-repo", file=sys.stderr)
        return 2
    failed = 0
    for pr, why in reap[:args.max_close]:
        error = close_adopted(github_repo, token, pr.number, why,
                              survivor(github_repo, token, first_path(probe, pr, args.base, derived)))
        if error:
            failed += 1
            print(f"  FAILED to close #{pr.number}: {error}")
        else:
            print(f"  closed #{pr.number}")
    for cand in [c for c in candidates if not c.skip][:args.max_open]:
        number, message = open_draft(github_repo, token, cand, args.base)
        if number:
            print(f"  opened #{number} for {cand.branch}: {message}")
            continue
        failed += 1
        print(f"  FAILED {cand.branch}: {message}")
        if ACTIONS_MAY_NOT_OPEN_PRS in message:
            print(f"\n{ACTIONS_SETTING_REMEDY}", file=sys.stderr)
            break  # every other call would fail the same way
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
