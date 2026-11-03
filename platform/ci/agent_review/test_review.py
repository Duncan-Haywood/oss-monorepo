#!/usr/bin/env python3
"""Unit tests for agent_review pure helpers (no gh/network)."""

import dataclasses
import subprocess
import unittest
from unittest import mock

import review
from review import (
    author_matches_skip,
    checks_all_success,
    count_allowed_approvals,
    load_config,
    mergeable_state_ok,
    path_touches_ventures,
    pr_from_same_repo,
    reviewer_already_approved,
    untrusted_reason,
)


class ConfigTest(unittest.TestCase):
    def test_loads_four_reviewers(self):
        config = load_config()
        self.assertEqual(config.required_approvals, 2)
        self.assertEqual(set(config.reviewers.keys()), {"gh", "kilo", "cursor", "claude"})


class AuthorSkipTest(unittest.TestCase):
    def test_exact_match(self):
        self.assertTrue(
            author_matches_skip("kilo-code-bot[bot]", ("kilo-code-bot[bot]",))
        )

    def test_does_not_match_other_author(self):
        self.assertFalse(
            author_matches_skip("app/cursor", ("kilo-code-bot[bot]",))
        )

    def test_cursor_aliases(self):
        self.assertTrue(author_matches_skip("cursor[bot]", ("app/cursor",)))
        self.assertTrue(author_matches_skip("app/cursor", ("cursor[bot]",)))


class ChecksAllSuccessTest(unittest.TestCase):
    def test_empty_blocks(self):
        ok, _ = checks_all_success([])
        self.assertFalse(ok)

    def test_pending_blocks(self):
        ok, reasons = checks_all_success(
            [{"name": "CI", "status": "in_progress", "conclusion": None}]
        )
        self.assertFalse(ok)
        self.assertTrue(any("in_progress" in r for r in reasons))

    def test_failure_blocks(self):
        ok, _ = checks_all_success(
            [{"name": "CI", "status": "completed", "conclusion": "failure"}]
        )
        self.assertFalse(ok)

    def test_success_passes(self):
        ok, _ = checks_all_success(
            [
                {"name": "a", "status": "completed", "conclusion": "success"},
                {"name": "b", "status": "completed", "conclusion": "skipped"},
            ]
        )
        self.assertTrue(ok)

    def test_ignores_in_progress_review_jobs(self):
        ok, _ = checks_all_success(
            [
                {"name": "portfolio-validate", "status": "completed", "conclusion": "success"},
                {"name": "review-gh", "status": "in_progress", "conclusion": None},
                {"name": "review-kilo", "status": "queued", "conclusion": None},
            ]
        )
        self.assertTrue(ok)

    def test_ignores_failed_review_and_auto_merge_jobs(self):
        ok, _ = checks_all_success(
            [
                {"name": "CI", "status": "completed", "conclusion": "success"},
                {"name": "review-cursor", "status": "completed", "conclusion": "failure"},
                {"name": "auto-merge", "status": "completed", "conclusion": "failure"},
            ]
        )
        self.assertTrue(ok)

    def test_only_self_checks_do_not_block(self):
        ok, _ = checks_all_success(
            [
                {"name": "Agent cross-review / review-claude", "status": "in_progress", "conclusion": None},
                {"name": "resolve-pr", "status": "completed", "conclusion": "success"},
            ]
        )
        self.assertTrue(ok)


