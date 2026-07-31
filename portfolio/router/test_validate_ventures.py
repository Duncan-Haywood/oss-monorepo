#!/usr/bin/env python3
"""
Unit tests for the venture contract validator.

These use synthetic contracts rather than the live `ventures/` tree so the suite
does not turn red every time a real venture's economics legitimately change.
"""

import tempfile
import unittest
from pathlib import Path

try:
    from portfolio.router.validate_ventures import (
        Finding,
        find_repo_root,
        load_latest_ledger_mrr,
        validate_all,
        validate_venture,
    )
except ImportError:
    from validate_ventures import (
        Finding,
        find_repo_root,
        load_latest_ledger_mrr,
        validate_all,
        validate_venture,
    )


def codes(findings):
    return sorted(f.code for f in findings)


def base_contract(**overrides):
    contract = {
        "name": "demo",
        "stage": "prototype",
        "owner": "duncan",
        "hypotheses": [],
        "economics": {"currency": "USD", "mrr": None},
        "budget": {"monthly_cap": 50, "protected": False},
        "kill_criteria": ["No customers in 90 days."],
        "links": {"production": None},
    }
    contract.update(overrides)
    return contract


class TestValidateVenture(unittest.TestCase):
    def test_clean_contract_produces_no_findings(self):
        findings = validate_venture(base_contract(), "demo", {})
        self.assertEqual(findings, [])

    def test_unmeasured_mrr_contradicted_by_ledger_is_flagged(self):
        findings = validate_venture(base_contract(), "demo", {"demo": 0})
        self.assertIn("stale-unmeasured-mrr", codes(findings))

    def test_declared_mrr_matching_ledger_is_not_flagged(self):
        contract = base_contract(economics={"currency": "USD", "mrr": 0})
        findings = validate_venture(contract, "demo", {"demo": 0})
        self.assertNotIn("stale-unmeasured-mrr", codes(findings))

    def test_venture_absent_from_ledger_is_not_flagged_as_stale(self):
        findings = validate_venture(base_contract(), "demo", {"other": 100})
        self.assertNotIn("stale-unmeasured-mrr", codes(findings))

    def test_supported_hypothesis_without_revenue_is_flagged(self):
        contract = base_contract(
            hypotheses=[{"claim": "People will pay", "status": "supported", "checked": "2026-07-01"}]
        )
        findings = validate_venture(contract, "demo", {})
        self.assertIn("unearned-hypothesis-support", codes(findings))

    def test_supported_hypothesis_with_declared_revenue_is_accepted(self):
        contract = base_contract(
            economics={"currency": "USD", "mrr": 250},
            hypotheses=[{"claim": "People will pay", "status": "supported", "checked": "2026-07-01"}],
        )
        findings = validate_venture(contract, "demo", {})
        self.assertNotIn("unearned-hypothesis-support", codes(findings))

    def test_supported_hypothesis_with_ledger_revenue_is_accepted(self):
        contract = base_contract(
            hypotheses=[{"claim": "People will pay", "status": "supported", "checked": "2026-07-01"}]
        )
        findings = validate_venture(contract, "demo", {"demo": 400})
        self.assertNotIn("unearned-hypothesis-support", codes(findings))

    def test_supported_hypothesis_with_cited_evidence_is_accepted(self):
        """A technical claim can be settled by a benchmark rather than revenue."""
        contract = base_contract(
            hypotheses=[
                {
                    "claim": "Sandboxes cut provisioning latency by 40%",
                    "status": "supported",
                    "checked": "2026-07-01",
                    "evidence": "bench/provisioning.md — 12.1s to 7.0s median over 50 runs",
                }
            ]
        )
        findings = validate_venture(contract, "demo", {})
        self.assertNotIn("unearned-hypothesis-support", codes(findings))

    def test_blank_evidence_does_not_count_as_evidence(self):
        contract = base_contract(
            hypotheses=[
                {
                    "claim": "People will pay",
                    "status": "supported",
                    "checked": "2026-07-01",
                    "evidence": "   ",
                }
            ]
        )
        findings = validate_venture(contract, "demo", {})
        self.assertIn("unearned-hypothesis-support", codes(findings))

    def test_null_evidence_does_not_count_as_evidence(self):
        contract = base_contract(
            hypotheses=[
                {
                    "claim": "People will pay",
                    "status": "supported",
                    "checked": "2026-07-01",
                    "evidence": None,
                }
            ]
        )
        findings = validate_venture(contract, "demo", {})
        self.assertIn("unearned-hypothesis-support", codes(findings))

    def test_untested_hypothesis_needs_no_check_date(self):
        contract = base_contract(hypotheses=[{"claim": "Unknown", "status": "untested"}])
        findings = validate_venture(contract, "demo", {})
        self.assertEqual(findings, [])

    def test_evaluated_hypothesis_without_check_date_is_flagged(self):
        contract = base_contract(
            economics={"currency": "USD", "mrr": 100},
            hypotheses=[{"claim": "People will pay", "status": "supported"}],
        )
        findings = validate_venture(contract, "demo", {})
        self.assertIn("missing-hypothesis-check-date", codes(findings))

    def test_unrecognised_hypothesis_status_is_an_error(self):
        contract = base_contract(hypotheses=[{"claim": "x", "status": "probably"}])
        findings = validate_venture(contract, "demo", {})
        self.assertIn("invalid-hypothesis-status", codes(findings))
        self.assertEqual([f.severity for f in findings if f.code == "invalid-hypothesis-status"], ["error"])

    def test_refuted_hypothesis_is_a_valid_status(self):
        contract = base_contract(
            hypotheses=[{"claim": "x", "status": "refuted", "checked": "2026-07-01"}]
        )
        findings = validate_venture(contract, "demo", {})
        self.assertEqual(findings, [])

    def test_launched_without_production_link_is_flagged(self):
        contract = base_contract(stage="launched")
        findings = validate_venture(contract, "demo", {})
        self.assertIn("launched-without-production-link", codes(findings))

    def test_launched_with_production_link_is_accepted(self):
        contract = base_contract(stage="launched", links={"production": "https://example.com"})
        findings = validate_venture(contract, "demo", {})
        self.assertNotIn("launched-without-production-link", codes(findings))

    def test_prototype_without_production_link_is_not_flagged(self):
        findings = validate_venture(base_contract(stage="prototype"), "demo", {})
        self.assertNotIn("launched-without-production-link", codes(findings))

    def test_invalid_stage_is_an_error(self):
        findings = validate_venture(base_contract(stage="vibes"), "demo", {})
        self.assertIn("invalid-stage", codes(findings))

    def test_protected_venture_without_kill_criteria_is_an_error(self):
        contract = base_contract(
            budget={"monthly_cap": 50, "protected": True}, kill_criteria=[]
        )
        findings = validate_venture(contract, "demo", {})
        self.assertIn("protected-without-kill-criteria", codes(findings))
        self.assertEqual(
            [f.severity for f in findings if f.code == "protected-without-kill-criteria"],
            ["error"],
        )

    def test_missing_monthly_cap_is_an_error(self):
        contract = base_contract(budget={"protected": False})
        findings = validate_venture(contract, "demo", {})
        self.assertIn("missing-monthly-cap", codes(findings))


