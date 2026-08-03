#!/usr/bin/env python3
"""Tests for the stopping-rule ratchet and the kill-criteria evaluator.

A gate that cannot fail is not a gate, so most of these assert the failing
direction: that a venture losing its last measurable criterion fails, that a
stale ceiling fails, that an expired baseline fails, and that reading no
ventures at all is reported as "not measurable" rather than as a clean zero.

The evaluator tests concentrate on the third verdict. `unevaluable` exists
because the original defect was invisible precisely when it mattered: a venture
with no stopping rule and a venture inside its stopping rule both looked
`active`. Several tests below exist only to pin that they can never look alike
again.

No test here is skipped or conditionally skipped, and none should be.
`scripts/ci/audit_exceptions.py` treats a skipped Python test as a suppression
needing a registered owner and expiry.
"""

import json
import subprocess
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[1]
CI_DIR = REPO_ROOT / "scripts" / "ci"
if str(CI_DIR) not in sys.path:
    sys.path.insert(0, str(CI_DIR))
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from kill_criteria_ratchet import (
    BASELINE_PATH,
    MAX_DECLARED_SLACK,
    MAX_DECLARED_WITHOUT_STOPPING_RULE,
    MAX_EXPIRY_DAYS,
    Measurement,
    RatchetError,
    audit,
    load_baseline,
    main,
    measure,
)
from portfolio.router.kill_criteria import (
    NOT_TRIGGERED,
    REASON_MALFORMED,
    REASON_METRIC_UNRECORDED,
    REASON_NO_LEDGER_HISTORY,
    REASON_PROSE_ONLY,
    REASON_UNKNOWN_METRIC,
    TRIGGERED,
    UNEVALUABLE,
    LedgerFacts,
    build_ledger_facts,
    evaluate_criterion,
    evaluate_venture,
    has_stopping_rule,
)

TODAY = date(2026, 8, 3)


def facts(**overrides) -> LedgerFacts:
    base = dict(
        venture="v1",
        has_history=True,
        months_recorded=1,
        cumulative_agent_spend_usd=18.18,
        cumulative_revenue_usd=0.0,
        latest_mrr_usd=0.0,
        consecutive_months_zero_mrr=1,
    )
    base.update(overrides)
    return LedgerFacts(**base)


def make_baseline(**overrides) -> dict:
    budget = {"max_without_stopping_rule": 10, "slack": 2}
    budget.update(overrides.pop("budget", {}))
    base = {
        "owner": "duncan",
        "issue": "docs/ENGINEERING-ROADMAP.md#portfolio-stopping-rules",
        "expires": "2026-11-30",
        "budget": budget,
        "rationale": "why",
        "_expiry_date": date(2026, 11, 30),
    }
    base.update(overrides)
    return base


def make_measurement(without: int, measured: int = 11) -> Measurement:
    return Measurement(
        ventures_measured=measured,
        without_stopping_rule=without,
        venture_names_without=[f"v{i}" for i in range(without)],
    )


