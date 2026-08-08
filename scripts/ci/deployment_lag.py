#!/usr/bin/env python3
"""
Deployment lag ratchet — the gap between `origin/main` and what is actually served.

`scripts/ci/release_lag.py` measures commits that are not in `origin/main` and
reports, of the pile it finds, that "nothing in it is live". Its premise is
stated in its own docstring and again on line 3 of
`platform/release-lag-budget.yaml`: **"Production runs `origin/main`."**

That premise is false, and this repository holds the disproof. `platform/ci/
promote-pairwise-gitops.sh` writes the deployed commit into a `<host>/revision`
annotation on the Deployment in `origin/gitops-production`, atomically with the
image digest, precisely so that the annotation identifies the running image.
Nothing read it back.

Measured 2026-08-05, on a `main` whose release-lag gate was failing at *one*
commit over a declared budget of zero:

    release_lag.py:        1 commit not in origin/main
    the annotation:        production is running cd67f022, from 2026-07-31
    the truth:             436 commits behind origin/main
                           34 of them touching the deployed venture

Among those was `6e67a20f`, "stop the pricing page selling a plan nobody can
buy", which removed a `$9 / month` price, a `Most Popular` badge and an
`Exportable Value Summary PDF` bullet from a tier with no payment path anywhere
in the venture. Fetched the same day, `https://pairwise.marisstella.dev/` still
served all three and served no disclosure. The repository had ratcheted
`max_unshipped_commits` to 0 and read green on shipping while the only venture
with live customers advertised a price it could not take and a badge it had not
earned. That is the specific failure this module exists to make loud: not that
work is unfinished, but that finished work — including a correction to a false
commercial claim — is not the thing customers are looking at.

The second dimension is the one that found the rest of it. A service can be
missing from this measurement entirely, and that is worse than being behind:

    of 8 services declaring a public ingress hostname, 1 records which commit
    is deployed there.

The other seven serve eight public, TLS-terminated, branded hostnames about
which this repository can say nothing at all. Probed on 2026-08-05, five of them
— `academy`, `atelier`, `photo`, `retail`, `studio`.marisstella.dev — answered
`200 text/plain` with an ingress echo body naming the internal pod and its
cluster IP, so the public surface of five ventures was a debug page. An
unrecorded deployment is therefore reported as a finding rather than skipped:
"we do not know" and "it is fine" are the two states this repository has most
often confused, and `docs/ENGINEERING-ROADMAP.md` asks twice for the check that
would have separated them.

What it does not do: it does not push, promote, or deploy anything, and it does
not reach the network. Both are deliberate. Promotion is an outward action and
stays a human decision; the measurement is pure git so that it decides on its
inputs rather than on the machine it runs on, and so that it cannot be answered
by whatever a hostname happens to return today. Whether a recorded revision is
*serving* is a different control and is not claimed here — see the roadmap item
this module's `issue` field names.

Deliberately fails closed, and reports a third state rather than a pass when it
cannot measure. A missing budget file, an expired budget, or a declared value
over its cap is a failure. An absent `origin/gitops-production`, or a recorded
revision that is not an object in this clone, is NOT MEASURABLE HERE — named in
the report, never counted as compliant. A shallow CI checkout must not be able
to buy a green from a control it did not run.

Usage:
    python3 scripts/ci/deployment_lag.py            # audit, exit 1 on failure
    python3 scripts/ci/deployment_lag.py --report   # measure, always exit 0
    python3 scripts/ci/deployment_lag.py --json     # machine-readable
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
BUDGET_PATH = Path("platform/deployment-lag-budget.yaml")
APPS_DIR = Path("platform/k8s/apps")

# Sibling module. Explicit rather than relying on `sys.path[0]`, so this keeps
# working when the file is imported rather than executed.
if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from baseline_trust import BaselineTrust, describe as describe_trust, trust_findings, verify_baseline

# The GitOps branch is the desired state of the cluster. It is a remote ref on
# purpose: a local branch of the same name is a file any process may write, and
# `scripts/ci/baseline_trust.py` exists because exactly that was done by hand
# four times to `refs/remotes/origin/main`.
#
# Until 2026-08-08 this comment was the *only* thing in this module that
# mentioned that: it named `baseline_trust.py` as the reason the ref must be
# remote and then never imported it, so every lag here was computed against a
# `refs/remotes/origin/main` nobody had checked. A comment citing a control is
# not the control. Found by
# `tests/test_gate_wiring.py::test_every_baseline_measuring_gate_verifies_its_baseline`,
# which derives the obligation from source instead of from a list.
GITOPS_REF = "origin/gitops-production"

# The upstream ref production is measured *against*. Kept identical to
# `release_lag.py`'s baseline so the two numbers are comparable: that module
# measures local -> origin/main, this one measures origin/main -> deployed, and
# the sum is the real distance from a developer's commit to a customer.
BASELINE_REF = "origin/main"

# `platform/k8s/apps/service-template/` is a copy-me skeleton, not a service.
# Its ingress declares `app-name.yourdomain.com`, which is a placeholder rather
# than a claim that anything is deployed. Excluded by directory name rather than
# by hostname pattern: a pattern would also excuse a real service that someone
# had left pointing at an example domain, which is a defect this should report.
TEMPLATE_DIRS = frozenset({"service-template"})

# Ceilings on what the budget document may declare. A budget that can be widened
# without limit is a way of turning a gate off across several small, individually
# defensible edits — the erosion `scripts/ci/cap_ratchet.py` was written for. The
# constants below are themselves watched by that ratchet in the falling
# direction, so this file cannot answer a failure by raising its own ceiling.
MAX_DECLARED_COMMITS_BEHIND = 500
MAX_DECLARED_UNRECORDED = 8
MAX_DECLARED_AGE_DAYS = 30
MAX_DECLARED_SLACK = 25
MAX_EXPIRY_DAYS = 120

REQUIRED_BUDGET_KEYS = (
    "max_commits_behind",
    "max_unrecorded_deployments",
    "max_deployed_age_days",
    "slack_commits",
)

DECLARED_CAPS = {
    "max_commits_behind": MAX_DECLARED_COMMITS_BEHIND,
    "max_unrecorded_deployments": MAX_DECLARED_UNRECORDED,
    "max_deployed_age_days": MAX_DECLARED_AGE_DAYS,
    "slack_commits": MAX_DECLARED_SLACK,
}


class DeploymentLagError(RuntimeError):
    """A fault in the audit's own inputs. Always fatal, never a finding."""


