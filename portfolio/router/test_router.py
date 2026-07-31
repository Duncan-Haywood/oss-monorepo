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
        EXPLORE_CREDIT, MEASURED_ZERO_CREDIT, EXPLORE_GRANT_USD,
    )
except ImportError:
    from router import (
        find_repo_root, load_ventures, load_ledger, route_portfolio, calculate_score,
        economics_score, PortfolioRouter,
        EXPLORE_CREDIT, MEASURED_ZERO_CREDIT, EXPLORE_GRANT_USD,
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
