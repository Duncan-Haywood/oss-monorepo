#!/usr/bin/env python3
"""
Unit and contract tests for the coverage baseline ratchet.

A gate that cannot fail is not a gate, so most of these assert the failing
direction: coverage below the baseline, coverage above a stale baseline, a
coverage command that dies, a report that measures nothing. The last tests are
contract tests against the real repository — they are what make this run on
every push rather than only when someone remembers.

No test here is skipped or conditionally skipped, and none should be.
`scripts/ci/audit_exceptions.py` treats a skipped Python test as a suppression
needing a registered owner and expiry, and it is right to: a coverage gate that
quietly does not run on the machine that matters is the exact failure this file
exists to prevent.
"""

import json
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
CI_DIR = REPO_ROOT / "scripts" / "ci"
if str(CI_DIR) not in sys.path:
    sys.path.insert(0, str(CI_DIR))

from coverage_ratchet import (
    BASELINE_PATH,
    MAX_TOLERANCE_POINTS,
    METRICS,
    Measurement,
    audit,
    compare,
    load_baseline,
    parse_lcov,
    run_coverage,
    validate_component,
)

# One file, deliberately imperfect in all three metrics, so a test that asserts
# a percentage cannot pass by accident on an all-or-nothing report.
SAMPLE_LCOV = textwrap.dedent(
    """\
    TN:
    SF:src/alpha.ts
    FNF:10
    FNH:5
    BRF:20
    BRH:10
    LF:100
    LH:75
    end_of_record
    SF:src/beta.ts
    FNF:10
    FNH:10
    BRF:20
    BRH:20
    LF:100
    LH:100
    end_of_record
    """
)


def component(**overrides):
    entry = {
        "id": "demo",
        "path": "platform/ci",
        "owner": "duncan",
        "command": ["node", "--version"],
        "baseline": {"lines": 87.5, "functions": 75.0, "branches": 75.0},
        "tolerance": {"lines": 0.5, "functions": 0.5, "branches": 0.5},
    }
    entry.update(overrides)
    return entry


class ParseLcovTest(unittest.TestCase):
    def test_sums_totals_across_files(self):
        measured = parse_lcov(SAMPLE_LCOV)
        self.assertEqual(measured.files, 2)
        self.assertEqual(measured.lines_found, 200)
        self.assertEqual(measured.lines_hit, 175)
        self.assertEqual(measured.functions_found, 20)
        self.assertEqual(measured.functions_hit, 15)
        self.assertEqual(measured.branches_found, 40)
        self.assertEqual(measured.branches_hit, 30)

    def test_percentages_are_rounded_to_two_places(self):
        measured = parse_lcov(SAMPLE_LCOV)
        self.assertEqual(measured.percent("lines"), 87.5)
        self.assertEqual(measured.percent("functions"), 75.0)
        self.assertEqual(measured.percent("branches"), 75.0)

    def test_ignores_per_line_records(self):
        """DA/BRDA/FN records must not be double counted into the totals."""
        noisy = SAMPLE_LCOV.replace(
            "SF:src/alpha.ts\n",
            "SF:src/alpha.ts\nDA:1,1\nDA:2,0\nBRDA:1,0,0,1\nFN:1,thing\nFNDA:3,thing\n",
        )
        self.assertEqual(parse_lcov(noisy).lines_found, 200)
        self.assertEqual(parse_lcov(noisy).functions_found, 20)

    def test_empty_report_measures_nothing(self):
        measured = parse_lcov("")
        self.assertEqual(measured.lines_found, 0)
        self.assertEqual(measured.files, 0)

    def test_malformed_counts_do_not_raise(self):
        measured = parse_lcov("SF:a.ts\nLF:not-a-number\nLH:3\nend_of_record\n")
        self.assertEqual(measured.lines_found, 0)
        self.assertEqual(measured.lines_hit, 3)

    def test_no_branches_reports_full_branch_coverage(self):
        """A file with no branches has nothing uncovered, so 0/0 is 100%."""
        measured = Measurement(lines_found=10, lines_hit=10, branches_found=0, branches_hit=0)
        self.assertEqual(measured.percent("branches"), 100.0)


