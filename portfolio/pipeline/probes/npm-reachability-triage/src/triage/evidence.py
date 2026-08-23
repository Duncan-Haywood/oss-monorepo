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
    "Only npm dependencies declared in package-lock.json (v2/v3) or "
    "pnpm-lock.yaml (major version 9) are analysed. Other ecosystems in the "
    "same repository are not covered.",
    "This record covers the project directories named in its coverage section "
    "and no others. A repository can hold npm-ecosystem projects this tool "
    "cannot read — a yarn workspace, a v1 lockfile, a pnpm lockfile of a "
    "different major version, a directory with no lockfile at all — and "
    "those are listed by name there rather than omitted. If the coverage "
    "section is absent, this record was produced for a single project and "
    "says nothing about the rest of the repository it came from.",
    "The build-surface rule (a package a build tool loads and the deployed "
    "artifact never does, e.g. PostCSS inside a Next.js build) is only "
    "implemented for package-lock.json. A pnpm project gets the "
    "dependency-path, dev-server, and deployment-surface rules but not this "
    "one, so a pnpm project can under-suppress relative to an equivalent npm "
    "one; it cannot over-suppress because of this gap.",
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

#: Measured by `run_repository_coverage.py` on 2026-08-22, walking the whole
#: repository rather than the hand-written product list the verification used.
#: Held here because the accuracy note quotes them, and a coverage figure that
#: can drift silently is the defect this pass exists to close.
PORTFOLIO_MANIFESTS_FOUND = 18
PORTFOLIO_MANIFESTS_ANALYSABLE = 9
PORTFOLIO_VERIFICATION_SAMPLE = 7

ACCURACY_NOTE = (
    "## How this can be wrong\n\n"
    f"Hand-verified on {ACCURACY_VERIFIED_ON} against a freshly downloaded OSV "
    f"feed across {PORTFOLIO_VERIFICATION_SAMPLE} npm products in this "
    "portfolio: every one of the "
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
    "cannot misfire on a different project's lockfile shape: four of those "
    "products are documentation sites, and 24 of the 102 suppressions checked "
    "trace to a single edge claim, `next -> postcss`. See this probe's README "
    "and `wrong-suppression-verification-2026-08-21.json` for the full "
    "per-claim record.\n\n"
    "**The sample is also smaller than the portfolio.** Walking the whole "
    f"repository on 2026-08-22 found {PORTFOLIO_MANIFESTS_FOUND} npm "
    f"manifests, of which {PORTFOLIO_MANIFESTS_ANALYSABLE} are readable by "
    f"this tool at all and {PORTFOLIO_VERIFICATION_SAMPLE} are in the "
    "verification above. This note previously described its sample as *all* "
    "the npm products in the portfolio, which was wrong in the direction that "
    "flatters the tool: a rate measured on the projects it can read says "
    "nothing about the ones it cannot. Run with `--repository` to get the "
    "coverage table for your own repository rather than inheriting this one's."
)


#: Rendered above the per-project findings in a repository record. States the
#: thing the finding counts cannot: that "no findings" and "never looked" are
#: the same artifact unless the unread projects are named.
COVERAGE_PREAMBLE = (
    "A project this tool could not read produces no findings, which looks "
    "exactly like a project with none. Every npm manifest found in the "
    "repository is therefore listed below, analysed or not, with the specific "
    "thing that stopped it and what would clear it."
)


def render_repository_coverage(coverage) -> list[str]:
    """Render the coverage section for a whole-repository record.

    Takes a :class:`triage.discovery.RepositoryCoverage`; typed loosely to keep
    :mod:`triage.evidence` free of an import cycle with the discovery walk.
    """
    from .discovery import ANALYSED_NO_DEPLOYMENT_MODE

    counts = coverage.counts()
    lines = [
        "## Repository coverage",
        "",
        COVERAGE_PREAMBLE,
        "",
        f"**{counts['analysed']} of {counts['manifests_found']} npm projects in "
        f"this repository were analysed.** {counts['refused']} could not be.",
        "",
    ]

    if coverage.refused:
        lines.append("| Project | Not analysed because | What would clear it |")
        lines.append("|---|---|---|")
        for project in coverage.refused:
            remedy = (project.remedy or "—").replace("|", "/")
            lines.append(f"| `{project.path}` | `{project.reason}` | {remedy} |")
        lines.append("")

    members = tuple(p for p in coverage.analysed if p.covered_by is not None)
    if members:
        lines.append(
            "These are workspace members with no lockfile of their own. They "
            "are covered, but their dependencies resolve through the root "
            "lockfile shown, so their findings are reported under that root "
            "rather than in a section of their own — one lockfile is one "
            "dependency set, and splitting it per member would report the same "
            "component several times."
        )
        lines.append("")
        for project in members:
            lines.append(f"- `{project.path}` → resolved by `{project.lockfile}`")
        lines.append("")

    degraded = tuple(
        p for p in coverage.analysed if p.status == ANALYSED_NO_DEPLOYMENT_MODE
    )
    if degraded:
        lines.append(
            "These were analysed, but their deployment mode could not be "
            "determined, so no finding in them was suppressed on the grounds "
            "that its surface is not deployed. The dependency-path analysis "
            "still applies; the reachability narrowing does not."
        )
        lines.append("")
        for project in degraded:
            lines.append(f"- `{project.path}`")
        lines.append("")

    return lines


def coverage_to_dict(coverage) -> dict:
    """Serialise a :class:`triage.discovery.RepositoryCoverage`."""
    return {
        "root": coverage.root,
        "counts": coverage.counts(),
        "refusals_by_reason": coverage.refusals_by_reason(),
        "projects": [
            {
                "path": project.path,
                "status": project.status,
                "reason": project.reason,
                "remedy": project.remedy,
                "lockfile": project.lockfile,
                "covered_by": project.covered_by,
            }
            for project in coverage.projects
        ],
    }


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


def render_findings_table(findings: tuple[Finding, ...], show_reason: bool) -> list[str]:
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


#: Retained name; the table renderer is used by the repository record too.
_render_table = render_findings_table
