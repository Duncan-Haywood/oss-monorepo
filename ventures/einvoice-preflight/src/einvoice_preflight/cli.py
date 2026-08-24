from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from .checks import ERROR, WARNING, check_invoice
from .formats import DocumentError, load_document

SYNTAX_LABELS = {
    "ubl": "UBL 2.1 XML",
    "cii": "UN/CEFACT CII XML",
    "json": "preflight JSON",
}


def _record_usage(path: str, events: list[str]) -> None:
    """Increment local aggregate counters. Never records invoice content.

    The counter exists so a reading can be reported by hand if a user
    volunteers one; there is no endpoint and nothing leaves the machine. Only
    event names and counts are stored -- not amounts, parties, file names, or
    paths.
    """
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
    counters = data.setdefault("events", {})
    for event in events:
        counters[event] = int(counters.get(event, 0)) + 1
    target.write_text(json.dumps(data, indent=2) + "\n")


def _usage_events(syntax: str, errors: list[dict[str, str]], warnings: list[dict[str, str]]) -> list[str]:
    """Which aggregate counters this run bumps.

    Recording the syntax and whether anything was caught is what turns the
    counter from a vanity number into an answer to "is this tool finding
    defects for anyone, and in which format" -- the question that decides
    whether it is worth continuing to build.
    """
    events = ["invoice_preflight_checked", f"syntax_{syntax}"]
    if errors:
        events.append("defect_found")
    if warnings:
        events.append("warning_found")
    if not errors and not warnings:
        events.append("preflight_clean")
    return events


def _print_findings(findings: list[dict[str, str]]) -> None:
    for finding in findings:
        reference = f" ({finding['reference']})" if finding.get("reference") else ""
        print(f"[{finding['rule']}{reference}] {finding['message']}")
        print(f"    Fix: {finding['fix']}")


def _sarif_report(invoice_path: Path, findings: list[dict[str, str]]) -> dict[str, Any]:
    """Build a SARIF report without including invoice contents."""
    rules: dict[str, dict[str, Any]] = {}
    results = []
    for finding in findings:
        rule = finding["rule"]
        rules.setdefault(rule, {"id": rule, "shortDescription": {"text": finding["message"]}})
        results.append({
            "ruleId": rule,
            "level": "warning" if finding.get("severity") == WARNING else "error",
            "message": {"text": f'{finding["message"]} Fix: {finding["fix"]}'},
            "locations": [{"physicalLocation": {"artifactLocation": {"uri": invoice_path.name}}}],
        })
    return {
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "version": "2.1.0",
        "runs": [{
            "tool": {"driver": {
                "name": "einvoice-preflight",
                "informationUri": "https://github.com/Duncan-Haywood/monorepo-projects/tree/main/ventures/einvoice-preflight",
                "rules": list(rules.values()),
            }},
            "results": results,
        }],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Check a local e-invoice before submission. Reads UBL 2.1, "
            "UN/CEFACT CII, or this tool's JSON shape. It never submits an "
            "invoice, chooses a tax rate, or certifies compliance."
        )
    )
    parser.add_argument("invoice", type=Path, help="path to the invoice file (XML or JSON)")
    parser.add_argument("--format", choices=("text", "json", "sarif"), default="text", help="report format")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="exit non-zero for warnings too, not just for errors",
    )
    parser.add_argument("--usage-file", help="opt-in local aggregate event counter")
    args = parser.parse_args(argv)

    try:
        invoice, syntax = load_document(args.invoice)
    except DocumentError as exc:
        print(f"Could not read invoice: {exc}")
        return 2

    findings = check_invoice(invoice)
    errors = [finding for finding in findings if finding.get("severity", ERROR) == ERROR]
    warnings = [finding for finding in findings if finding.get("severity") == WARNING]

    if args.usage_file:
        _record_usage(args.usage_file, _usage_events(syntax, errors, warnings))

    if args.format == "json":
        print(
            json.dumps(
                {
                    "status": "fail" if errors else "pass",
                    "syntax": syntax,
                    "profile": invoice.get("profile") if isinstance(invoice, dict) else None,
                    "counts": {"errors": len(errors), "warnings": len(warnings)},
                    # `errors` keeps its original name and meaning so an ERP
                    # adapter written against v0 keeps working; warnings are a
                    # new, separate list rather than a change to that one.
                    "errors": errors,
                    "warnings": warnings,
                },
                indent=2,
            )
        )
    elif args.format == "sarif":
        print(json.dumps(_sarif_report(args.invoice, findings), indent=2))
    else:
        print(f"Read {args.invoice.name} as {SYNTAX_LABELS.get(syntax, syntax)}.")
        if errors:
            print(f"\nPreflight failed: {len(errors)} defect(s) that contradict the document itself.")
            _print_findings(errors)
        else:
            print("\nPreflight passed: no defects found in the supported checks.")
        if warnings:
            print(
                f"\n{len(warnings)} warning(s) — legal under EN 16931, but a common "
                "reason a submission bounces at a national or Peppol profile:"
            )
            _print_findings(warnings)
        print(
            "\nThis is a preflight observation, not a declaration that the invoice "
            "is valid or compliant. Format-specific validation and professional "
            "review are still needed before submission."
        )

    if errors:
        return 1
    return 1 if (args.strict and warnings) else 0
