#!/usr/bin/env python3
"""Static application security testing gate.

`docs/ENGINEERING-ROADMAP.md` requires SAST to be a required check. Nothing in
the repository ran one: `.gitea/workflows/security.yml` had a secret scanner
(gitleaks), a dependency and misconfiguration scanner (trivy) and a policy
scanner of our own, and no tool that reads the application source for
vulnerable code.

This runs Semgrep over the JavaScript, TypeScript, Next.js and Python surface
and Bandit over the Python surface, then holds the result to
`platform/sast-baseline.yaml`. The gate is zero-tolerance in both directions:

* a finding that is not in the baseline fails the run — that is the new
  vulnerability the gate exists to catch;
* a baseline entry that matches nothing fails the run — a waiver whose subject
  is gone is a waiver nobody will notice covering something else later;
* an expired entry fails the run, so a waiver cannot outlive its review.

Two decisions worth stating, because both narrow what this catches.

Bandit runs at medium severity and above. At low severity it reports 88 further
findings in this repository, 42 of them `assert` in test files and 44 of them
`subprocess` calls in CI scripts that shell out to `git` and `npm` with list
arguments and no shell. Registering those would be 88 waivers nobody reads,
which is how a register stops being read at all. The full low-severity output
is still written to the report so lowering the threshold is a deliberate act
with a number attached.

Matching ignores line numbers. A baseline keyed by line churns on every
unrelated edit above the finding, and a register that has to be regenerated
after unrelated edits gets regenerated blindly.
"""

from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
import shutil
import subprocess
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

import yaml


def _load_sibling(name: str):
    """Import a sibling CI control by path.

    Not `sys.path.insert` + a plain import: that puts the import below other
    statements, so it needs an inline linter suppression, and
    `scripts/ci/audit_exceptions.py` correctly reports those as unregistered
    exceptions. A loader is cheaper than a waiver.
    """
    location = Path(__file__).resolve().parent / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, location)
    module = importlib.util.module_from_spec(spec)
    sys.modules.setdefault(name, module)
    spec.loader.exec_module(module)
    return module


# The directory-pruning rule this gate descends by. Imported, never re-derived:
# see the note beside ARTIFACT_DIR_NAMES for what a second copy cost.
_route_posture = _load_sibling("route_posture_contract")

REPO_ROOT = Path(__file__).resolve().parents[2]
BASELINE_PATH = REPO_ROOT / "platform" / "sast-baseline.yaml"

REQUIRED_FIELDS = (
    "id",
    "tool",
    "rule",
    "path",
    "count",
    "owner",
    "issue",
    "reason",
    "expires",
    "status",
)
MAX_EXPIRY_DAYS = 180

# Two kinds of entry, because conflating them is how a register stops being read.
#
# `reviewed` — somebody read this finding, understood why it is not exploitable,
# and wrote that down. The reason has to survive review by a second person, so a
# minimum length is enforced: "false positive" is not a reason.
#
# `inherited` — present when SAST was switched on, counted but not yet
# individually assessed. Pretending 89 findings were each cleared in the hour
# the gate was written would be a lie, and a register full of lies is one nobody
# re-reads. These are locked to their exact count, so they cannot grow, and they
# carry a remediation plan rather than a justification.
#
# The only thing that matters for the gate is that both are count-exact: a new
# finding fails either way. The distinction is for the human doing the next pass.
STATUS_REVIEWED = "reviewed"
STATUS_INHERITED = "inherited"
VALID_STATUSES = (STATUS_REVIEWED, STATUS_INHERITED)

# Words. Short enough to write honestly, long enough that a one-word dismissal
# fails the gate.
MIN_REVIEWED_REASON_WORDS = 20

