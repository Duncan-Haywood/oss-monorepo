from __future__ import annotations

import argparse
from collections import Counter
import csv
from html import escape as html_escape
import io
import json
import sys
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape, quoteattr

from .checks import check_invoice
from .ubl import parse_ubl_invoice


def _record_usage(path: str) -> None:
    """Record an aggregate event without affecting the validation result."""
    try:
        target = Path(path).expanduser()
        target.parent.mkdir(parents=True, exist_ok=True)
        data: dict[str, Any] = {"events": {}}
        if target.exists():
            try:
                loaded = json.loads(target.read_text())
                if isinstance(loaded, dict) and isinstance(loaded.get("events"), dict):
                    data = loaded
            except (OSError, json.JSONDecodeError):
                pass
        events = data.setdefault("events", {})
        try:
            previous = int(events.get("invoice_preflight_checked", 0))
        except (TypeError, ValueError):
            previous = 0
        events["invoice_preflight_checked"] = previous + 1
        target.write_text(json.dumps(data, indent=2) + "\n")
    except (OSError, TypeError, ValueError):
        # Usage is optional telemetry; never hide or change a preflight result.
        pass


def _sarif_report(
    reports: list[tuple[Path, list[dict[str, str]]]],
    read_errors: list[dict[str, str]],
) -> dict[str, Any]:
    """Build a SARIF 2.1.0 report for CI annotations and code scanning tools."""
    rules = {}
    results = []
    for invoice_path, errors in reports:
        for error in errors:
            rule = error["rule"]
            rules.setdefault(rule, {"id": rule, "shortDescription": {"text": error["message"]}})
            results.append({
                "ruleId": rule,
                "level": "error",
                "message": {"text": f'{error["message"]} Fix: {error["fix"]}'},
                "properties": {"jsonPointer": error["path"]},
                "locations": [{"physicalLocation": {"artifactLocation": {"uri": invoice_path.as_posix()}}}],
            })
    for read_error in read_errors:
        rules.setdefault("INV-READ", {
            "id": "INV-READ",
            "shortDescription": {"text": "Invoice could not be read."},
        })
        results.append({
            "ruleId": "INV-READ",
            "level": "error",
            "message": {"text": f"Invoice could not be read: {read_error['error']}"},
            "locations": [{"physicalLocation": {"artifactLocation": {"uri": read_error["file"]}}}],
        })
    return {
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "version": "2.1.0",
        "runs": [{
            "tool": {"driver": {"name": "einvoice-preflight", "informationUri": "https://github.com/Duncan-Haywood/monorepo-projects/tree/main/ventures/einvoice-preflight", "rules": list(rules.values())}},
            "results": results,
        }],
    }


def _markdown_report(reports: list[tuple[Path, list[dict[str, str]]]], read_errors: list[dict[str, str]]) -> str:
    """Build a reviewable report containing filenames and observations only."""
    observations = sum(len(errors) for _, errors in reports)
    failed = sum(bool(errors) for _, errors in reports)
    passed = len(reports) - failed
    overall = "FAIL" if observations or read_errors else "PASS"
    rule_counts = Counter(error["rule"] for _, errors in reports for error in errors)
    rule_messages = {
        error["rule"]: error["message"]
        for _, errors in reports
        for error in errors
    }
    lines = [
        "# E-invoice preflight",
        "",
        f"Overall: **{overall}**",
        f"Checked: {len(reports)} invoice(s)",
        f"Passed: {passed}",
        f"Failed: {failed}",
        f"Observations: {observations}",
        f"Read errors: {len(read_errors)}",
        "",
    ]
    if rule_counts:
        lines.extend(["## Finding summary", "", "| Rule | Occurrences | Check |", "| --- | ---: | --- |"])
        for rule, count in sorted(rule_counts.items()):
            lines.append(f"| `{_markdown_text(rule)}` | {count} | {_markdown_text(rule_messages[rule])} |")
        lines.append("")
    for path, errors in reports:
        lines.append(f"## `{_markdown_text(path.as_posix())}`")
        if not errors:
            lines.extend(["", "Status: **PASS**", "", "No defects found in the supported checks.", ""])
            continue
        lines.extend(["", "Status: **FAIL**", ""])
        for error in errors:
            lines.extend([
                f"- **{_markdown_text(error['rule'])}** at `{_markdown_text(error['path']) or '/'}`: {_markdown_text(error['message'])}",
                f"  Fix: {_markdown_text(error['fix'])}",
            ])
        lines.append("")
    if read_errors:
        lines.extend(["## Read errors", ""])
        lines.extend(
            f"- `{_markdown_text(error['file'])}`: {_markdown_text(error['error'])}"
            for error in read_errors
        )
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def _github_report(reports: list[tuple[Path, list[dict[str, str]]]], read_errors: list[dict[str, str]]) -> str:
    """Build GitHub Actions workflow commands without emitting invoice data."""
    lines = []
    for path, errors in reports:
        for error in errors:
            message = f"{error['message']} Fix: {error['fix']}"
            lines.append(
                f"::error file={_github_property(path.as_posix())},line=1,"
                f"title={_github_property(error['rule'])}::{_github_message(message)}"
            )
    for error in read_errors:
        lines.append(
            f"::error file={_github_property(error['file'])},line=1,title=Unreadable invoice::"
            f"{_github_message(error['error'])}"
        )
    return "\n".join(lines) + ("\n" if lines else "")


