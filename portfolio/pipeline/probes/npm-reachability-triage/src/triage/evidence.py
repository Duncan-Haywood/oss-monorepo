"""Render the evidence record.

The output format carries the positioning constraint from
``portfolio/pipeline/README.md`` — *"No claim of compliance. 'You are now
compliant' is a warranty. 'Here is what we tested, what we changed, what
remains, and when we checked' is a record."*

Three things follow from that and are enforced here rather than left to
whoever writes the copy:

* Every suppressed finding is **listed in full with its reason**. Suppression
  that a user cannot audit is indistinguishable from a missed finding, and the
  overlay vendors this portfolio screens against are the worked example of why
  that matters.
* :data:`COVERAGE_LIMITS` is rendered in the body of the record, not appended
  as a footnote.
* No function here emits the words "compliant" or "compliance" about the
  scanned project.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from .deployment import DeploymentProfile
from .engine import DEV_ONLY, NOT_DEPLOYED, SHIPPED, Finding

#: Stated in the record itself, every run. These are the things a reader would
#: otherwise have to assume, and each one is a real gap rather than boilerplate.
COVERAGE_LIMITS: tuple[str, ...] = (
    "Only npm dependencies declared in package-lock.json (v2/v3) are analysed. "
    "Other ecosystems in the same repository are not covered.",
    "Reachability means the vulnerable package is present on a production "
    "dependency path and its affected surface is deployed. It does not mean an "
    "exploit exists, and no call-graph analysis is performed.",
    "Deployment mode is read textually from next.config.*; a config that "
    "computes its value at runtime is reported as undetermined and suppresses "
    "nothing.",
    "Advisory coverage is limited to what the selected feed published at the "
    "time shown. An advisory published after that moment is not in this record.",
    "A finding this tool could not match reliably is reported as shipped. False "
    "positives are expected; a suppressed finding that should not have been is "
    "the failure this tool is built to avoid, and both are possible.",
    "A build-surface suppression means the deployed artifact never loads the "
    "package. It does not mean the advisory is harmless: the machine that runs "
    "the build still executes that code, so a build-time compromise is out of "
    "scope for this record rather than ruled out by it.",
    "Only packages with their own package-lock.json entry are analysed. A "
    "dependency that vendors a copy of another library into its own published "
    "files is one lockfile component, so this record says nothing either way "
    "about the vendored copy.",
)

NOT_AN_ATTESTATION = (
    "This is a record of what was checked and what was found at the time shown. "
    "It is not an attestation, a conformity assessment, or advice, and it does "
    "not state that this project meets any regulatory obligation."
)

#: The measured wrong-suppression figures, held here as named constants rather
#: than hand-copied into the prose below, so the rendered number cannot drift
#: from the value this module actually holds. The verification itself lives in
#: this probe's own README and its committed evidence file, not in code --
#: unlike agent-permission-harness's fixture corpus, this measurement is a
#: one-time hand review of real advisories against real lockfile evidence, not
#: something a test suite regenerates on every run.
ACCURACY_VERIFIED_ON = "2026-08-21"
ACCURACY_DISTINCT_CLAIMS = 53
ACCURACY_WRONG_CLAIMS = 0
ACCURACY_RAW_FINDINGS = 102
ACCURACY_WRONG_RAW_FINDINGS = 0

ACCURACY_NOTE = (
    "## How this can be wrong\n\n"
    f"Hand-verified on {ACCURACY_VERIFIED_ON} against a freshly downloaded OSV "
    "feed across all seven npm products in this portfolio: every one of the "
    f"{ACCURACY_RAW_FINDINGS} suppressed findings that run produced reduces to "
    f"{ACCURACY_DISTINCT_CLAIMS} distinct (advisory, rule, package) claims (the "
    "same advisory suppressed the same way on more than one product counts "
    "once), each checked against its real advisory text and the actual "
    "lockfile or source evidence the rule cites. "
    f"**{ACCURACY_WRONG_CLAIMS} of {ACCURACY_DISTINCT_CLAIMS} distinct claims "
    f"({ACCURACY_WRONG_RAW_FINDINGS} of {ACCURACY_RAW_FINDINGS} raw findings) "
    "were wrong** — suppressed a vulnerability actually present in the "
    "deployed artifact, the failure this tool is built to avoid.\n\n"
    "This is one portfolio's sample, not a general proof the suppression rules "
    "cannot misfire on a different project's lockfile shape: four of the nine "
    "products this measurement's own sample covers are documentation sites, "
    "and 24 of the 102 suppressions checked trace to a single edge claim, "
    "`next -> postcss`. See this probe's README and "
    "`wrong-suppression-verification-2026-08-21.json` for the full per-claim "
    "record."
)


@dataclass(frozen=True)
class Report:
    """A complete triage run."""

    generated_at: str
    project: str
    feed: str
    component_count: int
    profile: DeploymentProfile
    findings: tuple[Finding, ...]

    @property
    def shipped(self) -> tuple[Finding, ...]:
        return tuple(f for f in self.findings if f.verdict == SHIPPED)

    @property
    def suppressed(self) -> tuple[Finding, ...]:
        return tuple(f for f in self.findings if f.suppressed)

    def counts(self) -> dict[str, int]:
        return {
            "total": len(self.findings),
            SHIPPED: len(self.shipped),
            DEV_ONLY: sum(1 for f in self.findings if f.verdict == DEV_ONLY),
            NOT_DEPLOYED: sum(1 for f in self.findings if f.verdict == NOT_DEPLOYED),
        }


def _finding_to_dict(finding: Finding) -> dict:
    return {
        "advisory": finding.advisory_id,
        "package": finding.package,
        "versions": list(finding.versions),
        "summary": finding.summary,
        "severity": finding.severity,
        "verdict": finding.verdict,
        "reason": finding.reason,
        "rule": finding.rule,
        "caveats": list(finding.caveats),
        "locations": [location.path for location in finding.locations],
    }


def to_json(report: Report) -> str:
    """Serialise the full record, suppressed findings included."""
    payload = {
        "schema": "npm-reachability-triage/v1",
        "generated_at": report.generated_at,
        "project": report.project,
        "advisory_feed": report.feed,
        "not_an_attestation": NOT_AN_ATTESTATION,
        "components_analysed": report.component_count,
        "deployment": {
            "mode": report.profile.mode,
            "confidence": report.profile.confidence,
            "evidence": list(report.profile.evidence),
            "config": report.profile.config_path,
        },
        "counts": report.counts(),
        "coverage_limits": list(COVERAGE_LIMITS),
        "wrong_suppression_rate": {
            "verified_on": ACCURACY_VERIFIED_ON,
            "distinct_claims": ACCURACY_DISTINCT_CLAIMS,
            "distinct_claims_wrong": ACCURACY_WRONG_CLAIMS,
            "raw_findings": ACCURACY_RAW_FINDINGS,
            "raw_findings_wrong": ACCURACY_WRONG_RAW_FINDINGS,
            "note": ACCURACY_NOTE,
        },
        "findings": [_finding_to_dict(finding) for finding in report.findings],
    }
    return json.dumps(payload, indent=2, sort_keys=False)


def _render_table(findings: tuple[Finding, ...], show_reason: bool) -> list[str]:
    header = ["| Package | Versions | Advisory | Severity |" + (" Why suppressed |" if show_reason else " Summary |")]
    header.append("|---|---|---|---|---|")
    rows = []
    for finding in findings:
        last = finding.reason if show_reason else (finding.summary or "—")
        rows.append(
            f"| `{finding.package}` | {', '.join(finding.versions) or '—'} "
            f"| {finding.advisory_id} | {finding.severity or '—'} "
            f"| {last.replace('|', '/')} |"
        )
    return header + rows


def to_markdown(report: Report) -> str:
    """Render the human-facing record."""
    counts = report.counts()
    lines: list[str] = [
        f"# Dependency reachability record — {report.project}",
        "",
        f"*Generated {report.generated_at} · feed: {report.feed} · "
        f"{report.component_count} components analysed*",
        "",
        f"> {NOT_AN_ATTESTATION}",
        "",
        "## What was found",
        "",
        f"- **{counts[SHIPPED]} findings describe code this project deploys.**",
        f"- {counts[DEV_ONLY]} suppressed: dev-only dependency path.",
        f"- {counts[NOT_DEPLOYED]} suppressed: surface not deployed.",
        "",
        f"Deployment mode: **{report.profile.mode}** "
        f"(confidence: {report.profile.confidence})",
    ]
    for item in report.profile.evidence:
        lines.append(f"  - {item}")
    lines.append("")

    lines.append("## Findings in deployed code")
    lines.append("")
    if report.shipped:
        lines.extend(_render_table(report.shipped, show_reason=False))
    else:
        lines.append("No advisory matched a package on a deployed path.")
    lines.append("")

    lines.append("## Suppressed findings")
    lines.append("")
    if report.suppressed:
        lines.append(
            "These matched an advisory but were judged not to describe deployed "
            "code. They are listed so the judgement can be checked."
        )
        lines.append("")
        lines.extend(_render_table(report.suppressed, show_reason=True))
    else:
        lines.append("None.")
    lines.append("")

    lines.append("## What this record does not cover")
    lines.append("")
    lines.extend(f"- {limit}" for limit in COVERAGE_LIMITS)
    lines.append("")

    lines.append(ACCURACY_NOTE)
    lines.append("")

    return "\n".join(lines)