# Registry rulesets.
#
# `p/default` rather than the per-language packs, and the difference is not
# cosmetic. Measured on 2026-08-01 against three deliberately vulnerable probe
# files (`eval(userInput)`, `exec("ls " + userInput)`, DOM XSS): the
# `p/javascript` + `p/typescript` + `p/nextjs` combination loaded 74 rules for a
# `.ts` file and caught **none** of them. `p/default` loads 1074 and catches
# eval and child_process in both `.js` and `.ts`. A gate built on the narrow
# packs would have been green over 710 TypeScript files while detecting
# essentially nothing in them — the failure mode this repository keeps finding
# in its own controls, shipped deliberately.
#
# `p/bash` is deliberately absent: it 404s from the registry, and a config that
# fails to download aborts the whole scan, so an invalid entry here is a scan
# that never runs rather than one rule missing.
SEMGREP_CONFIGS = ("p/default",)

# Paths neither tool should read. Vendored dependencies are the dependency
# scanner's job (trivy, `npm audit`), not SAST's — findings in code nobody in
# this repository wrote are noise that buries the findings in code we did.
#
# These are safe to prune by *name* at any depth: no URL path segment and no
# first-party source directory is ever called `node_modules` or `.venv`.
VENDOR_DIRS = ("node_modules", ".next", ".git", ".venv")

# Build-output names that are *also* legal URL segments, and therefore are NOT
# safe to prune by name. `src/app/api/build/route.ts` is a real endpoint whose
# directory happens to be called `build`. `scripts/ci/route_posture_contract.py`
# learned this the expensive way — pruning by bare name hid three unguarded
# handlers from that audit — and carved out App Router trees. This scanner kept
# the bare-name prune and so kept the defect: it silently removed real source
# from the security scan.
#
# The rule is not re-implemented here. `route_posture_contract.is_pruned_dir` is
# imported, because two copies that agree and are both wrong is the failure mode
# this repository keeps finding in its own controls.
ARTIFACT_DIR_NAMES = frozenset(_route_posture.ARTIFACT_DIRS)

# How many App-Router-shadowed files the scan will hand to semgrep as explicit
# roots before it refuses to run. A handful of route segments named `build` or
# `out` is normal; hundreds means somebody put real build output inside `app/`,
# and the honest answer to that is to stop, not to scan part of it.
MAX_SHADOWED_FILES = 200

# Semgrep ships its own default ignore list, and it prunes `build/` and `dist/`
# at any depth *regardless of the flags we pass*. Measured 2026-08-05 with
# semgrep 1.172.0: a file at `ventures/v/src/app/api/build/route.ts` containing
# `eval(userInput)` is reported in `paths.scanned` as an empty list even with no
# `--exclude` at all, and the `eval-detected` finding never appears. So dropping
# `build` from our own exclude list is necessary but not sufficient — the file
# has to be handed to semgrep as an explicit scanning root, which is the one
# thing that bypasses the built-in ignore. Verified: passing the path directly
# scans it, and semgrep de-duplicates a file reachable both ways.
TOOL_SEMGREP = "semgrep"
TOOL_BANDIT = "bandit"

# Bandit severities the gate blocks on. See the module docstring for why LOW is
# reported but not gated.
GATED_BANDIT_SEVERITY = frozenset({"MEDIUM", "HIGH"})


@dataclass(frozen=True)
class Finding:
    """One SAST result, normalised to what the baseline matches on."""

    tool: str
    rule: str
    path: str

    def describe(self) -> str:
        return f"{self.tool} {self.rule} in {self.path}"


@dataclass(frozen=True)
class Located:
    """A finding plus the line and severity it was reported at."""

    finding: Finding
    line: int
    message: str
    severity: str = ""


class ScanError(RuntimeError):
    """A tool could not be run, or ran and could not produce a verdict."""


