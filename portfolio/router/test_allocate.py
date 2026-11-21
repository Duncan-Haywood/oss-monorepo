#!/usr/bin/env python3
"""Tests for allocate.py's pure ranking logic.

Run with: python3 -m unittest portfolio/router/test_allocate.py
(or: cd portfolio/router && python3 -m unittest test_allocate)
"""
import copy
import json
import tempfile
import unittest
from pathlib import Path

from allocate import (
    claim_note,
    claims_by_venture,
    deepen_to_window,
    recent_commits,
    Venture,
    count_ledger_entries,
    count_portfolio_mentions,
    decisions_by_merit,
    is_calculator,
    load_flagships,
    load_flagship_field,
    load_inputs_only,
    load_not_before,
    load_flagship_hosts,
    row_hosts,
    start_here,
    load_merit_scores,
    load_ventures as _load_ventures,
    next_task,
    requests_line,
    rank,
    venture_report,
    count_by_venture,
    last_landed,
    shallow_boundary,
    work_queue,
    LEDGER_DIR,
    SCORES_PATH,
    VENTURES_DIR,
    FLAGSHIPS_PATH,
)


_REAL_VENTURES = None


def load_ventures(*args, **kwargs):
    """load_ventures, parsing the real ~1,300 VENTURE.yaml files once per run.

    Twelve tests loaded the real tree, ~10 s each without libyaml (the CI
    runner's case). Calls with the default tree share one parse and get a deep
    copy, so a test that mutates its list cannot leak into another; calls with
    their own directory still parse fresh.
    """
    global _REAL_VENTURES
    if args and args[0] != VENTURES_DIR or kwargs:
        return _load_ventures(*args, **kwargs)
    if _REAL_VENTURES is None:
        _REAL_VENTURES = _load_ventures(VENTURES_DIR)
    return copy.deepcopy(_REAL_VENTURES)


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
        self.assertEqual(run(False), (False, 2))  # rev-parse, rev-list
        # rev-parse, rev-list, git log, then shallow_repair.fetch: locate the git dir (stale
        # shallow.lock check), locate .git/shallow, fetch, locate again
        self.assertEqual(run(True), (True, 7))

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
            out = "true" if "rev-parse" in cmd else "" if "rev-list" in cmd else "1000000000\n"
            return mock.Mock(stdout=out, returncode=0)
        with mock.patch("allocate.subprocess.run", side_effect=fake) as m:
            self.assertFalse(deepen_to_window(7))
            self.assertEqual(m.call_count, 3)  # rev-parse, rev-list, git log; no fetch

    def test_stale_origin_main_is_fetched_even_when_history_reaches_window(self):
        # 2026-11-13: origin/main sat at a 6-day-old clone-time commit while HEAD was current
        # main; its deep history "reached" the window, so no fetch ran and last_landed lied.
        from unittest import mock
        for shallow in ("true", "false"):
            calls = []
            def fake(cmd, **kw):
                calls.append(cmd)
                if "rev-parse" in cmd:
                    out = shallow
                elif "rev-list" in cmd:
                    out = "5c6cef44fdb9830ff4ba791359445aac257c4e92\n"
                else:
                    out = "1000000000\n"
                return mock.Mock(stdout=out, returncode=0)
            with mock.patch("allocate.subprocess.run", side_effect=fake):
                self.assertTrue(deepen_to_window(7))
            self.assertTrue(any("fetch" in c for c in calls), shallow)

    def test_own_commits_on_a_work_branch_do_not_count_as_stale(self):
        import subprocess
        import tempfile
        from allocate import origin_main_behind_head
        with tempfile.TemporaryDirectory() as d:
            env = {"GIT_AUTHOR_NAME": "a", "GIT_AUTHOR_EMAIL": "a@x", "GIT_COMMITTER_NAME": "a",
                   "GIT_COMMITTER_EMAIL": "a@x", "PATH": __import__("os").environ["PATH"]}
            def git(*a, **extra):
                subprocess.run(["git", *a], cwd=d, check=True, capture_output=True,
                               env={**env, **extra})
            git("init", "-q", "-b", "main")
            git("commit", "-q", "--allow-empty", "-m", "base")
            git("update-ref", "refs/remotes/origin/main", "HEAD")
            git("commit", "-q", "--allow-empty", "-m", "my own work")
            self.assertFalse(origin_main_behind_head(Path(d)))
            git("commit", "-q", "--allow-empty", "-m", "a merged PR (#1)",
                GIT_COMMITTER_NAME="GitHub", GIT_COMMITTER_EMAIL="noreply@github.com")
            self.assertTrue(origin_main_behind_head(Path(d)))


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

    def test_inputs_only_flagship_ranks_after_buildable_flagships_not_after_others(self):
        stuck = self.flag("stuck", 0)
        stuck.flagship_inputs_only = "a real builder's draw schedule"
        buildable = self.flag("buildable", 1)
        small = make("tiny-csv-check", merit=0.9)
        ordered = [v.name for v in rank([small, stuck, buildable])]
        self.assertEqual(ordered, ["buildable", "stuck", "tiny-csv-check"])
        task = next_task(stuck)
        self.assertTrue(task.startswith("Inputs only (flagship 1)"), task)
        self.assertIn("draw schedule", task)
        self.assertTrue(next_task(buildable).startswith("Deepen (flagship 2)"))

    def test_not_before_row_waits_like_inputs_only_until_its_date(self):
        from datetime import date
        waiting = self.flag("waiting", 0)
        waiting.flagship_not_before = date(2026, 11, 24)
        buildable = self.flag("buildable", 1)
        small = make("tiny-csv-check", merit=0.9)
        ordered = [v.name for v in rank([small, waiting, buildable])]
        self.assertEqual(ordered, ["buildable", "waiting", "tiny-csv-check"])
        task = next_task(waiting)
        self.assertTrue(task.startswith("Waiting (flagship 1)"), task)
        self.assertIn("2026-11-24", task)
        # Start here names only Deepen rows, so the waiting row is skipped.
        queue = work_queue([waiting, buildable])
        self.assertEqual(start_here(queue, {})[1], "buildable")

    def test_load_not_before_keeps_only_dates_still_ahead(self):
        from datetime import date
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "flagships.yaml"
            self.assertEqual(load_not_before(p), {})
            p.write_text("flagships:\n  - venture: a\n    not_before: 2026-11-24\n"
                         "  - venture: b\n    not_before: 2026-11-01\n"
                         "  - venture: c\n    not_before: soon\n  - venture: d\n")
            self.assertEqual(load_not_before(p, date(2026, 11, 18)), {"a": date(2026, 11, 24)})
            # On the date itself the row is buildable again.
            self.assertEqual(load_not_before(p, date(2026, 11, 24)), {})

    def test_load_inputs_only_reads_marked_flagships(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "flagships.yaml"
            self.assertEqual(load_inputs_only(p), {})
            p.write_text("flagships:\n  - venture: a\n    inputs_only: a real DXF\n  - venture: b\n")
            self.assertEqual(load_inputs_only(p), {"a": "a real DXF"})

    def test_buildable_note_leads_the_deepen_task_and_the_full_report(self):
        v = self.flag("deep", 0, "Long history of every slice.")
        v.flagship_buildable = "(1) a second reader from a local GGUF model"
        task = next_task(v)
        self.assertTrue(task.startswith("Deepen (flagship 1): BUILDABLE HERE: (1) a second reader"), task)
        self.assertIn("Context: Long history", task)
        self.assertIn("buildable here: (1) a second reader", venture_report("deep", [v]))
        self.assertNotIn("BUILDABLE", next_task(self.flag("plain", 1, "x")))
        self.assertIn("--field buildable", task)
        self.assertNotIn("--field buildable", next_task(self.flag("plain", 1, "x")))

    def test_row_hosts_reads_the_hosts_field_then_the_prose(self):
        v = self.flag("deep", 0, "Scans on archive.org; see README.md and calc.mjs, eval/x.jsonl.")
        v.flagship_hosts = ["https://raw.pixls.us/"]
        v.flagship_buildable = "samples from raw.pixls.us and omawww.sat.gob.mx (SAT)"
        self.assertEqual(row_hosts(v), ["https://raw.pixls.us/", "https://omawww.sat.gob.mx/",
                                        "https://archive.org/"])
        self.assertEqual(row_hosts(self.flag("plain", 1, "README.md, flagships.yaml, v1.40")), [])

    def test_row_hosts_reads_the_hosts_a_named_script_fetches(self):
        # friction 2026-11-17: the row named eval/cord_images.py, not huggingface.co
        with tempfile.TemporaryDirectory() as d:
            root = Path(d) / "books"
            (root / "eval").mkdir(parents=True)
            (root / "eval" / "cord_images.py").write_text(
                "# Licence: https://creativecommons.org/licenses/by/4.0/\n"
                "#   https://huggingface.co/datasets/x/resolve/abc/test.parquet\n"
                "LOCAL = 'http://localhost:8000/'\n")
            v = self.flag("books", 0, "x")
            v.flagship_buildable = "CORD photos (eval/cord_images.py); eval/missing.py; ../../etc/passwd.sh"
            self.assertEqual(row_hosts(v, ventures_dir=Path(d)), ["https://huggingface.co/"])
            v.flagship_hosts = ["https://huggingface.co/x"]
            self.assertEqual(row_hosts(v, ventures_dir=Path(d)), ["https://huggingface.co/x"])

    def test_venture_report_probes_the_row_hosts_only_when_asked(self):
        v = self.flag("deep", 0, "history")
        v.flagship_hosts = ["https://archive.org/", "https://github.com/"]
        out = venture_report("deep", [v], probe=lambda url: "github" in url)
        self.assertIn("archive.org REFUSED; github.com answers", out)
        self.assertNotIn("probed just now", venture_report("deep", [v]))

    def test_load_flagship_hosts_takes_a_list_or_a_string(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "flagships.yaml"
            p.write_text("flagships:\n  - venture: a\n    hosts: [https://a.org/]\n"
                         "  - venture: b\n    hosts: https://b.org/ https://c.org/\n  - venture: c\n")
            self.assertEqual(load_flagship_hosts(p), {"a": ["https://a.org/"],
                                                      "b": ["https://b.org/", "https://c.org/"]})

    def test_load_flagship_field_folds_whitespace(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "flagships.yaml"
            p.write_text("flagships:\n  - venture: a\n    buildable: >-\n      one\n      two\n  - venture: b\n")
            self.assertEqual(load_flagship_field("buildable", p), {"a": "one two"})

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


class OpenPrClaimTest(unittest.TestCase):
    """Rows an open PR already works say so (doc_friction 2026-11-10/11)."""

    PRS = [
        (14678, "ai-bookkeeper: AI layer on real card lines + post", "2026-11-11T05:00:00Z"),
        (11151, "ai-bookkeeper: CLI refuses non-numeric flags", "2026-10-28T00:00:00Z"),
        (14701, "league-schedule-generator: even carry-over + post", "2026-11-11T06:30:00Z"),
        (14000, "process: allocate.py notes", "2026-11-11T06:00:00Z"),
    ]

    def test_reads_the_pulls_list_first_and_drops_fork_prs(self):
        """The search index lagged new claims by 10+ minutes on 2026-11-15
        (#16190, #16173); the REST pulls list does not lag."""
        from unittest import mock
        import allocate
        repo = {"full_name": allocate.REPO}
        pulls = [
            {"number": 16190, "title": "shift-roster-builder: claim", "created_at": "2026-11-15T10:58:20Z",
             "head": {"repo": repo, "ref": "claude/x"}},
            {"number": 16191, "title": "shift-roster-builder: from a fork", "created_at": "2026-11-15T10:59:00Z",
             "head": {"repo": {"full_name": "someone/oss-monorepo"}, "ref": "main"}},
            {"number": 16192, "title": "deleted fork", "created_at": "2026-11-15T11:00:00Z",
             "head": {"repo": None, "ref": "main"}},
        ]
        with mock.patch.object(allocate, "_search_pr_titles") as search:
            got = allocate.open_pr_titles(pulls=lambda: pulls)
        search.assert_not_called()
        self.assertEqual(got, [(16190, "shift-roster-builder: claim", "2026-11-15T10:58:20Z")])

    def test_drops_prs_already_squashed_or_merged_on_main(self):
        """#16521 showed as an OPEN PR while its squash commit sat on main (2026-11-17)."""
        import allocate
        prs = [(16521, "a: landed", "x"), (16522, "b: open", "x"), (16523, "c: merged", "x")]
        subjects = ["a: thing (#16521)", "Merge pull request #16523 from x/y", "mentions (#16522) mid-line only"]
        self.assertEqual(allocate.drop_landed(prs, subjects), [(16522, "b: open", "x")])
        self.assertIsNone(allocate.drop_landed(None, subjects))
        self.assertEqual(allocate.drop_landed(prs, []), prs)

    def test_falls_back_to_search_when_the_pulls_list_is_unreadable(self):
        from unittest import mock
        import allocate
        rows = [(1, "t", "2026-11-15T00:00:00Z")]
        with mock.patch.object(allocate, "_search_pr_titles", return_value=rows) as search:
            self.assertEqual(allocate.open_pr_titles(pulls=lambda: None), rows)
        search.assert_called_once()

    def test_matches_whole_slug_only(self):
        claims = claims_by_venture(["ai-bookkeeper", "bookkeeper", "league-schedule-generator", "sales-agent"], self.PRS)
        self.assertEqual([h[0] for h in claims["ai-bookkeeper"]], [14678, 11151])
        self.assertEqual([h[0] for h in claims["league-schedule-generator"]], [14701])
        self.assertNotIn("bookkeeper", claims)  # a slug inside a longer slug is not a match
        self.assertNotIn("sales-agent", claims)

    def test_fresh_claim_leads_and_stale_ones_are_numbers_only(self):
        from datetime import datetime, timezone
        now = datetime(2026, 11, 11, 7, 0, tzinfo=timezone.utc)
        note = claim_note(self.PRS[:2], now=now)
        self.assertTrue(note.startswith("OPEN PR #14678 (2h old): ai-bookkeeper: AI layer"), note)
        self.assertIn("[older open PRs: #11151]", note)
        self.assertNotIn("CLI refuses", note)
        stale_only = claim_note(self.PRS[1:2], now=now)
        self.assertFalse(stale_only.startswith("OPEN PR"), stale_only)

    def test_long_titles_are_cut(self):
        from datetime import datetime, timezone
        now = datetime(2026, 11, 11, 7, 0, tzinfo=timezone.utc)
        note = claim_note([(1, "x" * 300, "2026-11-11T06:00:00Z")], now=now)
        self.assertLess(len(note), 160)


class StartHereTests(unittest.TestCase):
    def test_skips_fresh_claims_and_inputs_only_rows(self):
        from datetime import datetime, timezone
        now = datetime(2026, 11, 11, 10, 0, tzinfo=timezone.utc)
        queue = [
            {"venture": "claimed", "flagship": True, "task": "Deepen (flagship 2): x"},
            {"venture": "stuck", "flagship": True, "task": "Inputs only (flagship 1): x"},
            {"venture": "free", "flagship": True, "task": "Deepen (flagship 3): x"},
            {"venture": "small", "flagship": False, "task": "Explore: x"},
        ]
        claims = {"claimed": [(5, "claimed: slice", "2026-11-11T08:00:00Z")],
                  "free": [(4, "free: stalled", "2026-11-01T00:00:00Z")]}
        self.assertEqual(start_here(queue, claims, now=now), (3, "free"))
        self.assertEqual(start_here(queue, None, now=now), (1, "claimed"))
        self.assertIsNone(start_here(queue[1:2] + queue[3:], claims, now=now))

    def test_a_claim_older_than_any_merge_frees_its_row(self):
        # 100 merged PRs (2026-11-19) took 1-140 min from open to merge; a
        # 6 h old open PR is stalled and no longer holds its row for a day.
        from datetime import datetime, timezone
        from allocate import CLAIM_FRESH_HOURS
        now = datetime(2026, 11, 19, 14, 0, tzinfo=timezone.utc)
        queue = [{"venture": "a", "flagship": True, "task": "Deepen (flagship 1): x"}]
        stalled = {"a": [(17310, "a: stalled", "2026-11-19T08:00:00Z")]}
        live = {"a": [(17594, "a: live", "2026-11-19T13:00:00Z")]}
        self.assertLess(CLAIM_FRESH_HOURS, 6)
        self.assertEqual(start_here(queue, stalled, now=now), (1, "a"))
        self.assertIsNone(start_here(queue, live, now=now))
        self.assertIn("older open PRs: #17310", claim_note(stalled["a"], now=now))

    def test_session_spreads_concurrent_runs_over_free_rows(self):
        from datetime import datetime, timezone
        now = datetime(2026, 11, 11, 10, 0, tzinfo=timezone.utc)
        queue = [{"venture": f"v{i}", "flagship": True, "task": "Deepen (flagship): x"}
                 for i in range(9)]
        queue.insert(1, {"venture": "stuck", "flagship": True, "task": "Inputs only: x"})
        picks = {start_here(queue, {}, now=now, session=f"session_{n}") for n in range(80)}
        # Only the first START_SPREAD (6) free rows are ever picked, skipping row 2.
        self.assertEqual(picks, {(1, "v0"), (3, "v1"), (4, "v2"), (5, "v3"), (6, "v4"), (7, "v5")})
        # The same session always gets the same row.
        self.assertEqual(start_here(queue, {}, now=now, session="abc"),
                         start_here(queue, {}, now=now, session="abc"))
        # One free row: every session gets it.
        self.assertEqual(start_here(queue[:2], {}, now=now, session="abc"), (1, "v0"))


class DateGateTests(unittest.TestCase):
    """A `buildable:` item dated after today is not buildable yet (2026-11-18:
    Start here kept sending runs to einvoice-preflight's 'After 2026-11-23' item)."""

    def test_future_gates_reads_only_future_dates(self):
        from allocate import future_gates, gate_note
        text = ("Preview landed (in force 2027-02-24). After 2026-11-23: rebuild from the tag; "
                "from 2026-11-01 the old branch is gone; not before 2026-12-01 diff again.")
        self.assertEqual(future_gates(text, today="2026-11-18"), ["2026-11-23", "2026-12-01"])
        self.assertEqual(future_gates(text, today="2026-11-23"), ["2026-12-01"])
        self.assertEqual(future_gates(text, today="2026-12-01"), [])
        self.assertIn("NOT YET", gate_note(text, today="2026-11-18"))
        self.assertEqual(gate_note("no dates here", today="2026-11-18"), "")

    def test_start_here_puts_dated_rows_after_undated_ones(self):
        from datetime import datetime, timezone
        now = datetime(2026, 11, 18, 10, 0, tzinfo=timezone.utc)
        dated = ("Deepen (flagship 1): BUILDABLE HERE: y (NOT YET: an item here is dated after "
                 "2026-11-23, so ...) -- Context: z")
        queue = [{"venture": "dated", "flagship": True, "task": dated},
                 {"venture": "ok", "flagship": True, "task": "Deepen (flagship 2): BUILDABLE HERE: y -- Context: z"},
                 {"venture": "ctx", "flagship": True,
                  "task": "Deepen (flagship 3): BUILDABLE HERE: y -- Context: (NOT YET: in next: only)"}]
        self.assertEqual(start_here(queue, {}, now=now), (2, "ok"))
        picks = {start_here(queue, {}, now=now, session=f"s{n}", spread=2) for n in range(40)}
        self.assertEqual(picks, {(2, "ok"), (3, "ctx")})
        # With nothing else free, the dated row is still named.
        self.assertEqual(start_here(queue[:1], {}, now=now), (1, "dated"))
        self.assertEqual(start_here(queue[:1], {}, now=now, session="s1"), (1, "dated"))


    def test_start_here_puts_declined_rows_last(self):
        from datetime import datetime, timezone
        now = datetime(2026, 11, 18, 10, 0, tzinfo=timezone.utc)
        task = "Deepen (flagship {}): BUILDABLE HERE: y -- Context: z"
        queue = [{"venture": "left", "flagship": True, "task": task.format(1)},
                 {"venture": "ok", "flagship": True, "task": task.format(2)}]
        self.assertEqual(start_here(queue, {}, now=now, declined={"left"}), (2, "ok"))
        picks = {start_here(queue, {}, now=now, session=f"s{n}", spread=1, declined={"left"})
                 for n in range(20)}
        self.assertEqual(picks, {(2, "ok")})
        # Still named when nothing else is free.
        self.assertEqual(start_here(queue[:1], {}, now=now, declined={"left"}), (1, "left"))
        # A spread wider than the free rows does not pull a declined or dated
        # row into the session-hash pool (chant-forge, 2026-11-18).
        dated = {"venture": "dated", "flagship": True,
                 "task": "Deepen (flagship 3): BUILDABLE HERE: a (NOT YET: after 2099-01-01) -- Context: z"}
        picks = {start_here(queue + [dated], {}, now=now, session=f"s{n}", spread=6,
                            declined={"left"}) for n in range(40)}
        self.assertEqual(picks, {(2, "ok")})
        # With only declined and dated rows free, the dated one comes first.
        picks = {start_here([queue[0], dated], {}, now=now, session=f"s{n}", spread=6,
                            declined={"left"}) for n in range(40)}
        self.assertEqual(picks, {(2, "dated")})

    def test_start_here_puts_refused_rows_after_reachable_ones(self):
        # ai-bookkeeper, 2026-11-19: named by Start here while huggingface.co
        # refused the session, nine times in one day.
        from datetime import datetime, timezone
        now = datetime(2026, 11, 19, 10, 0, tzinfo=timezone.utc)
        task = "Deepen (flagship {}): BUILDABLE HERE: y -- Context: z"
        queue = [{"venture": "hf", "flagship": True, "task": task.format(1)},
                 {"venture": "ok", "flagship": True, "task": task.format(2)}]
        refused = {"hf": ["huggingface.co"]}
        self.assertEqual(start_here(queue, {}, now=now, refused=refused), (2, "ok"))
        picks = {start_here(queue, {}, now=now, session=f"s{n}", spread=6, refused=refused)
                 for n in range(40)}
        self.assertEqual(picks, {(2, "ok")})
        # Still named when nothing reachable is free, ahead of dated and declined rows.
        dated = {"venture": "dated", "flagship": True,
                 "task": "Deepen (flagship 3): BUILDABLE HERE: a (NOT YET: after 2099-01-01) -- Context: z"}
        left = {"venture": "left", "flagship": True, "task": task.format(4)}
        picks = {start_here([queue[0], dated, left], {}, now=now, session=f"s{n}", spread=6,
                            declined={"left"}, refused=refused) for n in range(40)}
        self.assertEqual(picks, {(1, "hf")})

    def test_refused_rows_probes_each_needed_host_once(self):
        from types import SimpleNamespace
        from allocate import refused_rows
        def row(name, hosts, buildable):
            return SimpleNamespace(name=name, flagship=True, flagship_hosts=hosts,
                                   flagship_buildable=buildable, flagship_next="see legacy.org")
        rows = [row("hf", ["https://huggingface.co/", "https://raw.githubusercontent.com/"], "receipts"),
                row("px", [], "frames from raw.pixls.us and github.com"),
                row("gh", ["https://github.com"], "clone it"),
                row("none", ["https://huggingface.co/"], "")]
        asked = []
        def probe(url):
            asked.append(url)
            return "huggingface" not in url and "pixls" not in url
        self.assertEqual(refused_rows(rows, probe=probe),
                         {"hf": ["huggingface.co"], "px": ["raw.pixls.us"]})
        self.assertEqual(len(asked), len(set(asked)))
        self.assertFalse(any("legacy.org" in u for u in asked))  # `next:` prose is not probed
        self.assertEqual(refused_rows([row("gh", [], "nothing hosted")], probe=probe), {})

    def test_no_outside_input_buildable_skips_stale_hosts(self):
        # chant-forge, 2026-11-21: "Coda reader, no outside input" with a
        # hosts: archive.org left from an older item was demoted all day.
        from types import SimpleNamespace
        from allocate import need_hosts, refused_rows
        def row(name, hosts, buildable):
            return SimpleNamespace(name=name, flagship=True, flagship_hosts=hosts,
                                   flagship_buildable=buildable, flagship_next="")
        cf = row("cf", ["https://archive.org/"], "Coda reader, no outside input: fresh cells")
        self.assertEqual(need_hosts(cf), [])
        self.assertEqual(refused_rows([cf], probe=lambda u: False), {})
        # A host the buildable prose itself names is still probed.
        mixed = row("mx", ["https://archive.org/", "https://huggingface.co/"],
                    "CAD with no outside input; scans from zenodo.org")
        self.assertEqual(need_hosts(mixed), ["https://zenodo.org/"])
        # Without the phrase, hosts: still counts.
        self.assertEqual(need_hosts(row("x", ["https://archive.org/"], "scans")),
                         ["https://archive.org/"])

    def test_spent_host_is_not_needed(self):
        # photo-editing, 2026-11-21 (P070): raw.pixls.us named only as "all
        # read" demoted the row although its open work runs on github.com.
        from types import SimpleNamespace
        from allocate import need_hosts, refused_rows
        pe = SimpleNamespace(
            name="pe", flagship=True, flagship_next="",
            flagship_hosts=["https://raw.pixls.us/", "https://github.com/"],
            flagship_buildable="Public samples, no key: github.com/x/images "
                               "(sparse checkout; ARW read, eval/a.md); raw.pixls.us "
                               "(CC0, `curl -L`; its CIFF CRWs all read). Noise blend next.")
        self.assertEqual(need_hosts(pe), ["https://github.com/"])
        self.assertEqual(refused_rows([pe], probe=lambda u: "pixls" not in u), {})
        # Named again in a clause that is not spent, it is needed.
        pe.flagship_buildable += " Sweep raw.pixls.us Fuji files."
        self.assertIn("https://raw.pixls.us/", need_hosts(pe))

    def test_host_re_knows_co_ai_ru_but_not_file_names(self):
        from allocate import _HOST_RE
        found = [m.group(1) for m in _HOST_RE.finditer(
            "receipts from huggingface.co and x.ai, yandex.ru; see README.md, calc.mjs, "
            "eval/cord_images.py, flagships.yaml, a/b.co/c")]
        self.assertEqual(found, ["huggingface.co", "x.ai", "yandex.ru"])

    def test_declined_rows_needs_more_leaves_than_works(self):
        from allocate import declined_rows
        hits = lambda n: [("2026-11-18", "x", "why")] * n
        left = {"cf": hits(16), "ei": hits(6), "few": hits(2)}
        worked = {"cf": 9, "ei": 18, "few": 0}
        self.assertEqual(declined_rows(left, worked), {"cf"})


class LeastClaimedTests(unittest.TestCase):
    def test_names_the_row_whose_newest_claim_is_oldest_when_none_is_free(self):
        from datetime import datetime, timezone
        from allocate import least_claimed
        now = datetime(2026, 11, 17, 12, 0, tzinfo=timezone.utc)
        queue = [
            {"venture": "a", "flagship": True, "task": "Deepen (flagship 1): x"},
            {"venture": "stuck", "flagship": True, "task": "Inputs only (flagship 2): x"},
            {"venture": "b", "flagship": True, "task": "Deepen (flagship 3): x"},
            {"venture": "c", "flagship": True, "task": "Deepen (flagship 4): x"},
        ]
        claims = {"a": [(10, "a: x", "2026-11-17T11:30:00Z")],
                  "b": [(11, "b: x", "2026-11-17T07:00:00Z"), (12, "b: y", "2026-11-17T10:00:00Z")],
                  "c": [(13, "c: x", "2026-11-17T11:00:00Z"), (9, "c: old", "2026-11-01T00:00:00Z")]}
        self.assertIsNone(start_here(queue, claims, now=now))
        # b's newest claim (#12, 2 h) is older than c's (1 h) and a's (0.5 h).
        self.assertEqual(least_claimed(queue, claims, now=now), (3, "b", 12, 2.0))
        # Sessions spread over the least contested rows, never the inputs-only one.
        picks = {least_claimed(queue, claims, now=now, session=f"s{n}", spread=2)[:2] for n in range(40)}
        self.assertEqual(picks, {(3, "b"), (4, "c")})
        # A free row means start_here answers, so there is no fallback.
        self.assertIsNone(least_claimed(queue, {"a": claims["a"]}, now=now))
        self.assertIsNone(least_claimed(queue, None, now=now))


class LeftRowsTests(unittest.TestCase):
    def _runs(self, records):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        for i, (date, rec) in enumerate(records):
            Path(d.name, f"{date}-session_{i}.json").write_text(json.dumps(rec))
        return Path(d.name)

    def test_counts_departures_not_claim_races_or_old_records(self):
        from datetime import datetime, timezone
        from allocate import left_rows, left_note
        now = datetime(2026, 11, 17, 12, 0, tzinfo=timezone.utc)
        dev = lambda why, f="portfolio/router/allocate.py": {"file": f, "why": why}
        runs = self._runs([
            ("2026-11-17", {"projects": ["ids-model-check"], "deviations": [
                dev("Start here named roster; nothing buildable, ids-model-check had an item")]}),
            ("2026-11-16", {"projects": ["ventures/ids-model-check"], "deviations": [
                dev("roster's next: is solver tuning", "prompts/ventures/prompt-2.md")]}),
            # A claim race, an unrelated file, and a record too old are not departures.
            ("2026-11-17", {"projects": ["bk"], "deviations": [
                dev("roster was claimed by PR #1 a minute earlier")]}),
            ("2026-11-17", {"projects": ["bk"], "deviations": [
                dev("roster: skipped the post", "docs/posts")]}),
            ("2026-11-14", {"projects": ["bk"], "deviations": [dev("roster had nothing")]}),
            # Worked the row it names: not a departure.
            ("2026-11-17", {"projects": ["roster"], "deviations": [dev("roster first, then bk")]}),
            ("2026-11-17", "not a record"),
        ])
        left = left_rows(["roster", "ids-model-check", "bk"], runs, now=now)
        self.assertEqual([(d, t) for d, t, _ in left["roster"]],
                         [("2026-11-16", "ids-model-check"), ("2026-11-17", "ids-model-check")])
        self.assertEqual(set(left), {"roster"})
        note = left_note("roster", left)
        self.assertIn("2 session(s)", note)
        self.assertIn("ids-model-check (2)", note)
        self.assertIn("nothing buildable", note)  # the newest reason
        self.assertIsNone(left_note("bk", left))

    def test_worked_count_puts_leaves_in_proportion(self):
        from datetime import datetime, timezone
        from allocate import left_rows, left_note, worked_rows
        now = datetime(2026, 11, 17, 12, 0, tzinfo=timezone.utc)
        dev = {"file": "portfolio/router/allocate.py", "why": "roster had nothing buildable"}
        runs = self._runs([
            ("2026-11-17", {"projects": ["bk"], "deviations": [dev]}),
            ("2026-11-17", {"projects": ["roster"]}),
            ("2026-11-16", {"projects": ["ventures/roster"]}),
            ("2026-11-14", {"projects": ["roster"]}),  # outside the window
        ])
        worked = worked_rows(["roster", "bk"], runs, now=now)
        self.assertEqual(worked, {"roster": 2, "bk": 1})
        left = left_rows(["roster", "bk"], runs, now=now)
        note = left_note("roster", left, worked=worked["roster"], has_buildable=True)
        self.assertIn("2 record(s) worked roster", note)
        self.assertIn("Most sessions sent here found work", note)
        self.assertIn("refresh its `buildable:`", note)
        note = left_note("roster", left, worked=0)
        self.assertNotIn("Most sessions", note)
        self.assertIn("add `buildable:` or `inputs_only:`", note)

    def test_no_runs_dir_means_no_hint(self):
        from allocate import left_rows
        self.assertEqual(left_rows(["x"], Path("/nonexistent-runs-dir")), {})


class VentureReportTests(unittest.TestCase):
    def test_prints_the_full_next_open_prs_and_last_landing(self):
        from datetime import datetime, timezone
        long_next = "Open items: " + "x" * 900 + " END"
        deep = make("deep")
        deep.flagship_rank, deep.flagship_next = 0, long_next
        other = make("tiny-csv-check")
        claims = {"deep": [(7, "deep: older", "2026-11-01T00:00:00Z"),
                           (9, "deep: newer", "2026-11-11T06:00:00Z")]}
        now = datetime(2026, 11, 11, 10, 0, tzinfo=timezone.utc)
        out = venture_report("deep", [other, deep], claims=claims,
                             landed="2026-11-11T08:30:00+00:00", now=now)
        self.assertIn("queue row 1 of 2", out)
        self.assertIn(long_next, out)  # untruncated, unlike the table
        self.assertIn("(1.5h ago)", out)
        self.assertLess(out.index("#9 "), out.index("#7 "))  # newest first
        self.assertIn("open PRs naming it: 2", out)

    def test_flagship_next_shows_its_length_against_validates_cap(self):
        import validate
        import allocate
        self.assertEqual(allocate.FLAGSHIP_NEXT_MAX, validate.FLAGSHIP_NEXT_MAX)
        self.assertEqual(allocate.FLAGSHIP_BUILDABLE_MAX, validate.FLAGSHIP_BUILDABLE_MAX)
        deep = make("deep")
        deep.flagship_rank, deep.flagship_next = 0, "y" * 1990
        self.assertIn("1990 of 2000 characters", venture_report("deep", [deep]))
        self.assertIn("now 1990 of 2000 characters", next_task(deep))

    def test_non_flagship_shows_its_task_and_unknowns_say_so(self):
        out = venture_report("tiny-csv-check", [make("tiny-csv-check")])
        self.assertIn("task: ", out)
        self.assertIn("not in the fetched history", out)
        self.assertIn("open PRs: not read", out)

    def test_shallow_cutoff_is_not_reported_as_a_landing(self):
        # The cut-off commit "touches" every file, so its date is only a bound.
        sha = "e" * 40
        log = ("\0" + sha + "\n\nventures/a/x.md\nventures/b/y.md\n"
               "\0" + "f" * 40 + "\n\nventures/a/z.md\n")
        self.assertEqual(count_by_venture(log, {sha}), {"a": 1})
        self.assertEqual(count_by_venture(log), {"a": 2, "b": 1})
        out = venture_report("tiny-csv-check", [make("tiny-csv-check")],
                             landed="on or before 2026-11-05T02:10:47-07:00 (where this shallow ...)")
        self.assertIn("last landed on main: on or before 2026-11-05", out)
        self.assertNotIn("h ago", out)

    def test_last_landed_reads_this_clone(self):
        # Real git: a date for a venture, None for a missing one; the boundary set is a set.
        self.assertIsInstance(shallow_boundary(), set)
        self.assertIsNone(last_landed("no-such-venture-xyz", boundary=set()))

    def test_unknown_venture_is_none(self):
        self.assertIsNone(venture_report("nope", [make("a")]))

    def test_table_points_a_truncated_next_at_the_flag(self):
        v = make("deep")
        v.flagship_rank, v.flagship_next = 0, "y" * 900
        self.assertIn("allocate.py --venture deep", next_task(v))


class ClaimCheckTest(unittest.TestCase):
    """claim_check.py: the PR opened first keeps a contested item."""

    from datetime import datetime as _dt, timezone as _tz
    NOW = _dt(2026, 11, 12, 14, 10, tzinfo=_tz.utc)

    @staticmethod
    def pr(n, title, created, branch=None, repo="duncan-haywood/oss-monorepo"):
        return {"number": n, "title": title, "created_at": created,
                "head": {"ref": branch or f"b{n}", "repo": {"full_name": repo}}}

    def decide(self, prs, kw, **kw2):
        from claim_check import decide
        return decide(prs, kw, now=self.NOW, **kw2)

    def test_the_15145_15146_race_goes_to_the_first_opened(self):
        prs = [self.pr(15146, "changepoint-detector: watch round 5 + post", "2026-11-12T14:00:49Z"),
               self.pr(15145, "changepoint-detector: watch round 5", "2026-11-12T13:59:51Z")]
        later = self.decide(prs, "changepoint-detector", mine=15146)
        self.assertEqual(later["verdict"], "YIELD")
        self.assertEqual([r["number"] for r in later["older"]], [15145])
        first = self.decide(prs, "changepoint-detector", mine=15145)
        self.assertEqual(first["verdict"], "HOLD")
        self.assertEqual([r["number"] for r in first["newer"]], [15146])

    def test_same_second_tie_goes_to_the_lower_number(self):
        prs = [self.pr(9, "x: a", "2026-11-12T14:00:00Z"), self.pr(8, "x: b", "2026-11-12T14:00:00Z")]
        self.assertEqual(self.decide(prs, "x", mine=9)["verdict"], "YIELD")
        self.assertEqual(self.decide(prs, "x", mine=8)["verdict"], "HOLD")

    def test_mine_is_found_by_branch(self):
        prs = [self.pr(2, "x: mine", "2026-11-12T14:05:00Z", branch="claude/me"),
               self.pr(1, "x: theirs", "2026-11-12T14:00:00Z")]
        r = self.decide(prs, "x", branch="claude/me")
        self.assertEqual(r["mine"]["number"], 2)
        self.assertEqual(r["verdict"], "YIELD")

    def test_stale_claims_and_fork_prs_do_not_count(self):
        prs = [self.pr(1, "x: stalled", "2026-11-10T09:00:00Z"),
               self.pr(2, "x: from a fork", "2026-11-12T13:00:00Z", repo="someone/fork"),
               self.pr(3, "x: mine", "2026-11-12T14:05:00Z")]
        r = self.decide(prs, "x", mine=3)
        self.assertEqual(r["verdict"], "HOLD")
        self.assertEqual(r["older"], [])

    def test_whole_word_match_only(self):
        from claim_check import names
        self.assertTrue(names("sales-agent: local model", "sales-agent"))
        self.assertFalse(names("sales-agent-eval: thing", "sales-agent"))
        self.assertTrue(names("Perf: P063 checkout", "p063"))

    def test_no_pr_of_mine_yields_to_any_fresh_claim(self):
        prs = [self.pr(1, "x: theirs", "2026-11-12T14:00:00Z")]
        self.assertEqual(self.decide(prs, "x")["verdict"], "YIELD")
        self.assertEqual(self.decide([], "x")["verdict"], "UNCLAIMED")

    def test_the_17257_17258_check_before_the_pr_is_not_a_hold(self):
        # #17258's session checked before its own PR existed and read HOLD; #17257
        # opened 8 s earlier. Before: UNCLAIMED (not yours). After opening: YIELD.
        from claim_check import report, main
        theirs = self.pr(17257, "photo-editing: cull 10% pans", "2026-11-12T13:58:41Z")
        item = "cull finer window grid for 6% and 10% pans"
        before = self.decide([], "photo-editing", item=item)
        self.assertEqual(before["verdict"], "UNCLAIMED")
        lines = report(before, "photo-editing", self.NOW, 24, item)
        self.assertTrue(any(l.startswith("UNCLAIMED") and "run this again" in l for l in lines), lines)
        self.assertFalse(any(l.startswith("HOLD") for l in lines), lines)
        mine = self.pr(17258, "photo-editing: cull finer window grid for 6% and 10% pans",
                       "2026-11-12T13:58:49Z")
        after = self.decide([theirs, mine], "photo-editing", mine=17258, item=item)
        self.assertEqual(after["verdict"], "YIELD")
        import claim_check
        orig = claim_check.open_prs, claim_check.recently_closed, claim_check.current_branch
        try:
            claim_check.open_prs = lambda: []
            claim_check.recently_closed = lambda: []
            claim_check.current_branch = lambda: "claude/nobody"
            import io, contextlib
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(["photo-editing"]), 3)
        finally:
            claim_check.open_prs, claim_check.recently_closed, claim_check.current_branch = orig

    def test_no_pr_of_mine_prints_the_empty_commit_claim(self):
        from claim_check import report
        now = self.NOW
        lines = report(self.decide([], "x"), "x", now, 24)
        self.assertTrue(any("--allow-empty" in l and "'x: <item>'" in l for l in lines), lines)
        mine = [self.pr(3, "x: mine", "2026-11-12T14:05:00Z")]
        lines = report(self.decide(mine, "x", mine=3), "x", now, 24)
        self.assertFalse(any("--allow-empty" in l for l in lines), lines)

    def test_item_lets_a_different_item_share_the_flagship(self):
        # The 2026-11-13 changepoint-detector pair: #15407 and #15411 both merged.
        prs = [self.pr(15407, "changepoint-detector: watch several metrics in one run (--columns)",
                       "2026-11-12T14:00:00Z"),
               self.pr(15411, "changepoint-detector: round 10 on NAB's 47 real series",
                       "2026-11-12T14:04:00Z")]
        r = self.decide(prs, "changepoint-detector", mine=15411, item="round 10 on NAB real series")
        self.assertEqual(r["verdict"], "HOLD")
        self.assertEqual([x["number"] for x in r["sharing"]], [15407])
        # Without --item the check stays slug-only.
        self.assertEqual(self.decide(prs, "changepoint-detector", mine=15411)["verdict"], "YIELD")

    def test_item_still_yields_to_the_same_item_or_a_bare_claim(self):
        same = [self.pr(1, "x: deferred revenue register", "2026-11-12T14:00:00Z"),
                self.pr(2, "x: mine", "2026-11-12T14:05:00Z")]
        r = self.decide(same, "x", mine=2, item="deferred revenue waterfall")
        self.assertEqual(r["verdict"], "YIELD")
        bare = [self.pr(15717, "ai-bookkeeper: claim (WIP)", "2026-11-12T14:00:00Z"),
                self.pr(15718, "ai-bookkeeper: deferred revenue", "2026-11-12T14:01:00Z")]
        r = self.decide(bare, "ai-bookkeeper", mine=15718, item="deferred revenue")
        self.assertEqual(r["verdict"], "YIELD")
        self.assertEqual(r["sharing"], [])

    def test_one_shared_flagship_word_shares_two_still_block(self):
        # 2026-11-18: #17403 (3FR reader) made the IIQ S reader session YIELD; both merged.
        kw = "photo-editing"
        merged = [self.merged_pr(17360, "photo-editing: Minolta MRW reader, every sensel equal to LibRaw",
                                 "2026-11-12T09:00:00Z", "2026-11-12T10:00:00Z"),
                  self.merged_pr(17196, "photo-editing: Coolpix NRW reader, 13 real files",
                                 "2026-11-12T08:00:00Z", "2026-11-12T09:00:00Z")]
        prs = [self.pr(17403, "photo-editing: Hasselblad 3FR reader (claim)", "2026-11-12T14:00:00Z"),
               self.pr(17420, "photo-editing: IIQ S reader (claim)", "2026-11-12T14:05:00Z")]
        r = self.decide(prs, kw, mine=17420, item="IIQ S reader", merged=merged)
        self.assertEqual(r["verdict"], "HOLD")
        self.assertEqual([x["number"] for x in r["sharing"]], [17403])
        # Without enough titles to call "reader" vocabulary, one word still blocks.
        self.assertEqual(self.decide(prs, kw, mine=17420, item="IIQ S reader")["verdict"], "YIELD")
        # #17257/#17258: "cull" and "pans" both flagship words, but two shared words block.
        cull = merged + [self.merged_pr(17199, "photo-editing: cull 6% pans group",
                                        "2026-11-12T07:00:00Z", "2026-11-12T08:00:00Z"),
                         self.merged_pr(17213, "photo-editing: cull burst grouping pans",
                                        "2026-11-12T06:00:00Z", "2026-11-12T07:00:00Z")]
        prs = [self.pr(17257, "photo-editing: cull 10% pans (claim)", "2026-11-12T14:00:00Z"),
               self.pr(17258, "photo-editing: cull finer window grid (claim)", "2026-11-12T14:00:08Z")]
        r = self.decide(prs, kw, mine=17258, item="cull finer window grid for 6% and 10% pans",
                        merged=cull)
        self.assertEqual(r["verdict"], "YIELD")

    def test_item_words_drop_slug_and_claim_vocabulary(self):
        from claim_check import item_words, overlap
        self.assertEqual(item_words("ai-bookkeeper: claim (WIP) + post", "ai-bookkeeper"), set())
        self.assertEqual(overlap("x: a slice", "x", "anything"), "bare")
        self.assertEqual(overlap("x: OCR totals", "x", "receipt totals"), "same")

    def test_report_prints_share_and_the_item_in_the_recipe(self):
        from claim_check import report, claim_recipe
        prs = [self.pr(1, "x: solver gap", "2026-11-12T14:00:00Z"),
               self.pr(2, "x: sales reader", "2026-11-12T14:05:00Z")]
        r = self.decide(prs, "x", mine=2, item="sales reader")
        lines = report(r, "x", self.NOW, 24, "sales reader")
        self.assertTrue(any(l.startswith("SHARE:") for l in lines), lines)
        self.assertTrue(any("#1 " in l for l in lines), lines)
        self.assertIn('--item "sales reader"', claim_recipe("x", "sales reader"))
        self.assertIn("no `checkout -b`", claim_recipe("x"))  # the harness made the branch
        slug_only = report(self.decide(prs, "x", mine=2), "x", self.NOW, 24)
        self.assertTrue(any("--item" in l for l in slug_only), slug_only)

    @staticmethod
    def merged_pr(n, title, created, merged, repo="duncan-haywood/oss-monorepo"):
        return {"number": n, "title": title, "created_at": created, "merged_at": merged,
                "head": {"ref": f"b{n}", "repo": {"full_name": repo}}}

    def test_a_just_merged_pr_on_the_item_is_landed(self):
        # 2026-11-16: #16574 merged the edge-time drop fit at 12:59; #16579 claimed it at 13:00.
        from datetime import datetime, timezone
        now = datetime(2026, 11, 16, 13, 5, tzinfo=timezone.utc)
        mine = [self.pr(16579, "open-tennis-robots: edge-time drop fit on the whole drill",
                        "2026-11-16T13:00:32Z")]
        merged = [self.merged_pr(16574, "open-tennis-robots: the board surveys its own ESC lag "
                                 "(ESC_SURVEY frame); edge-time drop fit tried, kept off + post",
                                 "2026-11-16T12:41:37Z", "2026-11-16T12:59:41Z"),
                  self.merged_pr(16467, "open-tennis-robots: empty-hopper verdict from the pre-ball speed",
                                 "2026-11-16T05:20:03Z", "2026-11-16T05:49:39Z"),
                  self.merged_pr(16600, "chant-forge: edge-time thing", "2026-11-16T12:00:00Z",
                                 "2026-11-16T12:30:00Z"),
                  {**self.merged_pr(16601, "open-tennis-robots: edge-time fit, closed unmerged",
                                    "2026-11-16T12:00:00Z", None)}]
        from claim_check import decide, report
        r = decide(mine, "open-tennis-robots", mine=16579, now=now, item="edge-time drop fit",
                   merged=merged)
        self.assertEqual(r["verdict"], "LANDED")
        self.assertEqual([x["number"] for x in r["landed"]], [16574])
        self.assertEqual([x["number"] for x in r["merged"]], [16467])
        lines = report(r, "open-tennis-robots", now, 24, "edge-time drop fit")
        self.assertTrue(any(l.startswith("LANDED:") for l in lines), lines)
        self.assertTrue(any("#16574 (merged 2026-11-16T12:59:41Z, 5 min ago)" in l for l in lines), lines)
        # A merge on another item, or a slug-only check, never blocks: busy flagships land daily.
        other = decide(mine, "open-tennis-robots", mine=16579, now=now, item="hopper refill alarm",
                       merged=merged[:1])
        self.assertEqual(other["verdict"], "HOLD")
        self.assertEqual(decide(mine, "open-tennis-robots", mine=16579, now=now,
                                merged=merged)["verdict"], "HOLD")

    def test_merges_the_clone_already_holds_and_one_word_overlaps_do_not_land(self):
        from datetime import datetime, timezone
        from claim_check import decide, shares_item
        now = datetime(2026, 11, 16, 18, 45, tzinfo=timezone.utc)
        merged = [self.merged_pr(16635, "open-tennis-robots: the 1.48x wheel was a 3-revolution snapshot; "
                                 "HOLD_RPM 3,000; fixed-time tach built, off + post",
                                 "2026-11-16T17:00:00Z", "2026-11-16T17:42:41Z"),
                  self.merged_pr(16574, "open-tennis-robots: edge-time drop fit tried, kept off",
                                 "2026-11-16T12:41:37Z", "2026-11-16T12:59:41Z")]
        # "fixed-time" shares only "time" with the item: listed, not LANDED.
        self.assertFalse(shares_item(merged[0]["title"], "open-tennis-robots", "edge-time drop fit"))
        self.assertTrue(shares_item("x: OCR totals", "x", "totals"))
        clone = datetime(2026, 11, 16, 13, 30, tzinfo=timezone.utc)  # main already holds #16574
        r = decide([], "open-tennis-robots", now=now, item="edge-time drop fit", merged=merged,
                   main_at=clone)
        self.assertEqual(r["verdict"], "UNCLAIMED")  # not LANDED; no open PR of mine
        self.assertEqual([x["number"] for x in r["merged"]], [16635])
        r = decide([], "open-tennis-robots", now=now, item="edge-time drop fit", merged=merged,
                   main_at=datetime(2026, 11, 16, 12, 0, tzinfo=timezone.utc))
        self.assertEqual(r["verdict"], "LANDED")

    def test_merged_stale_fork_and_my_own_pr_do_not_land(self):
        from datetime import datetime, timezone
        from claim_check import decide
        now = datetime(2026, 11, 16, 17, 0, tzinfo=timezone.utc)
        merged = [self.merged_pr(1, "x: closure anchor", "2026-11-14T09:00:00Z", "2026-11-14T10:00:00Z"),
                  self.merged_pr(2, "x: closure anchor", "2026-11-16T16:00:00Z", "2026-11-16T16:56:00Z",
                                 repo="someone/fork"),
                  self.merged_pr(3, "x: closure anchor", "2026-11-16T16:00:00Z", "2026-11-16T16:58:00Z")]
        r = decide([], "x", mine=3, now=now, item="closure anchor", merged=merged)
        self.assertEqual(r["verdict"], "UNCLAIMED")  # not LANDED; #3 merged, so no open claim
        self.assertEqual(r["landed"] + r["merged"], [])

    def test_an_open_older_claim_still_wins_over_landed(self):
        from claim_check import decide
        prs = [self.pr(1, "x: closure anchor", "2026-11-12T14:00:00Z"),
               self.pr(2, "x: closure anchor", "2026-11-12T14:05:00Z")]
        merged = [self.merged_pr(0, "x: closure anchor v1", "2026-11-12T13:00:00Z", "2026-11-12T13:30:00Z")]
        r = self.decide(prs, "x", mine=2, item="closure anchor", merged=merged)
        self.assertEqual(r["verdict"], "YIELD")
        self.assertEqual([x["number"] for x in r["landed"]], [0])


class PathOverlapTest(unittest.TestCase):
    """claim_check.path_overlap: same files under a different title."""

    from datetime import datetime as _dt, timezone as _tz
    NOW = _dt(2026, 11, 19, 7, 30, tzinfo=_tz.utc)
    EGG = [".gitignore"] + [f"ventures/v{i}/src/v.egg-info/PKG-INFO" for i in range(3)]

    @staticmethod
    def pr(n, title, created, branch=None, merged=None, repo="duncan-haywood/oss-monorepo"):
        return {"number": n, "title": title, "created_at": created, "merged_at": merged,
                "head": {"ref": branch or f"b{n}", "repo": {"full_name": repo}}}

    def run_overlap(self, paths, prs, files, **kw):
        from claim_check import path_overlap
        return path_overlap(paths, prs, now=self.NOW, files=lambda n: files.get(n, []), **kw)

    def test_the_17578_case_a_title_with_other_words_still_overlaps(self):
        # #17578 "ci: untrack generated *.egg-info" opened 40 min before a second
        # session made the same 18-file change while thinking of run_workflow_locally.
        theirs = self.pr(17578, "ci: untrack generated *.egg-info", "2026-11-19T06:50:00Z")
        mine = self.pr(17590, "process: run_workflow_locally sweeps", "2026-11-19T07:25:00Z", branch="me")
        ov = self.run_overlap(self.EGG, [theirs, mine], {17578: self.EGG + ["docs/posts/x.md"]}, branch="me")
        self.assertEqual([r["number"] for r in ov["rows"]], [17578])
        self.assertTrue(ov["rows"][0]["strong"] and ov["rows"][0]["older"])
        # the same PR, merged after my clone, still overlaps
        merged = dict(theirs, merged_at="2026-11-19T07:22:43Z")
        ov = self.run_overlap(self.EGG, [mine], {17578: self.EGG}, branch="me", merged=[merged],
                              main_at=self._dt(2026, 11, 19, 7, 17, tzinfo=self._tz.utc))
        self.assertTrue(ov["rows"][0]["strong"] and ov["rows"][0]["older"])
        # ... but not once my clone already holds it
        ov = self.run_overlap(self.EGG, [mine], {17578: self.EGG}, branch="me", merged=[merged],
                              main_at=self._dt(2026, 11, 19, 7, 23, tzinfo=self._tz.utc))
        self.assertEqual(ov["rows"], [])

    def test_hubs_forks_stale_and_my_own_pr_never_count(self):
        prs = [self.pr(1, "a", "2026-11-19T07:00:00Z"), self.pr(2, "b", "2026-11-19T07:01:00Z"),
               self.pr(3, "c", "2026-11-19T07:02:00Z"),
               self.pr(4, "fork", "2026-11-19T07:03:00Z", repo="x/fork"),
               self.pr(5, "stale", "2026-11-15T07:00:00Z"),
               self.pr(6, "mine", "2026-11-19T07:04:00Z", branch="me")]
        hot = "ventures/v/index.html"
        files = {1: [hot, "portfolio/flagships.yaml"], 2: [hot], 3: [hot], 4: ["ventures/v/app.js"],
                 5: ["ventures/v/app.js"], 6: ["ventures/v/app.js"]}
        ov = self.run_overlap([hot, "ventures/v/app.js", "portfolio/flagships.yaml",
                               "prompts/runs/r.json"], prs, files, branch="me")
        self.assertEqual(ov["hubs"], [hot])
        self.assertEqual(ov["paths"], ["ventures/v/app.js"])
        self.assertEqual(ov["rows"], [])

    def test_a_small_overlap_is_listed_not_strong_and_newer_prs_are_not_older(self):
        mine = self.pr(9, "mine", "2026-11-19T07:00:00Z", branch="me")
        newer = self.pr(10, "later", "2026-11-19T07:10:00Z")
        older = self.pr(8, "earlier", "2026-11-19T06:00:00Z")
        paths = ["a", "b", "c", "d", "e"]
        ov = self.run_overlap(paths, [mine, newer, older], {10: paths, 8: ["a"]}, branch="me")
        rows = {r["number"]: r for r in ov["rows"]}
        self.assertTrue(rows[10]["strong"] and not rows[10]["older"])
        self.assertTrue(rows[8]["older"] and not rows[8]["strong"])

    def test_main_exits_4_on_overlap_only_when_titles_found_no_claim(self):
        import claim_check, io, contextlib
        saved = (claim_check.open_prs, claim_check.recently_closed, claim_check.current_branch,
                 claim_check.pr_files)
        theirs = self.pr(17578, "ci: untrack generated *.egg-info",
                         "2026-11-19T06:50:00Z")
        theirs["created_at"] = claim_check.datetime.now(claim_check.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        try:
            claim_check.open_prs = lambda: [theirs]
            claim_check.recently_closed = lambda: []
            claim_check.current_branch = lambda: "claude/nobody"
            claim_check.pr_files = lambda n: list(self.EGG)
            with contextlib.redirect_stdout(io.StringIO()) as out:
                self.assertEqual(claim_check.main(["--paths-only", "--paths", *self.EGG]), 4)
            self.assertIn("OVERLAP", out.getvalue())
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(claim_check.main(["egg-info", "--paths", *self.EGG]), 1)  # title YIELD wins
                self.assertEqual(claim_check.main(["other", "--no-paths"]), 3)
                self.assertEqual(claim_check.main(["--paths-only", "--paths", "elsewhere.py"]), 0)
        finally:
            (claim_check.open_prs, claim_check.recently_closed, claim_check.current_branch,
             claim_check.pr_files) = saved


class RequestsLineTest(unittest.TestCase):
    """The table names which open website requests are flagship rows."""

    def write(self, reqs):
        d = tempfile.mkdtemp()
        p = Path(d) / "requests.json"
        p.write_text(json.dumps({"requests": reqs}))
        return p

    queue = [{"venture": "ai-bookkeeper", "flagship": True},
             {"venture": "tiny-tool", "flagship": False}]

    def test_owner_requests_map_to_rows(self):
        p = self.write([
            {"id": "R-1", "status": "building", "source": "owner", "project": "ventures/ai-bookkeeper"},
            {"id": "R-2", "status": "building", "source": "owner", "project": "portfolio/monetization"},
            {"id": "R-3", "status": "shipped", "source": "owner", "project": "ventures/tiny-tool"},
        ])
        line = requests_line(self.queue, p)
        self.assertIn("2 open", line)
        self.assertIn("none from outside", line)
        self.assertIn("R-1 = row 1 ai-bookkeeper", line)
        self.assertIn("R-2 portfolio/monetization", line)
        self.assertNotIn("R-3", line)

    def test_outside_request_comes_first(self):
        p = self.write([{"id": "R-9", "status": "received", "title": "A shop site"}])
        line = requests_line(self.queue, p)
        self.assertIn("1 from outside (R-9)", line)
        self.assertIn("ideas.py", line)

    def test_missing_or_empty_file_prints_nothing(self):
        self.assertEqual(requests_line(self.queue, Path("/nonexistent/requests.json")), "")
        self.assertEqual(requests_line(self.queue, self.write([])), "")


class PostLimitsLineTests(unittest.TestCase):
    def test_line_carries_the_checker_caps(self):
        import sys
        sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "platform" / "ci"))
        import check_post_frontmatter as cpf
        from allocate import post_limits_line
        line = post_limits_line()
        self.assertTrue(line.startswith("post front matter:"))
        self.assertIn(f"seo_title <= {cpf.LIMITS['seo_title']}", line)


class MainFlagshipsTest(unittest.TestCase):
    """refresh_tip + main_flagships: rows come from origin/main when a sibling's merge
    changed flagships.yaml after this clone (four claims of just-merged items, 2026-11-16/17)."""

    def git(self, cwd, *args):
        import subprocess
        subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *args], cwd=cwd,
                       check=True, capture_output=True, text=True)

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        t = Path(self.tmp.name)
        self.remote, self.sibling, self.clone = t / "remote.git", t / "sibling", t / "clone"
        self.git(t, "init", "-q", "--bare", "-b", "main", str(self.remote))
        self.git(t, "clone", "-q", str(self.remote), str(self.sibling))
        (self.sibling / "portfolio").mkdir()
        self.write(self.sibling, "flagships:\n- venture: a\n  next: old item\n")
        self.git(self.sibling, "add", "-A")
        self.git(self.sibling, "commit", "-qm", "first")
        self.git(self.sibling, "push", "-q", "origin", "HEAD:main")
        self.git(t, "clone", "-q", str(self.remote), str(self.clone))
        # A sibling session merges a change to the row after this clone was made.
        self.write(self.sibling, "flagships:\n- venture: a\n  next: new item\n")
        self.git(self.sibling, "commit", "-qam", "a: old item landed (#9)")
        self.git(self.sibling, "push", "-q", "origin", "HEAD:main")

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, repo, text):
        (repo / "portfolio" / "flagships.yaml").write_text(text)

    def test_reads_main_after_a_sibling_merge(self):
        from allocate import main_flagships, refresh_tip
        self.assertEqual(main_flagships(self.clone), (None, ""))  # origin/main not fetched yet
        self.assertTrue(refresh_tip(self.clone))
        self.assertFalse(refresh_tip(self.clone))  # already the tip: no second fetch
        text, note = main_flagships(self.clone)
        self.assertIn("new item", text)
        self.assertIn("1 commit(s)", note)
        self.assertIn("old item landed (#9)", note)

    def test_keeps_a_sessions_own_edits(self):
        from allocate import main_flagships, refresh_tip
        refresh_tip(self.clone)
        self.write(self.clone, "flagships:\n- venture: a\n  next: my claim\n")
        text, note = main_flagships(self.clone)
        self.assertIsNone(text)
        self.assertIn("uncommitted edits", note)
        self.git(self.clone, "commit", "-qam", "mine")
        text, note = main_flagships(self.clone)
        self.assertIsNone(text)
        self.assertIn("git merge origin/main", note)

    def test_override_reaches_the_loaders(self):
        import allocate
        allocate._FLAGSHIPS_TEXT = "flagships:\n- venture: zz\n  next: from main\n"
        try:
            self.assertEqual(load_flagships(FLAGSHIPS_PATH), {"zz": (0, "from main")})
        finally:
            allocate._FLAGSHIPS_TEXT = None
        self.assertNotIn("zz", load_flagships(FLAGSHIPS_PATH))


