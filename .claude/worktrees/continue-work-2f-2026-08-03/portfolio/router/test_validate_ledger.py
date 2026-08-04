#!/usr/bin/env python3
"""
Unit tests for the portfolio ledger validator.

These build synthetic ledger months in a temporary tree rather than asserting
against `portfolio/ledger/`, so a legitimately recorded month does not turn the
suite red. One test does read the live ledger, and it asserts only that the
structural checks hold — never the advisory ones, which carry inherited debt.
"""

import tempfile
import unittest
from datetime import date
from pathlib import Path

try:
    from portfolio.router.validate_ledger import (
        check_freshness,
        check_uniform_spend,
        find_repo_root,
        months_between,
        validate_all,
        validate_period,
    )
except ImportError:
    from validate_ledger import (
        check_freshness,
        check_uniform_spend,
        find_repo_root,
        months_between,
        validate_all,
        validate_period,
    )


def codes(findings):
    return sorted(f.code for f in findings)


def severity_of(findings, code):
    return next(f.severity for f in findings if f.code == code)


def base_entry(**overrides):
    entry = {
        "venture": "demo",
        "agent_spend_usd": 12.5,
        "human_hours": 3.0,
        "outcomes": ["Shipped the thing."],
        "mrr_end": 0,
    }
    entry.update(overrides)
    return entry


def period_doc(entries, period="2026-07"):
    return {"period": period, "entries": entries}


class ValidateEntryTest(unittest.TestCase):
    ventures = {"demo", "other"}

    def test_clean_period_reports_nothing(self):
        findings = validate_period(period_doc([base_entry()]), "2026-07", self.ventures)
        self.assertEqual(codes(findings), [])

    def test_venture_not_in_tree_is_an_error(self):
        # The router keys cumulative spend on this name; a typo detaches the
        # spend from the venture that drew it and restores its explore grant.
        findings = validate_period(
            period_doc([base_entry(venture="renamed-venture")]), "2026-07", self.ventures
        )
        self.assertIn("unknown-venture", codes(findings))
        self.assertEqual(severity_of(findings, "unknown-venture"), "error")

    def test_missing_spend_is_an_error_because_absent_reads_as_zero(self):
        entry = base_entry()
        del entry["agent_spend_usd"]
        findings = validate_period(period_doc([entry]), "2026-07", self.ventures)
        self.assertIn("missing-spend", codes(findings))
        self.assertEqual(severity_of(findings, "missing-spend"), "error")

    def test_recorded_zero_spend_is_accepted(self):
        # Zero is a measurement. Only an *absent* value is the fail-open case,
        # so recording zero must not be penalised.
        findings = validate_period(
            period_doc([base_entry(agent_spend_usd=0)]), "2026-07", self.ventures
        )
        self.assertEqual(codes(findings), [])

    def test_negative_spend_is_an_error(self):
        findings = validate_period(
            period_doc([base_entry(agent_spend_usd=-5.0)]), "2026-07", self.ventures
        )
        self.assertIn("negative-spend", codes(findings))

    def test_boolean_spend_is_not_mistaken_for_a_number(self):
        findings = validate_period(
            period_doc([base_entry(agent_spend_usd=True)]), "2026-07", self.ventures
        )
        self.assertIn("non-numeric-spend", codes(findings))

    def test_duplicate_venture_rows_are_an_error(self):
        findings = validate_period(
            period_doc([base_entry(), base_entry(agent_spend_usd=4.0)]),
            "2026-07",
            self.ventures,
        )
        self.assertIn("duplicate-venture", codes(findings))

    def test_missing_mrr_and_outcomes_warn_but_do_not_fail(self):
        entry = base_entry()
        del entry["mrr_end"]
        entry["outcomes"] = []
        findings = validate_period(period_doc([entry]), "2026-07", self.ventures)
        self.assertIn("missing-mrr-end", codes(findings))
        self.assertIn("empty-outcomes", codes(findings))
        self.assertEqual({f.severity for f in findings}, {"warn"})

    def test_period_field_must_match_the_filename(self):
        findings = validate_period(
            period_doc([base_entry()], period="2026-06"), "2026-07", self.ventures
        )
        self.assertIn("period-filename-mismatch", codes(findings))


