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


def _sarif_report(invoice_path: Path, errors: list[dict[str, str]]) -> dict[str, Any]:
    """Build a SARIF 2.1.0 report for CI annotations and code scanning tools."""
    rules = {}
    results = []
    for error in errors:
        rule = error["rule"]
        rules.setdefault(rule, {"id": rule, "shortDescription": {"text": error["message"]}})
        results.append({
            "ruleId": rule,
            "level": "error",
            "message": {"text": f'{error["message"]} Fix: {error["fix"]}'},
            "locations": [{"physicalLocation": {"artifactLocation": {"uri": invoice_path.name}}}],
        })
    return {
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "version": "2.1.0",
        "runs": [{
            "tool": {"driver": {"name": "einvoice-preflight", "informationUri": "https://github.com/Duncan-Haywood/monorepo-projects/tree/main/ventures/einvoice-preflight", "rules": list(rules.values())}},
            "results": results,
        }],
    }


def _markdown_report(invoice_path: Path, errors: list[dict[str, str]]) -> str:
    status = "Pass" if not errors else "Needs review"
    lines = [f"# E-invoice preflight: {status}", "", f"Input: `{invoice_path.name}`", ""]
    if not errors:
        lines.append("No defects found in the supported checks.")
        return "\n".join(lines) + "\n"
    lines.extend([f"{len(errors)} observation(s) require review:", ""])
    for error in errors:
        lines.extend([f"## {error['rule']}", error["message"], "", f"**Fix:** {error['fix']}", ""])
    lines.append("This report is an observation, not a declaration that the invoice is legally valid or compliant.")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check a local JSON e-invoice before submission. No tax advice or submission.")
    parser.add_argument("invoice", type=Path, help="JSON file to check, or '-' to read JSON from stdin")
    parser.add_argument("--format", choices=("text", "markdown", "json", "sarif"), default="text")
    parser.add_argument("--usage-file", help="opt-in local aggregate event counter")
    args = parser.parse_args(argv)
    invoice_name = "stdin.json" if str(args.invoice) == "-" else args.invoice.name
    try:
        source = sys.stdin.read() if str(args.invoice) == "-" else args.invoice.read_text()
        invoice = json.loads(source)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Could not read invoice: {exc}")
        return 2
    errors = check_invoice(invoice)
    if args.usage_file:
        _record_usage(args.usage_file)
    if args.format == "json":
        print(json.dumps({"status": "pass" if not errors else "fail", "errors": errors}, indent=2))
    elif args.format == "markdown":
        print(_markdown_report(Path(invoice_name), errors), end="")
    elif args.format == "sarif":
        print(json.dumps(_sarif_report(Path(invoice_name), errors), indent=2))
    elif errors:
        print(f"Preflight failed: {len(errors)} observation(s)")
        for error in errors:
            print(f"[{error['rule']}] {error['message']} Fix: {error['fix']}")
    else:
        print("Preflight passed: no defects found in the supported checks.")
    return 0 if not errors else 1
