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
import io
import unittest
from datetime import datetime, timedelta, timezone

from branch_cleanup import (
    DEFAULT_PROTECTED,
    decide,
    run,
    summarise_pr,
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


def call(pull, branch_shas=None, reserved=(), now=NOW, grace_hours=24.0):
    if branch_shas is None:
        branch_shas = {pull["head_ref"]: pull["head_sha"]}
    return decide(pull, branch_shas, set(reserved), now, grace_hours, DEFAULT_PROTECTED)


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
        for ref in ("main", "master", "develop", "gh-pages", "release/2026-08"):
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
    def __init__(self, branch_shas, open_refs=()):
        self._branch_shas = dict(branch_shas)
        self._open_refs = set(open_refs)
        self.deleted = []

    def branch_shas(self):
        return dict(self._branch_shas)

    def open_pr_refs(self, exclude=()):
        return set(self._open_refs)

    def delete_branch(self, ref):
        self.deleted.append(ref)


class RunTest(unittest.TestCase):
    def test_deletes_what_decide_approves_and_reports_it(self):
        merged = pr(number=1, head_ref="claude/one", merged_at="2026-08-24T11:00:00Z")
        waiting = pr(number=2, head_ref="claude/two", closed_at="2026-08-24T11:00:00Z")
        github = FakeGitHub({"claude/one": "a" * 40, "claude/two": "a" * 40})
        out = io.StringIO()

        deleted = run(github, [merged, waiting], DEFAULT_PROTECTED, 24.0, False, out)

        self.assertEqual(deleted, 1)
        self.assertEqual(github.deleted, ["claude/one"])
        self.assertIn("grace period ends", out.getvalue())

    def test_dry_run_deletes_nothing_but_still_counts(self):
        merged = pr(number=1, head_ref="claude/one", merged_at="2026-08-24T11:00:00Z")
        github = FakeGitHub({"claude/one": "a" * 40})
        out = io.StringIO()

        deleted = run(github, [merged], DEFAULT_PROTECTED, 24.0, True, out)

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
            delete_delay=0.8, sleep=naps.append)

        self.assertEqual(len(github.deleted), 3)
        self.assertEqual(naps, [0.8, 0.8])  # between deletions, not before the first

    def test_dry_run_never_sleeps(self):
        merged = pr(number=1, head_ref="claude/one", merged_at="2026-08-24T11:00:00Z")
        naps = []

        run(FakeGitHub({"claude/one": "a" * 40}), [merged], DEFAULT_PROTECTED, 24.0,
            True, io.StringIO(), delete_delay=0.8, sleep=naps.append)

        self.assertEqual(naps, [])

    def test_dry_run_reports_a_reused_ref_the_way_a_real_run_would(self):
        first = pr(number=1, head_ref="claude/shared", merged_at="2026-08-24T11:00:00Z")
        second = pr(number=2, head_ref="claude/shared", merged_at="2026-08-24T11:30:00Z")
        github = FakeGitHub({"claude/shared": "a" * 40})
        out = io.StringIO()

        deleted = run(github, [first, second], DEFAULT_PROTECTED, 24.0, True, out)

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

        deleted = run(github, [first, second], DEFAULT_PROTECTED, 24.0, False, out)

        self.assertEqual(deleted, 1)
        self.assertEqual(github.deleted, ["claude/shared"])
        self.assertIn("already gone", out.getvalue())


if __name__ == "__main__":
    unittest.main()