@dataclass(frozen=True)
class Finding:
    check: str
    message: str


@dataclass
class Service:
    """One deployable unit under `platform/k8s/apps/`.

    `hosts` is what the repository tells the world it serves. `revision` is what
    the GitOps branch says is actually running there, and is `None` when nothing
    records it — which is a finding, not an absence.
    """

    name: str
    hosts: List[str] = field(default_factory=list)
    revision: Optional[str] = None
    #: True when a revision is recorded but this clone cannot resolve it.
    revision_unresolvable: bool = False
    commits_behind: Optional[int] = None
    #: Commits behind that touch this service's own sources.
    own_commits_behind: Optional[int] = None
    deployed_age_days: Optional[int] = None

    @property
    def public(self) -> bool:
        return bool(self.hosts)

    @property
    def measured(self) -> bool:
        return self.commits_behind is not None


@dataclass
class Measurement:
    services: List[Service]
    observable: bool
    observability_note: str = ""
    baseline_sha: str = ""
    trust: Optional[BaselineTrust] = None

    @property
    def public_services(self) -> List[Service]:
        return [s for s in self.services if s.public]

    @property
    def unrecorded(self) -> List[Service]:
        """Public services with no record of what commit is deployed."""
        return [s for s in self.public_services if s.revision is None]

    @property
    def unresolvable(self) -> List[Service]:
        return [s for s in self.public_services if s.revision_unresolvable]

    @property
    def measured_any(self) -> bool:
        """Whether any service's lag was actually computed.

        Guards the stale-budget direction. With nothing measured the worst lag is
        0, which is indistinguishable from a fully shipped portfolio, and the
        `budget-stale` branch would demand the budget be lowered on the strength
        of a measurement that never happened.
        """
        return any(s.measured for s in self.services)

    @property
    def worst_commits_behind(self) -> int:
        measured = [s.commits_behind for s in self.services if s.commits_behind is not None]
        return max(measured) if measured else 0

    @property
    def worst_age_days(self) -> int:
        measured = [s.deployed_age_days for s in self.services if s.deployed_age_days is not None]
        return max(measured) if measured else 0


