#!/usr/bin/env python3
"""
Venture contract validator.

The router allocates real budget from `ventures/*/VENTURE.yaml`. Three fields
move money, and nothing currently checks that any of them reflect reality:

- `economics.mrr` — `null` (unmeasured) earns 0.65 explore credit, a measured
  `0` earns 0.30. A venture that has been measured at zero but still says `null`
  collects more than double the economics credit it earned.
- `hypotheses[].status` — every status other than `untested` adds +0.1 to the
  composite score. Nothing verifies the claim was actually tested. A `supported`
  claim must be backed by either measured revenue or an explicit `evidence:`
  citation; "we believe it" is `untested`.
- `stage` — `launched` weights 0.75 against `prototype` at 0.55. A venture with
  no production link is not launched.
- `links.production` — the field that says a customer can reach the venture.
  Asking only whether it is *set* is what let `retail-pilot-intel` declare
  `https://retail-pilot-intel.pages.dev`, a hostname that resolves nowhere and
  that nothing in this repository deploys to: the venture's own workflow
  publishes to GitHub Pages, so the URL names the wrong hosting provider
  entirely. A venture nobody can reach cannot earn, and the only rule guarding
  the field would have passed it straight through a promotion to `launched`.

`portfolio/ledger/README.md` states the rule this enforces: "Record outcomes
even when they are nothing." A contract that drifts from the ledger destroys the
only signal the router has, and it drifts in the flattering direction by default.

Run `python3 portfolio/router/validate_ventures.py` to report, or with
`--strict` to exit non-zero on warnings as well as errors.
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import os
import re
import sys
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple
from urllib.parse import urlsplit

import yaml

try:
    # Importable as a package (pytest sets `pythonpath`), and runnable as a
    # script, which puts this directory on sys.path instead of the repo root.
    from portfolio.router import kill_criteria
except ImportError:
    import kill_criteria

REVENUE_STAGES = {"launched", "revenue", "scaling"}
VALID_STAGES = {"idea", "prototype", "launched", "revenue", "scaling", "winding-down"}
VALID_HYPOTHESIS_STATUSES = {"untested", "supported", "refuted"}

# --- What counts as evidence that the repository can serve a hostname ---------
#
# A production URL is backed when deployment or operations machinery names its
# hostname. The set below is deliberately an allowlist of places that *do*
# something with a host — route to it, build it, publish to it, smoke-test it —
# rather than a search of the whole tree. Prose is excluded on purpose: a README
# sentence claiming a venture is live is the claim under test, not evidence for
# it, and a repo-wide grep would let any such sentence satisfy the rule.

DEPLOYMENT_DIR_NAMES = {
    "workflows",
    "k8s",
    "kubernetes",
    "terraform",
    "deploy",
    "deployment",
    "scripts",
    "platform",
    "infra",
    "infrastructure",
    "helm",
    "charts",
}

DEPLOYMENT_FILE_GLOBS = (
    "vercel*.json",
    "wrangler.toml",
    "netlify.toml",
    "fly.toml",
    "Procfile",
    "Dockerfile*",
    "docker-compose*.yml",
    "docker-compose*.yaml",
    "*.tf",
    "*.tfvars",
    "*.conf",
    "CNAME",
)

# Documentation asserts; it does not deploy.
PROSE_SUFFIXES = {".md", ".markdown", ".rst", ".txt", ".adoc"}

PRUNED_DIR_NAMES = {
    ".git",
    "node_modules",
    "__pycache__",
    ".venv",
    "venv",
    "dist",
    "build",
    ".next",
    ".turbo",
    ".cache",
    "coverage",
    "out",
}

# A fixture or a test asserting the hostname is not a deployment of it.
TEST_DIR_NAMES = {"test", "tests", "__tests__", "e2e", "fixtures", "__fixtures__"}
TEST_FILE_GLOBS = ("test_*", "*_test.*", "*.test.*", "*.spec.*")

MAX_SCANNED_FILE_BYTES = 2 * 1024 * 1024


def production_hostname(url: Any) -> Optional[str]:
    """The lowercased hostname of a production URL, or None if it has none."""
    if not isinstance(url, str) or not url.strip():
        return None
    parsed = urlsplit(url.strip())
    if not parsed.scheme or not parsed.hostname:
        return None
    return parsed.hostname.lower()


def _is_test_path(path: Path) -> bool:
    if any(part in TEST_DIR_NAMES for part in path.parts):
        return True
    return any(fnmatch.fnmatch(path.name, glob) for glob in TEST_FILE_GLOBS)


def is_deployment_file(relative_path: Path) -> bool:
    """Whether a repo-relative path is deployment or operations machinery."""
    if relative_path.name == "VENTURE.yaml":
        # The contract making the claim cannot be the evidence for it.
        return False
    if relative_path.suffix.lower() in PROSE_SUFFIXES:
        return False
    if _is_test_path(relative_path):
        return False

    if any(part in DEPLOYMENT_DIR_NAMES for part in relative_path.parts[:-1]):
        return True
    return any(fnmatch.fnmatch(relative_path.name, glob) for glob in DEPLOYMENT_FILE_GLOBS)


def _hostname_pattern(hostname: str) -> "re.Pattern[str]":
    # Bounded so `example.com` is not matched by `notexample.com` or by
    # `example.com.attacker.net`.
    return re.compile(
        r"(?<![A-Za-z0-9.-])" + re.escape(hostname) + r"(?![A-Za-z0-9-]|\.[A-Za-z0-9])",
        re.IGNORECASE,
    )


def find_backed_hostnames(repo_root: Path, hostnames: Iterable[str]) -> Set[str]:
    """Of the given hostnames, those named by deployment machinery in the repo."""
    wanted = {h.lower() for h in hostnames if h}
    if not wanted:
        return set()

    patterns = {host: _hostname_pattern(host) for host in wanted}
    backed: Set[str] = set()

    for dirpath, dirnames, filenames in os.walk(repo_root):
        dirnames[:] = [d for d in dirnames if d not in PRUNED_DIR_NAMES]
        directory = Path(dirpath)

        for filename in filenames:
            if len(backed) == len(wanted):
                return backed

            relative = (directory / filename).relative_to(repo_root)
            if not is_deployment_file(relative):
                continue

            absolute = directory / filename
            try:
                if absolute.stat().st_size > MAX_SCANNED_FILE_BYTES:
                    continue
                text = absolute.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue

            for host, pattern in patterns.items():
                if host not in backed and pattern.search(text):
                    backed.add(host)

    return backed


@dataclass
class Finding:
    venture: str
    severity: str  # "error" | "warn"
    code: str
    message: str
    remedy: str

    def format_line(self) -> str:
        marker = "ERROR" if self.severity == "error" else " WARN"
        return f"[{marker}] {self.venture}: {self.message}\n         → {self.remedy}"


def find_repo_root(start: Optional[Path] = None) -> Path:
    current = (start or Path(__file__).resolve()).resolve()
    for candidate in [current, *current.parents]:
        if (candidate / "ventures").is_dir() and (candidate / "portfolio").is_dir():
            return candidate
    raise RuntimeError("Could not locate repository root from " + str(current))


def load_latest_ledger_mrr(repo_root: Path) -> Dict[str, Optional[float]]:
    """Maps venture name to the most recent recorded `mrr_end`, if any."""
    ledger_dir = repo_root / "portfolio" / "ledger"
    if not ledger_dir.is_dir():
        return {}

    ledger_files = sorted(p for p in ledger_dir.glob("*.yaml"))
    if not ledger_files:
        return {}

    recorded: Dict[str, Optional[float]] = {}
    # Later files win, so the newest period is authoritative.
    for ledger_file in ledger_files:
        try:
            with open(ledger_file, "r", encoding="utf-8") as handle:
                data = yaml.safe_load(handle) or {}
        except yaml.YAMLError as exc:
            print(f"Warning: could not parse {ledger_file}: {exc}", file=sys.stderr)
            continue

        for entry in data.get("entries", []) or []:
            name = entry.get("venture")
            if not name:
                continue
            if "mrr_end" in entry:
                recorded[name] = entry.get("mrr_end")

    return recorded


def validate_venture(
    data: Dict[str, Any],
    name: str,
    ledger_mrr: Dict[str, Optional[float]],
    backed_hostnames: Optional[Set[str]] = None,
) -> List[Finding]:
    """Validate one contract.

    `backed_hostnames` is the set of production hostnames the repository can
    actually serve, as computed by `find_backed_hostnames`. Omitting it means
    *nothing* is backed, not that the rule is skipped — a caller that forgets to
    supply it gets the finding rather than silence.
    """
    findings: List[Finding] = []
    backed = backed_hostnames if backed_hostnames is not None else set()

    stage = str(data.get("stage", "")).lower()
    economics = data.get("economics") or {}
    links = data.get("links") or {}
    budget = data.get("budget") or {}
    hypotheses = data.get("hypotheses") or []

    if stage not in VALID_STAGES:
        findings.append(
            Finding(
                venture=name,
                severity="error",
                code="invalid-stage",
                message=f"stage '{stage or '(missing)'}' is not a recognised stage",
                remedy=f"Set stage to one of: {', '.join(sorted(VALID_STAGES))}",
            )
        )

    declared_mrr = economics.get("mrr")
    measured_mrr = ledger_mrr.get(name)

    if declared_mrr is None and measured_mrr is not None:
        findings.append(
            Finding(
                venture=name,
                severity="warn",
                code="stale-unmeasured-mrr",
                message=(
                    f"economics.mrr is null (unmeasured) but the ledger records "
                    f"mrr_end: {measured_mrr}"
                ),
                remedy=(
                    f"Set economics.mrr to {measured_mrr}. Unmeasured earns 0.65 "
                    "explore credit; a measured zero earns 0.30, so leaving this "
                    "null overstates the venture's allocation."
                ),
            )
        )

    has_revenue_evidence = bool(
        (declared_mrr is not None and declared_mrr > 0)
        or (measured_mrr is not None and measured_mrr > 0)
    )

    for index, hypothesis in enumerate(hypotheses):
        status = str(hypothesis.get("status", "untested")).lower()
        claim = str(hypothesis.get("claim", "")).strip()

        if status not in VALID_HYPOTHESIS_STATUSES:
            findings.append(
                Finding(
                    venture=name,
                    severity="error",
                    code="invalid-hypothesis-status",
                    message=f"hypothesis[{index}] status '{status}' is not recognised",
                    remedy=f"Use one of: {', '.join(sorted(VALID_HYPOTHESIS_STATUSES))}",
                )
            )
            continue

        # Not every hypothesis is a willingness-to-pay claim, so revenue is not
        # the only admissible proof — but something has to be cited. An
        # `evidence:` line naming the benchmark, experiment, or customer that
        # settled the question is enough; an unsourced assertion is not.
        cited_evidence = str(hypothesis.get("evidence") or "").strip()

        if status == "supported" and not has_revenue_evidence and not cited_evidence:
            findings.append(
                Finding(
                    venture=name,
                    severity="warn",
                    code="unearned-hypothesis-support",
                    message=(
                        f"hypothesis[{index}] is marked 'supported' with neither "
                        f"measured revenue nor cited evidence: {claim[:80]}"
                    ),
                    remedy=(
                        "Add an `evidence:` line naming the benchmark, experiment, or "
                        "paying customer that settled it, or set status to 'untested'. "
                        "Each non-untested hypothesis adds +0.1 to the venture's "
                        "composite allocation score."
                    ),
                )
            )

        if status != "untested" and not hypothesis.get("checked"):
            findings.append(
                Finding(
                    venture=name,
                    severity="warn",
                    code="missing-hypothesis-check-date",
                    message=f"hypothesis[{index}] is '{status}' but has no `checked` date",
                    remedy="Add `checked: YYYY-MM-DD` recording when it was evaluated",
                )
            )

    declared_production = links.get("production")

    if stage in REVENUE_STAGES and not declared_production:
        findings.append(
            Finding(
                venture=name,
                severity="warn",
                code="launched-without-production-link",
                message=f"stage is '{stage}' but links.production is not set",
                remedy=(
                    "Add the production URL, or move the stage back to 'prototype'. "
                    "'launched' carries a 0.75 stage weight against 0.55 for prototype."
                ),
            )
        )

    if declared_production:
        hostname = production_hostname(declared_production)
        if hostname is None:
            findings.append(
                Finding(
                    venture=name,
                    severity="error",
                    code="unparseable-production-link",
                    message=(
                        f"links.production '{declared_production}' is not an absolute "
                        "URL with a hostname"
                    ),
                    remedy=(
                        "Write the full URL including scheme, e.g. "
                        "'https://example.com', or set it to null."
                    ),
                )
            )
        elif hostname not in backed:
            # A hostname the repository cannot serve is an aspiration. It is an
            # error once stage weighting is drawing budget on the claim, and a
            # warning before that — both fail `--strict`, which is how
            # `scripts/test-ci.sh` runs this.
            findings.append(
                Finding(
                    venture=name,
                    severity="error" if stage in REVENUE_STAGES else "warn",
                    code="unbacked-production-link",
                    message=(
                        f"links.production points at '{hostname}', which no workflow, "
                        "deploy script, or infrastructure config in this repository "
                        "publishes to"
                    ),
                    remedy=(
                        "Point it at the hostname the venture actually deploys to, add "
                        "the deployment that serves this one, or set it to null. "
                        "links.production is the field that says a customer can reach "
                        "the venture; a README sentence is not evidence, because that "
                        "sentence is the claim being checked."
                    ),
                )
            )

    if budget.get("protected") and not (data.get("kill_criteria") or []):
        findings.append(
            Finding(
                venture=name,
                severity="error",
                code="protected-without-kill-criteria",
                message="budget.protected is true but no kill_criteria are defined",
                remedy=(
                    "A protected venture draws budget regardless of return. Without "
                    "kill criteria there is no condition under which it stops."
                ),
            )
        )

    if "monthly_cap" not in budget:
        findings.append(
            Finding(
                venture=name,
                severity="error",
                code="missing-monthly-cap",
                message="budget.monthly_cap is not set",
                remedy="Set an explicit monthly_cap; the router otherwise assumes $50.",
            )
        )

    findings.extend(find_dominated_criteria(name, data.get("kill_criteria") or []))

    return findings


def _criterion_signature(criterion: Any) -> Optional[Tuple[Tuple[str, str], ...]]:
    """The metric/comparator shape of a structured criterion, ignoring thresholds.

    Two criteria that match on this shape differ only in their numbers, which is
    what makes one of them capable of dominating the other.
    """
    if not isinstance(criterion, dict):
        return None
    conditions = criterion.get("when")
    if not isinstance(conditions, list) or not conditions:
        return None
    signature = []
    for condition in conditions:
        if not isinstance(condition, dict):
            return None
        metric = condition.get("metric")
        comparator = condition.get("comparator")
        if not isinstance(metric, str) or not isinstance(comparator, str):
            return None
        signature.append((metric, comparator))
    return tuple(sorted(signature))


def _thresholds(criterion: Any) -> Optional[Dict[Tuple[str, str], float]]:
    signature = _criterion_signature(criterion)
    if signature is None:
        return None
    thresholds: Dict[Tuple[str, str], float] = {}
    for condition in criterion["when"]:
        threshold = condition.get("threshold")
        if isinstance(threshold, bool) or not isinstance(threshold, (int, float)):
            return None
        key = (condition["metric"], condition["comparator"])
        # A criterion naming the same metric/comparator twice is malformed; the
        # evaluator ANDs both, so keep the binding one rather than guessing.
        if key in thresholds:
            thresholds[key] = min(thresholds[key], float(threshold))
        else:
            thresholds[key] = float(threshold)
    return thresholds


def _dominates(looser: Dict[Tuple[str, str], float], tighter: Dict[Tuple[str, str], float]) -> bool:
    """True when `tighter` fires no later than `looser`, so `looser` never adds anything.

    For a `>=` condition a lower threshold is reached first; for `<=` a higher
    one is. `==` must match exactly to be comparable at all. Comparators outside
    this set are left alone rather than guessed at — a wrong dedup here would
    delete a real stopping rule.
    """
    if set(looser) != set(tighter):
        return False
    for key, looser_threshold in looser.items():
        _, comparator = key
        tighter_threshold = tighter[key]
        if comparator in (">=", ">"):
            if tighter_threshold > looser_threshold:
                return False
        elif comparator in ("<=", "<"):
            if tighter_threshold < looser_threshold:
                return False
        elif comparator == "==":
            if tighter_threshold != looser_threshold:
                return False
        else:
            return False
    # Every condition in `tighter` is reached no later than its counterpart in
    # `looser`. Equal on all of them is an exact duplicate, which is dominated
    # too — the caller keeps the earlier of such a pair.
    return True


def find_dominated_criteria(name: str, criteria: Sequence[Any]) -> List[Finding]:
    """Flag a stopping rule that can never be the one that fires.

    `portfolio/router/allocate.py` ORs the criteria together and a single
    trigger kills the venture, so a criterion that cannot become true before
    another one already has contributes nothing but a duplicated line in
    `kill_reasons`. This exists because ten of twelve ventures acquired exactly
    that on 2026-08-03 — three of them the same `>= 150 / == 0` rule declared
    twice in the same file — when parallel agents each added a stopping rule to
    ventures that already had one. Duplicated work across concurrent sessions is
    this repository's most common defect; this makes one instance of it
    mechanical to catch.

    Conservative by construction: only structured criteria with identical
    metric/comparator sets are compared, and only over comparators whose
    ordering is unambiguous. Prose criteria and anything it cannot reason about
    are left alone, because deleting a real brake is far worse than keeping a
    redundant one.
    """
    findings: List[Finding] = []
    parsed = [(index, _thresholds(criterion)) for index, criterion in enumerate(criteria)]
    comparable = [(index, thresholds) for index, thresholds in parsed if thresholds]

    for position, (index, thresholds) in enumerate(comparable):
        for other_position, (other_index, other_thresholds) in enumerate(comparable):
            if position == other_position:
                continue
            # An exact duplicate dominates both ways; keep the earlier one so
            # the pair produces one finding rather than two.
            if thresholds == other_thresholds and other_position > position:
                continue
            if _dominates(thresholds, other_thresholds):
                findings.append(
                    Finding(
                        venture=name,
                        severity="warn",
                        code="dominated-kill-criterion",
                        message=(
                            f"kill_criteria[{index}] can never be the criterion that fires: "
                            f"kill_criteria[{other_index}] has the same conditions and reaches "
                            f"them no later"
                        ),
                        remedy=(
                            "Delete the redundant criterion, or change what it measures. "
                            "Criteria are ORed and one trigger kills the venture, so this "
                            "one only ever duplicates a line in kill_reasons."
                        ),
                    )
                )
                break

    return findings


def validate_kill_criteria(root: Path) -> List[Finding]:
    """Surface every kill criterion that has actually fired.

    `budget.protected` above demands kill criteria on the grounds that without
    them "there is no condition under which it stops" — but until 2026-08-03 a
    line of prose satisfied that check while `allocate.py` read the criteria
    into an unused variable. Declaring a criterion and evaluating one were
    entirely unrelated acts. This closes the join: a criterion that fires is
    reported here, next to the contract that demanded it, rather than only
    inside an allocation report nobody opens.

    How many ventures have no evaluable criterion at all is a portfolio-level
    number rather than a per-venture one, and is held by
    `scripts/ci/kill_criteria_ratchet.py` against
    `platform/kill-criteria-baseline.yaml`. It is deliberately not duplicated
    here — two gates counting the same thing drift apart.
    """
    findings: List[Finding] = []

    periods: List[Dict[str, Any]] = []
    ledger_dir = root / "portfolio" / "ledger"
    if ledger_dir.exists():
        for ledger_file in sorted(ledger_dir.glob("*.yaml")):
            try:
                data = yaml.safe_load(ledger_file.read_text(encoding="utf-8")) or {}
            except yaml.YAMLError:
                continue  # reported by the ledger validator, which owns that check
            if isinstance(data, dict):
                periods.append(data)
    facts = kill_criteria.build_ledger_facts(periods)

    for venture_file in sorted((root / "ventures").glob("*/VENTURE.yaml")):
        try:
            with open(venture_file, "r", encoding="utf-8") as handle:
                data = yaml.safe_load(handle) or {}
        except yaml.YAMLError:
            continue  # already reported as unparseable-contract

        dir_name = venture_file.parent.name
        venture_facts = facts.get(data.get("name")) or facts.get(dir_name)

        for result in kill_criteria.evaluate_venture(data, venture_facts):
            if result.verdict != kill_criteria.TRIGGERED:
                continue
            findings.append(
                Finding(
                    venture=dir_name,
                    severity="warn",
                    code="kill-criterion-triggered",
                    message=f"kill criterion fired: {result.description} — {result.detail}",
                    remedy=(
                        "The allocator has zeroed this venture's budget. Wind it down, or "
                        "change the criterion deliberately and record why."
                    ),
                )
            )

    return findings


def validate_all(repo_root: Optional[Path] = None) -> List[Finding]:
    root = repo_root or find_repo_root()
    ledger_mrr = load_latest_ledger_mrr(root)

    findings: List[Finding] = []
    contracts: List[tuple] = []

    for venture_file in sorted((root / "ventures").glob("*/VENTURE.yaml")):
        name = venture_file.parent.name
        try:
            with open(venture_file, "r", encoding="utf-8") as handle:
                data = yaml.safe_load(handle) or {}
        except yaml.YAMLError as exc:
            findings.append(
                Finding(
                    venture=name,
                    severity="error",
                    code="unparseable-contract",
                    message=f"VENTURE.yaml could not be parsed: {exc}",
                    remedy="Fix the YAML syntax; the router skips unreadable contracts.",
                )
            )
            continue
        contracts.append((name, data))

    # One tree walk for every declared hostname, rather than one per venture.
    declared_hosts = {
        host
        for _, data in contracts
        for host in [production_hostname((data.get("links") or {}).get("production"))]
        if host
    }
    backed_hostnames = find_backed_hostnames(root, declared_hosts)

    for name, data in contracts:
        declared_name = data.get("name")
        if declared_name and declared_name != name:
            findings.append(
                Finding(
                    venture=name,
                    severity="error",
                    code="name-directory-mismatch",
                    message=f"name '{declared_name}' does not match directory '{name}'",
                    remedy=(
                        "Align them — the ledger joins on venture name, so a mismatch "
                        "silently detaches spend from outcomes."
                    ),
                )
            )

        findings.extend(validate_venture(data, name, ledger_mrr, backed_hostnames))

    findings.extend(validate_kill_criteria(root))

    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate venture contracts against the ledger.")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit non-zero on warnings as well as errors.",
    )
    parser.add_argument("--json", action="store_true", help="Emit findings as JSON.")
    args = parser.parse_args()

    findings = validate_all()
    errors = [f for f in findings if f.severity == "error"]
    warnings = [f for f in findings if f.severity == "warn"]

    if args.json:
        print(json.dumps([asdict(f) for f in findings], indent=2))
    else:
        print("=== Venture Contract Validation ===")
        if not findings:
            print("All venture contracts are consistent with the ledger.")
        else:
            for finding in findings:
                print(finding.format_line())
            print()
            print(f"{len(errors)} error(s), {len(warnings)} warning(s).")

    if errors:
        return 1
    if warnings and args.strict:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
