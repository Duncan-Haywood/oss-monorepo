"""Customer-facing evidence record. Evidence, not a certificate."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from accuracy import ACCURACY
from check import PhotoReport
from spec import COVERAGE, SPEC_DATE, SPEC_ID


def render(folder: Path, reports: list[PhotoReport], checked_on: str | None = None) -> str:
    checked_on = checked_on or date.today().isoformat()
    blocking = sum(1 for r in reports for f in r.findings if f.severity == "blocking")
    degrading = sum(1 for r in reports for f in r.findings if f.severity == "degrading")
    photos = len(reports)
    unimplemented = [k for k, v in COVERAGE.items() if v == "unimplemented"]

    lines = [
        f"# Listing photo spec record — {folder.name}",
        "",
        f"Checked: {checked_on}. Spec: `{SPEC_ID}` (dated {SPEC_DATE}).",
        f"Photos: {photos}. Blocking findings: {blocking}. Degrading findings: {degrading}.",
        "",
        "## This is a record, not a certificate",
        "",
        "It states what was tested on these files. It does not claim portal "
        "or board acceptance. Do not submit this folder on anyone's behalf "
        "from this tool — it has no upload path.",
        "",
        "## How this can be wrong",
        "",
        f"On the author-authored fixture corpus ({ACCURACY['date']}, "
        f"{ACCURACY['photos']} photos) this checker measured precision "
        f"**{ACCURACY['precision']}** and recall **{ACCURACY['recall']}** "
        f"at finding-level ({ACCURACY['true_positives']} true positives, "
        f"{ACCURACY['false_positives']} false positives, "
        f"{ACCURACY['false_negatives']} false negatives).",
        "",
        "Those figures are a floor against cases written to trip the six "
        "coded rules. They say nothing about visual watermarks, burned-in "
        "phone numbers, or board-specific extras — those rows are "
        f"`unimplemented`: {', '.join(unimplemented)}.",
        "",
        "A silent pass is the error that costs the customer. A broker can "
        "be fined for branding on an MLS-submitted photo; over-reporting a "
        "filename token only costs a rename. That is why filename tokens "
        "are conservative, and why this paragraph exists.",
        "",
        "## Coverage",
        "",
    ]
    for rule, status in COVERAGE.items():
        lines.append(f"- `{rule}`: {status}")
    lines.extend(["", "## Findings", ""])
    if not reports:
        lines.append("No listing photos (`.jpg` / `.jpeg` / `.png`) in this folder.")
        return "\n".join(lines) + "\n"

    for report in reports:
        info = report.info
        size = (
            f"{info.width}x{info.height}"
            if info.width is not None and info.height is not None
            else "unknown-size"
        )
        header = f"### {info.path.name} ({info.format or 'unknown'}, {size}, {info.nbytes} bytes)"
        lines.append(header)
        if not report.findings:
            lines.append("")
            lines.append(
                "No coded-rule findings. This is not a clean bill: "
                "unimplemented checks were not run."
            )
            lines.append("")
            continue
        lines.append("")
        for finding in report.findings:
            lines.append(f"- **{finding.severity}** `{finding.rule}` — {finding.detail}")
        lines.append("")
    return "\n".join(lines) + "\n"
