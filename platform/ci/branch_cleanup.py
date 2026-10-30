#!/usr/bin/env python3
"""Delete a pull request's head branch once that PR is finished with it.

This repository accumulates branches faster than anything removes them: every
scheduled agent session is handed a fresh `claude/*` or `cursor/*` branch, and
nothing deleted one after its PR landed. By 2026-08-24 the remote carried 608
of them against six open PRs, so `git branch -r` -- the thing a session reads to
find out what work already exists -- was ~99% noise, and the branch behind a
closed-unmerged PR was indistinguishable from live work.

Three rules. The first two are keyed to a pull request, the third to `main`:

  merged           -> delete now. The commits are on the base branch; the ref
                      is a duplicate pointer to history that is already safe.
  closed, unmerged -> delete after a grace period (24h by default). The commits
                      are NOT on the base branch, so this one is a real
                      deletion. The delay is the window in which a human who
                      closed a PR by mistake, or wants to salvage a diff from
                      it, can reopen or fetch it. GitHub keeps the objects
                      reachable for longer than that and a closed PR can still
                      be restored from its own page, but the delay is what
                      makes the automation reversible without needing to know
                      that.
  in main already  -> delete a branch whose tip is an ancestor of `main`
                      (GitHub compare `main...tip` ahead_by == 0), whether its
                      PR "moved" or it never had a PR. Every commit it points
                      at is on `main`, so deleting it loses nothing.

Why the third rule (measured 2026-10-16, 1,465 remote branches): sessions
reset their local branch to origin/main after a merge and push it again, which
recreates the branch the on-close job just deleted. Its tip is then main's own
squash commit, so the old "has moved" guard kept 872 of 875 surviving
merged-PR branches forever, and 285 never-PR branches that also hold nothing
beyond `main` had no rule at all. A branch holding even one commit that is not
on `main` is still never deleted by that rule.

`decide()` holds every rule and touches no network, so the guards below are
unit-testable. They exist because each one is a way this automation could
destroy work:

  fork head          A head branch in a fork is not ours to delete.
  protected ref      Never the default branch, nor anything matching
                     --protect. A GITHUB_TOKEN cannot delete a
                     branch-protected ref anyway, but do not rely on the
                     repository's settings to be the only guard.
  branch has moved   The branch tip no longer matches the PR's head SHA:
                     somebody pushed after the PR closed. Unless that tip is
                     already in `main`, it may be on no PR and deleting the
                     ref would lose the only reference to it. Leave it.
  not provably in    A no-PR branch is deleted only when its tip is known to
  main, or young     be in `main` and that tip commit is older than 48h (a
                     session may have just reset to main and be about to
                     commit). "Could not tell" (compare failed, budget spent)
                     keeps the branch.
  reserved ref       The branch is the head or the base of some *other* open
                     PR. Deleting a head ref closes its PR unmerged; deleting a
                     base ref orphans one.
  already gone       Nothing to do; not an error (both entry points can race).

Usage:
  python3 platform/ci/branch_cleanup.py --pr 123          # one PR, after it closes
  python3 platform/ci/branch_cleanup.py --sweep           # backlog, grace expiries, no-PR branches
  ... --dry-run                                           # decide, delete nothing

Reads GITHUB_TOKEN (or GH_TOKEN) and GITHUB_REPOSITORY from the environment.
"""
import argparse
import fnmatch
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

API_ROOT = os.environ.get("GITHUB_API_URL", "https://api.github.com")

# Never deleted, whatever a PR says. The default branch is added at runtime.
DEFAULT_PROTECTED = ("main", "master", "develop", "gh-pages", "release/*", "hotfix/*", "archive/*",
                     "security-alerts")

DEFAULT_GRACE_HOURS = 24.0

# A branch with no PR whose tip is in `main` is kept until that tip commit is
# this old: a session that just reset to main may be about to commit on it.
DEFAULT_STRAY_MIN_AGE_HOURS = 48.0

