"""Tests for score_sensitivity.py.

The script's whole claim is that it reports the measurement record faithfully
rather than flattering it, so the tests concentrate on the ways a report like
this normally lies: silently dropping a revision it cannot parse, counting a
dimension as unmeasured when someone looked and left it alone, applying a bias
to cells that were already measured, and asserting a pattern that is not in
the data.

    python3 -m unittest portfolio.pipeline.test_score_sensitivity
    (or, from portfolio/pipeline: python3 -m unittest test_score_sensitivity)
"""

from __future__ import annotations

import unittest
from fractions import Fraction
from pathlib import Path

import score_sensitivity as ss

LIVE = Path(__file__).with_name("candidates.yaml")


def scores(**overrides) -> dict:
    base = {d: 7 for d in ss.DIMENSIONS}
    base.update(overrides)
    return base


def doc(*candidates) -> str:
    import yaml

    return yaml.safe_dump({"candidates": list(candidates)})


def candidate(slug="c", verdict="probe", **kwargs) -> dict:
    entry = {"slug": slug, "verdict": verdict, "scores": scores(**kwargs.pop("scores", {}))}
    entry.update(kwargs)
    return entry


def load_text(text: str, tmp: Path):
    path = tmp / "candidates.yaml"
    path.write_text(text)
    return ss.load(path)


class ParsingIsStrict(unittest.TestCase):
    """A revision the script cannot read must fail, not vanish from the sample."""

    def setUp(self):
        import tempfile

        self._dir = tempfile.TemporaryDirectory()
        self.tmp = Path(self._dir.name)
        self.addCleanup(self._dir.cleanup)

    def test_reads_the_revision_prefix(self):
        candidates, revisions = load_text(
            doc(candidate(scores={"ai_leverage": 6}, measured={"ai_leverage": "7 -> 6, PR #207."})),
            self.tmp,
        )
        self.assertEqual(len(revisions), 1)
        self.assertEqual((revisions[0].was, revisions[0].now, revisions[0].delta), (7, 6, -1))
        self.assertEqual(candidates[0].measured, frozenset({"ai_leverage"}))

    def test_unparseable_measured_block_is_an_error(self):
        with self.assertRaises(ValueError) as caught:
            load_text(
                doc(candidate(measured={"ai_leverage": "lowered after the probe"})),
                self.tmp,
            )
        self.assertIn("ai_leverage", str(caught.exception))

    def test_measured_block_disagreeing_with_the_score_is_an_error(self):
        with self.assertRaises(ValueError):
            load_text(
                doc(
                    candidate(
                        scores={"ai_leverage": 5},
                        measured={"ai_leverage": "7 -> 6, PR #207."},
                    )
                ),
                self.tmp,
            )

    def test_unknown_dimension_is_an_error(self):
        with self.assertRaises(ValueError):
            load_text(doc(candidate(measured={"vibes": "7 -> 6"})), self.tmp)

    def test_missing_dimension_is_an_error(self):
        entry = candidate()
        del entry["scores"]["gross_margin"]
        with self.assertRaises(ValueError):
            load_text(doc(entry), self.tmp)


class ExaminedIsNotUnmeasured(unittest.TestCase):
    """`flagged_unmeasured` means someone looked. The bias must not be applied."""

    def setUp(self):
        import tempfile

        self._dir = tempfile.TemporaryDirectory()
        self.tmp = Path(self._dir.name)
        self.addCleanup(self._dir.cleanup)

    def test_examined_dimension_counts_as_settled(self):
        candidates, _ = load_text(
            doc(candidate(flagged_unmeasured={"defensibility": "argued down, not scored"})),
            self.tmp,
        )
        self.assertEqual(candidates[0].measured, frozenset())
        self.assertEqual(candidates[0].settled, frozenset({"defensibility"}))

    def test_adjust_skips_settled_cells(self):
        candidates, _ = load_text(
            doc(
                candidate(
                    scores={"ai_leverage": 6, "defensibility": 5, "distribution": 4},
                    measured={"ai_leverage": "7 -> 6, PR #207."},
                    flagged_unmeasured={"defensibility": "argued down"},
                )
            ),
            self.tmp,
        )
        adjusted = ss.adjust(candidates[0], ["ai_leverage", "defensibility", "distribution"], -1)
        self.assertEqual(adjusted["ai_leverage"], 6, "measured cell must not move again")
        self.assertEqual(adjusted["defensibility"], 5, "examined cell must not move")
        self.assertEqual(adjusted["distribution"], 3, "untouched cell takes the bias")

    def test_adjust_clamps_to_the_scale(self):
        candidates, _ = load_text(doc(candidate(scores={"defensibility": 0})), self.tmp)
        self.assertEqual(ss.adjust(candidates[0], ["defensibility"], -1)["defensibility"], 0)