class TestCriterionEvaluation(unittest.TestCase):
    def test_prose_is_unevaluable_not_a_pass(self):
        """The original defect: prose criteria silently read as 'do not kill'."""
        result = evaluate_criterion("Fewer than 50 learners after 60 days.", facts())
        self.assertEqual(result.verdict, UNEVALUABLE)
        self.assertEqual(result.reason, REASON_PROSE_ONLY)
        self.assertFalse(result.evaluable)

    def test_structured_criterion_triggers_when_the_condition_holds(self):
        result = evaluate_criterion(
            {
                "description": "spend passed the cap",
                "metric": "cumulative_agent_spend_usd",
                "comparator": ">=",
                "threshold": 10,
            },
            facts(cumulative_agent_spend_usd=18.18),
        )
        self.assertEqual(result.verdict, TRIGGERED)
        self.assertIn("cumulative_agent_spend_usd=18.18", result.detail)

    def test_structured_criterion_that_was_measured_and_did_not_hold(self):
        result = evaluate_criterion(
            {"metric": "cumulative_agent_spend_usd", "comparator": ">=", "threshold": 150},
            facts(cumulative_agent_spend_usd=18.18),
        )
        self.assertEqual(result.verdict, NOT_TRIGGERED)
        self.assertTrue(result.evaluable)

    def test_every_condition_must_hold_for_the_criterion_to_trigger(self):
        criterion = {
            "description": "spend with no revenue",
            "when": [
                {"metric": "cumulative_agent_spend_usd", "comparator": ">=", "threshold": 10},
                {"metric": "cumulative_revenue_usd", "comparator": "==", "threshold": 0},
            ],
        }
        self.assertEqual(evaluate_criterion(criterion, facts()).verdict, TRIGGERED)

        earning = facts(cumulative_revenue_usd=500.0)
        self.assertEqual(evaluate_criterion(criterion, earning).verdict, NOT_TRIGGERED)

    def test_an_unmeasurable_condition_makes_the_whole_criterion_unevaluable(self):
        """Two of three conditions holding is not a rule that declined to fire."""
        criterion = {
            "when": [
                {"metric": "cumulative_agent_spend_usd", "comparator": ">=", "threshold": 10},
                {"metric": "latest_mrr_usd", "comparator": "==", "threshold": 0},
            ]
        }
        result = evaluate_criterion(criterion, facts(latest_mrr_usd=None))
        self.assertEqual(result.verdict, UNEVALUABLE)
        self.assertEqual(result.reason, REASON_METRIC_UNRECORDED)

    def test_an_invented_metric_is_unevaluable_rather_than_a_pass(self):
        result = evaluate_criterion(
            {"metric": "vibes", "comparator": ">=", "threshold": 1}, facts()
        )
        self.assertEqual(result.verdict, UNEVALUABLE)
        self.assertEqual(result.reason, REASON_UNKNOWN_METRIC)

    def test_a_bad_comparator_is_unevaluable(self):
        result = evaluate_criterion(
            {"metric": "months_recorded", "comparator": "=~", "threshold": 1}, facts()
        )
        self.assertEqual(result.verdict, UNEVALUABLE)
        self.assertEqual(result.reason, REASON_MALFORMED)

    def test_a_non_numeric_threshold_is_unevaluable(self):
        result = evaluate_criterion(
            {"metric": "months_recorded", "comparator": ">=", "threshold": "soon"}, facts()
        )
        self.assertEqual(result.verdict, UNEVALUABLE)
        self.assertEqual(result.reason, REASON_MALFORMED)

    def test_an_empty_when_block_is_unevaluable_not_satisfied(self):
        """A criterion stating no conditions must not read as a rule that held."""
        result = evaluate_criterion({"description": "d", "when": []}, facts())
        self.assertEqual(result.verdict, UNEVALUABLE)
        self.assertEqual(result.reason, REASON_MALFORMED)

    def test_a_venture_absent_from_the_ledger_cannot_be_measured(self):
        result = evaluate_criterion(
            {"metric": "cumulative_agent_spend_usd", "comparator": ">=", "threshold": 1}, None
        )
        self.assertEqual(result.verdict, UNEVALUABLE)
        self.assertEqual(result.reason, REASON_NO_LEDGER_HISTORY)

    def test_has_stopping_rule_needs_one_measurable_criterion(self):
        prose_only = evaluate_venture({"kill_criteria": ["a", "b"]}, facts())
        self.assertFalse(has_stopping_rule(prose_only))

        mixed = evaluate_venture(
            {
                "kill_criteria": [
                    "a",
                    {"metric": "months_recorded", "comparator": ">=", "threshold": 99},
                ]
            },
            facts(),
        )
        self.assertTrue(has_stopping_rule(mixed))

    def test_a_venture_declaring_nothing_has_no_stopping_rule(self):
        self.assertFalse(has_stopping_rule(evaluate_venture({}, facts())))