def _git(repo_root: Path, *args: str) -> subprocess.CompletedProcess:
    env = dict(os.environ)
    if "GIT_CONFIG_GLOBAL" not in env:
        env["GIT_CONFIG_GLOBAL"] = "/dev/null"
    return subprocess.run(
        ["git", *args],
        cwd=str(repo_root),
        capture_output=True,
        text=True,
        check=False,
        env=env,
    )


def _ref_exists(repo_root: Path, ref: str) -> bool:
    return _git(repo_root, "rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}").returncode == 0


def ingress_hosts(path: Path) -> List[str]:
    """Every hostname an Ingress manifest routes.

    Reads with `safe_load_all`: these files are multi-document in places, and a
    single `safe_load` silently returns only the first document, which would
    make a second Ingress in the same file invisible to this control.
    """
    if not path.exists():
        return []
    hosts: List[str] = []
    try:
        documents = list(yaml.safe_load_all(path.read_text(encoding="utf-8")))
    except yaml.YAMLError as exc:
        raise DeploymentLagError(f"{path}: unreadable ingress manifest: {exc}") from exc
    for document in documents:
        if not isinstance(document, dict):
            continue
        for rule in (document.get("spec") or {}).get("rules") or []:
            if isinstance(rule, dict) and rule.get("host"):
                hosts.append(str(rule["host"]))
    return hosts


def recorded_revision(blob: str, path_for_errors: str) -> Optional[str]:
    """The deployed commit recorded on a Deployment in the GitOps branch.

    The key is `<host>/revision` — `promote-pairwise-gitops.sh` namespaces it by
    the hostname it promoted. Matching on the suffix rather than on a literal key
    keeps this working for the next service without an edit here, which matters:
    a control that has to be extended by hand for every service is a control that
    silently omits the service nobody remembered to add.

    Only a `Deployment` is read. A revision annotation on a Service or ConfigMap
    says nothing about which image is running, and honouring one would let a
    stale rollout claim to be tracked by an annotation on a neighbouring object.
    """
    try:
        documents = list(yaml.safe_load_all(blob))
    except yaml.YAMLError as exc:
        raise DeploymentLagError(f"{path_for_errors}: unreadable manifest in {GITOPS_REF}: {exc}") from exc
    for document in documents:
        if not isinstance(document, dict):
            continue
        if document.get("kind") != "Deployment":
            continue
        annotations = (document.get("metadata") or {}).get("annotations") or {}
        for key, value in annotations.items():
            if str(key).endswith("/revision") and value:
                return str(value).strip()
    return None


def measure(repo_root: Path, verify: bool = True) -> Measurement:
    trust = verify_baseline(repo_root, BASELINE_REF) if verify else None
    apps_dir = repo_root / APPS_DIR
    if not apps_dir.is_dir():
        raise DeploymentLagError(
            f"{APPS_DIR} is missing. This audit's subject is the set of deployed services; "
            "with the directory absent there is nothing to measure and a pass would be a lie."
        )

    services: List[Service] = []
    for entry in sorted(apps_dir.iterdir()):
        if not entry.is_dir() or entry.name in TEMPLATE_DIRS:
            continue
        services.append(Service(name=entry.name, hosts=ingress_hosts(entry / "ingress.yaml")))

    # Third state, not a pass. In a shallow or single-branch CI checkout the
    # GitOps branch is simply absent, and the honest report is that this machine
    # cannot see what is deployed.
    if not _ref_exists(repo_root, GITOPS_REF):
        return Measurement(
            services=services,
            observable=False,
            trust=trust,
            observability_note=(
                f"{GITOPS_REF} is not present in this clone, so what is deployed cannot be read. "
                f"Fetch it (`git fetch origin gitops-production`) to measure."
            ),
        )
    if not _ref_exists(repo_root, BASELINE_REF):
        return Measurement(
            services=services,
            observable=False,
            trust=trust,
            observability_note=(
                f"{BASELINE_REF} is not present in this clone, so there is nothing to measure the "
                f"deployed revision against."
            ),
        )

    baseline_sha = _git(repo_root, "rev-parse", "--short", BASELINE_REF).stdout.strip()
    today = datetime.now(timezone.utc)

    for service in services:
        manifest = f"{APPS_DIR.as_posix()}/{service.name}/deployment.yaml"
        shown = _git(repo_root, "show", f"{GITOPS_REF}:{manifest}")
        if shown.returncode != 0:
            continue
        revision = recorded_revision(shown.stdout, manifest)
        if revision is None:
            continue
        service.revision = revision

        # A recorded revision this clone cannot resolve is not a pass and not a
        # zero. It is the same shallow-checkout state as above, scoped to one
        # service, and it is reported that way. `rev-list` failing is the single
        # signal for it: a preceding `cat-file -e` check was tried here and no
        # mutation could distinguish the two, so it was one more untested branch
        # rather than a second opinion.
        behind = _git(repo_root, "rev-list", "--count", f"{revision}..{BASELINE_REF}")
        if behind.returncode != 0:
            service.revision_unresolvable = True
            continue
        service.commits_behind = int(behind.stdout.strip() or 0)

        own = _git(
            repo_root,
            "rev-list",
            "--count",
            f"{revision}..{BASELINE_REF}",
            "--",
            f"ventures/{service.name}",
            f"{APPS_DIR.as_posix()}/{service.name}",
        )
        service.own_commits_behind = int(own.stdout.strip() or 0) if own.returncode == 0 else None

        stamped = _git(repo_root, "log", "-1", "--format=%ct", revision)
        if stamped.returncode == 0 and stamped.stdout.strip():
            deployed_at = datetime.fromtimestamp(int(stamped.stdout.strip()), tz=timezone.utc)
            service.deployed_age_days = max(0, (today - deployed_at).days)

    return Measurement(services=services, observable=True, baseline_sha=baseline_sha, trust=trust)


