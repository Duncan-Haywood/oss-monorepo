#!/usr/bin/env python3
"""Tests for allocate.py's pure ranking logic.

Run with: python3 -m unittest portfolio/router/test_allocate.py
(or: cd portfolio/router && python3 -m unittest test_allocate)
"""
import tempfile
import unittest
from pathlib import Path

from allocate import (
    Venture,
    count_ledger_entries,
    count_portfolio_mentions,
    load_ventures,
    next_task,
    rank,
    work_queue,
    LEDGER_DIR,
    VENTURES_DIR,
)


def make(name, stage="prototype", mrr=None, monthly_cost=None, monthly_cap=20, protected=True):
    return Venture(
        name=name,
        stage=stage,
        mrr=mrr,
        monthly_cost=monthly_cost,
        monthly_cap=monthly_cap,
        protected=protected,
    )


class RankTests(unittest.TestCase):
    def test_zero_mrr_past_revenue_stage_ranks_first(self):
        stuck = make("stuck", stage="revenue", mrr=0)
        exploring = make("exploring", stage="idea", mrr=None)
        healthy = make("healthy", stage="revenue", mrr=500)
        ordered = rank([healthy, exploring, stuck])
        self.assertEqual(ordered[0].name, "stuck")

    def test_unmeasured_ranks_before_measured_positive(self):
        unmeasured = make("unmeasured", stage="prototype", mrr=None)
        measured = make("measured", stage="prototype", mrr=100)
        ordered = rank([measured, unmeasured])
        self.assertEqual(ordered[0].name, "unmeasured")

    def test_null_mrr_is_not_treated_as_zero(self):
        # A null-MRR venture must not be classified as "needs_decision" the
        # way a real zero would be -- unmeasured is not measured-and-failing.
        v = make("new-venture", stage="revenue", mrr=None)
        self.assertFalse(v.needs_decision)
        self.assertFalse(v.measured)

    def test_later_stage_breaks_ties_before_early_stage(self):
        early = make("early", stage="prototype", mrr=100, monthly_cap=20)
        later = make("later", stage="scaling", mrr=100, monthly_cap=20)
        ordered = rank([early, later])
        self.assertEqual(ordered[0].name, "later")

    def test_stable_name_tiebreak(self):
        a = make("a-venture", stage="idea", mrr=None, monthly_cap=10)
        b = make("b-venture", stage="idea", mrr=None, monthly_cap=10)
        ordered = rank([b, a])
        self.assertEqual([v.name for v in ordered], ["a-venture", "b-venture"])


class NextTaskTests(unittest.TestCase):
    def test_zero_mrr_past_revenue_stage_says_review(self):
        v = make("v", stage="revenue", mrr=0)
        self.assertIn("Review", next_task(v))

    def test_unmeasured_says_explore(self):
        v = make("v", stage="idea", mrr=None)
        self.assertIn("Explore", next_task(v))

    def test_unmeasured_with_untested_hypothesis_names_the_claim(self):
        v = make("v", stage="idea", mrr=None)
        v.hypotheses = [{"claim": "People will pay for X.", "status": "untested"}]
        task = next_task(v)
        self.assertIn("Explore", task)
        self.assertIn("People will pay for X.", task)

    def test_unmeasured_with_only_supported_hypothesis_falls_back_to_generic(self):
        v = make("v", stage="idea", mrr=None)
        v.hypotheses = [{"claim": "Already validated.", "status": "supported"}]
        task = next_task(v)
        self.assertIn("Explore", task)
        self.assertNotIn("Already validated.", task)

    def test_unmeasured_picks_first_untested_hypothesis(self):
        v = make("v", stage="idea", mrr=None)
        v.hypotheses = [
            {"claim": "Already validated.", "status": "supported"},
            {"claim": "Second claim, still untested.", "status": "untested"},
            {"claim": "Third claim, also untested.", "status": "untested"},
        ]
        task = next_task(v)
        self.assertIn("Second claim, still untested.", task)
        self.assertNotIn("Third claim, also untested.", task)

    def test_cost_exceeding_revenue_says_review(self):
        v = make("v", stage="revenue", mrr=100, monthly_cost=200)
        self.assertIn("Review", next_task(v))

    def test_healthy_venture_says_continue(self):
        v = make("v", stage="revenue", mrr=500, monthly_cost=100)
        self.assertIn("Continue", next_task(v))


class WorkQueueTests(unittest.TestCase):
    def test_queue_entries_carry_spend_ceiling(self):
        v = make("v", stage="prototype", mrr=None, monthly_cap=42)
        queue = work_queue([v])
        self.assertEqual(queue[0]["spend_ceiling_usd"], 42)
        self.assertEqual(queue[0]["venture"], "v")

    def test_queue_entries_carry_ledger_entry_count(self):
        v = Venture(
            name="v",
            stage="prototype",
            mrr=None,
            monthly_cost=None,
            monthly_cap=10,
            protected=True,
            ledger_entries=3,
        )
        queue = work_queue([v])
        self.assertEqual(queue[0]["ledger_entries_this_period"], 3)

    def test_ledger_entries_defaults_to_zero(self):
        v = make("v")
        self.assertEqual(v.ledger_entries, 0)

    def test_portfolio_mentions_defaults_to_zero(self):
        v = make("v")
        self.assertEqual(v.portfolio_mentions, 0)

    def test_queue_entries_carry_portfolio_mentions_count(self):
        v = Venture(
            name="v",
            stage="prototype",
            mrr=None,
            monthly_cost=None,
            monthly_cap=10,
            protected=True,
            portfolio_mentions=5,
        )
        queue = work_queue([v])
        self.assertEqual(queue[0]["portfolio_mentions_this_period"], 5)


