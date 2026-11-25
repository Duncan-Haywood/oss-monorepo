#!/usr/bin/env python3
"""Tests for the control-plane guard.

The pattern matcher has to agree with GitHub's on the lines this repo uses,
or the guard reports coverage CODEOWNERS does not actually give. The audit
verdict has to fail an unreviewed agent merge and stay quiet on everything
else, or main goes red on unrelated work and the check gets switched off.
"""

import json
import unittest
from unittest import mock

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

        with mock.patch.object(guard, "check_coverage", return_value=[]), \
             mock.patch.object(guard, "check_invariants", return_value=[]):
            self.assertEqual(guard.main(["--check-coverage"]), 0)
        with mock.patch.object(guard, "check_coverage", return_value=["x has no code owner"]), \
             mock.patch.object(guard, "check_invariants", return_value=[]):
            self.assertEqual(guard.main(["--check-coverage"]), 1)
        with mock.patch.object(guard, "check_coverage", return_value=[]), \
             mock.patch.object(guard, "check_invariants", return_value=["ruleset has bypass actors"]):
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

    def test_passing_risk_review_passes_without_owner(self):
        code, _ = guard.audit_verdict(["CLAUDE.md"], {"number": 1, "user": {"login": "bot"}}, [], {"owner"}, True)
        self.assertEqual(code, 0)

    def test_risk_review_must_come_from_mains_workflow(self):
        run = {"name": "risk-review", "conclusion": "success", "app": {"slug": "github-actions"},
               "check_suite": {"id": 7}}
        good = {7: {"path": ".github/workflows/priv-risk-review.yml", "event": "pull_request_target"}}
        self.assertTrue(guard.risk_review_ok([run], good))
        faked = {7: {"path": ".github/workflows/some-ci.yml", "event": "pull_request"}}
        self.assertFalse(guard.risk_review_ok([run], faked))
        wrong_event = {7: {"path": ".github/workflows/priv-risk-review.yml", "event": "pull_request"}}
        self.assertFalse(guard.risk_review_ok([run], wrong_event))
        self.assertFalse(guard.risk_review_ok([dict(run, conclusion="failure")], good))

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


def ruleset(**over):
    doc = json.loads(guard.RULESET.read_text(encoding="utf-8"))
    doc.update(over)
    return doc


class RulesetInvariants(unittest.TestCase):
    def test_repo_ruleset_is_clean(self):
        self.assertEqual(guard.ruleset_problems(ruleset()), [])

    def test_bypass_actor_is_refused(self):
        doc = ruleset(bypass_actors=[{"actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always"}])
        self.assertTrue(any("bypass" in p for p in guard.ruleset_problems(doc)))

    def test_dropping_a_required_check_is_refused(self):
        doc = ruleset()
        for rule in doc["rules"]:
            if rule["type"] == "required_status_checks":
                rule["parameters"]["required_status_checks"] = [
                    c for c in rule["parameters"]["required_status_checks"] if c["context"] != "adversarial-gate"
                ]
        self.assertIn(
            "required status check `adversarial-gate` is missing from the ruleset", guard.ruleset_problems(doc)
        )

    def test_check_from_any_app_is_refused(self):
        doc = ruleset()
        for rule in doc["rules"]:
            if rule["type"] == "required_status_checks":
                for c in rule["parameters"]["required_status_checks"]:
                    if c["context"] == "security-scan":
                        del c["integration_id"]
        self.assertTrue(any("security-scan" in p and "integration_id" in p for p in guard.ruleset_problems(doc)))

    def test_disabled_enforcement_is_refused(self):
        self.assertIn("ruleset enforcement is not `active`", guard.ruleset_problems(ruleset(enforcement="evaluate")))

    def test_code_owner_review_may_be_off(self):
        doc = ruleset()
        for rule in doc["rules"]:
            if rule["type"] == "pull_request":
                self.assertFalse(rule["parameters"]["require_code_owner_review"])


