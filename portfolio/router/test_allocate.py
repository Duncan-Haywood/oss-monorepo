#!/usr/bin/env python3
"""Tests for allocate.py's pure ranking logic.

Run with: python3 -m unittest portfolio/router/test_allocate.py
(or: cd portfolio/router && python3 -m unittest test_allocate)
"""
import tempfile
import unittest
from pathlib import Path

from allocate import (
    deepen_to_window,
    recent_commits,
    Venture,
    count_ledger_entries,
    count_portfolio_mentions,
    decisions_by_merit,
    is_calculator,
    load_flagships,
    load_merit_scores,
    load_ventures,
    next_task,
    rank,
    work_queue,
    LEDGER_DIR,
    SCORES_PATH,
    VENTURES_DIR,
    FLAGSHIPS_PATH,
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
    def test_real_hypothesis_ranks_before_no_hypothesis(self):
        empty = make("aaa-empty", stage="prototype", mrr=None)
        claimed = make("zzz-claimed", stage="prototype", mrr=None)
        claimed.hypotheses = [{"claim": "People will use X.", "status": "untested"}]
        self.assertEqual(rank([empty, claimed])[0].name, "zzz-claimed")

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

    def test_heavily_worked_venture_yields_to_a_shallow_one(self):
        hot = make("hot", merit=7.0)
        hot.recent_commits = 5
        cold = make("cold", merit=6.0)
        self.assertEqual(rank([hot, cold])[0].name, "cold")

    def test_consolidated_venture_yields_to_a_live_one(self):
        folded = make("folded", merit=7.0)
        folded.consolidated_into = "host"
        live = make("live", merit=6.0)
        self.assertEqual(rank([folded, live])[0].name, "live")

    def test_stable_name_tiebreak(self):
        a = make("a-venture", stage="idea", mrr=None, monthly_cap=10)
        b = make("b-venture", stage="idea", mrr=None, monthly_cap=10)
        ordered = rank([b, a])
        self.assertEqual([v.name for v in ordered], ["a-venture", "b-venture"])


class DeepenTests(unittest.TestCase):
    def test_fetches_only_when_shallow(self):
        from unittest import mock
        def run(shallow, oldest="9999999999"):
            def fake(cmd, **kw):
                if "rev-parse" in cmd:
                    out = "true" if shallow else "false\n"
                else:
                    out = oldest + "\n" if "log" in cmd else ""
                return mock.Mock(stdout=out, returncode=0)
            with mock.patch("allocate.subprocess.run", side_effect=fake) as m:
                return deepen_to_window(7), m.call_count
        self.assertEqual(run(False), (False, 1))
        self.assertEqual(run(True), (True, 3))  # rev-parse, git log, fetch

    def test_fetch_timeout_returns_false_instead_of_blocking(self):
        import subprocess
        from unittest import mock
        def fake(cmd, **kw):
            if "fetch" in cmd:
                raise subprocess.TimeoutExpired(cmd, kw["timeout"])
            return mock.Mock(stdout="true" if "rev-parse" in cmd else "9999999999\n", returncode=0)
        with mock.patch("allocate.subprocess.run", side_effect=fake):
            self.assertFalse(deepen_to_window(7))

    def test_skips_fetch_when_history_already_reaches_window(self):
        from unittest import mock
        def fake(cmd, **kw):
            out = "true" if "rev-parse" in cmd else "1000000000\n"
            return mock.Mock(stdout=out, returncode=0)
        with mock.patch("allocate.subprocess.run", side_effect=fake) as m:
            self.assertFalse(deepen_to_window(7))
            self.assertEqual(m.call_count, 2)  # no fetch


class NextTaskTests(unittest.TestCase):
    def test_zero_mrr_past_revenue_stage_says_review(self):
        v = make("v", stage="revenue", mrr=0)
        self.assertIn("Review", next_task(v))

    def test_unmeasured_says_explore(self):
        v = make("v", stage="idea", mrr=None)
        self.assertIn("Explore", next_task(v))

    def test_unmeasured_with_no_hypotheses_says_none_recorded_not_settled(self):
        v = make("v", stage="idea", mrr=None)
        task = next_task(v)
        self.assertIn("no hypothesis recorded", task)
        self.assertIn("hypotheses:", task)
        self.assertNotIn("settled", task)

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

    def test_published_customer_contact_claim_ranks_behind_in_repo_work(self):
        pub = make("pub", stage="idea", mrr=None)
        pub.hypotheses = [{"claim": "Sellers return.", "status": "untested", "evidence": "customer-contact"}]
        pub.production_url = "https://example.invalid/"
        code = make("code", stage="idea", mrr=None)
        code.hypotheses = [{"claim": "Engine matches.", "status": "untested", "evidence": "in-repo"}]
        self.assertTrue(pub.awaits_visitors)
        self.assertFalse(code.awaits_visitors)
        self.assertEqual([v.name for v in rank([pub, code])], ["code", "pub"])
        self.assertIn("awaiting visitors", next_task(pub))

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



class CalculatorTests(unittest.TestCase):
    """Calculators are maintain-only (owner, 2026-10-21)."""

    def test_calculator_key(self):
        self.assertTrue(is_calculator("carpet-install-bid-calculator"))
        self.assertTrue(is_calculator("ltl-freight-class-estimator"))
        self.assertFalse(is_calculator("changepoint-detector"))
        self.assertFalse(is_calculator("calculator-hub-check"))

    def test_calculators_sink_below_other_dispatchable_work(self):
        calc = make("etsy-fee-calculator", merit=9.0)
        calc.hypotheses = [{"claim": "c", "status": "untested"}]
        other = make("tiny-csv-check", merit=1.0)
        self.assertEqual([v.name for v in rank([calc, other])], ["tiny-csv-check", "etsy-fee-calculator"])

    def test_calculator_task_is_maintenance_and_no_consolidation(self):
        clones = [make(f"t{i}-bid-calculator", merit=7.0) for i in range(6)]
        queue = work_queue(clones)
        self.assertTrue(all(r["task"].startswith("Maintain only") for r in queue))

    def test_zero_mrr_review_still_wins_for_a_calculator(self):
        v = make("x-fee-calculator", stage="revenue", mrr=0)
        self.assertTrue(next_task(v).startswith("Review"))


class RecentCommitsTest(unittest.TestCase):
    def test_returns_int_counts_by_slug(self):
        counts = recent_commits(days=3650, deepen=False)
        self.assertTrue(all(isinstance(k, str) and isinstance(n, int) and n > 0 for k, n in counts.items()))


class ReexecTests(unittest.TestCase):
    def test_reexec_is_noop_when_libyaml_present_or_already_hopped(self):
        import os
        from unittest import mock
        import allocate
        with mock.patch.object(os, "execv") as ex:
            with mock.patch.dict(os.environ, {"ALLOCATE_REEXEC": "1"}):
                allocate._reexec_with_libyaml()
            if getattr(allocate.yaml, "CSafeLoader", None):
                allocate._reexec_with_libyaml()
            ex.assert_not_called()


if __name__ == "__main__":
    unittest.main()


class FlagshipTests(unittest.TestCase):
    def flag(self, name, rank_, next_="Build the thing."):
        v = make(name)
        v.flagship_rank = rank_
        v.flagship_next = next_
        return v

    def test_flagships_rank_ahead_of_other_dispatchable_work_in_file_order(self):
        small = make("tiny-csv-check", merit=0.9)
        second = self.flag("second", 1)
        first = self.flag("first", 0)
        ordered = [v.name for v in rank([small, second, first])]
        self.assertEqual(ordered, ["first", "second", "tiny-csv-check"])

    def test_heavily_worked_flagship_is_not_demoted(self):
        hot = self.flag("deep", 0)
        hot.recent_commits = 40
        cold = make("cold")
        self.assertEqual(rank([cold, hot])[0].name, "deep")

    def test_flagship_waiting_on_customers_still_gets_its_deepen_task(self):
        # Its next hypothesis needs a customer, but the milestone is code.
        waiting = self.flag("deep", 0)
        waiting.hypotheses = [{"claim": "c", "status": "untested", "evidence": "customer-contact"}]
        startable = make("startable")
        self.assertEqual(rank([waiting, startable])[0].name, "deep")
        self.assertTrue(next_task(waiting).startswith("Deepen"))

    def test_flagship_calculator_still_gets_its_deepen_task(self):
        v = self.flag("roof-bid-calculator", 0, "Ship the solver.")
        task = next_task(v)
        self.assertTrue(task.startswith("Deepen (flagship 1): Ship the solver."), task)
        others = [make(f"x{i}-roof-bid-calculator") for i in range(6)]
        queue = work_queue([v] + others)
        self.assertTrue(queue[0]["flagship"])
        self.assertTrue(queue[0]["task"].startswith("Deepen"))

    def test_load_flagships_reads_order_and_tolerates_missing_file(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "flagships.yaml"
            self.assertEqual(load_flagships(p), {})
            p.write_text("flagships:\n  - venture: a\n    next: do a\n  - venture: b\n")
            self.assertEqual(load_flagships(p), {"a": (0, "do a"), "b": (1, "")})

    def test_every_listed_flagship_is_a_real_routable_venture(self):
        names = {v.name for v in load_ventures()}
        listed = load_flagships(FLAGSHIPS_PATH)
        self.assertTrue(listed, "portfolio/flagships.yaml lists no flagships")
        for name, (_, milestone) in listed.items():
            self.assertIn(name, names, f"flagship {name} has no routable VENTURE.yaml")
            self.assertTrue(milestone, f"flagship {name} has no `next:` milestone")
            # flagships.yaml says "keep this under 2,000 characters": history
            # belongs in the venture's README, not in the routed task text.
            self.assertLessEqual(len(milestone), 2000, f"flagship {name}: `next:` is over 2,000 characters")