class CountLedgerEntriesTests(unittest.TestCase):
    def test_counts_per_venture_across_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            ledger_dir = Path(tmp)
            (ledger_dir / "2026-08.yaml").write_text(
                "period: 2026-08\n"
                "entries:\n"
                "  - venture: portfolio\n"
                "    outcomes: [survey]\n"
                "  - venture: alpha\n"
                "    outcomes: [fix]\n"
                "  - venture: alpha\n"
                "    outcomes: [another fix]\n"
            )
            (ledger_dir / "2026-09.yaml").write_text(
                "period: 2026-09\nentries:\n  - venture: alpha\n    outcomes: [x]\n"
            )
            counts = count_ledger_entries(ledger_dir)
        self.assertEqual(counts["alpha"], 3)
        self.assertEqual(counts["portfolio"], 1)

    def test_missing_ledger_dir_returns_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            missing = Path(tmp) / "does-not-exist"
            self.assertEqual(count_ledger_entries(missing), {})

    def test_real_ledger_dir_parses_without_raising(self):
        # Sanity check against the actual portfolio/ledger/ contents.
        counts = count_ledger_entries(LEDGER_DIR)
        self.assertIsInstance(counts, dict)


class CountPortfolioMentionsTests(unittest.TestCase):
    def test_counts_whole_word_slug_mentions_in_portfolio_entries(self):
        with tempfile.TemporaryDirectory() as tmp:
            ledger_dir = Path(tmp)
            (ledger_dir / "2026-08.yaml").write_text(
                "period: 2026-08\n"
                "entries:\n"
                "  - venture: portfolio\n"
                "    outcomes:\n"
                "      - Reviewed alpha-venture's landing page copy.\n"
                "  - venture: portfolio\n"
                "    outcomes:\n"
                "      - Nothing venture-specific this pass.\n"
                "  - venture: alpha-venture\n"
                "    outcomes: [direct entry, should not be double-counted]\n"
            )
            counts = count_portfolio_mentions(["alpha-venture", "beta-venture"], ledger_dir)
        self.assertEqual(counts["alpha-venture"], 1)
        self.assertEqual(counts["beta-venture"], 0)

    def test_does_not_match_substring_inside_a_longer_slug(self):
        with tempfile.TemporaryDirectory() as tmp:
            ledger_dir = Path(tmp)
            (ledger_dir / "2026-08.yaml").write_text(
                "period: 2026-08\n"
                "entries:\n"
                "  - venture: portfolio\n"
                "    outcomes:\n"
                "      - Worked on alpha-venture-extended only, no other venture.\n"
            )
            counts = count_portfolio_mentions(["alpha-venture"], ledger_dir)
        # "alpha-venture" is a substring of "alpha-venture-extended", but a
        # plain \b boundary would still match at the second hyphen -- '-'
        # must be treated as part of the slug for boundary purposes so this
        # does not falsely count as a mention of "alpha-venture".
        self.assertEqual(counts["alpha-venture"], 0)

    def test_multiple_portfolio_entries_mentioning_same_venture_all_count(self):
        with tempfile.TemporaryDirectory() as tmp:
            ledger_dir = Path(tmp)
            (ledger_dir / "2026-08.yaml").write_text(
                "period: 2026-08\n"
                "entries:\n"
                "  - venture: portfolio\n"
                "    outcomes: [Touched gamma-venture once.]\n"
            )
            (ledger_dir / "2026-09.yaml").write_text(
                "period: 2026-09\n"
                "entries:\n"
                "  - venture: portfolio\n"
                "    outcomes: [Touched gamma-venture again.]\n"
            )
            counts = count_portfolio_mentions(["gamma-venture"], ledger_dir)
        self.assertEqual(counts["gamma-venture"], 2)

    def test_missing_ledger_dir_returns_zero_counts(self):
        with tempfile.TemporaryDirectory() as tmp:
            missing = Path(tmp) / "does-not-exist"
            counts = count_portfolio_mentions(["alpha-venture"], missing)
        self.assertEqual(counts["alpha-venture"], 0)

    def test_real_ledger_dir_parses_without_raising(self):
        counts = count_portfolio_mentions(["ai-first-markets"], LEDGER_DIR)
        self.assertIsInstance(counts["ai-first-markets"], int)
        self.assertGreaterEqual(counts["ai-first-markets"], 0)


class LoadRealVenturesTests(unittest.TestCase):
    """Sanity check against the real repo layout, not just synthetic data."""

    def test_every_venture_directory_with_a_yaml_loads(self):
        ventures = load_ventures(VENTURES_DIR)
        expected_dirs = {
            p.name
            for p in Path(VENTURES_DIR).iterdir()
            if p.is_dir() and (p / "VENTURE.yaml").is_file()
        }
        self.assertEqual({v.name for v in ventures}, expected_dirs)
        self.assertTrue(ventures, "expected at least one venture with a VENTURE.yaml")

    def test_ranking_real_ventures_does_not_raise(self):
        ventures = load_ventures(VENTURES_DIR)
        work_queue(ventures)  # exercises rank() + next_task() end to end

    def test_ledger_entries_are_non_negative_ints(self):
        ventures = load_ventures(VENTURES_DIR)
        for v in ventures:
            self.assertIsInstance(v.ledger_entries, int)
            self.assertGreaterEqual(v.ledger_entries, 0)

    def test_portfolio_mentions_are_non_negative_ints(self):
        ventures = load_ventures(VENTURES_DIR)
        for v in ventures:
            self.assertIsInstance(v.portfolio_mentions, int)
            self.assertGreaterEqual(v.portfolio_mentions, 0)


if __name__ == "__main__":
    unittest.main()