# A single sweep considers this many closed PRs that still have a head branch,
# most-recently-updated first. Already-gone heads do not count toward the cap.
# It used to be 500, and the 875 kept "moved" branches alone filled it, so the
# oldest closed-unmerged PRs were never reached (59 of them on 2026-10-16).
# Reading a PR row costs nothing beyond the page it is on; the bound on API
# spend is DEFAULT_MAX_DELETES and DEFAULT_COMPARE_BUDGET instead.
DEFAULT_MAX_PRS = 50000

# How many closed PR rows one sweep pages through (100 per request). The repo
# had ~6,800 closed PRs on 2026-10-16, past the old 5,000, so the oldest were
# never seen. The sweep reads every closed PR to know which live branches have
# none; if it stops short, the no-PR rule is skipped for that run.
DEFAULT_SWEEP_SCAN = 50000

# Each deletion costs ~3 requests (live tip, open-PR refs, the delete) and a
# GITHUB_TOKEN gets ~1,000 an hour, so one run stops after this many. The
# 6-hourly schedule works through a backlog over a few runs.
DEFAULT_MAX_DELETES = 200

# `main...tip` compares one run may issue for tips that are not among main's
# recent commits. Answers are cached per SHA. A spent budget means "cannot
# tell", which keeps the branch.
DEFAULT_COMPARE_BUDGET = 200

# How much of main's history to list (100 commits per request) so that a tip
# which IS a main commit -- the usual reset-to-main case -- needs no compare.
DEFAULT_MAIN_HISTORY = 5000

# Pause between deletions. GitHub's secondary rate limit asks for no more than
# 80 content-generating requests a minute, and the first sweep over this repo's
# backlog wanted to issue 220 back to back. 0.8s holds it to ~75/min. The 403
# retry in _request would recover from tripping it anyway; this keeps it from
# being tripped.
DELETE_DELAY_SECONDS = 0.8


@dataclass(frozen=True)
class Decision:
    """Whether to delete a PR's head ref, and the sentence explaining why."""

    delete: bool
    reason: str


def parse_time(value):
    """Parse a GitHub ISO-8601 timestamp into an aware datetime, or None."""
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def is_protected(ref, patterns):
    return any(fnmatch.fnmatch(ref, pattern) for pattern in patterns)


def refs_in_grace(prs, now, grace_hours=DEFAULT_GRACE_HOURS):
    """Head refs that some closed-unmerged PR still holds inside its grace."""
    refs = set()
    for pr in prs:
        if pr.get("merged_at") or pr.get("state") == "open":
            continue
        ref = pr.get("head_ref")
        if not ref:
            continue
        closed_at = parse_time(pr.get("closed_at"))
        if closed_at is None:
            continue
        if now < closed_at + timedelta(hours=grace_hours):
            refs.add(ref)
    return refs


def iter_closed_for_sweep(payloads, cap, live_refs=None):
    """Yield closed PR payloads, most-recently-updated first.

    When live_refs is set, a payload whose head is not in that set does not
    count toward cap, so already-deleted heads do not fill the window.
    """
    kept = 0
    for payload in payloads:
        if live_refs is not None:
            ref = (payload.get("head") or {}).get("ref")
            if ref not in live_refs:
                continue
        yield payload
        kept += 1
        if kept >= cap:
            return


