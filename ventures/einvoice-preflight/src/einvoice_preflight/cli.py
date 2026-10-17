from __future__ import annotations

import argparse
from collections import Counter
import csv
from html import escape as html_escape
import io
import json
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape, quoteattr

import fcntl

from .checks import check_invoice
from .facturx import (
    EmbeddedInvoiceError,
    envelope_note,
    extract_embedded_invoice,
    looks_like_pdf,
)
from .formats import DocumentError, detect_syntax, parse_cii_invoice
from .ubl import parse_ubl_invoice

VERSION = "0.1.0"


def _record_usage(path: str, event: str = "invoice_preflight_checked") -> None:
    """Record an aggregate event without affecting the validation result."""
    temporary_path: str | None = None
    try:
        target = Path(path).expanduser()
        target.parent.mkdir(parents=True, exist_ok=True)
        # A sidecar lock prevents concurrent CLI processes from dropping events.
        with target.with_name(f".{target.name}.lock").open("a+") as lock:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
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
                previous = int(events.get(event, 0))
            except (TypeError, ValueError):
                previous = 0
            events[event] = previous + 1
            with tempfile.NamedTemporaryFile(
                "w", encoding="utf-8", dir=target.parent, prefix=f".{target.name}.", delete=False
            ) as temporary:
                temporary_path = temporary.name
                json.dump(data, temporary, indent=2)
                temporary.write("\n")
                temporary.flush()
                os.fsync(temporary.fileno())
            os.replace(temporary_path, target)
            temporary_path = None
    except (OSError, TypeError, ValueError):
        # Usage is optional telemetry; never hide or change a preflight result.
        pass
    finally:
        if temporary_path:
            try:
                os.unlink(temporary_path)
            except OSError:
                pass