@dataclass(frozen=True)
class ScanSurface:
    """What the scanners must skip, and what they cannot otherwise reach.

    `artifact_dirs` are the real build-output directories found on disk, as
    paths relative to the scan root. Concrete paths, not names: bandit's
    `--exclude` matches the whole path, so `./dist` excludes a top-level `dist`
    and nothing at depth — measured 2026-08-05, bandit 1.9.4 happily reported
    `./ventures/v/dist/artifact.py` while `./dist` was in its exclude list. The
    bare-name form was therefore wrong in *both* directions at once: it hid real
    App Router source from semgrep and failed to hide real build output from
    bandit.

    `shadowed_files` are first-party source files sitting under an App Router
    directory whose name collides with a build-output name. Semgrep's built-in
    ignore hides them however we configure it, so they are passed as explicit
    scanning roots.
    """

    artifact_dirs: tuple[str, ...]
    shadowed_files: tuple[str, ...]
    vendor_dirs: tuple[str, ...] = ()


def _is_shadowed(relative: Path) -> bool:
    """Would semgrep's built-in ignore hide this path because of a directory name?"""
    return any(part in ARTIFACT_DIR_NAMES for part in relative.parts[:-1])


def classify_scan_surface(root: Path) -> ScanSurface:
    """Walk `root` once and split it into exclusions and semgrep-shadowed source.

    The descent rule is `route_posture_contract.is_pruned_dir` — imported, not
    re-derived. A directory it prunes is recorded as an exclusion and not
    entered; a directory it keeps is entered, and any file underneath whose
    ancestors include a build-output name is recorded as shadowed.
    """
    artifact_dirs: list[str] = []
    vendor_dirs: list[str] = []
    shadowed: list[str] = []
    stack = [root]
    while stack:
        current = stack.pop()
        try:
            entries = sorted(current.iterdir())
        except (PermissionError, OSError):
            continue
        for entry in entries:
            if entry.is_symlink():
                # A symlinked `node_modules` is how ventures get their deps.
                # Following it would scan the whole dependency tree.
                continue
            relative = entry.relative_to(root)
            if entry.is_dir():
                if _route_posture.is_pruned_dir(entry, root):
                    if entry.name in ARTIFACT_DIR_NAMES:
                        artifact_dirs.append(relative.as_posix())
                    else:
                        vendor_dirs.append(relative.as_posix())
                    continue
                stack.append(entry)
            elif entry.is_file() and _is_shadowed(relative):
                shadowed.append(relative.as_posix())
    return ScanSurface(artifact_dirs=tuple(sorted(artifact_dirs)),
                       shadowed_files=tuple(sorted(shadowed)),
                       vendor_dirs=tuple(sorted(vendor_dirs)))


def _relative(path: str, root: Path) -> str:
    """Normalise a tool-reported path to one relative to the scanned root.

    Semgrep reports paths as given on the command line and Bandit prefixes them
    with `./` because it is invoked with `-r .`. Both have to collapse onto the
    same string or the baseline matches neither. `removeprefix`, not `lstrip`:
    `lstrip("./")` strips a character *set*, so `./.venv/x` would come back as
    `venv/x`.
    """
    candidate = Path(path)
    if candidate.is_absolute():
        try:
            candidate = candidate.relative_to(root)
        except ValueError:
            return str(candidate)
    return str(candidate).removeprefix("./")