def decide(pr, branch_shas, reserved_refs, now, grace_hours=DEFAULT_GRACE_HOURS,
           protected=DEFAULT_PROTECTED, grace_refs=(), contained=None):
    """Decide whether `pr`'s head ref should be deleted.

    pr            mapping with number, state, merged_at, closed_at, head_ref,
                  head_sha, head_repo, base_repo (see `summarise_pr`)
    branch_shas   {ref: tip sha} for every branch that exists in this repo
    reserved_refs refs that some *other* open PR uses as its head or its base
    now           aware datetime, the moment the decision is made
    grace_refs    refs that some *other* closed-unmerged PR still holds inside
                  its grace period (branch reuse; see `refs_in_grace`)
    contained     callable sha -> True (tip is in main) / False / None (cannot
                  tell); asked only about a branch that moved. None (the
                  default) keeps every moved branch, as before.
    """
    ref = pr["head_ref"]
    number = pr["number"]

    if not ref:
        return Decision(False, "PR #%d has no head ref" % number)
    if pr["head_repo"] and pr["base_repo"] and pr["head_repo"] != pr["base_repo"]:
        return Decision(False, "%s lives in fork %s" % (ref, pr["head_repo"]))
    if is_protected(ref, protected):
        return Decision(False, "%s is protected" % ref)
    if pr["state"] == "open":
        return Decision(False, "PR #%d is still open" % number)
    if ref not in branch_shas:
        return Decision(False, "%s is already gone" % ref)
    moved = branch_shas[ref] != pr["head_sha"]
    if moved and not (contained and contained(branch_shas[ref]) is True):
        return Decision(
            False,
            "%s has moved since PR #%d closed (%s != %s)"
            % (ref, number, branch_shas[ref][:7], (pr["head_sha"] or "")[:7]),
        )
    if ref in reserved_refs:
        return Decision(False, "%s is the head or base of another open PR" % ref)
    if moved:
        # Pushed again after the close, but only to commits `main` already
        # has (typically main's own squash commit after a reset). The PR's
        # own head stays reachable from refs/pull/N/head.
        if ref in grace_refs:
            return Decision(
                False, "%s is still inside another PR's grace period" % ref
            )
        return Decision(
            True,
            "%s: moved past PR #%d, but its tip %s is already in main"
            % (ref, number, branch_shas[ref][:7]),
        )

    if pr["merged_at"]:
        if ref in grace_refs:
            return Decision(
                False, "%s is still inside another PR's grace period" % ref
            )
        return Decision(True, "%s: PR #%d merged" % (ref, number))

    closed_at = parse_time(pr["closed_at"])
    if closed_at is None:
        # State says closed but no timestamp: incoherent, so do nothing.
        return Decision(False, "PR #%d is closed with no closed_at" % number)

    due = closed_at + timedelta(hours=grace_hours)
    if now < due:
        return Decision(
            False,
            "%s: PR #%d closed unmerged, grace period ends %s"
            % (ref, number, due.strftime("%Y-%m-%dT%H:%MZ")),
        )
    if ref in grace_refs:
        # This PR is past grace, but a newer closed PR reused the same head
        # and is still inside its window. Deleting would end that window.
        return Decision(
            False, "%s is still inside another PR's grace period" % ref
        )
    age_hours = (now - closed_at).total_seconds() / 3600.0
    return Decision(
        True, "%s: PR #%d closed unmerged %.1fh ago" % (ref, number, age_hours)
    )


def decide_stray(ref, sha, reserved_refs, now, contained, tip_time,
                 protected=DEFAULT_PROTECTED,
                 min_age_hours=DEFAULT_STRAY_MIN_AGE_HOURS):
    """Decide whether a branch that no pull request ever used should go.

    contained  True / False / None for "the tip is an ancestor of main"
    tip_time   aware datetime of the tip commit, or None if unknown
    """
    if is_protected(ref, protected):
        return Decision(False, "%s is protected" % ref)
    if ref in reserved_refs:
        return Decision(False, "%s is the head or base of an open PR" % ref)
    if contained is None:
        return Decision(
            False, "%s: could not tell whether %s is in main" % (ref, sha[:7])
        )
    if not contained:
        return Decision(False, "%s has no PR and commits not in main" % ref)
    if tip_time is None:
        return Decision(False, "%s: tip %s has no known date" % (ref, sha[:7]))
    age_hours = (now - tip_time).total_seconds() / 3600.0
    if age_hours < min_age_hours:
        return Decision(
            False, "%s: no PR, tip in main but only %.1fh old" % (ref, age_hours)
        )
    return Decision(
        True, "%s: no PR, tip %s in main, %.1fh old" % (ref, sha[:7], age_hours)
    )


