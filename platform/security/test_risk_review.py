"""Tests for platform/security/risk_review.py.  Run: cd platform/security && python3 -m unittest test_risk_review"""
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))

import risk_review as rr  # noqa: E402


def diff(path, added=(), removed_at=(), new=False):
    lines = [f"diff --git a/{path} b/{path}"]
    if new:
        lines.append("new file mode 100644")
    lines += [f"--- a/{path}", f"+++ b/{path}"]
    for n in removed_at:
        lines += [f"@@ -{n},1 +{n},0 @@", "-old line"]
    if added:
        lines.append(f"@@ -0,0 +1,{len(added)} @@")
        lines += [f"+{a}" for a in added]
    return "\n".join(lines) + "\n"


def ids(result):
    return {c["id"] for c in result["checks"]}


class ParseTests(unittest.TestCase):
    def test_added_and_removed_lines_are_tracked_per_file(self):
        files = rr.parse_unified_diff(diff("a.md", ["x", "y"], removed_at=[7]) + diff("b.py", ["z"], new=True))
        self.assertEqual(files["a.md"].added, ["x", "y"])
        self.assertEqual(files["a.md"].removed_old_lines, [7])
        self.assertEqual(files["b.py"].status, "A")

    def test_section_range_stops_at_next_heading_of_same_level(self):
        text = "# T\n## A\na\n## Guardrails\ng1\n### sub\ng2\n## After\nz\n"
        self.assertEqual(rr.section_range(text, r"^## Guardrails"), (4, 7))


class CheckTests(unittest.TestCase):
    def test_instruction_edit_triggers_the_instruction_check_but_run_data_does_not(self):
        r = rr.review(rr.parse_unified_diff(diff("CLAUDE.md", ["new rule"])))
        self.assertIn("C-instructions", ids(r))
        r = rr.review(rr.parse_unified_diff(diff("prompts/runs/2026-11-24-x.json", ["{}"], new=True)))
        self.assertNotIn("C-instructions", ids(r))

    def test_a_post_with_a_fake_user_count_triggers_the_claims_check(self):
        r = rr.review(rr.parse_unified_diff(diff("docs/posts/x.md", ["Trusted by 10,000 businesses"])))
        self.assertIn("L-claims", ids(r))

    def test_innerhtml_in_code_triggers_injection_but_not_in_markdown(self):
        r = rr.review(rr.parse_unified_diff(diff("ventures/x/app.mjs", ["el.innerHTML = q"])))
        self.assertIn("C-injection", ids(r))
        r = rr.review(rr.parse_unified_diff(diff("docs/x.md", ["el.innerHTML = q"])))
        self.assertNotIn("C-injection", ids(r))

    def test_plain_product_change_needs_no_owner(self):
        r = rr.review(rr.parse_unified_diff(diff("ventures/x/engine.mjs", ["export const a = 1;"])))
        self.assertEqual(r["escalate"], [])