class CompareTest(unittest.TestCase):
    def test_matching_baseline_is_clean(self):
        measured = parse_lcov(SAMPLE_LCOV)
        self.assertEqual(compare(component(), measured), [])

    def test_coverage_below_baseline_fails(self):
        measured = parse_lcov(SAMPLE_LCOV)
        entry = component(baseline={"lines": 95.0, "functions": 75.0, "branches": 75.0})
        findings = compare(entry, measured)
        self.assertEqual([f.code for f in findings], ["coverage-regressed"])
        self.assertIn("87.50%", findings[0].message)

    def test_coverage_above_baseline_fails_as_stale(self):
        """The ratchet turns both ways: an unraised baseline is a dead floor."""
        measured = parse_lcov(SAMPLE_LCOV)
        entry = component(baseline={"lines": 50.0, "functions": 75.0, "branches": 75.0})
        findings = compare(entry, measured)
        self.assertEqual([f.code for f in findings], ["baseline-stale"])
        self.assertIn("Raise baseline.lines to 87.50", findings[0].remedy)

    def test_movement_inside_the_tolerance_band_passes(self):
        measured = parse_lcov(SAMPLE_LCOV)
        entry = component(baseline={"lines": 87.2, "functions": 75.3, "branches": 74.6})
        self.assertEqual(compare(entry, measured), [])

    def test_drop_just_past_the_band_fails(self):
        measured = parse_lcov(SAMPLE_LCOV)
        entry = component(
            baseline={"lines": 88.01, "functions": 75.0, "branches": 75.0},
            tolerance={"lines": 0.5, "functions": 0.5, "branches": 0.5},
        )
        findings = compare(entry, measured)
        self.assertEqual([f.code for f in findings], ["coverage-regressed"])

    def test_every_metric_is_checked_independently(self):
        measured = parse_lcov(SAMPLE_LCOV)
        entry = component(baseline={"lines": 99.0, "functions": 99.0, "branches": 10.0})
        codes = sorted(f.code for f in compare(entry, measured))
        self.assertEqual(codes, ["baseline-stale", "coverage-regressed", "coverage-regressed"])


class ValidateComponentTest(unittest.TestCase):
    def test_complete_entry_is_valid(self):
        self.assertEqual(validate_component(component()), [])

    def test_missing_required_field_fails(self):
        for missing in ("id", "path", "command", "owner", "baseline", "tolerance"):
            entry = component()
            del entry[missing]
            codes = [f.code for f in validate_component(entry)]
            self.assertIn("missing-field", codes, f"{missing} was not required")

    def test_missing_metric_fails(self):
        entry = component(baseline={"lines": 90.0})
        codes = [f.code for f in validate_component(entry)]
        self.assertEqual(codes.count("missing-baseline-metric"), 2)

    def test_non_numeric_baseline_fails(self):
        entry = component(baseline={"lines": "ninety", "functions": 1.0, "branches": 1.0})
        self.assertIn("invalid-baseline-metric", [f.code for f in validate_component(entry)])

    def test_baseline_outside_zero_to_hundred_fails(self):
        entry = component(baseline={"lines": 101.0, "functions": 1.0, "branches": 1.0})
        self.assertIn("baseline-out-of-range", [f.code for f in validate_component(entry)])

    def test_tolerance_wider_than_the_cap_fails(self):
        """A band that can hide a deleted test file is not a tolerance."""
        entry = component(
            tolerance={"lines": MAX_TOLERANCE_POINTS + 0.1, "functions": 0.5, "branches": 0.5}
        )
        self.assertIn("tolerance-too-wide", [f.code for f in validate_component(entry)])

    def test_negative_tolerance_fails(self):
        entry = component(tolerance={"lines": -1.0, "functions": 0.5, "branches": 0.5})
        self.assertIn("tolerance-negative", [f.code for f in validate_component(entry)])

    def test_non_mapping_entry_fails(self):
        self.assertEqual([f.code for f in validate_component("print-atelier")], ["malformed-entry"])


class RunCoverageTest(unittest.TestCase):
    """Every one of these failure modes previously read as a pass elsewhere."""

    def test_missing_component_path_fails(self):
        _, failure = run_coverage(REPO_ROOT, component(path="ventures/does-not-exist"))
        self.assertIsNotNone(failure)
        self.assertEqual(failure.code, "missing-component-path")

    def test_shell_string_command_is_rejected(self):
        _, failure = run_coverage(REPO_ROOT, component(command="node --test"))
        self.assertEqual(failure.code, "invalid-command")

    def test_missing_tool_fails_rather_than_skips(self):
        _, failure = run_coverage(REPO_ROOT, component(command=["definitely-not-a-real-binary"]))
        self.assertEqual(failure.code, "coverage-tool-missing")

    def test_failing_suite_fails(self):
        _, failure = run_coverage(
            REPO_ROOT, component(command=["node", "-e", "process.exit(3)"])
        )
        self.assertEqual(failure.code, "coverage-command-failed")
        self.assertIn("exited 3", failure.message)

    def test_command_that_writes_no_lcov_fails(self):
        _, failure = run_coverage(REPO_ROOT, component(command=["node", "-e", ""]))
        self.assertEqual(failure.code, "missing-lcov")

    def test_empty_lcov_fails_rather_than_reading_as_perfect(self):
        entry = component(
            command=[
                "node",
                "-e",
                "require('fs').writeFileSync(process.env.COVERAGE_LCOV_DESTINATION, 'TN:\\n')",
            ]
        )
        _, failure = run_coverage(REPO_ROOT, entry)
        self.assertEqual(failure.code, "empty-coverage-report")

    def test_destination_is_provided_and_read_back(self):
        entry = component(
            command=[
                "node",
                "-e",
                "require('fs').writeFileSync(process.env.COVERAGE_LCOV_DESTINATION,"
                "'SF:a.ts\\nLF:10\\nLH:9\\nFNF:2\\nFNH:2\\nBRF:4\\nBRH:3\\nend_of_record\\n')",
            ],
            baseline={"lines": 90.0, "functions": 100.0, "branches": 75.0},
        )
        measured, failure = run_coverage(REPO_ROOT, entry)
        self.assertIsNone(failure)
        self.assertEqual(measured.percent("lines"), 90.0)
        self.assertEqual(compare(entry, measured), [])


