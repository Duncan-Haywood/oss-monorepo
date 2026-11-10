#!/usr/bin/env python3
"""Tests for the control-plane guard.

The pattern matcher has to agree with GitHub's on the lines this repo uses,
or the guard reports coverage CODEOWNERS does not actually give. The audit
verdict has to fail an unreviewed agent merge and stay quiet on everything
else, or main goes red on unrelated work and the check gets switched off.
"""

import unittest

import control_plane_guard as guard

RULES = guard.parse_codeowners(
    """
# comment
/CLAUDE.md          @owner
**/AGENTS.md        @owner
/prompts/           @owner
/.github/           @owner @org/team
*.pem               @owner
/prompts/runs/
"""
)


class Patterns(unittest.TestCase):
    def owned(self, path):
        return bool(guard.owners_for(path, RULES))

    def test_anchored_file_matches_only_at_root(self):
        self.assertTrue(self.owned("CLAUDE.md"))
        self.assertFalse(self.owned("ventures/CLAUDE.md"))

    def test_double_star_matches_at_any_depth(self):
        self.assertTrue(self.owned("AGENTS.md"))
        self.assertTrue(self.owned("ventures/x/AGENTS.md"))

    def test_directory_covers_everything_beneath(self):
        self.assertTrue(self.owned(".github/workflows/a.yml"))
        self.assertFalse(self.owned(".githubx/a.yml"))

    def test_unanchored_glob_matches_anywhere(self):
        self.assertTrue(self.owned("deep/dir/key.pem"))

    def test_later_ownerless_line_unowns(self):
        self.assertTrue(self.owned("prompts/goals.md"))
        self.assertFalse(self.owned("prompts/runs/r.json"))

    def test_team_owners_are_not_logins(self):
        self.assertEqual(guard.owner_logins(RULES), {"owner"})


class MiddleSlashAnchors(unittest.TestCase):
    """A pattern with a slash in the middle is anchored to the root, as in gitignore."""

    def test_inner_slash_pattern_does_not_match_nested_copy(self):
        rules = guard.parse_codeowners("docs/*.md @owner\n")
        self.assertTrue(guard.owners_for("docs/a.md", rules))
        self.assertFalse(guard.owners_for("ventures/docs/a.md", rules))


class MainExitCode(unittest.TestCase):
    def test_check_coverage_exit_code_follows_problems(self):
        from unittest import mock

        with mock.patch.object(guard, "check_coverage", return_value=[]):
            self.assertEqual(guard.main(["--check-coverage"]), 0)
        with mock.patch.object(guard, "check_coverage", return_value=["x has no code owner"]):
            self.assertEqual(guard.main(["--check-coverage"]), 1)


class QuestionMark(unittest.TestCase):
    def test_question_mark_is_exactly_one_non_slash_character(self):
        rules = guard.parse_codeowners("/key-?.pem @owner\n")
        self.assertTrue(guard.owners_for("key-1.pem", rules))
        self.assertFalse(guard.owners_for("key-12.pem", rules))
        self.assertFalse(guard.owners_for("key-.pem", rules))
        self.assertFalse(guard.owners_for("key-/.pem", rules))


class RepoCodeowners(unittest.TestCase):
    def test_real_file_covers_every_sample(self):
        rules = guard.parse_codeowners(guard.CODEOWNERS.read_text(encoding="utf-8"))
        self.assertEqual(guard.check_coverage(rules), [])

    def test_coverage_notices_a_deleted_line(self):
        text = guard.CODEOWNERS.read_text(encoding="utf-8")
        weakened = "\n".join(l for l in text.splitlines() if not l.startswith("/.claude/"))
        problems = guard.check_coverage(guard.parse_codeowners(weakened))
        self.assertIn(".claude/settings.json has no code owner", problems)


def review(login, state="APPROVED"):
    return {"user": {"login": login}, "state": state}


class Star(unittest.TestCase):
    def test_star_consumes_one_token_then_literal_follows(self):
        rules = guard.parse_codeowners("*.pem @owner\n")
        self.assertTrue(guard.owners_for("a.pem", rules))
        self.assertFalse(guard.owners_for("apem", rules))


