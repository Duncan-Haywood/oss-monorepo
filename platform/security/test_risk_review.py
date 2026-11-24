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

    def test_owner_core_escalates_and_instructions_do_not(self):
        r = rr.review(rr.parse_unified_diff(diff(".github/workflows/priv-x.yml", ["on: push"])))
        self.assertTrue(any("owner-only core" in e for e in r["escalate"]))
        r = rr.review(rr.parse_unified_diff(diff(".github/workflows/x-ci.yml", ["on: push"])))
        self.assertFalse(any("owner-only core" in e for e in r["escalate"]))
        r = rr.review(rr.parse_unified_diff(diff("prompts/goals.md", ["a new direction"])))
        self.assertEqual(r["escalate"], [])

    def test_removing_a_line_inside_the_guardrails_escalates_but_outside_does_not(self):
        base = "# Goals\n## Mission\nm\n## Guardrails (every track)\n### Hard limits\nnever fabricate\n## After\n"
        inside = rr.parse_unified_diff(diff("prompts/goals.md", removed_at=[6]))
        outside = rr.parse_unified_diff(diff("prompts/goals.md", removed_at=[3]))
        r = rr.review(inside, lambda p: base)
        self.assertTrue(any("protected section" in e for e in r["escalate"]))
        r = rr.review(outside, lambda p: base)
        self.assertEqual(r["escalate"], [])

    def test_changing_an_existing_licence_escalates_but_a_new_one_does_not(self):
        r = rr.review(rr.parse_unified_diff(diff("ventures/x/LICENSE", ["All rights reserved"])))
        self.assertTrue(any("licence" in e for e in r["escalate"]))
        r = rr.review(rr.parse_unified_diff(diff("ventures/y/LICENSE", ["MIT"], new=True)))
        self.assertFalse(any("licence" in e for e in r["escalate"]))


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
    def test_render_says_no_owner_needed_when_nothing_escalates(self):
        out = rr.render(rr.review(rr.parse_unified_diff(diff("CLAUDE.md", ["x"]))))
        self.assertIn("Owner review needed:** no", out)
        self.assertIn("- [ ] **Agent instructions changed**", out)


if __name__ == "__main__":
    unittest.main()
