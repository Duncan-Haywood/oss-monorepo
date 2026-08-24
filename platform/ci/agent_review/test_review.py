#!/usr/bin/env python3
"""Unit tests for agent_review pure helpers (no gh/network)."""

import unittest

from review import (
    author_matches_skip,
    checks_all_success,
    count_allowed_approvals,
    load_config,
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


if __name__ == "__main__":
    unittest.main()
