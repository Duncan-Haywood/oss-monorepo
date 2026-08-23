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
    "For a pnpm lockfile, dev-only is derived rather than read: pnpm stores no "
    "per-install dev flag, so this tool computes reachability from the "
    "analysed importer's own production declarations. An edge it cannot follow "
    "therefore forces every install of the package that edge named onto the "
    "production graph, and those names are listed in this record — a narrower "
    "answer is never produced from a graph the tool knows is incomplete.",
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
ACCURACY_DISTINCT_CLAIMS = 50
ACCURACY_WRONG_CLAIMS = 0
ACCURACY_RAW_FINDINGS = 97
ACCURACY_WRONG_RAW_FINDINGS = 0

#: `advisory_from_osv` gained a filter for OSV's `withdrawn` field on this
#: date, found while hand-verifying the two `esbuild` suppressions that were
#: the entire yield of re-running the tool over the nine projects the pnpm
#: reader newly made visible (`retail-pilot-intel`'s root, 2 apps and 4
#: packages, plus two other no-deployment-mode npm projects) — the specific
#: gap the note below used to describe as unclosed. Reading the advisory GHSA-gv7w-rqvm-qjhr actually
#: named showed it had been withdrawn: GitHub's own advisory database retracted
#: it as a misattribution, the affected package was never npm `esbuild` at
#: all. `advisory_from_osv` had no field for `withdrawn` and matched it anyway.
#: Re-running the original 7-product sample against the fix found two more
#: withdrawn records doing the same thing — GHSA-8h3q-9fpp-c883 (`wrangler`,
#: withdrawn as a duplicate) and GHSA-p5wg-g6qr-c7cg (`eslint`, withdrawn) —
#: for 3 of the figures above's original 53 distinct claims and 5 of the
#: original 102 raw findings, all three previously verified as reasoned
#: correctly and still are: the suppression logic was never wrong, only the
#: advisory feed's own retracted records were being read as live ones.
#: `ACCURACY_WRONG_CLAIMS` stays 0 because none of the surviving 50 claims
#: changed verdict; the reasoning behind those 3 was equally sound, and the
#: advisories underneath it are simply gone now.
#:
#: This is the first check of a category the note before this fix never
#: measured: whether an *unsuppressed* finding is real, not just whether a
#: suppressed one is safe. Two of the three withdrawn advisories were also
#: reported unsuppressed (unrelated to the sample above, which counts only
#: suppressions) on a project that deploys: `ai-first-markets` had 3 findings
#: reported as live before this fix, of which only 1 (`sharp`/libvips) was
#: real. See this probe's README for the full accounting.
WITHDRAWN_FILTER_ADDED_ON = "2026-08-23"

#: Measured by `run_repository_coverage.py` on 2026-08-23, walking the whole
#: repository rather than the hand-written product list the verification used.
#: Held here because the accuracy note quotes them, and a coverage figure that
#: can drift silently is the defect this pass exists to close. (The
#: 2026-08-22 run this replaces predates pnpm support and undercounted
#: `retail-pilot-intel`'s seven pnpm-resolved projects as unreadable; see
#: `coverage-2026-08-23.json`.)
#:
#: The hand-reviewed advisory-text sample (the wrong-suppression rate above)
#: still covers npm projects only. A separate, structural check --
#: `verify_pnpm_dev_classification.py`, run 2026-08-23 -- independently
#: re-derives production reachability for every package `retail-pilot-intel`'s
#: seven pnpm importers install and found zero mismatches against
#: `triage.pnpm`'s own answer; see `PNPM_STRUCTURAL_*` below and this probe's
#: README. That closes the "nothing has checked the pnpm classification
#: mechanism itself" gap, not the "an advisory's text has been hand-read
#: against a pnpm suppression" one -- retail-pilot-intel has produced only
#: `dependency-path` findings so far, none of `build-surface` or
#: `server-surface:*`.
PORTFOLIO_MEASURED_ON = "2026-08-23"
PORTFOLIO_MANIFESTS_FOUND = 18
PORTFOLIO_MANIFESTS_ANALYSABLE = 16
PORTFOLIO_MANIFESTS_ANALYSABLE_NPM_ONLY = 9
PORTFOLIO_VERIFICATION_SAMPLE = 7