class GateWorkflowInvariants(unittest.TestCase):
    def text(self):
        return guard.GATE_WORKFLOW.read_text(encoding="utf-8")

    def test_repo_gate_workflow_is_clean(self):
        self.assertEqual(guard.gate_workflow_problems(self.text()), [])

    def test_missing_workflow_is_refused(self):
        self.assertEqual(guard.gate_workflow_problems(None), [".github/workflows/priv-security-gate.yml is missing"])

    def test_switching_to_pull_request_trigger_is_refused(self):
        weakened = self.text().replace("pull_request_target:", "pull_request:")
        self.assertTrue(any("pull_request_target" in p for p in guard.gate_workflow_problems(weakened)))

    def test_trigger_switch_is_refused_without_pyyaml(self):
        # The fallback must read the `on:` block, not any mention in the file:
        # here a comment still names pull_request_target.
        weakened = self.text().replace("pull_request_target:", "pull_request:  # was pull_request_target")
        with mock.patch.object(guard, "_load_yaml", return_value=None):
            self.assertTrue(any("pull_request_target" in p for p in guard.gate_workflow_problems(weakened)))
            self.assertEqual(guard.gate_workflow_problems(self.text()), [])

    def test_checking_out_the_pr_head_is_refused(self):
        weakened = self.text().replace(
            "persist-credentials: false",
            "persist-credentials: false\n          ref: ${{ github.event.pull_request.head.sha }}",
            1,
        )
        self.assertTrue(any("checks out the PR" in p for p in guard.gate_workflow_problems(weakened)))

    def test_renaming_a_required_job_is_refused(self):
        weakened = self.text().replace("\n  adversarial-gate:\n", "\n  adversarial-gate-v2:\n")
        self.assertTrue(any("adversarial-gate" in p for p in guard.gate_workflow_problems(weakened)))

    def test_continue_on_error_is_refused(self):
        weakened = self.text().replace("    timeout-minutes:", "    continue-on-error: true\n    timeout-minutes:", 1)
        self.assertTrue(any("continue-on-error" in p for p in guard.gate_workflow_problems(weakened)))

    def test_not_running_the_gate_script_is_refused(self):
        weakened = self.text().replace("platform/ci/adversarial_gate/gate.py", "platform/ci/adversarial_gate/noop.py")
        self.assertTrue(any("no longer runs platform/ci/adversarial_gate/gate.py" in p for p in guard.gate_workflow_problems(weakened)))

    def test_repo_invariants_hold(self):
        self.assertEqual(guard.check_invariants(), [])


class WithdrawnAndStaleApprovals(unittest.TestCase):
    """Red team 2026-11-14: any APPROVED review ever left on the PR passed the audit."""

    pr = {"number": 9, "user": {"login": "bot[bot]"}, "head": {"sha": "head"}}

    def verdict(self, *reviews):
        return guard.audit_verdict(["CLAUDE.md"], self.pr, list(reviews), {"owner"})[0]

    def at(self, login, state, sha):
        return {**review(login, state), "commit_id": sha}

    def test_approval_of_the_merged_head_passes(self):
        self.assertEqual(self.verdict(self.at("owner", "APPROVED", "head")), 0)

    def test_changes_requested_after_approval_fails(self):
        self.assertEqual(self.verdict(self.at("owner", "APPROVED", "head"),
                                      self.at("owner", "CHANGES_REQUESTED", "head")), 1)

    def test_dismissed_approval_fails(self):
        self.assertEqual(self.verdict(self.at("owner", "APPROVED", "old"),
                                      self.at("owner", "DISMISSED", "old")), 1)

    def test_comment_after_approval_keeps_it(self):
        self.assertEqual(self.verdict(self.at("owner", "APPROVED", "head"),
                                      self.at("owner", "COMMENTED", "head")), 0)

    def test_approval_of_an_older_commit_fails(self):
        self.assertEqual(self.verdict(self.at("owner", "APPROVED", "old")), 1)

    def test_re_approval_after_a_push_passes(self):
        self.assertEqual(self.verdict(self.at("owner", "APPROVED", "old"),
                                      self.at("owner", "CHANGES_REQUESTED", "old"),
                                      self.at("owner", "APPROVED", "head")), 0)


class AuditReadsEveryPageOfFiles(unittest.TestCase):
    """Red team 2026-11-14: a commit's files come 300 to a page; page 2 was never read."""

    def test_owned_file_on_the_second_page_fails_the_audit(self):
        import os
        from unittest import mock

        page1 = {"files": [{"filename": f"ventures/v/{i:03}.mjs"} for i in range(300)]}
        page2 = {"files": [{"filename": "platform/ci/control_plane_guard.py"}]}
        pr = {"number": 3, "merged_at": "t", "user": {"login": "bot[bot]"}, "head": {"sha": "h"}}

        def fake_get(path):
            if path.endswith("/pulls"):
                return [pr]
            return page2 if "page=2" in path else page1

        with mock.patch.dict(os.environ, {"GITHUB_REPOSITORY": "o/r"}), \
             mock.patch.object(guard, "gh_get", side_effect=fake_get), \
             mock.patch.object(guard, "gh_pages", return_value=[]), \
             mock.patch.object(guard, "summarize"):
            self.assertEqual(guard.main(["--audit-commit", "abc"]), 1)


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

        files = [{"filename": ".mcp.json"}, {"filename": "ventures/x/a.mjs"}]
        out = []
        with mock.patch.dict(os.environ, {"GITHUB_REPOSITORY": "o/r"}), \
             mock.patch.object(guard, "gh_pages", return_value=files), \
             mock.patch.object(guard, "summarize", side_effect=out.append):
            code = guard.main(["--pr", "5"])
        self.assertEqual(code, 0)
        self.assertEqual(len(out), 1)
        self.assertIn("- `.mcp.json`", out[0])
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