def _github_property(value: str) -> str:
    """Escape a workflow-command property value."""
    return value.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A").replace(",", "%2C")


def _github_message(value: str) -> str:
    """Escape a workflow-command message value."""
    return value.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")


def _json_report(
    reports: list[tuple[Path, list[dict[str, str]]]],
    read_errors: list[dict[str, str]],
) -> dict[str, Any]:
    """Build one versioned adapter payload for every input mode."""
    rule_counts = Counter(error["rule"] for _, errors in reports for error in errors)
    errors = [error for _, invoice_errors in reports for error in invoice_errors]
    exit_code = 2 if read_errors else (0 if not errors else 1)
    output: dict[str, Any] = {
        "schema_version": 1,
        "status": "pass" if not errors and not read_errors else "fail",
        "exit_code": exit_code,
        "files_checked": len(reports),
        "files_failed": sum(bool(invoice_errors) for _, invoice_errors in reports),
        "observations": len(errors),
        "rules": dict(sorted(rule_counts.items())),
        "file": reports[0][0].as_posix() if len(reports) == 1 else None,
        "errors": errors,
        "read_errors": read_errors,
    }
    output["reports"] = [
        {
            "file": path.as_posix(),
            "status": "fail" if invoice_errors else "pass",
            "observations": len(invoice_errors),
            "errors": invoice_errors,
        }
        for path, invoice_errors in reports
    ]
    return output


def _jsonl_report(
    reports: list[tuple[Path, list[dict[str, str]]]],
    read_errors: list[dict[str, str]],
) -> str:
    """Build one line-delimited result per invoice or read error."""
    lines = [
        json.dumps(
            {"status": "pass" if not errors else "fail", "file": path.as_posix(), "errors": errors},
            separators=(",", ":"),
        )
        for path, errors in reports
    ]
    lines.extend(
        json.dumps(
            {"status": "read_error", "file": error["file"], "errors": [], "error": error["error"]},
            separators=(",", ":"),
        )
        for error in read_errors
    )
    return "\n".join(lines) + ("\n" if lines else "")


def _csv_report(
    reports: list[tuple[Path, list[dict[str, str]]]],
    read_errors: list[dict[str, str]],
) -> str:
    """Build a spreadsheet-friendly triage report without invoice values."""
    rows: list[dict[str, str]] = []
    for path, errors in reports:
        if errors:
            rows.extend(
                {
                    "file": path.as_posix(),
                    "status": "fail",
                    "rule": error["rule"],
                    "path": error["path"],
                    "message": error["message"],
                    "fix": error["fix"],
                    "error": "",
                }
                for error in errors
            )
        else:
            rows.append({"file": path.as_posix(), "status": "pass", "rule": "", "path": "", "message": "", "fix": "", "error": ""})
    rows.extend(
        {"file": error["file"], "status": "read_error", "rule": "", "path": "", "message": "", "fix": "", "error": error["error"]}
        for error in read_errors
    )
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=("file", "status", "rule", "path", "message", "fix", "error"), lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue()


def _junit_report(
    reports: list[tuple[Path, list[dict[str, str]]]],
    read_errors: list[dict[str, str]],
) -> str:
    """Build a CI-compatible JUnit report without emitting invoice contents."""
    testcases: list[str] = []
    failures = 0
    errors = 0
    for path, findings in reports:
        attributes = f" name={quoteattr(path.as_posix())} classname={quoteattr('einvoice-preflight')}"
        if findings:
            failures += 1
            details = "\n".join(
                f"[{finding['rule']}] {finding['path'] or '/'}: {finding['message']} Fix: {finding['fix']}"
                for finding in findings
            )
            testcases.append(f"  <testcase{attributes}><failure message={quoteattr('Invoice preflight failed')}>{escape(details)}</failure></testcase>")
        else:
            testcases.append(f"  <testcase{attributes} />")
    for read_error in read_errors:
        errors += 1
        testcases.append(
            f"  <testcase name={quoteattr(read_error['file'])} classname={quoteattr('einvoice-preflight')}>"
            f"<error message={quoteattr('Invoice could not be read')}>{escape(read_error['error'])}</error></testcase>"
        )
    total = len(reports) + len(read_errors)
    body = "\n".join(testcases)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<testsuite name="einvoice-preflight" tests="{total}" failures="{failures}" errors="{errors}">\n'
        f"{body}\n</testsuite>\n"
    )


