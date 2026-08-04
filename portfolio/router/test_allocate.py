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

    def create_venture(self, name, stage="prototype", mrr=None, cap=50, is_protected=True, kill_criteria=None, kill_criteria_overrides=None):
        vdir = self.ventures_dir / name
        vdir.mkdir(parents=True, exist_ok=True)
        manifest = {
            "name": name,
            "description": f"Test venture {name}",
            "stage": stage,
            "owner": "test",
            "economics": {"mrr": mrr, "monthly_cost": 10},
            "budget": {"monthly_cap": cap, "protected": is_protected},
            "kill_criteria": kill_criteria or [],
            "kill_criteria_overrides": kill_criteria_overrides or []
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

    def write_ledger(self, period, entries):
        with open(self.ledger_dir / f"{period}.yaml", "w", encoding="utf-8") as f:
            yaml.dump({"period": period, "entries": entries}, f)

    def test_kill_criteria_evaluation(self):
        self.create_venture("killed1", stage="winding-down")
        router = PortfolioRouter(self.test_dir)
        allocation = router.calculate_allocation(total_budget_usd=500.0)
        self.assertEqual(allocation["killed_count"], 1)
        killed_item = allocation["work_queue"][0]
        self.assertEqual(killed_item["status"], "killed")
        self.assertEqual(killed_item["allocated_usd"], 0.0)

    def test_a_declared_criterion_can_actually_kill_a_venture(self):
        """The regression this file did not have.

        `evaluate_kill_criteria` used to read `kill_criteria` into a local named
        `kill_rules` and never look at it, so the only rules that ran were two
        hardcoded stage checks. The test above passed throughout, because it
        exercises `stage: winding-down` rather than any declared criterion.
        """
        self.create_venture(
            "overspent",
            kill_criteria=[
                {
                    "description": "spend passed the cap with no revenue",
                    "when": [
                        {"metric": "cumulative_agent_spend_usd", "op": ">=", "value": 100},
                        {"metric": "cumulative_revenue_usd", "op": "==", "value": 0},
                    ],
                }
            ],
        )
        self.write_ledger(
            "2026-07", [{"venture": "overspent", "agent_spend_usd": 120.0, "mrr_end": 0}]
        )

        allocation = PortfolioRouter(self.test_dir).calculate_allocation(total_budget_usd=500.0)

        self.assertEqual(allocation["killed_count"], 1)
        row = allocation["work_queue"][0]
        self.assertEqual(row["status"], "killed")
        self.assertEqual(row["allocated_usd"], 0.0)
        self.assertTrue(any("spend passed the cap" in r for r in row["kill_reasons"]))

    def test_a_criterion_that_was_measured_and_did_not_hold_keeps_funding(self):
        self.create_venture(
            "within-budget",
            kill_criteria=[
                {
                    "id": "spend-cap",
                    "description": "spend passed 100",
                    "when": [{"metric": "cumulative_agent_spend_usd", "op": ">=", "value": 100}],
                }
            ],
        )
        self.write_ledger(
            "2026-07", [{"venture": "within-budget", "agent_spend_usd": 10.0, "mrr_end": 0}]
        )

        allocation = PortfolioRouter(self.test_dir).calculate_allocation(total_budget_usd=500.0)

        self.assertEqual(allocation["killed_count"], 0)
        row = allocation["work_queue"][0]
        self.assertEqual(row["status"], "active")
        self.assertTrue(row["has_stopping_rule"])
        self.assertEqual(allocation["without_stopping_rule"], [])

    def test_prose_criteria_leave_a_venture_with_no_stopping_rule(self):
        """Funded, active, and unstoppable must not look like funded and safe."""
        self.create_venture("prose", kill_criteria=["Fewer than 50 learners after 60 days."])
        self.write_ledger("2026-07", [{"venture": "prose", "agent_spend_usd": 10.0, "mrr_end": 0}])

        allocation = PortfolioRouter(self.test_dir).calculate_allocation(total_budget_usd=500.0)

        row = allocation["work_queue"][0]
        self.assertEqual(row["status"], "active")
        self.assertFalse(row["has_stopping_rule"])
        self.assertEqual(row["criteria_declared"], 1)
        self.assertEqual(row["criteria_evaluable"], 0)
        self.assertEqual(
            row["unevaluable_criteria"][0]["reason"],
            "prose criterion: no machine-evaluable rule is declared",
        )
        self.assertEqual(allocation["without_stopping_rule"], ["prose"])

    def test_the_report_totals_the_money_that_no_rule_can_stop(self):
        self.create_venture("prose1", cap=40, kill_criteria=["someday"])
        self.create_venture("prose2", cap=40, kill_criteria=["someday"])
        self.create_venture(
            "measured",
            cap=40,
            kill_criteria=[
                {
                    "id": "spend-cap",
                    "description": "spend passed 999",
                    "when": [{"metric": "cumulative_agent_spend_usd", "op": ">=", "value": 999}],
                }
            ],
        )
        self.write_ledger(
            "2026-07",
            [{"venture": name, "agent_spend_usd": 5.0, "mrr_end": 0} for name in
             ("prose1", "prose2", "measured")],
        )

        allocation = PortfolioRouter(self.test_dir).calculate_allocation(total_budget_usd=300.0)

        self.assertEqual(allocation["without_stopping_rule"], ["prose1", "prose2"])
        rows = {r["venture"]: r for r in allocation["work_queue"]}
        expected = rows["prose1"]["allocated_usd"] + rows["prose2"]["allocated_usd"]
        self.assertEqual(allocation["unfunded_by_stopping_rule_usd"], round(expected, 2))

    def test_a_venture_absent_from_the_ledger_cannot_be_measured(self):
        self.create_venture(
            "unledgered",
            kill_criteria=[
                {
                    "id": "spend-cap",
                    "description": "spend passed 1",
                    "when": [{"metric": "cumulative_agent_spend_usd", "op": ">=", "value": 1}],
                }
            ],
        )

        allocation = PortfolioRouter(self.test_dir).calculate_allocation(total_budget_usd=500.0)

        row = allocation["work_queue"][0]
        self.assertFalse(row["has_stopping_rule"])
        # Absent from the ledger is not spend of zero. The reason has to name
        # the metric it could not source, or a reader cannot tell which half of
        # the criterion went unmeasured.
        self.assertEqual(
            row["unevaluable_criteria"][0]["reason"],
            "cumulative_agent_spend_usd: no ledger row records spend for this venture",
        )

    def test_human_decision_required_when_venture_killed(self):
        self.create_venture(
            "killed-alert",
            kill_criteria=[
                {"metric": "cumulative_agent_spend_usd", "comparator": ">=", "threshold": 100}
            ],
        )
        self.write_ledger("2026-07", [{"venture": "killed-alert", "agent_spend_usd": 150.0, "mrr_end": 0}])

        allocation = PortfolioRouter(self.test_dir).calculate_allocation(total_budget_usd=500.0)

        self.assertEqual(allocation["killed_count"], 1)
        self.assertEqual(len(allocation["human_decisions_required"]), 1)
        req = allocation["human_decisions_required"][0]
        self.assertEqual(req["venture"], "killed-alert")
        self.assertIn("Transition stage to winding-down or register human override", req["action"])

        row = allocation["work_queue"][0]
        self.assertTrue(row["requires_human_decision"])
        self.assertTrue(row["action_blocked"])

    def test_human_override_prevents_kill_decision_when_valid(self):
        self.create_venture(
            "overridden",
            kill_criteria=[
                {
                    "description": "Spend passed threshold",
                    "metric": "cumulative_agent_spend_usd",
                    "comparator": ">=",
                    "threshold": 100,
                }
            ],
            kill_criteria_overrides=[
                {
                    "criterion": "Spend passed threshold",
                    "owner": "duncan",
                    "reason": "Pivot testing approved",
                    "expiry": "2099-12-31",
                }
            ],
        )
        self.write_ledger("2026-07", [{"venture": "overridden", "agent_spend_usd": 150.0, "mrr_end": 0}])

        allocation = PortfolioRouter(self.test_dir).calculate_allocation(total_budget_usd=500.0)

        self.assertEqual(allocation["killed_count"], 0)
        row = allocation["work_queue"][0]
        self.assertEqual(row["status"], "active")
        self.assertGreater(row["allocated_usd"], 0.0)

    def test_expired_human_override_is_ignored(self):
        self.create_venture(
            "expired-override",
            kill_criteria=[
                {
                    "description": "Spend passed threshold",
                    "metric": "cumulative_agent_spend_usd",
                    "comparator": ">=",
                    "threshold": 100,
                }
            ],
            kill_criteria_overrides=[
                {
                    "criterion": "Spend passed threshold",
                    "owner": "duncan",
                    "reason": "Temporary extension",
                    "expiry": "2020-01-01",
                }
            ],
        )
        self.write_ledger("2026-07", [{"venture": "expired-override", "agent_spend_usd": 150.0, "mrr_end": 0}])

        allocation = PortfolioRouter(self.test_dir).calculate_allocation(total_budget_usd=500.0)

        self.assertEqual(allocation["killed_count"], 1)
        row = allocation["work_queue"][0]
        self.assertEqual(row["status"], "killed")


if __name__ == "__main__":
    unittest.main()