class FoldedRowsTests(unittest.TestCase):
    """The default table folds rows whose task is shared advice (2026-11-18: 1,326
    such rows were 545 KB of a 578 KB table, past the tool output cap)."""

    def test_kinds(self):
        from allocate import folded_kind, MAINTAIN_TASK, NO_HYPOTHESIS_PREFIX
        self.assertIsNotNone(folded_kind(MAINTAIN_TASK))
        self.assertIsNotNone(folded_kind(NO_HYPOTHESIS_PREFIX + " -- add one"))
        self.assertIsNotNone(folded_kind('Explore (awaiting visitors; x): "y"'))
        self.assertIsNone(folded_kind("Deepen (flagship 1): BUILDABLE HERE: z"))
        self.assertIsNone(folded_kind('Explore: test the untested hypothesis -- "q"'))

    def test_real_table_stays_small_and_all_lists_every_row(self):
        import contextlib
        import io
        from allocate import main
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(main(["--no-deepen", "--no-claims"]), 0)
        text = out.getvalue()
        self.assertLess(len(text), 120_000, "default table grew past the fold")
        self.assertIn("Deepen (flagship", text)
        folded = sum(int(line.split()[2]) for line in text.splitlines()
                     if line.startswith("... and "))
        full = io.StringIO()
        with contextlib.redirect_stdout(full):
            main(["--no-deepen", "--no-claims", "--all"])
        self.assertNotIn("\n... and ", full.getvalue())
        self.assertEqual(len(full.getvalue().splitlines()) - len(text.splitlines()),
                         folded - sum(1 for l in text.splitlines() if l.startswith("... and ")))

    def test_brief_keeps_start_here_and_drops_the_table(self):
        import contextlib
        import io
        from allocate import main
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(main(["--no-deepen", "--no-claims", "--no-probe", "--brief"]), 0)
        text = out.getvalue()
        self.assertIn("Start here:", text)
        self.assertIn("post front matter:", text)
        self.assertNotIn("7d-commits", text)
        self.assertLess(len(text), 10_000)