class MainContainment:
    """Answers "is this SHA an ancestor of main?" with few requests.

    First against main's recent commit list (one request per 100 commits),
    which covers the usual case: a branch reset to main and pushed, whose tip
    IS a main commit. Otherwise one `main...sha` compare per SHA, cached,
    until the budget is spent; after that the answer is None (cannot tell).
    """

    def __init__(self, main_commits, compare, budget=DEFAULT_COMPARE_BUDGET):
        # sha -> ISO committer date; a callable is read on first use, so a
        # run that never meets a moved branch skips the ~50 history requests.
        self._main_commits = main_commits
        self._loaded = None
        self._compare = compare  # sha -> (ahead_by, ISO date) or None
        self._budget = budget
        self._cache = {}

    def check(self, sha):
        """(contained True/False/None, tip datetime or None)."""
        if not sha:
            return None, None
        if self._loaded is None:
            main = self._main_commits
            self._loaded = dict(main() if callable(main) else main)
        if sha in self._loaded:
            return True, parse_time(self._loaded[sha])
        if sha in self._cache:
            return self._cache[sha]
        if self._budget <= 0:
            return None, None
        self._budget -= 1
        try:
            answer = self._compare(sha)
        except (urllib.error.URLError, OSError, ValueError, KeyError):
            answer = None
        if answer is None:
            result = (None, None)
        else:
            ahead_by, date = answer
            result = (ahead_by == 0, parse_time(date) if ahead_by == 0 else None)
        self._cache[sha] = result
        return result

    def __call__(self, sha):
        return self.check(sha)[0]


def summarise_pr(payload):
    """Reduce a GitHub PR object to the fields `decide` reads."""
    head = payload.get("head") or {}
    base = payload.get("base") or {}
    head_repo = (head.get("repo") or {}).get("full_name")
    base_repo = (base.get("repo") or {}).get("full_name")
    return {
        "number": payload["number"],
        "state": payload.get("state"),
        "merged_at": payload.get("merged_at"),
        "closed_at": payload.get("closed_at"),
        "head_ref": head.get("ref"),
        "head_sha": head.get("sha"),
        "head_repo": head_repo,
        "base_repo": base_repo,
    }


