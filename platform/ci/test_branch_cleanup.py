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
    expand_grace_prs,
    iter_closed_for_sweep,
    refs_in_grace,
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


if __name__ == "__main__":
    unittest.main()