class CountApprovalsTest(unittest.TestCase):
    def test_counts_distinct_allowed_approvers(self):
        reviews = [
            {
                "state": "APPROVED",
                "user": {"login": "kilo-code-bot[bot]"},
            },
            {
                "state": "APPROVED",
                "user": {"login": "cursor[bot]"},
            },
            {
                "state": "APPROVED",
                "user": {"login": "Duncan-Haywood"},
            },
        ]
        approvers = count_allowed_approvals(
            reviews,
            frozenset(
                {
                    "kilo-code-bot[bot]",
                    "cursor[bot]",
                    "portfolio-reviewer-gh[bot]",
                    "portfolio-reviewer-claude[bot]",
                }
            ),
        )
        self.assertEqual(approvers, {"kilo-code-bot[bot]", "cursor[bot]"})

    def test_superseded_approval_does_not_count(self):
        reviews = [
            {
                "state": "APPROVED",
                "commit_id": "aaa",
                "submitted_at": "2026-08-24T10:00:00Z",
                "user": {"login": "kilo-code-bot[bot]"},
            },
            {
                "state": "CHANGES_REQUESTED",
                "commit_id": "bbb",
                "submitted_at": "2026-08-24T11:00:00Z",
                "user": {"login": "kilo-code-bot[bot]"},
            },
        ]
        allowed = frozenset({"kilo-code-bot[bot]", "cursor[bot]"})
        self.assertEqual(count_allowed_approvals(reviews, allowed), set())
        self.assertFalse(
            reviewer_already_approved(reviews, "kilo-code-bot[bot]")
        )

    def test_comment_after_approve_still_counts(self):
        reviews = [
            {
                "state": "APPROVED",
                "commit_id": "abc",
                "submitted_at": "2026-08-24T10:00:00Z",
                "user": {"login": "cursor[bot]"},
            },
            {
                "state": "COMMENTED",
                "commit_id": "abc",
                "submitted_at": "2026-08-24T11:00:00Z",
                "user": {"login": "cursor[bot]"},
            },
        ]
        allowed = frozenset({"cursor[bot]"})
        self.assertEqual(
            count_allowed_approvals(reviews, allowed, "abc"), {"cursor[bot]"}
        )

    def test_stale_head_sha_does_not_count(self):
        reviews = [
            {
                "state": "APPROVED",
                "commit_id": "old",
                "submitted_at": "2026-08-24T10:00:00Z",
                "user": {"login": "cursor[bot]"},
            },
        ]
        allowed = frozenset({"cursor[bot]"})
        self.assertEqual(count_allowed_approvals(reviews, allowed, "new"), set())
        self.assertFalse(reviewer_already_approved(reviews, "cursor[bot]", "new"))
        self.assertTrue(reviewer_already_approved(reviews, "cursor[bot]", "old"))


class HumanGateTest(unittest.TestCase):
    def test_ventures_paths_are_detected(self):
        self.assertTrue(path_touches_ventures(["ventures/local-site-studio/app/page.tsx"]))
        self.assertFalse(path_touches_ventures(["platform/ci/agent_review/review.py"]))


class MergeableStateTest(unittest.TestCase):
    def test_clean_passes(self):
        ok, reasons = mergeable_state_ok({"mergeable_state": "clean"})
        self.assertTrue(ok)
        self.assertTrue(any("clean" in r for r in reasons))

    def test_has_hooks_passes(self):
        # "has_hooks" is clean plus a pre-receive hook; still fully protected.
        ok, _ = mergeable_state_ok({"mergeable_state": "has_hooks"})
        self.assertTrue(ok)

    def test_unstable_blocks(self):
        # A pending or failing (non-required) check on the head => unstable.
        ok, reasons = mergeable_state_ok({"mergeable_state": "unstable"})
        self.assertFalse(ok)
        self.assertTrue(any("unstable" in r for r in reasons))

    def test_blocked_behind_dirty_block(self):
        for state in ("blocked", "behind", "dirty"):
            ok, _ = mergeable_state_ok({"mergeable_state": state})
            self.assertFalse(ok, f"{state} should block merge")

    def test_unknown_or_missing_blocks(self):
        # GitHub reports "unknown" (or omits the field) while it recomputes the
        # head; a merge must wait rather than proceed on a stale/absent verdict.
        self.assertFalse(mergeable_state_ok({"mergeable_state": None})[0])
        self.assertFalse(mergeable_state_ok({})[0])


def _pr(head="o/r", base="o/r", association="OWNER", login="someone"):
    return {
        "head": {"repo": {"full_name": head} if head else None},
        "base": {"repo": {"full_name": base}},
        "author_association": association,
        "user": {"login": login},
    }