def _write_output(path: str, content: str) -> None:
    """Write a generated report atomically so CI never sees a partial file."""
    target = Path(path).expanduser()
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=target.parent, prefix=f".{target.name}.", delete=False
        ) as handle:
            temporary = handle.name
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, target)
        temporary = None
    finally:
        if temporary is not None:
            try:
                os.unlink(temporary)
            except OSError:
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
    rule_fixes = {
        error["rule"]: error["fix"]
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
        lines.extend(["## Finding summary", "", "| Rule | Occurrences | Check | Recommended fix |", "| --- | ---: | --- | --- |"])
        for rule, count in sorted(rule_counts.items()):
            lines.append(f"| `{_markdown_text(rule)}` | {count} | {_markdown_text(rule_messages[rule])} | {_markdown_text(rule_fixes[rule])} |")
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
    if not lines:
        lines.append(
            f"::notice title=E-invoice preflight::Passed: {len(reports)} invoice(s), "
            "no defects found in the supported checks."
        )
    return "\n".join(lines) + ("\n" if lines else "")


def _github_property(value: str) -> str:
    """Escape a workflow-command property value."""
    return value.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A").replace(",", "%2C")


def _github_message(value: str) -> str:
    """Escape a workflow-command message value."""
    return value.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")


def _positive_int(value: str) -> int:
    """Parse a positive CLI limit with an actionable argparse error."""
    try:
        parsed = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("must be a positive integer") from exc
    if parsed < 1:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return parsed


def _collect_invoice_paths(root: Path, max_depth: int | None) -> list[Path]:
    """List JSON/XML/PDF invoices under root without following directory links.

    ``--max-depth`` matches ``find -maxdepth``: 1 is files in the scan root,
    2 includes one subdirectory, and so on. Deeper directories are not walked
    so a nested export dump cannot expand a CI job.
    """
    paths: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        current = Path(dirpath)
        try:
            relative_dir = current.relative_to(root)
        except ValueError:
            dirnames.clear()
            continue
        depth = 0 if relative_dir == Path(".") else len(relative_dir.parts)
        if max_depth is not None and depth + 1 >= max_depth:
            dirnames.clear()
        for name in filenames:
            path = current / name
            if path.suffix.lower() not in {".json", ".xml", ".pdf"}:
                continue
            if path.is_symlink() or path.is_file():
                paths.append(path)
    return sorted(paths)


def _read_limited(stream: Any, limit: int | None) -> bytes:
    """Read at most one byte beyond a configured input limit."""
    raw = stream.read() if limit is None else stream.read(limit + 1)
    if isinstance(raw, str):
        raw = raw.encode()
    if limit is not None and len(raw) > limit:
        raise ValueError(f"Input exceeds --max-bytes {limit}; refusing to read it.")
    return raw


def _read_file_limited(path: Path, limit: int | None) -> bytes:
    """Reject oversized files before allocating their contents."""
    if limit is not None and path.stat().st_size > limit:
        raise ValueError(f"File exceeds --max-bytes {limit}; refusing to read it.")
    with path.open("rb") as stream:
        return _read_limited(stream, limit)


def _json_report(
    reports: list[tuple[Path, list[dict[str, str]]]],
    read_errors: list[dict[str, str]],
) -> dict[str, Any]:
    """Build one versioned adapter payload for every input mode."""
    rule_counts = Counter(error["rule"] for _, errors in reports for error in errors)
    errors = [
        {**error, "file": path.as_posix()}
        for path, invoice_errors in reports
        for error in invoice_errors
    ]
    fix_details: dict[str, dict[str, str | int]] = {}
    for error in errors:
        detail = fix_details.setdefault(
            error["rule"],
            {"rule": error["rule"], "occurrences": 0, "message": error["message"], "fix": error["fix"]},
        )
        detail["occurrences"] = int(detail["occurrences"]) + 1
    exit_code = 2 if read_errors else (0 if not errors else 1)
    output: dict[str, Any] = {
        "schema_version": 1,
        "status": "pass" if not errors and not read_errors else "fail",
        "exit_code": exit_code,
        "files_checked": len(reports),
        "files_failed": sum(bool(invoice_errors) for _, invoice_errors in reports),
        "observations": len(errors),
        "rules": dict(sorted(rule_counts.items())),
        "fixes": [fix_details[rule] for rule in sorted(fix_details)],
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
    lines = []
    for path, errors in reports:
        fix_details: dict[str, dict[str, str | int]] = {}
        for error in errors:
            detail = fix_details.setdefault(
                error["rule"],
                {"rule": error["rule"], "occurrences": 0, "message": error["message"], "fix": error["fix"]},
            )
            detail["occurrences"] = int(detail["occurrences"]) + 1
        lines.append(
            json.dumps(
                {
                    "schema_version": 1,
                    "status": "pass" if not errors else "fail",
                    "file": path.as_posix(),
                    "observations": len(errors),
                    "fixes": [fix_details[rule] for rule in sorted(fix_details)],
                    "errors": errors,
                },
                separators=(",", ":"),
            )
        )
    lines.extend(
        json.dumps(
            {
                "schema_version": 1,
                "status": "read_error",
                "file": error["file"],
                "observations": 0,
                "fixes": [],
                "errors": [],
                "error": error["error"],
            },
            separators=(",", ":"),
        )
        for error in read_errors
    )
    return "\n".join(lines) + ("\n" if lines else "")


def _summary_report(
    reports: list[tuple[Path, list[dict[str, str]]]],
    read_errors: list[dict[str, str]],
    envelopes: dict[str, str] | None = None,
) -> str:
    """Build a compact, privacy-safe batch summary for CI logs."""
    findings = [error for _, errors in reports for error in errors]
    rule_counts = Counter(error["rule"] for error in findings)
    status = "FAIL" if findings or read_errors else "PASS"
    lines = [
        "E-invoice preflight summary",
        f"Overall: {status}",
        f"Checked: {len(reports)}",
        f"Passed: {sum(not errors for _, errors in reports)}",
        f"Failed: {sum(bool(errors) for _, errors in reports)}",
        f"Observations: {len(findings)}",
        f"Read errors: {len(read_errors)}",
    ]
    if rule_counts:
        lines.append("Rules: " + ", ".join(f"{rule}={count}" for rule, count in sorted(rule_counts.items())))
    for path, note in (envelopes or {}).items():
        lines.append(f"{path}: {note}")
    return "\n".join(lines) + "\n"


def _remediation_report(
    reports: list[tuple[Path, list[dict[str, str]]]],
    read_errors: list[dict[str, str]],
) -> dict[str, Any]:
    """Build a per-invoice remediation queue for ERP and ticket adapters."""
    items: list[dict[str, Any]] = []
    for path, errors in reports:
        grouped: dict[str, dict[str, Any]] = {}
        for error in errors:
            item = grouped.setdefault(
                error["rule"],
                {
                    "file": path.as_posix(),
                    "rule": error["rule"],
                    "occurrences": 0,
                    "paths": [],
                    "message": error["message"],
                    "fix": error["fix"],
                },
            )
            item["occurrences"] += 1
            if error["path"] not in item["paths"]:
                item["paths"].append(error["path"])
        items.extend(grouped[rule] for rule in sorted(grouped))
    return {
        "schema_version": 1,
        "status": "pass" if not items and not read_errors else "fail",
        "exit_code": 2 if read_errors else (1 if items else 0),
        "files_checked": len(reports),
        "observations": sum(len(errors) for _, errors in reports),
        "items": items,
        "read_errors": read_errors,
    }


def _remediation_csv_report(
    reports: list[tuple[Path, list[dict[str, str]]]],
    read_errors: list[dict[str, str]],
) -> str:
    """Build one spreadsheet row per rule across the batch for triage queues."""
    grouped: dict[str, dict[str, str | int]] = {}
    for _, findings in reports:
        for finding in findings:
            detail = grouped.setdefault(
                finding["rule"],
                {
                    "rule": finding["rule"],
                    "occurrences": 0,
                    "message": finding["message"],
                    "fix": finding["fix"],
                },
            )
            detail["occurrences"] = int(detail["occurrences"]) + 1
    rows = [grouped[rule] for rule in sorted(grouped)]
    if read_errors:
        rows.append({
            "rule": "INV-READ",
            "occurrences": len(read_errors),
            "message": "Invoice could not be read.",
            "fix": "Resolve the read error and run the preflight again.",
        })
    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=("rule", "occurrences", "message", "fix"),
        lineterminator="\n",
    )
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue()


def _checklist_report(
    reports: list[tuple[Path, list[dict[str, str]]]],
    read_errors: list[dict[str, str]],
) -> str:
    """Build a copyable repair checklist without invoice values or contents."""
    def redact_values(text: str) -> str:
        # Validator fixes may include calculated amounts; keep the action but not the value.
        return re.sub(r"\b\d+(?:\.\d+)?\b", "[value]", text)

    observations = sum(len(errors) for _, errors in reports)
    lines = [
        "E-invoice preflight repair checklist",
        "",
        f"Status: {'FAIL' if observations or read_errors else 'PASS'}",
        f"Checked: {len(reports)} invoice(s)",
        f"Observations: {observations}",
        f"Read errors: {len(read_errors)}",
        "",
    ]
    for path, errors in reports:
        lines.append(f"[ ] Review {path.as_posix()}")
        if not errors:
            lines.append("    No supported defects found.")
            continue
        grouped: dict[str, dict[str, Any]] = {}
        for error in errors:
            item = grouped.setdefault(error["rule"], {"count": 0, "paths": [], "message": error["message"], "fix": error["fix"]})
            item["count"] += 1
            if error["path"] not in item["paths"]:
                item["paths"].append(error["path"])
        for rule in sorted(grouped):
            item = grouped[rule]
            suffix = f" ({item['count']} occurrence(s))" if item["count"] != 1 else ""
            lines.append(f"    - [ ] {rule}{suffix} at {', '.join(item['paths'])}: {redact_values(item['message'])}")
            lines.append(f"      Fix: {redact_values(item['fix'])}")
    if read_errors:
        lines.extend(["", "Unreadable inputs:"])
        lines.extend(f"- [ ] Review {error['file']}: {error['error']}" for error in read_errors)
    lines.extend(["", "This is a local observation checklist, not a declaration of legal validity or compliance.", "Review and verify each change before submitting an invoice."])
    return "\n".join(lines) + "\n"


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
    rule_fixes = {error["rule"]: error["fix"] for _, errors in reports for error in errors}
    overall = "FAIL" if observations or read_errors else "PASS"

    def text(value: str) -> str:
        return html_escape(value, quote=True)

    metrics = "".join(
        f'<div class="metric"><strong>{value}</strong><span>{label}</span></div>'
        for value, label in ((len(reports), "checked"), (passed, "passed"), (failed, "failed"), (observations, "observations"), (len(read_errors), "read errors"))
    )
    summary = ""
    rule_sections: dict[str, list[str]] = {}
    for index, (path, errors) in enumerate(reports):
        section_id = f"invoice-{index}"
        for error in errors:
            rule_sections.setdefault(error["rule"], []).append(section_id)

    def rule_links(rule: str) -> str:
        return " ".join(
            f'<a href="#{section}">Invoice {section.removeprefix("invoice-")}</a>'
            for section in rule_sections[rule]
        )

    if rule_counts:
        rows = "".join(
            f'<tr><td><code>{text(rule)}</code></td><td>{count}</td>'
            f'<td>{rule_links(rule)}<br>{text(rule_messages[rule])}</td>'
            f'<td>{text(rule_fixes[rule])}</td></tr>'
            for rule, count in sorted(rule_counts.items())
        )
        summary = f'<section id="finding-summary" aria-labelledby="finding-summary-heading"><h2 id="finding-summary-heading">Finding summary</h2><table><caption>Findings grouped by validation rule</caption><thead><tr><th scope="col">Rule</th><th scope="col">Occurrences</th><th scope="col">Check</th><th scope="col">Recommended fix</th></tr></thead><tbody>{rows}</tbody></table></section>'

    sections = []
    for index, (path, errors) in enumerate(reports):
        section_id = f"invoice-{index}"
        if errors:
            findings = "".join(
                f'<li><strong>{text(error["rule"])}</strong> at <code>{text(error["path"] or "/")}</code><br>{text(error["message"])}<br><span class="fix">Fix: {text(error["fix"])}</span></li>'
                for error in errors
            )
            body = f'<p class="status fail" role="status">FAIL</p><ul>{findings}</ul>'
        else:
            body = '<p class="status pass" role="status">PASS</p><p>No defects found in the supported checks.</p>'
        heading_id = f"{section_id}-heading"
        sections.append(f'<article id="{section_id}" aria-labelledby="{heading_id}"><h2 id="{heading_id}"><code>{text(path.as_posix())}</code></h2>{body}</article>')
    read_section = ""
    if read_errors:
        items = "".join(f'<li><code>{text(error["file"])}</code>: {text(error["error"])}</li>' for error in read_errors)
        read_section = f'<section id="read-errors" aria-labelledby="read-errors-heading"><h2 id="read-errors-heading">Read errors</h2><ul>{items}</ul></section>'
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
 a {{ color: #075985; }} .skip-link {{ position: absolute; left: -9999px; top: auto; }} .skip-link:focus {{ left: 1rem; top: 1rem; background: white; padding: .5rem; z-index: 1; }}
.status {{ font-weight: 700; }} .pass {{ color: #116329; }} .fail {{ color: #a61b1b; }} .fix, footer {{ color: #52606d; }} li {{ margin: .7rem 0; }} code {{ overflow-wrap: anywhere; }} footer {{ font-size: .85rem; margin-top: 1.5rem; }}
 </style></head><body><a class="skip-link" href="#report-content">Skip to report content</a><header aria-labelledby="report-title"><h1 id="report-title">E-invoice preflight</h1><p class="overall" role="status">Overall: {text(overall)}</p><div class="metrics" aria-label="Report metrics">{metrics}</div></header>
 <main id="report-content" aria-label="Preflight report"><nav aria-label="Report sections">{'<a href="#finding-summary">Finding summary</a>' if rule_counts else ''}{' | ' if rule_counts and read_errors else ''}{'<a href="#read-errors">Read errors</a>' if read_errors else ''}</nav>{summary}{''.join(sections)}{read_section}</main><footer>This local report is an observation, not a declaration that an invoice is valid or compliant. It contains no invoice values or line contents. Review and verify output before relying on it; this tool is not tax or legal advice.</footer>
</body></html>
'''


def _seller_key(invoice: dict[str, Any]) -> str:
    """Seller identity for duplicate detection: id, VAT id, or name."""
    seller = invoice.get("supplier")
    if isinstance(seller, dict):
        for field in ("id", "vat_id", "name"):
            value = seller.get(field)
            if isinstance(value, str) and value.strip():
                return f"{field}:{' '.join(value.lower().split())}"
    return ""


def _add_batch_duplicate_findings(
    reports: list[tuple[Path, list[dict[str, str]]]],
    invoices: list[tuple[Path, Any]],
) -> None:
    """Flag a seller repeating an invoice number, without echoing the number."""
    number_paths: dict[tuple[str, str], list[Path]] = {}
    for path, invoice in invoices:
        if isinstance(invoice, dict) and isinstance(invoice.get("invoice_number"), str):
            number = invoice["invoice_number"].strip()
            if number:
                number_paths.setdefault((_seller_key(invoice), number), []).append(path)
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
    parser = argparse.ArgumentParser(description="Check a local JSON, UBL XML, UN/CEFACT CII, or Factur-X PDF e-invoice before submission. No tax advice or submission.")
    parser.add_argument("--version", action="version", version=f"einvoice-preflight {VERSION}")
    parser.add_argument("invoice", type=Path, help="JSON/XML/PDF file, directory of those files, or '-' for stdin")
    parser.add_argument("--format", choices=("text", "summary", "json", "jsonl", "remediation", "remediation-csv", "checklist", "markdown", "html", "csv", "junit", "sarif", "github"), default="text")
    parser.add_argument("--usage-file", help="opt-in local aggregate event counter")
    parser.add_argument("--output", help="write the report to this local file atomically instead of stdout")
    parser.add_argument(
        "--max-files",
        type=_positive_int,
        help="refuse a directory scan when it contains more invoice files than this",
    )
    parser.add_argument(
        "--max-bytes",
        type=_positive_int,
        help="refuse an input invoice larger than this many bytes",
    )
    parser.add_argument(
        "--max-depth",
        type=_positive_int,
        help="refuse to walk more than this many path components below a directory (1 is the scan root only)",
    )
    args = parser.parse_args(argv)
    if args.usage_file:
        # Count attempted invocations separately from successfully parsed files.
        _record_usage(args.usage_file, "invoice_preflight_attempted")
    reports: list[tuple[Path, list[dict[str, str]]]] = []
    invoices: list[tuple[Path, Any]] = []
    read_errors: list[dict[str, str]] = []
    envelopes: dict[str, str] = {}
    if str(args.invoice) == "-":
        stdin = getattr(sys.stdin, "buffer", sys.stdin)
        try:
            source = _read_limited(stdin, args.max_bytes)
        except ValueError as exc:
            read_errors.append({"file": "stdin.json", "error": str(exc)})
            source = None
        sources = [] if source is None else [(Path("stdin.json"), source)]
    elif args.invoice.is_dir():
        # Keep a directory scan inside its selected root instead of following
        # symlinks into an unrelated location, and stop descending when
        # --max-depth is set so a nested dump cannot expand the walk.
        paths = _collect_invoice_paths(args.invoice, args.max_depth)
        if not paths:
            read_errors.append({"file": args.invoice.as_posix(), "error": "No JSON, XML, or PDF invoices found."})
            sources = []
        elif args.max_files is not None and len(paths) > args.max_files:
            read_errors.append({
                "file": args.invoice.as_posix(),
                "error": (
                    f"Directory contains {len(paths)} JSON/XML/PDF invoices, exceeding "
                    f"--max-files {args.max_files}. Refusing to scan."
                ),
            })
            sources = []
        else:
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
                    sources.append((path.relative_to(args.invoice), _read_file_limited(path, args.max_bytes)))
                except (OSError, ValueError) as exc:
                    read_errors.append({"file": relative_path.as_posix(), "error": str(exc)})
    else:
        sources = [(args.invoice, None)]

    for invoice_path, source in sources:
        report_path = invoice_path if args.invoice.is_dir() or str(args.invoice) == "-" else Path(invoice_path.name)
        try:
            raw = source if source is not None else _read_file_limited(invoice_path, args.max_bytes)
            if looks_like_pdf(raw):
                raw, label = extract_embedded_invoice(raw)
                try:
                    syntax = detect_syntax(raw)
                except DocumentError:
                    syntax = "ubl"
                envelopes[report_path.as_posix()] = envelope_note(label, syntax)
            is_xml = report_path.suffix.lower() in {".xml", ".pdf"} or raw.lstrip().startswith(b"<")
            if is_xml:
                try:
                    syntax = detect_syntax(raw)
                except DocumentError:
                    syntax = "ubl"
                invoice = parse_cii_invoice(raw) if syntax == "cii" else parse_ubl_invoice(raw)
            else:
                invoice = json.loads(raw)
        except (OSError, UnicodeDecodeError, ValueError, json.JSONDecodeError, DocumentError, EmbeddedInvoiceError) as exc:
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
    report: str | None = None
    if args.format == "json":
        report = json.dumps(_json_report(reports, read_errors), indent=2) + "\n"
    elif args.format == "summary":
        report = _summary_report(reports, read_errors, envelopes)
    elif args.format == "jsonl":
        report = _jsonl_report(reports, read_errors)
    elif args.format == "remediation":
        report = json.dumps(_remediation_report(reports, read_errors), indent=2) + "\n"
    elif args.format == "remediation-csv":
        report = _remediation_csv_report(reports, read_errors)
    elif args.format == "checklist":
        report = _checklist_report(reports, read_errors)
    elif args.format == "markdown":
        report = _markdown_report(reports, read_errors)
    elif args.format == "html":
        report = _html_report(reports, read_errors)
    elif args.format == "csv":
        report = _csv_report(reports, read_errors)
    elif args.format == "junit":
        report = _junit_report(reports, read_errors)
    elif args.format == "sarif":
        report = json.dumps(_sarif_report(reports, read_errors), indent=2) + "\n"
    elif args.format == "github":
        report = _github_report(reports, read_errors)
    elif errors:
        lines = [f"Preflight failed: {len(errors)} observation(s) across {len(reports)} invoice(s)"]
        for path, invoice_errors in reports:
            for error in invoice_errors:
                lines.append(f"{path.as_posix()}: [{error['rule']}] {error['message']} Fix: {error['fix']}")
        for read_error in read_errors:
            lines.append(f"{read_error['file']}: Could not read invoice: {read_error['error']}")
        report = "\n".join(lines) + "\n"
    elif read_errors:
        report = "\n".join(
            f"{read_error['file']}: Could not read invoice: {read_error['error']}"
            for read_error in read_errors
        ) + "\n"
    else:
        report = f"Preflight passed: {len(reports)} invoice(s), no defects found in the supported checks.\n"
    if args.output:
        try:
            _write_output(args.output, report)
        except OSError as exc:
            print(f"Could not write report to {args.output}: {exc}", file=sys.stderr)
            return 2
    else:
        print(report, end="")
    if args.usage_file and args.format == "github":
        _record_usage(args.usage_file, "invoice_preflight_github_report")
    return 2 if has_read_errors else (0 if not errors else 1)
