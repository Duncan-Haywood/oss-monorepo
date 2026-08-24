from __future__ import annotations

import argparse
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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check a local JSON e-invoice before submission. No tax advice or submission.")
    parser.add_argument("invoice", type=Path, help="JSON file, directory of JSON files, or '-' for stdin")
    parser.add_argument("--format", choices=("text", "json", "sarif"), default="text")
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
        try:
            invoice = json.loads(source if source is not None else invoice_path.read_text())
        except (OSError, json.JSONDecodeError) as exc:
            read_errors.append({"file": invoice_path.as_posix(), "error": str(exc)})
            continue
        report_path = invoice_path if args.invoice.is_dir() or str(args.invoice) == "-" else Path(invoice_path.name)
        reports.append((report_path, check_invoice(invoice)))
        if args.usage_file:
            _record_usage(args.usage_file)

    errors = [error for _, invoice_errors in reports for error in invoice_errors]
    has_read_errors = bool(read_errors)
    if args.format == "json":
        if args.invoice.is_dir():
            output = {
                "status": "pass" if not errors and not has_read_errors else "fail",
                "files_checked": len(reports),
                "files_failed": sum(bool(invoice_errors) for _, invoice_errors in reports),
                "reports": [{"file": path.as_posix(), "errors": invoice_errors} for path, invoice_errors in reports],
                "read_errors": read_errors,
            }
        else:
            output = {"status": "pass" if not errors and not has_read_errors else "fail", "errors": errors}
        print(json.dumps(output, indent=2))
    elif args.format == "sarif":
        print(json.dumps(_sarif_report(reports), indent=2))
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