def _html_report(
    reports: list[tuple[Path, list[dict[str, str]]]],
    read_errors: list[dict[str, str]],
) -> str:
    """Build a standalone, privacy-safe report for browser review."""
    observations = sum(len(errors) for _, errors in reports)
    failed = sum(bool(errors) for _, errors in reports)
    passed = len(reports) - failed
    rule_counts = Counter(error["rule"] for _, errors in reports for error in errors)
    rule_messages = {error["rule"]: error["message"] for _, errors in reports for error in errors}
    overall = "FAIL" if observations or read_errors else "PASS"

    def text(value: str) -> str:
        return html_escape(value, quote=True)

    metrics = "".join(
        f'<div class="metric"><strong>{value}</strong><span>{label}</span></div>'
        for value, label in ((len(reports), "checked"), (passed, "passed"), (failed, "failed"), (observations, "observations"), (len(read_errors), "read errors"))
    )
    summary = ""
    if rule_counts:
        rows = "".join(
            f"<tr><td><code>{text(rule)}</code></td><td>{count}</td><td>{text(rule_messages[rule])}</td></tr>"
            for rule, count in sorted(rule_counts.items())
        )
        summary = f'<section><h2>Finding summary</h2><table><thead><tr><th>Rule</th><th>Occurrences</th><th>Check</th></tr></thead><tbody>{rows}</tbody></table></section>'

    sections = []
    for path, errors in reports:
        if errors:
            findings = "".join(
                f'<li><strong>{text(error["rule"])}</strong> at <code>{text(error["path"] or "/")}</code><br>{text(error["message"])}<br><span class="fix">Fix: {text(error["fix"])}</span></li>'
                for error in errors
            )
            body = f'<p class="status fail">FAIL</p><ul>{findings}</ul>'
        else:
            body = '<p class="status pass">PASS</p><p>No defects found in the supported checks.</p>'
        sections.append(f'<article><h2><code>{text(path.as_posix())}</code></h2>{body}</article>')
    read_section = ""
    if read_errors:
        items = "".join(f'<li><code>{text(error["file"])}</code>: {text(error["error"])}</li>' for error in read_errors)
        read_section = f'<section><h2>Read errors</h2><ul>{items}</ul></section>'
    accent = "#a61b1b" if overall == "FAIL" else "#116329"
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>E-invoice preflight: {text(overall)}</title>
<style>
:root {{ color-scheme: light; font-family: system-ui, sans-serif; background: #f4f5f7; color: #17202a; }}
body {{ max-width: 960px; margin: 0 auto; padding: 2rem 1rem 4rem; }}
header, section, article {{ background: white; border: 1px solid #d9dee5; border-radius: 10px; padding: 1.25rem; margin: 1rem 0; box-shadow: 0 2px 8px #17202a0d; }}
h1 {{ margin-top: 0; }} h2 {{ font-size: 1.05rem; }} .overall {{ color: {accent}; font-weight: 700; letter-spacing: .08em; }}
.metrics {{ display: flex; flex-wrap: wrap; gap: .75rem; }} .metric {{ min-width: 7rem; background: #eef2f6; border-radius: 8px; padding: .75rem; }}
.metric strong, .metric span {{ display: block; }} .metric strong {{ font-size: 1.5rem; }} .metric span {{ color: #52606d; font-size: .85rem; }}
table {{ border-collapse: collapse; width: 100%; }} th, td {{ border-bottom: 1px solid #e4e7eb; padding: .6rem; text-align: left; vertical-align: top; }}
.status {{ font-weight: 700; }} .pass {{ color: #116329; }} .fail {{ color: #a61b1b; }} .fix, footer {{ color: #52606d; }} li {{ margin: .7rem 0; }} code {{ overflow-wrap: anywhere; }} footer {{ font-size: .85rem; margin-top: 1.5rem; }}
</style></head><body><header><h1>E-invoice preflight</h1><p class="overall">Overall: {text(overall)}</p><div class="metrics">{metrics}</div></header>
{summary}{''.join(sections)}{read_section}<footer>This local report is an observation, not a declaration that an invoice is valid or compliant. It contains no invoice values or line contents. Review and verify output before relying on it; this tool is not tax or legal advice.</footer>
</body></html>
'''


def _add_batch_duplicate_findings(
    reports: list[tuple[Path, list[dict[str, str]]]],
    invoices: list[tuple[Path, Any]],
) -> None:
    """Flag repeated invoice numbers without including the number in output."""
    number_paths: dict[str, list[Path]] = {}
    for path, invoice in invoices:
        if isinstance(invoice, dict) and isinstance(invoice.get("invoice_number"), str):
            number = invoice["invoice_number"].strip()
            if number:
                number_paths.setdefault(number, []).append(path)
    duplicates = {path for paths in number_paths.values() if len(paths) > 1 for path in paths}
    for path, errors in reports:
        if path in duplicates:
            errors.append({
                "rule": "INV-019",
                "message": "Invoice number is repeated in this batch.",
                "fix": "Use a unique invoice number or remove the duplicate before submission.",
                "path": "/invoice_number",
            })


def _markdown_text(value: str) -> str:
    """Keep local filenames and validator text from changing report structure."""
    return value.replace("\\", "\\\\").replace("|", "\\|").replace("`", "\\`")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check a local JSON or UBL XML e-invoice before submission. No tax advice or submission.")
    parser.add_argument("invoice", type=Path, help="JSON/XML file, directory of JSON/XML files, or '-' for stdin")
    parser.add_argument("--format", choices=("text", "json", "jsonl", "markdown", "html", "csv", "junit", "sarif", "github"), default="text")
    parser.add_argument("--usage-file", help="opt-in local aggregate event counter")
    args = parser.parse_args(argv)
    reports: list[tuple[Path, list[dict[str, str]]]] = []
    invoices: list[tuple[Path, Any]] = []
    read_errors: list[dict[str, str]] = []
    if str(args.invoice) == "-":
        stdin = getattr(sys.stdin, "buffer", sys.stdin)
        source = stdin.read()
        sources = [(Path("stdin.json"), source.encode() if isinstance(source, str) else source)]
    elif args.invoice.is_dir():
        # Keep a directory scan inside its selected root instead of following
        # symlinks into an unrelated location.
        paths = sorted(
            path for pattern in ("*.json", "*.xml")
            for path in args.invoice.rglob(pattern)
            if path.is_file() or path.is_symlink()
        )
        if not paths:
            print(f"No JSON or XML invoices found in {args.invoice}")
            return 2
        sources = []
        for path in paths:
            relative_path = path.relative_to(args.invoice)
            if path.is_symlink():
                read_errors.append({
                    "file": relative_path.as_posix(),
                    "error": "Refusing to follow symbolic link during directory scan.",
                })
                continue
            try:
                sources.append((path.relative_to(args.invoice), path.read_bytes()))
            except OSError as exc:
                read_errors.append({"file": relative_path.as_posix(), "error": str(exc)})
    else:
        sources = [(args.invoice, None)]

    for invoice_path, source in sources:
        report_path = invoice_path if args.invoice.is_dir() or str(args.invoice) == "-" else Path(invoice_path.name)
        try:
            raw = source if source is not None else invoice_path.read_bytes()
            is_xml = report_path.suffix.lower() == ".xml" or raw.lstrip().startswith(b"<")
            invoice = parse_ubl_invoice(raw) if is_xml else json.loads(raw)
        except (OSError, UnicodeDecodeError, ValueError, json.JSONDecodeError) as exc:
            read_errors.append({"file": report_path.as_posix(), "error": str(exc)})
            continue
        reports.append((report_path, check_invoice(invoice)))
        invoices.append((report_path, invoice))
        if args.usage_file:
            _record_usage(args.usage_file)

    if args.invoice.is_dir():
        _add_batch_duplicate_findings(reports, invoices)

    errors = [error for _, invoice_errors in reports for error in invoice_errors]
    has_read_errors = bool(read_errors)
    if args.format == "json":
        print(json.dumps(_json_report(reports, read_errors), indent=2))
    elif args.format == "jsonl":
        print(_jsonl_report(reports, read_errors), end="")
    elif args.format == "markdown":
        print(_markdown_report(reports, read_errors), end="")
    elif args.format == "html":
        print(_html_report(reports, read_errors), end="")
    elif args.format == "csv":
        print(_csv_report(reports, read_errors), end="")
    elif args.format == "junit":
        print(_junit_report(reports, read_errors), end="")
    elif args.format == "sarif":
        print(json.dumps(_sarif_report(reports, read_errors), indent=2))
    elif args.format == "github":
        print(_github_report(reports, read_errors), end="")
    elif errors:
        print(f"Preflight failed: {len(errors)} observation(s) across {len(reports)} invoice(s)")
        for path, invoice_errors in reports:
            for error in invoice_errors:
                print(f"{path.as_posix()}: [{error['rule']}] {error['message']} Fix: {error['fix']}")
        for read_error in read_errors:
            print(f"{read_error['file']}: Could not read invoice: {read_error['error']}")
    elif read_errors:
        for read_error in read_errors:
            print(f"{read_error['file']}: Could not read invoice: {read_error['error']}")
    else:
        print(f"Preflight passed: {len(reports)} invoice(s), no defects found in the supported checks.")
    return 2 if has_read_errors else (0 if not errors else 1)