class TestLedgerLoading(unittest.TestCase):
    def test_later_period_overrides_earlier_mrr(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "ventures").mkdir()
            ledger = root / "portfolio" / "ledger"
            ledger.mkdir(parents=True)

            (ledger / "2026-06.yaml").write_text(
                "period: 2026-06\nentries:\n  - venture: demo\n    mrr_end: 0\n",
                encoding="utf-8",
            )
            (ledger / "2026-07.yaml").write_text(
                "period: 2026-07\nentries:\n  - venture: demo\n    mrr_end: 120\n",
                encoding="utf-8",
            )

            self.assertEqual(load_latest_ledger_mrr(root), {"demo": 120})

    def test_missing_ledger_directory_returns_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(load_latest_ledger_mrr(Path(tmp)), {})


class TestValidateAllAgainstRealTree(unittest.TestCase):
    """The live tree must stay parseable and free of hard errors."""

    def test_real_contracts_have_no_errors(self):
        findings = validate_all(find_repo_root())
        errors = [f for f in findings if f.severity == "error"]
        self.assertEqual(
            errors,
            [],
            msg="Venture contracts have blocking errors:\n"
            + "\n".join(f.format_line() for f in errors),
        )

    def test_every_finding_carries_a_remedy(self):
        for finding in validate_all(find_repo_root()):
            self.assertTrue(finding.remedy.strip(), msg=f"{finding.code} has no remedy")
            self.assertIn(finding.severity, {"error", "warn"})


if __name__ == "__main__":
    unittest.main()