class EscalationTests(unittest.TestCase):
    def test_a_likely_secret_escalates(self):
        r = rr.review(rr.parse_unified_diff(diff("x.env.example", ["KEY=AKIA" + "ABCDEFGHIJKLMNOP"])))
        self.assertTrue(r["secrets"])
        self.assertTrue(any("likely secret" in e for e in r["escalate"]))

    def test_sensitive_core_is_reported_but_needs_no_owner(self):
        # Owner, 2026-11-24: owner review only where "really human dependent".
        for path in [".github/workflows/priv-x.yml", ".claude/settings.json", "prompts/promptctl.py",
                     "platform/ci/control_plane_guard.py"]:
            r = rr.review(rr.parse_unified_diff(diff(path, ["x = 1"])))
            self.assertEqual(r["escalate"], [], path)
            self.assertIn(path, r["sensitive"], path)
        r = rr.review(rr.parse_unified_diff(diff(".github/workflows/x-ci.yml", ["on: push"])))
        self.assertEqual(r["sensitive"], [])
        r = rr.review(rr.parse_unified_diff(diff("prompts/goals.md", ["a new direction"])))
        self.assertEqual(r["escalate"], [])

    def test_the_gate_may_grow_but_not_shrink(self):
        co_base = "/a/ @o\n/b/ @o\n"
        grow = rr.parse_unified_diff(diff(".github/CODEOWNERS", ["/c/ @o"]))
        r = rr.review(grow, lambda p: co_base, head_text=lambda p: co_base + "/c/ @o\n")
        self.assertEqual(r["escalate"], [])
        r = rr.review(grow, lambda p: co_base, head_text=lambda p: "/a/ @o\n")
        self.assertTrue(any("no longer owned: /b/" in e for e in r["escalate"]))

    def test_dropping_a_required_check_or_rule_is_blocked(self):
        import json
        def rs(checks, types=("deletion", "required_status_checks")):
            rules = [{"type": t} for t in types if t != "required_status_checks"]
            rules.append({"type": "required_status_checks", "parameters": {
                "required_status_checks": [{"context": c} for c in checks]}})
            return json.dumps({"enforcement": "active", "rules": rules})
        d = rr.parse_unified_diff(diff(".github/rulesets/main.json", ["x"]))
        ok = rr.review(d, lambda p: rs(["a"]), head_text=lambda p: rs(["a", "risk-review"]))
        self.assertEqual(ok["escalate"], [])
        bad = rr.review(d, lambda p: rs(["a", "b"]), head_text=lambda p: rs(["a"]))
        self.assertTrue(any("required checks removed: b" in e for e in bad["escalate"]))
        bad = rr.review(d, lambda p: rs(["a"]), head_text=lambda p: rs(["a"], types=("required_status_checks",)))
        self.assertTrue(any("rules removed: deletion" in e for e in bad["escalate"]))

    def test_dropping_a_secret_pattern_from_the_reviewer_is_blocked(self):
        base = Path(rr.__file__).read_text()
        lines = base.splitlines(keepends=True)
        head = "".join(l for l in lines if '("Slack token"' not in l)
        self.assertNotEqual(base, head)
        d = rr.parse_unified_diff(diff("platform/security/risk_review.py", ["x"]))
        r = rr.review(d, lambda p: base, head_text=lambda p: head)
        self.assertTrue(any("SECRET_PATTERNS" in e for e in r["escalate"]))
        r = rr.review(d, lambda p: base, head_text=lambda p: base + "\n# comment\n")
        self.assertEqual(r["escalate"], [])

    def test_the_workflow_must_keep_running_mains_reviewer(self):
        base = "\n".join(rr.WORKFLOW_ANCHORS)
        d = rr.parse_unified_diff(diff(".github/workflows/priv-risk-review.yml", ["x"]))
        r = rr.review(d, lambda p: base, head_text=lambda p: base.replace("pull_request_target:", "pull_request:"))
        self.assertTrue(any("pull_request_target" in e for e in r["escalate"]))

    def test_deleting_a_gate_file_is_blocked(self):
        d = rr.parse_unified_diff(diff(".github/CODEOWNERS", removed_at=[1]))
        r = rr.review(d, lambda p: "/a/ @o\n", head_text=lambda p: None)
        self.assertTrue(any("file deleted" in e for e in r["escalate"]))


class GateTests(unittest.TestCase):
    """No approval path: blocked means fix it."""

    def verdict(self, files_diff, base=lambda p: None, head=lambda p: None):
        return rr.gate_exit(rr.review(rr.parse_unified_diff(files_diff), base, head_text=head))[0]

    def test_a_clean_pr_passes_even_with_triggered_checks_and_sensitive_files(self):
        self.assertEqual(self.verdict(diff("CLAUDE.md", ["new rule"])), 0)
        self.assertEqual(self.verdict(diff(".github/workflows/priv-x.yml", ["on: push"])), 0)

    def test_a_secret_fails(self):
        self.assertEqual(self.verdict(diff("x.txt", ["KEY=AKIA" + "ABCDEFGHIJKLMNOP"])), 1)

    def test_a_guardrail_cut_fails(self):
        base = "## Guardrails\nnever fabricate\n## After\n"
        self.assertEqual(self.verdict(diff("prompts/goals.md", removed_at=[2]), base=lambda p: base), 1)


class OwnerCoreTests(unittest.TestCase):
    """The owner-only core is read from .github/CODEOWNERS, not kept here."""

    def core(self, path):
        return rr.in_owner_core(path, rr.owner_core_rules())

    def test_privileged_workflows_and_session_start_code_are_core(self):
        for path in [".github/CODEOWNERS", ".github/workflows/priv-portfolio-pages.yml", ".claude/settings.json",
                     ".mcp.json", "prompts/promptctl.py", "platform/security/risk_review.py"]:
            self.assertTrue(self.core(path), path)

    def test_instructions_and_unprivileged_workflows_are_not_core(self):
        for path in ["CLAUDE.md", "AGENTS.md", "prompt.md", "prompts/goals.md", ".github/prompts/land-your-work.md",
                     ".github/workflows/ventures-tests.yml", "docs/posts/x.md"]:
            self.assertFalse(self.core(path), path)


class RenderTests(unittest.TestCase):
    def test_render_says_nothing_blocked(self):
        out = rr.render(rr.review(rr.parse_unified_diff(diff("CLAUDE.md", ["x"]))))
        self.assertIn("Blocked:** nothing", out)
        self.assertIn("- [ ] **Agent instructions changed**", out)


if __name__ == "__main__":
    unittest.main()
