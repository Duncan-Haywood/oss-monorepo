"""`portfolio/router/router.py` must act on the stopping rules it carries.

This is the engine `scripts/test-ci.sh` runs and the one that writes
`portfolio/ALLOCATION_REPORT.md`, the ranked queue an agent session reads to
choose what to work on. Until 2026-08-03 it parsed `kill_criteria` into a
dataclass field and never looked at it again, so a venture could trip its own
declared brake and keep its rank, its budget and its recommendation. The
evaluation lived in `allocate.py`, which nothing runs.

These tests are about the acting, not the evaluating — `kill_criteria.py` owns
the verdicts and `tests/test_kill_criteria_ratchet.py` covers them. What is
locked here is that a fired criterion costs the venture its allocation, costs it
its place at the top of the queue, and says so in the report.
"""

from __future__ import annotations

import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from portfolio.router.router import (
    STOP_HOLDING,
    STOP_NONE,
    STOP_TRIGGERED,
    STOPPED_FOCUS,
    PortfolioRouter,
    route_portfolio,
)

STRUCTURED = textwrap.dedent(
    """\
    kill_criteria:
      - description: >-
          $150 of recorded agent spend with no revenue ever recorded.
        when:
          - metric: cumulative_agent_spend_usd
            comparator: ">="
            threshold: 150
          - metric: cumulative_revenue_usd
            comparator: "=="
            threshold: 0
    """
)

PROSE = "kill_criteria:\n  - Fewer than 50 active learners after 60 days.\n"

UNKNOWN_METRIC = textwrap.dedent(
    """\
    kill_criteria:
      - description: Fewer than 50 active learners.
        metric: active_learners
        comparator: "<"
        threshold: 50
    """
)


def write_venture(root: Path, name: str, criteria: str, *, protected: bool = False,
                  cap: float = 60.0, mrr: object = 0) -> None:
    directory = root / "ventures" / name
    directory.mkdir(parents=True, exist_ok=True)
    mrr_line = "  mrr: null\n" if mrr is None else f"  mrr: {mrr}\n"
    (directory / "VENTURE.yaml").write_text(
        f"name: {name}\nstage: prototype\nowner: tester\n"
        "economics:\n" + mrr_line +
        f"budget:\n  monthly_cap: {cap}\n  protected: {str(protected).lower()}\n" + criteria,
        encoding="utf-8",
    )


def write_ledger(root: Path, rows: str, period: str = "2026-07") -> None:
    directory = root / "portfolio" / "ledger"
    directory.mkdir(parents=True, exist_ok=True)
    (directory / f"{period}.yaml").write_text(
        f"period: {period}\nentries:\n{rows}", encoding="utf-8"
    )


class RouterStoppingRuleTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)

    def allocations(self, budget: float = 300.0):
        return {a.venture_name: a for a in PortfolioRouter(self.root).compute_allocation(budget)}

    # --- the three states ------------------------------------------------

    def test_triggered_venture_is_defunded(self):
        write_venture(self.root, "burner", STRUCTURED)
        write_ledger(self.root, "  - venture: burner\n    agent_spend_usd: 200.0\n    mrr_end: 0\n")
        burner = self.allocations()["burner"]
        self.assertEqual(burner.stopping_rule, STOP_TRIGGERED)
        self.assertEqual(burner.allocated_spend, 0.0)
        self.assertGreater(burner.withheld_spend, 0.0)
        self.assertEqual(burner.suggested_focus, STOPPED_FOCUS)
        self.assertIn("STOPPING RULE TRIGGERED", burner.rationale)
        self.assertEqual(len(burner.kill_reasons), 1)
        self.assertIn("cumulative_agent_spend_usd=200", burner.kill_reasons[0])

    def test_measurable_criterion_below_threshold_is_holding_and_funded(self):
        write_venture(self.root, "steady", STRUCTURED)
        write_ledger(self.root, "  - venture: steady\n    agent_spend_usd: 18.18\n    mrr_end: 0\n")
        steady = self.allocations()["steady"]
        self.assertEqual(steady.stopping_rule, STOP_HOLDING)
        self.assertGreater(steady.allocated_spend, 0.0)
        self.assertEqual(steady.withheld_spend, 0.0)
        self.assertEqual(steady.kill_reasons, [])

    def test_prose_only_venture_has_no_stopping_rule(self):
        write_venture(self.root, "prosaic", PROSE)
        write_ledger(self.root, "  - venture: prosaic\n    agent_spend_usd: 900.0\n    mrr_end: 0\n")
        prosaic = self.allocations()["prosaic"]
        self.assertEqual(prosaic.stopping_rule, STOP_NONE)
        self.assertGreater(prosaic.allocated_spend, 0.0)
        self.assertIn("No measurable stopping rule", prosaic.rationale)

    def test_unknown_metric_is_not_a_stopping_rule_and_never_triggers(self):
        """An invented metric must not read as a rule, and must not defund either."""
        write_venture(self.root, "invented", UNKNOWN_METRIC)
        write_ledger(self.root, "  - venture: invented\n    agent_spend_usd: 900.0\n    mrr_end: 0\n")
        self.assertEqual(self.allocations()["invented"].stopping_rule, STOP_NONE)

    def test_venture_absent_from_the_ledger_cannot_trigger(self):
        write_venture(self.root, "unfunded", STRUCTURED)
        write_ledger(self.root, "  - venture: other\n    agent_spend_usd: 5.0\n    mrr_end: 0\n")
        self.assertEqual(self.allocations()["unfunded"].stopping_rule, STOP_NONE)

    def test_recorded_revenue_keeps_a_high_spender_funded(self):
        write_venture(self.root, "earner", STRUCTURED)
        write_ledger(self.root, "  - venture: earner\n    agent_spend_usd: 900.0\n    mrr_end: 40\n")
        earner = self.allocations()["earner"]
        self.assertEqual(earner.stopping_rule, STOP_HOLDING)
        self.assertGreater(earner.allocated_spend, 0.0)

    # --- what the queue does with it -------------------------------------

    def test_triggered_venture_ranks_last_despite_the_highest_score(self):
        write_venture(self.root, "burner", STRUCTURED, protected=True, mrr=None)
        write_venture(self.root, "quiet", PROSE, protected=False)
        write_ledger(
            self.root,
            "  - venture: burner\n    agent_spend_usd: 200.0\n    mrr_end: 0\n",
        )
        allocations = PortfolioRouter(self.root).compute_allocation(300.0)
        self.assertEqual([a.venture_name for a in allocations], ["quiet", "burner"])
        self.assertEqual(allocations[-1].rank, 2)

    def test_protection_does_not_exempt_a_triggered_venture(self):
        """print-atelier is both protected and the only venture with a real rule."""
        write_venture(self.root, "burner", STRUCTURED, protected=True)
        write_ledger(self.root, "  - venture: burner\n    agent_spend_usd: 200.0\n    mrr_end: 0\n")
        self.assertEqual(self.allocations()["burner"].allocated_spend, 0.0)

    def test_withheld_budget_lowers_portfolio_spend_rather_than_moving_it(self):
        """A brake that redistributes spends the same money.

        The withheld allocation must not roll onto the next venture. If it did,
        the portfolio would commit the same total whether or not a stopping rule
        fired, and the only effect of a fired criterion would be which
        zero-revenue venture received the budget.
        """
        for name in ("alpha", "beta"):
            write_venture(self.root, name, PROSE, cap=200.0)
        write_venture(self.root, "burner", STRUCTURED, cap=200.0)
        write_ledger(self.root, "  - venture: burner\n    agent_spend_usd: 200.0\n    mrr_end: 0\n")
        with_stop = self.allocations()
        self.assertEqual(with_stop["burner"].allocated_spend, 0.0)

        # The same portfolio with the criterion below its threshold.
        write_ledger(self.root, "  - venture: burner\n    agent_spend_usd: 10.0\n    mrr_end: 0\n")
        without_stop = self.allocations()
        self.assertGreater(without_stop["burner"].allocated_spend, 0.0)

        for name in ("alpha", "beta"):
            self.assertEqual(
                with_stop[name].allocated_spend,
                without_stop[name].allocated_spend,
                f"{name}'s allocation moved because another venture was stopped",
            )

        total_with = sum(a.allocated_spend for a in with_stop.values())
        total_without = sum(a.allocated_spend for a in without_stop.values())
        self.assertLess(total_with, total_without)
        self.assertAlmostEqual(
            total_without - total_with,
            with_stop["burner"].withheld_spend,
            places=2,
        )

    def test_a_stopped_venture_does_not_draw_down_the_pool(self):
        """Two stopped ventures must not shrink each other's reported saving.

        A triggered row is withheld, not spent, so it must leave the remaining
        pool untouched. If it deducted its allocation anyway the second stopped
        venture would be measured against a pool the first had already drained,
        and the reported saving would fall for no reason a reader could see.
        Both are last in the queue, so nothing else in the report would move.
        """
        write_venture(self.root, "quiet", PROSE, cap=200.0)
        for name in ("burner-a", "burner-b"):
            write_venture(self.root, name, STRUCTURED, cap=200.0)
        write_ledger(
            self.root,
            "  - venture: burner-a\n    agent_spend_usd: 200.0\n    mrr_end: 0\n"
            "  - venture: burner-b\n    agent_spend_usd: 200.0\n    mrr_end: 0\n",
        )
        allocations = self.allocations()
        for name in ("burner-a", "burner-b"):
            self.assertEqual(allocations[name].stopping_rule, STOP_TRIGGERED)
            self.assertEqual(allocations[name].allocated_spend, 0.0)
        self.assertEqual(
            allocations["burner-a"].withheld_spend,
            allocations["burner-b"].withheld_spend,
        )

    # --- what the consumers see ------------------------------------------

    def test_route_portfolio_summary_names_the_stopped_ventures(self):
        write_venture(self.root, "burner", STRUCTURED)
        write_venture(self.root, "prosaic", PROSE)
        write_ledger(self.root, "  - venture: burner\n    agent_spend_usd: 200.0\n    mrr_end: 0\n")
        summary = route_portfolio(self.root, 300.0)["portfolio_summary"]
        self.assertEqual(summary["stopped_ventures"], ["burner"])
        self.assertEqual(summary["without_stopping_rule"], ["prosaic"])
        self.assertGreater(summary["withheld_by_stopping_rule_usd"], 0.0)

    def test_queue_rows_carry_the_stopping_rule_state(self):
        write_venture(self.root, "burner", STRUCTURED)
        write_ledger(self.root, "  - venture: burner\n    agent_spend_usd: 200.0\n    mrr_end: 0\n")
        row = route_portfolio(self.root, 300.0)["queue"][0]
        self.assertEqual(row["stopping_rule"], STOP_TRIGGERED)
        self.assertEqual(row["allocated_budget_usd"], 0.0)
        self.assertGreater(row["withheld_budget_usd"], 0.0)
        self.assertTrue(row["kill_reasons"])

    def test_report_escalates_a_triggered_venture_with_its_measured_values(self):
        write_venture(self.root, "burner", STRUCTURED)
        write_ledger(self.root, "  - venture: burner\n    agent_spend_usd: 200.0\n    mrr_end: 0\n")
        report = PortfolioRouter(self.root).generate_report_markdown(300.0)
        self.assertIn("## Stopping Rules", report)
        self.assertIn("tripped a declared stopping rule", report)
        self.assertIn("**burner**", report)
        self.assertIn("cumulative_agent_spend_usd=200", report)
        self.assertIn("stopping-decisions.yaml", report)

    def test_report_states_plainly_when_nothing_has_fired(self):
        write_venture(self.root, "prosaic", PROSE)
        report = PortfolioRouter(self.root).generate_report_markdown(300.0)
        self.assertIn("No venture has tripped a declared stopping rule", report)
        self.assertIn("no criterion this engine can measure", report)

    # --- the shared ledger fold -------------------------------------------

    def test_cumulative_spend_sums_across_months(self):
        write_venture(self.root, "burner", PROSE)
        write_ledger(self.root, "  - venture: burner\n    agent_spend_usd: 10.0\n", "2026-06")
        write_ledger(self.root, "  - venture: burner\n    agent_spend_usd: 32.5\n", "2026-07")
        self.assertEqual(PortfolioRouter(self.root).load_cumulative_spend()["burner"], 42.5)

    def test_one_unparseable_entry_does_not_zero_the_rest_of_the_month(self):
        """The explore-grant decay and the stopping rules read the same fold.

        A single bad `agent_spend_usd` used to abort the whole file, so one typo
        silently restored full explore credit to every venture recorded in that
        month — and would now also make their criteria unevaluable.
        """
        write_venture(self.root, "burner", PROSE)
        write_ledger(
            self.root,
            "  - venture: burner\n    agent_spend_usd: 40.0\n"
            "  - venture: broken\n    agent_spend_usd: not-a-number\n",
        )
        spend = PortfolioRouter(self.root).load_cumulative_spend()
        self.assertEqual(spend["burner"], 40.0)
        self.assertEqual(spend["broken"], 0.0)

    def test_absent_ledger_directory_is_survivable(self):
        write_venture(self.root, "burner", STRUCTURED)
        self.assertEqual(PortfolioRouter(self.root).load_cumulative_spend(), {})
        self.assertEqual(self.allocations()["burner"].stopping_rule, STOP_NONE)


if __name__ == "__main__":
    unittest.main()
