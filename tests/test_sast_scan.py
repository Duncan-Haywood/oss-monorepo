#!/usr/bin/env python3
"""
Unit and contract tests for the SAST gate.

Most of these assert the failing direction. A scanner that reports success is
worth nothing on its own — the repository already had four of those, each
passing for a component it never verified — so what is tested here is that the
gate fails on a new finding, on a stale waiver, on an expired one, on a shrinking
scan surface, and on a missing tool.

The last group are contract tests against the real `platform/sast-baseline.yaml`:
they are what make this run on every push rather than only when someone
remembers to.
"""

import sys
import unittest
from datetime import date, timedelta
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[1]
SCAN_DIR = REPO_ROOT / "scripts" / "ci"
if str(SCAN_DIR) not in sys.path:
    sys.path.insert(0, str(SCAN_DIR))

import sast_scan  # noqa: E402
from sast_scan import (  # noqa: E402
    MAX_EXPIRY_DAYS,
    REQUIRED_FIELDS,
    Finding,
    Located,
    ScanError,
    check_parse_coverage,
    reconcile,
    run_bandit,
    run_semgrep,
    validate_entries,
)

TODAY = date(2026, 8, 1)
BASELINE_PATH = REPO_ROOT / "platform" / "sast-baseline.yaml"


def _as_date(value):
    return value if isinstance(value, date) else date.fromisoformat(str(value))


def entry(**overrides):
    base = {
        "id": "SAST-TEST",
        "tool": "semgrep",
        "rule": "some.rule.id",
        "path": "ventures/example/src/thing.ts",
        "count": 1,
        "owner": "duncan",
        "issue": "docs/SAST.md#sast-test",
        "reason": " ".join(["word"] * 25),
        "expires": (TODAY + timedelta(days=30)).isoformat(),
        "status": "reviewed",
    }
    base.update(overrides)
    return base


def located(rule="some.rule.id", path="ventures/example/src/thing.ts", tool="semgrep", line=1):
    return Located(
        finding=Finding(tool=tool, rule=rule, path=path),
        line=line,
        message="",
        severity="WARNING",
    )


class ValidateEntriesTests(unittest.TestCase):
    def test_complete_entry_is_accepted(self):
        self.assertEqual(validate_entries([entry()], TODAY), [])

    def test_every_required_field_is_required(self):
        for field in REQUIRED_FIELDS:
            with self.subTest(field=field):
                problems = validate_entries([entry(**{field: None})], TODAY)
                self.assertTrue(
                    any(field in problem for problem in problems),
                    f"dropping {field} produced no problem: {problems}",
                )

    def test_expired_entry_fails(self):
        problems = validate_entries(
            [entry(expires=(TODAY - timedelta(days=1)).isoformat())], TODAY
        )
        self.assertTrue(any("expired" in problem for problem in problems), problems)

    def test_expiry_beyond_the_horizon_fails(self):
        problems = validate_entries(
            [entry(expires=(TODAY + timedelta(days=MAX_EXPIRY_DAYS + 1)).isoformat())],
            TODAY,
        )
        self.assertTrue(any("maximum" in problem for problem in problems), problems)

    def test_expiry_exactly_at_the_horizon_is_allowed(self):
        problems = validate_entries(
            [entry(expires=(TODAY + timedelta(days=MAX_EXPIRY_DAYS)).isoformat())],
            TODAY,
        )
        self.assertEqual(problems, [])

    def test_unknown_tool_fails(self):
        problems = validate_entries([entry(tool="checkov")], TODAY)
        self.assertTrue(any("tool must be" in problem for problem in problems), problems)

    def test_duplicate_id_fails(self):
        problems = validate_entries([entry(), entry(path="other/file.ts")], TODAY)
        self.assertTrue(any("duplicate id" in problem for problem in problems), problems)

    def test_unknown_status_fails(self):
        problems = validate_entries([entry(status="probably-fine")], TODAY)
        self.assertTrue(any("status must be" in problem for problem in problems), problems)

    def test_reviewed_entry_with_a_thin_reason_fails(self):
        """The whole point of `reviewed`: it costs something to claim."""
        problems = validate_entries([entry(reason="false positive")], TODAY)
        self.assertTrue(any("at least" in problem for problem in problems), problems)

    def test_inherited_entry_needs_no_long_reason_but_does_need_a_plan(self):
        self.assertEqual(
            validate_entries(
                [entry(status="inherited", reason="not assessed", plan="fix the thing")],
                TODAY,
            ),
            [],
        )
        problems = validate_entries([entry(status="inherited", reason="not assessed")], TODAY)
        self.assertTrue(any("needs a `plan`" in problem for problem in problems), problems)

    def test_non_positive_count_fails(self):
        for bad in (0, -1, "1", True):
            with self.subTest(count=bad):
                problems = validate_entries([entry(count=bad)], TODAY)
                self.assertTrue(
                    any("count must be" in problem for problem in problems), problems
                )