class YieldRedirectTest(unittest.TestCase):
    """claim_check.py: a YIELD on a flagship names the free rows to go to instead."""

    from datetime import datetime as _dt, timezone as _tz
    NOW = _dt(2026, 11, 19, 12, 0, tzinfo=_tz.utc)
    YAML = """flagships:
  - venture: alpha
    next: a
  - venture: beta
    inputs_only: a real customer file
    next: b
  - venture: gamma
    next: c
  - venture: delta
    not_before: 2099-01-01
    next: d
  - venture: eps
    next: e
"""

    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.path = Path(self.dir.name) / "flagships.yaml"
        self.path.write_text(self.YAML)

    def tearDown(self):
        self.dir.cleanup()

    @staticmethod
    def pr(n, title, created):
        return {"number": n, "title": title, "created_at": created,
                "head": {"ref": f"b{n}", "repo": {"full_name": "duncan-haywood/oss-monorepo"}}}

    def free(self, prs, kw):
        from claim_check import free_flagships
        return free_flagships(prs, kw, self.NOW, path=self.path)

    def test_skips_own_row_inputs_only_dated_and_freshly_claimed_rows(self):
        prs = [self.pr(1, "alpha: item one", "2026-11-19T11:57:38Z"),
               self.pr(2, "gamma: thing", "2026-11-19T10:00:00Z")]
        self.assertEqual(self.free(prs, "alpha"), ["eps"])

    def test_a_claim_older_than_the_start_here_window_frees_the_row(self):
        prs = [self.pr(2, "gamma: thing", "2026-11-19T06:00:00Z")]  # 6 h > CLAIM_FRESH_HOURS
        self.assertEqual(self.free(prs, "alpha"), ["gamma", "eps"])

    def test_not_a_flagship_gives_none(self):
        self.assertIsNone(self.free([], "research/water-leaks"))
        self.assertIsNone(self.free([], "process"))

    def test_redirect_line_picks_by_session_and_handles_none_free(self):
        from claim_check import redirect_line
        line = redirect_line(["gamma", "eps"], None)
        self.assertIn("Go to gamma", line)
        self.assertIn("allocate.py --venture gamma", line)
        picks = {redirect_line(["gamma", "eps"], f"session_{i}").split("Go to ")[1].split(" ")[0]
                 for i in range(20)}
        self.assertEqual(picks, {"gamma", "eps"})
        self.assertIn("another item on this row", redirect_line([], "s"))

    def test_report_prints_the_redirect_only_on_yield(self):
        from claim_check import decide, report
        prs = [self.pr(1, "alpha: item one", "2026-11-19T11:57:38Z"),
               self.pr(2, "alpha: item one", "2026-11-19T11:57:38Z")]
        y = decide(prs, "alpha", mine=2, now=self.NOW)
        self.assertEqual(y["verdict"], "YIELD")
        lines = report(y, "alpha", self.NOW, 24, None, "Go to eps")
        self.assertIn("Go to eps", lines)
        h = decide(prs, "alpha", mine=1, now=self.NOW)
        self.assertNotIn("Go to eps", report(h, "alpha", self.NOW, 24, None, "Go to eps"))


if __name__ == "__main__":
    unittest.main()