class Audit(unittest.TestCase):
    pr = {"number": 7, "user": {"login": "kilo-code-bot[bot]"}}

    def test_untouched_control_plane_passes(self):
        self.assertEqual(guard.audit_verdict([], None, [], {"owner"})[0], 0)

    def test_owner_approval_passes(self):
        code, _ = guard.audit_verdict(["CLAUDE.md"], self.pr, [review("Owner")], {"owner"})
        self.assertEqual(code, 0)

    def test_bot_approvals_alone_fail(self):
        reviews = [review("cursor[bot]"), review("portfolio-reviewer-gh[bot]")]
        code, msg = guard.audit_verdict(["CLAUDE.md"], self.pr, reviews, {"owner"})
        self.assertEqual(code, 1)
        self.assertIn("CLAUDE.md", msg)

    def test_owner_comment_is_not_approval(self):
        code, _ = guard.audit_verdict(
            ["CLAUDE.md"], self.pr, [review("owner", "COMMENTED")], {"owner"}
        )
        self.assertEqual(code, 1)

    def test_direct_push_fails(self):
        self.assertEqual(guard.audit_verdict([".mcp.json"], None, [], {"owner"})[0], 1)

    def test_owner_identity_warns_without_failing(self):
        pr = {"number": 8, "user": {"login": "owner"}}
        code, msg = guard.audit_verdict(["CLAUDE.md"], pr, [], {"owner"})
        self.assertEqual(code, 0)
        self.assertTrue(msg.startswith("::warning::"))


class TrailingDoubleStar(unittest.TestCase):
    def test_dir_double_star_matches_nested_depth(self):
        rules = guard.parse_codeowners("/docs/** @owner\n")
        self.assertTrue(guard.owners_for("docs/a/b/c.md", rules))
        self.assertTrue(guard.owners_for("docs/a.md", rules))


class Pagination(unittest.TestCase):
    def test_gh_pages_stops_after_limit_full_pages(self):
        from unittest import mock
        with mock.patch.object(guard, "gh_get", return_value=[0] * 100) as get:
            items = guard.gh_pages("/x", limit=3)
        self.assertEqual(get.call_count, 3)
        self.assertEqual(len(items), 300)


class PrSummary(unittest.TestCase):
    def test_pr_mode_lists_touched_control_plane_files(self):
        import os
        from unittest import mock

        files = [{"filename": "CLAUDE.md"}, {"filename": "ventures/x/a.mjs"}]
        out = []
        with mock.patch.dict(os.environ, {"GITHUB_REPOSITORY": "o/r"}), \
             mock.patch.object(guard, "gh_pages", return_value=files), \
             mock.patch.object(guard, "summarize", side_effect=out.append):
            code = guard.main(["--pr", "5"])
        self.assertEqual(code, 0)
        self.assertEqual(len(out), 1)
        self.assertIn("- `CLAUDE.md`", out[0])
        self.assertNotIn("ventures/x/a.mjs", out[0])


class AuditCommitPicksFirstMergedPr(unittest.TestCase):
    def test_reviews_are_read_for_the_first_merged_pr(self):
        import os
        from unittest import mock

        prs = [
            {"number": 1, "merged_at": "t", "user": {"login": "a"}},
            {"number": 2, "merged_at": "t", "user": {"login": "b"}},
        ]

        def fake_get(path):
            return prs if path.endswith("/pulls") else {"files": [{"filename": "CLAUDE.md"}]}

        seen = []

        def fake_pages(path):
            seen.append(path)
            return []

        with mock.patch.dict(os.environ, {"GITHUB_REPOSITORY": "o/r"}), \
             mock.patch.object(guard, "gh_get", side_effect=fake_get), \
             mock.patch.object(guard, "gh_pages", side_effect=fake_pages), \
             mock.patch.object(guard, "summarize"):
            guard.main(["--audit-commit", "abc"])
        self.assertEqual(seen, ["/repos/o/r/pulls/1/reviews"])


class PagingAndCli(unittest.TestCase):
    def test_gh_pages_stops_at_limit(self):
        from unittest import mock

        calls = []

        def full_page(path):
            calls.append(path)
            return [1] * 100

        with mock.patch.object(guard, "gh_get", side_effect=full_page):
            items = guard.gh_pages("/x", limit=3)
        self.assertEqual(len(calls), 3)
        self.assertEqual(len(items), 300)

    def test_gh_pages_default_limit_is_30(self):
        from unittest import mock

        calls = []

        def full_page(path):
            calls.append(path)
            return [1] * 100

        with mock.patch.object(guard, "gh_get", side_effect=full_page):
            guard.gh_pages("/x")
        self.assertEqual(len(calls), 30)

    def test_a_mode_flag_is_required(self):
        with self.assertRaises(SystemExit) as cm:
            guard.main([])
        self.assertEqual(cm.exception.code, 2)


if __name__ == "__main__":
    unittest.main()
