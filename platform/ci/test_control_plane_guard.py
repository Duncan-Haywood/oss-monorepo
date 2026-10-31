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


if __name__ == "__main__":
    unittest.main()
