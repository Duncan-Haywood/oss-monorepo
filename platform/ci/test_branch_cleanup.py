#!/usr/bin/env python3
"""Unit tests for branch_cleanup.decide() and run().

Every guard in decide() is a way this automation could destroy work that is on
no other ref, so each one is pinned here rather than left to be exercised only
by the live workflow -- where a regression would show up as a deleted branch,
which is exactly the outcome the guards exist to prevent.

run() is tested against a fake client so the delete path, the dry-run path, and
the same-ref-twice case are covered without touching the network.

Run: python3 -m unittest test_branch_cleanup   (from platform/ci/)
"""
import contextlib
import io
import json
import unittest
import urllib.error
from unittest import mock
from datetime import datetime, timedelta, timezone

from branch_cleanup import (
    DEFAULT_MAX_DELETES,
    DEFAULT_PROTECTED,
    GitHub,
    MainContainment,
    decide,
    decide_stray,
    expand_grace_prs,
    iter_closed_for_sweep,
    main,
    refs_in_grace,
    run,
    summarise_pr,
    sweep_inputs,
)

NOW = datetime(2026, 8, 24, 12, 0, tzinfo=timezone.utc)
REPO = "Duncan-Haywood/monorepo-projects"


def pr(**overrides):
    """A closed-unmerged PR whose branch is safe to delete, plus overrides."""
    base = {
        "number": 42,
        "state": "closed",
        "merged_at": None,
        "closed_at": "2026-08-22T12:00:00Z",  # 48h before NOW
        "head_ref": "claude/some-work-abc123",
        "head_sha": "a" * 40,
        "head_repo": REPO,
        "base_repo": REPO,
    }
    base.update(overrides)
    return base


def call(pull, branch_shas=None, reserved=(), now=NOW, grace_hours=24.0,
         grace_refs=()):
    if branch_shas is None:
        branch_shas = {pull["head_ref"]: pull["head_sha"]}
    return decide(
        pull, branch_shas, set(reserved), now, grace_hours, DEFAULT_PROTECTED,
        grace_refs,
    )