class UniformSpendTest(unittest.TestCase):
    """The check that catches a total divided after the fact."""

    def test_three_identical_spends_are_flagged(self):
        entries = [base_entry(venture=n, agent_spend_usd=18.18) for n in "abc"]
        findings = check_uniform_spend(entries, "2026-07")
        self.assertEqual(codes(findings), ["uniform-spend"])

    def test_two_identical_spends_are_not_flagged(self):
        # Two ventures can plausibly land on the same figure; three is a split.
        entries = [base_entry(venture=n, agent_spend_usd=18.18) for n in "ab"]
        self.assertEqual(check_uniform_spend(entries, "2026-07"), [])

    def test_distinct_spends_are_not_flagged(self):
        entries = [
            base_entry(venture="a", agent_spend_usd=4.0),
            base_entry(venture="b", agent_spend_usd=11.25),
            base_entry(venture="c", agent_spend_usd=63.9),
        ]
        self.assertEqual(check_uniform_spend(entries, "2026-07"), [])

    def test_shared_zeros_are_not_flagged(self):
        # Several ventures genuinely drawing nothing is a real observation, not
        # a divided total — flagging it would punish honest reporting.
        entries = [base_entry(venture=n, agent_spend_usd=0) for n in "abc"]
        self.assertEqual(check_uniform_spend(entries, "2026-07"), [])

    def test_uniform_spend_is_advisory_not_an_error(self):
        # A closed month cannot be reconstructed and the ledger README forbids
        # rewriting it, so this must not be able to block a build.
        entries = [base_entry(venture=n, agent_spend_usd=18.18) for n in "abc"]
        self.assertEqual(severity_of(check_uniform_spend(entries, "2026-07"), "uniform-spend"), "warn")


class FreshnessTest(unittest.TestCase):
    def test_last_closed_month_is_fresh(self):
        # On 2026-08-01 a July ledger is the newest month that *can* be closed.
        self.assertEqual(check_freshness(["2026-07"], today=date(2026, 8, 1)), [])

    def test_two_months_behind_is_stale(self):
        findings = check_freshness(["2026-07"], today=date(2026, 9, 3))
        self.assertEqual(codes(findings), ["stale-ledger"])

    def test_freshness_uses_the_newest_period_not_the_last_listed(self):
        self.assertEqual(
            check_freshness(["2026-07", "2026-05"], today=date(2026, 8, 1)), []
        )

    def test_months_between_spans_a_year_boundary(self):
        self.assertEqual(months_between("2025-11", "2026-02"), 3)
        self.assertIsNone(months_between("nonsense", "2026-02"))


class LedgerTreeTest(unittest.TestCase):
    def write_ledger(self, root: Path, name: str, body: str):
        ledger_dir = root / "portfolio" / "ledger"
        ledger_dir.mkdir(parents=True, exist_ok=True)
        (ledger_dir / name).write_text(body, encoding="utf-8")

    def make_root(self, tmp: str) -> Path:
        root = Path(tmp)
        venture_dir = root / "ventures" / "demo"
        venture_dir.mkdir(parents=True, exist_ok=True)
        (venture_dir / "VENTURE.yaml").write_text("name: demo\n", encoding="utf-8")
        return root

    def test_off_pattern_filename_is_an_error(self):
        # router.py globs *.yaml, so such a file is still summed into spend
        # while being invisible to any month-by-month review.
        with tempfile.TemporaryDirectory() as tmp:
            root = self.make_root(tmp)
            self.write_ledger(root, "backup.yaml", "period: 2026-07\nentries: []\n")
            findings = validate_all(root, today=date(2026, 8, 1))
            self.assertIn("malformed-filename", codes(findings))

    def test_unparseable_month_is_an_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = self.make_root(tmp)
            self.write_ledger(root, "2026-07.yaml", "period: 2026-07\nentries: [oops\n")
            findings = validate_all(root, today=date(2026, 8, 1))
            self.assertIn("unparseable-ledger", codes(findings))

    def test_empty_month_warns(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = self.make_root(tmp)
            self.write_ledger(root, "2026-07.yaml", "period: 2026-07\nentries: []\n")
            findings = validate_all(root, today=date(2026, 8, 1))
            self.assertIn("empty-period", codes(findings))

    def test_well_formed_tree_is_clean(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = self.make_root(tmp)
            self.write_ledger(
                root,
                "2026-07.yaml",
                "period: 2026-07\n"
                "entries:\n"
                "  - venture: demo\n"
                "    agent_spend_usd: 12.5\n"
                "    outcomes:\n"
                "      - Shipped.\n"
                "    mrr_end: 0\n",
            )
            self.assertEqual(codes(validate_all(root, today=date(2026, 8, 1))), [])


class LiveLedgerTest(unittest.TestCase):
    def test_live_ledger_has_no_structural_errors(self):
        # Deliberately asserts on errors only. The live ledger carries a known
        # advisory finding (2026-07 spend is an even split), and pinning the
        # warning set here would make recording a real month fail the suite.
        findings = validate_all(find_repo_root())
        errors = [f for f in findings if f.severity == "error"]
        self.assertEqual(errors, [], f"Ledger has structural errors: {codes(errors)}")


if __name__ == "__main__":
    unittest.main()