#: `verify_pnpm_dev_classification.py`'s own result, held as constants for the
#: same reason the npm figures above are: so the rendered number cannot drift
#: from the value this module actually holds.
PNPM_STRUCTURAL_VERIFIED_ON = "2026-08-23"
PNPM_STRUCTURAL_IMPORTERS_CHECKED = 7
PNPM_STRUCTURAL_MISMATCHES = 0

#: The hand review the paragraph above says pnpm still lacks, closed the same
#: day for the one claim that exists: `retail-pilot-intel`'s two suppressed
#: findings (`apps/docs`, `apps/portal`) reduce to one distinct (advisory,
#: rule, package) claim, checked against its real advisory text and the raw
#: `pnpm-lock.yaml` by hand -- see
#: `wrong-suppression-verification-pnpm-2026-08-23.json`. Same standard as
#: `ACCURACY_*` above, one claim instead of 53, because that is all this
#: portfolio's one pnpm venture has produced so far.
PNPM_ADVISORY_TEXT_VERIFIED_ON = "2026-08-23"
PNPM_ADVISORY_TEXT_DISTINCT_CLAIMS = 1
PNPM_ADVISORY_TEXT_WRONG_CLAIMS = 0
PNPM_ADVISORY_TEXT_WITHDRAWN_ADVISORIES = 1

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
    "products are documentation sites, and 24 of the "
    f"{ACCURACY_RAW_FINDINGS} suppressions checked "
    "trace to a single edge claim, `next -> postcss`. See this probe's README "
    "and `wrong-suppression-verification-2026-08-21.json` for the full "
    "per-claim record — 3 of that file's 53 entries are since superseded, see "
    f"{WITHDRAWN_FILTER_ADDED_ON}'s note below.\n\n"
    "**The sample is also smaller than the portfolio.** Walking the whole "
    f"repository on {PORTFOLIO_MEASURED_ON} found {PORTFOLIO_MANIFESTS_FOUND} "
    f"npm manifests, of which {PORTFOLIO_MANIFESTS_ANALYSABLE} are readable by "
    f"this tool and {PORTFOLIO_VERIFICATION_SAMPLE} are in the verification "
    "above. This note previously described its sample as *all* the npm "
    "products in the portfolio, which was wrong in the direction that flatters "
    "the tool: a rate measured on the projects it can read says nothing about "
    "the ones it cannot. Run with `--repository` to get the coverage table for "
    "your own repository rather than inheriting this one's.\n\n"
    "**Reading a second lockfile format widened that gap; two independent "
    "passes on the same day closed different parts of it.** Readable went "
    f"{PORTFOLIO_MANIFESTS_ANALYSABLE_NPM_ONLY} -> "
    f"{PORTFOLIO_MANIFESTS_ANALYSABLE} when pnpm lockfiles became readable, "
    f"and the hand-reviewed advisory-text sample above stayed at "
    f"{PORTFOLIO_VERIFICATION_SAMPLE} npm products: it covers npm only. One "
    f"pass, on {PNPM_STRUCTURAL_VERIFIED_ON}, checked the mechanism "
    "underneath — pnpm's dev-only classification is derived by reachability "
    "rather than read from a stored flag, and "
    f"`verify_pnpm_dev_classification.py` independently re-walked "
    f"{PNPM_STRUCTURAL_IMPORTERS_CHECKED} pnpm importers' production graphs "
    "from the raw lockfile and found "
    f"{PNPM_STRUCTURAL_MISMATCHES} mismatches against `triage.pnpm`'s own "
    "answer. A second pass, the same day, read the advisory text behind the "
    "one claim `retail-pilot-intel` had produced — `esbuild`/"
    "`GHSA-gv7w-rqvm-qjhr`, suppressed `dependency-path` on both `apps/docs` "
    "and `apps/portal` — confirmed the reachability verdict: "
    f"**{PNPM_ADVISORY_TEXT_WRONG_CLAIMS} of {PNPM_ADVISORY_TEXT_DISTINCT_CLAIMS} "
    "was wrong** (see `wrong-suppression-verification-pnpm-2026-08-23.json`), "
    f"and separately found {PNPM_ADVISORY_TEXT_WITHDRAWN_ADVISORIES} of the "
    "claims it checked traces to a **withdrawn OSV advisory** — its own text "
    "names the affected code as esbuild's Deno module, not the npm package "
    "installed here — and filed that as a data-quality fact about the feed, "
    "distinct from the reachability logic.\n\n"
    "**A third pass turned that fact into a fix.** Re-running the tool over "
    "the other 8 previously-unverified projects — `retail-pilot-intel`'s 6 "
    "packages and root plus 2 more npm projects with no deployment mode — "
    "found no further claims, so `GHSA-gv7w-rqvm-qjhr` was the entire yield of "
    "the newly-readable set. Reading it, `advisory_from_osv` had no code path "
    "for `withdrawn` at all: every record the feed marked retracted was still "
    "matched as live. It now returns no affected ranges for a withdrawn "
    "record, dropped by both callers the same way an advisory naming no "
    "package already was. Re-running the original 7-product npm sample "
    "against the fix surfaced two more withdrawn records behaving the same "
    "way — `GHSA-8h3q-9fpp-c883` (`wrangler`, withdrawn as a duplicate) and "
    "`GHSA-p5wg-g6qr-c7cg` (`eslint`, withdrawn) — for 3 of that sample's "
    "original 53 distinct claims and 5 of its 102 raw findings, all reasoned "
    "correctly and still are: `ACCURACY_WRONG_CLAIMS` stays 0, because the "
    "suppression logic was never wrong, only the feed's own retracted records "
    "were being read as live ones.\n\n"
    "**A category the hand review before this fix never measured: is an "
    "*unsuppressed* finding real?** Two of the three withdrawn advisories "
    "were also reported **shipped**, not suppressed, on a deploying product: "
    "`ai-first-markets` had 3 findings reported as live vulnerabilities before "
    "this fix, of which only 1 (`sharp`/libvips) was real, and "
    "`local-site-studio` had 1, now 0. That is a false alarm, the opposite "
    "failure mode from a wrong suppression, and one this note's own "
    "methodology was never built to catch because it counts suppressed "
    "findings only. "
    f"As of {WITHDRAWN_FILTER_ADDED_ON}, all 9 previously-unverified projects "
    "produce zero findings once withdrawn records are excluded — nothing is "
    "left unverified in the set that opened this gap, though a fresh advisory "
    "landing on one of those 9 tomorrow would reopen it; this is a "
    "point-in-time result, not a structural guarantee the way the dev-only "
    "reachability logic itself is."
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
    #: Production-side dependency edges the reader could not follow. Non-empty
    #: means the graph is incomplete and every install of the named packages was
    #: forced onto the production graph rather than narrowed. Reported because a
    #: suppression rate computed over an incomplete graph is not the same claim
    #: as one computed over a complete one.
    unresolved_production_edges: tuple[str, ...] = ()

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
        "unresolved_production_edges": list(report.unresolved_production_edges),
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

    if report.unresolved_production_edges:
        lines.append(
            "**The dependency graph read here is incomplete.** These packages "
            "sit on a production-side edge this tool could not follow to a "
            "resolved install, so every install of each was treated as "
            "production rather than narrowed. A suppression that would have "
            "depended on one of them did not fire: "
            + ", ".join(f"`{name}`" for name in report.unresolved_production_edges)
        )
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
