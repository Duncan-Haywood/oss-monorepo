"""Customer-facing evidence record. Evidence, not a certificate."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from accuracy import ACCURACY
from check import FileReport
from spec import COVERAGE, SPEC_DATE, SPEC_ID


def render(folder: Path, reports: list[FileReport], checked_on: str | None = None) -> str:
    checked_on = checked_on or date.today().isoformat()
    blocking = sum(1 for r in reports for f in r.findings if f.severity == "blocking")
    degrading = sum(1 for r in reports for f in r.findings if f.severity == "degrading")
    files = len(reports)
    unimplemented = [k for k, v in COVERAGE.items() if v == "unimplemented"]

    lines = [
        f"# Print-file spec record — {folder.name}",
        "",
        f"Checked: {checked_on}. Spec: `{SPEC_ID}` (dated {SPEC_DATE}).",
        f"Files: {files}. Blocking findings: {blocking}. Degrading findings: {degrading}.",
        "",
        "## This is a record, not a certificate",
        "",
        "It states what was tested on these files. It does not claim lab "
        "acceptance. Do not submit this folder to a printer on anyone's "
        "behalf from this tool — it has no upload path.",
        "",
        "## How this can be wrong",
        "",
        f"On the author-authored fixture corpus ({ACCURACY['date']}, "
        f"{ACCURACY['files']} files) this checker measured precision "
        f"**{ACCURACY['precision']}** and recall "
        f"**{ACCURACY['recall']}** at finding-level "
        f"({ACCURACY['true_positives']} true positives, "
        f"{ACCURACY['false_positives']} false positives, "
        f"{ACCURACY['false_negatives']} false negatives).",
        "",
        "Those figures are a floor against cases written to trip the six "
        "coded rules. They say nothing about bleed margins, CMYK or ICC "
        "profiles, PDF fonts, or lab-specific extras — those rows are "
        f"`unimplemented`: {', '.join(unimplemented)}.",
        "",
        "A silent pass is the error that costs the customer. An artist "
        "can pay for a print run that comes back soft or cropped; "
        "over-reporting a filename token only costs a rename. That is "
        "why web-export tokens are conservative, and why this paragraph "
        "exists.",
        "",
        "## Coverage",
        "",
    ]
    for rule, status in COVERAGE.items():
        lines.append(f"- `{rule}`: {status}")
    lines.extend(["", "## Findings", ""])
    if not reports:
        lines.append("No print files (`.jpg` / `.jpeg` / `.png`) in this folder.")
        return "\n".join(lines) + "\n"

    for report in reports:
        info = report.info
        size = (
            f"{info.width}x{info.height}"
            if info.width is not None and info.height is not None
            else "unknown-size"
        )
        named = f", size-token {report.size_token}" if report.size_token else ", no size token"
        header = (
            f"### {info.path.name} ({info.format or 'unknown'}, "
            f"{size}, {info.nbytes} bytes{named})"
        )
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
