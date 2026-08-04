#!/usr/bin/env python3
"""
Exception register audit.

`ENGINEERING-PRINCIPLES.md` and `AGENTS.md` both state the rule this enforces:
suppressions, quarantines, skipped checks and scanner exceptions are allowed,
but each one needs an owner, a reason, an issue, and an expiry. Until now that
rule was written down in four documents and enforced by nothing, so a
suppression cost nothing to add and never expired.

The failure mode is specific and it flatters. A `# type: ignore`, an
`eslint-disable`, or a stray `test.only(` all produce the same green result as
working code. `test.only` is the worst of them: it silently drops every other
test in its file, so a suite can shrink from 200 assertions to 1 while still
reporting success.

This audit inventories every suppression in tracked source and requires each to
be covered by an entry in `platform/exception-register.yaml`. Entries are
counted, so the register is a ratchet: adding a suppression fails until someone
records who owns it and when it expires, and removing one fails until the
register is lowered to match. Both directions are deliberate — a register that
drifts above reality is a stack of expired permissions nobody reads.

Usage:
    python3 scripts/ci/audit_exceptions.py            # audit, exit 1 on failure
    python3 scripts/ci/audit_exceptions.py --report   # inventory, always exit 0
    python3 scripts/ci/audit_exceptions.py --json     # machine-readable findings

Out of scope, deliberately: `|| true` and `set +e` in shell. They are idiomatic
for diagnostics and cleanup, so requiring registration would bury the signal
this check exists to raise. `ventures/quick-pick-survey/src/lib/ciContract.test.ts`
covers that construct for the CI files where it does convert red to green.
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, asdict, field
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence

import yaml

REGISTER_PATH = "platform/exception-register.yaml"

# An exception that outlives the person who granted it is not an exception, it
# is a policy change made without review. Six months forces a re-read.
MAX_HORIZON_DAYS = 180

REQUIRED_FIELDS = (
    "id",
    "kind",
    "path",
    "owner",
    "issue",
    "reason",
    "compensating_control",
    "expires",
)

TS_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}
PY_EXTENSIONS = {".py"}
YAML_EXTENSIONS = {".yml", ".yaml"}
SH_EXTENSIONS = {".sh", ".bash"}

# Files that describe suppressions rather than containing them. Scanning them
# would make this tool trip over its own documentation and test fixtures.
SELF_EXCLUDED_PATHS = frozenset(
    {
        "scripts/ci/audit_exceptions.py",
        "tests/test_audit_exceptions.py",
        REGISTER_PATH,
    }
)


@dataclass(frozen=True)
class Detector:
    kind: str
    pattern: str
    extensions: frozenset
    description: str

    def compiled(self) -> re.Pattern:
        return re.compile(self.pattern)


DETECTORS: Sequence[Detector] = (
    Detector(
        kind="lint-suppression",
        pattern=r"eslint-disable(?:-next-line|-line)?\b",
        extensions=frozenset(TS_EXTENSIONS),
        description="ESLint rule disabled inline",
    ),
    Detector(
        kind="type-suppression",
        pattern=r"@ts-(?:ignore|expect-error)\b",
        extensions=frozenset(TS_EXTENSIONS),
        description="TypeScript error suppressed inline",
    ),
    Detector(
        kind="type-suppression",
        pattern=r"#\s*type:\s*ignore\b",
        extensions=frozenset(PY_EXTENSIONS),
        description="mypy error suppressed inline",
    ),
    Detector(
        kind="lint-suppression",
        pattern=r"#\s*noqa\b",
        extensions=frozenset(PY_EXTENSIONS),
        description="flake8/ruff rule disabled inline",
    ),
    Detector(
        kind="scanner-suppression",
        pattern=r"#\s*nosec\b",
        extensions=frozenset(PY_EXTENSIONS),
        description="Bandit security finding suppressed inline",
    ),
    Detector(
        kind="coverage-suppression",
        pattern=r"#\s*pragma:\s*no\s+cover\b",
        extensions=frozenset(PY_EXTENSIONS),
        description="line excluded from coverage measurement",
    ),
    Detector(
        kind="test-skip",
        pattern=r"@pytest\.mark\.(?:skip|skipif|xfail)\b|@unittest\.skip",
        extensions=frozenset(PY_EXTENSIONS),
        description="Python test skipped or expected to fail",
    ),
    Detector(
        kind="test-skip",
        pattern=(
            # `skipIf` precedes `skip` in the alternation: it is a conditional
            # skip, so the suite reports success on the machine where the
            # condition is false, which is exactly where nobody is looking.
            r"\b(?:it|test|describe|context|suite)\s*\.\s*(?:skipIf|skip|only|todo|failing)\s*\("
            r"|\bx(?:it|describe|test)\s*\("
        ),
        extensions=frozenset(TS_EXTENSIONS),
        description="JS/TS test skipped, focused, or marked todo",
    ),
    Detector(
        kind="ci-tolerance",
        pattern=r"continue-on-error:\s*true",
        extensions=frozenset(YAML_EXTENSIONS),
        description="CI step failure does not fail the job",
    ),
    Detector(
        kind="lint-suppression",
        pattern=r"shellcheck\s+disable=",
        extensions=frozenset(SH_EXTENSIONS | YAML_EXTENSIONS),
        description="ShellCheck rule disabled inline",
    ),
    # Scoped to workflow YAML on purpose. The same flag names appear in shell
    # comments in `ventures/ubuntu-agent-server` that explain why that host
    # refuses to use them, and registering a warning against its own footgun
    # would invert the meaning of the entry.
    Detector(
        kind="agent-permission-bypass",
        pattern=(
            r"--dangerously-skip-permissions\b|bypassPermissions\b"
            r"|--yolo\b|--always-approve\b"
        ),
        extensions=frozenset(YAML_EXTENSIONS),
        description="unattended agent runs with its confirmation gates disabled",
    ),
)


@dataclass
class Occurrence:
    path: str
    line: int
    kind: str
    text: str
    description: str

    def location(self) -> str:
        return f"{self.path}:{self.line}"


@dataclass
class Finding:
    severity: str  # "error" | "warn"
    code: str
    where: str
    message: str
    remedy: str

    def format_line(self) -> str:
        marker = "ERROR" if self.severity == "error" else " WARN"
        return f"[{marker}] {self.where}\n         {self.message}\n         → {self.remedy}"


@dataclass
class Entry:
    raw: Dict[str, Any]
    index: int
    matched: List[Occurrence] = field(default_factory=list)

    @property
    def identifier(self) -> str:
        return str(self.raw.get("id") or f"entry[{self.index}]")

    @property
    def kind(self) -> str:
        return str(self.raw.get("kind", ""))

    @property
    def path_glob(self) -> str:
        return str(self.raw.get("path", ""))

    @property
    def code(self) -> Optional[str]:
        value = self.raw.get("code")
        return str(value) if value else None

    @property
    def count(self) -> int:
        """Occurrences this entry accepts, or -1 when unusable. A missing count
        is -1 rather than 0 so it is reported once as invalid, not a second time
        as an exceeded ratchet."""
        if "count" not in self.raw:
            return -1
        try:
            return int(self.raw["count"])
        except (TypeError, ValueError):
            return -1

    def matches(self, occurrence: Occurrence) -> bool:
        if self.kind != occurrence.kind:
            return False
        if not fnmatch.fnmatch(occurrence.path, self.path_glob):
            return False
        if self.code and self.code not in occurrence.text:
            return False
        return True


def find_repo_root(start: Optional[Path] = None) -> Path:
    current = (start or Path(__file__).resolve()).resolve()
    for candidate in [current, *current.parents]:
        if (candidate / "ventures").is_dir() and (candidate / "platform").is_dir():
            return candidate
    raise RuntimeError("Could not locate repository root from " + str(current))


def tracked_files(repo_root: Path) -> List[str]:
    """Tracked files only. Untracked build output is not ours to police, and
    node_modules would drown every real finding."""
    env = {
        **os.environ,
        "GIT_CONFIG_GLOBAL": "/dev/null",
        "GIT_CONFIG_NOSYSTEM": "1",
    }
    result = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=str(repo_root),
        env=env,
        capture_output=True,
        check=True,
    )
    return [name for name in result.stdout.decode("utf-8").split("\0") if name]


def scan_file(repo_root: Path, relative_path: str) -> List[Occurrence]:
    suffix = Path(relative_path).suffix
    applicable = [d for d in DETECTORS if suffix in d.extensions]
    if not applicable:
        return []

    absolute = repo_root / relative_path
    try:
        content = absolute.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return []

    occurrences: List[Occurrence] = []
    for line_number, line in enumerate(content.splitlines(), start=1):
        for detector in applicable:
            if detector.compiled().search(line):
                occurrences.append(
                    Occurrence(
                        path=relative_path,
                        line=line_number,
                        kind=detector.kind,
                        text=line.strip()[:200],
                        description=detector.description,
                    )
                )
    return occurrences


def scan_repository(repo_root: Path) -> List[Occurrence]:
    occurrences: List[Occurrence] = []
    for relative_path in tracked_files(repo_root):
        if relative_path in SELF_EXCLUDED_PATHS:
            continue
        occurrences.extend(scan_file(repo_root, relative_path))
    occurrences.sort(key=lambda o: (o.path, o.line, o.kind))
    return occurrences


def load_register(repo_root: Path) -> List[Dict[str, Any]]:
    register_file = repo_root / REGISTER_PATH
    if not register_file.is_file():
        raise FileNotFoundError(
            f"{REGISTER_PATH} is missing. Every suppression needs a registered owner "
            "and expiry; without the register there is nothing to check against."
        )
    data = yaml.safe_load(register_file.read_text(encoding="utf-8")) or {}
    entries = data.get("exceptions")
    if entries is None:
        return []
    if not isinstance(entries, list):
        raise ValueError(f"{REGISTER_PATH}: `exceptions` must be a list")
    return entries


def parse_expiry(value: Any) -> Optional[date]:
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value.strip())
        except ValueError:
            return None
    return None


def audit(
    occurrences: Sequence[Occurrence],
    register: Sequence[Dict[str, Any]],
    today: Optional[date] = None,
) -> List[Finding]:
    today = today or date.today()
    findings: List[Finding] = []
    entries = [Entry(raw=raw, index=index) for index, raw in enumerate(register)]

    seen_ids: Dict[str, int] = {}
    for entry in entries:
        identifier = entry.identifier
        if identifier in seen_ids:
            findings.append(
                Finding(
                    severity="error",
                    code="duplicate-entry-id",
                    where=f"{REGISTER_PATH} ({identifier})",
                    message=f"id '{identifier}' is used by more than one entry",
                    remedy="Give every entry a unique id; findings are traced by id.",
                )
            )
        seen_ids[identifier] = entry.index

        missing = [f for f in REQUIRED_FIELDS if not entry.raw.get(f)]
        if missing:
            findings.append(
                Finding(
                    severity="error",
                    code="incomplete-entry",
                    where=f"{REGISTER_PATH} ({identifier})",
                    message=f"missing required field(s): {', '.join(missing)}",
                    remedy=(
                        "An exception without an owner, issue, reason, compensating "
                        "control and expiry is an undocumented policy change."
                    ),
                )
            )

        if entry.count < 0:
            findings.append(
                Finding(
                    severity="error",
                    code="invalid-count",
                    where=f"{REGISTER_PATH} ({identifier})",
                    message="`count` is missing or not a non-negative integer",
                    remedy=(
                        "Set `count` to the exact number of occurrences this entry "
                        "accepts. It is the ratchet: without it the entry is a "
                        "blanket permission."
                    ),
                )
            )

        expiry = parse_expiry(entry.raw.get("expires"))
        if entry.raw.get("expires") and expiry is None:
            findings.append(
                Finding(
                    severity="error",
                    code="unparseable-expiry",
                    where=f"{REGISTER_PATH} ({identifier})",
                    message=f"expires '{entry.raw.get('expires')}' is not an ISO date",
                    remedy="Use `expires: YYYY-MM-DD`.",
                )
            )
        elif expiry is not None:
            if expiry < today:
                findings.append(
                    Finding(
                        severity="error",
                        code="expired-exception",
                        where=f"{REGISTER_PATH} ({identifier})",
                        message=f"expired on {expiry.isoformat()}",
                        remedy=(
                            "Fix the underlying issue and delete the entry, or "
                            "re-review it with the owner and set a new expiry. An "
                            "expired exception is a decision nobody has confirmed "
                            "still holds."
                        ),
                    )
                )
            elif expiry > today + timedelta(days=MAX_HORIZON_DAYS):
                findings.append(
                    Finding(
                        severity="error",
                        code="expiry-too-distant",
                        where=f"{REGISTER_PATH} ({identifier})",
                        message=(
                            f"expires {expiry.isoformat()}, more than "
                            f"{MAX_HORIZON_DAYS} days out"
                        ),
                        remedy=(
                            f"Cap the expiry at {MAX_HORIZON_DAYS} days. A permission "
                            "that never comes up for review is a permanent one."
                        ),
                    )
                )

    # Entries are evaluated in file order and each occurrence is claimed once,
    # so a specific entry placed above a broad one keeps its own count honest.
    for occurrence in occurrences:
        for entry in entries:
            if entry.matches(occurrence):
                entry.matched.append(occurrence)
                break
        else:
            findings.append(
                Finding(
                    severity="error",
                    code="unregistered-suppression",
                    where=occurrence.location(),
                    message=f"{occurrence.description}: {occurrence.text}",
                    remedy=(
                        f"Remove the suppression, or add an entry to {REGISTER_PATH} "
                        f"with kind '{occurrence.kind}', an owner, issue, reason, "
                        "compensating control and expiry."
                    ),
                )
            )

    for entry in entries:
        actual = len(entry.matched)
        allowed = entry.count
        if allowed < 0:
            continue  # already reported as invalid-count
        if actual > allowed:
            findings.append(
                Finding(
                    severity="error",
                    code="count-exceeded",
                    where=f"{REGISTER_PATH} ({entry.identifier})",
                    message=(
                        f"covers {actual} occurrence(s) but is registered for {allowed}"
                    ),
                    remedy=(
                        "Remove the new suppression, or raise `count` and record why "
                        "the exception grew. The count is what keeps this a ratchet."
                    ),
                )
            )
        elif actual < allowed:
            findings.append(
                Finding(
                    severity="error",
                    code="stale-count",
                    where=f"{REGISTER_PATH} ({entry.identifier})",
                    message=(
                        f"registered for {allowed} occurrence(s) but only {actual} "
                        "remain"
                    ),
                    remedy=(
                        f"Lower `count` to {actual}"
                        + (
                            " (or delete the entry, which now covers nothing)"
                            if actual == 0
                            else ""
                        )
                        + ". The ratchet only turns one way."
                    ),
                )
            )

    return findings


def build_report(occurrences: Sequence[Occurrence]) -> str:
    grouped: Dict[str, List[Occurrence]] = {}
    for occurrence in occurrences:
        grouped.setdefault(occurrence.kind, []).append(occurrence)

    lines = ["=== Suppression inventory ==="]
    if not occurrences:
        lines.append("No suppressions found in tracked source.")
        return "\n".join(lines)

    for kind in sorted(grouped):
        items = grouped[kind]
        lines.append("")
        lines.append(f"{kind} ({len(items)})")
        for occurrence in items:
            lines.append(f"  {occurrence.location()}  {occurrence.text}")
    lines.append("")
    lines.append(f"{len(occurrences)} suppression(s) total.")
    return "\n".join(lines)


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Audit inline suppressions against the exception register."
    )
    parser.add_argument(
        "--report",
        action="store_true",
        help="Print the suppression inventory and exit 0 without auditing.",
    )
    parser.add_argument("--json", action="store_true", help="Emit findings as JSON.")
    args = parser.parse_args(list(argv) if argv is not None else None)

    repo_root = find_repo_root()
    occurrences = scan_repository(repo_root)

    if args.report:
        print(build_report(occurrences))
        return 0

    try:
        register = load_register(repo_root)
    except (FileNotFoundError, ValueError, yaml.YAMLError) as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        return 1

    findings = audit(occurrences, register)

    if args.json:
        print(json.dumps([asdict(f) for f in findings], indent=2))
    else:
        print("=== Exception Register Audit ===")
        if not findings:
            print(
                f"{len(occurrences)} suppression(s), all registered with an owner "
                "and an unexpired date."
            )
        else:
            for finding in findings:
                print(finding.format_line())
            print()
            print(f"{len(findings)} issue(s) across {len(occurrences)} suppression(s).")

    return 1 if any(f.severity == "error" for f in findings) else 0


if __name__ == "__main__":
    sys.exit(main())
