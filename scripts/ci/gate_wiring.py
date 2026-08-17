#!/usr/bin/env python3
"""Refuses a control in `scripts/ci/` that nothing executes.

`platform/ci/test/gate-wiring.test.mjs` already asks the question underneath
every other control here — *does anything actually run it* — but it asks it
only of shell. Its orphan check is

    shellScripts().filter((relative) => path.basename(relative).startsWith('test-'))

so its whole input is `scripts/**/test-*.sh`, of which there are four. The
eighteen Python controls in this directory — the ones that hold the release
budget, the coverage floors, the image tags, the kill criteria and the
exception register — were audited by nothing for reachability. Twelve happen to
be registered in `scripts/test-ci.sh`; that they are is a property of twelve
separate commits, not of any rule, and nothing would have said so had one been
dropped.

One had already been dropped, and had never been picked up. `audit_killed_
ventures.py` was written, committed, given a five-case unittest, and named by no
runner, no workflow and no other module for its entire life. It also imported
`portfolio/router/allocate.py` and asked it for an allocation at
`total_budget_usd=500.0`, while the engine `scripts/test-ci.sh` actually runs is
`portfolio/router/router.py` at $300 — and it instructed venture owners to
record overrides under `kill_criteria_overrides`, a key read by `allocate.py`
alone. So the control was unreachable, and the remedy it printed pointed at a
register the authoritative engine does not consult. It is deleted in the same
change as this file; `scripts/ci/stopping_rule_review.py` does that job against
`portfolio/router/kill_criteria.py`, with a register, in both directions, and is
wired.

The standard here is deliberately the strict one: a control is wired when a
shell runner or a workflow **invokes** it. A pytest contract is a real execution
path — `scripts/test-ci.sh` registers `pytest` as a gate — but it is a weaker
claim, because a test can exercise a control entirely against scratch fixtures
and never once ask it about this repository. That is exactly what
`tests/test_audit_killed_ventures.py` did: five cases, every one of them against
a `tmp_path` skeleton, none against the tree the control was written to police.
So pytest-gated controls are registered below rather than counted as wired, and
their registration is only accepted when the named test is shown to reach the
real repository.

Registration is the `UNWATCHED_BUDGET_KEYS` shape from `scripts/ci/cap_ratchet.py`,
for the same reason: a reason nothing checks is a sentence that goes false in
silence while every count stays green. Each entry here carries a *typed*
predicate — `gated_by` for a pytest contract, `imported_by` for a library — and
`tests/test_gate_wiring.py` re-derives it from source on every run. An entry
whose predicate stops holding fails, so an exemption cannot outlive the fact
that earned it.

Usage:
    python3 scripts/ci/gate_wiring.py           # audit, exit 1 on failure
    python3 scripts/ci/gate_wiring.py --report  # measure, always exit 0
    python3 scripts/ci/gate_wiring.py --json    # machine-readable
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

REPO_ROOT = Path(__file__).resolve().parents[2]

#: The directory whose Python files are controls. Every `*.py` here is in scope.
CONTROL_DIR = "scripts/ci"

#: Shell that may register or invoke a gate. `scripts/test-ci.sh` is the runner
#: `verify-all.sh` and `.gitea/workflows/ci-cd.yml` both exec into; the other two
#: directories hold the contract scripts it shells out to.
RUNNER_DIRS: Tuple[str, ...] = ("scripts", "scripts/ci", "scripts/security")

WORKFLOW_DIR = ".gitea/workflows"

#: The interpreters an invocation can be spelled with. A line that names a
#: control without one of these is a path filter, a comment or prose — the
#: `deploy-services.yml` `paths:` list names `scripts/ci/terraform_images.py`
#: twice and runs it never, which is the false positive this exists to refuse.
INTERPRETERS: Tuple[str, ...] = ("python3", "python")

#: The ceiling on how many controls may sit unwired-but-registered. A register
#: that can absorb the whole directory is not a register. Watched downward by
#: `scripts/ci/cap_ratchet.py`, so the only direction it travels is toward zero.
MAX_UNWIRED_CONTROLS = 4

#: Furthest out a registration may be parked before it must be argued again.
MAX_REGISTRATION_DAYS = 180

PYTEST_GATED = "pytest-gated"
LIBRARY = "library"
REGISTRATION_KINDS = (PYTEST_GATED, LIBRARY)


class WiringError(Exception):
    """A failure that must not be reported as a pass."""


@dataclass(frozen=True)
class Registration:
    """A control deliberately not invoked from a runner, and the checked reason.

    Earned one control at a time. A directory- or glob-level entry would be a
    region in which "every control is executed" may quietly be untrue, which is
    the shape this repository has been bitten by in its claims controls and its
    budget ratchet alike.

    `why` is prose for a reader. It is not the control. What holds the entry
    honest is `kind` plus its typed evidence field, both of which
    `tests/test_gate_wiring.py` re-derives from source:

      * `kind=pytest-gated` requires `gated_by` — a `tests/*.py` that invokes
        this control *and* names `REPO_ROOT`, so the contract is known to reach
        this repository and not only a scratch fixture. It further requires that
        `scripts/test-ci.sh` still registers `pytest` as a gate, since that is
        the entire reason a pytest contract counts as an execution path.
      * `kind=library` requires `imported_by` — controls that import this
        module. It is accepted only when this file declares no
        `if __name__ == "__main__"` block, so it is genuinely not a gate with a
        missing invocation, and only when every named importer both imports it
        and itself executes: invoked from a runner, or registered here as
        `pytest-gated` and therefore holding its own checked predicate. A chain
        of exemptions that ends in nothing running is the defect, not the
        length of the chain.
    """

    path: str
    kind: str
    owner: str
    issue: str
    expires: str
    why: str
    gated_by: Optional[str] = None
    imported_by: Tuple[str, ...] = ()


#: The four controls in `scripts/ci/` that no runner invokes, each with the
#: predicate that makes its absence from `scripts/test-ci.sh` correct rather
#: than an oversight. Every field below was derived from the tree, not asserted:
#: see `tests/test_gate_wiring.py`, which recomputes all of it.
REGISTERED_UNWIRED: Tuple[Registration, ...] = (
    Registration(
        path="scripts/ci/release_lag.py",
        kind=PYTEST_GATED,
        owner="duncan",
        issue="docs/EXCEPTION-REGISTER.md#gate-wiring",
        expires="2027-01-31",
        gated_by="tests/test_release_lag.py",
        why=(
            "its own module docstring states that the CLI is not the gate and the pytest "
            "contract is, and `tests/test_gate_self_excuse.py` exists to keep that true — "
            "the file names "
            "`test_release_lag.py::test_this_repository_is_within_its_declared_budget` "
            "as one of the four real-repository assertions it parses. Registering the CLI "
            "in `scripts/test-ci.sh` as well would run the measurement twice under two "
            "names, which is the duplicate registration "
            "`platform/ci/test/gate-wiring.test.mjs` fails on."
        ),
    ),
    Registration(
        path="scripts/ci/branch_collisions.py",
        kind=PYTEST_GATED,
        owner="duncan",
        issue="docs/EXCEPTION-REGISTER.md#gate-wiring",
        expires="2027-01-31",
        gated_by="tests/test_branch_collisions.py",
        why=(
            "the same arrangement as `release_lag.py`, and the same reason. "
            "`tests/test_gate_self_excuse.py` names three of this file's methods, including "
            "`test_this_repository_is_within_the_collision_budget`, as real-repository "
            "assertions it parses for self-excusing branches. The CLI needs a reachable "
            "`origin/main` to say anything, so a `run_ci_test` entry would fail closed on "
            "every offline developer run while the pytest contract refuses correctly."
        ),
    ),
    Registration(
        path="scripts/ci/baseline_trust.py",
        kind=LIBRARY,
        owner="duncan",
        issue="docs/EXCEPTION-REGISTER.md#gate-wiring",
        expires="2027-01-31",
        imported_by=(
            "scripts/ci/release_lag.py",
            "scripts/ci/branch_collisions.py",
            "scripts/ci/deployment_lag.py",
            "scripts/ci/integration_debt.py",
        ),
        why=(
            "not a gate. It declares no `__main__`, and exists so that every control "
            "which measures against a baseline ref can agree on when that ref is "
            "untrustworthy — an unreachable remote, a diverged baseline, a ref written by "
            "hand rather than by a fetch. Each importer executes it on every run of its "
            "own contract, so wiring it separately would measure nothing new. The list is "
            "no longer the definition of who must import it: that is derived from source "
            "by `tests/test_gate_wiring.py::test_every_baseline_measuring_gate_verifies_"
            "its_baseline`, because this tuple said `release_lag` and `branch_collisions` "
            "while `deployment_lag` had joined them unlisted and `integration_debt` "
            "measured against `origin/main` importing nothing at all."
        ),
    ),
    Registration(
        path="scripts/ci/terraform_images.py",
        kind=LIBRARY,
        owner="duncan",
        issue="docs/EXCEPTION-REGISTER.md#gate-wiring",
        expires="2027-01-31",
        imported_by=("scripts/ci/image_tags.py", "scripts/ci/image_release_path.py"),
        why=(
            "not a gate. It declares no `__main__` and exports the Terraform-source scan "
            "that both image controls read, refusing by exception rather than judging. "
            "`.gitea/workflows/deploy-services.yml` names it in two `paths:` filters, "
            "which is a trigger and not an invocation — precisely the confusion this "
            "audit refuses to count as wiring — but both importers are registered in "
            "`scripts/test-ci.sh` and both run the scan."
        ),
    ),
)


def executing_controls(wired: Sequence[str]) -> List[str]:
    """Controls known to run: invoked by a runner, or gated by a real pytest contract.

    Used only to close the `library` chain. A library is excused because
    something else executes it, so "something else" has to mean a control that
    demonstrably executes — and a `pytest-gated` registration is exactly that
    claim, carrying its own predicate checked in the same pass.
    """
    gated = [
        registration.path
        for registration in REGISTERED_UNWIRED
        if registration.kind == PYTEST_GATED
    ]
    return sorted(set(wired) | set(gated))


@dataclass
class Finding:
    check: str
    message: str


@dataclass
class Invocation:
    control: str
    source: str
    line: int
    text: str


@dataclass
class Measurement:
    controls: List[str] = field(default_factory=list)
    invocations: List[Invocation] = field(default_factory=list)
    wired: List[str] = field(default_factory=list)
    registered: List[str] = field(default_factory=list)
    unwired: List[str] = field(default_factory=list)
    findings: List[Finding] = field(default_factory=list)


def strip_comment(line: str) -> str:
    """Return `line` up to the first comment marker outside a quoted run.

    Literal by design, like the detectors in `platform/ci/test/gate-wiring.test.mjs`:
    it reads text and does not pretend to parse shell or YAML. What it must get
    right is the only case that matters here — a control named inside a comment
    is not an invocation of it, and this directory's runners carry a paragraph
    of prose above every registered gate.
    """
    quote: Optional[str] = None
    for index, char in enumerate(line):
        if quote is not None:
            if char == quote:
                quote = None
            continue
        if char in ("'", '"'):
            quote = char
            continue
        if char == "#" and (index == 0 or line[index - 1].isspace()):
            return line[:index]
    return line


def _invocation_pattern(basename: str) -> re.Pattern:
    escaped = re.escape(basename)
    interpreters = "|".join(re.escape(i) for i in INTERPRETERS)
    return re.compile(rf"(?:^|[\s/\"']|\b)(?:{interpreters})\s[^\n]*{escaped}(?![\w.])")


def invocations_in(text: str, basename: str, source: str, control: str) -> List[Invocation]:
    """Lines of `text` that run `basename` through an interpreter.

    Requiring an interpreter on the same line is what separates an invocation
    from a mention. `- "scripts/ci/terraform_images.py"` under a workflow
    `paths:` key names the file and never runs it; `run: python3
    scripts/ci/image_tags.py` runs it. Both would match a bare substring search,
    and one of them is a control that has never executed.
    """
    pattern = _invocation_pattern(basename)
    found: List[Invocation] = []
    for index, raw in enumerate(text.split("\n")):
        line = strip_comment(raw)
        if pattern.search(line):
            found.append(Invocation(control=control, source=source, line=index + 1, text=raw.strip()))
    return found


def control_paths(repo_root: Path) -> List[str]:
    directory = repo_root / CONTROL_DIR
    if not directory.is_dir():
        raise WiringError(f"{CONTROL_DIR} does not exist; this audit has no subject")
    paths = sorted(
        str(path.relative_to(repo_root)).replace("\\", "/")
        for path in directory.glob("*.py")
        if path.name != "__init__.py"
    )
    if not paths:
        raise WiringError(
            f"{CONTROL_DIR} contains no controls. An empty enumeration passes every check "
            "below, which is the vacuous-glob failure this repository has already shipped once."
        )
    return paths


def runner_sources(repo_root: Path) -> List[str]:
    """Shell runners and workflows, as repository-relative paths."""
    sources: List[str] = []
    for relative in RUNNER_DIRS:
        directory = repo_root / relative
        if not directory.is_dir():
            continue
        sources.extend(
            f"{relative}/{path.name}" for path in sorted(directory.glob("*.sh"))
        )
    workflows = repo_root / WORKFLOW_DIR
    if workflows.is_dir():
        sources.extend(
            f"{WORKFLOW_DIR}/{path.name}" for path in sorted(workflows.glob("*.yml"))
        )
    if not sources:
        raise WiringError(
            "no runners or workflows found. With no sources to search, every control "
            "reads as unwired and the audit would be measuring its own blindness."
        )
    return sorted(sources)


def find_invocations(repo_root: Path) -> List[Invocation]:
    controls = control_paths(repo_root)
    sources = runner_sources(repo_root)
    found: List[Invocation] = []
    for source in sources:
        text = (repo_root / source).read_text(encoding="utf-8", errors="replace")
        for control in controls:
            basename = control.rsplit("/", 1)[-1]
            found.extend(invocations_in(text, basename, source, control))
    return found


def pytest_is_registered(repo_root: Path) -> bool:
    """Whether `scripts/test-ci.sh` still runs the Python suite as a named gate.

    Every `pytest-gated` registration rests on this one fact. If the entry
    disappears, four controls stop executing at once and each registration below
    becomes a false statement, so it is checked rather than assumed.
    """
    runner = repo_root / "scripts/test-ci.sh"
    if not runner.is_file():
        return False
    for raw in runner.read_text(encoding="utf-8", errors="replace").split("\n"):
        line = strip_comment(raw)
        if re.search(r'^\s*run_ci_test\s+"[^"]+"\s+pytest\b', line):
            return True
    return False


def declares_main(repo_root: Path, control: str) -> bool:
    path = repo_root / control
    if not path.is_file():
        return False
    source = path.read_text(encoding="utf-8", errors="replace")
    return re.search(r'^if __name__ == ["\']__main__["\']', source, re.MULTILINE) is not None


def imports_module(repo_root: Path, importer: str, module: str) -> bool:
    """Whether `importer` imports the module `module` names, in either spelling.

    Controls in this directory are run as scripts and put their own directory on
    `sys.path`, so a sibling is imported as a bare top-level module rather than a
    package attribute. Both forms are accepted; neither is inferred.
    """
    path = repo_root / importer
    if not path.is_file():
        return False
    name = re.escape(module.rsplit("/", 1)[-1][: -len(".py")])
    source = path.read_text(encoding="utf-8", errors="replace")
    patterns = (
        rf"^\s*from\s+{name}\s+import\b",
        rf"^\s*import\s+{name}\b",
        rf"^\s*from\s+[\w.]*\.{name}\s+import\b",
    )
    return any(re.search(pattern, source, re.MULTILINE) for pattern in patterns)


def _parse_expiry(value: str) -> Optional[date]:
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


def registration_findings(
    repo_root: Path,
    registration: Registration,
    wired: Sequence[str],
    today: date,
) -> List[Finding]:
    """Everything that must still be true for one entry, recomputed from source."""
    findings: List[Finding] = []
    label = registration.path

    if not (repo_root / registration.path).is_file():
        findings.append(
            Finding(
                "registration-stale",
                f"{label} is registered as unwired and does not exist. An entry that "
                "outlives its subject is a permission waiting for a file of the same "
                "name to be added back without review.",
            )
        )
        return findings

    if registration.path in wired:
        findings.append(
            Finding(
                "registration-redundant",
                f"{label} is registered as unwired and is invoked by a runner. Remove the "
                "registration — a live entry beside a live invocation is how a register "
                "drifts into a list of permissions nobody reads.",
            )
        )

    for name, value in (("owner", registration.owner), ("issue", registration.issue)):
        if not value.strip():
            findings.append(Finding("registration-incomplete", f"{label} has no {name}"))

    expiry = _parse_expiry(registration.expires)
    if expiry is None:
        findings.append(
            Finding("registration-incomplete", f"{label} has no readable `expires` date")
        )
    elif expiry < today:
        findings.append(
            Finding(
                "registration-expired",
                f"{label} was registered until {registration.expires}, which has passed. "
                "Wire it, delete it, or argue for it again.",
            )
        )
    elif (expiry - today).days > MAX_REGISTRATION_DAYS:
        findings.append(
            Finding(
                "registration-unreviewed",
                f"{label} is parked until {registration.expires}, more than "
                f"{MAX_REGISTRATION_DAYS} days out. A permission that never comes up for "
                "review is a policy change made without one.",
            )
        )

    if registration.kind == PYTEST_GATED:
        findings.extend(_pytest_gated_findings(repo_root, registration))
    elif registration.kind == LIBRARY:
        findings.extend(_library_findings(repo_root, registration, wired))
    else:
        findings.append(
            Finding(
                "registration-incomplete",
                f"{label} has kind {registration.kind!r}, which carries no predicate. "
                f"Use one of {', '.join(REGISTRATION_KINDS)}.",
            )
        )

    return findings


def _pytest_gated_findings(repo_root: Path, registration: Registration) -> List[Finding]:
    label = registration.path
    findings: List[Finding] = []

    if not pytest_is_registered(repo_root):
        findings.append(
            Finding(
                "pytest-gate-missing",
                f"{label} is registered as gated by pytest, and `scripts/test-ci.sh` no "
                "longer runs pytest as a named gate. The execution path the registration "
                "rests on is gone.",
            )
        )

    gated_by = registration.gated_by
    if not gated_by:
        findings.append(
            Finding(
                "registration-incomplete",
                f"{label} is registered as pytest-gated and names no test file",
            )
        )
        return findings

    test_path = repo_root / gated_by
    if not test_path.is_file():
        findings.append(
            Finding(
                "registration-stale",
                f"{label} names {gated_by} as its gate and that file does not exist",
            )
        )
        return findings

    source = test_path.read_text(encoding="utf-8", errors="replace")
    basename = registration.path.rsplit("/", 1)[-1]
    module = basename[: -len(".py")]
    exercises = re.search(rf"{re.escape(basename)}", source) or re.search(
        rf"^\s*(?:from|import)\s+{re.escape(module)}\b", source, re.MULTILINE
    )
    if not exercises:
        findings.append(
            Finding(
                "registration-stale",
                f"{gated_by} does not mention {basename}, so it is not the gate the "
                f"registration for {label} claims it is.",
            )
        )
    if "REPO_ROOT" not in source:
        findings.append(
            Finding(
                "fixture-only-gate",
                f"{gated_by} never names REPO_ROOT, so it exercises {label} against "
                "scratch fixtures alone and never asks it about this repository. That is a "
                "proof the code works, not a gate on the tree.",
            )
        )
    return findings


def _library_findings(
    repo_root: Path, registration: Registration, wired: Sequence[str]
) -> List[Finding]:
    label = registration.path
    findings: List[Finding] = []

    if declares_main(repo_root, registration.path):
        findings.append(
            Finding(
                "library-has-entrypoint",
                f"{label} is registered as a library and declares an "
                "`if __name__ == \"__main__\"` block, so it is a gate with no invocation "
                "rather than a module. Wire it or drop the entrypoint.",
            )
        )

    if not registration.imported_by:
        findings.append(
            Finding(
                "registration-incomplete",
                f"{label} is registered as a library and names no importer. A module "
                "nothing imports is dead code, not an exempt control.",
            )
        )
        return findings

    for importer in registration.imported_by:
        if not (repo_root / importer).is_file():
            findings.append(
                Finding(
                    "registration-stale",
                    f"{label} names {importer} as an importer and that file does not exist",
                )
            )
            continue
        if not imports_module(repo_root, importer, registration.path):
            findings.append(
                Finding(
                    "registration-stale",
                    f"{importer} does not import {label}, so the registration's evidence "
                    "is no longer true.",
                )
            )
        if importer not in executing_controls(wired):
            findings.append(
                Finding(
                    "library-importer-unwired",
                    f"{label} is excused because {importer} runs it, and {importer} is "
                    "neither invoked by a runner nor gated by a pytest contract. The chain "
                    "of exemptions ends in nothing executing.",
                )
            )
    return findings


def measure(repo_root: Path, today: Optional[date] = None) -> Measurement:
    today = today or date.today()
    measurement = Measurement()
    measurement.controls = control_paths(repo_root)
    measurement.invocations = find_invocations(repo_root)

    wired = sorted({invocation.control for invocation in measurement.invocations})
    measurement.wired = wired

    registered_by_path: Dict[str, Registration] = {}
    for registration in REGISTERED_UNWIRED:
        if registration.path in registered_by_path:
            measurement.findings.append(
                Finding(
                    "registration-duplicate",
                    f"{registration.path} is registered twice; the second entry can be "
                    "deleted as a duplicate while taking a real reason with it.",
                )
            )
            continue
        registered_by_path[registration.path] = registration
    measurement.registered = sorted(registered_by_path)

    measurement.unwired = [
        control
        for control in measurement.controls
        if control not in wired and control not in registered_by_path
    ]

    for control in measurement.unwired:
        measurement.findings.append(
            Finding(
                "unwired-control",
                f"{control} is invoked by no runner and no workflow, and is not registered. "
                "It has never executed. Wire it in `scripts/test-ci.sh`, delete it, or add a "
                "Registration to REGISTERED_UNWIRED in scripts/ci/gate_wiring.py carrying the "
                "predicate that makes its absence correct.",
            )
        )

    for registration in REGISTERED_UNWIRED:
        measurement.findings.extend(
            registration_findings(repo_root, registration, wired, today)
        )

    live = [
        registration.path
        for registration in REGISTERED_UNWIRED
        if registration.path not in wired and (repo_root / registration.path).is_file()
    ]
    if len(live) > MAX_UNWIRED_CONTROLS:
        measurement.findings.append(
            Finding(
                "register-over-cap",
                f"{len(live)} controls are registered as unwired and the ceiling is "
                f"{MAX_UNWIRED_CONTROLS}. A register that can absorb the directory is not a "
                "register.",
            )
        )

    return measurement


def format_report(measurement: Measurement) -> str:
    lines = [
        "Gate wiring — every control in scripts/ci/ is invoked, or registered with a reason",
        "",
        f"  controls        {len(measurement.controls)}",
        f"  wired           {len(measurement.wired)}",
        f"  registered      {len(measurement.registered)}",
        f"  unwired         {len(measurement.unwired)}",
        "",
    ]
    for control in measurement.controls:
        sources = sorted(
            {
                f"{invocation.source}:{invocation.line}"
                for invocation in measurement.invocations
                if invocation.control == control
            }
        )
        if sources:
            lines.append(f"  WIRED       {control}  <- {', '.join(sources)}")
        elif control in measurement.registered:
            registration = next(r for r in REGISTERED_UNWIRED if r.path == control)
            evidence = registration.gated_by or ", ".join(registration.imported_by)
            lines.append(
                f"  REGISTERED  {control}  ({registration.kind}: {evidence}, "
                f"expires {registration.expires})"
            )
        else:
            lines.append(f"  UNWIRED     {control}  <- nothing")
    if measurement.findings:
        lines.extend(["", "Findings:"])
        lines.extend(f"  [{f.check}] {f.message}" for f in measurement.findings)
    return "\n".join(lines)


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Refuse a control in scripts/ci/ that no runner or workflow executes."
    )
    parser.add_argument("--repo-root", default=str(REPO_ROOT))
    parser.add_argument("--report", action="store_true", help="measure and print, always exit 0")
    parser.add_argument("--json", action="store_true", help="machine-readable measurement")
    args = parser.parse_args(argv)

    repo_root = Path(args.repo_root).resolve()
    try:
        measurement = measure(repo_root)
    except WiringError as exc:
        # A refusal is a failure. It is never a pass: this audit cannot tell
        # "nothing is unwired" from "I could not look" except by saying so.
        print(f"gate-wiring: refusing to report a result — {exc}", file=sys.stderr)
        return 0 if args.report else 1

    if args.json:
        print(
            json.dumps(
                {
                    "controls": measurement.controls,
                    "wired": measurement.wired,
                    "registered": measurement.registered,
                    "unwired": measurement.unwired,
                    "findings": [asdict(f) for f in measurement.findings],
                },
                indent=2,
            )
        )
    else:
        print(format_report(measurement))

    if args.report:
        return 0
    return 1 if measurement.findings else 0


if __name__ == "__main__":
    sys.exit(main())
