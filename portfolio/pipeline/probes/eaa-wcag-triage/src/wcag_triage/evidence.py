"""Turn an audit into the dated evidence record the candidate actually sells.

The candidate's step 4 is *"a dated file listing what was tested, with what
tool, what changed, what remains open and why."* This is that file, in two
forms. The single most important thing it contains is not the list of failures
— it is the coverage statement: an explicit, machine-readable declaration that
this pass is static-only and that a named set of criteria were **not** checked
and require human assistive-technology review. Selling the failure list without
that statement is the overclaim the candidate's liability section forbids.

Coverage is not accuracy, and until 2026-08-21 this module printed only the
first. ``portfolio/research/error-rate-disclosure/`` rendered this record and
found that it never says a finding in the list can be *wrong* — while two
out-of-sample accuracy measurements for this very engine sat committed
elsewhere in the repository. Coverage answers "what did you look at"; accuracy
answers "is what came back right". :data:`ACCURACY` is the second, carried into
the artifact the reader actually receives rather than left in a research
directory, and :data:`ACCURACY_STATEMENT` names the direction the error runs in
*and* the commercial incentive that runs the same way.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

from .engine import Audit
from .rules import COVERAGE

TOOL_NAME = "eaa-wcag-triage"
TOOL_VERSION = "0.1.0"

COVERAGE_STATEMENT = (
    "This is a STATIC pass. It inspects the page source and the stylesheet it "
    "was given. It does not render the page, run its scripts, or use assistive "
    "technology, so it cannot confirm keyboard operability, focus behaviour, or "
    "that any content is genuinely usable. Colour contrast (1.4.3) is checked "
    "only for the text whose colours the page's own CSS states outright; the "
    "'contrast' section below counts how many elements that was and names the "
    "reason for every element it could not decide, and those remain for human "
    "review. A clean result here is NOT a statement of conformity and NOT a "
    "claim of compliance — it means the static checks below found no failures. "
    "The criteria marked 'manual' require a human with a screen reader and "
    "keyboard, which is the deliberate contractor step in this pipeline."
)


@dataclass(frozen=True)
class AccuracyFigure:
    """One measured error rate for this engine, with the direction it runs in.

    Every field is required because each one is a way the number could mislead
    if it travelled alone. ``value`` without ``corpus`` reads as a property of
    the tool rather than of one measurement; without ``caveat`` it reads as
    settled; without ``direction`` the reader cannot tell whether to discount
    the list in front of them or to worry about what is missing from it.

    ``source`` is a repository path rather than prose, so the derivation is
    reachable and so ``tests/test_accuracy_citations.py`` can check that the
    figure printed here is still the figure that file derives. A rate that is
    revised upstream must not be able to go on being quoted here.
    """

    metric: str  # "precision" or "recall"
    value: str  # as published by the source measurement
    direction: str  # which way this engine is wrong when this figure is low
    reads: str  # what the figure means for someone holding this record
    corpus: str  # what it was measured on — never a claim about other sites
    measured: str  # ISO date
    source: str  # repo-relative path to the derivation
    caveat: str  # the reason this figure is not the last word


#: The two out-of-sample measurements this repository has committed for this
#: engine. Both are quoted at the value their derivation publishes; neither is
#: rounded, averaged, or combined into a single "accuracy" number, because the
#: two directions have different consequences for the reader and collapsing
#: them is how a disclosure becomes a reassurance.
ACCURACY: tuple = (
    AccuracyFigure(
        metric="precision",
        value="0.821–0.881",
        direction="over-reporting — this engine lists defects that are not defects",
        reads=(
            "Expect roughly 12–18% of the findings below not to be real defects. "
            "Confirm a finding before paying anyone to fix it. This is the rate "
            "before the build-artifact filter, so it is a floor for the list you "
            "are holding rather than an estimate of it — see below."
        ),
        corpus=(
            "118 built pages across 7 applications, 67 findings reviewed one by one"
        ),
        measured="2026-08-21",
        source="portfolio/research/a11y-own-sites/",
        caveat=(
            "Two reasons this is not the last word, one in each direction. That "
            "denominator excluded colour contrast (1.4.3) entirely — the review "
            "predates this engine's contrast rule, so the figure describes the "
            "non-contrast findings and no contrast finding has been "
            "precision-checked. And it counts 8 false positives of which the "
            "build-artifact filter now removes 7 from this record, so the list "
            "you are reading is more precise than the number says. The number is "
            "not revised upward here, because the revision would rest on this "
            "engine's own filter rather than on a second review by hand, and "
            "overstating precision is the direction that costs you rather than us."
        ),
    ),
    AccuracyFigure(
        metric="recall",
        value="0.975",
        direction="under-reporting — this engine misses defects that are real",
        reads=(
            "Of 40 defects an independent detector found within the criteria this "
            "engine claims to check, it found 39. A clean result here still is not "
            "a conformance statement."
        ),
        corpus=(
            "the same 118 pages, compared against axe-core 4.13.0 over the 13 "
            "success criteria either engine declares automated or partial"
        ),
        measured="2026-08-21",
        source="portfolio/research/a11y-axe-recall/",
        caveat=(
            "One comparison, against one other tool, on a corpus whose real defects "
            "exercise only 2 of those 13 criteria. It is a single high data point, "
            "not a settled false-negative rate."
        ),
    ),
)

EXCLUSION_STATEMENT = (
    "A build directory holds documents the build tool wrote itself, which are "
    "identical in every project using that tool and cannot be changed from your "
    "source. Findings on those are not counted against your site. They are "
    "listed below in full anyway — the document, the marker that identified it, "
    "and everything found on it — because an exclusion is a limit on what this "
    "record covers, and a limit you cannot see is one you cannot disagree with. "
    "Nothing is excluded on the strength of a filename: each document below was "
    "identified by a marker inside it. If you can edit one of these documents "
    "from your own source, tell us — it belongs in the audit and this filter is "
    "wrong about it."
)

ACCURACY_STATEMENT = (
    "Both numbers below were measured on this portfolio's own built pages, not "
    "on your site, and they describe this engine rather than the audit you are "
    "buying. Read them as the best available estimate of how wrong this list "
    "can be, in both directions, and not as a guarantee about it. "
    "One disclosure matters more than either figure: this audit is the "
    "qualification step for a paid remediation job, so over-reporting is the "
    "error that would pay us. That is why the precision figure is printed here, "
    "beside the findings it applies to, rather than supplied on request."
)


def build_record(audits: dict, checked_at: str) -> dict:
    """``audits`` maps a page label -> :class:`Audit`. ``checked_at`` is an
    ISO-8601 timestamp supplied by the caller (never read from the clock here,
    so records are reproducible).

    Documents the engine identified as the build tool's own output (see
    :mod:`wcag_triage.provenance`) are partitioned out of ``pages`` and
    ``totals`` into ``excluded``, where they are still listed by name, marker
    and finding count. They are set aside, not dropped: a reader who thinks the
    exclusion is wrong can see the whole of what it removed and say so.
    """
    pages = []
    excluded = []
    totals = {"total": 0, "blocking": 0, "degrading": 0}
    contrast_totals = {"pass": 0, "fail": 0, "undecidable": 0, "elements": 0, "reasons": {}}
    for label, audit in audits.items():
        counts = audit.counts()
        if audit.provenance is not None:
            excluded.append(
                {
                    "page": label,
                    "emitter": audit.provenance.emitter,
                    "emitter_name": audit.provenance.name,
                    "marker": audit.provenance.marker,
                    "why": audit.provenance.why,
                    "counts": counts,
                    "findings": [_finding_dict(f) for f in audit.findings],
                }
            )
            continue
        for key in totals:
            totals[key] += counts[key]
        tally = audit.contrast or {}
        for key in ("pass", "fail", "undecidable", "elements"):
            contrast_totals[key] += tally.get(key, 0)
        for reason, count in (tally.get("reasons") or {}).items():
            contrast_totals["reasons"][reason] = contrast_totals["reasons"].get(reason, 0) + count
        pages.append(
            {
                "page": label,
                "counts": counts,
                "contrast": tally,
                "findings": [_finding_dict(f) for f in audit.findings],
            }
        )
    decided = contrast_totals["pass"] + contrast_totals["fail"]
    contrast_totals["decidable_share"] = (
        round(decided / contrast_totals["elements"], 4) if contrast_totals["elements"] else None
    )
    return {
        "tool": {"name": TOOL_NAME, "version": TOOL_VERSION},
        "checked_at": checked_at,
        "coverage_statement": COVERAGE_STATEMENT,
        "coverage": [asdict(c) for c in COVERAGE],
        "coverage_summary": _coverage_summary(),
        "accuracy_statement": ACCURACY_STATEMENT,
        "accuracy": [asdict(a) for a in ACCURACY],
        "totals": totals,
        "contrast": contrast_totals,
        "pages": pages,
        "excluded": {
            "statement": EXCLUSION_STATEMENT,
            "documents": excluded,
            "totals": {
                "documents": len(excluded),
                "findings": sum(d["counts"]["total"] for d in excluded),
            },
        },
    }


def _finding_dict(finding) -> dict:
    # ``seq`` is an internal dedup key (document-order index), not part of the
    # published record.
    data = asdict(finding)
    data.pop("seq", None)
    return data


def _coverage_summary() -> dict:
    summary = {"automated": 0, "partial": 0, "manual": 0, "unimplemented": 0}
    for c in COVERAGE:
        summary[c.coverage] = summary.get(c.coverage, 0) + 1
    return summary


def _contrast_section(tally: dict) -> list:
    """The 1.4.3 decidability table.

    Printed even when nothing was decidable — especially then. A record that
    silently omits contrast reads as though contrast were fine; one that says
    "0 of 412 elements decidable, because no stylesheet was supplied" tells the
    reader exactly what they are still buying.
    """
    elements = tally.get("elements") or 0
    lines = ["", "## Colour contrast (1.4.3)", ""]
    if not elements:
        lines.append("No text-bearing elements were examined.")
        return lines
    share = tally.get("decidable_share")
    lines.append(
        f"{tally.get('pass', 0)} passed, {tally.get('fail', 0)} failed, "
        f"{tally.get('undecidable', 0)} could not be decided from the source supplied "
        f"— {elements} text elements, "
        f"{'%.1f%%' % (share * 100) if share is not None else 'n/a'} decidable."
    )
    reasons = tally.get("reasons") or {}
    if reasons:
        lines += [
            "",
            "Every undecided element, by why it could not be decided. These are"
            " the ones that still need a human:",
            "",
            "| Reason | Elements |",
            "|---|---:|",
        ]
        for reason, count in sorted(reasons.items(), key=lambda item: (-item[1], item[0])):
            lines.append(f"| `{reason}` | {count} |")
    return lines


def _accuracy_headline(record: dict) -> str:
    """One line, in the header block, so the error rate is not scroll-dependent.

    The full section lives further down; this exists so a reader who reads only
    the summary still learns that the list can be wrong and which way.
    """
    figures = record.get("accuracy") or []
    if not figures:
        return "**Accuracy:** not measured for this engine."
    pairs = ", ".join(f"{f['metric']} {f['value']}" for f in figures)
    return (
        f"**Accuracy ({pairs}):** this list both over- and under-reports. See "
        '"How accurate this pass is" below before acting on any finding.'
    )


def _accuracy_section(record: dict) -> list:
    """The measured error rates, rendered beside the findings they qualify.

    Placed immediately before the findings table on purpose. The coverage
    catalog above it is long, and a disclosure a reader reaches only by
    scrolling past it is a disclosure in the same sense a footnote is one.
    """
    figures = record.get("accuracy") or []
    lines = ["", "## How accurate this pass is", ""]
    if not figures:
        lines.append("No accuracy measurement is recorded for this engine.")
        return lines
    lines += [record["accuracy_statement"], ""]
    for fig in figures:
        lines += [
            f"**{fig['metric'].capitalize()} {fig['value']}** "
            f"({fig['direction']}), measured {fig['measured']} on "
            f"{fig['corpus']}.",
            "",
            f"- What it means here: {fig['reads']}",
            f"- Why it is not the last word: {fig['caveat']}",
            f"- Derivation: `{fig['source']}`",
            "",
        ]
    return lines


def _exclusion_section(record: dict) -> list:
    """Everything the build-artifact filter set aside, printed in full.

    Rendered *after* the findings table rather than before it. The findings are
    what the reader is here for; the exclusions are the audit explaining
    itself, and putting an explanation of what was not counted above the list
    of what was is how a disclosure turns into a preamble nobody finishes.
    Omitted entirely when nothing was excluded — a heading announcing zero
    exclusions is noise, and the totals line above already says how many pages
    were read.
    """
    block = record.get("excluded") or {}
    documents = block.get("documents") or []
    if not documents:
        return []
    totals = block.get("totals") or {}
    lines = [
        "",
        "## Documents excluded as build-tool output",
        "",
        f"{totals.get('documents', 0)} document(s) carrying "
        f"{totals.get('findings', 0)} finding(s), not counted in the totals above.",
        "",
        block.get("statement", ""),
        "",
    ]
    for doc in documents:
        lines += [
            f"### {doc['page']} — {doc['emitter_name']}",
            "",
            f"- Identified by: {doc['marker']}",
            f"- Why it is not counted: {doc['why']}",
            f"- Findings set aside: {doc['counts']['blocking']} blocking, "
            f"{doc['counts']['degrading']} degrading",
            "",
        ]
        if doc["findings"]:
            lines += [
                "| Impact | Criterion | Line | Issue |",
                "|---|---|---|---|",
            ]
            for f in doc["findings"]:
                lines.append(
                    f"| {f['impact']} | {f['criterion']} {f['name']} | {f['line']} | "
                    f"{f['message']} |"
                )
            lines.append("")
    return lines


def to_markdown(record: dict) -> str:
    cs = record["coverage_summary"]
    checked = record["totals"]["blocking"] + record["totals"]["degrading"]
    excluded_totals = (record.get("excluded") or {}).get("totals") or {}
    excluded_docs = excluded_totals.get("documents", 0)
    # In the header, not only in the section below: the number of pages is the
    # denominator a reader judges the findings against, and one that silently
    # shrank is worse than no number at all.
    pages_line = f"**Pages:** {len(record['pages'])}"
    if excluded_docs:
        pages_line += (
            f" (a further {excluded_docs} excluded as build-tool output, with "
            f"{excluded_totals.get('findings', 0)} finding(s) — see the last "
            "section)"
        )
    lines = [
        "# Accessibility evidence record",
        "",
        f"**Tool:** `{record['tool']['name']}` v{record['tool']['version']}  ",
        f"**Checked at:** {record['checked_at']}  ",
        pages_line + "  ",
        f"**Findings:** {record['totals']['blocking']} blocking, "
        f"{record['totals']['degrading']} degrading",
        "",
        _accuracy_headline(record),
        "",
        "> " + record["coverage_statement"].replace("\n", " "),
        "",
        "## What was tested automatically",
        "",
        f"{cs['automated']} success criteria fully, {cs['partial']} partially. "
        f"{cs['manual']} commonly-failed criteria below could not be checked "
        "from source and are left for manual assistive-technology review. A "
        f"further {cs['unimplemented']} are decidable from the artifact but "
        "have no rule in this pass — they are neither checked here nor covered "
        "by the manual step, and are listed so that gap is visible rather "
        "than inferred.",
        "",
        "| Criterion | Name | Level | Coverage |",
        "|---|---|---|---|",
    ]
    for c in record["coverage"]:
        lines.append(
            f"| {c['criterion']} | {c['name']} | {c['level']} | {c['coverage']} |"
        )
    lines += _contrast_section(record.get("contrast") or {})
    lines += _accuracy_section(record)
    lines += ["", "## Findings", ""]
    if checked == 0:
        lines.append(
            "No failures found by the static checks above. This is not a "
            "conformance statement — the manual criteria remain unverified."
        )
    for page in record["pages"]:
        if not page["findings"]:
            continue
        lines += ["", f"### {page['page']}", ""]
        lines.append("| Impact | Criterion | Line | Issue |")
        lines.append("|---|---|---|---|")
        for f in page["findings"]:
            lines.append(
                f"| {f['impact']} | {f['criterion']} {f['name']} | {f['line']} | {f['message']} |"
            )
    lines += _exclusion_section(record)
    lines.append("")
    return "\n".join(lines)