def run_semgrep(root: Path) -> tuple[list[Located], list[str]]:
    """Run Semgrep; return its findings and the files it could not fully parse.

    Raises rather than returning empty when the tool is missing or the scan
    errored. An empty list has to mean "scanned and found nothing"; if it can
    also mean "did not scan", the gate reports success for a check it never ran,
    which is the exact defect `platform/ci/test/fail-closed.test.mjs` covers
    elsewhere in this pipeline.
    """
    if shutil.which(TOOL_SEMGREP) is None:
        raise ScanError(
            "semgrep is not installed. Install it with "
            "`pip install -r requirements-ci.txt`. This gate fails rather than "
            "skips: a SAST check that silently does not run is worse than none."
        )
    surface = classify_scan_surface(root)
    command = [TOOL_SEMGREP, "scan", "--metrics=off", "--json", "--quiet"]
    for config in SEMGREP_CONFIGS:
        command += ["--config", config]
    for excluded in VENDOR_DIRS:
        command += [f"--exclude={excluded}"]
    for excluded in surface.artifact_dirs:
        command += [f"--exclude={excluded}"]
    command.append(str(root))
    # Explicit scanning roots for the files semgrep's own default ignore would
    # drop. Nothing else reaches them; see the note beside ARTIFACT_DIR_NAMES.
    #
    # Raising rather than truncating. If a venture ever parks real build output
    # inside its App Router tree this list explodes and the argv would overflow;
    # quietly scanning the first N would be a gate silently narrowing itself,
    # which is the failure this whole module is written against.
    if len(surface.shadowed_files) > MAX_SHADOWED_FILES:
        raise ScanError(
            f"{len(surface.shadowed_files)} files sit under an App Router directory "
            f"named {sorted(ARTIFACT_DIR_NAMES)}, over the limit of {MAX_SHADOWED_FILES}. "
            f"That is build output inside `app/`, not routes: move it out, or raise "
            f"MAX_SHADOWED_FILES deliberately. Refusing to scan a silently truncated "
            f"subset."
        )
    command += [str(root / shadowed) for shadowed in surface.shadowed_files]

    completed = subprocess.run(command, capture_output=True, text=True, cwd=root)
    if not completed.stdout.strip():
        raise ScanError(
            f"semgrep produced no output (exit {completed.returncode}): "
            f"{completed.stderr.strip()[:500]}"
        )
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise ScanError(f"semgrep output was not JSON: {error}") from error

    # Semgrep reports two very different things in `errors`, separated by
    # `level`. Conflating them breaks the gate in one direction or the other.
    #
    # `level: error` is a ruleset that failed to download or a rule that
    # crashed. The scan still exits successfully with findings from whatever did
    # load, so ignoring it silently shrinks the rule set over time. Fatal.
    #
    # `level: warn` is almost always PartialParsing: Semgrep's TS/TSX grammar
    # rejecting a construct it does not model (a `>()` generic arrow, a bare `&`
    # in JSX text). The file is scanned, but not all of it. That is a coverage
    # gap rather than a failure, and it is handled where it can be bounded — see
    # `coverage.semgrep_unparsed_max` in the baseline. Making it fatal would
    # mean the gate could never run at all.
    fatal = [error for error in payload.get("errors") or [] if error.get("level") == "error"]
    if fatal:
        rendered = "; ".join(str(error.get("message", error))[:200] for error in fatal)
        raise ScanError(f"semgrep reported {len(fatal)} scan error(s): {rendered}")

    unparsed = sorted(
        {
            _relative(str(error.get("path", "")), root)
            for error in payload.get("errors") or []
            if error.get("level") == "warn" and error.get("path")
        }
    )

    located: list[Located] = []
    for result in payload.get("results", []):
        extra = result.get("extra", {})
        located.append(
            Located(
                finding=Finding(
                    tool=TOOL_SEMGREP,
                    rule=str(result.get("check_id", "")),
                    path=_relative(str(result.get("path", "")), root),
                ),
                line=int(result.get("start", {}).get("line", 0)),
                message=str(extra.get("message", "")).strip().replace("\n", " ")[:300],
                severity=str(extra.get("severity", "")),
            )
        )
    return located, unparsed


