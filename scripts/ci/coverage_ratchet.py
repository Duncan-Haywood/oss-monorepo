#!/usr/bin/env python3
"""
Coverage baseline ratchet.

`ENGINEERING-PRINCIPLES.md` sets a 90% coverage floor. Until now the only
automated check carrying the word "coverage" was a grep in
`scripts/ci/test-engineering-policy.sh` asserting that the sentence stating the
floor is still present in the principles document. Deleting every test in the
repository left that check green. No coverage tool was installed anywhere, no
component measured coverage, and the number 90 was therefore a claim rather
than a control.

This enforces a measured baseline instead of an aspiration. Each component in
`platform/coverage-baseline.yaml` declares the coverage it actually has today,
and the audit runs the component's coverage command and compares.

The comparison is two-directional, for the same reason `count` is exact in
`platform/exception-register.yaml`:

  * Below baseline fails. Someone removed or bypassed a test.
  * Above baseline fails. The baseline is stale. Raising it is a deliberate,
    reviewed act, because a floor that silently trails reality ratchets
    nothing — it just records the worst the component was ever allowed to be.

Unlike `count`, which is an exact integer, each metric here carries a
`tolerance` in percentage points. Coverage percentages move by fractions when
an unrelated source line is added, and a baseline that must be rewritten on
every commit trains people to bump it without reading it. The tolerance is the
width of the band that needs no review, not permission to regress: it is
declared per component and checked in, so widening it is itself reviewable.

Deliberately fails closed. A component declared in the baseline whose coverage
command fails, produces no lcov, or reports zero total lines is a failure, not
a skip. That is the specific way the repository's other gates have been found
to lie: a missing tool reported PASSED for work it never did.

Usage:
    python3 scripts/ci/coverage_ratchet.py              # audit, exit 1 on failure
    python3 scripts/ci/coverage_ratchet.py --report     # measure, always exit 0
    python3 scripts/ci/coverage_ratchet.py --json       # machine-readable
    python3 scripts/ci/coverage_ratchet.py --component print-atelier
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from dataclasses import dataclass, asdict, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence

import yaml

BASELINE_PATH = "platform/coverage-baseline.yaml"

# The metrics every declared component must carry a baseline for. Branch
# coverage is listed last but is the one that matters most: line coverage counts
# whether a statement ran, branch coverage counts whether its failure path did.
METRICS = ("lines", "functions", "branches")

REQUIRED_COMPONENT_FIELDS = (
    "id",
    "path",
    "command",
    "owner",
    "baseline",
    "tolerance",
)

# A tolerance wide enough to hide a deleted test file is not a tolerance. Two
# percentage points is roughly one small module in the components measured here.
MAX_TOLERANCE_POINTS = 2.0


@dataclass
class Measurement:
    """Totals summed across every file in one lcov report."""

    lines_found: int = 0
    lines_hit: int = 0
    functions_found: int = 0
    functions_hit: int = 0
    branches_found: int = 0
    branches_hit: int = 0
    files: int = 0

    def percent(self, metric: str) -> float:
        found, hit = {
            "lines": (self.lines_found, self.lines_hit),
            "functions": (self.functions_found, self.functions_hit),
            "branches": (self.branches_found, self.branches_hit),
        }[metric]
        if found == 0:
            # A component with no branches at all is reported as 100%: there is
            # nothing uncovered. Zero *lines* is caught separately as an error,
            # because it means the report is empty, not that the code is perfect.
            return 100.0
        return round(100.0 * hit / found, 2)

    def percentages(self) -> Dict[str, float]:
        return {metric: self.percent(metric) for metric in METRICS}


@dataclass
class Finding:
    component: str
    severity: str  # "error" | "warn"
    code: str
    message: str
    remedy: str

    def format(self) -> str:
        mark = "ERROR" if self.severity == "error" else "warn "
        return f"{mark} [{self.code}] {self.component}: {self.message}\n        -> {self.remedy}"


def parse_lcov(text: str) -> Measurement:
    """Sum the per-file summary records of an lcov report.

    lcov emits LF/LH (lines found/hit), FNF/FNH (functions) and BRF/BRH
    (branches) once per source file. Only those totals are read; the per-line
    DA/BRDA records are what produce them and are not needed here.
    """
    totals = Measurement()
    for raw in text.splitlines():
        line = raw.strip()
        if not line or ":" not in line:
            if line == "end_of_record":
                continue
            continue
        key, _, value = line.partition(":")
        if key == "SF":
            totals.files += 1
            continue
        if key not in {"LF", "LH", "FNF", "FNH", "BRF", "BRH"}:
            continue
        try:
            count = int(value.strip())
        except ValueError:
            continue
        if key == "LF":
            totals.lines_found += count
        elif key == "LH":
            totals.lines_hit += count
        elif key == "FNF":
            totals.functions_found += count
        elif key == "FNH":
            totals.functions_hit += count
        elif key == "BRF":
            totals.branches_found += count
        elif key == "BRH":
            totals.branches_hit += count
    return totals


def load_baseline(repo_root: Path, path: str = BASELINE_PATH) -> Dict[str, Any]:
    baseline_file = repo_root / path
    if not baseline_file.is_file():
        raise FileNotFoundError(f"coverage baseline not found: {path}")
    data = yaml.safe_load(baseline_file.read_text()) or {}
    if not isinstance(data, dict):
        raise ValueError(f"{path} must be a mapping")
    return data


def validate_component(entry: Any) -> List[Finding]:
    """Structural checks on one baseline entry, before anything is executed."""
    name = entry.get("id", "<unnamed>") if isinstance(entry, dict) else "<unnamed>"
    findings: List[Finding] = []

    if not isinstance(entry, dict):
        return [
            Finding(
                component=str(name),
                severity="error",
                code="malformed-entry",
                message="component entry is not a mapping",
                remedy=f"Give the entry the fields {', '.join(REQUIRED_COMPONENT_FIELDS)}.",
            )
        ]

    for required in REQUIRED_COMPONENT_FIELDS:
        if entry.get(required) in (None, "", [], {}):
            findings.append(
                Finding(
                    component=str(name),
                    severity="error",
                    code="missing-field",
                    message=f"required field `{required}` is missing or empty",
                    remedy=f"Set `{required}` in {BASELINE_PATH}.",
                )
            )

    baseline = entry.get("baseline")
    tolerance = entry.get("tolerance")
    for block, label in ((baseline, "baseline"), (tolerance, "tolerance")):
        if not isinstance(block, dict):
            continue
        for metric in METRICS:
            if metric not in block:
                findings.append(
                    Finding(
                        component=str(name),
                        severity="error",
                        code=f"missing-{label}-metric",
                        message=f"`{label}.{metric}` is not declared",
                        remedy=f"Declare {label}.{metric} for this component; run --report to measure it.",
                    )
                )
                continue
            value = block[metric]
            if not isinstance(value, (int, float)):
                findings.append(
                    Finding(
                        component=str(name),
                        severity="error",
                        code=f"invalid-{label}-metric",
                        message=f"`{label}.{metric}` is not a number: {value!r}",
                        remedy=f"Set {label}.{metric} to a percentage.",
                    )
                )
                continue
            if label == "baseline" and not 0.0 <= float(value) <= 100.0:
                findings.append(
                    Finding(
                        component=str(name),
                        severity="error",
                        code="baseline-out-of-range",
                        message=f"`baseline.{metric}` is {value}, outside 0-100",
                        remedy="A coverage baseline is a percentage.",
                    )
                )
            if label == "tolerance" and float(value) > MAX_TOLERANCE_POINTS:
                findings.append(
                    Finding(
                        component=str(name),
                        severity="error",
                        code="tolerance-too-wide",
                        message=(
                            f"`tolerance.{metric}` is {value} points, above the "
                            f"{MAX_TOLERANCE_POINTS} point limit"
                        ),
                        remedy=(
                            "A band wide enough to hide a deleted test is not a "
                            "tolerance. Narrow it, or split the component."
                        ),
                    )
                )
            if label == "tolerance" and float(value) < 0:
                findings.append(
                    Finding(
                        component=str(name),
                        severity="error",
                        code="tolerance-negative",
                        message=f"`tolerance.{metric}` is negative: {value}",
                        remedy="Tolerance is a width in percentage points.",
                    )
                )

    return findings


# Node's ways of saying a package could not be resolved. Matched against a
# failed command's output, never used to decide whether to run one: a component
# may legitimately declare dependencies its test command does not import, and
# refusing to run it would trade this misdiagnosis for a worse one.
#
# Split because the error code also appears in the `throw new ERR_MODULE_NOT_FOUND(...)`
# source line Node prints above the message. That line proves the failure kind
# but names no package, so the phrases that do are searched first.
UNRESOLVED_IMPORT_NAMING_MARKERS = (
    "Cannot find package",
    "Cannot find module",
)
UNRESOLVED_IMPORT_CODE_MARKERS = (
    "ERR_MODULE_NOT_FOUND",
    "MODULE_NOT_FOUND",
)
UNRESOLVED_IMPORT_MARKERS = (
    UNRESOLVED_IMPORT_NAMING_MARKERS + UNRESOLVED_IMPORT_CODE_MARKERS
)


def looks_like_unresolved_import(output: str) -> bool:
    """True when a failed command died resolving an import rather than testing."""
    return any(marker in output for marker in UNRESOLVED_IMPORT_MARKERS)


def unresolved_import_line(output: str) -> str:
    """The first line naming the package that could not be resolved.

    Preferred over a generic tail for this finding. When a loader is missing,
    every test file fails too, so the tail is a wall of `'test failed'` that
    reads as a broken suite — the exact impression this diagnosis exists to
    correct. The one line naming the missing package is the whole story.
    """
    lines = [line.strip() for line in output.splitlines() if line.strip()]
    for markers in (UNRESOLVED_IMPORT_NAMING_MARKERS, UNRESOLVED_IMPORT_CODE_MARKERS):
        for line in lines:
            if any(marker in line for marker in markers):
                return line
    return ""


def declares_uninstalled_dependencies(workdir: Path) -> bool:
    """True when a component declares npm dependencies but never installed them.

    Half of the evidence for the `component-dependencies-missing` diagnosis; the
    other half is that the command actually died on an unresolved import. On its
    own this is not enough, and acting on it alone was wrong: `platform/ci`
    declares `@dagger.io/dagger` for its pipeline but tests entirely on the Node
    standard library, so it runs green with no `node_modules` at all. Treating
    the declaration as proof would have failed a healthy component — and, worse,
    would have hidden the real catalog bug its suite was catching.
    """
    manifest_file = workdir / "package.json"
    if not manifest_file.is_file():
        return False
    try:
        manifest = json.loads(manifest_file.read_text())
    except (OSError, ValueError):
        # An unreadable manifest is the command's problem to report, not ours.
        return False
    if not isinstance(manifest, dict):
        return False
    declared = sum(
        len(manifest[block])
        for block in ("dependencies", "devDependencies")
        if isinstance(manifest.get(block), dict)
    )
    if declared == 0:
        return False
    return not (workdir / "node_modules").is_dir()


def without_reporter_arguments(command: Sequence[str]) -> List[str]:
    """The same command with its `--test-reporter*` arguments removed."""
    return [part for part in command if not part.startswith("--test-reporter")]


def diagnostic_rerun(
    command: Sequence[str], workdir: Path, env: Dict[str, str], timeout: int
) -> str:
    """Re-run a failed coverage command with its reporter off, to see why it failed.

    `--test-reporter-destination` sends *everything* to the destination file,
    including the error that killed the run. A component that dies before any
    test executes therefore fails with empty stdout, empty stderr, and a 4-byte
    lcov file, and the audit can only report `coverage command exited 1:` with
    nothing after the colon. That is a true statement containing no information.

    Running it again without the reporter puts the diagnostic back on stderr.
    This only ever happens on a failure that produced no output, so it costs
    nothing on a healthy run and cannot turn a passing component red — the
    result is used solely to word the finding.
    """
    try:
        repeat = subprocess.run(
            without_reporter_arguments(command),
            cwd=workdir,
            env=env,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except (OSError, subprocess.SubprocessError):
        return ""
    return repeat.stderr or repeat.stdout or ""


def failure_excerpt(output: str, limit: int = 8) -> List[str]:
    """The most diagnostic lines of a failed command's output.

    Taking the last N lines loses the cause whenever the runtime prints a stack
    trace: the `Error: ...` line scrolls off and the excerpt is nothing but
    `at ...` frames. Drop the frames first, then take the tail.
    """
    lines = [line.rstrip() for line in output.strip().splitlines() if line.strip()]
    meaningful = [line for line in lines if not line.lstrip().startswith("at ")]
    return (meaningful or lines)[-limit:]


def run_coverage(repo_root: Path, entry: Dict[str, Any]) -> tuple[Optional[Measurement], Optional[Finding]]:
    """Run one component's coverage command and parse the lcov it writes.

    The command is given the destination path in COVERAGE_LCOV_DESTINATION so
    the baseline file never has to hardcode a temp path.
    """
    name = entry["id"]
    workdir = repo_root / entry["path"]
    if not workdir.is_dir():
        return None, Finding(
            component=name,
            severity="error",
            code="missing-component-path",
            message=f"declared path does not exist: {entry['path']}",
            remedy="Correct `path`, or remove the component from the baseline.",
        )

    command = entry["command"]
    if not isinstance(command, list) or not all(isinstance(part, str) for part in command):
        return None, Finding(
            component=name,
            severity="error",
            code="invalid-command",
            message="`command` must be a list of strings",
            remedy="Use an argv list, not a shell string, so nothing is word-split.",
        )

    with tempfile.TemporaryDirectory() as tmpdir:
        destination = Path(tmpdir) / "coverage.lcov"
        env = dict(os.environ)
        env["COVERAGE_LCOV_DESTINATION"] = str(destination)
        # Keep the child from picking up developer git identity or shell rc files.
        env["GIT_CONFIG_GLOBAL"] = os.devnull
        resolved = [part.replace("$COVERAGE_LCOV_DESTINATION", str(destination)) for part in command]

        try:
            completed = subprocess.run(
                resolved,
                cwd=workdir,
                env=env,
                capture_output=True,
                text=True,
                timeout=entry.get("timeout_seconds", 900),
            )
        except FileNotFoundError as exc:
            return None, Finding(
                component=name,
                severity="error",
                code="coverage-tool-missing",
                message=f"coverage command could not be executed: {exc}",
                remedy=(
                    "Install the component's coverage tooling. A missing tool is a "
                    "failure, never a skip."
                ),
            )
        except subprocess.TimeoutExpired:
            return None, Finding(
                component=name,
                severity="error",
                code="coverage-timeout",
                message="coverage command timed out",
                remedy="Raise `timeout_seconds`, or make the suite finish.",
            )

        if completed.returncode != 0:
            output = completed.stderr or completed.stdout or ""
            if not failure_excerpt(output):
                # The reporter ate the reason. Ask again without it.
                output = diagnostic_rerun(
                    resolved, workdir, env, entry.get("timeout_seconds", 900)
                ) or output
            tail = failure_excerpt(output)
            # Both outcomes fail closed. They differ only in which repair they
            # send the reader to, and sending them to the wrong one costs a
            # search for a broken test that was never broken.
            if looks_like_unresolved_import(output) and declares_uninstalled_dependencies(workdir):
                return None, Finding(
                    component=name,
                    severity="error",
                    code="component-dependencies-missing",
                    message=(
                        f"{entry['path']} declares npm dependencies but has no "
                        "node_modules, and the coverage command died resolving an "
                        "import: " + unresolved_import_line(output)
                    ),
                    remedy=(
                        "Install the component's dependencies (npm ci) and re-run. "
                        "This is an uninstalled component, not a failing test suite."
                    ),
                )
            return None, Finding(
                component=name,
                severity="error",
                code="coverage-command-failed",
                message=(
                    f"coverage command exited {completed.returncode}: "
                    + " | ".join(tail)
                ),
                remedy="A failing suite has no meaningful coverage. Fix the suite first.",
            )

        if not destination.is_file():
            return None, Finding(
                component=name,
                severity="error",
                code="missing-lcov",
                message="coverage command wrote no lcov report",
                remedy=(
                    "Point the reporter at $COVERAGE_LCOV_DESTINATION so the audit "
                    "measures the run it just performed."
                ),
            )

        measurement = parse_lcov(destination.read_text())

    if measurement.lines_found == 0:
        return None, Finding(
            component=name,
            severity="error",
            code="empty-coverage-report",
            message="lcov report contains no measurable lines",
            remedy=(
                "An empty report is indistinguishable from perfect coverage. Check "
                "that the reporter observed the source files."
            ),
        )

    return measurement, None


def compare(entry: Dict[str, Any], measured: Measurement) -> List[Finding]:
    """Two-directional comparison of one measurement against its baseline."""
    name = entry["id"]
    baseline = entry["baseline"]
    tolerance = entry["tolerance"]
    findings: List[Finding] = []

    for metric in METRICS:
        actual = measured.percent(metric)
        declared = float(baseline[metric])
        band = float(tolerance[metric])

        if actual < declared - band:
            findings.append(
                Finding(
                    component=name,
                    severity="error",
                    code="coverage-regressed",
                    message=(
                        f"{metric} coverage is {actual:.2f}%, below the "
                        f"{declared:.2f}% baseline (tolerance {band} pt)"
                    ),
                    remedy=(
                        "Cover the code you changed. Lowering the baseline needs the "
                        "same review as any other reduction in a control."
                    ),
                )
            )
        elif actual > declared + band:
            findings.append(
                Finding(
                    component=name,
                    severity="error",
                    code="baseline-stale",
                    message=(
                        f"{metric} coverage is {actual:.2f}%, above the "
                        f"{declared:.2f}% baseline (tolerance {band} pt)"
                    ),
                    remedy=(
                        f"Raise baseline.{metric} to {actual:.2f} in {BASELINE_PATH}. "
                        "A floor that trails reality ratchets nothing."
                    ),
                )
            )

    return findings


def audit(
    repo_root: Path,
    baseline_path: str = BASELINE_PATH,
    only: Optional[str] = None,
    measure: bool = True,
) -> tuple[List[Finding], Dict[str, Measurement]]:
    """Validate the baseline file and, when `measure`, run every component."""
    data = load_baseline(repo_root, baseline_path)
    components = data.get("components")
    findings: List[Finding] = []
    measurements: Dict[str, Measurement] = {}

    if not isinstance(components, list) or not components:
        findings.append(
            Finding(
                component="<baseline>",
                severity="error",
                code="no-components",
                message=f"{baseline_path} declares no components",
                remedy="A ratchet over nothing is not a control. Declare at least one component.",
            )
        )
        return findings, measurements

    seen: Dict[str, int] = {}
    for entry in components:
        structural = validate_component(entry)
        findings.extend(structural)
        if structural:
            continue

        name = entry["id"]
        seen[name] = seen.get(name, 0) + 1
        if seen[name] > 1:
            findings.append(
                Finding(
                    component=name,
                    severity="error",
                    code="duplicate-component",
                    message="component id is declared more than once",
                    remedy="Component ids are the audit's primary key; make them unique.",
                )
            )
            continue

        if only is not None and name != only:
            continue
        if not measure:
            continue

        measured, failure = run_coverage(repo_root, entry)
        if failure is not None:
            findings.append(failure)
            continue
        assert measured is not None
        measurements[name] = measured
        findings.extend(compare(entry, measured))

    if only is not None and only not in seen:
        findings.append(
            Finding(
                component=only,
                severity="error",
                code="unknown-component",
                message=f"no component with id {only!r} in {baseline_path}",
                remedy="Check the id, or declare the component.",
            )
        )

    return findings, measurements


def repo_root_from(start: Path) -> Path:
    return Path(start).resolve().parents[2]


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1] if __doc__ else None)
    parser.add_argument("--report", action="store_true", help="measure and print, always exit 0")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    parser.add_argument("--component", help="restrict to one component id")
    parser.add_argument("--baseline", default=BASELINE_PATH, help="path to the baseline file")
    parser.add_argument(
        "--no-measure",
        action="store_true",
        help="validate the baseline file's structure without running any suite",
    )
    args = parser.parse_args(argv)

    repo_root = repo_root_from(Path(__file__))
    try:
        findings, measurements = audit(
            repo_root,
            baseline_path=args.baseline,
            only=args.component,
            measure=not args.no_measure,
        )
    except (FileNotFoundError, ValueError) as exc:
        print(f"ERROR {exc}", file=sys.stderr)
        return 1

    if args.json:
        print(
            json.dumps(
                {
                    "findings": [asdict(f) for f in findings],
                    "measurements": {
                        name: {**asdict(m), "percentages": m.percentages()}
                        for name, m in measurements.items()
                    },
                },
                indent=2,
                sort_keys=True,
            )
        )
    else:
        for name, measurement in sorted(measurements.items()):
            percentages = measurement.percentages()
            print(
                f"{name}: "
                + ", ".join(f"{metric} {percentages[metric]:.2f}%" for metric in METRICS)
                + f"  ({measurement.files} files, {measurement.lines_found} lines)"
            )
        for finding in findings:
            print(finding.format(), file=sys.stderr)

    errors = [f for f in findings if f.severity == "error"]
    if args.report:
        return 0
    if errors:
        print(
            f"\ncoverage ratchet: {len(errors)} error(s). See {BASELINE_PATH}.",
            file=sys.stderr,
        )
        return 1
    print("coverage ratchet: every component matches its declared baseline.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
