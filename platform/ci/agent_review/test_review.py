#!/usr/bin/env python3
"""Unit tests for agent_review pure helpers (no gh/network)."""

import unittest

from review import (
    author_matches_skip,
    checks_all_success,
    count_allowed_approvals,
    load_config,
    path_touches_ventures,
    reviewer_already_approved,
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
    def test_ventures_paths_are_human_gated(self):
        self.assertTrue(path_touches_ventures(["ventures/local-site-studio/app/page.tsx"]))
        self.assertFalse(path_touches_ventures(["platform/ci/agent_review/review.py"]))


if __name__ == "__main__":
    unittest.main()
