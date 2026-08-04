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
    NOT_MEASURABLE,
    NOT_TRIGGERED,
    TRIGGERED,
    evaluate_venture,
    has_stopping_rule,
)

TODAY = date(2026, 8, 3)


def _venture(criteria) -> dict:
    return {"name": "v1", "kill_criteria": criteria}


ROWS_ZERO_REVENUE = {"v1": [{"venture": "v1", "period": "2026-07", "agent_spend_usd": 200.0, "mrr_end": 0.0}]}
ROWS_UNRECORDED_REVENUE = {"v1": [{"venture": "v1", "period": "2026-07", "agent_spend_usd": 200.0}]}
ROWS_EARNING = {"v1": [{"venture": "v1", "period": "2026-07", "agent_spend_usd": 200.0, "mrr_end": 40.0}]}

SPEND_WITHOUT_REVENUE = [
    {
        "id": "spend-without-revenue",
        "description": "spend accumulated with no revenue recorded",
        "when": [
            {"metric": "cumulative_agent_spend_usd", "op": ">=", "value": 150},
            {"metric": "cumulative_revenue_usd", "op": "==", "value": 0},
        ],
    }
]


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


class TestPortedRevenueMetric(unittest.TestCase):
    """`cumulative_revenue_usd` was ported from the engine this replaced.

    The two implementations disagreed about what an unrecorded month means, and
    print-atelier's stop-loss — the portfolio's only working brake — is written
    against this metric, so the disagreement decided whether that brake fires on
    missing data.
    """

    def _verdict_of(self, rows, present=True):
        results = evaluate_venture(
            _venture(SPEND_WITHOUT_REVENUE), "v1", rows, present, today=TODAY
        )
        return results[0].outcome

    def test_measured_zero_revenue_triggers(self):
        self.assertEqual(self._verdict_of(ROWS_ZERO_REVENUE), TRIGGERED)

    def test_recorded_revenue_does_not_trigger(self):
        self.assertEqual(self._verdict_of(ROWS_EARNING), NOT_TRIGGERED)

    def test_unrecorded_revenue_is_not_measurable_rather_than_zero(self):
        # The replaced engine folded revenue into a float starting at 0.0 and
        # skipped months recording no `mrr_end`, so a venture nobody had ever
        # measured read as one with zero revenue and this criterion TRIGGERED —
        # stopping a venture for absence of data, not absence of revenue.
        self.assertEqual(self._verdict_of(ROWS_UNRECORDED_REVENUE), NOT_MEASURABLE)

    def test_no_ledger_at_all_is_not_measurable(self):
        self.assertEqual(self._verdict_of({}, present=False), NOT_MEASURABLE)


class TestHasStoppingRule(unittest.TestCase):
    """Ported alongside the metric; the ratchet counts ventures by this."""

    def _results(self, criteria):
        return evaluate_venture(_venture(criteria), "v1", ROWS_ZERO_REVENUE, True, today=TODAY)

    def test_one_measurable_criterion_is_enough(self):
        self.assertTrue(has_stopping_rule(self._results(SPEND_WITHOUT_REVENUE)))

    def test_prose_alone_is_no_stopping_rule(self):
        self.assertFalse(has_stopping_rule(self._results(["No paying customer after 90 days."])))

    def test_declaring_nothing_is_no_stopping_rule(self):
        self.assertFalse(has_stopping_rule(self._results([])))

    def test_a_malformed_rule_is_not_a_brake(self):
        broken = [{"id": "x", "description": "typo", "when": [{"metric": "vibes", "op": ">=", "value": 1}]}]
        self.assertFalse(has_stopping_rule(self._results(broken)))


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