class TestLedgerFacts(unittest.TestCase):
    def test_spend_and_revenue_accumulate_across_months(self):
        built = build_ledger_facts(
            [
                {"period": "2026-07", "entries": [{"venture": "a", "agent_spend_usd": 10, "mrr_end": 0}]},
                {"period": "2026-08", "entries": [{"venture": "a", "agent_spend_usd": 5.5, "mrr_end": 20}]},
            ]
        )
        self.assertEqual(built["a"].cumulative_agent_spend_usd, 15.5)
        self.assertEqual(built["a"].cumulative_revenue_usd, 20)
        self.assertEqual(built["a"].months_recorded, 2)
        self.assertEqual(built["a"].latest_mrr_usd, 20)

    def test_consecutive_zero_mrr_counts_back_from_the_newest_month(self):
        built = build_ledger_facts(
            [
                {"period": "2026-06", "entries": [{"venture": "a", "mrr_end": 0}]},
                {"period": "2026-07", "entries": [{"venture": "a", "mrr_end": 40}]},
                {"period": "2026-08", "entries": [{"venture": "a", "mrr_end": 0}]},
            ]
        )
        self.assertEqual(built["a"].consecutive_months_zero_mrr, 1)

    def test_months_are_ordered_by_period_not_by_file_order(self):
        built = build_ledger_facts(
            [
                {"period": "2026-08", "entries": [{"venture": "a", "mrr_end": 30}]},
                {"period": "2026-07", "entries": [{"venture": "a", "mrr_end": 0}]},
            ]
        )
        self.assertEqual(built["a"].latest_mrr_usd, 30)
        self.assertEqual(built["a"].consecutive_months_zero_mrr, 0)

    def test_an_unrecorded_mrr_breaks_the_zero_run_rather_than_extending_it(self):
        built = build_ledger_facts(
            [
                {"period": "2026-07", "entries": [{"venture": "a", "mrr_end": 0}]},
                {"period": "2026-08", "entries": [{"venture": "a"}]},
            ]
        )
        self.assertEqual(built["a"].consecutive_months_zero_mrr, 0)

    def test_a_venture_in_no_ledger_month_has_no_history(self):
        self.assertEqual(build_ledger_facts([]), {})


class TestBaselineLoading(unittest.TestCase):
    def _write(self, payload) -> Path:
        root = Path(tempfile.mkdtemp())
        (root / "platform").mkdir(parents=True)
        (root / BASELINE_PATH).write_text(yaml.dump(payload), encoding="utf-8")
        return root

    def test_a_missing_baseline_is_an_error_not_a_pass(self):
        with self.assertRaises(RatchetError) as ctx:
            load_baseline(Path(tempfile.mkdtemp()))
        self.assertIn("missing", str(ctx.exception))

    def test_a_missing_required_field_fails(self):
        payload = {k: v for k, v in make_baseline().items() if not k.startswith("_")}
        del payload["rationale"]
        with self.assertRaises(RatchetError) as ctx:
            load_baseline(self._write(payload))
        self.assertIn("rationale", str(ctx.exception))

    def test_the_declared_ceiling_cannot_exceed_the_hard_cap(self):
        """Otherwise the ceiling can be widened to cover the whole portfolio."""
        payload = {k: v for k, v in make_baseline().items() if not k.startswith("_")}
        payload["budget"]["max_without_stopping_rule"] = MAX_DECLARED_WITHOUT_STOPPING_RULE + 1
        with self.assertRaises(RatchetError) as ctx:
            load_baseline(self._write(payload))
        self.assertIn("cap", str(ctx.exception))

    def test_slack_cannot_exceed_its_cap(self):
        payload = {k: v for k, v in make_baseline().items() if not k.startswith("_")}
        payload["budget"]["slack"] = MAX_DECLARED_SLACK + 1
        with self.assertRaises(RatchetError):
            load_baseline(self._write(payload))

    def test_a_negative_ceiling_is_rejected(self):
        payload = {k: v for k, v in make_baseline().items() if not k.startswith("_")}
        payload["budget"]["max_without_stopping_rule"] = -1
        with self.assertRaises(RatchetError):
            load_baseline(self._write(payload))

    def test_an_unparseable_expiry_is_rejected(self):
        payload = {k: v for k, v in make_baseline().items() if not k.startswith("_")}
        payload["expires"] = "whenever"
        with self.assertRaises(RatchetError) as ctx:
            load_baseline(self._write(payload))
        self.assertIn("YYYY-MM-DD", str(ctx.exception))