class GitHub:
    """The handful of REST calls this needs, over stdlib urllib."""

    def __init__(self, repo, token):
        self.repo = repo
        self.token = token

    def _request(self, method, path, params=None, expect_missing=False):
        url = "%s%s" % (API_ROOT, path)
        if params:
            url += "?" + urllib.parse.urlencode(params)
        request = urllib.request.Request(url, method=method)
        request.add_header("Authorization", "Bearer %s" % self.token)
        request.add_header("Accept", "application/vnd.github+json")
        request.add_header("X-GitHub-Api-Version", "2022-11-28")
        request.add_header("User-Agent", "monorepo-projects-branch-cleanup")

        last_error = None
        for attempt in range(4):
            try:
                with urllib.request.urlopen(request, timeout=30) as response:
                    body = response.read()
                    return json.loads(body) if body else None
            except urllib.error.HTTPError as error:
                if error.code == 404 and expect_missing:
                    return None
                # Retry transient server-side and secondary-rate-limit answers.
                if error.code in (403, 429, 500, 502, 503, 504) and attempt < 3:
                    last_error = error
                    time.sleep(2 ** attempt)
                    continue
                raise
            except urllib.error.URLError as error:
                if attempt < 3:
                    last_error = error
                    time.sleep(2 ** attempt)
                    continue
                raise
        raise last_error

    def _paginate(self, path, params, cap):
        """Yield items across pages until `cap` items or a short page."""
        params = dict(params)
        params["per_page"] = 100
        page = 1
        seen = 0
        while seen < cap:
            params["page"] = page
            batch = self._request("GET", path, params) or []
            for item in batch:
                yield item
                seen += 1
                if seen >= cap:
                    return
            if len(batch) < 100:
                return
            page += 1

    def default_branch(self):
        return (self._request("GET", "/repos/%s" % self.repo) or {}).get("default_branch")

    def branch_shas(self):
        """{ref: tip sha} for every branch in the repo."""
        return {
            branch["name"]: branch["commit"]["sha"]
            for branch in self._paginate("/repos/%s/branches" % self.repo, {}, 5000)
        }

    def branch_sha(self, ref):
        """Current tip of one branch, or None if it is gone."""
        path = "/repos/%s/branches/%s" % (
            self.repo,
            urllib.parse.quote(ref, safe=""),
        )
        payload = self._request("GET", path, expect_missing=True)
        if not payload:
            return None
        return (payload.get("commit") or {}).get("sha")

    def open_pr_refs(self, exclude=()):
        """Head and base refs held by open PRs, excluding the given PR numbers."""
        refs = set()
        for payload in self._paginate(
            "/repos/%s/pulls" % self.repo, {"state": "open"}, 1000
        ):
            if payload["number"] in exclude:
                continue
            summary = summarise_pr(payload)
            if summary["head_repo"] == summary["base_repo"] and summary["head_ref"]:
                refs.add(summary["head_ref"])
            base_ref = (payload.get("base") or {}).get("ref")
            if base_ref:
                refs.add(base_ref)
        return refs

    def pull_request(self, number):
        return self._request("GET", "/repos/%s/pulls/%d" % (self.repo, number))

    def closed_pull_requests(self, cap, live_refs=None):
        """Closed PRs, most recently updated first.

        When live_refs is set, a PR whose head is not in that set does not
        count toward cap, so already-deleted heads do not fill the window.
        """
        scan_cap = DEFAULT_SWEEP_SCAN if live_refs is not None else cap
        return iter_closed_for_sweep(
            self._paginate(
                "/repos/%s/pulls" % self.repo,
                {"state": "closed", "sort": "updated", "direction": "desc"},
                scan_cap,
            ),
            cap,
            live_refs,
        )

    def closed_pulls_for_head(self, ref, cap=100):
        """Closed PRs whose head is this repository's `ref`.

        Used by the on-close `--pr` path, which otherwise sees only the event
        PR and would miss a still-open grace window on a reused branch.
        """
        owner = self.repo.split("/")[0]
        return self._paginate(
            "/repos/%s/pulls" % self.repo,
            {
                "state": "closed",
                "head": "%s:%s" % (owner, ref),
                "sort": "updated",
                "direction": "desc",
            },
            cap,
        )

    def main_commits(self, branch, cap=DEFAULT_MAIN_HISTORY):
        """{sha: committer date} for the newest `cap` commits on `branch`."""
        return {
            item["sha"]: ((item.get("commit") or {}).get("committer") or {}).get("date")
            for item in self._paginate(
                "/repos/%s/commits" % self.repo, {"sha": branch}, cap
            )
        }

    def compare_to(self, base):
        """A function sha -> (ahead_by, sha's committer date) against `base`."""
        def compare(sha):
            payload = self._request(
                "GET",
                "/repos/%s/compare/%s...%s"
                % (self.repo, urllib.parse.quote(base, safe=""), sha),
                {"per_page": 1},
                expect_missing=True,
            )
            if not payload:
                return None
            merge_base = payload.get("merge_base_commit") or {}
            date = ((merge_base.get("commit") or {}).get("committer") or {}).get("date")
            # ahead_by == 0 means sha is an ancestor of base, so it is the
            # merge base and this date is the tip's own.
            return int(payload.get("ahead_by", -1)), date
        return compare

    def delete_branch(self, ref):
        """Delete a ref. A ref that vanished under us is not an error."""
        path = "/repos/%s/git/refs/heads/%s" % (
            self.repo,
            urllib.parse.quote(ref, safe=""),
        )
        self._request("DELETE", path, expect_missing=True)


def expand_grace_prs(prs, lookup):
    """Add other closed PRs that share a head ref with `prs`.

    `--pr` mode only loads the event's pull request. Branch reuse is common
    here (`claude/*`, `cursor/*`); a merged reuse must not end a still-open
    closed-unmerged grace window on the same ref.
    """
    expanded = list(prs)
    seen = {pr["number"] for pr in expanded}
    for pr in prs:
        ref = pr.get("head_ref")
        if not ref:
            continue
        for payload in lookup(ref):
            summary = summarise_pr(payload)
            if summary["number"] not in seen:
                expanded.append(summary)
                seen.add(summary["number"])
    return expanded


