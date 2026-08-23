#!/usr/bin/env python3
"""Tests for validate_probe_index.py.

The check that matters is the negative one. A validator that passes on the
current tree proves nothing on its own -- the tree was just edited to make it
pass. These tests replay the two index cells as they actually read before
2026-08-23 and assert the script rejects them, so the thing being pinned is
that it catches the drift it was written for, not that today's file is green.

Usage: python3 -m unittest discover -s portfolio/pipeline/probes -p 'test_validate_probe_index.py'
"""

import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import validate_probe_index as vpi  # noqa: E402


# The eaa-wcag-triage cell as it read after the SC 2.5.3 pass and before SC
# 1.3.4 landed later the same day. The split is the stale half; "2 disclosed as
# decidable but unbuilt" is what routed sessions at rules that did not exist.
STALE_WCAG_CELL = (
    "Coverage split now 17 reasoned about / 9 deferred to a human / "
    "2 disclosed as decidable but unbuilt; fixture validation byte-identical; "
    "`liability_containment` deliberately unmoved at 5."
)

# The mcp-drift-watch cell as it read while the corpus-3 model run was already
# committed: the run named as pending, its result absent.
STALE_MCP_CELL = (
    "Corpus 3's 148 hand labels are committed so that question costs one run."
)


class TestCatchesTheDriftItWasWrittenFor(unittest.TestCase):
    def test_stale_wcag_split_is_rejected(self):
        failures = vpi.run(index_text=STALE_WCAG_CELL + " " + STALE_MCP_CELL)
        self.assertTrue(
            any("eaa-wcag-triage" in f for f in failures),
            "the pre-1.3.4 coverage split should fail the check",
        )

    def test_stale_mcp_cell_is_rejected(self):
        failures = vpi.run(index_text=STALE_WCAG_CELL + " " + STALE_MCP_CELL)
        self.assertTrue(
            any("mcp-drift-watch" in f for f in failures),
            "an index omitting the committed corpus-3 F1 span should fail the check",
        )

    def test_empty_index_fails_every_check(self):
        failures = vpi.run(index_text="")
        self.assertEqual(len(failures), len(vpi.CHECKS))


class TestDerivationsComeFromArtifacts(unittest.TestCase):
    def test_wcag_split_is_derived_not_hardcoded(self):
        """The required string must be built from the catalog's real counts."""
        described, required = vpi.check_wcag_coverage_split()
        rules = vpi._load_package_module(
            os.path.join(HERE, "eaa-wcag-triage", "src"), "wcag_triage.rules"
        )
        automated = sum(1 for c in rules.COVERAGE if c.coverage == "automated")
        partial = sum(1 for c in rules.COVERAGE if c.coverage == "partial")
        manual = sum(1 for c in rules.COVERAGE if c.coverage == "manual")
        unbuilt = sum(1 for c in rules.COVERAGE if c.coverage == "unimplemented")

        self.assertIn(f"{automated + partial} reasoned about", required[0])
        self.assertIn(f"{manual} deferred to a human", required[0])
        self.assertIn(f"{unbuilt} disclosed as unbuilt", required[0])
        self.assertIn(str(automated + partial), described)

    def test_every_unimplemented_row_must_be_named(self):
        rules = vpi._load_package_module(
            os.path.join(HERE, "eaa-wcag-triage", "src"), "wcag_triage.rules"
        )
        unbuilt = [c.criterion for c in rules.COVERAGE if c.coverage == "unimplemented"]
        _, required = vpi.check_wcag_unbuilt_rows_are_undecidable()
        self.assertEqual(required, [f"`{c}`" for c in unbuilt])

    def test_corpus3_f1_span_matches_the_scorer(self):
        """The span must be what score_model_pass_c3.py actually computes."""
        described, required = vpi.check_mcp_corpus3_model_f1()
        scorer = vpi._load_module(
            "_test_c3_scorer",
            os.path.join(HERE, "mcp-drift-watch", "score_model_pass_c3.py"),
        )
        low, high = vpi._f1_span(scorer, scorer.MODEL, scorer.LABELS)
        self.assertEqual(required, [f"{low:.2f}{vpi.DASH}{high:.2f}"])
        # Guards against a scorer change silently collapsing the span.
        self.assertLess(low, high)
        self.assertIn(f"{low:.2f}", described)


class TestTableRowsRender(unittest.TestCase):
    """The negative cases here are the two rows that actually shipped broken.

    Both routing documents quoted the same regex, and the four unescaped pipes
    inside its backtick span turned a 3-column row into a 7-column one in each.
    """

    # The alternation exactly as `mcp-drift-watch`/`mcp-tool-drift` quoted it.
    QUOTED_REGEX = r"`\b( … |important:| … |\.env\b| … )\b`"

    def _write(self, text: str) -> str:
        directory = tempfile.mkdtemp()
        path = os.path.join(directory, "README.md")
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(text)
        return path

    def test_unescaped_pipe_in_a_code_span_is_rejected(self):
        path = self._write(
            "| Probe | Candidate | Status |\n"
            "|---|---|---|\n"
            f"| [`mcp-drift-watch`](d/) | [`c`](c.md) | Dead patterns: {self.QUOTED_REGEX} |\n"
        )
        failures = vpi.check_table_rows_render([path])
        self.assertEqual(len(failures), 1, failures)
        self.assertIn("7 cells", failures[0])
        self.assertIn("delimiter row declares 3", failures[0])

    def test_escaping_those_pipes_passes(self):
        escaped = self.QUOTED_REGEX.replace("|", r"\|")
        path = self._write(
            "| Probe | Candidate | Status |\n"
            "|---|---|---|\n"
            f"| [`mcp-drift-watch`](d/) | [`c`](c.md) | Dead patterns: {escaped} |\n"
        )
        self.assertEqual(vpi.check_table_rows_render([path]), [])

    def test_each_table_is_measured_against_its_own_delimiter(self):
        """A 2-column table after a 3-column one is not a failure.

        This is the false positive the first version of the check produced on
        `research/README.md`, which holds tables of both widths.
        """
        path = self._write(
            "| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |\n\n"
            "| Directory | Established |\n|---|---|\n| `x/` | y |\n"
        )
        self.assertEqual(vpi.check_table_rows_render([path]), [])

    def test_pipe_tables_inside_fenced_blocks_are_ignored(self):
        path = self._write(
            "```\n| not | a | table |\n|---|\n```\n"
            "| A | B |\n|---|---|\n| 1 | 2 |\n"
        )
        self.assertEqual(vpi.check_table_rows_render([path]), [])

    def test_routing_docs_are_the_two_CLAUDE_md_routes_at(self):
        self.assertIn(vpi.INDEX, vpi.ROUTING_DOCS)
        self.assertTrue(
            any(p.endswith(os.path.join("research", "README.md")) for p in vpi.ROUTING_DOCS)
        )
        for path in vpi.ROUTING_DOCS:
            self.assertTrue(os.path.exists(path), path)


class TestCurrentTree(unittest.TestCase):
    def test_index_is_currently_consistent(self):
        self.assertEqual(vpi.run(), [])

    def test_routing_tables_currently_render(self):
        self.assertEqual(vpi.check_table_rows_render(), [])


if __name__ == "__main__":
    unittest.main()