class AuditTest(unittest.TestCase):
    def _baseline_file(self, tmpdir, payload):
        path = Path(tmpdir) / "baseline.yaml"
        path.write_text(json.dumps(payload))  # JSON is a subset of YAML
        return path.name

    def test_baseline_with_no_components_fails(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            name = self._baseline_file(tmpdir, {"components": []})
            findings, _ = audit(Path(tmpdir), baseline_path=name)
            self.assertEqual([f.code for f in findings], ["no-components"])

    def test_duplicate_component_ids_fail(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            entry = component(command=["node", "-e", ""])
            name = self._baseline_file(tmpdir, {"components": [entry, dict(entry)]})
            findings, _ = audit(Path(tmpdir), baseline_path=name, measure=False)
            self.assertIn("duplicate-component", [f.code for f in findings])

    def test_unknown_component_filter_fails(self):
        findings, _ = audit(REPO_ROOT, only="no-such-component", measure=False)
        self.assertIn("unknown-component", [f.code for f in findings])

    def test_missing_baseline_file_raises(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with self.assertRaises(FileNotFoundError):
                audit(Path(tmpdir), baseline_path="absent.yaml")


class RepositoryContractTest(unittest.TestCase):
    """Contract tests against the real baseline and the real suites."""

    def test_real_baseline_is_structurally_valid(self):
        findings, _ = audit(REPO_ROOT, measure=False)
        self.assertEqual([f.format() for f in findings], [])

    def test_real_baseline_declares_every_metric_with_an_owner(self):
        data = load_baseline(REPO_ROOT)
        components = data["components"]
        self.assertGreater(len(components), 0)
        for entry in components:
            self.assertTrue(entry.get("owner"), f"{entry.get('id')} has no owner")
            for metric in METRICS:
                self.assertIn(metric, entry["baseline"])
                # The 90% target is aspirational; a baseline written *at* the
                # target before it is true would switch the gate off.
                self.assertLessEqual(entry["baseline"][metric], 100.0)

    def test_declared_component_paths_exist(self):
        for entry in load_baseline(REPO_ROOT)["components"]:
            self.assertTrue(
                (REPO_ROOT / entry["path"]).is_dir(),
                f"{entry['id']} declares a path that does not exist: {entry['path']}",
            )

    def test_every_component_matches_its_declared_baseline(self):
        """The gate itself, executed. Slow on purpose: it runs the real suites."""
        findings, measurements = audit(REPO_ROOT)
        self.assertEqual(
            [f.format() for f in findings],
            [],
            "coverage drifted from platform/coverage-baseline.yaml",
        )
        self.assertEqual(
            sorted(measurements),
            sorted(e["id"] for e in load_baseline(REPO_ROOT)["components"]),
            "a declared component produced no measurement",
        )

    def test_cli_exits_nonzero_when_a_baseline_is_wrong(self):
        """End-to-end: a regressed baseline must turn the process red."""
        data = load_baseline(REPO_ROOT)
        # The smallest declared suite, so this end-to-end check costs seconds
        # rather than re-running the largest venture's tests a second time.
        entry = dict(min(data["components"], key=lambda c: len(c["path"])))
        entry["baseline"] = dict(entry["baseline"], lines=100.0)
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "baseline.yaml"
            path.write_text(json.dumps({"components": [entry]}))
            completed = subprocess.run(
                [
                    sys.executable,
                    str(CI_DIR / "coverage_ratchet.py"),
                    "--baseline",
                    str(path),
                ],
                cwd=REPO_ROOT,
                capture_output=True,
                text=True,
            )
        self.assertEqual(completed.returncode, 1, completed.stdout + completed.stderr)
        self.assertIn("coverage-regressed", completed.stderr)


if __name__ == "__main__":
    unittest.main()