def run(github, prs, protected, grace_hours, dry_run, out,
        delete_delay=DELETE_DELAY_SECONDS, sleep=time.sleep, now=None,
        containment=None, strays=(), max_deletes=None,
        stray_min_age_hours=DEFAULT_STRAY_MIN_AGE_HOURS):
    """Apply `decide` to each PR, deleting what it approves. Returns the count.

    containment  a MainContainment (.check(sha), and callable -> True/False/
                 None); None keeps every moved branch and every stray.
    strays       refs no pull request has ever used; each goes through
                 `decide_stray` after the PRs.
    max_deletes  stop after this many deletions (None: no limit).

    `now` is the decision clock. Tests pin it; production leaves it unset so
    each run uses the wall clock. The live tip/reserved recheck uses the same
    instant — grace cannot expire mid-sweep just because deletions were paced.
    """
    if len(prs) == 1:
        # One ref is all `decide` looks up; skip listing every branch.
        sha = github.branch_sha(prs[0]["head_ref"]) if prs[0]["head_ref"] else None
        branch_shas = {prs[0]["head_ref"]: sha} if sha else {}
    else:
        branch_shas = github.branch_shas()
    reserved = github.open_pr_refs(exclude={pr["number"] for pr in prs})
    now = datetime.now(timezone.utc) if now is None else now
    # A single-PR run (the on-close `--pr` job) does not see other closed
    # rows, so a merged reuse of a branch still in another PR's grace would
    # delete immediately. Ask the API for that head's other closed PRs. A
    # sweep already loaded the closed set and must not N+1 the same query.
    grace_prs = (
        expand_grace_prs(prs, github.closed_pulls_for_head) if len(prs) == 1 else prs
    )
    grace_refs = refs_in_grace(grace_prs, now, grace_hours)

    deleted = 0
    for pr in prs:
        decision = decide(
            pr, branch_shas, reserved, now, grace_hours, protected, grace_refs,
            containment,
        )
        if not decision.delete:
            print("skip   %s" % decision.reason, file=out)
            continue
        if max_deletes is not None and deleted >= max_deletes:
            print("stop   reached --max-deletes %d; the next run continues"
                  % max_deletes, file=out)
            return deleted
        if not dry_run:
            if deleted and delete_delay:
                sleep(delete_delay)
            # Re-check tip and reserved refs. Concurrent sessions push and
            # open PRs during a paced sweep; a snapshot from the start of
            # run() would miss both.
            live_sha = github.branch_sha(pr["head_ref"])
            live_shas = {pr["head_ref"]: live_sha} if live_sha else {}
            live_reserved = github.open_pr_refs(exclude={pr["number"]})
            decision = decide(
                pr,
                live_shas,
                live_reserved,
                now,
                grace_hours,
                protected,
                grace_refs,
                containment,
            )
            if not decision.delete:
                print("skip   %s" % decision.reason, file=out)
                if live_sha is None:
                    branch_shas.pop(pr["head_ref"], None)
                else:
                    branch_shas[pr["head_ref"]] = live_sha
                continue
            github.delete_branch(pr["head_ref"])
        # Keep the local view consistent: a later PR in this same run may point
        # at the same ref (a branch reused across two PRs, which happens here
        # whenever a session restarts its designated branch), and it must then
        # see the ref as already gone rather than delete it a second time. Done
        # under --dry-run too, so the report says what a real run would do.
        branch_shas.pop(pr["head_ref"], None)
        deleted += 1
        print("%s %s" % ("would  delete" if dry_run else "delete", decision.reason), file=out)

    for ref in strays:
        sha = branch_shas.get(ref)
        if sha is None:
            continue
        contained, tip_time = containment.check(sha) if containment else (None, None)
        decision = decide_stray(ref, sha, reserved, now, contained, tip_time,
                                protected, stray_min_age_hours)
        if not decision.delete:
            print("skip   %s" % decision.reason, file=out)
            continue
        if max_deletes is not None and deleted >= max_deletes:
            print("stop   reached --max-deletes %d; the next run continues"
                  % max_deletes, file=out)
            return deleted
        if not dry_run:
            if deleted and delete_delay:
                sleep(delete_delay)
            # Same live recheck as for PRs: a push or a new PR since the
            # snapshot must stop the delete.
            live_sha = github.branch_sha(ref)
            if live_sha is None:
                print("skip   %s is already gone" % ref, file=out)
                continue
            live_reserved = github.open_pr_refs()
            if live_sha != sha:
                contained, tip_time = containment.check(live_sha)
            decision = decide_stray(ref, live_sha, live_reserved, now, contained,
                                    tip_time, protected, stray_min_age_hours)
            if not decision.delete:
                print("skip   %s" % decision.reason, file=out)
                continue
            github.delete_branch(ref)
        branch_shas.pop(ref, None)
        deleted += 1
        print("%s %s" % ("would  delete" if dry_run else "delete", decision.reason), file=out)
    return deleted


