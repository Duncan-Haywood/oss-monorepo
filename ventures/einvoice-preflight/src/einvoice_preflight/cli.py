from __future__ import annotations

import argparse
from collections import Counter
import csv
import io
import json
import sys
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape, quoteattr

from .checks import check_invoice


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


def _sarif_report(reports: list[tuple[Path, list[dict[str, str]]]]) -> dict[str, Any]:
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
    """Build one stable adapter payload for every input mode."""
    rule_counts = Counter(error["rule"] for _, errors in reports for error in errors)
    errors = [error for _, invoice_errors in reports for error in invoice_errors]
    output: dict[str, Any] = {
        "status": "pass" if not errors and not read_errors else "fail",
        "files_checked": len(reports),
        "files_failed": sum(bool(invoice_errors) for _, invoice_errors in reports),
        "observations": len(errors),
        "rules": dict(sorted(rule_counts.items())),
        "file": reports[0][0].as_posix() if len(reports) == 1 else None,
        "errors": errors,
        "read_errors": read_errors,
    }
    output["reports"] = [{"file": path.as_posix(), "errors": invoice_errors} for path, invoice_errors in reports]
    return output


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
    parser = argparse.ArgumentParser(description="Check a local JSON e-invoice before submission. No tax advice or submission.")
    parser.add_argument("invoice", type=Path, help="JSON file, directory of JSON files, or '-' for stdin")
    parser.add_argument("--format", choices=("text", "json", "markdown", "csv", "junit", "sarif", "github"), default="text")
    parser.add_argument("--usage-file", help="opt-in local aggregate event counter")
    args = parser.parse_args(argv)
    reports: list[tuple[Path, list[dict[str, str]]]] = []
    invoices: list[tuple[Path, Any]] = []
    read_errors: list[dict[str, str]] = []
    if str(args.invoice) == "-":
        sources = [(Path("stdin.json"), sys.stdin.read())]
    elif args.invoice.is_dir():
        paths = sorted(path for path in args.invoice.rglob("*.json") if path.is_file())
        if not paths:
            print(f"No JSON invoices found in {args.invoice}")
            return 2
        sources = []
        for path in paths:
            try:
                sources.append((path.relative_to(args.invoice), path.read_text()))
            except OSError as exc:
                read_errors.append({"file": path.relative_to(args.invoice).as_posix(), "error": str(exc)})
    else:
        sources = [(args.invoice, None)]

    for invoice_path, source in sources:
        report_path = invoice_path if args.invoice.is_dir() or str(args.invoice) == "-" else Path(invoice_path.name)
        try:
            invoice = json.loads(source if source is not None else invoice_path.read_text())
        except (OSError, json.JSONDecodeError) as exc:
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
    elif args.format == "markdown":
        print(_markdown_report(reports, read_errors), end="")
    elif args.format == "csv":
        print(_csv_report(reports, read_errors), end="")
    elif args.format == "junit":
        print(_junit_report(reports, read_errors), end="")
    elif args.format == "sarif":
        print(json.dumps(_sarif_report(reports), indent=2))
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