class Arithmetic(unittest.TestCase):
    def test_composite_is_exact(self):
        values = scores(ai_leverage=8, autonomous_ops=6)
        self.assertEqual(ss.composite(values), Fraction(8 + 6 + 7 * 6, 8))

    def test_ranking_shares_a_rank_on_a_tie(self):
        ranks = ss.ranking(
            [("a", Fraction(7)), ("b", Fraction(7)), ("c", Fraction(6))]
        )
        self.assertEqual(ranks["a"], 1)
        self.assertEqual(ranks["b"], 1)
        self.assertEqual(ranks["c"], 3, "competition ranking skips the shared position")


class ReportClaimsFollowTheData(unittest.TestCase):
    """The report must not assert the one-directional pattern unless it holds."""

    def setUp(self):
        import tempfile

        self._dir = tempfile.TemporaryDirectory()
        self.tmp = Path(self._dir.name)
        self.addCleanup(self._dir.cleanup)

    def _report(self, *entries) -> str:
        candidates, revisions = load_text(doc(*entries), self.tmp)
        return "\n".join(ss.report(candidates, revisions))

    def test_an_upward_revision_suppresses_the_bias_analysis(self):
        text = self._report(
            candidate(
                slug="up",
                scores={"ai_leverage": 8},
                measured={"ai_leverage": "7 -> 8, a pass that found it better."},
            )
        )
        self.assertIn("No single consistent bias", text)
        self.assertNotIn("GATE SENSITIVITY", text)

    def test_a_two_point_revision_suppresses_the_bias_analysis(self):
        text = self._report(
            candidate(
                slug="big",
                scores={"ai_leverage": 5},
                measured={"ai_leverage": "7 -> 5, a larger correction."},
            )
        )
        self.assertIn("No single consistent bias", text)

    def test_gate_crossing_is_reported(self):
        text = self._report(
            candidate(
                slug="edge",
                scores={"ai_leverage": 6, "liability_containment": 5},
                measured={"ai_leverage": "7 -> 6, PR #207."},
            )
        )
        self.assertIn("would cross below the gate", text)
        self.assertIn("edge: liability_containment 5 -> 4", text)

    def test_no_gate_crossing_when_every_gate_score_is_high(self):
        text = self._report(
            candidate(
                slug="safe",
                scores={"ai_leverage": 6, "liability_containment": 9, "ethical_robustness": 9},
                measured={"ai_leverage": "7 -> 6, PR #207."},
            )
        )
        self.assertIn("No candidate crosses the gate", text)


class AgainstTheLiveFile(unittest.TestCase):
    """The findings the write-ups cite, pinned to the data they came from."""

    def setUp(self):
        self.candidates, self.revisions = ss.load(LIVE)
        self.text = "\n".join(ss.report(self.candidates, self.revisions))

    def test_every_revision_is_downward_by_one(self):
        self.assertTrue(self.revisions, "candidates.yaml records no revisions at all")
        self.assertEqual(
            {r.delta for r in self.revisions},
            {-1},
            "the one-directional pattern the README states no longer holds; "
            "update the README rather than this test",
        )

    def test_revisions_are_confined_to_the_rank_dimensions(self):
        measured = {r.dimension for r in self.revisions}
        self.assertTrue(
            measured.isdisjoint(ss.GATE_DIMENSIONS),
            "a gate dimension has now been measured — section 4 of the report is "
            "no longer an extrapolation and should be rewritten",
        )

    def test_no_gate_score_has_ever_been_settled(self):
        settled = {d for c in self.candidates for d in c.settled}
        self.assertTrue(settled.isdisjoint(ss.GATE_DIMENSIONS))

    def test_the_bias_does_not_change_the_top_of_the_table(self):
        self.assertIn("Top of the table unchanged", self.text)

    def test_report_is_reproducible(self):
        again = "\n".join(ss.report(*ss.load(LIVE)))
        self.assertEqual(self.text, again)


if __name__ == "__main__":
    unittest.main()
