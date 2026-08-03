#!/usr/bin/env python3
"""
Unit tests for Portfolio Router module.
"""

import os
import unittest
try:
    from portfolio.router.router import (
        find_repo_root, load_ventures, load_ledger, route_portfolio, calculate_score,
        economics_score, PortfolioRouter,
        EXPLORE_CREDIT, MEASURED_ZERO_CREDIT, EXPLORE_GRANT_USD, PROTECTED_FLOOR_USD,
    )
except ImportError:
    from router import (
        find_repo_root, load_ventures, load_ledger, route_portfolio, calculate_score,
        economics_score, PortfolioRouter,
        EXPLORE_CREDIT, MEASURED_ZERO_CREDIT, EXPLORE_GRANT_USD, PROTECTED_FLOOR_USD,
    )


class TestPortfolioRouter(unittest.TestCase):

    def setUp(self):
        self.repo_root = find_repo_root()

    def test_find_repo_root(self):
        self.assertTrue(os.path.exists(os.path.join(self.repo_root, "ventures")))

    def test_load_ventures(self):
        ventures = load_ventures(self.repo_root)
        self.assertGreaterEqual(len(ventures), 11)
        names = [v.get("name") for v in ventures]
        self.assertIn("ai-first-markets", names)
        self.assertIn("print-atelier", names)
        self.assertIn("quick-pick-survey", names)

    def test_load_ledger(self):
        ledger = load_ledger(self.repo_root)
        self.assertIn("quick-pick-survey", ledger)
        self.assertGreater(ledger["quick-pick-survey"]["total_agent_spend"], 0)

    def test_route_portfolio(self):
        result = route_portfolio(self.repo_root, total_monthly_budget=500.0)
        self.assertIn("portfolio_summary", result)
        self.assertIn("queue", result)
        self.assertEqual(result["portfolio_summary"]["total_ventures"], 11)
        self.assertGreater(result["portfolio_summary"]["allocated_monthly_budget_usd"], 0)
        
        # Verify queue order
        queue = result["queue"]
        for i in range(len(queue) - 1):
            self.assertGreaterEqual(queue[i]["score"], queue[i+1]["score"])


class TestExploreGrantDecay(unittest.TestCase):
    """The explore grant must not become a standing reward for not measuring.

    Regression: explore credit was a flat constant, so a venture that took real
    budget and honestly recorded `mrr_end: 0` scored permanently below one that
    had never been funded and never reported a number. Every venture in the
    ledger sat below every venture that was not.
    """

    def test_unfunded_venture_keeps_full_explore_credit(self):
        # A genuinely new venture must not be punished for being new.
        self.assertAlmostEqual(economics_score(None, 0.0), EXPLORE_CREDIT)

    def test_explore_credit_decays_as_grant_is_consumed(self):
        half = economics_score(None, EXPLORE_GRANT_USD / 2)
        self.assertLess(half, EXPLORE_CREDIT)
        self.assertGreater(half, MEASURED_ZERO_CREDIT)
        self.assertAlmostEqual(half, (EXPLORE_CREDIT + MEASURED_ZERO_CREDIT) / 2)

    def test_exhausted_grant_earns_no_more_than_measured_zero(self):
        # The core fix: once a venture has had its chance to measure and still
        # reports nothing, declining to measure buys it nothing over an honest
        # zero. Also verify the credit floors rather than going negative.
        self.assertAlmostEqual(
            economics_score(None, EXPLORE_GRANT_USD), MEASURED_ZERO_CREDIT
        )
        self.assertAlmostEqual(
            economics_score(None, EXPLORE_GRANT_USD * 100), MEASURED_ZERO_CREDIT
        )

    def test_measured_zero_is_unaffected_by_spend(self):
        # A venture that reports a number is scored on the number.
        for spend in (0.0, 25.0, 500.0):
            self.assertAlmostEqual(economics_score(0, spend), MEASURED_ZERO_CREDIT)

    def test_measured_revenue_still_outranks_any_explore_credit(self):
        self.assertGreater(economics_score(1.0, 0.0), EXPLORE_CREDIT)

    def test_honest_zero_beats_measurement_avoidance_at_equal_spend(self):
        """The incentive the old scoring inverted, stated directly."""
        funded = EXPLORE_GRANT_USD  # both ventures consumed the same budget
        reported_zero = calculate_score(
            {"stage": "prototype", "protected": True, "mrr": 0, "hypotheses": []},
            funded,
        )
        reported_nothing = calculate_score(
            {"stage": "prototype", "protected": True, "mrr": None, "hypotheses": []},
            funded,
        )
        self.assertGreaterEqual(reported_zero, reported_nothing)

    def test_calculate_score_defaults_to_full_grant_without_spend_data(self):
        # Backwards compatible: callers that pass no ledger spend are treated
        # as the unfunded case rather than silently penalised.
        venture = {"stage": "prototype", "protected": True, "mrr": None, "hypotheses": []}
        self.assertAlmostEqual(calculate_score(venture), calculate_score(venture, 0.0))