def run_bandit(root: Path) -> list[Located]:
    """Run Bandit over the Python surface and return every finding it reports.

    Invoked at low severity and above so the report can state how many findings
    sit below the gate. Partitioning is the caller's job — see `GATED_SEVERITY`.
    """
    if shutil.which(TOOL_BANDIT) is None:
        raise ScanError(
            "bandit is not installed. Install it with "
            "`pip install -r requirements-ci.txt`. This gate fails rather than "
            "skips, for the same reason semgrep does."
        )
    surface = classify_scan_surface(root)
    # Concrete paths, because bandit's `--exclude` matches the whole path and
    # never a bare name at depth: `./node_modules` does not exclude
    # `./ventures/v/node_modules`, which is why the old bare-name list left
    # vendored Python inside the scan while claiming to have removed it.
    excludes = [f"./{name}" for name in VENDOR_DIRS]
    excludes += [f"./{path}" for path in surface.vendor_dirs]
    excludes += [f"./{path}" for path in surface.artifact_dirs]
    command = [
        TOOL_BANDIT,
        "-q",
        "-l",
        "-r",
        ".",
        "-f",
        "json",
        "--exclude",
        ",".join(excludes),
    ]
    completed = subprocess.run(command, capture_output=True, text=True, cwd=root)
    # Bandit exits 1 when it has findings and 2 on a usage error, so the exit
    # code alone cannot distinguish "found something" from "could not run".
    # The presence of parseable JSON is what separates them.
    if not completed.stdout.strip():
        raise ScanError(
            f"bandit produced no output (exit {completed.returncode}): "
            f"{completed.stderr.strip()[:500]}"
        )
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise ScanError(f"bandit output was not JSON: {error}") from error

    located: list[Located] = []
    for result in payload.get("results", []):
        located.append(
            Located(
                finding=Finding(
                    tool=TOOL_BANDIT,
                    rule=str(result.get("test_id", "")),
                    path=_relative(str(result.get("filename", "")), root),
                ),
                line=int(result.get("line_number", 0)),
                message=str(result.get("issue_text", "")).strip().replace("\n", " ")[:300],
                severity=str(result.get("issue_severity", "")).upper(),
            )
        )
    return located


def load_document(path: Path) -> dict:
    """Read the baseline register file."""
    if not path.exists():
        raise ScanError(f"baseline register not found: {path}")
    document = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(document, dict):
        raise ScanError(f"{path.name}: top level must be a mapping")
    return document


def read_baseline(document: dict, path: Path) -> list[dict]:
    """Extract the baseline entry list, structurally validated."""
    entries = document.get("baseline")
    if entries is None:
        raise ScanError(f"{path.name} has no `baseline:` key")
    if not isinstance(entries, list):
        raise ScanError(f"{path.name}: `baseline` must be a list")
    return entries


def check_parse_coverage(unparsed: Sequence[str], document: dict) -> list[str]:
    """Hold the count of partially-parsed files to its declared ceiling.

    Semgrep scans a file it cannot fully parse, it just stops at the construct
    it does not understand — so a new unparseable file is source code that
    quietly leaves SAST coverage while every gate stays green. Declaring the
    number is what makes that visible: the count only moves when somebody edits
    the register and says why.
    """
    coverage = document.get("coverage")
    if not isinstance(coverage, dict) or "semgrep_unparsed_max" not in coverage:
        return [
            "baseline register has no `coverage.semgrep_unparsed_max`. It is "
            "required: without a declared ceiling, a file that stops parsing "
            "silently stops being scanned."
        ]
    ceiling = coverage.get("semgrep_unparsed_max")
    if not isinstance(ceiling, int) or isinstance(ceiling, bool) or ceiling < 0:
        return ["`coverage.semgrep_unparsed_max` must be a non-negative integer"]

    actual = len(unparsed)
    if actual > ceiling:
        return [
            f"{actual} file(s) only partially parsed by semgrep, ceiling is "
            f"{ceiling}. Code in them is not fully scanned. Newly affected: "
            + ", ".join(unparsed[:10])
            + ("…" if actual > 10 else "")
        ]
    if actual < ceiling:
        return [
            f"only {actual} file(s) partially parsed but the ceiling is "
            f"{ceiling}. Lower it to {actual} — an unratcheted ceiling gives "
            f"back the coverage that was just won."
        ]
    return []