class DecideTest(unittest.TestCase):
    def test_merged_pr_branch_is_deleted_immediately(self):
        decision = call(pr(merged_at="2026-08-24T11:59:00Z"))
        self.assertTrue(decision.delete)
        self.assertIn("merged", decision.reason)

    def test_merged_pr_ignores_the_grace_period(self):
        # Merged one second ago: the commits are already on the base branch, so
        # there is nothing the delay would protect.
        decision = call(
            pr(merged_at="2026-08-24T11:59:59Z", closed_at="2026-08-24T11:59:59Z"),
            grace_hours=999.0,
        )
        self.assertTrue(decision.delete)

    def test_closed_unmerged_waits_out_the_grace_period(self):
        decision = call(pr(closed_at="2026-08-24T11:00:00Z"))  # 1h ago
        self.assertFalse(decision.delete)
        self.assertIn("grace period ends", decision.reason)

    def test_closed_unmerged_is_deleted_once_the_grace_period_expires(self):
        decision = call(pr(closed_at="2026-08-23T11:59:00Z"))  # just over 24h
        self.assertTrue(decision.delete)
        self.assertIn("closed unmerged", decision.reason)

    def test_grace_boundary_is_not_inclusive_one_second_early(self):
        closed = NOW - timedelta(hours=24) + timedelta(seconds=1)
        self.assertFalse(call(pr(closed_at=closed.isoformat())).delete)

    def test_grace_boundary_fires_exactly_on_expiry(self):
        closed = NOW - timedelta(hours=24)
        self.assertTrue(call(pr(closed_at=closed.isoformat())).delete)

    def test_open_pr_is_never_touched(self):
        decision = call(pr(state="open", closed_at=None))
        self.assertFalse(decision.delete)
        self.assertIn("still open", decision.reason)

    def test_fork_head_is_never_touched(self):
        decision = call(pr(head_repo="somebody-else/monorepo-projects"))
        self.assertFalse(decision.delete)
        self.assertIn("fork", decision.reason)

    def test_protected_refs_are_never_touched(self):
        for ref in ("main", "master", "develop", "gh-pages", "release/2026-08",
                    "archive/research/claude/x"):
            with self.subTest(ref=ref):
                decision = call(pr(head_ref=ref))
                self.assertFalse(decision.delete)
                self.assertIn("protected", decision.reason)

    def test_extra_protect_patterns_are_honoured(self):
        pull = pr(head_ref="keepme/thing")
        decision = decide(
            pull,
            {pull["head_ref"]: pull["head_sha"]},
            set(),
            NOW,
            24.0,
            list(DEFAULT_PROTECTED) + ["keepme/*"],
        )
        self.assertFalse(decision.delete)

    def test_missing_branch_is_a_no_op_not_an_error(self):
        decision = call(pr(), branch_shas={})
        self.assertFalse(decision.delete)
        self.assertIn("already gone", decision.reason)

    def test_branch_that_moved_after_the_close_is_left_alone(self):
        # Somebody pushed after the PR closed. That commit is on no PR, so the
        # ref is the only thing pointing at it.
        pull = pr()
        decision = call(pull, branch_shas={pull["head_ref"]: "b" * 40})
        self.assertFalse(decision.delete)
        self.assertIn("has moved", decision.reason)

    def test_branch_that_moved_is_left_alone_even_when_merged(self):
        pull = pr(merged_at="2026-08-24T11:00:00Z")
        decision = call(pull, branch_shas={pull["head_ref"]: "c" * 40})
        self.assertFalse(decision.delete)
        self.assertIn("has moved", decision.reason)

    def test_ref_held_by_another_open_pr_is_left_alone(self):
        pull = pr(merged_at="2026-08-24T11:00:00Z")
        decision = call(pull, reserved={pull["head_ref"]})
        self.assertFalse(decision.delete)
        self.assertIn("another open PR", decision.reason)

    def test_past_grace_waits_if_another_pr_on_the_same_ref_is_in_grace(self):
        pull = pr()  # 48h ago, past grace
        decision = call(pull, grace_refs={pull["head_ref"]})
        self.assertFalse(decision.delete)
        self.assertIn("another PR's grace period", decision.reason)

    def test_merged_pr_waits_if_another_pr_on_the_same_ref_is_in_grace(self):
        pull = pr(merged_at="2026-08-24T11:00:00Z")
        decision = call(pull, grace_refs={pull["head_ref"]})
        self.assertFalse(decision.delete)
        self.assertIn("another PR's grace period", decision.reason)

    def test_own_grace_message_is_kept_when_this_pr_is_the_one_in_grace(self):
        # grace_refs includes this PR's ref because refs_in_grace is computed
        # across the whole list; decide must still report *this* PR's deadline.
        decision = call(pr(closed_at="2026-08-24T11:00:00Z"), grace_refs={"claude/some-work-abc123"})
        self.assertFalse(decision.delete)
        self.assertIn("grace period ends", decision.reason)

    def test_missing_head_ref_is_a_no_op(self):
        self.assertFalse(call(pr(head_ref=None), branch_shas={}).delete)

    def test_closed_without_a_timestamp_is_a_no_op(self):
        decision = call(pr(closed_at=None))
        self.assertFalse(decision.delete)
        self.assertIn("no closed_at", decision.reason)

    def test_decision_carries_the_ref_it_is_about(self):
        pull = pr(merged_at="2026-08-24T11:00:00Z")
        self.assertIn(pull["head_ref"], call(pull).reason)


class SummarisePrTest(unittest.TestCase):
    def test_reduces_a_github_payload_to_the_decision_fields(self):
        summary = summarise_pr(
            {
                "number": 7,
                "state": "closed",
                "merged_at": None,
                "closed_at": "2026-08-23T00:00:00Z",
                "head": {"ref": "topic", "sha": "d" * 40, "repo": {"full_name": REPO}},
                "base": {"ref": "main", "repo": {"full_name": REPO}},
            }
        )
        self.assertEqual(summary["head_ref"], "topic")
        self.assertEqual(summary["head_repo"], REPO)
        self.assertEqual(summary["base_repo"], REPO)

    def test_a_deleted_fork_leaves_a_null_repo_and_does_not_crash(self):
        # GitHub returns head.repo: null once the fork is gone. Treated as
        # "unknown origin", which decide() then refuses to act on for want of a
        # matching branch rather than by the fork rule.
        summary = summarise_pr(
            {
                "number": 8,
                "state": "closed",
                "merged_at": None,
                "closed_at": "2026-08-23T00:00:00Z",
                "head": {"ref": "topic", "sha": "e" * 40, "repo": None},
                "base": {"ref": "main", "repo": {"full_name": REPO}},
            }
        )
        self.assertIsNone(summary["head_repo"])
        self.assertFalse(decide(summary, {}, set(), NOW).delete)