def stray_refs(branch_shas, pr_head_refs):
    """Live branches that no pull request (open or closed) has as its head."""
    return sorted(ref for ref in branch_shas if ref not in pr_head_refs)


def sweep_inputs(closed_payloads, live_refs, open_refs, max_prs=DEFAULT_MAX_PRS,
                 scan_cap=DEFAULT_SWEEP_SCAN):
    """(prs, strays, complete) for a sweep.

    Every closed PR row is read, not only those with a live head, so the set
    of refs any PR ever used is complete; the no-PR rule depends on that. If
    the scan stops at scan_cap the set may be incomplete and strays is empty.
    """
    rows = []
    for payload in closed_payloads:
        rows.append(summarise_pr(payload))
        if len(rows) >= scan_cap:
            break
    same_repo = [row for row in rows if row["head_repo"] == row["base_repo"]]
    prs = [row for row in same_repo if row["head_ref"] in live_refs][:max_prs]
    complete = len(rows) < scan_cap
    if not complete:
        return prs, [], False
    pr_heads = {row["head_ref"] for row in same_repo} | set(open_refs)
    return prs, stray_refs(live_refs, pr_heads), True


def main(argv=None, out=sys.stdout):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--pr", type=int, help="consider this one pull request")
    group.add_argument(
        "--sweep", action="store_true",
        help="consider every closed pull request, and branches with no PR",
    )
    parser.add_argument("--dry-run", action="store_true", help="decide, delete nothing")
    parser.add_argument(
        "--grace-hours",
        type=float,
        default=DEFAULT_GRACE_HOURS,
        help="how long a closed-unmerged branch is kept (default %(default)s)",
    )
    parser.add_argument(
        "--max-prs",
        type=int,
        default=DEFAULT_MAX_PRS,
        help="how many closed PRs with a live head one sweep keeps (default %(default)s)",
    )
    parser.add_argument(
        "--max-deletes",
        type=int,
        default=DEFAULT_MAX_DELETES,
        help="stop after this many deletions in one run (default %(default)s)",
    )
    parser.add_argument(
        "--compare-budget",
        type=int,
        default=DEFAULT_COMPARE_BUDGET,
        help="main...tip compares one run may issue (default %(default)s)",
    )
    parser.add_argument(
        "--protect",
        action="append",
        default=[],
        help="extra fnmatch pattern never to delete (repeatable)",
    )
    parser.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY"))
    args = parser.parse_args(argv)

    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if not token:
        return "GITHUB_TOKEN (or GH_TOKEN) is required"
    if not args.repo:
        return "GITHUB_REPOSITORY (or --repo owner/name) is required"

    github = GitHub(args.repo, token)
    protected = list(DEFAULT_PROTECTED) + list(args.protect)
    default_branch = github.default_branch()
    if default_branch:
        protected.append(default_branch)
    base = default_branch or "main"
    containment = MainContainment(
        lambda: github.main_commits(base), github.compare_to(base),
        args.compare_budget
    )

    strays = []
    if args.pr:
        prs = [summarise_pr(github.pull_request(args.pr))]
    else:
        live_refs = set(github.branch_shas())
        prs, strays, complete = sweep_inputs(
            github.closed_pull_requests(DEFAULT_SWEEP_SCAN),
            live_refs,
            github.open_pr_refs(),
            args.max_prs,
        )
        if not complete:
            print("note   closed-PR scan hit %d rows; no-PR branches skipped this run"
                  % DEFAULT_SWEEP_SCAN, file=out)

    deleted = run(github, prs, protected, args.grace_hours, args.dry_run, out,
                  containment=containment, strays=strays,
                  max_deletes=args.max_deletes)
    print(
        "%s %d branch(es) across %d pull request(s) and %d no-PR branch(es)"
        % ("Would delete" if args.dry_run else "Deleted", deleted, len(prs),
           len(strays)),
        file=out,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
