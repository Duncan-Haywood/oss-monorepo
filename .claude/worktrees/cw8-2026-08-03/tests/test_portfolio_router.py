"""
Unit tests for Portfolio Router logic.
"""

import sys
from pathlib import Path
import unittest
import tempfile

# Ensure repo root is on sys.path without shadowing stdlib modules
REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from portfolio.router.router import (
    PortfolioRouter,
    VentureContract,
    STAGE_WEIGHTS,
    load_ventures,
    load_ledger,
    calculate_score,
    route_portfolio,
    find_repo_root,
)


class TestPortfolioRouter(unittest.TestCase):

    def test_venture_contract_parsing(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            venture_dir = tmp_path / "ventures" / "test-venture"
            venture_dir.mkdir(parents=True)
            yaml_file = venture_dir / "VENTURE.yaml"
            yaml_file.write_text("""
name: test-venture
description: A test venture contract.
stage: launched
owner: tester
hypotheses:
  - claim: Test hypothesis claim.
    status: supported
economics:
  currency: USD
  mrr: 150.0
budget:
  monthly_cap: 80
  protected: true
kill_criteria:
  - Zero adoption.
links:
  production: null
""", encoding="utf-8")

            contract = VentureContract.from_yaml(yaml_file)
            self.assertEqual(contract.name, "test-venture")
            self.assertEqual(contract.stage, "launched")
            self.assertEqual(contract.owner, "tester")
            self.assertEqual(contract.economics.mrr, 150.0)
            self.assertEqual(contract.budget.monthly_cap, 80.0)
            self.assertTrue(contract.budget.protected)
            self.assertEqual(len(contract.hypotheses), 1)
            self.assertEqual(contract.hypotheses[0].status, "supported")

    def test_portfolio_router_allocation(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            repo_root = Path(tmp_dir)
            ventures_dir = repo_root / "ventures"
            ledger_dir = repo_root / "portfolio" / "ledger"
            ventures_dir.mkdir(parents=True)
            ledger_dir.mkdir(parents=True)

            v1_dir = ventures_dir / "v1"
            v1_dir.mkdir()
            (v1_dir / "VENTURE.yaml").write_text("""
name: v1
description: Revenue generating venture.
stage: launched
owner: dev
hypotheses: []
economics:
  mrr: 500.0
budget:
  monthly_cap: 100
  protected: true
kill_criteria: []
links: {}
""", encoding="utf-8")

            v2_dir = ventures_dir / "v2"
            v2_dir.mkdir()
            (v2_dir / "VENTURE.yaml").write_text("""
name: v2
description: Prototype venture.
stage: prototype
owner: dev
hypotheses: []
economics:
  mrr: null
budget:
  monthly_cap: 40
  protected: false
kill_criteria: []
links: {}
""", encoding="utf-8")

            router = PortfolioRouter(repo_root)
            allocations = router.compute_allocation(total_budget_usd=200.0)

            self.assertEqual(len(allocations), 2)
            self.assertEqual(allocations[0].venture_name, "v1")
            self.assertGreater(allocations[0].allocated_spend, allocations[1].allocated_spend)
            self.assertIn("Protected explore budget", allocations[0].rationale)

    def test_helper_functions(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            repo_root = Path(tmp_dir)
            ventures_dir = repo_root / "ventures"
            ledger_dir = repo_root / "portfolio" / "ledger"
            ventures_dir.mkdir(parents=True)
            ledger_dir.mkdir(parents=True)

            v1_dir = ventures_dir / "v1"
            v1_dir.mkdir()
            (v1_dir / "VENTURE.yaml").write_text("""
name: v1
stage: launched
budget:
  monthly_cap: 100
  protected: true
economics:
  mrr: 200.0
hypotheses:
  - claim: claim1
    status: supported
""", encoding="utf-8")

            (ledger_dir / "2026-07.yaml").write_text("""
period: 2026-07
entries:
  - venture: v1
    agent_spend_usd: 45.0
""", encoding="utf-8")

            ventures = load_ventures(repo_root)
            self.assertEqual(len(ventures), 1)
            self.assertEqual(ventures[0]["name"], "v1")

            ledger_data = load_ledger(repo_root)
            self.assertIn("v1", ledger_data)
            self.assertEqual(ledger_data["v1"]["total_agent_spend"], 45.0)

            score = calculate_score(ventures[0])
            self.assertGreater(score, 0.0)

            routed = route_portfolio(repo_root, 300.0)
            self.assertEqual(routed["portfolio_summary"]["total_ventures"], 1)
            self.assertEqual(len(routed["queue"]), 1)


if __name__ == "__main__":
    unittest.main()
