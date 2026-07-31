import unittest
import os
import tempfile
import shutil
import yaml
from pathlib import Path
from portfolio.router.allocate import PortfolioRouter


class TestPortfolioRouter(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.ventures_dir = Path(self.test_dir) / "ventures"
        self.ledger_dir = Path(self.test_dir) / "portfolio" / "ledger"
        self.ventures_dir.mkdir(parents=True, exist_ok=True)
        self.ledger_dir.mkdir(parents=True, exist_ok=True)

    def tearDown(self):
        shutil.rmtree(self.test_dir)

    def create_venture(self, name, stage="prototype", mrr=None, cap=50, is_protected=True, kill_criteria=None):
        vdir = self.ventures_dir / name
        vdir.mkdir(parents=True, exist_ok=True)
        manifest = {
            "name": name,
            "description": f"Test venture {name}",
            "stage": stage,
            "owner": "test",
            "economics": {"mrr": mrr, "monthly_cost": 10},
            "budget": {"monthly_cap": cap, "protected": is_protected},
            "kill_criteria": kill_criteria or []
        }
        with open(vdir / "VENTURE.yaml", "w", encoding="utf-8") as f:
            yaml.dump(manifest, f)

    def test_load_ventures(self):
        self.create_venture("v1", stage="launched")
        self.create_venture("v2", stage="revenue", mrr=100)
        router = PortfolioRouter(self.test_dir)
        ventures = router.load_ventures()
        self.assertEqual(len(ventures), 2)

    def test_protected_explore_budget_split(self):
        self.create_venture("mature1", stage="revenue", mrr=500, cap=100)
        self.create_venture("explore1", stage="prototype", cap=50)
        self.create_venture("explore2", stage="launched", cap=50)

        router = PortfolioRouter(self.test_dir)
        allocation = router.calculate_allocation(total_budget_usd=1000.0)

        self.assertEqual(allocation["total_budget_usd"], 1000.0)
        self.assertEqual(allocation["mature_pool_usd"], 600.0)
        self.assertEqual(allocation["explore_pool_usd"], 400.0)
        self.assertEqual(allocation["active_count"], 3)

        wq = {item["venture"]: item for item in allocation["work_queue"]}
        self.assertEqual(wq["mature1"]["pool"], "mature_60%")
        self.assertEqual(wq["mature1"]["allocated_usd"], 100.0)  # Capped at 100
        self.assertEqual(wq["explore1"]["pool"], "protected_explore_40%")
        self.assertEqual(wq["explore1"]["allocated_usd"], 50.0)

    def test_kill_criteria_evaluation(self):
        self.create_venture("killed1", stage="winding-down")
        router = PortfolioRouter(self.test_dir)
        allocation = router.calculate_allocation(total_budget_usd=500.0)
        self.assertEqual(allocation["killed_count"], 1)
        killed_item = allocation["work_queue"][0]
        self.assertEqual(killed_item["status"], "killed")
        self.assertEqual(killed_item["allocated_usd"], 0.0)


if __name__ == "__main__":
    unittest.main()