def load_budget(repo_root: Path) -> Dict[str, Any]:
    path = repo_root / BUDGET_PATH
    if not path.exists():
        raise DeploymentLagError(
            f"{BUDGET_PATH} is missing. A budget that is not there budgets nothing, and this "
            "audit refuses to report a pass against an absent policy."
        )
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise DeploymentLagError(f"{BUDGET_PATH}: unreadable: {exc}") from exc
    if not isinstance(data, dict):
        raise DeploymentLagError(f"{BUDGET_PATH}: expected a mapping at the top level.")

    for key in ("owner", "issue", "expires", "budget"):
        if not data.get(key):
            raise DeploymentLagError(
                f"{BUDGET_PATH}: `{key}` is required. An exception without an owner, an issue and "
                "an expiry is a permanent silence with nobody attached to it."
            )
    budget = data["budget"]
    if not isinstance(budget, dict):
        raise DeploymentLagError(f"{BUDGET_PATH}: `budget` must be a mapping.")
    for key in REQUIRED_BUDGET_KEYS:
        value = budget.get(key)
        # `isinstance(True, int)` is True in Python, so the bool check is not
        # redundant: `max_commits_behind: yes` would otherwise read as 1.
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            raise DeploymentLagError(
                f"{BUDGET_PATH}: `budget.{key}` must be a non-negative integer; got {value!r}."
            )
    return data


def budget_findings(data: Dict[str, Any], today: date) -> List[Finding]:
    """Failures of the budget document itself, before anything is measured."""
    findings: List[Finding] = []
    budget = data["budget"]

    for key, cap in DECLARED_CAPS.items():
        if budget[key] > cap:
            findings.append(
                Finding(
                    "declared-over-cap",
                    f"`budget.{key}` is declared as {budget[key]}, over the cap of {cap} in "
                    f"deployment_lag.py. Lower the declaration; raising the cap is the edit that "
                    f"turns this gate off.",
                )
            )

    expires = data["expires"]
    if isinstance(expires, datetime):
        expires = expires.date()
    if not isinstance(expires, date):
        findings.append(
            Finding("expiry-unparseable", f"`expires` is {data['expires']!r}, which is not a date.")
        )
        return findings
    if expires < today:
        findings.append(
            Finding(
                "budget-expired",
                f"the budget expired on {expires.isoformat()}. Re-argue it or lower it; an expired "
                f"budget is a policy nobody has re-read.",
            )
        )
    elif (expires - today).days > MAX_EXPIRY_DAYS:
        findings.append(
            Finding(
                "expiry-too-far",
                f"`expires` is {(expires - today).days} days out, over the {MAX_EXPIRY_DAYS}-day "
                f"maximum. A budget parked years ahead is never re-read.",
            )
        )
    return findings