def _write_venture(root, name, monthly_cap=50.0, protected=True, stage="prototype", mrr=None):
    d = os.path.join(root, "ventures", name)
    os.makedirs(d, exist_ok=True)
    econ = "  mrr: null\n" if mrr is None else f"  mrr: {mrr}\n"
    with open(os.path.join(d, "VENTURE.yaml"), "w", encoding="utf-8") as f:
        f.write(
            f"name: {name}\n"
            f"description: fixture\n"
            f"stage: {stage}\n"
            f"owner: test\n"
            f"economics:\n  currency: USD\n{econ}"
            f"budget:\n  monthly_cap: {monthly_cap}\n  protected: {str(protected).lower()}\n"
        )


class TestBudgetCapIsACeiling(unittest.TestCase):
    """The portfolio budget cap must actually cap.

    Regression: the protected floor was `max(20.0, remaining * 0.15)`, which
    ignored `remaining`, so it kept paying out after the budget was spent and
    the running total clamped at zero without stopping the loop. With the
    repository's 11 protected ventures the router allocated $200 against a cap
    of $100, of $10, and of $0 alike. The figure printed at the top of
    ALLOCATION_REPORT.md as "Total Portfolio Budget Cap" bounded nothing; it
    only looked right at $300 because 11 ventures happened to want less.
    """

    def setUp(self):
        self.repo_root = find_repo_root()

    def test_real_portfolio_never_exceeds_its_cap(self):
        # Each of these overspent before the fix; $200 is only $100 below the
        # cap the repository actually declares today.
        for budget in (300.0, 250.0, 200.0, 100.0, 50.0, 10.0, 1.0):
            with self.subTest(budget=budget):
                summary = route_portfolio(self.repo_root, total_monthly_budget=budget)[
                    "portfolio_summary"
                ]
                self.assertLessEqual(
                    summary["allocated_monthly_budget_usd"],
                    budget,
                    f"router allocated more than the ${budget:.2f} cap",
                )

    def test_zero_budget_allocates_nothing(self):
        summary = route_portfolio(self.repo_root, total_monthly_budget=0.0)[
            "portfolio_summary"
        ]
        self.assertEqual(summary["allocated_monthly_budget_usd"], 0.0)

    def test_negative_budget_allocates_nothing(self):
        summary = route_portfolio(self.repo_root, total_monthly_budget=-100.0)[
            "portfolio_summary"
        ]
        self.assertEqual(summary["allocated_monthly_budget_usd"], 0.0)

    def test_many_protected_ventures_cannot_breach_the_cap(self):
        # The floor is per venture, so the failure scales with portfolio size:
        # 30 protected ventures claimed 30 * $20 = $600 regardless of the cap.
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            for i in range(30):
                _write_venture(tmp, f"v{i:02d}", monthly_cap=50.0, protected=True)
            from pathlib import Path

            summary = route_portfolio(Path(tmp), total_monthly_budget=100.0)[
                "portfolio_summary"
            ]
            self.assertLessEqual(summary["allocated_monthly_budget_usd"], 100.0)

    def test_shortfall_falls_on_the_lowest_scoring_ventures(self):
        # Ranking has to mean something when money is scarce: funding must be a
        # prefix of the ranked queue, never a venture funded below an unfunded one.
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmp:
            for i in range(20):
                _write_venture(tmp, f"v{i:02d}", monthly_cap=50.0, protected=True)
            queue = route_portfolio(Path(tmp), total_monthly_budget=100.0)["queue"]

        seen_unfunded = False
        for item in queue:
            if not item["funded"]:
                seen_unfunded = True
                self.assertEqual(item["allocated_budget_usd"], 0.0)
            else:
                self.assertFalse(
                    seen_unfunded,
                    f"{item['venture']} funded below an unfunded higher-ranked venture",
                )

    def test_unfunded_ventures_are_named_rather_than_silently_zero(self):
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmp:
            for i in range(20):
                _write_venture(tmp, f"v{i:02d}", monthly_cap=50.0, protected=True)
            root = Path(tmp)
            summary = route_portfolio(root, total_monthly_budget=100.0)["portfolio_summary"]
            self.assertTrue(
                summary["unfunded_ventures"],
                "a 20-venture portfolio on a $100 cap must report unfunded ventures",
            )
            report = PortfolioRouter(root).generate_report_markdown(100.0)
            self.assertIn("Unfunded this period", report)
            self.assertIn("UNFUNDED THIS PERIOD", report)

    def test_report_is_identical_regardless_of_checkout_location(self):
        """The report is committed and CI regenerates it, so it must not encode
        an absolute path — otherwise the checked-in artifact and every runner's
        output differ on all 11 rows for no reason."""
        import shutil
        import tempfile
        from pathlib import Path

        root = find_repo_root()
        here = PortfolioRouter(Path(root)).generate_report_markdown(300.0)
        self.assertNotIn("file://", here)
        self.assertNotIn(str(root), here)

        with tempfile.TemporaryDirectory() as tmp:
            moved = Path(tmp) / "elsewhere"
            shutil.copytree(
                Path(root) / "ventures", moved / "ventures", symlinks=True,
                ignore=shutil.ignore_patterns("node_modules", ".next", ".git"),
            )
            shutil.copytree(Path(root) / "portfolio" / "ledger", moved / "portfolio" / "ledger")
            there = PortfolioRouter(moved).generate_report_markdown(300.0)

        self.assertEqual(here, there)

    def test_report_total_matches_the_allocations_it_lists(self):
        root = find_repo_root()
        report = PortfolioRouter(root).generate_report_markdown(300.0)
        queue = route_portfolio(root, total_monthly_budget=300.0)["queue"]
        expected = sum(item["allocated_budget_usd"] for item in queue)
        self.assertIn(f"`${expected:.2f} USD` of `$300.00 USD` cap", report)

    def test_protected_floor_still_holds_when_the_budget_can_afford_it(self):
        # The fix must not quietly repeal principle 1. These numbers are chosen
        # so the floor is what binds: at a $100 budget the proportional share
        # (15% of remaining) starts at $15 and falls, so without the floor every
        # venture lands under $20. With it, all three clear $20 and the total is
        # still $60 — comfortably inside the cap.
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmp:
            for i in range(3):
                _write_venture(tmp, f"v{i:02d}", monthly_cap=50.0, protected=True)
            result = route_portfolio(Path(tmp), total_monthly_budget=100.0)

        queue = result["queue"]
        self.assertEqual(len(queue), 3)
        for item in queue:
            self.assertGreaterEqual(item["allocated_budget_usd"], PROTECTED_FLOOR_USD)
            self.assertTrue(item["funded"])
        self.assertLessEqual(
            result["portfolio_summary"]["allocated_monthly_budget_usd"], 100.0
        )

    def test_unprotected_venture_gets_no_floor(self):
        # The floor is the protection, so it must not leak to unprotected
        # ventures — otherwise `protected: false` means nothing.
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmp:
            _write_venture(tmp, "unprotected", monthly_cap=50.0, protected=False)
            queue = route_portfolio(Path(tmp), total_monthly_budget=100.0)["queue"]

        self.assertLess(queue[0]["allocated_budget_usd"], PROTECTED_FLOOR_USD)

    def test_a_venture_is_never_paid_more_than_its_own_cap(self):
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmp:
            _write_venture(tmp, "small", monthly_cap=5.0, protected=True)
            _write_venture(tmp, "large", monthly_cap=500.0, protected=True)
            queue = route_portfolio(Path(tmp), total_monthly_budget=1000.0)["queue"]

        by_name = {item["venture"]: item for item in queue}
        self.assertLessEqual(by_name["small"]["allocated_budget_usd"], 5.0)
        self.assertLessEqual(by_name["large"]["allocated_budget_usd"], 500.0)


class TestCumulativeSpend(unittest.TestCase):

    def test_cumulative_spend_matches_ledger_totals(self):
        root = find_repo_root()
        spend = PortfolioRouter(root).load_cumulative_spend()
        ledger = load_ledger(root)
        self.assertTrue(spend, "Expected recorded ledger spend for at least one venture.")
        for name, totals in ledger.items():
            self.assertAlmostEqual(spend.get(name, 0.0), totals["total_agent_spend"])


if __name__ == "__main__":
    unittest.main()
