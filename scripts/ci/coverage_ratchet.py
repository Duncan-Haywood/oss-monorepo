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

Each component also declares the *basis* of its measurement — how many files and
lines the report covered — and that is checked alongside the percentages. A
percentage is a ratio, and comparing ratios cannot detect a moved denominator:
a floor raised on a report that had quietly started counting the component's own
test files as covered source looks exactly like a floor raised on better tests.
See `compare_basis` for the instance that produced this check.

Deliberately fails closed. A component declared in the baseline whose coverage
command fails, produces no lcov, or reports zero total lines is a failure, not
a skip. That is the specific way the repository's other gates have been found
to lie: a missing tool reported PASSED for work it never did.

Since 2026-08-05 it also audits *enrollment*, which is the larger half. All of
the above holds the components that are in the baseline file; nothing held the
ones that were not, and the file declared two components of which one is in
`VENTURE_CATALOG`. Fifteen of the sixteen catalog components had no coverage
floor at all, so deleting every test in them turned no gate red. See the
"Enrollment contract" section below: every catalog component must have a
measured floor or an entry in `UNMEASURED_COMPONENTS` naming a predicate that
re-derives the reason from the tree, and a component that is neither fails.

Usage:
    python3 scripts/ci/coverage_ratchet.py              # audit, exit 1 on failure
    python3 scripts/ci/coverage_ratchet.py --report     # measure, always exit 0
    python3 scripts/ci/coverage_ratchet.py --json       # machine-readable
    python3 scripts/ci/coverage_ratchet.py --component print-atelier
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass, asdict, field
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Tuple

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
    "sources",
    "baseline",
    "measured",
    "tolerance",
)

# A tolerance wide enough to hide a deleted test file is not a tolerance. Two
# percentage points is roughly one small module in the components measured here.
MAX_TOLERANCE_POINTS = 2.0

# The two halves of the measurement basis: how many files the report covered and
# how many lines they held. A percentage is a ratio, and this file only ever
# checked the ratio — so a component could change *what it measured* without
# moving the number enough to notice.
BASIS_FIELDS = ("files", "lines")

# How far the basis may move before it needs a deliberate update, as a percentage
# of the declared figure. Source files are added and deleted routinely, so an
# exact match would make this unmaintainable; a 4x change in the measured set is
# not routine, and that is what this catches. Deliberately proportional and not
# floored at ±1 file: a one-file component is pinned exactly, which is correct,
# because the only way its file count moves is a change to what is being scoped.
DEFAULT_BASIS_DRIFT_PERCENT = 10.0

# A drift band wide enough to hide the whole test suite being counted as source
# is not a band. Caps the per-component override the same way MAX_TOLERANCE_POINTS
# caps `tolerance`.
MAX_BASIS_DRIFT_PERCENT = 25.0


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
    # Paths the report actually observed with at least one covered line, and
    # the declared source files absent from that set. See `unexercised`.
    exercised: set = field(default_factory=set)
    unexercised: List[str] = field(default_factory=list)
    declared_files: int = 0

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


def parse_lcov(
    text: str,
    allowed_files: Optional[set[str]] = None,
    workdir: Optional[Path] = None,
) -> Measurement:
    """Sum the per-file summary records of an lcov report.

    lcov emits LF/LH (lines found/hit), FNF/FNH (functions) and BRF/BRH
    (branches) once per source file. Only those totals are read; the per-line
    DA/BRDA records are what produce them and are not needed here.
    """
    totals = Measurement()
    current: Optional[str] = None
    is_allowed: bool = True
    for raw in text.splitlines():
        line = raw.strip()
        if not line or ":" not in line:
            if line == "end_of_record":
                current = None
                is_allowed = True
            continue
        key, _, value = line.partition(":")
        if key == "SF":
            raw_path = value.strip()
            if raw_path.startswith("file://"):
                raw_path = raw_path[7:]
            if workdir is not None and os.path.isabs(raw_path):
                try:
                    rel_path = Path(raw_path).relative_to(workdir).as_posix()
                except ValueError:
                    rel_path = raw_path
            else:
                rel_path = raw_path.lstrip("./")

            current = rel_path
            if allowed_files is not None:
                is_allowed = current in allowed_files
            else:
                is_allowed = True
            if is_allowed:
                totals.files += 1
            continue
        if not is_allowed:
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
            if count > 0 and current is not None:
                totals.exercised.add(current)
        elif key == "FNF":
            totals.functions_found += count
        elif key == "FNH":
            totals.functions_hit += count
        elif key == "BRF":
            totals.branches_found += count
        elif key == "BRH":
            totals.branches_hit += count
    return totals


def enumerate_sources(repo_root: Path, entry: Dict[str, Any]) -> List[str]:
    """Every source file the component declares, relative to the component root.

    This is the denominator coverage tools do not give you. lcov reports only
    the files some test loaded, so a module nobody imports is simply absent —
    and deleting its last test *raises* the reported percentage, because the
    file leaves the denominator along with its uncovered lines. Enumerating the
    declared sources independently is what makes that visible.
    """
    workdir = repo_root / entry["path"]
    excludes = entry.get("exclude") or []
    found: set = set()
    for pattern in entry.get("sources") or []:
        for path in workdir.glob(pattern):
            if not path.is_file():
                continue
            relative = path.relative_to(workdir).as_posix()
            if any(fnmatch.fnmatch(relative, exclude) for exclude in excludes):
                continue
            found.add(relative)
    return sorted(found)


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

    # `unexercised` is the primary control, so a component may not omit it and
    # be graded on percentages alone.
    if isinstance(baseline, dict):
        declared = baseline.get("unexercised")
        if declared is None:
            findings.append(
                Finding(
                    component=str(name),
                    severity="error",
                    code="missing-unexercised-baseline",
                    message="`baseline.unexercised` is not declared",
                    remedy=(
                        "Record how many declared source files no test loads. A "
                        "percentage floor alone cannot see them; run --report."
                    ),
                )
            )
        elif not isinstance(declared, int) or isinstance(declared, bool) or declared < 0:
            findings.append(
                Finding(
                    component=str(name),
                    severity="error",
                    code="invalid-unexercised-baseline",
                    message=f"`baseline.unexercised` must be a non-negative integer: {declared!r}",
                    remedy="It is an exact file count, like `count` in the exception register.",
                )
            )

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

    findings.extend(_validate_measured(name, entry.get("measured")))

    return findings