class TestAudit(unittest.TestCase):
    def test_a_venture_losing_its_last_stopping_rule_fails(self):
        findings = audit(make_measurement(without=11), make_baseline(), TODAY)
        self.assertIn("stopping-rules-lost", [f.check for f in findings])

    def test_sitting_at_the_declared_ceiling_passes(self):
        self.assertEqual(audit(make_measurement(without=10), make_baseline(), TODAY), [])

    def test_a_ceiling_left_stale_after_progress_fails(self):
        findings = audit(make_measurement(without=3), make_baseline(), TODAY)
        checks = [f.check for f in findings]
        self.assertIn("baseline-stale", checks)

    def test_progress_within_slack_does_not_fail(self):
        self.assertEqual(audit(make_measurement(without=8), make_baseline(), TODAY), [])

    def test_an_expired_baseline_fails(self):
        baseline = make_baseline(expires="2026-01-01", _expiry_date=date(2026, 1, 1))
        findings = audit(make_measurement(without=10), baseline, TODAY)
        self.assertIn("baseline-expired", [f.check for f in findings])

    def test_an_expiry_beyond_the_horizon_fails(self):
        far = TODAY + timedelta(days=MAX_EXPIRY_DAYS + 10)
        baseline = make_baseline(expires=far.isoformat(), _expiry_date=far)
        findings = audit(make_measurement(without=10), baseline, TODAY)
        self.assertIn("baseline-horizon-too-far", [f.check for f in findings])

    def test_reading_no_ventures_is_not_measurable_rather_than_zero(self):
        """A measurement of zero here would otherwise read as total success."""
        findings = audit(make_measurement(without=0, measured=0), make_baseline(), TODAY)
        self.assertEqual([f.check for f in findings], ["not-measurable"])

    def test_every_finding_explains_itself(self):
        findings = audit(make_measurement(without=11), make_baseline(), TODAY)
        for finding in findings:
            self.assertTrue(finding.message.strip())
            self.assertIn(finding.check, finding.format_line())


class TestAgainstTheRealRepository(unittest.TestCase):
    def test_the_repository_matches_its_declared_baseline(self):
        baseline = load_baseline(REPO_ROOT)
        measurement = measure(REPO_ROOT)
        findings = audit(measurement, baseline, date.today())
        self.assertEqual(
            findings,
            [],
            "kill-criteria ratchet failed: "
            + "; ".join(f.format_line() for f in findings),
        )

    def test_every_venture_is_measured(self):
        measurement = measure(REPO_ROOT)
        manifests = list((REPO_ROOT / "ventures").glob("*/VENTURE.yaml"))
        self.assertEqual(measurement.ventures_measured, len(manifests))
        self.assertGreater(measurement.ventures_measured, 0)

    def test_at_least_one_venture_has_a_measurable_stopping_rule(self):
        """The mechanism has to fire against the real tree, not only fixtures."""
        measurement = measure(REPO_ROOT)
        with_rule = [v for v in measurement.verdicts if v.has_stopping_rule]
        self.assertTrue(
            with_rule,
            "no venture has an evaluable kill criterion, so the evaluator is "
            "wired to nothing in the real repository.",
        )

    def test_the_script_reports_a_machine_readable_status(self):
        result = subprocess.run(
            [sys.executable, str(CI_DIR / "kill_criteria_ratchet.py"), "--json"],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "pass")
        self.assertTrue(payload["ok"])

    def test_report_mode_never_fails_the_build(self):
        result = subprocess.run(
            [sys.executable, str(CI_DIR / "kill_criteria_ratchet.py"), "--report"],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_the_audit_exits_nonzero_when_a_stopping_rule_is_lost(self):
        """End to end, against a tree built to fail."""
        root = Path(tempfile.mkdtemp())
        (root / "platform").mkdir(parents=True)
        (root / "portfolio" / "ledger").mkdir(parents=True)
        baseline = {k: v for k, v in make_baseline().items() if not k.startswith("_")}
        baseline["budget"] = {"max_without_stopping_rule": 0, "slack": 0}
        (root / BASELINE_PATH).write_text(yaml.dump(baseline), encoding="utf-8")

        vdir = root / "ventures" / "prose-only"
        vdir.mkdir(parents=True)
        (vdir / "VENTURE.yaml").write_text(
            yaml.dump({"name": "prose-only", "stage": "prototype", "kill_criteria": ["someday"]}),
            encoding="utf-8",
        )

        exit_code = main(["--repo-root", str(root)])
        self.assertEqual(exit_code, 1)


if __name__ == "__main__":
    unittest.main()
