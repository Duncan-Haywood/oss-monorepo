"""Turn an audit into the dated evidence record the candidate actually sells.

The candidate's step 4 is *"a dated file listing what was tested, with what
tool, what changed, what remains open and why."* This is that file, in two
forms. The single most important thing it contains is not the list of failures
— it is the coverage statement: an explicit, machine-readable declaration that
this pass is static-only and that a named set of criteria were **not** checked
and require human assistive-technology review. Selling the failure list without
that statement is the overclaim the candidate's liability section forbids.
"""

from __future__ import annotations

from dataclasses import asdict

from .engine import Audit
from .rules import COVERAGE

TOOL_NAME = "eaa-wcag-triage"
TOOL_VERSION = "0.1.0"

COVERAGE_STATEMENT = (
    "This is a STATIC pass. It inspects HTML source only. It does not render "
    "the page, run its scripts, or use assistive technology, so it cannot "
    "confirm colour contrast, keyboard operability, focus behaviour, or that "
    "any content is genuinely usable. A clean result here is NOT a statement "
    "of conformity and NOT a claim of compliance — it means the static checks "
    "below found no failures. The criteria marked 'manual' require a human "
    "with a screen reader and keyboard, which is the deliberate contractor "
    "step in this pipeline."
)


def build_record(audits: dict, checked_at: str) -> dict:
    """``audits`` maps a page label -> :class:`Audit`. ``checked_at`` is an
    ISO-8601 timestamp supplied by the caller (never read from the clock here,
    so records are reproducible)."""
    pages = []
    totals = {"total": 0, "blocking": 0, "degrading": 0}
    for label, audit in audits.items():
        counts = audit.counts()
        for key in totals:
            totals[key] += counts[key]
        pages.append(
            {
                "page": label,
                "counts": counts,
                "findings": [_finding_dict(f) for f in audit.findings],
            }
        )
    return {
        "tool": {"name": TOOL_NAME, "version": TOOL_VERSION},
        "checked_at": checked_at,
        "coverage_statement": COVERAGE_STATEMENT,
        "coverage": [asdict(c) for c in COVERAGE],
        "coverage_summary": _coverage_summary(),
        "totals": totals,
        "pages": pages,
    }


def _finding_dict(finding) -> dict:
    # ``seq`` is an internal dedup key (document-order index), not part of the
    # published record.
    data = asdict(finding)
    data.pop("seq", None)
    return data


def _coverage_summary() -> dict:
    summary = {"automated": 0, "partial": 0, "manual": 0}
    for c in COVERAGE:
        summary[c.coverage] = summary.get(c.coverage, 0) + 1
    return summary


def to_markdown(record: dict) -> str:
    cs = record["coverage_summary"]
    checked = record["totals"]["blocking"] + record["totals"]["degrading"]
    lines = [
        "# Accessibility evidence record",
        "",
        f"**Tool:** `{record['tool']['name']}` v{record['tool']['version']}  ",
        f"**Checked at:** {record['checked_at']}  ",
        f"**Pages:** {len(record['pages'])}  ",
        f"**Findings:** {record['totals']['blocking']} blocking, "
        f"{record['totals']['degrading']} degrading",
        "",
        "> " + record["coverage_statement"].replace("\n", " "),
        "",
        "## What was tested automatically",
        "",
        f"{cs['automated']} success criteria fully, {cs['partial']} partially. "
        f"{cs['manual']} commonly-failed criteria below could not be checked "
        "from source and are left for manual assistive-technology review.",
        "",
        "| Criterion | Name | Level | Coverage |",
        "|---|---|---|---|",
    ]
    for c in record["coverage"]:
        lines.append(
            f"| {c['criterion']} | {c['name']} | {c['level']} | {c['coverage']} |"
        )
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
    lines.append("")
    return "\n".join(lines)
