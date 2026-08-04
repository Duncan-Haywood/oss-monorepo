"""Tests for the kill-criteria evaluator and its register.

The defect these exist to prevent recurring: `allocate.py` read every venture's
declared `kill_criteria` into a variable and never used it, and the test named
`test_kill_criteria_evaluation` passed anyway because it only exercised the
`winding-down` stage flag. So the first thing asserted here is that a declared
criterion actually moves the allocation, and the second is that an unknown
measurement never reads as a healthy one.
"""

from __future__ import annotations

import datetime
import shutil
import tempfile
import unittest
from pathlib import Path

import yaml

from portfolio.router.allocate import PortfolioRouter
from portfolio.router.kill_criteria import (
    KNOWN_METRICS,
    MAX_REGISTER_EXPIRY_DAYS,
    NOT_MEASURABLE,
    NOT_TRIGGERED,
    REGISTER_PATH,
    TRIGGERED,
    CriterionResult,
    MetricResolver,
    audit_register,
    evaluate_venture,
    ledger_rows_by_venture,
    load_register,
)

TODAY = datetime.date(2026, 8, 3)


def _spend_condition(value: float, op: str = ">="):
    return {"metric": "cumulative_agent_spend_usd", "op": op, "value": value}


class KillCriteriaEvaluationTest(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        (self.root / "ventures").mkdir(parents=True)
        (self.root / "portfolio" / "ledger").mkdir(parents=True)

    def tearDown(self):
        shutil.rmtree(self.root)

    def write_venture(self, name, **overrides):
        manifest = {
            "name": name,
            "stage": "prototype",
            "economics": {"mrr": None, "monthly_cost": None, "customers": None},
            "budget": {"monthly_cap": 50, "protected": True},
            "kill_criteria": [],
        }
        manifest.update(overrides)
        vdir = self.root / "ventures" / name
        vdir.mkdir(parents=True, exist_ok=True)
        with open(vdir / "VENTURE.yaml", "w", encoding="utf-8") as handle:
            yaml.dump(manifest, handle)
        return manifest

    def write_ledger(self, period, entries):
        with open(self.root / "portfolio" / "ledger" / f"{period}.yaml", "w", encoding="utf-8") as handle:
            yaml.dump({"period": period, "entries": entries}, handle)

    def evaluate(self, manifest, name="v1"):
        rows, present = ledger_rows_by_venture(self.root)
        return evaluate_venture(manifest, name, rows, present, today=TODAY)

    # -- the defect itself --------------------------------------------------

    def test_declared_criterion_actually_fires(self):
        """The regression test for the dead `kill_rules` variable."""
        self.write_ledger("2026-07", [{"venture": "v1", "agent_spend_usd": 200.0, "mrr_end": 0}])
        manifest = self.write_venture(
            "v1",
            economics={"mrr": 0},
            kill_criteria=[
                {
                    "id": "burn-without-revenue",
                    "description": "$150 of spend with revenue measured at zero.",
                    "when": [_spend_condition(150), {"metric": "mrr", "op": "==", "value": 0}],
                }
            ],
        )
        results = self.evaluate(manifest)
        self.assertEqual([r.outcome for r in results], [TRIGGERED])

    def test_triggered_criterion_zeroes_the_allocation(self):
        """Firing has to move money, or it is decoration again."""
        self.write_ledger("2026-07", [{"venture": "v1", "agent_spend_usd": 200.0, "mrr_end": 0}])
        self.write_venture(
            "v1",
            economics={"mrr": 0},
            kill_criteria=[
                {
                    "id": "burn-without-revenue",
                    "when": [_spend_condition(150), {"metric": "mrr", "op": "==", "value": 0}],
                }
            ],
        )
        self.write_venture("v2", economics={"mrr": 0})

        allocation = PortfolioRouter(str(self.root)).calculate_allocation(total_budget_usd=500.0)
        queue = {item["venture"]: item for item in allocation["work_queue"]}

        self.assertEqual(allocation["killed_count"], 1)
        self.assertEqual(queue["v1"]["status"], "killed")
        self.assertEqual(queue["v1"]["allocated_usd"], 0.0)
        self.assertEqual(queue["v2"]["status"], "active")
        self.assertGreater(queue["v2"]["allocated_usd"], 0.0)

    def test_below_threshold_does_not_fire(self):
        self.write_ledger("2026-07", [{"venture": "v1", "agent_spend_usd": 20.0, "mrr_end": 0}])
        manifest = self.write_venture(
            "v1",
            economics={"mrr": 0},
            kill_criteria=[{"id": "burn", "when": [_spend_condition(150), {"metric": "mrr", "op": "==", "value": 0}]}],
        )
        self.assertEqual([r.outcome for r in self.evaluate(manifest)], [NOT_TRIGGERED])

    # -- unknown is never a pass -------------------------------------------

    def test_unknown_condition_is_not_measurable_not_a_pass(self):
        """The whole point of the third state."""
        self.write_ledger("2026-07", [{"venture": "v1", "agent_spend_usd": 200.0, "mrr_end": 0}])
        manifest = self.write_venture(
            "v1",
            economics={"mrr": None},  # unmeasured
            kill_criteria=[{"id": "burn", "when": [_spend_condition(150), {"metric": "customers", "op": "<", "value": 5}]}],
        )
        result = self.evaluate(manifest)[0]
        self.assertEqual(result.outcome, NOT_MEASURABLE)
        self.assertIn("customers", result.reason)

    def test_a_definite_false_beats_an_unknown(self):
        """Kleene AND: one condition that cannot hold settles it, cheaply."""
        self.write_ledger("2026-07", [{"venture": "v1", "agent_spend_usd": 5.0, "mrr_end": 0}])
        manifest = self.write_venture(
            "v1",
            kill_criteria=[{"id": "burn", "when": [_spend_condition(150), {"metric": "customers", "op": "<", "value": 5}]}],
        )
        self.assertEqual(self.evaluate(manifest)[0].outcome, NOT_TRIGGERED)

    def test_absent_ledger_row_is_unknown_spend_not_zero_spend(self):
        """portfolio/ledger/README.md: reading an absent figure as 0.0 earns the
        maximum explore credit. A criterion must not inherit that bug."""
        self.write_ledger("2026-07", [{"venture": "other", "agent_spend_usd": 10.0, "mrr_end": 0}])
        manifest = self.write_venture(
            "v1",
            kill_criteria=[{"id": "cheap", "when": [_spend_condition(1, op="<")]}],
        )
        result = self.evaluate(manifest)[0]
        self.assertEqual(result.outcome, NOT_MEASURABLE)
        self.assertIn("no ledger row", result.reason)

    def test_row_with_absent_spend_is_unknown_not_zero(self):
        self.write_ledger("2026-07", [{"venture": "v1", "mrr_end": 0}])
        manifest = self.write_venture(
            "v1",
            kill_criteria=[{"id": "burn", "when": [_spend_condition(150)]}],
        )
        self.assertEqual(self.evaluate(manifest)[0].outcome, NOT_MEASURABLE)

    def test_mrr_falls_back_to_the_latest_ledger_figure(self):
        self.write_ledger("2026-06", [{"venture": "v1", "agent_spend_usd": 1.0, "mrr_end": 0}])
        self.write_ledger("2026-07", [{"venture": "v1", "agent_spend_usd": 1.0, "mrr_end": 900}])
        manifest = self.write_venture(
            "v1",
            economics={"mrr": None},
            kill_criteria=[{"id": "no-revenue", "when": [{"metric": "mrr", "op": "==", "value": 0}]}],
        )
        # The newest recorded figure is 900, so "mrr == 0" is definitely false.
        self.assertEqual(self.evaluate(manifest)[0].outcome, NOT_TRIGGERED)

    # -- consecutive-month window -------------------------------------------

    def test_consecutive_negative_months_counts_the_trailing_run(self):
        for period in ("2026-05", "2026-06", "2026-07"):
            self.write_ledger(period, [{"venture": "v1", "agent_spend_usd": 30.0, "mrr_end": 0}])
        manifest = self.write_venture(
            "v1",
            kill_criteria=[
                {"id": "three-down", "when": [{"metric": "consecutive_months_negative_net", "op": ">=", "value": 3}]}
            ],
        )
        self.assertEqual(self.evaluate(manifest)[0].outcome, TRIGGERED)

    def test_a_profitable_month_breaks_the_run(self):
        self.write_ledger("2026-05", [{"venture": "v1", "agent_spend_usd": 30.0, "mrr_end": 0}])
        self.write_ledger("2026-06", [{"venture": "v1", "agent_spend_usd": 10.0, "mrr_end": 500}])
        self.write_ledger("2026-07", [{"venture": "v1", "agent_spend_usd": 30.0, "mrr_end": 0}])
        manifest = self.write_venture(
            "v1",
            kill_criteria=[
                {"id": "three-down", "when": [{"metric": "consecutive_months_negative_net", "op": ">=", "value": 3}]}
            ],
        )
        self.assertEqual(self.evaluate(manifest)[0].outcome, NOT_TRIGGERED)

    def test_a_month_missing_revenue_makes_the_run_unknown(self):
        self.write_ledger("2026-06", [{"venture": "v1", "agent_spend_usd": 30.0}])
        self.write_ledger("2026-07", [{"venture": "v1", "agent_spend_usd": 30.0, "mrr_end": 0}])
        manifest = self.write_venture(
            "v1",
            kill_criteria=[
                {"id": "two-down", "when": [{"metric": "consecutive_months_negative_net", "op": ">=", "value": 2}]}
            ],
        )
        self.assertEqual(self.evaluate(manifest)[0].outcome, NOT_MEASURABLE)

    # -- anchors ------------------------------------------------------------

    def test_days_since_anchor_evaluates_when_the_date_is_recorded(self):
        manifest = self.write_venture(
            "v1",
            anchors={"launched": "2026-05-01"},
            kill_criteria=[{"id": "stale", "when": [{"metric": "days_since:launched", "op": ">=", "value": 60}]}],
        )
        self.assertEqual(self.evaluate(manifest)[0].outcome, TRIGGERED)

    def test_null_anchor_is_not_measurable(self):
        """Six of the eleven ventures' criteria hang off a clock nothing starts."""
        manifest = self.write_venture(
            "v1",
            anchors={"launched": None},
            kill_criteria=[{"id": "stale", "when": [{"metric": "days_since:launched", "op": ">=", "value": 60}]}],
        )
        result = self.evaluate(manifest)[0]
        self.assertEqual(result.outcome, NOT_MEASURABLE)
        self.assertIn("has not happened", result.reason)

    def test_missing_anchor_block_is_not_measurable(self):
        manifest = self.write_venture(
            "v1",
            kill_criteria=[{"id": "stale", "when": [{"metric": "days_since:launched", "op": ">=", "value": 60}]}],
        )
        self.assertEqual(self.evaluate(manifest)[0].outcome, NOT_MEASURABLE)

    # -- prose and malformed ------------------------------------------------

    def test_prose_criterion_is_not_measurable_and_not_malformed(self):
        manifest = self.write_venture("v1", kill_criteria=["Fewer than 50 learners after launch."])
        result = self.evaluate(manifest)[0]
        self.assertEqual(result.outcome, NOT_MEASURABLE)
        self.assertFalse(result.malformed)
        self.assertTrue(result.is_prose)

    def test_unknown_metric_is_malformed_not_parkable(self):
        manifest = self.write_venture(
            "v1",
            kill_criteria=[{"id": "typo", "when": [{"metric": "cumulative_spend", "op": ">=", "value": 1}]}],
        )
        result = self.evaluate(manifest)[0]
        self.assertEqual(result.outcome, NOT_MEASURABLE)
        self.assertTrue(result.malformed)

    def test_unknown_operator_is_malformed(self):
        manifest = self.write_venture(
            "v1",
            kill_criteria=[{"id": "bad-op", "when": [{"metric": "mrr", "op": "=<", "value": 1}]}],
        )
        self.assertTrue(self.evaluate(manifest)[0].malformed)

    def test_non_numeric_value_is_malformed(self):
        manifest = self.write_venture(
            "v1",
            kill_criteria=[{"id": "bad-value", "when": [{"metric": "mrr", "op": ">=", "value": "lots"}]}],
        )
        self.assertTrue(self.evaluate(manifest)[0].malformed)

    def test_structured_criterion_without_conditions_is_malformed(self):
        manifest = self.write_venture("v1", kill_criteria=[{"id": "empty", "description": "x"}])
        self.assertTrue(self.evaluate(manifest)[0].malformed)

    def test_malformed_condition_beats_a_definite_false(self):
        """A criterion containing a broken rule must not report 'not triggered'."""
        self.write_ledger("2026-07", [{"venture": "v1", "agent_spend_usd": 1.0, "mrr_end": 0}])
        manifest = self.write_venture(
            "v1",
            kill_criteria=[{"id": "mixed", "when": [_spend_condition(9999), {"metric": "nope", "op": ">=", "value": 1}]}],
        )
        result = self.evaluate(manifest)[0]
        self.assertEqual(result.outcome, NOT_MEASURABLE)
        self.assertTrue(result.malformed)


class RegisterAuditTest(unittest.TestCase):
    def prose_result(self, venture="v1", text="Some prose criterion."):
        return CriterionResult(
            venture=venture,
            criterion_id=f"{venture}[0]",
            text=text,
            outcome=NOT_MEASURABLE,
            reason="prose criterion: no machine-evaluable rule is declared",
        )

    def gap(self, venture="v1", criterion="Some prose criterion.", **overrides):
        entry = {
            "venture": venture,
            "criterion": criterion,
            "owner": "duncan",
            "issue": "docs/ENGINEERING-ROADMAP.md#x",
            "missing_signal": "nothing counts it",
            "expires": TODAY + datetime.timedelta(days=90),
        }
        entry.update(overrides)
        return entry

    def codes(self, findings):
        return sorted(f.code for f in findings)

    def test_a_registered_gap_passes(self):
        findings = audit_register(
            [self.prose_result()],
            {"unmeasurable_count": 1, "gaps": [self.gap()]},
            today=TODAY,
        )
        self.assertEqual(findings, [])

    def test_unregistered_criterion_fails(self):
        findings = audit_register([self.prose_result()], {"unmeasurable_count": 1, "gaps": []}, today=TODAY)
        self.assertIn("unregistered-unmeasurable-criterion", self.codes(findings))

    def test_count_above_reality_fails_as_stale(self):
        findings = audit_register(
            [self.prose_result()],
            {"unmeasurable_count": 5, "gaps": [self.gap()]},
            today=TODAY,
        )
        self.assertIn("count-drift", self.codes(findings))
        self.assertIn("shrank", " ".join(f.message for f in findings))

    def test_count_below_reality_fails_as_growth(self):
        findings = audit_register(
            [self.prose_result(), self.prose_result(text="Another.")],
            {"unmeasurable_count": 1, "gaps": [self.gap(), self.gap(criterion="Another.")]},
            today=TODAY,
        )
        self.assertIn("count-drift", self.codes(findings))
        self.assertIn("grew", " ".join(f.message for f in findings))

    def test_expired_gap_fails(self):
        findings = audit_register(
            [self.prose_result()],
            {"unmeasurable_count": 1, "gaps": [self.gap(expires=TODAY - datetime.timedelta(days=1))]},
            today=TODAY,
        )
        self.assertIn("expired-gap", self.codes(findings))

    def test_expiry_beyond_the_cap_fails(self):
        findings = audit_register(
            [self.prose_result()],
            {
                "unmeasurable_count": 1,
                "gaps": [self.gap(expires=TODAY + datetime.timedelta(days=MAX_REGISTER_EXPIRY_DAYS + 1))],
            },
            today=TODAY,
        )
        self.assertIn("overlong-expiry", self.codes(findings))

    def test_gap_missing_a_required_field_fails(self):
        for field_name in ("owner", "issue", "missing_signal", "expires"):
            with self.subTest(field=field_name):
                findings = audit_register(
                    [self.prose_result()],
                    {"unmeasurable_count": 1, "gaps": [self.gap(**{field_name: None})]},
                    today=TODAY,
                )
                self.assertIn("incomplete-gap", self.codes(findings))

    def test_stale_gap_for_a_criterion_that_now_evaluates_fails(self):
        findings = audit_register([], {"unmeasurable_count": 0, "gaps": [self.gap()]}, today=TODAY)
        self.assertIn("stale-gap", self.codes(findings))

    def test_duplicate_gap_fails(self):
        findings = audit_register(
            [self.prose_result()],
            {"unmeasurable_count": 1, "gaps": [self.gap(), self.gap()]},
            today=TODAY,
        )
        self.assertIn("duplicate-gap", self.codes(findings))

    def test_malformed_criterion_cannot_be_parked(self):
        broken = CriterionResult(
            venture="v1",
            criterion_id="v1[0]",
            text="broken",
            outcome=NOT_MEASURABLE,
            reason="unknown metric 'nope'",
            malformed=True,
        )
        findings = audit_register(
            [broken],
            {"unmeasurable_count": 1, "gaps": [self.gap(criterion="broken")]},
            today=TODAY,
        )
        codes = self.codes(findings)
        self.assertIn("malformed-criterion", codes)
        # It is excluded from the parkable set, so the register that tried to
        # park it is now both over-counted and holding a stale entry.
        self.assertIn("stale-gap", codes)

    def test_missing_register_with_gaps_fails(self):
        findings = audit_register([self.prose_result()], None, today=TODAY)
        self.assertIn("missing-kill-criteria-register", self.codes(findings))

    def test_missing_register_with_nothing_to_park_passes(self):
        self.assertEqual(audit_register([], None, today=TODAY), [])


class RepositoryRegisterTest(unittest.TestCase):
    """The register in this repository must describe this repository."""

    def setUp(self):
        self.root = Path(__file__).resolve().parents[2]

    def _evaluate_repository(self):
        rows, present = ledger_rows_by_venture(self.root)
        results = []
        declared = 0
        for path in sorted((self.root / "ventures").glob("*/VENTURE.yaml")):
            with open(path, "r", encoding="utf-8") as handle:
                data = yaml.safe_load(handle) or {}
            declared += len(data.get("kill_criteria") or [])
            results.extend(evaluate_venture(data, path.parent.name, rows, present))
        return declared, results

    def test_register_exists(self):
        self.assertTrue((self.root / REGISTER_PATH).is_file())

    def test_repository_register_is_consistent(self):
        _, results = self._evaluate_repository()
        findings = audit_register(results, load_register(self.root))
        self.assertEqual(
            [],
            findings,
            "\n".join(f"[{f.code}] {f.message}\n  → {f.remedy}" for f in findings),
        )

    def test_every_venture_criterion_is_accounted_for(self):
        """No criterion may be silently absent from both evaluation and register."""
        declared, results = self._evaluate_repository()
        self.assertEqual(declared, len(results))
        self.assertGreater(declared, 0)

    def test_known_metrics_are_all_resolvable(self):
        """A metric named in KNOWN_METRICS but unhandled by the resolver would
        silently become 'unknown' for every venture."""
        resolver = MetricResolver(venture={}, ledger_rows=[], ledger_present=False)
        for metric in KNOWN_METRICS:
            with self.subTest(metric=metric):
                _, note = resolver.resolve(metric)
                self.assertNotIn("unknown metric", note)


if __name__ == "__main__":
    unittest.main()