def evaluate(measurement: Measurement, data: Dict[str, Any], today: date) -> List[Finding]:
    findings = budget_findings(data, today)

    # Every distance in this module is measured *from* `BASELINE_REF`, so a
    # baseline nobody checked makes "436 commits behind" and "up to date"
    # indistinguishable. Checked before the comparisons and outside the
    # observability guard: whether the baseline is trustworthy is a fact about the
    # repository, like the budget document, not about whether the GitOps branch
    # happens to be fetched here.
    if measurement.trust is None:
        findings.append(
            Finding(
                "baseline-unverified",
                f"the baseline {BASELINE_REF} was never checked against the remote, so every lag "
                f"below is measured from a local file any process may write. Measure with "
                f"verify=True.",
            )
        )
    else:
        findings.extend(Finding(check, message) for check, message in trust_findings(measurement.trust))

    # The budget document is checked everywhere, because it is a property of the
    # repository. The lag comparisons are not, because their subject is absent.
    if not measurement.observable:
        return findings

    budget = data["budget"]

    unresolvable = measurement.unresolvable
    if unresolvable:
        findings.append(
            Finding(
                "revision-unresolvable",
                f"{len(unresolvable)} service(s) record a deployed revision this clone cannot "
                f"resolve ({', '.join(s.name for s in unresolvable)}). Deepen the clone; a "
                f"revision that cannot be resolved is not a revision that is up to date.",
            )
        )

    unrecorded = measurement.unrecorded
    if len(unrecorded) > budget["max_unrecorded_deployments"]:
        hosts = ", ".join(host for service in unrecorded for host in service.hosts)
        findings.append(
            Finding(
                "unrecorded-deployments",
                f"{len(unrecorded)} public service(s) record no deployed revision, over the "
                f"declared {budget['max_unrecorded_deployments']}. Nothing in this repository can "
                f"say what is serving {hosts}. Promote through a script that writes the revision "
                f"annotation, as promote-pairwise-gitops.sh does.",
            )
        )
    elif budget["max_unrecorded_deployments"] - len(unrecorded) > budget["slack_commits"]:
        findings.append(
            Finding(
                "unrecorded-budget-stale",
                f"only {len(unrecorded)} public service(s) lack a deployed revision against a "
                f"declared {budget['max_unrecorded_deployments']}. Deployments became traceable — "
                f"lower the budget so it keeps meaning something.",
            )
        )

    worst = measurement.worst_commits_behind
    if worst > budget["max_commits_behind"]:
        laggards = ", ".join(
            f"{s.name} ({s.commits_behind} behind)"
            for s in measurement.services
            if s.commits_behind is not None and s.commits_behind > budget["max_commits_behind"]
        )
        findings.append(
            Finding(
                "deployment-behind-budget",
                f"{worst} commits separate {BASELINE_REF} from what is deployed, over the declared "
                f"budget of {budget['max_commits_behind']}: {laggards}. Customers are looking at "
                f"the older code, including any correction merged since.",
            )
        )
    elif (
        measurement.measured_any
        # The same reasoning as `measured_any` one line up, extended to the input
        # rather than the subject. That guard exists because a lag of 0 measured
        # over nothing would "demand the budget be lowered on the strength of a
        # measurement that never happened"; a lag of 0 measured from a forged
        # baseline is the same demand on the strength of an input nobody checked,
        # and it is cheaper to produce — pointing `origin/main` at the deployed
        # commit makes every service exactly up to date. This is the only finding
        # here computed *from* the baseline, so it is the only one guarded.
        and measurement.trust is not None
        and measurement.trust.verified
        and budget["max_commits_behind"] - worst > budget["slack_commits"]
    ):
        findings.append(
            Finding(
                "lag-budget-stale",
                f"the furthest-behind deployment is {worst} commits from {BASELINE_REF} against a "
                f"declared budget of {budget['max_commits_behind']} (slack "
                f"{budget['slack_commits']}). Work shipped — lower the budget.",
            )
        )

    if measurement.worst_age_days > budget["max_deployed_age_days"]:
        stale = ", ".join(
            f"{s.name} ({s.deployed_age_days}d)"
            for s in measurement.services
            if s.deployed_age_days is not None and s.deployed_age_days > budget["max_deployed_age_days"]
        )
        findings.append(
            Finding(
                "deployed-revision-stale",
                f"the oldest deployed revision is {measurement.worst_age_days} days old, over the "
                f"declared {budget['max_deployed_age_days']}: {stale}. This is lead time to the "
                f"customer, and no amount of new work lowers it — only promoting does.",
            )
        )

    return findings


