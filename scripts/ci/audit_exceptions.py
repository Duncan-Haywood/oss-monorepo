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
from pathlib import Path, PurePosixPath
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
    # Added with the SAST gate (`scripts/ci/sast_scan.py`). Semgrep honours a
    # `nosemgrep` comment in every language it parses, so it is a per-line
    # opt-out of the security scanner that leaves no trace anywhere else — the
    # baseline register in `platform/sast-baseline.yaml` never sees a finding
    # that was suppressed at the source. Registering the tool without
    # registering its escape hatch is how a control gets to look enforced while
    # anyone can step around it one line at a time.
    Detector(
        kind="scanner-suppression",
        pattern=r"\bnosemgrep\b",
        extensions=frozenset(TS_EXTENSIONS | PY_EXTENSIONS),
        description="Semgrep security finding suppressed inline",
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
)


# --- Scheduled agent workflows: an enrollment contract, not a flag denylist ---
#
# This check used to be one regex over all workflow YAML holding the four bypass
# spellings somebody had happened to see. A denylist reports a clean result for
# every form it does not know, and it did. Measured at 5fa7f376, the repository
# ran six `*-scheduled.yml` agent workflows and the regex saw three of them:
#
#   * `codex-scheduled.yml` disables its sandbox and its approval prompt with
#     `--sandbox danger-full-access --ask-for-approval never`;
#   * `cursor-scheduled.yml` does it with `ARGS=(-p --force)`;
#   * `opencode-scheduled.yml` hands the decision to a third-party action, where
#     no flag appears in this repository at all.
#
# EXC-013's `count: 3` was exactly right about what the regex could see and
# wrong about the world, and `docs/EXCEPTION-REGISTER.md` had said so in prose
# while every gate stayed green. A number that is only true of its own detector
# is the shape this file exists to refuse.
#
# So the set is enrolled rather than sniffed. Enrollment comes from
# `git ls-files`, so a seventh scheduled agent enrolls itself. Every enrolled
# file must end up CLASSIFIED: either a known bypass form is found in it, or it
# yields one `agent-invocation-unclassified` occurrence, which is unregistered
# and therefore an error until a human reads the file and records what it does.
# A renamed flag, a new agent CLI, or a runner that buries the decision inside
# an action all land in the second bucket instead of vanishing. "The list did
# not match" and "the agent asks before it acts" are not the same statement,
# and only the enrollment contract can tell them apart.
#
# Enrollment has two arms and a file is enrolled if EITHER says so, because
# each arm was measured green on a case the other caught:
#
#   naming   a tracked `*-scheduled.yml` under a `workflows/` directory.
#            Blind to `nightly-agent.yml`.
#   content  a tracked workflow carrying a cron trigger that starts an agent.
#            Blind to an agent CLI or a vendor action nobody has named below —
#            which is the same denylist shape one level up, so it cannot be
#            the only arm either.
#
# Neither is sufficient and the union is strictly stronger than both. A seventh
# agent that keeps the naming convention enrolls even if it runs something this
# file has never heard of; one that abandons the convention enrolls on its cron
# trigger and its command line. `tests/test_audit_exceptions.py` pins both
# directions with source neither arm's patterns can match by accident.
#
# Residual scope limit, stated rather than papered over: a workflow that both
# abandons the naming convention AND starts its agent through a runner named
# nowhere below is outside the contract. That is a smaller hole than either arm
# leaves alone, and it is not zero.

AGENT_BYPASS_KIND = "agent-permission-bypass"
AGENT_UNCLASSIFIED_KIND = "agent-invocation-unclassified"

_SCHEDULED_WORKFLOW_NAME = re.compile(r"-scheduled\.ya?ml$")
_WORKFLOW_ROOT_DIRS = frozenset({".github", ".gitea"})

# `on: schedule:` is the trigger that makes a run unattended. A workflow only a
# human dispatches has a human at the other end of the prompt.
_CRON_TRIGGER = re.compile(r"^\s*-?\s*cron:\s*['\"]?[\d*]", re.MULTILINE)

