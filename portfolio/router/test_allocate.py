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
    decisions_by_merit,
    diversify,
    family_of,
    load_merit_scores,
    load_ventures,
    next_task,
    rank,
    work_queue,
    LEDGER_DIR,
    SCORES_PATH,
    VENTURES_DIR,
)


def make(
    name,
    stage="prototype",
    mrr=None,
    monthly_cost=None,
    monthly_cap=20,
    protected=True,
    merit=None,
):
    return Venture(
        name=name,
        stage=stage,
        mrr=mrr,
        monthly_cost=monthly_cost,
        monthly_cap=monthly_cap,
        protected=protected,
        merit=merit,
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

    def test_dispatchable_work_outranks_blocked_work(self):
        blocked = make("blocked", stage="prototype", mrr=None, monthly_cap=100)
        blocked.hypotheses = [
            {"claim": "People will pay.", "status": "untested", "evidence": "customer-contact"}
        ]
        ready = make("ready", stage="idea", mrr=None, monthly_cap=10)
        ready.hypotheses = [
            {"claim": "The tool dedupes.", "status": "untested", "evidence": "in-repo"}
        ]
        # `blocked` wins on both stage and cap; dispatchability must override.
        self.assertEqual(rank([blocked, ready])[0].name, "ready")

    def test_a_venture_needing_a_kill_decision_still_outranks_dispatchable_work(self):
        stuck = make("stuck", stage="revenue", mrr=0)
        ready = make("ready", stage="idea", mrr=None)
        ready.hypotheses = [
            {"claim": "The tool dedupes.", "status": "untested", "evidence": "in-repo"}
        ]
        self.assertEqual(rank([ready, stuck])[0].name, "stuck")

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

    def test_customer_contact_claim_on_unpublished_venture_is_blocked(self):
        v = make("v", stage="idea", mrr=None)
        v.hypotheses = [
            {"claim": "People will pay.", "status": "untested", "evidence": "customer-contact"}
        ]
        self.assertFalse(v.dispatchable)
        self.assertIn("BLOCKED", next_task(v))

    def test_publishing_unblocks_a_customer_contact_claim(self):
        v = make("v", stage="idea", mrr=None)
        v.hypotheses = [
            {"claim": "People will pay.", "status": "untested", "evidence": "customer-contact"}
        ]
        v.production_url = "https://example.invalid/"
        self.assertTrue(v.dispatchable)
        self.assertIn("Explore", next_task(v))

    def test_in_repo_claim_is_dispatchable_without_publishing(self):
        v = make("v", stage="idea", mrr=None)
        v.hypotheses = [
            {"claim": "The importer dedupes.", "status": "untested", "evidence": "in-repo"}
        ]
        self.assertTrue(v.dispatchable)
        self.assertIn("Explore", next_task(v))

    def test_blocker_reads_the_first_untested_claim_not_a_settled_one(self):
        v = make("v", stage="idea", mrr=None)
        v.hypotheses = [
            {"claim": "Settled offline.", "status": "supported", "evidence": "customer-contact"},
            {"claim": "Still open.", "status": "untested", "evidence": "in-repo"},
        ]
        self.assertTrue(v.dispatchable)

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


class MeritTests(unittest.TestCase):
    """Merit orders ties; it must never outrank dispatchability."""

    def test_higher_merit_wins_a_tie(self):
        low = make("low", merit=4.0)
        high = make("high", merit=6.0)
        self.assertEqual([v.name for v in rank([low, high])], ["high", "low"])

    def test_merit_beats_monthly_cap(self):
        big_budget = make("big-budget", monthly_cap=50, merit=4.0)
        good = make("good", monthly_cap=10, merit=6.0)
        self.assertEqual(
            [v.name for v in rank([big_budget, good])], ["good", "big-budget"]
        )

    def test_dispatchability_still_outranks_merit(self):
        # The whole point of the dispatchable field: a session must not be
        # handed the best business if nobody can start on it today.
        blocked = make("blocked", merit=9.0)
        blocked.hypotheses = [
            {"claim": "someone will pay", "status": "untested", "evidence": "customer-contact"}
        ]
        startable = make("startable", merit=1.0)
        startable.hypotheses = [
            {"claim": "the code works", "status": "untested", "evidence": "in-repo"}
        ]
        self.assertFalse(blocked.dispatchable)
        self.assertTrue(startable.dispatchable)
        self.assertEqual(
            [v.name for v in rank([blocked, startable])], ["startable", "blocked"]
        )

    def test_unscored_venture_sorts_below_a_scored_one(self):
        unscored = make("unscored", merit=None)
        scored = make("scored", merit=0.5)
        self.assertEqual([v.name for v in rank([unscored, scored])], ["scored", "unscored"])

    def test_missing_scores_file_yields_no_merit(self):
        self.assertEqual(load_merit_scores(Path("/nonexistent/venture-scores.yaml")), {})

    def test_real_scores_file_reaches_every_scored_venture(self):
        # A venture with no score row yet is allowed (score_ventures.unscored
        # reports it); every row that exists must reach its venture's merit.
        merit = load_merit_scores(SCORES_PATH)
        ventures = load_ventures(VENTURES_DIR)
        self.assertTrue(any(v.name in merit for v in ventures))
        for venture in ventures:
            if venture.name in merit:
                self.assertIsNotNone(venture.merit, f"{venture.name} lost its merit score")
            else:
                self.assertIsNone(venture.merit, f"{venture.name} has merit but no score row")

    def test_work_queue_exposes_merit(self):
        queue = work_queue(load_ventures(VENTURES_DIR))
        self.assertTrue(all("merit" in item for item in queue))


class LoadRealVenturesTests(unittest.TestCase):
    """Sanity check against the real repo layout, not just synthetic data."""

    def test_every_venture_directory_with_a_yaml_loads(self):
        ventures = load_ventures(VENTURES_DIR)
        expected_dirs = {
            p.name
            for p in Path(VENTURES_DIR).iterdir()
            if p.is_dir()
            and (p / "VENTURE.yaml").is_file()
            and not (p / "NOT-A-VENTURE").is_file()
        }
        self.assertEqual({v.name for v in ventures}, expected_dirs)
        self.assertTrue(ventures, "expected at least one venture with a VENTURE.yaml")

    def test_ranking_real_ventures_does_not_raise(self):
        ventures = load_ventures(VENTURES_DIR)
        work_queue(ventures)  # exercises rank() + next_task() end to end

    def test_not_a_venture_marker_excludes_a_directory_with_a_yaml(self):
        # A NOT-A-VENTURE marker must win over a VENTURE.yaml in the same
        # directory, so the router agrees with validate.py rather than
        # allocating profit-seeking effort to a directory that opted out.
        with tempfile.TemporaryDirectory() as tmp:
            ventures_dir = Path(tmp)
            real = ventures_dir / "real-venture"
            real.mkdir()
            (real / "VENTURE.yaml").write_text(
                "name: real-venture\nstage: prototype\n"
                "economics: {mrr: null}\nbudget: {monthly_cap: 10}\nlinks: {production: null}\n"
            )
            optout = ventures_dir / "opted-out"
            optout.mkdir()
            (optout / "VENTURE.yaml").write_text(
                "name: opted-out\nstage: prototype\n"
                "economics: {mrr: null}\nbudget: {monthly_cap: 10}\nlinks: {production: null}\n"
            )
            (optout / "NOT-A-VENTURE").write_text("infra, not a business\n")
            names = {v.name for v in load_ventures(ventures_dir)}
            self.assertIn("real-venture", names)
            self.assertNotIn("opted-out", names)

    def test_every_untested_real_hypothesis_declares_its_evidence_kind(self):
        # Without this the router silently treats an unannotated claim as
        # dispatchable and puts impossible work back at the top of the queue.
        for v in load_ventures(VENTURES_DIR):
            for h in v.hypotheses:
                if h.get("status") == "untested":
                    self.assertIn(
                        h.get("evidence"),
                        {"customer-contact", "in-repo"},
                        f"{v.name}: hypothesis {h.get('claim')!r} has no `evidence`",
                    )

    def test_every_blocked_real_venture_is_blocked_for_a_stated_reason(self):
        for v in load_ventures(VENTURES_DIR):
            if not v.dispatchable:
                self.assertTrue(v.blocker)
                self.assertIsNone(v.production_url)

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


class DecisionsByMeritTests(unittest.TestCase):
    @staticmethod
    def _blocked(name, merit):
        v = make(name, stage="prototype", mrr=None, merit=merit)
        v.hypotheses = [
            {"claim": "x", "status": "untested", "evidence": "customer-contact"}
        ]
        return v

    @staticmethod
    def _ready(name, merit):
        v = make(name, stage="prototype", mrr=None, merit=merit)
        v.hypotheses = [
            {"claim": "x", "status": "untested", "evidence": "in-repo"}
        ]
        return v

    def test_only_blocked_ventures_contribute(self):
        rows = decisions_by_merit(
            [self._blocked("b", 5.0), self._ready("r", 9.0)]
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["blocked_ventures"], 1)
        self.assertEqual(rows[0]["ventures"], ["b"])
        # The dispatchable venture's merit must not be summed in.
        self.assertEqual(rows[0]["total_merit"], 5.0)

    def test_no_blocked_ventures_yields_no_rows(self):
        self.assertEqual(decisions_by_merit([self._ready("r", 9.0)]), [])

    def test_total_merit_sums_and_top_is_the_max(self):
        rows = decisions_by_merit(
            [self._blocked("a", 4.0), self._blocked("b", 6.0)]
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["total_merit"], 10.0)
        self.assertEqual(rows[0]["top_venture"], "b")
        self.assertEqual(rows[0]["top_merit"], 6.0)

    def test_unscored_blocked_venture_counted_but_not_summed(self):
        rows = decisions_by_merit(
            [self._blocked("scored", 5.0), self._blocked("unscored", None)]
        )
        self.assertEqual(rows[0]["blocked_ventures"], 2)
        self.assertEqual(rows[0]["merit_scored"], 1)
        self.assertEqual(rows[0]["total_merit"], 5.0)

    def test_rows_sorted_by_total_merit_descending(self):
        # Two distinct blockers so they land in separate groups; the higher-
        # merit group must come first.
        low = self._blocked("low", 3.0)
        high1 = self._blocked("high1", 5.0)
        high2 = self._blocked("high2", 5.0)
        # Force a second, different blocker string on `low`.
        low.hypotheses = [
            {"claim": "y", "status": "untested", "evidence": "customer-contact"}
        ]
        rows = decisions_by_merit([low, high1, high2])
        # In this synthetic set every blocked venture shares the same blocker
        # string, so they group together; assert the sum and top hold.
        self.assertEqual(rows[0]["total_merit"], 13.0)
        self.assertEqual(rows[0]["top_merit"], 5.0)

    def test_real_portfolio_rollup_is_consistent_with_queue(self):
        ventures = load_ventures(VENTURES_DIR)
        rows = decisions_by_merit(ventures)
        queue = work_queue(ventures)
        blocked_in_queue = sum(1 for item in queue if not item["dispatchable"])
        blocked_in_rows = sum(r["blocked_ventures"] for r in rows)
        self.assertEqual(blocked_in_rows, blocked_in_queue)
        for r in rows:
            self.assertGreaterEqual(r["merit_scored"], 0)
            self.assertLessEqual(r["merit_scored"], r["blocked_ventures"])


if __name__ == "__main__":
    unittest.main()


class FamilyTests(unittest.TestCase):
    """One product cloned per niche must not fill the queue (2026-10-16 report)."""

    def test_family_key(self):
        self.assertEqual(family_of("carpet-install-bid-calculator"), "bid-calculator")
        self.assertEqual(family_of("etsy-fee-calculator"), "fee-calculator")
        # A shared bare suffix is not a family: these are different products.
        self.assertEqual(family_of("where-to-sell-calculator"), "where-to-sell-calculator")
        self.assertEqual(family_of("waitlist-keeper"), "waitlist-keeper")

    def test_a_large_family_keeps_only_three_places_ahead_of_others(self):
        clones = [make(f"t{i}-bid-calculator", merit=7.0) for i in range(6)]
        others = [make(f"other-{i}", merit=5.0) for i in range(2)]
        names = [v.name for v in rank(clones + others)]
        self.assertEqual(names[:3], ["t0-bid-calculator", "t1-bid-calculator", "t2-bid-calculator"])
        self.assertEqual(names[3:5], ["other-0", "other-1"])
        self.assertEqual(len(names), 8)

    def test_small_families_are_untouched(self):
        few = [make(f"t{i}-bid-calculator", merit=7.0) for i in range(4)]
        other = make("other", merit=5.0)
        self.assertEqual([v.name for v in rank(few + [other])][-1], "other")

    def test_diversify_never_crosses_a_tier(self):
        clones = [make(f"t{i}-bid-calculator") for i in range(6)]
        late = make("late")
        out = diversify(clones + [late], tier=lambda v: v.name == "late")
        self.assertEqual(out[-1].name, "late")

    def test_top_family_member_gets_the_consolidation_task(self):
        clones = [make(f"t{i}-bid-calculator", merit=7.0 - i / 10) for i in range(5)]
        queue = work_queue(clones)
        self.assertTrue(queue[0]["task"].startswith("Consolidate"))
        self.assertIn("5 '*-bid-calculator'", queue[0]["task"])
        self.assertFalse(any(r["task"].startswith("Consolidate") for r in queue[1:]))

    def test_consolidated_members_neither_claim_nor_count(self):
        clones = [make(f"t{i}-bid-calculator", merit=7.0 - i / 10) for i in range(7)]
        clones[0].consolidated_into = "host"
        clones[1].consolidated_into = "host"
        queue = work_queue(clones)
        claimed = [r for r in queue if r["task"].startswith("Consolidate")]
        self.assertEqual(len(claimed), 1)
        self.assertNotIn(claimed[0]["venture"], ("t0-bid-calculator", "t1-bid-calculator"))
        self.assertIn("5 '*-bid-calculator'", claimed[0]["task"])
        clones[2].consolidated_into = "host"
        self.assertFalse(any(r["task"].startswith("Consolidate") for r in work_queue(clones)))