class FakeGitHub:
    def __init__(self, branch_shas, open_refs=(), after_snapshot=None,
                 closed_for_head=None):
        self._branch_shas = dict(branch_shas)
        self._open_refs = set(open_refs)
        self._after_snapshot = after_snapshot
        self._closed_for_head = closed_for_head or {}
        self.deleted = []

    def branch_shas(self):
        return dict(self._branch_shas)

    def branch_sha(self, ref):
        return self._branch_shas.get(ref)

    def open_pr_refs(self, exclude=()):
        refs = set(self._open_refs)
        # Fire after the reserved-ref snapshot is copied so run() still sees
        # the stale view, then revalidation sees the drifted one.
        if self._after_snapshot is not None:
            hook = self._after_snapshot
            self._after_snapshot = None
            hook(self)
        return refs

    def closed_pulls_for_head(self, ref, cap=100):
        return list(self._closed_for_head.get(ref, []))[:cap]

    def delete_branch(self, ref):
        self.deleted.append(ref)
        self._branch_shas.pop(ref, None)


class RunTest(unittest.TestCase):
    # run() uses the wall clock unless `now=` is passed. Fixtures below are
    # dated relative to NOW (2026-08-24); omitting the pin lets a 24h grace
    # window expire the next calendar day and the suite fails on main.

    def test_deletes_what_decide_approves_and_reports_it(self):
        merged = pr(number=1, head_ref="claude/one", merged_at="2026-08-24T11:00:00Z")
        waiting = pr(number=2, head_ref="claude/two", closed_at="2026-08-24T11:00:00Z")
        github = FakeGitHub({"claude/one": "a" * 40, "claude/two": "a" * 40})
        out = io.StringIO()

        deleted = run(
            github, [merged, waiting], DEFAULT_PROTECTED, 24.0, False, out, now=NOW
        )

        self.assertEqual(deleted, 1)
        self.assertEqual(github.deleted, ["claude/one"])
        self.assertIn("grace period ends", out.getvalue())

    def test_dry_run_deletes_nothing_but_still_counts(self):
        merged = pr(number=1, head_ref="claude/one", merged_at="2026-08-24T11:00:00Z")
        github = FakeGitHub({"claude/one": "a" * 40})
        out = io.StringIO()

        deleted = run(
            github, [merged], DEFAULT_PROTECTED, 24.0, True, out, now=NOW
        )

        self.assertEqual(deleted, 1)
        self.assertEqual(github.deleted, [])
        self.assertIn("would  delete", out.getvalue())

    def test_deletions_are_paced_but_the_first_one_is_not_delayed(self):
        prs = [
            pr(number=n, head_ref="claude/%d" % n, merged_at="2026-08-24T11:00:00Z")
            for n in range(3)
        ]
        github = FakeGitHub({p["head_ref"]: "a" * 40 for p in prs})
        naps = []

        run(github, prs, DEFAULT_PROTECTED, 24.0, False, io.StringIO(),
            delete_delay=0.8, sleep=naps.append, now=NOW)

        self.assertEqual(len(github.deleted), 3)
        self.assertEqual(naps, [0.8, 0.8])  # between deletions, not before the first

    def test_dry_run_never_sleeps(self):
        merged = pr(number=1, head_ref="claude/one", merged_at="2026-08-24T11:00:00Z")
        naps = []

        run(FakeGitHub({"claude/one": "a" * 40}), [merged], DEFAULT_PROTECTED, 24.0,
            True, io.StringIO(), delete_delay=0.8, sleep=naps.append, now=NOW)

        self.assertEqual(naps, [])

    def test_dry_run_reports_a_reused_ref_the_way_a_real_run_would(self):
        first = pr(number=1, head_ref="claude/shared", merged_at="2026-08-24T11:00:00Z")
        second = pr(number=2, head_ref="claude/shared", merged_at="2026-08-24T11:30:00Z")
        github = FakeGitHub({"claude/shared": "a" * 40})
        out = io.StringIO()

        deleted = run(
            github, [first, second], DEFAULT_PROTECTED, 24.0, True, out, now=NOW
        )

        self.assertEqual(deleted, 1)
        self.assertIn("already gone", out.getvalue())

    def test_a_ref_shared_by_two_closed_prs_is_deleted_once(self):
        # A branch reused for a second PR appears under both numbers. Without
        # dropping it from the local view the second pass would issue a delete
        # for a ref that is already gone.
        first = pr(number=1, head_ref="claude/shared", merged_at="2026-08-24T11:00:00Z")
        second = pr(number=2, head_ref="claude/shared", merged_at="2026-08-24T11:30:00Z")
        github = FakeGitHub({"claude/shared": "a" * 40})
        out = io.StringIO()

        deleted = run(
            github, [first, second], DEFAULT_PROTECTED, 24.0, False, out, now=NOW
        )

        self.assertEqual(deleted, 1)
        self.assertEqual(github.deleted, ["claude/shared"])
        self.assertIn("already gone", out.getvalue())

    def test_rechecks_tip_immediately_before_delete(self):
        pull = pr(number=1, merged_at="2026-08-24T11:00:00Z")
        ref = pull["head_ref"]

        def drift(github):
            github._branch_shas[ref] = "b" * 40

        github = FakeGitHub({ref: pull["head_sha"]}, after_snapshot=drift)
        out = io.StringIO()

        deleted = run(
            github, [pull], DEFAULT_PROTECTED, 24.0, False, out, now=NOW
        )

        self.assertEqual(deleted, 0)
        self.assertEqual(github.deleted, [])
        self.assertIn("has moved", out.getvalue())

    def test_rechecks_reserved_refs_immediately_before_delete(self):
        pull = pr(number=1, merged_at="2026-08-24T11:00:00Z")
        ref = pull["head_ref"]

        def drift(github):
            github._open_refs.add(ref)

        github = FakeGitHub({ref: pull["head_sha"]}, after_snapshot=drift)
        out = io.StringIO()

        deleted = run(
            github, [pull], DEFAULT_PROTECTED, 24.0, False, out, now=NOW
        )

        self.assertEqual(deleted, 0)
        self.assertEqual(github.deleted, [])
        self.assertIn("another open PR", out.getvalue())

    def test_older_closed_pr_does_not_bypass_newer_prs_grace(self):
        ref = "claude/shared"
        older = pr(number=1, head_ref=ref, closed_at="2026-08-22T12:00:00Z")  # 48h
        newer = pr(number=2, head_ref=ref, closed_at="2026-08-24T11:00:00Z")  # 1h
        github = FakeGitHub({ref: "a" * 40})

        # Either order: the older PR is past grace, the newer one is not.
        for prs in ([newer, older], [older, newer]):
            with self.subTest(order=[p["number"] for p in prs]):
                out = io.StringIO()
                deleted = run(
                    github, prs, DEFAULT_PROTECTED, 24.0, False, out, now=NOW
                )
                self.assertEqual(deleted, 0)
                self.assertEqual(github.deleted, [])
                self.assertIn("grace", out.getvalue())

    def test_on_close_merged_pr_does_not_end_a_peer_grace_window(self):
        # The pull_request_target job passes only the merged PR. A reused
        # branch still inside another closed-unmerged PR's grace must stay.
        ref = "claude/shared"
        now = datetime.now(timezone.utc)
        merged = pr(
            number=10,
            head_ref=ref,
            merged_at=now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            closed_at=now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        )
        peer = {
            "number": 9,
            "state": "closed",
            "merged_at": None,
            "closed_at": (now - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "head": {"ref": ref, "sha": "a" * 40, "repo": {"full_name": REPO}},
            "base": {"ref": "main", "repo": {"full_name": REPO}},
        }
        github = FakeGitHub({ref: "a" * 40}, closed_for_head={ref: [peer]})
        out = io.StringIO()

        deleted = run(github, [merged], DEFAULT_PROTECTED, 24.0, False, out)

        self.assertEqual(deleted, 0)
        self.assertEqual(github.deleted, [])
        self.assertIn("another PR's grace period", out.getvalue())


class SweepWindowTest(unittest.TestCase):
    def test_already_gone_heads_do_not_consume_the_sweep_cap(self):
        payloads = [
            {"number": 1, "head": {"ref": "gone-branch"}},
            {"number": 2, "head": {"ref": "live-old"}},
            {"number": 3, "head": {"ref": "also-gone"}},
            {"number": 4, "head": {"ref": "live-older"}},
        ]
        selected = list(
            iter_closed_for_sweep(payloads, cap=2, live_refs={"live-old", "live-older"})
        )
        self.assertEqual([p["number"] for p in selected], [2, 4])

    def test_without_live_refs_the_cap_counts_every_row(self):
        payloads = [
            {"number": 1, "head": {"ref": "gone-branch"}},
            {"number": 2, "head": {"ref": "live-old"}},
        ]
        selected = list(iter_closed_for_sweep(payloads, cap=1))
        self.assertEqual([p["number"] for p in selected], [1])

    def test_refs_in_grace_is_the_newer_closed_unmerged_head(self):
        ref = "claude/shared"
        older = pr(number=1, head_ref=ref, closed_at="2026-08-22T12:00:00Z")
        newer = pr(number=2, head_ref=ref, closed_at="2026-08-24T11:00:00Z")
        merged = pr(number=3, head_ref="claude/merged", merged_at="2026-08-24T11:00:00Z")
        self.assertEqual(refs_in_grace([older, newer, merged], NOW, 24.0), {ref})

    def test_expand_grace_prs_loads_other_closed_prs_on_the_same_head(self):
        target = pr(number=10, head_ref="claude/shared", merged_at="2026-08-24T11:30:00Z")
        peer = {
            "number": 9,
            "state": "closed",
            "merged_at": None,
            "closed_at": "2026-08-24T11:00:00Z",
            "head": {"ref": "claude/shared", "sha": "a" * 40, "repo": {"full_name": REPO}},
            "base": {"ref": "main", "repo": {"full_name": REPO}},
        }
        expanded = expand_grace_prs([target], lambda ref: [peer])
        self.assertEqual({row["number"] for row in expanded}, {9, 10})
        self.assertEqual(expanded[1]["head_ref"], "claude/shared")


MAIN_TIP = "f" * 40      # a commit on main (the reset-to-main push)
UNIQUE_TIP = "9" * 40    # a commit that is on no other ref
OLD = "2026-08-20T12:00:00Z"  # 96h before NOW
YOUNG = "2026-08-24T00:00:00Z"  # 12h before NOW


def containment(main=None, compares=None, budget=50):
    """MainContainment over a fake main history and fake compare answers."""
    compares = compares or {}
    calls = []

    def compare(sha):
        calls.append(sha)
        return compares.get(sha)

    probe = MainContainment(main or {MAIN_TIP: OLD}, compare, budget)
    probe.calls = calls
    return probe


class LazyHistoryTest(unittest.TestCase):
    def test_history_is_read_only_when_a_sha_is_checked(self):
        loads = []

        def history():
            loads.append(1)
            return {MAIN_TIP: OLD}

        probe = MainContainment(history, lambda sha: None)
        self.assertEqual(loads, [])
        self.assertEqual(probe.check(MAIN_TIP)[0], True)
        probe.check(MAIN_TIP)
        self.assertEqual(loads, [1])


class InMainRuleTest(unittest.TestCase):
    """The 2026-10-16 leak: branches re-pushed at main's own commit, and
    branches no PR ever used, kept forever although they hold nothing new."""

    def test_moved_branch_whose_tip_is_in_main_is_deleted(self):
        pull = pr(merged_at="2026-08-24T11:00:00Z")
        decision = call_contained(pull, MAIN_TIP, containment())
        self.assertTrue(decision.delete)
        self.assertIn("already in main", decision.reason)

    def test_moved_closed_unmerged_branch_in_main_is_deleted(self):
        decision = call_contained(pr(), MAIN_TIP, containment())
        self.assertTrue(decision.delete)

    def test_moved_branch_with_commits_not_in_main_is_kept(self):
        pull = pr(merged_at="2026-08-24T11:00:00Z")
        probe = containment(compares={UNIQUE_TIP: (3, None)})
        decision = call_contained(pull, UNIQUE_TIP, probe)
        self.assertFalse(decision.delete)
        self.assertIn("has moved", decision.reason)

    def test_moved_branch_is_kept_when_containment_cannot_tell(self):
        pull = pr(merged_at="2026-08-24T11:00:00Z")
        decision = call_contained(pull, UNIQUE_TIP, containment(budget=0))
        self.assertFalse(decision.delete)
        self.assertIn("has moved", decision.reason)

    def test_moved_in_main_branch_held_by_an_open_pr_is_kept(self):
        pull = pr(merged_at="2026-08-24T11:00:00Z")
        decision = decide(pull, {pull["head_ref"]: MAIN_TIP}, {pull["head_ref"]},
                          NOW, contained=containment())
        self.assertFalse(decision.delete)
        self.assertIn("another open PR", decision.reason)

    def test_compare_ahead_by_zero_counts_as_in_main(self):
        probe = containment(compares={UNIQUE_TIP: (0, OLD)})
        self.assertEqual(probe.check(UNIQUE_TIP), (True, NOW - timedelta(hours=96)))
        probe.check(UNIQUE_TIP)
        self.assertEqual(probe.calls, [UNIQUE_TIP])  # cached, one request

    def test_main_history_hit_needs_no_compare(self):
        probe = containment()
        self.assertTrue(probe(MAIN_TIP))
        self.assertEqual(probe.calls, [])

    def test_no_pr_branch_in_main_and_old_is_deleted(self):
        decision = decide_stray("claude/x", MAIN_TIP, set(), NOW, True,
                                NOW - timedelta(hours=96))
        self.assertTrue(decision.delete)

    def test_no_pr_branch_in_main_but_young_is_kept(self):
        decision = decide_stray("claude/x", MAIN_TIP, set(), NOW, True,
                                NOW - timedelta(hours=12))
        self.assertFalse(decision.delete)
        self.assertIn("old", decision.reason)

    def test_no_pr_branch_with_commits_not_in_main_is_kept(self):
        decision = decide_stray("claude/x", UNIQUE_TIP, set(), NOW, False, None)
        self.assertFalse(decision.delete)
        self.assertIn("commits not in main", decision.reason)

    def test_no_pr_branch_is_kept_when_containment_cannot_tell(self):
        self.assertFalse(
            decide_stray("claude/x", UNIQUE_TIP, set(), NOW, None, None).delete
        )

    def test_no_pr_branch_with_an_open_pr_is_kept(self):
        decision = decide_stray("claude/x", MAIN_TIP, {"claude/x"}, NOW, True,
                                NOW - timedelta(hours=96))
        self.assertFalse(decision.delete)
        self.assertIn("open PR", decision.reason)

    def test_no_pr_protected_names_are_kept(self):
        for ref in ("main", "gh-pages", "master", "release/2026-10", "hotfix/x"):
            with self.subTest(ref=ref):
                decision = decide_stray(ref, MAIN_TIP, set(), NOW, True,
                                        NOW - timedelta(hours=999))
                self.assertFalse(decision.delete)
                self.assertIn("protected", decision.reason)

    def test_run_deletes_contained_strays_and_keeps_the_rest(self):
        branches = {
            "claude/old-in-main": MAIN_TIP,
            "claude/young-in-main": "e" * 40,
            "claude/unique": UNIQUE_TIP,
            "claude/open-pr": MAIN_TIP,
            "gh-pages": MAIN_TIP,
        }
        probe = containment(main={MAIN_TIP: OLD, "e" * 40: YOUNG},
                            compares={UNIQUE_TIP: (1, None)})
        github = FakeGitHub(branches, open_refs={"claude/open-pr"})
        out = io.StringIO()

        deleted = run(github, [], DEFAULT_PROTECTED, 24.0, False, out, now=NOW,
                      containment=probe, strays=sorted(branches))

        self.assertEqual(deleted, 1)
        self.assertEqual(github.deleted, ["claude/old-in-main"])

    def test_run_rechecks_a_stray_that_gained_a_commit(self):
        ref = "claude/x"

        def push(github):
            github._branch_shas[ref] = UNIQUE_TIP

        probe = containment(compares={UNIQUE_TIP: (1, None)})
        github = FakeGitHub({ref: MAIN_TIP}, after_snapshot=push)
        out = io.StringIO()

        deleted = run(github, [], DEFAULT_PROTECTED, 24.0, False, out, now=NOW,
                      containment=probe, strays=[ref])

        self.assertEqual(deleted, 0)
        self.assertEqual(github.deleted, [])
        self.assertIn("commits not in main", out.getvalue())

    def test_max_deletes_stops_the_run(self):
        prs = [
            pr(number=n, head_ref="claude/%d" % n, merged_at="2026-08-24T11:00:00Z")
            for n in range(5)
        ]
        github = FakeGitHub({p["head_ref"]: "a" * 40 for p in prs})
        out = io.StringIO()
        deleted = run(github, prs, DEFAULT_PROTECTED, 24.0, False, out, now=NOW,
                      sleep=lambda _: None, max_deletes=2)
        self.assertEqual(deleted, 2)
        self.assertIn("max-deletes", out.getvalue())


def call_contained(pull, tip, probe):
    return decide(pull, {pull["head_ref"]: tip}, set(), NOW, contained=probe)


def payload(number, ref, repo=REPO, merged=True):
    return {
        "number": number,
        "state": "closed",
        "merged_at": "2026-08-01T00:00:00Z" if merged else None,
        "closed_at": "2026-08-01T00:00:00Z",
        "head": {"ref": ref, "sha": "a" * 40, "repo": {"full_name": repo}},
        "base": {"ref": "main", "repo": {"full_name": REPO}},
    }


class SweepInputsTest(unittest.TestCase):
    def test_sweep_reaches_past_the_old_5000_row_cap(self):
        # 6,800 closed PRs (the 2026-10-16 count); the oldest one still has a
        # live head. The old DEFAULT_SWEEP_SCAN of 5,000 never got there.
        rows = [payload(n, "claude/gone-%d" % n) for n in range(6800, 1, -1)]
        rows.append(payload(1, "claude/oldest", merged=False))
        prs, strays, complete = sweep_inputs(
            iter(rows), {"claude/oldest", "claude/never-pr"}, set()
        )
        self.assertTrue(complete)
        self.assertEqual([p["number"] for p in prs], [1])
        self.assertEqual(strays, ["claude/never-pr"])

    def test_live_heads_with_kept_branches_do_not_starve_older_ones(self):
        # 875 kept "moved" branches used to fill the 500-PR window.
        rows = [payload(n, "claude/moved-%d" % n) for n in range(2000, 1000, -1)]
        rows.append(payload(1, "claude/oldest", merged=False))
        live = {"claude/moved-%d" % n for n in range(2000, 1000, -1)} | {"claude/oldest"}
        prs, _, _ = sweep_inputs(iter(rows), live, set())
        self.assertIn(1, [p["number"] for p in prs])

    def test_a_branch_named_like_a_fork_pr_head_is_still_a_stray(self):
        rows = [payload(5, "claude/x", repo="someone/fork")]
        prs, strays, _ = sweep_inputs(iter(rows), {"claude/x"}, set())
        self.assertEqual(prs, [])
        self.assertEqual(strays, ["claude/x"])

    def test_open_pr_heads_are_not_strays(self):
        _, strays, _ = sweep_inputs(iter([]), {"claude/open", "claude/none"},
                                    {"claude/open", "main"})
        self.assertEqual(strays, ["claude/none"])

    def test_truncated_scan_skips_the_no_pr_rule(self):
        rows = [payload(n, "claude/%d" % n) for n in range(10)]
        _, strays, complete = sweep_inputs(iter(rows), {"claude/never-pr"}, set(),
                                           scan_cap=10)
        self.assertFalse(complete)
        self.assertEqual(strays, [])


class StrayPacingTest(unittest.TestCase):
    def test_stray_deletions_are_paced_but_the_first_is_not_delayed(self):
        refs = ["claude/a", "claude/b", "claude/c"]
        github = FakeGitHub({r: MAIN_TIP for r in refs})
        naps = []
        run(github, [], DEFAULT_PROTECTED, 24.0, False, io.StringIO(), now=NOW,
            containment=containment(), strays=refs, delete_delay=0.8,
            sleep=naps.append)
        self.assertEqual(len(github.deleted), 3)
        self.assertEqual(naps, [0.8, 0.8])

    def test_no_delay_configured_means_no_sleep(self):
        github = FakeGitHub({"claude/a": MAIN_TIP, "claude/b": MAIN_TIP})
        naps = []
        run(github, [], DEFAULT_PROTECTED, 24.0, False, io.StringIO(), now=NOW,
            containment=containment(), strays=["claude/a", "claude/b"],
            delete_delay=0, sleep=naps.append)
        self.assertEqual(naps, [])


class CompareBudgetTest(unittest.TestCase):
    def test_each_compare_spends_exactly_one_unit_of_budget(self):
        shas = ["1" * 40, "2" * 40, "3" * 40]
        probe = containment(compares={s: (1, None) for s in shas}, budget=2)
        self.assertEqual([probe.check(s)[0] for s in shas], [False, False, None])
        self.assertEqual(probe.calls, shas[:2])


class FakeResponse:
    def __init__(self, body):
        self._body = body

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class GitHubClientTest(unittest.TestCase):
    """The REST wrapper, with urlopen faked: no network."""

    def setUp(self):
        self.gh = GitHub("o/r", "tok")
        self.urls = []

    def fake_open(self, pages):
        pages = list(pages)

        def opener(request, timeout=None):
            self.urls.append(request.full_url)
            answer = pages.pop(0)
            if isinstance(answer, Exception):
                raise answer
            return FakeResponse(json.dumps(answer).encode())

        return mock.patch("branch_cleanup.urllib.request.urlopen", opener)

    def test_params_are_sent_as_a_query_string(self):
        with self.fake_open([[]]):
            list(self.gh._paginate("/repos/o/r/pulls", {"state": "open"}, 10))
        self.assertIn("?", self.urls[0])
        self.assertIn("state=open", self.urls[0])
        self.assertIn("per_page=100", self.urls[0])

    def test_pagination_stops_at_the_cap_and_does_not_fetch_another_page(self):
        full = [{"n": i} for i in range(100)]
        with self.fake_open([full, full]):
            got = list(self.gh._paginate("/x", {}, 150))
        self.assertEqual(len(got), 150)
        self.assertEqual(len(self.urls), 2)

    def test_main_history_defaults_to_five_thousand_commits(self):
        """50 full pages: the window that makes reset-to-main tips need no compare."""
        pages = [[{"sha": "%040d" % (p * 100 + i)} for i in range(100)] for p in range(60)]
        with self.fake_open(pages):
            got = self.gh.main_commits("main")
        self.assertEqual(len(got), 5000)

    def test_pagination_cap_counts_from_zero(self):
        full = [{"n": i} for i in range(100)]
        with self.fake_open([full]):
            got = list(self.gh._paginate("/x", {}, 100))
        self.assertEqual(len(got), 100)
        self.assertEqual(len(self.urls), 1)

    def test_a_missing_branch_is_none_not_an_error(self):
        err = urllib.error.HTTPError("u", 404, "nf", {}, None)
        with self.fake_open([err]):
            self.assertIsNone(self.gh.branch_sha("claude/gone"))

    def test_a_404_is_an_error_when_the_caller_did_not_expect_it(self):
        err = urllib.error.HTTPError("u", 404, "nf", {}, None)
        with self.fake_open([err]):
            with self.assertRaises(urllib.error.HTTPError):
                self.gh._request("GET", "/repos/o/r")

    def test_transient_errors_are_retried_with_backoff(self):
        naps = []
        flaky = urllib.error.HTTPError("u", 503, "busy", {}, None)
        with mock.patch("branch_cleanup.time.sleep", naps.append), \
                self.fake_open([flaky, flaky, {"ok": 1}]):
            self.assertEqual(self.gh._request("GET", "/x"), {"ok": 1})
        self.assertEqual(naps, [1, 2])

    def test_rate_limit_and_server_errors_are_retried(self):
        for code in (403, 429, 500, 502, 503, 504):
            limited = urllib.error.HTTPError("u", code, "slow down", {}, None)
            with mock.patch("branch_cleanup.time.sleep", lambda _: None), \
                    self.fake_open([limited, {"ok": 1}]):
                self.assertEqual(self.gh._request("GET", "/x"), {"ok": 1}, code)

    def test_a_client_error_is_not_retried(self):
        for code in (401, 404, 422):
            self.urls.clear()
            bad = urllib.error.HTTPError("u", code, "no", {}, None)
            with mock.patch("branch_cleanup.time.sleep", lambda _: None), \
                    self.fake_open([bad, {"ok": 1}]):
                with self.assertRaises(urllib.error.HTTPError):
                    self.gh._request("GET", "/x")
            self.assertEqual(len(self.urls), 1, code)

    def test_retries_stop_after_four_attempts(self):
        busy = urllib.error.HTTPError("u", 502, "busy", {}, None)
        naps = []
        with mock.patch("branch_cleanup.time.sleep", naps.append), \
                self.fake_open([busy] * 5):
            with self.assertRaises(urllib.error.HTTPError):
                self.gh._request("GET", "/x")
        self.assertEqual(len(self.urls), 4)
        self.assertEqual(naps, [1, 2, 4])  # no pointless nap before giving up

    def test_compare_reads_the_merge_base_date_and_tolerates_its_absence(self):
        compare = self.gh.compare_to("main")
        with self.fake_open([{"ahead_by": 3, "merge_base_commit": {
                "commit": {"committer": {"date": "2026-08-01T00:00:00Z"}}}}]):
            self.assertEqual(compare("abc"), (3, "2026-08-01T00:00:00Z"))
        with self.fake_open([{"ahead_by": 2}]):
            self.assertEqual(compare("abc"), (2, None))

    def test_main_needs_either_pr_or_sweep(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            main(["--repo", "o/r"])


class MessageAndRequestShapeTest(unittest.TestCase):
    def test_moved_reason_shows_seven_character_shas(self):
        pull = pr()
        decision = call(pull, branch_shas={pull["head_ref"]: "b" * 40})
        self.assertIn("(%s != %s)" % ("b" * 7, "a" * 7), decision.reason)

    def test_in_main_reason_shows_a_seven_character_tip(self):
        pull = pr(merged_at="2026-08-24T11:00:00Z")
        decision = call_contained(pull, MAIN_TIP, containment())
        self.assertIn("its tip %s is" % ("f" * 7), decision.reason)

    def test_one_run_deletes_at_most_200_branches_by_default(self):
        # ~3 requests per deletion against a 1,000/hour token budget.
        self.assertEqual(DEFAULT_MAX_DELETES, 200)

    def test_closed_pulls_for_head_filters_on_the_repo_owner(self):
        gh = GitHub("Owner/Repo", "t")
        with mock.patch.object(GitHub, "_paginate", return_value=[]) as paginate:
            gh.closed_pulls_for_head("claude/x")
        self.assertEqual(paginate.call_args[0][1]["head"], "Owner:claude/x")

    def test_compare_asks_for_a_single_commit_page(self):
        gh = GitHub("Owner/Repo", "t")
        payload = {"ahead_by": 0, "merge_base_commit": {}}
        with mock.patch.object(GitHub, "_request", return_value=payload) as req:
            gh.compare_to("main")("abc")
        self.assertEqual(req.call_args[0][2], {"per_page": 1})


if __name__ == "__main__":
    unittest.main()