# Agent CLIs this repository runs unattended. Matched in command position — at
# the start of a line or after a shell separator — so a venture named after an
# agent, or a comment mentioning one, is not an invocation.
_AGENT_CLI_INVOCATION = re.compile(
    r"(?:^|[\s&|;(])(?:claude|cursor-agent|codex|gemini|grok|opencode|aider)"
    r"(?=[\s\\\"']|$)"
)

# Vendor actions that run an agent for us. There is no command line here, which
# is exactly why no flag list can see them.
_AGENT_ACTION = re.compile(
    r"^\s*(?:-\s+)?uses:\s*(?:anomalyco/opencode|anthropics/claude-code-action"
    r"|google-github-actions/run-gemini-cli)"
)

# `$AGENT_BIN`-style indirection, as in cursor-scheduled.yml.
_AGENT_BIN_INVOCATION = re.compile(r"\"?\$\{?AGENT_BIN\}?\"?")


@dataclass(frozen=True)
class BypassForm:
    pattern: str
    description: str
    #: Spellings that are ordinary outside an agent invocation. `--force` is
    #: `docker buildx` and `git push` in five other workflows in this
    #: repository, so matching it everywhere would bury the signal; inside an
    #: enrolled agent workflow it is the Cursor CLI's confirmation bypass.
    enrolled_only: bool = False

    def compiled(self) -> re.Pattern:
        return re.compile(self.pattern)


AGENT_BYPASS_FORMS: Sequence[BypassForm] = (
    BypassForm(
        r"--dangerously-skip-permissions\b",
        "Claude Code runs with every confirmation gate disabled",
    ),
    BypassForm(
        r"\bbypassPermissions\b",
        "Claude Code permission mode set to bypass",
    ),
    BypassForm(
        r"--dangerously-bypass-approvals-and-sandbox\b",
        "Codex approvals and sandbox both disabled",
    ),
    BypassForm(
        r"--sandbox[=\s]+danger-full-access\b",
        "Codex sandbox disabled: the agent has full host access",
    ),
    BypassForm(
        r"--ask-for-approval[=\s]+never\b",
        "Codex never asks for approval",
    ),
    BypassForm(
        r"--full-auto\b",
        "Codex runs fully automatically",
    ),
    BypassForm(
        r"--yolo\b",
        "Gemini CLI auto-approves every tool call",
    ),
    BypassForm(
        r"--approval-mode[=\s]+(?:yolo|auto[-_]edit)\b",
        "Gemini CLI approval mode set to auto-approve",
    ),
    BypassForm(
        r"--always-approve\b",
        "Grok CLI auto-approves every tool call",
    ),
    BypassForm(
        r"--auto-approve\b",
        "agent auto-approves every tool call",
    ),
    BypassForm(
        r"--trust-all-tools\b",
        "agent trusts every tool without confirmation",
    ),
    BypassForm(
        r"--force\b",
        "Cursor agent edits files and runs commands without confirmation",
        enrolled_only=True,
    ),
)

# Workflow YAML that is *not* an enrolled scheduled agent still gets the
# unambiguous forms, so a bypass in a dispatch-only or reusable workflow is not
# free. Scoped to YAML on purpose: the same flag names appear in shell comments
# in `ventures/ubuntu-agent-server` that explain why that host refuses to use
# them, and registering a warning against its own footgun would invert the
# meaning of the entry.
DETECTORS = tuple(DETECTORS) + (
    Detector(
        kind=AGENT_BYPASS_KIND,
        pattern="|".join(
            form.pattern for form in AGENT_BYPASS_FORMS if not form.enrolled_only
        ),
        extensions=frozenset(YAML_EXTENSIONS),
        description="unattended agent runs with its confirmation gates disabled",
    ),
)


def is_workflow_path(relative_path: str) -> bool:
    """True for a tracked CI workflow file, by structure rather than by a list."""
    parts = PurePosixPath(relative_path).parts
    if len(parts) < 3:
        return False
    if Path(relative_path).suffix not in YAML_EXTENSIONS:
        return False
    return parts[-2] == "workflows" and parts[-3] in _WORKFLOW_ROOT_DIRS


