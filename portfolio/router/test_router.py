#!/usr/bin/env python3
"""
Unit tests for Portfolio Router module.
"""

import os
import unittest
try:
    from portfolio.router.router import find_repo_root, load_ventures, load_ledger, route_portfolio, calculate_score
except ImportError:
    from router import find_repo_root, load_ventures, load_ledger, route_portfolio, calculate_score


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


if __name__ == "__main__":
    unittest.main()