class ReconcileTests(unittest.TestCase):
    def test_registered_finding_at_the_declared_count_passes(self):
        self.assertEqual(reconcile([located()], [entry()]), [])

    def test_unregistered_finding_fails(self):
        problems = reconcile([located(rule="brand.new.rule")], [entry()])
        self.assertTrue(any("unregistered finding" in p for p in problems), problems)

    def test_same_rule_in_a_different_file_is_unregistered(self):
        """The waiver is per file on purpose: a new file must not inherit one."""
        problems = reconcile([located(path="ventures/example/src/other.ts")], [entry()])
        self.assertTrue(any("unregistered finding" in p for p in problems), problems)

    def test_same_rule_from_a_different_tool_is_unregistered(self):
        problems = reconcile([located(tool="bandit")], [entry()])
        self.assertTrue(any("unregistered finding" in p for p in problems), problems)

    def test_more_occurrences_than_declared_fails(self):
        problems = reconcile([located(line=1), located(line=9)], [entry(count=1)])
        self.assertTrue(any("now occurs 2x" in p for p in problems), problems)

    def test_fewer_occurrences_than_declared_fails_as_stale(self):
        problems = reconcile([located(line=1)], [entry(count=2)])
        self.assertTrue(any("stale baseline entry" in p for p in problems), problems)

    def test_vanished_finding_fails_as_stale(self):
        """A waiver whose subject is fixed must be deleted, not left to cover the next one."""
        problems = reconcile([], [entry()])
        self.assertTrue(any("no longer" in p for p in problems), problems)

    def test_clean_scan_against_an_empty_baseline_passes(self):
        self.assertEqual(reconcile([], []), [])


class ParseCoverageTests(unittest.TestCase):
    def test_exact_match_passes(self):
        self.assertEqual(
            check_parse_coverage(["a.ts", "b.ts"], {"coverage": {"semgrep_unparsed_max": 2}}),
            [],
        )

    def test_growth_fails(self):
        problems = check_parse_coverage(
            ["a.ts", "b.ts", "c.ts"], {"coverage": {"semgrep_unparsed_max": 2}}
        )
        self.assertTrue(any("not fully scanned" in p for p in problems), problems)

    def test_shrink_fails_so_the_ceiling_ratchets_down(self):
        problems = check_parse_coverage(["a.ts"], {"coverage": {"semgrep_unparsed_max": 2}})
        self.assertTrue(any("Lower it to 1" in p for p in problems), problems)

    def test_missing_declaration_fails(self):
        problems = check_parse_coverage([], {})
        self.assertTrue(any("no `coverage.semgrep_unparsed_max`" in p for p in problems), problems)

    def test_non_integer_ceiling_fails(self):
        problems = check_parse_coverage([], {"coverage": {"semgrep_unparsed_max": "30"}})
        self.assertTrue(any("non-negative integer" in p for p in problems), problems)


class FailClosedTests(unittest.TestCase):
    """A missing tool must fail the gate, never silently report zero findings."""

    def test_missing_semgrep_raises(self):
        original = sast_scan.shutil.which
        sast_scan.shutil.which = lambda name: None
        try:
            with self.assertRaises(ScanError) as caught:
                run_semgrep(REPO_ROOT)
            self.assertIn("semgrep is not installed", str(caught.exception))
        finally:
            sast_scan.shutil.which = original

    def test_missing_bandit_raises(self):
        original = sast_scan.shutil.which
        sast_scan.shutil.which = lambda name: None
        try:
            with self.assertRaises(ScanError) as caught:
                run_bandit(REPO_ROOT)
            self.assertIn("bandit is not installed", str(caught.exception))
        finally:
            sast_scan.shutil.which = original


class RepositoryContractTests(unittest.TestCase):
    """Contract tests against the real register, so they run on every push."""

    @classmethod
    def setUpClass(cls):
        cls.document = yaml.safe_load(BASELINE_PATH.read_text(encoding="utf-8"))
        cls.entries = cls.document["baseline"]

    def test_real_baseline_is_valid_and_unexpired_today(self):
        self.assertEqual(validate_entries(self.entries, date.today()), [])

    def test_real_baseline_declares_a_parse_ceiling(self):
        self.assertIsInstance(self.document["coverage"]["semgrep_unparsed_max"], int)

    def test_every_waived_path_still_exists(self):
        """A waiver pointing at a deleted file can never be matched, so it can
        never go stale, so it never gets reviewed again."""
        missing = [e["path"] for e in self.entries if not (REPO_ROOT / e["path"]).exists()]
        self.assertEqual(missing, [], f"baseline entries point at missing files: {missing}")

    def test_every_reviewed_reason_is_substantive(self):
        """"False positive" on its own is not a reason anyone can re-review."""
        thin = [
            e["id"]
            for e in self.entries
            if e.get("status") == "reviewed" and len(str(e.get("reason", "")).split()) < 25
        ]
        self.assertEqual(thin, [], f"reviewed entries with a too-short reason: {thin}")

    def test_every_inherited_entry_carries_a_plan(self):
        planless = [
            e["id"]
            for e in self.entries
            if e.get("status") == "inherited" and not str(e.get("plan", "")).strip()
        ]
        self.assertEqual(planless, [], f"inherited entries with no plan: {planless}")

    def test_inherited_entries_expire_sooner_than_reviewed_ones(self):
        """Untriaged debt should come back for review before a cleared finding does."""
        inherited = [e for e in self.entries if e.get("status") == "inherited"]
        reviewed = [e for e in self.entries if e.get("status") == "reviewed"]
        if inherited and reviewed:
            self.assertLess(
                max(_as_date(e["expires"]) for e in inherited),
                min(_as_date(e["expires"]) for e in reviewed),
            )


if __name__ == "__main__":
    unittest.main()
