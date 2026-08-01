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
        check_spend_mirrors_allocation,
        check_uniform_spend,
        find_repo_root,
        load_allocation_figures,
        months_between,
        parse_allocation_queue,
        parse_allocation_report,
        validate_all,
        validate_period,
    )
except ImportError:
    from validate_ledger import (
        check_freshness,
        check_spend_mirrors_allocation,
        check_uniform_spend,
        find_repo_root,
        load_allocation_figures,
        months_between,
        parse_allocation_queue,
        parse_allocation_report,
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


ALLOCATION_REPORT = """# Portfolio Effort & Resource Allocation Report

| Rank | Venture | Stage | Protected | MRR | Monthly Cap | Allocated Budget | Primary Focus |
|:---:|:---|:---:|:---:|:---:|:---:|:---:|:---|
| 1 | **[alpha](file:///repo/ventures/alpha)** | `prototype` | YES | Unmeasured | $40.00 | **$40.00** | Core feature completion |
| 2 | **[beta](file:///repo/ventures/beta)** | `prototype` | YES | $0.00 | $50.00 | **$28.50** | Core feature completion |
| 3 | **[gamma](file:///repo/ventures/gamma)** | `prototype` | No | $0.00 | $30.00 | **$6.80** | Core feature completion |

**Total Allocated Agent Spend:** `$75.30 USD`
"""

ALLOCATION_QUEUE = {
    "work_queue": [
        {"venture": "alpha", "allocated_usd": 18.18, "cap_usd": 40},
        {"venture": "beta", "allocated_usd": 18.18, "cap_usd": 50},
    ]
}


class AllocationSourceTest(unittest.TestCase):
    """The two artefacts a figure gets copied out of."""

    def test_report_columns_are_found_by_header_not_by_position(self):
        figures = parse_allocation_report(ALLOCATION_REPORT)
        self.assertEqual(figures, {"alpha": {40.0}, "beta": {28.5}, "gamma": {6.8}})

    def test_report_with_a_reordered_allocated_column_still_parses(self):
        # router.py generates this file, so the columns can move. Reading the
        # header is what keeps the check from silently matching the wrong cell.
        reordered = (
            "| Venture | Allocated Budget | Monthly Cap |\n"
            "|:---|:---:|:---:|\n"
            "| **[alpha](x)** | **$40.00** | $99.00 |\n"
        )
        self.assertEqual(parse_allocation_report(reordered), {"alpha": {40.0}})

    def test_report_without_an_allocated_column_yields_nothing(self):
        # Which load_allocation_figures turns into an error rather than silence.
        renamed = (
            "| Venture | Granted | Monthly Cap |\n"
            "|:---|:---:|:---:|\n"
            "| **[alpha](x)** | **$40.00** | $99.00 |\n"
        )
        self.assertEqual(parse_allocation_report(renamed), {})

    def test_queue_json_is_read_under_any_of_its_amount_keys(self):
        self.assertEqual(
            parse_allocation_queue(ALLOCATION_QUEUE), {"alpha": {18.18}, "beta": {18.18}}
        )
        self.assertEqual(
            parse_allocation_queue({"queue": [{"venture": "a", "allocated_budget_usd": 5}]}),
            {"a": {5.0}},
        )

    def test_absent_sources_are_silent_but_an_unparseable_one_is_an_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            figures, findings = load_allocation_figures(root)
            self.assertEqual((figures, findings), ({}, []))

            report = root / "portfolio" / "ALLOCATION_REPORT.md"
            report.parent.mkdir(parents=True, exist_ok=True)
            report.write_text("# no table here\n", encoding="utf-8")
            figures, findings = load_allocation_figures(root)
            self.assertEqual(codes(findings), ["unreadable-allocation-source"])
            self.assertEqual(severity_of(findings, "unreadable-allocation-source"), "error")


class SpendMirrorsAllocationTest(unittest.TestCase):
    """The check that catches the plan being written back as the observation."""

    allocations = {"alpha": {40.0}, "beta": {28.5}, "gamma": {6.8}, "delta": {20.0}}

    def test_three_entries_matching_their_grant_are_flagged(self):
        entries = [
            base_entry(venture="alpha", agent_spend_usd=40.0),
            base_entry(venture="beta", agent_spend_usd=28.5),
            base_entry(venture="gamma", agent_spend_usd=6.8),
        ]
        findings = check_spend_mirrors_allocation(entries, "2026-08", self.allocations)
        self.assertEqual(codes(findings), ["spend-mirrors-allocation"])
        self.assertIn("alpha ($40.00)", findings[0].message)

    def test_two_entries_matching_their_grant_are_not_flagged(self):
        # A venture drawing its whole grant is ordinary. Three of them landing
        # on the exact cent is the copied-plan signature.
        entries = [
            base_entry(venture="alpha", agent_spend_usd=40.0),
            base_entry(venture="beta", agent_spend_usd=28.5),
            base_entry(venture="gamma", agent_spend_usd=1.25),
        ]
        self.assertEqual(check_spend_mirrors_allocation(entries, "2026-08", self.allocations), [])

    def test_spend_matching_another_ventures_grant_does_not_count(self):
        # The match must be per venture, or every figure in the report becomes a
        # blocklisted number and honest spend starts tripping the check.
        entries = [
            base_entry(venture="alpha", agent_spend_usd=28.5),
            base_entry(venture="beta", agent_spend_usd=6.8),
            base_entry(venture="gamma", agent_spend_usd=40.0),
        ]
        self.assertEqual(check_spend_mirrors_allocation(entries, "2026-08", self.allocations), [])

    def test_metered_spend_near_but_not_equal_to_the_grant_is_not_flagged(self):
        entries = [
            base_entry(venture="alpha", agent_spend_usd=39.94),
            base_entry(venture="beta", agent_spend_usd=28.51),
            base_entry(venture="gamma", agent_spend_usd=6.79),
        ]
        self.assertEqual(check_spend_mirrors_allocation(entries, "2026-08", self.allocations), [])

    def test_shared_zeros_are_not_flagged(self):
        # A venture granted nothing and drawing nothing is an honest row.
        entries = [base_entry(venture=n, agent_spend_usd=0) for n in ("alpha", "beta", "gamma")]
        self.assertEqual(
            check_spend_mirrors_allocation(entries, "2026-08", {n: {0.0} for n in ("alpha", "beta", "gamma")}),
            [],
        )

    def test_float_noise_from_a_yaml_or_json_round_trip_still_matches(self):
        # The two sides are read by different parsers, so the same figure can
        # arrive as 40.000000000000004. Comparing at the cent is what makes the
        # check about money rather than about IEEE 754.
        entries = [
            base_entry(venture="alpha", agent_spend_usd=40.000000000000004),
            base_entry(venture="beta", agent_spend_usd=28.499999999999996),
            base_entry(venture="gamma", agent_spend_usd=6.8000000000000007),
        ]
        findings = check_spend_mirrors_allocation(entries, "2026-08", self.allocations)
        self.assertEqual(codes(findings), ["spend-mirrors-allocation"])

    def test_an_integer_spend_matches_a_float_grant(self):
        entries = [
            base_entry(venture="alpha", agent_spend_usd=40),
            base_entry(venture="beta", agent_spend_usd=28.5),
            base_entry(venture="gamma", agent_spend_usd=6.8),
        ]
        self.assertEqual(
            codes(check_spend_mirrors_allocation(entries, "2026-08", self.allocations)),
            ["spend-mirrors-allocation"],
        )

    def test_no_allocation_source_means_no_finding(self):
        entries = [base_entry(venture=n, agent_spend_usd=40.0) for n in ("alpha", "beta", "gamma")]
        self.assertEqual(check_spend_mirrors_allocation(entries, "2026-08", {}), [])

    def test_the_finding_is_advisory_not_an_error(self):
        # The ledger is append-only; this can be annotated, never repaired, so
        # it must not be able to block a build.
        entries = [
            base_entry(venture="alpha", agent_spend_usd=40.0),
            base_entry(venture="beta", agent_spend_usd=28.5),
            base_entry(venture="gamma", agent_spend_usd=6.8),
        ]
        findings = check_spend_mirrors_allocation(entries, "2026-08", self.allocations)
        self.assertEqual(severity_of(findings, "spend-mirrors-allocation"), "warn")

    def test_it_runs_as_part_of_a_period_validation(self):
        entries = [
            base_entry(venture="alpha", agent_spend_usd=40.0),
            base_entry(venture="beta", agent_spend_usd=28.5),
            base_entry(venture="gamma", agent_spend_usd=6.8),
        ]
        findings = validate_period(
            period_doc(entries, period="2026-08"),
            "2026-08",
            {"alpha", "beta", "gamma"},
            self.allocations,
        )
        self.assertIn("spend-mirrors-allocation", codes(findings))


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


    def test_a_month_copied_from_the_allocation_report_is_caught_end_to_end(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = self.make_root(tmp)
            for name in ("alpha", "beta", "gamma"):
                venture_dir = root / "ventures" / name
                venture_dir.mkdir(parents=True, exist_ok=True)
                (venture_dir / "VENTURE.yaml").write_text(f"name: {name}\n", encoding="utf-8")
            (root / "portfolio").mkdir(parents=True, exist_ok=True)
            (root / "portfolio" / "ALLOCATION_REPORT.md").write_text(
                ALLOCATION_REPORT, encoding="utf-8"
            )
            self.write_ledger(
                root,
                "2026-07.yaml",
                "period: 2026-07\n"
                "entries:\n"
                "  - venture: alpha\n    agent_spend_usd: 40.00\n"
                "    outcomes: [Shipped.]\n    mrr_end: 0\n"
                "  - venture: beta\n    agent_spend_usd: 28.50\n"
                "    outcomes: [Shipped.]\n    mrr_end: 0\n"
                "  - venture: gamma\n    agent_spend_usd: 6.80\n"
                "    outcomes: [Shipped.]\n    mrr_end: 0\n",
            )
            findings = validate_all(root, today=date(2026, 8, 1))
            self.assertEqual(codes(findings), ["spend-mirrors-allocation"])

    def test_an_unreadable_allocation_source_surfaces_through_validate_all(self):
        # The findings from load_allocation_figures have to reach the caller.
        # If validate_all drops them, the one signal that this check has gone
        # inert is the signal that disappears.
        with tempfile.TemporaryDirectory() as tmp:
            root = self.make_root(tmp)
            (root / "portfolio").mkdir(parents=True, exist_ok=True)
            (root / "portfolio" / "ALLOCATION_REPORT.md").write_text(
                "# report with no table\n", encoding="utf-8"
            )
            self.write_ledger(
                root,
                "2026-07.yaml",
                "period: 2026-07\n"
                "entries:\n"
                "  - venture: demo\n    agent_spend_usd: 12.5\n"
                "    outcomes: [Shipped.]\n    mrr_end: 0\n",
            )
            findings = validate_all(root, today=date(2026, 8, 1))
            self.assertIn("unreadable-allocation-source", codes(findings))
            self.assertEqual(severity_of(findings, "unreadable-allocation-source"), "error")

    def test_an_unreadable_allocation_source_survives_a_missing_ledger_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = self.make_root(tmp)
            (root / "portfolio").mkdir(parents=True, exist_ok=True)
            (root / "portfolio" / "ALLOCATION_REPORT.md").write_text(
                "# report with no table\n", encoding="utf-8"
            )
            findings = validate_all(root, today=date(2026, 8, 1))
            self.assertEqual(
                codes(findings), ["missing-ledger", "unreadable-allocation-source"]
            )


class LiveLedgerTest(unittest.TestCase):
    def test_the_live_allocation_report_still_parses(self):
        # This check compares the ledger against a generated artefact. If the
        # report's format moves and the parser stops matching, every month goes
        # quiet and a clean run stops meaning anything. Assert the source can
        # still be read rather than trusting an empty finding list.
        figures, findings = load_allocation_figures(find_repo_root())
        self.assertEqual(findings, [], f"allocation sources unreadable: {codes(findings)}")
        self.assertTrue(
            figures, "no per-venture allocation could be read from any live source"
        )

    def test_live_ledger_has_no_structural_errors(self):
        # Deliberately asserts on errors only. The live ledger carries a known
        # advisory finding (2026-07 spend is an even split), and pinning the
        # warning set here would make recording a real month fail the suite.
        findings = validate_all(find_repo_root())
        errors = [f for f in findings if f.severity == "error"]
        self.assertEqual(errors, [], f"Ledger has structural errors: {codes(errors)}")


if __name__ == "__main__":
    unittest.main()
