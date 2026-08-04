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
import os
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
    MAX_BASIS_DRIFT_PERCENT,
    MAX_TOLERANCE_POINTS,
    METRICS,
    Measurement,
    audit,
    compare,
    compare_basis,
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
        "sources": ["src/**/*.mjs"],
        "baseline": {"lines": 87.5, "functions": 75.0, "branches": 75.0, "unexercised": 0},
        # Matches SAMPLE_LCOV, so a comparison against it checks the percentages
        # rather than tripping over the basis.
        "measured": {"files": 2, "lines": 200},
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
        for missing in ("id", "path", "command", "owner", "baseline", "measured", "tolerance"):
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

    def test_measured_basis_must_be_a_mapping(self):
        entry = component(measured=[54, 13502])
        self.assertIn("invalid-measured-basis", [f.code for f in validate_component(entry)])

    def test_measured_basis_requires_both_halves(self):
        for present, absent in (("files", "lines"), ("lines", "files")):
            entry = component(measured={present: 10})
            codes = [f.code for f in validate_component(entry)]
            self.assertIn("missing-measured-field", codes, f"{absent} was not required")

    def test_measured_counts_must_be_positive_integers(self):
        for bad in (0, -1, 54.5, "54", True):
            entry = component(measured={"files": bad, "lines": 200})
            self.assertIn(
                "invalid-measured-field",
                [f.code for f in validate_component(entry)],
                f"{bad!r} was accepted as a file count",
            )

    def test_basis_drift_band_wider_than_the_cap_fails(self):
        """A band that can hide a component measuring a different surface is not a band."""
        entry = component(
            measured={"files": 2, "lines": 200, "drift_percent": MAX_BASIS_DRIFT_PERCENT + 0.1}
        )
        self.assertIn("basis-drift-too-wide", [f.code for f in validate_component(entry)])

    def test_negative_basis_drift_fails(self):
        entry = component(measured={"files": 2, "lines": 200, "drift_percent": -1})
        self.assertIn("invalid-basis-drift", [f.code for f in validate_component(entry)])

    def test_non_numeric_basis_drift_fails(self):
        entry = component(measured={"files": 2, "lines": 200, "drift_percent": "wide"})
        self.assertIn("invalid-basis-drift", [f.code for f in validate_component(entry)])


class MeasurementBasisTest(unittest.TestCase):
    """The check that would have caught the 2026-08-02 inflated floors.

    Both components' baselines were raised onto reports that had started counting
    their own test files as covered source. Every assertion here is about the
    denominator, because the percentages in that commit were arithmetically
    correct — over the wrong set of files.
    """

    def test_matching_basis_is_clean(self):
        self.assertEqual(compare_basis(component(), parse_lcov(SAMPLE_LCOV)), [])

    def test_a_report_covering_the_test_files_too_fails(self):
        """platform-ci, exactly: 1 declared source file, 13 measured."""
        entry = component(measured={"files": 1, "lines": 805})
        measured = Measurement(files=13, lines_found=3436, lines_hit=3010)
        codes = [f.code for f in compare_basis(entry, measured)]
        self.assertEqual(codes, ["measurement-basis-drift", "measurement-basis-drift"])

    def test_source_silently_dropping_out_of_the_report_fails(self):
        """The inverse, and the more dangerous one: coverage *rises* as it happens."""
        entry = component(measured={"files": 54, "lines": 13502})
        measured = Measurement(files=20, lines_found=5000, lines_hit=4900)
        findings = compare_basis(entry, measured)
        self.assertEqual([f.code for f in findings], ["measurement-basis-drift"] * 2)
        self.assertIn("fewer than", findings[0].message)

    def test_routine_file_churn_inside_the_band_passes(self):
        entry = component(measured={"files": 54, "lines": 13502})
        measured = Measurement(files=57, lines_found=14100, lines_hit=13000)
        self.assertEqual(compare_basis(entry, measured), [])

    def test_a_single_file_component_is_pinned_exactly(self):
        """10% of one file is a tenth of a file, so any change needs a decision."""
        entry = component(measured={"files": 1, "lines": 805})
        measured = Measurement(files=2, lines_found=805, lines_hit=500)
        codes = [f.code for f in compare_basis(entry, measured)]
        self.assertEqual(codes, ["measurement-basis-drift"])

    def test_a_wider_declared_band_is_honoured(self):
        entry = component(measured={"files": 54, "lines": 13502, "drift_percent": 25.0})
        measured = Measurement(files=66, lines_found=16000, lines_hit=15000)
        self.assertEqual(compare_basis(entry, measured), [])

    def test_compare_reports_basis_drift_alongside_the_percentages(self):
        """`compare` is what the audit calls; the basis check must run inside it."""
        entry = component(measured={"files": 1, "lines": 805})
        measured = Measurement(
            files=13,
            lines_found=3436,
            lines_hit=3010,
            functions_found=10,
            functions_hit=10,
            branches_found=10,
            branches_hit=10,
        )
        self.assertIn("measurement-basis-drift", [f.code for f in compare(entry, measured)])


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
            sources=[],
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
            sources=["a.ts"],
            command=[
                "node",
                "-e",
                "require('fs').writeFileSync(process.env.COVERAGE_LCOV_DESTINATION,"
                "'SF:a.ts\\nLF:10\\nLH:9\\nFNF:2\\nFNH:2\\nBRF:4\\nBRH:3\\nend_of_record\\n')",
            ],
            baseline={"lines": 90.0, "functions": 100.0, "branches": 75.0, "unexercised": 0},
            measured={"files": 1, "lines": 10},
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

    def test_every_node_component_pins_what_it_measures(self):
        """Without this flag the measured surface is whatever the runner defaults to.

        Node 22 counts a component's own test files as covered source; Node 24
        stopped. `.gitea/workflows/ci-cd.yml` pins Node 22 and developer machines
        run newer ones, so an unpinned command is measured over two different sets
        of files and the gate's verdict depends on who ran it. That is how both
        floors in this file came to be raised onto reports of the test suites
        grading themselves.
        """
        for entry in load_baseline(REPO_ROOT)["components"]:
            if entry.get("runner") != "node-test":
                continue
            pins = [
                part
                for part in entry["command"]
                if part.startswith("--test-coverage-include")
                or part.startswith("--test-coverage-exclude")
            ]
            self.assertTrue(
                pins,
                f"{entry['id']} lets the Node version decide which files it measures; "
                "pass --test-coverage-include so the basis is the same on every runner",
            )

    def test_every_component_declares_the_basis_of_its_baseline(self):
        for entry in load_baseline(REPO_ROOT)["components"]:
            basis = entry.get("measured")
            self.assertIsInstance(basis, dict, f"{entry['id']} declares no measured basis")
            for half in ("files", "lines"):
                self.assertIsInstance(
                    basis.get(half), int, f"{entry['id']} has no measured.{half}"
                )

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
