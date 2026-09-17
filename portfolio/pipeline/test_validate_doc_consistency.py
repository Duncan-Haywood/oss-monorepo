#!/usr/bin/env python3
"""Unit tests for validate_doc_consistency.py.

Why this file exists
--------------------
The validator it covers had none, alone among its siblings in this directory
(`validate_candidates.py`, `score_sensitivity.py`, `validate_probe_index.py`
all ship a `test_*` next to them). On 2026-09-07 it was failing on `main` with
two real inconsistencies, and nothing noticed for a simple reason: GitHub
Actions was starved, so `portfolio-validate.yml` never ran it, and CLAUDE.md's
manual merge checklist -- the list sessions actually follow during a starvation
window -- runs `pytest portfolio/pipeline`, which collected no test for it.
The validator was correct the whole time and shouting into an empty room.

That is the repository's recurring defect, reached from a new direction: a
guard nobody runs is worth less than no guard, because it also tells the next
session the ground is covered. These tests make the validator's own logic
answer to `pytest portfolio/pipeline`, which both the checklist and CI run.

The two cases below marked "regression" are the exact pair that were red.
"""
import importlib.util
import unittest
from pathlib import Path

_SPEC = importlib.util.spec_from_file_location(
    "validate_doc_consistency",
    Path(__file__).resolve().parent / "validate_doc_consistency.py",
)
vdc = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(vdc)


class NormaliseDimensionTest(unittest.TestCase):
    """`normalise_dimension` decides whether two spellings are one dimension."""

    def test_underscores_and_spaces_are_the_same_dimension(self):
        self.assertEqual(
            vdc.normalise_dimension("time_to_revenue"),
            vdc.normalise_dimension("time to revenue"),
        )

    def test_case_and_surrounding_whitespace_do_not_matter(self):
        self.assertEqual(vdc.normalise_dimension("  Defensibility "), "defensibility")

    def test_backticks_are_not_a_disagreement(self):
        """Regression: one write-up in 31 spelled its floor ``(`ai_leverage`)``.

        The validator compared it to the yaml's plain `ai_leverage` and failed
        with "headline attributes the floor to `ai leverage`, candidates.yaml
        says ai leverage" -- two strings differing only by characters the
        reader can barely see, from a tool whose entire job is saying which of
        three files is stale.
        """
        self.assertEqual(vdc.normalise_dimension("`ai_leverage`"), "ai leverage")

    def test_markdown_emphasis_is_not_a_disagreement(self):
        self.assertEqual(vdc.normalise_dimension("**distribution**"), "distribution")
        self.assertEqual(vdc.normalise_dimension("_ai_leverage_"), "ai leverage")

    def test_internal_underscores_survive_the_emphasis_strip(self):
        """Stripping `_` as emphasis must not eat the separator inside a name."""
        self.assertEqual(vdc.normalise_dimension("ai_leverage"), "ai leverage")
        self.assertEqual(
            vdc.normalise_dimension("liability_containment"), "liability containment"
        )


class ParseHeadlineTest(unittest.TestCase):
    def _write(self, text):
        path = Path(self.tmp) / "candidate.md"
        path.write_text(text)
        return path

    def setUp(self):
        import tempfile

        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = self._tmp.name
        self.addCleanup(self._tmp.cleanup)

    def test_reads_composite_floor_and_dimension(self):
        errors = []
        path = self._write("Scored 2026-09-06. Composite 6.875 · floor 1 (ai_leverage).")
        self.assertEqual(
            vdc.parse_headline(path, errors), (6.875, 1, ["ai leverage"])
        )
        self.assertEqual(errors, [])

    def test_reads_several_tied_dimensions(self):
        errors = []
        path = self._write("Composite 7.125 · floor 3 (defensibility, distribution).")
        composite, floor, dims = vdc.parse_headline(path, errors)
        self.assertEqual((composite, floor), (7.125, 3))
        self.assertEqual(dims, ["defensibility", "distribution"])

    def test_a_missing_headline_is_an_error_not_a_crash(self):
        errors = []
        self.assertIsNone(vdc.parse_headline(self._write("No headline here."), errors))
        self.assertEqual(len(errors), 1)
        self.assertIn("headline", errors[0])


class CheckRankingTest(unittest.TestCase):
    """The README table is a ranking; these are the two ways it goes stale."""

    def test_a_correctly_ordered_table_passes(self):
        errors = []
        vdc.check_ranking(
            [("a", 1, 7.25, 4), ("b", 2, 7.0, 1), ("c", 3, 6.875, 1)], errors
        )
        self.assertEqual(errors, [])

    def test_a_row_appended_out_of_composite_order_is_caught(self):
        """Regression: a 6.875 candidate was appended below two 6.125 rows.

        Its own cell said so -- "Appended out of composite order ... to avoid
        renumbering the table" -- which is the table's ranking claim being
        knowingly broken to save an edit. The validator was right to fail.
        """
        errors = []
        vdc.check_ranking(
            [("a", 1, 6.5, 4), ("b", 2, 6.125, 4), ("late", 3, 6.875, 1)], errors
        )
        self.assertEqual(len(errors), 1)
        self.assertIn("ranked by composite", errors[0])
        self.assertIn("late", errors[0])

    def test_a_row_whose_printed_rank_does_not_match_its_position_is_caught(self):
        errors = []
        vdc.check_ranking([("a", 1, 7.0, 4), ("b", 3, 6.5, 4)], errors)
        self.assertEqual(len(errors), 1)
        self.assertIn("row 2 of the table but is numbered 3", errors[0])

    def test_ties_may_appear_in_either_order(self):
        """Equal composites are not a ranking violation, only a decreasing one."""
        errors = []
        vdc.check_ranking([("a", 1, 6.875, 1), ("b", 2, 6.875, 4)], errors)
        self.assertEqual(errors, [])


class RealTreeTest(unittest.TestCase):
    """The guard the two regressions above would have tripped, on real files.

    `main` was red on exactly this for at least a day. A unit test over
    fixtures proves the logic; this proves the tree.
    """

    def test_the_committed_pipeline_files_agree(self):
        self.assertEqual(vdc.main(), 0)


if __name__ == "__main__":
    unittest.main()