def format_report(measurement: Measurement, data: Dict[str, Any], findings: Sequence[Finding]) -> str:
    budget = data["budget"]
    lines = [
        "=== Deployment lag ===",
        describe_trust(measurement.trust)
        if measurement.trust is not None
        else "Baseline UNVERIFIED: never checked against the remote",
    ]

    if not measurement.observable:
        lines.append(f"NOT MEASURABLE HERE: {measurement.observability_note}")
        if findings:
            lines.append(f"FAIL: {len(findings)} finding(s)")
            lines.extend(f"  [{f.check}] {f.message}" for f in findings)
        return "\n".join(lines)

    lines.append(f"Baseline:              {BASELINE_REF} @ {measurement.baseline_sha}")
    lines.append(f"Desired state:         {GITOPS_REF}")
    lines.append(
        f"Public services:       {len(measurement.public_services)} "
        f"({sum(len(s.hosts) for s in measurement.public_services)} hostname(s))"
    )
    lines.append(
        f"Revision recorded:     {len(measurement.public_services) - len(measurement.unrecorded)} "
        f"of {len(measurement.public_services)} "
        f"(budget {budget['max_unrecorded_deployments']} unrecorded)"
    )
    lines.append(
        f"Furthest behind:       {measurement.worst_commits_behind} commits "
        f"(budget {budget['max_commits_behind']}, slack {budget['slack_commits']})"
    )
    lines.append(
        f"Oldest deployed:       {measurement.worst_age_days} days "
        f"(budget {budget['max_deployed_age_days']})"
    )

    measured = [s for s in measurement.services if s.measured]
    if measured:
        lines.append("")
        lines.append("What is actually deployed:")
        for service in measured:
            own = "" if service.own_commits_behind is None else f", {service.own_commits_behind} of them its own"
            lines.append(
                f"  - {service.name}: {str(service.revision)[:8]} "
                f"({service.deployed_age_days}d old), {service.commits_behind} behind{own}"
            )

    if measurement.unrecorded:
        lines.append("")
        lines.append("Public hostnames with no record of what is deployed:")
        for service in measurement.unrecorded:
            lines.append(f"  - {service.name}: {', '.join(service.hosts)}")

    if findings:
        lines.append("")
        lines.append(f"FAIL: {len(findings)} finding(s)")
        lines.extend(f"  [{f.check}] {f.message}" for f in findings)
    else:
        lines.append("")
        lines.append("PASS: every public service is within its declared deployment budget.")
    return "\n".join(lines)


def to_json(measurement: Measurement, data: Dict[str, Any], findings: Sequence[Finding]) -> str:
    return json.dumps(
        {
            "observable": measurement.observable,
            "observability_note": measurement.observability_note,
            "baseline_ref": BASELINE_REF,
            "baseline_sha": measurement.baseline_sha,
            "baseline_verified": bool(measurement.trust is not None and measurement.trust.verified),
            "baseline_trust": asdict(measurement.trust) if measurement.trust else None,
            "gitops_ref": GITOPS_REF,
            "budget": data["budget"],
            "services": [asdict(s) for s in measurement.services],
            "unrecorded": [s.name for s in measurement.unrecorded],
            "worst_commits_behind": measurement.worst_commits_behind,
            "worst_age_days": measurement.worst_age_days,
            "findings": [asdict(f) for f in findings],
        },
        indent=2,
        sort_keys=True,
    )


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--report", action="store_true", help="measure and report; always exit 0")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    args = parser.parse_args(argv)

    try:
        data = load_budget(REPO_ROOT)
        measurement = measure(REPO_ROOT)
    except DeploymentLagError as exc:
        print(f"=== Deployment lag ===\nFAIL: {exc}", file=sys.stderr)
        return 1

    findings = evaluate(measurement, data, date.today())
    print(to_json(measurement, data, findings) if args.json else format_report(measurement, data, findings))
    if args.report:
        return 0
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
