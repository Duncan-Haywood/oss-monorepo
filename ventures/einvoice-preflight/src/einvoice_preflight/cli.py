from __future__ import annotations

import argparse
from collections import Counter
import json
import sys
from pathlib import Path
from typing import Any

from .checks import check_invoice


def _record_usage(path: str) -> None:
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
    events["invoice_preflight_checked"] = int(events.get("invoice_preflight_checked", 0)) + 1
    target.write_text(json.dumps(data, indent=2) + "\n")


def _write_output(path: str, content: str) -> None:
    """Write a report artifact without retaining any invoice data in usage."""
    target = Path(path).expanduser()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


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
    for path, errors in reports:
        lines.append(f"## `{path.as_posix()}`")
        if not errors:
            lines.extend(["", "Status: **PASS**", "", "No defects found in the supported checks.", ""])
            continue
        lines.extend(["", "Status: **FAIL**", ""])
        for error in errors:
            lines.extend([f"- **{error['rule']}**: {error['message']}", f"  Fix: {error['fix']}"])
        lines.append("")
    if read_errors:
        lines.extend(["## Read errors", ""])
        lines.extend(f"- `{error['file']}`: {error['error']}" for error in read_errors)
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def _json_report(reports: list[tuple[Path, list[dict[str, str]]]], read_errors: list[dict[str, str]], *, batch: bool) -> dict[str, Any]:
    """Build one stable adapter payload for both single files and directories."""
    rule_counts = Counter(error["rule"] for _, errors in reports for error in errors)
    errors = [error for _, invoice_errors in reports for error in invoice_errors]
    output: dict[str, Any] = {
        "status": "pass" if not errors and not read_errors else "fail",
        "files_checked": len(reports),
        "files_failed": sum(bool(invoice_errors) for _, invoice_errors in reports),
        "observations": len(errors),
        "rules": dict(sorted(rule_counts.items())),
        "read_errors": read_errors,
    }
    if batch:
        output["reports"] = [{"file": path.as_posix(), "errors": invoice_errors} for path, invoice_errors in reports]
    else:
        output["file"] = reports[0][0].as_posix() if reports else None
        output["errors"] = errors
    return output


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check a local JSON e-invoice before submission. No tax advice or submission.")
    parser.add_argument("invoice", type=Path, help="JSON file, directory of JSON files, or '-' for stdin")
    parser.add_argument("--format", choices=("text", "json", "markdown", "sarif"), default="text")
    parser.add_argument("--output", help="write the report to a local file as well as stdout")
    parser.add_argument("--usage-file", help="opt-in local aggregate event counter")
    args = parser.parse_args(argv)
    reports: list[tuple[Path, list[dict[str, str]]]] = []
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
        if args.usage_file:
            _record_usage(args.usage_file)

    errors = [error for _, invoice_errors in reports for error in invoice_errors]
    has_read_errors = bool(read_errors)
    if args.format == "json":
        rendered = json.dumps(_json_report(reports, read_errors, batch=args.invoice.is_dir()), indent=2) + "\n"
        print(rendered, end="")
    elif args.format == "markdown":
        rendered = _markdown_report(reports, read_errors)
        print(rendered, end="")
    elif args.format == "sarif":
        rendered = json.dumps(_sarif_report(reports), indent=2) + "\n"
        print(rendered, end="")
    elif errors:
        lines = [f"Preflight failed: {len(errors)} observation(s) across {len(reports)} invoice(s)"]
        for path, invoice_errors in reports:
            for error in invoice_errors:
                lines.append(f"{path.as_posix()}: [{error['rule']}] {error['message']} Fix: {error['fix']}")
        for read_error in read_errors:
            lines.append(f"{read_error['file']}: Could not read invoice: {read_error['error']}")
        rendered = "\n".join(lines) + "\n"
        print(rendered, end="")
    elif read_errors:
        rendered = "\n".join(
            f"{read_error['file']}: Could not read invoice: {read_error['error']}" for read_error in read_errors
        ) + "\n"
        print(rendered, end="")
    else:
        rendered = f"Preflight passed: {len(reports)} invoice(s), no defects found in the supported checks.\n"
        print(rendered, end="")
    if args.output:
        _write_output(args.output, rendered)
    return 2 if has_read_errors else (0 if not errors else 1)