def validate_entries(entries: Sequence[dict], today: dt.date) -> list[str]:
    """Return one problem string per structurally invalid or expired entry."""
    problems: list[str] = []
    seen_ids: set[str] = set()
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            problems.append(f"baseline[{index}] is not a mapping")
            continue
        label = entry.get("id", f"baseline[{index}]")
        missing = [field for field in REQUIRED_FIELDS if entry.get(field) in (None, "")]
        if missing:
            problems.append(f"{label}: missing required field(s): {', '.join(missing)}")
        if label in seen_ids:
            problems.append(f"{label}: duplicate id")
        seen_ids.add(str(label))

        if entry.get("tool") not in (TOOL_SEMGREP, TOOL_BANDIT):
            problems.append(f"{label}: tool must be '{TOOL_SEMGREP}' or '{TOOL_BANDIT}'")

        status = entry.get("status")
        if status not in VALID_STATUSES:
            problems.append(f"{label}: status must be one of {', '.join(VALID_STATUSES)}")
        elif status == STATUS_REVIEWED:
            words = len(str(entry.get("reason", "")).split())
            if words < MIN_REVIEWED_REASON_WORDS:
                problems.append(
                    f"{label}: a reviewed entry needs a reason of at least "
                    f"{MIN_REVIEWED_REASON_WORDS} words explaining why the finding is "
                    f"not exploitable; this one has {words}. Mark it `inherited` if it "
                    f"has not actually been assessed yet."
                )
        elif status == STATUS_INHERITED and not entry.get("plan"):
            problems.append(
                f"{label}: an inherited entry needs a `plan` naming what would resolve "
                f"it. Untriaged debt with no plan is just a permanent waiver."
            )

        count = entry.get("count")
        if not isinstance(count, int) or isinstance(count, bool) or count < 1:
            problems.append(f"{label}: count must be a positive integer")

        expires = entry.get("expires")
        if expires is not None:
            expiry = expires if isinstance(expires, dt.date) else _parse_date(str(expires))
            if expiry is None:
                problems.append(f"{label}: expires must be an ISO date (YYYY-MM-DD)")
            elif expiry < today:
                problems.append(f"{label}: expired on {expiry.isoformat()}")
            elif (expiry - today).days > MAX_EXPIRY_DAYS:
                problems.append(
                    f"{label}: expires {(expiry - today).days} days out, "
                    f"more than the {MAX_EXPIRY_DAYS}-day maximum"
                )
    return problems


def _parse_date(value: str) -> dt.date | None:
    try:
        return dt.date.fromisoformat(value)
    except ValueError:
        return None


def reconcile(findings: Iterable[Located], entries: Sequence[dict]) -> list[str]:
    """Compare real findings against the baseline; return one problem per mismatch."""
    problems: list[str] = []
    actual = Counter(item.finding for item in findings)
    lines: dict[Finding, list[Located]] = {}
    for item in findings:
        lines.setdefault(item.finding, []).append(item)

    registered: Counter[Finding] = Counter()
    entry_for: dict[Finding, dict] = {}
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        key = Finding(
            tool=str(entry.get("tool", "")),
            rule=str(entry.get("rule", "")),
            path=str(entry.get("path", "")),
        )
        count = entry.get("count")
        registered[key] += count if isinstance(count, int) and not isinstance(count, bool) else 0
        entry_for.setdefault(key, entry)

    for finding, count in sorted(actual.items(), key=lambda pair: pair[0].describe()):
        expected = registered.get(finding, 0)
        if expected == 0:
            where = ", ".join(f"line {item.line}" for item in lines[finding])
            problems.append(
                f"unregistered finding: {finding.describe()} ({count}x, {where}). "
                f"Fix it, or add an entry to {BASELINE_PATH.name} with an owner, "
                f"a reason that shows why it is not exploitable, and an expiry."
            )
        elif count > expected:
            problems.append(
                f"{entry_for[finding]['id']}: {finding.describe()} now occurs {count}x, "
                f"baseline allows {expected}. The new occurrence is not covered by the "
                f"reason on record — read it before raising the count."
            )

    for finding, expected in sorted(registered.items(), key=lambda pair: pair[0].describe()):
        real = actual.get(finding, 0)
        if real < expected:
            entry_id = entry_for[finding]["id"]
            if real == 0:
                problems.append(
                    f"{entry_id}: stale baseline entry — {finding.describe()} no longer "
                    f"occurs. Delete the entry; a waiver whose subject is gone will "
                    f"silently cover the next finding of the same rule in that file."
                )
            else:
                problems.append(
                    f"{entry_id}: stale baseline entry — {finding.describe()} occurs "
                    f"{real}x but the baseline reserves {expected}. Lower the count."
                )
    return problems