def has_scheduled_agent_name(relative_path: str) -> bool:
    """Enrollment arm 1: the repository's `*-scheduled.yml` naming convention."""
    if not is_workflow_path(relative_path):
        return False
    return bool(_SCHEDULED_WORKFLOW_NAME.search(PurePosixPath(relative_path).parts[-1]))


def runs_an_agent(content: str) -> bool:
    """True when some non-comment line of the workflow starts an agent.

    Comments are dropped first: `opencode-scheduled.yml` carries a fourteen-line
    comment about provider keys, and a workflow that only *talks* about an agent
    is not one that runs one.
    """
    for raw in content.splitlines():
        if _AGENT_ACTION.search(raw):
            return True
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if _AGENT_BIN_INVOCATION.search(line) or _AGENT_CLI_INVOCATION.search(line):
            return True
    return False


def starts_an_agent_on_a_schedule(content: str) -> bool:
    """Enrollment arm 2: a cron trigger plus an agent invocation, from content."""
    return bool(_CRON_TRIGGER.search(content)) and runs_an_agent(content)


def is_enrolled_agent_workflow(
    relative_path: str, content: Optional[str] = None
) -> bool:
    """True for a scheduled agent workflow, by structure rather than by a list.

    The union of the two arms documented above. `content` is optional so that
    the naming arm can be asked about a path alone; when it is supplied the
    content arm can enroll a file the naming convention does not reach.
    """
    if has_scheduled_agent_name(relative_path):
        return True
    if content is None or not is_workflow_path(relative_path):
        return False
    return starts_an_agent_on_a_schedule(content)


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


def classify_agent_workflow(relative_path: str, content: str) -> List[Occurrence]:
    """Classify one enrolled scheduled agent workflow, failing closed.

    A file in which no known bypass form appears yields an
    `agent-invocation-unclassified` occurrence rather than nothing. That
    occurrence has to be registered like any other, so a bypass form nobody has
    written a pattern for costs a register entry with an owner and an expiry
    instead of costing the control.
    """
    occurrences: List[Occurrence] = []
    for line_number, line in enumerate(content.splitlines(), start=1):
        for form in AGENT_BYPASS_FORMS:
            if form.compiled().search(line):
                occurrences.append(
                    Occurrence(
                        path=relative_path,
                        line=line_number,
                        kind=AGENT_BYPASS_KIND,
                        text=line.strip()[:200],
                        description=form.description,
                    )
                )
                break  # One occurrence per line: two flags is still one step.
    if occurrences:
        return occurrences
    return [
        Occurrence(
            path=relative_path,
            line=1,
            kind=AGENT_UNCLASSIFIED_KIND,
            text=f"{PurePosixPath(relative_path).name}: no recognised confirmation-gate flag",
            description=(
                "scheduled agent workflow whose confirmation gates cannot be "
                "read from the file"
            ),
        )
    ]


def scan_file(repo_root: Path, relative_path: str) -> List[Occurrence]:
    suffix = Path(relative_path).suffix
    candidates = [d for d in DETECTORS if suffix in d.extensions]
    # The content arm of enrollment needs the file itself, so a workflow is read
    # even when no detector applies to it. Same single read either way: the arm
    # costs no extra pass over the tree.
    if not candidates and not is_workflow_path(relative_path):
        return []

    absolute = repo_root / relative_path
    try:
        content = absolute.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return []

    enrolled = is_enrolled_agent_workflow(relative_path, content)
    # Enrolled files are classified by `classify_agent_workflow`, which knows
    # strictly more forms than the generic detector; running both would double
    # count every line they agree on.
    applicable = [
        d for d in candidates if not (enrolled and d.kind == AGENT_BYPASS_KIND)
    ]

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
    if enrolled:
        occurrences.extend(classify_agent_workflow(relative_path, content))
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