def _validate_measured(name: Any, measured: Any) -> List[Finding]:
    """Structural checks on one entry's declared measurement basis."""
    findings: List[Finding] = []
    if measured is None:
        # Absence is already reported as `missing-field`; do not say it twice.
        return findings

    if not isinstance(measured, dict):
        return [
            Finding(
                component=str(name),
                severity="error",
                code="invalid-measured-basis",
                message=f"`measured` is not a mapping: {measured!r}",
                remedy=(
                    "Declare `measured.files` and `measured.lines` — the size of the "
                    "report the baseline percentages were taken from."
                ),
            )
        ]

    for field_name in BASIS_FIELDS:
        if field_name not in measured:
            findings.append(
                Finding(
                    component=str(name),
                    severity="error",
                    code="missing-measured-field",
                    message=f"`measured.{field_name}` is not declared",
                    remedy=(
                        f"Run --report and record the {field_name} figure it prints. "
                        "A percentage with no declared denominator cannot be audited."
                    ),
                )
            )
            continue
        value = measured[field_name]
        if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
            findings.append(
                Finding(
                    component=str(name),
                    severity="error",
                    code="invalid-measured-field",
                    message=f"`measured.{field_name}` is not a positive integer: {value!r}",
                    remedy=f"`measured.{field_name}` is a count taken from the lcov report.",
                )
            )

    drift = measured.get("drift_percent", DEFAULT_BASIS_DRIFT_PERCENT)
    if not isinstance(drift, (int, float)) or isinstance(drift, bool):
        findings.append(
            Finding(
                component=str(name),
                severity="error",
                code="invalid-basis-drift",
                message=f"`measured.drift_percent` is not a number: {drift!r}",
                remedy="Drift is a width in percent of the declared basis.",
            )
        )
    elif float(drift) < 0:
        findings.append(
            Finding(
                component=str(name),
                severity="error",
                code="invalid-basis-drift",
                message=f"`measured.drift_percent` is negative: {drift}",
                remedy="Drift is a width in percent of the declared basis.",
            )
        )
    elif float(drift) > MAX_BASIS_DRIFT_PERCENT:
        findings.append(
            Finding(
                component=str(name),
                severity="error",
                code="basis-drift-too-wide",
                message=(
                    f"`measured.drift_percent` is {drift}%, above the "
                    f"{MAX_BASIS_DRIFT_PERCENT}% limit"
                ),
                remedy=(
                    "A band this wide stops the basis being a check at all. Narrow it, "
                    "or split the component."
                ),
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


def uncommitted_component_paths(
    repo_root: Path, component_path: str, limit: int = 6
) -> List[str]:
    """Paths under a component that differ from HEAD, as `git status` sees them.

    Evidence for the `coverage-measured-dirty-tree` diagnosis. Measured *before*
    the coverage command runs, never after: the run itself creates
    `coverage/.tmp` and an lcov file, and reporting our own artifacts back as
    "someone's work in progress" would make the diagnosis fire on every failure,
    which is the same as it never firing.

    A dirty tree does not make a failure untrue — the suite may be broken at
    HEAD too — so this never changes a verdict, only which repair the reader is
    sent to first. In CI the checkout is clean, nothing is listed, and the
    wording is exactly what it was.

    Fails soft, deliberately, and this is the one place in this file where that
    is right. Everywhere else a missing input is a failure because the gate
    would otherwise pass work it never checked. Here the gate has already
    failed; no git, no repository, or a git that errors means only that we
    cannot describe the tree, and the generic diagnosis below is still true.
    Raising would convert a reportable failure into a crash.
    """
    env = {**os.environ, "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_CONFIG_NOSYSTEM": "1", "XDG_CONFIG_HOME": "/dev/null"}
    try:
        completed = subprocess.run(
            ["git", "-C", str(repo_root), "status", "--porcelain", "--", component_path],
            capture_output=True,
            text=True,
            env=env,
            timeout=30,
        )
    except (OSError, subprocess.SubprocessError):
        return []
    if completed.returncode != 0:
        return []
    changed: List[str] = []
    for line in completed.stdout.splitlines():
        entry = line[3:].strip()
        if not entry:
            continue
        # Renames are reported as `old -> new`; the new name is the live one.
        _, _, renamed = entry.partition(" -> ")
        changed.append((renamed or entry).strip('"'))
    return changed[:limit]


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

    # Before anything runs, so the command's own artifacts are not mistaken for
    # a human's uncommitted work. Used only if the command then fails.
    uncommitted = uncommitted_component_paths(repo_root, entry["path"])

    with tempfile.TemporaryDirectory() as tmpdir:
        destination = Path(tmpdir) / "coverage.lcov"
        env = dict(os.environ)
        env["COVERAGE_LCOV_DESTINATION"] = str(destination)
        env["COVERAGE_LCOV_DESTINATION_DIR"] = str(tmpdir)
        # Keep the child from picking up developer git identity or shell rc files.
        env["GIT_CONFIG_GLOBAL"] = os.devnull
        env["GIT_CONFIG_NOSYSTEM"] = "1"
        env["XDG_CONFIG_HOME"] = os.devnull
        tmp_cov_dir = workdir / "coverage" / ".tmp"
        if tmp_cov_dir.exists():
            shutil.rmtree(tmp_cov_dir, ignore_errors=True)
        tmp_cov_dir.mkdir(parents=True, exist_ok=True)
        resolved = [
            part.replace("$COVERAGE_LCOV_DESTINATION_DIR", str(tmpdir)).replace(
                "$COVERAGE_LCOV_DESTINATION", str(destination)
            )
            for part in command
        ]

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
            if uncommitted:
                return None, Finding(
                    component=name,
                    severity="error",
                    code="coverage-measured-dirty-tree",
                    message=(
                        f"coverage command exited {completed.returncode} while "
                        f"{entry['path']} held uncommitted changes ("
                        + ", ".join(uncommitted)
                        + "), so this may not be a failure at HEAD: "
                        + " | ".join(tail)
                    ),
                    remedy=(
                        "Re-run against a clean checkout of this component before "
                        "treating it as a broken suite. Still failing there means the "
                        "suite is the bug; passing there means the gate measured "
                        "work in progress."
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
            fallback_lcov = Path(tmpdir) / "lcov.info"
            if fallback_lcov.is_file():
                destination = fallback_lcov

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

        lcov_text = destination.read_text()

    declared = enumerate_sources(repo_root, entry)
    declared_set = set(declared) if declared else None
    measurement = parse_lcov(lcov_text, allowed_files=declared_set, workdir=workdir)
    measurement.declared_files = len(declared)
    measurement.unexercised = [path for path in declared if path not in measurement.exercised]

    if declared and not measurement.exercised:
        return None, Finding(
            component=name,
            severity="error",
            code="no-source-matched",
            message=(
                f"{len(declared)} declared source file(s), none of which appear "
                "covered in the report"
            ),
            remedy=(
                "The `sources` globs and the paths lcov reports must agree. Check "
                "that both are relative to the component root."
            ),
        )

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


def compare_basis(entry: Dict[str, Any], measured: Measurement) -> List[Finding]:
    """Check the measurement was taken over the surface the baseline declares.

    This exists because of a specific failure. On 2026-08-02 `platform-ci`'s floor
    was raised from 52.11% to 87.60% and `print-atelier`'s from 91.70% to 94.07%,
    both recorded in good faith as "measured". Neither number was the coverage of
    the code: Node 22 counted the components' own test files as covered source,
    and test files execute themselves, so 2631 lines of near-total coverage were
    averaging with 805 lines of real coverage. Node 24 changed the default and
    stopped counting them, so the same commit passed in CI and failed on a laptop.

    Every percentage check in this file compares a ratio, and a ratio cannot see
    this: the denominator changed. The comment beside the baseline recorded the
    right evidence — "13 files / 3436 lines" — but it was prose, so nothing
    compared it to the 1 file / 805 lines the gate actually measured.

    The inverse case is the more dangerous one and this catches it too. If half a
    component's source silently stops being measured, coverage *rises*, and the
    two-directional check reports `baseline-stale` — inviting someone to ratchet
    the floor up over a shrinking surface.
    """
    name = entry["id"]
    declared = entry["measured"]
    band = float(declared.get("drift_percent", DEFAULT_BASIS_DRIFT_PERCENT))
    findings: List[Finding] = []

    actuals = {"files": measured.files, "lines": measured.lines_found}
    for field_name in BASIS_FIELDS:
        expected = int(declared[field_name])
        actual = actuals[field_name]
        allowed = expected * band / 100.0
        if abs(actual - expected) <= allowed:
            continue
        direction = "more" if actual > expected else "fewer"
        findings.append(
            Finding(
                component=name,
                severity="error",
                code="measurement-basis-drift",
                message=(
                    f"the report covered {actual} {field_name}, {direction} than the "
                    f"{expected} the baseline was measured over (drift band {band}%)"
                ),
                remedy=(
                    "The percentages above are ratios over this figure, so a moved "
                    "denominator makes them incomparable. Check what the command "
                    "scoped and which runner ran it before touching any baseline; if "
                    f"the surface genuinely changed, update `measured.{field_name}` "
                    f"to {actual} in the same reviewed commit as the new percentages."
                ),
            )
        )

    return findings


def compare(entry: Dict[str, Any], measured: Measurement) -> List[Finding]:
    """Two-directional comparison of one measurement against its baseline."""
    name = entry["id"]
    baseline = entry["baseline"]
    tolerance = entry["tolerance"]
    findings: List[Finding] = compare_basis(entry, measured)

    # The primary control, and the only one that is an exact integer. A
    # percentage floor alone cannot catch a whole module going untested,
    # because an unexercised file leaves the denominator and the average goes
    # *up*. This counts the files no test loads, and it has no tolerance for
    # the same reason `count` in the exception register has none.
    if "unexercised" in baseline:
        declared_count = int(baseline["unexercised"])
        actual_count = len(measured.unexercised)
        if actual_count > declared_count:
            new = ", ".join(measured.unexercised[:5])
            findings.append(
                Finding(
                    component=name,
                    severity="error",
                    code="unexercised-grew",
                    message=(
                        f"{actual_count} of {measured.declared_files} source files are "
                        f"exercised by no test, above the {declared_count} recorded"
                    ),
                    remedy=(
                        f"Cover the files no test loads (e.g. {new}). Note that the "
                        "line percentage will not catch this — an untested file is "
                        "absent from it entirely."
                    ),
                )
            )
        elif actual_count < declared_count:
            findings.append(
                Finding(
                    component=name,
                    severity="error",
                    code="unexercised-stale",
                    message=(
                        f"{actual_count} of {measured.declared_files} source files are "
                        f"exercised by no test, below the {declared_count} recorded"
                    ),
                    remedy=(
                        f"Lower baseline.unexercised to {actual_count} in {BASELINE_PATH}. "
                        "The ratchet only turns one way."
                    ),
                )
            )

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


# ---------------------------------------------------------------------------
# Enrollment contract
#
# Everything above holds the components that are *in* the baseline file. Until
# 2026-08-05 nothing held the ones that were not, and that was the larger hole:
# the file declared two components, and only one of them — `print-atelier` — is
# in `VENTURE_CATALOG`. Fifteen of the sixteen catalog components had no
# coverage floor, so deleting every test in `local-site-studio`,
# `quick-pick-survey` or `ai-first-markets` turned no gate red. A ratchet that
# covers a sixth of the catalog reports PASS for the five sixths it never looked
# at, which is the same shape as the grep for a sentence about the 90% floor
# that this whole control replaced.
#
# The contract is the one `scripts/ci/cap_ratchet.py` already uses for declared
# budgets, transposed: every candidate is either watched or registered as exempt
# with a reason, and a new unwatched candidate is a failure. Here the candidates
# come from the catalog CI verifies, the watch is a baseline entry, and the
# register is `UNMEASURED_COMPONENTS` below.
#
# Two things this deliberately refuses:
#
#   * A blanket exemption. No wildcards, no "all Python components", no
#     directory. Each entry names one catalog id, because a region-shaped
#     exemption is a region in which "every component has a floor" may quietly
#     be untrue while every count stays green.
#   * An exemption whose reason is only prose. Prose in this repository's
#     registers has gone false while nothing noticed, so each entry names a
#     `predicate` — a function below that re-derives the reason from the tree
#     today. When the blocker is cleared, the predicate stops holding and this
#     gate goes red until the component is measured and enrolled.
# ---------------------------------------------------------------------------

# The component catalog CI actually verifies. Deliberately this file rather than
# a list retyped here: a registry the contract keeps its own copy of drifts from
# the one that runs, and then the contract is complete over a catalog nobody
# uses.
CATALOG_PATH = "platform/ci/src/pipeline.mjs"
CATALOG_SYMBOL = "VENTURE_CATALOG"

# Runner types with no lcov in reach. Swift emits llvm profdata and terraform
# has no notion of test coverage at all; both would need a conversion step this
# audit does not have. Read from the catalog's own `type`, so re-typing a
# component is what clears the exemption, not editing the register.
NON_LCOV_RUNNER_TYPES = frozenset({"swift", "terraform"})

# Substrings that mean a package's `test` script runs under something that can
# emit coverage. Matched against the declared script, because the ratchet runs
# a command over the suite the component declares — a suite of self-executing
# files chained with `&&` has no single run to measure.
COVERAGE_CAPABLE_RUNNER_MARKERS = (
    "node --test",
    "--experimental-test-coverage",
    "vitest",
    "jest",
    "c8 ",
    "nyc ",
)

# A Python coverage provider, as a requirement line would name it.
PYTHON_COVERAGE_DISTRIBUTIONS = ("pytest-cov", "coverage")

# Where a Python dependency is declared in this repository. Both halves of the
# union that `tests/test_cap_ratchet.py` uses for budget files: a requirement
# added and not yet committed still clears the blocker.
PYTHON_REQUIREMENT_FILENAMES = ("requirements.txt", "pyproject.toml", "setup.cfg")
PYTHON_REQUIREMENT_GLOBS = ("requirements*.txt", "pyproject.toml", "setup.cfg")

# Directories never worth walking for a requirement file.
UNWALKED_DIRECTORY_NAMES = frozenset(
    {".git", "node_modules", ".next", "dist", "build", ".venv", "venv", "__pycache__"}
)


class EnrollmentError(Exception):
    """The candidate set could not be established. Never reported as a pass."""


@dataclass(frozen=True)
class CatalogComponent:
    """One entry of `VENTURE_CATALOG`, read statically."""

    id: str
    dir: str
    type: str
    package_dir: Optional[str] = None

    @property
    def root(self) -> str:
        """Where the component's manifest lives, which is not always `dir`."""
        return self.package_dir or self.dir


_LINE_COMMENT = re.compile(r"(?<!:)//")


def _strip_line_comments(source: str) -> str:
    """Drop `//` comments, before anything counts brackets.

    Applied first rather than to the extracted literal, because the bracket
    walk that finds the literal is itself what a comment can derail: the live
    catalog carries `['build']` and `['test']` in its prose, and one unbalanced
    `]` in a sentence would end the array early and silently shorten the
    candidate set. A shorter candidate set is a quieter gate, which is the one
    failure mode this contract cannot afford.

    `(?<!:)` keeps `https://` in a string from being read as a comment.
    """
    return "\n".join(_LINE_COMMENT.split(line, 1)[0] for line in source.splitlines())


def _catalog_literal(source: str) -> str:
    start = source.find(f"const {CATALOG_SYMBOL}")
    if start < 0:
        raise EnrollmentError(
            f"{CATALOG_PATH} declares no {CATALOG_SYMBOL}; the candidate set for the "
            "coverage enrollment contract cannot be established"
        )
    opening = source.find("[", start)
    if opening < 0:
        raise EnrollmentError(f"{CATALOG_SYMBOL} in {CATALOG_PATH} is not an array literal")
    depth = 0
    for index in range(opening, len(source)):
        char = source[index]
        if char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                return source[opening : index + 1]
    raise EnrollmentError(f"{CATALOG_SYMBOL} in {CATALOG_PATH} has no closing bracket")


_CATALOG_FIELD = re.compile(r"^\s*(id|dir|type|packageDir):\s*'([^']*)'", re.M)


def parse_catalog(source: str) -> List[CatalogComponent]:
    """Every component `VENTURE_CATALOG` declares.

    Static text, never an import: the catalog lives in a Node module, and
    executing a file to find out what it claims lets the file decide whether it
    is audited.

    Raises rather than returning `[]`. An empty candidate set is the vacuous
    case this contract is most exposed to — a glob or a parse that matches
    nothing exits 0 and looks exactly like a gate that passed.
    """
    literal = _catalog_literal(_strip_line_comments(source))
    chunks = re.split(r"\n[ \t]{2}\{", literal)[1:]
    components: List[CatalogComponent] = []
    for chunk in chunks:
        fields: Dict[str, str] = {}
        for name, value in _CATALOG_FIELD.findall(chunk):
            fields.setdefault(name, value)
        missing = [key for key in ("id", "dir", "type") if key not in fields]
        if missing:
            raise EnrollmentError(
                f"a {CATALOG_SYMBOL} entry is missing {', '.join(missing)}; the enrollment "
                f"contract cannot tell what it is. Entry began: {chunk.strip()[:60]!r}"
            )
        components.append(
            CatalogComponent(
                id=fields["id"],
                dir=fields["dir"],
                type=fields["type"],
                package_dir=fields.get("packageDir"),
            )
        )
    if not components:
        raise EnrollmentError(
            f"{CATALOG_SYMBOL} in {CATALOG_PATH} parsed to zero components. A contract over "
            "an empty candidate set passes by construction; fix the parse rather than the "
            "expectation."
        )
    return components


def load_catalog(repo_root: Path, path: str = CATALOG_PATH) -> List[CatalogComponent]:
    catalog_file = Path(repo_root) / path
    if not catalog_file.is_file():
        raise EnrollmentError(f"component catalog not found: {path}")
    return parse_catalog(catalog_file.read_text(encoding="utf-8"))


@dataclass(frozen=True)
class EnrollmentExemption:
    """One catalog component deliberately left without a coverage floor.

    Earned one component at a time, and never for a directory or a runner
    family. Four fields, three of which a test reads:

      * `component` — exactly one catalog id.
      * `predicate` — the name of a function in `ENROLLMENT_PREDICATES`. It is
        re-evaluated against the tree on every run, and the moment it stops
        holding this gate goes red. That is what stops the reason below from
        silently going false, which is the failure mode every prose-only
        register in this repository has already had.
      * `blocker` — the specific thing that has to change for the component to
        be measurable. Named so the exemption reads as work, not as a verdict.
      * `why` — the argument. Prose, and checked only for being long enough to
        be one; the predicate is what carries the claim.
    """

    component: str
    predicate: str
    blocker: str
    why: str


def _python_coverage_declarations(repo_root: Path) -> List[str]:
    """Files in this repository that declare a Python coverage provider.

    The blocker for every Python component: `requirements-ci.txt` is what CI
    installs, and it lists `pytest` and `PyYAML` and nothing else, so no runner
    that executes these gates can produce a coverage report. Measuring one on a
    laptop that happens to have `coverage` installed and writing the number into
    the baseline would produce a floor CI fails closed on for want of a tool.
    """
    pattern = re.compile(
        r"^\s*[\"']?(" + "|".join(re.escape(name) for name in PYTHON_COVERAGE_DISTRIBUTIONS) + r")"
        r"(\[[^\]]*\])?\s*(==|>=|<=|~=|!=|>|<|[\"']|,|$)",
        re.M,
    )
    found: List[str] = []
    for path in _walk_requirement_files(repo_root):
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        if pattern.search(text):
            found.append(path.relative_to(repo_root).as_posix())
    return sorted(found)


def _walk_requirement_files(repo_root: Path) -> Iterable[Path]:
    for current, directories, filenames in os.walk(repo_root):
        directories[:] = [d for d in directories if d not in UNWALKED_DIRECTORY_NAMES]
        for filename in filenames:
            if filename in PYTHON_REQUIREMENT_FILENAMES or (
                filename.startswith("requirements") and filename.endswith(".txt")
            ):
                yield Path(current) / filename


def _predicate_python_coverage_provider_undeclared(
    repo_root: Path, component: CatalogComponent
) -> Optional[str]:
    if component.type != "python":
        return (
            f"the catalog now declares this component as `{component.type}`, not `python`, so "
            "the Python-tooling argument for the exemption no longer describes it"
        )
    declared = _python_coverage_declarations(repo_root)
    if declared:
        return (
            "a Python coverage provider is now declared in "
            + ", ".join(declared)
            + " — the blocker is cleared, so measure this component and give it a floor"
        )
    return None


def _predicate_runner_outside_lcov_toolchain(
    repo_root: Path, component: CatalogComponent
) -> Optional[str]:
    if component.type not in NON_LCOV_RUNNER_TYPES:
        return (
            f"the catalog now declares this component as `{component.type}`, which is a runner "
            "this audit can measure; enroll it"
        )
    return None


def _component_test_script(repo_root: Path, component: CatalogComponent) -> Optional[str]:
    manifest = Path(repo_root) / component.root / "package.json"
    if not manifest.is_file():
        return None
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    scripts = data.get("scripts")
    if not isinstance(scripts, dict):
        return None
    script = scripts.get("test")
    return script if isinstance(script, str) else None


def _predicate_no_coverage_capable_runner(
    repo_root: Path, component: CatalogComponent
) -> Optional[str]:
    script = _component_test_script(repo_root, component)
    if script is None:
        return (
            f"{component.root}/package.json no longer declares a `test` script this audit can "
            "read, so the reason for the exemption can no longer be checked. Fails closed "
            "rather than standing on an unverifiable claim"
        )
    hits = [marker for marker in COVERAGE_CAPABLE_RUNNER_MARKERS if marker in script]
    if hits:
        return (
            "its `test` script now runs under "
            + ", ".join(repr(hit.strip()) for hit in hits)
            + ", which emits coverage; measure this component and give it a floor"
        )
    return None


def _predicate_pnpm_workspace_needs_merged_report(
    repo_root: Path, component: CatalogComponent
) -> Optional[str]:
    workspace = Path(repo_root) / component.root / "pnpm-workspace.yaml"
    if not workspace.is_file():
        return (
            f"{component.root}/pnpm-workspace.yaml is gone, so this is no longer the "
            "multi-package workspace the exemption describes"
        )
    try:
        data = yaml.safe_load(workspace.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as exc:
        return f"{component.root}/pnpm-workspace.yaml does not parse ({exc}); fails closed"
    patterns = data.get("packages") if isinstance(data, dict) else None
    if not isinstance(patterns, list) or not patterns:
        return f"{component.root}/pnpm-workspace.yaml declares no packages; fails closed"
    packages = set()
    for pattern in patterns:
        if not isinstance(pattern, str):
            continue
        for candidate in (Path(repo_root) / component.root).glob(pattern):
            if (candidate / "package.json").is_file():
                packages.add(candidate.resolve())
    if len(packages) <= 1:
        return (
            f"the workspace now resolves to {len(packages)} package(s), so there is no longer a "
            "set of per-package reports to merge; measure it and give it a floor"
        )
    return None


def _predicate_source_executed_through_vm(
    repo_root: Path, component: CatalogComponent
) -> Optional[str]:
    """The suite runs its source inside `node:vm`, where V8 coverage cannot see it.

    Checked rather than asserted because it is the whole reason: a report that
    attributes nothing to the source file is indistinguishable from a component
    with no source, and `empty-coverage-report` would be the only thing the
    ratchet could say about it.
    """
    root = Path(repo_root) / component.root
    suite = sorted(
        path
        for path in root.rglob("*.mjs")
        if not any(part in UNWALKED_DIRECTORY_NAMES for part in path.parts)
    )
    if not suite:
        return f"{component.root} holds no .mjs suite files, so this claim cannot be checked"
    for path in suite:
        try:
            if "node:vm" in path.read_text(encoding="utf-8"):
                return None
        except OSError:
            continue
    return (
        f"no file under {component.root} loads its source through `node:vm` any more, so V8 "
        "coverage can attribute the source; measure this component and give it a floor"
    )


ENROLLMENT_PREDICATES: Dict[str, Callable[[Path, CatalogComponent], Optional[str]]] = {
    "python-coverage-provider-undeclared": _predicate_python_coverage_provider_undeclared,
    "runner-outside-lcov-toolchain": _predicate_runner_outside_lcov_toolchain,
    "no-coverage-capable-runner": _predicate_no_coverage_capable_runner,
    "pnpm-workspace-needs-merged-report": _predicate_pnpm_workspace_needs_merged_report,
    "source-executed-through-vm": _predicate_source_executed_through_vm,
}


UNMEASURED_COMPONENTS: Tuple[EnrollmentExemption, ...] = (
    EnrollmentExemption(
        component="mat-470-real-analysis",
        predicate="python-coverage-provider-undeclared",
        blocker="add `pytest-cov` to requirements-ci.txt, which is what CI installs",
        why=(
            "a pytest component, and nothing in this repository declares a Python coverage "
            "provider. `requirements-ci.txt` lists `pytest` and `PyYAML` and is the only "
            "Python install step in `.gitea/workflows/ci-cd.yml`, so a floor measured on a "
            "laptop that happens to have `coverage` installed would be a floor the CI runner "
            "fails closed on for want of the tool — `coverage-tool-missing`, on every run, "
            "for a component whose tests were fine. The blocker is one line in a requirements "
            "file and one measurement, not a rewrite."
        ),
    ),
    EnrollmentExemption(
        component="photos-import-tools",
        predicate="python-coverage-provider-undeclared",
        blocker="add `pytest-cov` to requirements-ci.txt, which is what CI installs",
        why=(
            "the same blocker as every other pytest component here: no Python coverage "
            "provider is declared anywhere in the repository, so there is no measurement to "
            "enroll. This venture carries its own `requirements.txt`, which is where its half "
            "of the fix goes; the gate's half is `requirements-ci.txt`. Registered rather than "
            "enrolled at zero, because a floor of zero is enrollment with no brake."
        ),
    ),
    EnrollmentExemption(
        component="photo-editing",
        predicate="python-coverage-provider-undeclared",
        blocker="add `pytest-cov` to requirements-ci.txt, which is what CI installs",
        why=(
            "the largest Python component in the catalog — 29 test files — and the one most "
            "worth measuring once a provider is declared. Not enrolled today for the same "
            "reason as the rest: nothing in the repository declares `pytest-cov` or "
            "`coverage`, so any number written here would come from one developer's machine "
            "and could not be reproduced by the runner that enforces it."
        ),
    ),
    EnrollmentExemption(
        component="ubuntu-agent-server",
        predicate="python-coverage-provider-undeclared",
        blocker="add `pytest-cov` to requirements-ci.txt, which is what CI installs",
        why=(
            "an Ansible-shaped component whose Python surface is its test helpers and one "
            "suite; it needs the same declared coverage provider as the other pytest "
            "components before a floor here would mean anything. Its own "
            "`tests/requirements.txt` is the natural place for the venture half of that."
        ),
    ),
    EnrollmentExemption(
        component="portfolio-router",
        predicate="python-coverage-provider-undeclared",
        blocker="add `pytest-cov` to requirements-ci.txt, which is what CI installs",
        why=(
            "the allocation engine, and the component where a coverage floor would carry the "
            "most weight, since `tests/test_portfolio_router.py` and its stopping-rule "
            "sibling are what stand between the ledger and an unreviewed allocation. It is "
            "held out only by the missing provider, and it should be the first component "
            "enrolled when that lands."
        ),
    ),
    EnrollmentExemption(
        component="range-coach",
        predicate="runner-outside-lcov-toolchain",
        blocker=(
            "a `swift test --enable-code-coverage` run plus an `llvm-cov export "
            "-format=lcov` step, and a Swift toolchain wherever the ratchet runs"
        ),
        why=(
            "a Swift package. `swift test` can emit coverage, but it emits llvm profdata "
            "rather than lcov, and this audit parses lcov only — so enrolling it means adding "
            "a conversion step and a Swift toolchain to the runner that executes the coverage "
            "gate, not just a baseline entry. `.gitea/workflows/ci-cd.yml` does install Swift "
            "for the pipeline's own verifier, so the toolchain half is already close."
        ),
    ),
    EnrollmentExemption(
        component="platform-terraform",
        predicate="runner-outside-lcov-toolchain",
        blocker=(
            "nothing; terraform has no test-coverage notion, so this entry stays until the "
            "component stops being terraform"
        ),
        why=(
            "infrastructure as code with no unit-test runner and no notion of executed lines. "
            "What stands in for coverage here is `scripts/ci/terraform_images.py` and the IaC "
            "verifier in the pipeline, which check that the declared images and the manifests "
            "agree. This is the one entry in this register that is not waiting on work: it is "
            "here so that the contract's count is exact rather than approximately complete."
        ),
    ),
    EnrollmentExemption(
        component="ai-engineering-academy-site",
        predicate="no-coverage-capable-runner",
        blocker="port `test.mjs` to `node --test` so a single run can be measured",
        why=(
            "its `test` script is `node test.mjs` — one script that shells out to `build.mjs`, "
            "asserts the generated pages exist, and evaluates the result inside `node:vm`. "
            "There is no test runner to attach `--experimental-test-coverage` to, and the "
            "source it exercises is executed through a vm context that V8 coverage does not "
            "attribute to a file. Both halves have to change before a number here would "
            "describe anything."
        ),
    ),
    EnrollmentExemption(
        component="real-estate-agent-photo-app",
        predicate="no-coverage-capable-runner",
        blocker="port the suite to a single `node --test` run and decide what covers the shell half",
        why=(
            "its `test` script is six `tsx <file>.test.ts` invocations chained with `&&`, plus "
            "`verify-access-gate.test.sh`. A `node --import tsx --test` run would measure the "
            "six and silently drop the seventh, and the floor would then claim to describe a "
            "suite it does not run — the shape this repository keeps finding, where a number "
            "is true of a smaller thing than its label says. Registered rather than measured "
            "over the convenient subset."
        ),
    ),
    EnrollmentExemption(
        component="retail-pilot-intel",
        predicate="pnpm-workspace-needs-merged-report",
        blocker="a per-package coverage provider in each workspace package and a merged lcov",
        why=(
            "a pnpm workspace whose `test` script is `pnpm -r run test`, fanning out across "
            "the packages under `apps/*` and `packages/*`. Each would produce its own report, "
            "and this audit reads exactly one lcov per component, so enrolling it means either "
            "a merge step or splitting it into several baseline entries. Splitting is probably "
            "the right answer and is a change to the catalog, not to this register."
        ),
    ),
    EnrollmentExemption(
        component="marisstella-homepage",
        predicate="source-executed-through-vm",
        blocker="give `app.js` an importable entry point, or measure it under a browser runner",
        why=(
            "the production homepage, and its suite is real — `tests/fixture.mjs` builds a DOM "
            "from the shipped `index.html` and executes `app.js` inside `node:vm` rather than "
            "grepping it. That is the right way to test a static page and the wrong shape for "
            "V8 coverage: code run through a vm context is attributed to no file, so the lcov "
            "report comes back empty and the ratchet can only say `empty-coverage-report`. "
            "Measured on 2026-08-05 to confirm it: `--test-coverage-include=app.js` over the "
            "four suites produced a 4-byte report."
        ),
    ),
)


def audit_enrollment(
    repo_root: Path,
    baseline_path: str = BASELINE_PATH,
    catalog: Optional[Sequence[CatalogComponent]] = None,
    enrolled: Optional[Iterable[str]] = None,
    exemptions: Sequence[EnrollmentExemption] = UNMEASURED_COMPONENTS,
) -> List[Finding]:
    """Every catalog component has a coverage floor or a live, reasoned exemption.

    The arguments exist so `tests/test_coverage_enrollment.py` can put a
    fabricated catalog and register in front of it and prove each direction
    fails. Nothing in here branches on which component it is looking at: a
    contract with a component-shaped hole in it is the disarmed control this
    repository has found three times already, so every candidate takes the same
    path and the register is the only place an exception can be written down.
    """
    findings: List[Finding] = []

    try:
        components = list(catalog) if catalog is not None else load_catalog(repo_root)
    except EnrollmentError as exc:
        return [
            Finding(
                component="<catalog>",
                severity="error",
                code="catalog-unreadable",
                message=str(exc),
                remedy=(
                    f"The enrollment contract's candidate set comes from {CATALOG_SYMBOL} in "
                    f"{CATALOG_PATH}. An unreadable catalog is a failure, never an empty "
                    "candidate set."
                ),
            )
        ]

    if enrolled is None:
        try:
            data = load_baseline(repo_root, baseline_path)
        except (FileNotFoundError, ValueError) as exc:
            return [
                Finding(
                    component="<baseline>",
                    severity="error",
                    code="baseline-unreadable",
                    message=str(exc),
                    remedy="The enrollment contract cannot tell what is enrolled.",
                )
            ]
        declared = data.get("components")
        enrolled_ids = {
            entry["id"]
            for entry in (declared if isinstance(declared, list) else [])
            if isinstance(entry, dict) and isinstance(entry.get("id"), str)
        }
    else:
        enrolled_ids = set(enrolled)

    catalog_ids = {component.id for component in components}
    by_id = {component.id: component for component in components}

    seen: set = set()
    for exemption in exemptions:
        if exemption.component in seen:
            findings.append(
                Finding(
                    component=exemption.component,
                    severity="error",
                    code="duplicate-exemption",
                    message="registered in UNMEASURED_COMPONENTS more than once",
                    remedy="One entry per component; two reasons for one component means one is stale.",
                )
            )
            continue
        seen.add(exemption.component)

        if exemption.predicate not in ENROLLMENT_PREDICATES:
            findings.append(
                Finding(
                    component=exemption.component,
                    severity="error",
                    code="unknown-predicate",
                    message=f"predicate {exemption.predicate!r} is not registered",
                    remedy=(
                        "An exemption's reason has to be re-derivable from the tree. Add the "
                        "predicate to ENROLLMENT_PREDICATES, or use one that is there."
                    ),
                )
            )
            continue

        if exemption.component not in catalog_ids:
            findings.append(
                Finding(
                    component=exemption.component,
                    severity="error",
                    code="stale-exemption",
                    message=f"not a component in {CATALOG_SYMBOL}",
                    remedy=(
                        "An exemption that outlives its component is a hole waiting for a "
                        "component of the same id to be added back without review. Remove it."
                    ),
                )
            )
            continue

        if exemption.component in enrolled_ids:
            findings.append(
                Finding(
                    component=exemption.component,
                    severity="error",
                    code="enrolled-and-exempt",
                    message=f"has a baseline in {baseline_path} and an exemption",
                    remedy="It is measured. Delete the exemption.",
                )
            )
            continue

        broken = ENROLLMENT_PREDICATES[exemption.predicate](Path(repo_root), by_id[exemption.component])
        if broken is not None:
            findings.append(
                Finding(
                    component=exemption.component,
                    severity="error",
                    code="exemption-predicate-broken",
                    message=f"the reason for this exemption no longer holds: {broken}",
                    remedy=(
                        f"Blocker recorded as: {exemption.blocker}. Measure the component and "
                        f"declare a baseline in {baseline_path}, or replace the exemption with "
                        "one whose predicate is true."
                    ),
                )
            )

    for component in components:
        if component.id in enrolled_ids or component.id in seen:
            continue
        findings.append(
            Finding(
                component=component.id,
                severity="error",
                code="component-not-enrolled",
                message=(
                    f"in {CATALOG_SYMBOL} with no coverage baseline and no registered exemption"
                ),
                remedy=(
                    f"Measure it and declare a baseline in {baseline_path}, or add an "
                    "EnrollmentExemption to UNMEASURED_COMPONENTS in this file naming a "
                    "predicate that says why it cannot be measured yet. Deleting this "
                    "component's tests currently turns no gate red."
                ),
            )
        )

    return findings


def enrolled_at_no_floor(entry: Dict[str, Any]) -> Optional[Finding]:
    """Enrollment with every percentage at zero is enrollment with no brake.

    The cheapest way to make this contract report full coverage of the catalog
    is to add every component at 0/0/0 with a tolerance, which satisfies "has a
    baseline" and forbids nothing. Refused here so that the only two honest
    moves are a measured floor or a registered exemption.
    """
    baseline = entry.get("baseline")
    if not isinstance(baseline, dict):
        return None
    values = [baseline.get(metric) for metric in METRICS]
    if any(not isinstance(value, (int, float)) or isinstance(value, bool) for value in values):
        return None
    if any(float(value) > 0.0 for value in values):
        return None
    return Finding(
        component=str(entry.get("id", "<unnamed>")),
        severity="error",
        code="enrolled-at-no-floor",
        message="every declared baseline percentage is 0, so nothing can fall below it",
        remedy=(
            "Measure the component and declare what it has, or register it in "
            "UNMEASURED_COMPONENTS with the blocker that stops it being measured. A floor of "
            "zero is enrollment in appearance only."
        ),
    )


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

    # Run unconditionally, including under `--component` and `--no-measure`.
    # Scoping the enrollment check to a subset of the invocations would make the
    # gate's completeness depend on how it was called, and the caller is exactly
    # who a missing floor is invisible to.
    findings.extend(audit_enrollment(repo_root, baseline_path))

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

        no_floor = enrolled_at_no_floor(entry)
        if no_floor is not None:
            findings.append(no_floor)

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
                        name: {
                            **asdict(m),
                            "exercised": sorted(m.exercised),
                            "percentages": m.percentages(),
                        }
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
                + f"  ({measurement.files} files measured, {measurement.lines_found} lines)"
            )
            # Printed second and separately because it is the number the
            # percentages above cannot express.
            print(
                f"    unexercised: {len(measurement.unexercised)}"
                f" of {measurement.declared_files} declared source files"
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