def write_report(
    path: Path,
    gated: Sequence[Located],
    low_severity_count: int,
    unparsed: Sequence[str],
    problems: Sequence[str],
) -> None:
    lines = [
        "# SAST scan",
        "",
        f"Generated: {dt.datetime.now(dt.timezone.utc):%Y-%m-%d %H:%M:%S UTC}",
        "",
        f"Semgrep rulesets: {', '.join(SEMGREP_CONFIGS)}",
        "Bandit severity threshold: medium and above",
        "",
        "## Verdict",
        "",
    ]
    if problems:
        lines.append(f"**FAILED** — {len(problems)} problem(s).")
        lines.append("")
        lines += [f"- {problem}" for problem in problems]
    else:
        lines.append(
            f"**PASSED** — {len(gated)} finding(s), all registered in "
            f"`{BASELINE_PATH.relative_to(REPO_ROOT)}`."
        )
    lines += ["", "## Findings at or above the gate threshold", ""]
    if gated:
        lines.append("| Tool | Rule | Path | Line |")
        lines.append("| --- | --- | --- | --- |")
        for item in sorted(gated, key=lambda i: (i.finding.path, i.line)):
            lines.append(
                f"| {item.finding.tool} | `{item.finding.rule}` | "
                f"`{item.finding.path}` | {item.line} |"
            )
    else:
        lines.append("None.")
    lines += [
        "",
        "## Below the gate threshold",
        "",
        f"Bandit reports {low_severity_count} further finding(s) at low severity. "
        "They are not gated; see the module docstring of `scripts/ci/sast_scan.py` "
        "for why, and change the threshold there deliberately if that reasoning "
        "stops holding.",
        "",
        "## Coverage gap",
        "",
        f"Semgrep could not fully parse {len(unparsed)} file(s). Each is scanned "
        "only up to the construct its grammar rejected, so the rest of the file "
        "is unscanned. The count is held to `coverage.semgrep_unparsed_max` in "
        "the baseline so it cannot grow unnoticed.",
        "",
    ]
    lines += [f"- `{item}`" for item in unparsed] or ["None."]
    lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--report",
        type=Path,
        default=REPO_ROOT / "sast-report.md",
        help="path to write the markdown evidence report",
    )
    parser.add_argument(
        "--baseline",
        type=Path,
        default=BASELINE_PATH,
        help="path to the baseline register",
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=REPO_ROOT,
        help="directory to scan",
    )
    args = parser.parse_args(argv)

    try:
        document = load_document(args.baseline)
        entries = read_baseline(document, args.baseline)
        bandit_all = run_bandit(args.root)
        semgrep_findings, unparsed = run_semgrep(args.root)
        findings = semgrep_findings + [
            item for item in bandit_all if item.severity in GATED_BANDIT_SEVERITY
        ]
    except ScanError as error:
        print(f"SAST gate could not run: {error}", file=sys.stderr)
        return 2

    low_severity = len(bandit_all) - len(
        [item for item in findings if item.finding.tool == TOOL_BANDIT]
    )

    problems = validate_entries(entries, dt.date.today())
    problems += reconcile(findings, entries)
    problems += check_parse_coverage(unparsed, document)

    write_report(args.report, findings, low_severity, unparsed, problems)

    if problems:
        print(f"SAST gate failed with {len(problems)} problem(s):", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        print(f"\nReport: {args.report}", file=sys.stderr)
        return 1

    print(
        f"SAST gate passed: {len(findings)} finding(s), all registered in "
        f"{args.baseline.name}. Report: {args.report}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