class UntrustedReasonTest(unittest.TestCase):
    def test_same_repo_collaborator_is_trusted(self):
        self.assertIsNone(untrusted_reason(_pr(association="COLLABORATOR")))

    def test_same_repo_bot_is_trusted(self):
        self.assertIsNone(untrusted_reason(_pr(association="NONE", login="cursor[bot]")))

    def test_fork_is_untrusted_even_from_owner(self):
        self.assertIn("human-gated", untrusted_reason(_pr(head="stranger/r")))

    def test_deleted_fork_is_untrusted(self):
        self.assertIn("deleted fork", untrusted_reason(_pr(head=None)))

    def test_outside_human_author_is_untrusted(self):
        reason = untrusted_reason(_pr(association="CONTRIBUTOR"))
        self.assertIn("author_association=CONTRIBUTOR", reason)


def _same_repo_pr(head_repo, base_repo="owner/repo"):
    return {
        "head": {"repo": {"full_name": head_repo} if head_repo else None},
        "base": {"repo": {"full_name": base_repo}},
    }


class SameRepoTest(unittest.TestCase):
    def test_same_repo_branch_passes(self):
        ok, _ = pr_from_same_repo(_same_repo_pr("owner/repo"))
        self.assertTrue(ok)

    def test_fork_blocked(self):
        ok, reason = pr_from_same_repo(_same_repo_pr("stranger/repo"))
        self.assertFalse(ok)
        self.assertIn("fork", reason)

    def test_deleted_fork_fails_closed(self):
        ok, _ = pr_from_same_repo(_same_repo_pr(None))
        self.assertFalse(ok)

    def test_missing_fields_fail_closed(self):
        ok, _ = pr_from_same_repo({})
        self.assertFalse(ok)


class MergeEligibleTest(unittest.TestCase):
    def test_merged_pr_is_refused_with_reason(self):
        pr = {"merged": True, "state": "closed", "draft": False}
        with mock.patch.object(review, "fetch_pull_request", return_value=pr), \
                mock.patch.object(review, "untrusted_reason", return_value=None):
            ok, reasons = review.merge_eligible(1)
        self.assertFalse(ok)
        self.assertEqual(reasons, ["already merged"])


class FrozenConfigTest(unittest.TestCase):
    def test_reviewer_config_is_immutable(self):
        rc = review.ReviewerConfig("k", "K", "login", ())
        with self.assertRaises(dataclasses.FrozenInstanceError):
            rc.key = "other"


class GhApiTest(unittest.TestCase):
    def test_nonzero_exit_raises(self):
        done = subprocess.CompletedProcess([], 1, stdout="", stderr="boom")
        with mock.patch.object(review.subprocess, "run", return_value=done):
            with self.assertRaises(RuntimeError):
                review.gh_api("repos/x/y")

    def test_zero_exit_parses_json(self):
        done = subprocess.CompletedProcess([], 0, stdout='{"a": 1}', stderr="")
        with mock.patch.object(review.subprocess, "run", return_value=done):
            self.assertEqual(review.gh_api("repos/x/y"), {"a": 1})


class ValidateRunnerTest(unittest.TestCase):
    def test_failure_returns_stdout_and_stderr_text(self):
        done = subprocess.CompletedProcess([], 2, stdout="out", stderr="err")
        with mock.patch.object(review.subprocess, "run", return_value=done) as run:
            ok, text = review.run_portfolio_validate()
        self.assertFalse(ok)
        self.assertEqual(text, "outerr")
        self.assertIs(run.call_args.kwargs["text"], True)

    def test_success(self):
        done = subprocess.CompletedProcess([], 0, stdout="", stderr="")
        with mock.patch.object(review.subprocess, "run", return_value=done):
            ok, _ = review.run_portfolio_validate()
        self.assertTrue(ok)


if __name__ == "__main__":
    unittest.main()
