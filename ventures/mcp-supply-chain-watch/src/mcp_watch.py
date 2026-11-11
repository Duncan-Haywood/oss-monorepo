#!/usr/bin/env python3
"""Compare two locally captured MCP tool manifests.

This reports observed changes; it does not certify a server or proxy requests.
"""
from __future__ import annotations

import argparse
import json
import re
from datetime import date
from pathlib import Path

INSTRUCTION = re.compile(
    r"\b(ignore|disregard|override|system message|you must|do not (?:tell|mention|inform)|before using|send .* to|reveal)\b"
    r"|<\s*important\s*>|~/\.ssh|\bid_rsa\b|\.cursor/mcp\.json",
    re.I,
)
# Zero-width and bidirectional-control characters hide text from a human reviewer.
HIDDEN = re.compile("[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]")


def text_fields(tool: dict) -> dict[str, str]:
    """Every model-visible string of a tool, keyed by where it sits.

    The top-level description and every string anywhere inside inputSchema
    (property descriptions, titles, enum values, defaults): a payload hidden in
    a parameter description reaches the model just as the tool description does.
    """
    fields = {"description": tool.get("description") if isinstance(tool.get("description"), str) else ""}

    def walk(value, path):
        if isinstance(value, str):
            fields[path] = value
        elif isinstance(value, dict):
            for key in sorted(value):
                walk(value[key], f"{path}.{key}")
        elif isinstance(value, list):
            for index, item in enumerate(value):
                walk(item, f"{path}[{index}]")

    walk(tool.get("inputSchema"), "inputSchema")
    return fields


def signals(text: str) -> set[str]:
    found = {match.group(0).lower() for match in INSTRUCTION.finditer(text)}
    if HIDDEN.search(text):
        found.add("hidden-characters")
    return found


def new_signals(old: dict, new: dict) -> list[str]:
    """Locations whose text gained an instruction signal it did not have before."""
    old_fields, new_fields = text_fields(old), text_fields(new)
    return [path for path, text in new_fields.items()
            if signals(text) - signals(old_fields.get(path, ""))]


def markdown(report: dict) -> str:
    """Render evidence without copying manifest descriptions or schemas."""
    changes = report["changes"]
    lines = [
        "# MCP supply-chain watch",
        "",
        f"Server: `{report.get('server') or 'unknown'}`",
        f"Before: `{report.get('before') or 'unknown'}`",
        f"After: `{report.get('after') or 'unknown'}`",
        "",
    ]
    if not changes:
        lines.append("No tool changes observed.")
        return "\n".join(lines) + "\n"
    lines.extend([f"Observed changes: {len(changes)}", ""])
    for change in changes:
        bucket = f" ({change['bucket']})" if "bucket" in change else ""
        reason = f" -- {change['reason']}" if "reason" in change else ""
        lines.append(f"- **{change['severity'].upper()}** `{change['kind']}`: `{change['tool']}`{bucket}{reason}")
    lines.extend(["", "Observed manifest differences are not a safety certification."])
    return "\n".join(lines) + "\n"


def load(path: str) -> dict:
    value = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(value, dict) or not isinstance(value.get("tools"), list):
        raise ValueError(f"{path}: expected an object with a tools list")
    tools = {}
    for item in value["tools"]:
        if not isinstance(item, dict) or not isinstance(item.get("name"), str):
            raise ValueError(f"{path}: every tool needs a name")
        if item["name"] in tools:
            raise ValueError(f"{path}: duplicate tool {item['name']!r}")
        tools[item["name"]] = item
    return {**value, "tools": tools}


def classify(old: dict, new: dict) -> tuple[str, str]:
    old_text = old.get("description") or ""
    new_text = new.get("description") or ""
    description_changed = old_text != new_text
    flagged = new_signals(old, new)
    if flagged:
        return "instruction-bearing", f"newly contains model-directed language in: {', '.join(flagged)}"
    old_schema = json.dumps(old.get("inputSchema", {}), sort_keys=True)
    new_schema = json.dumps(new.get("inputSchema", {}), sort_keys=True)
    if old_schema != new_schema:
        return "schema-change", "inputSchema changed"
    if description_changed:
        return "description-change", "description changed without a detected instruction signal"
    changed_keys = sorted(key for key in set(old) | set(new) if old.get(key) != new.get(key))
    return "metadata-change", f"fields changed without a description or inputSchema difference: {', '.join(changed_keys)}"


def compare(before: dict, after: dict) -> dict:
    old, new = before["tools"], after["tools"]
    changes = []
    for name in sorted(new.keys() - old.keys()):
        flagged = new_signals({}, new[name])
        if flagged:
            changes.append({"kind": "tool_added", "severity": "alert", "tool": name, "bucket": "instruction-bearing",
                            "reason": f"contains model-directed language in: {', '.join(flagged)}"})
        else:
            changes.append({"kind": "tool_added", "severity": "review", "tool": name})
    for name in sorted(old.keys() - new.keys()):
        changes.append({"kind": "tool_removed", "severity": "alert", "tool": name})
    for name in sorted(old.keys() & new.keys()):
        if old[name] == new[name]:
            continue
        bucket, reason = classify(old[name], new[name])
        changes.append({"kind": "description_changed", "severity": "alert" if bucket == "instruction-bearing" else "review", "tool": name, "bucket": bucket, "reason": reason})
    changes.sort(key=lambda item: (0 if item["severity"] == "alert" else 1, item["kind"], item["tool"]))
    return {"before": before.get("captured"), "after": after.get("captured"), "server": after.get("server", before.get("server")), "changes": changes, "observed_on": date.today().isoformat(), "disclaimer": "Observed manifest differences are not a safety certification."}


def main() -> int:
    parser = argparse.ArgumentParser(description="Compare two MCP tool manifests and write reviewable drift evidence.")
    parser.add_argument("before")
    parser.add_argument("after")
    parser.add_argument("--output", help="write the JSON evidence report to this path")
    parser.add_argument("--format", choices=("json", "markdown"), default="json")
    parser.add_argument("--usage-log", help="append one aggregate comparison event")
    parser.add_argument("--fail-on-alert", action="store_true", help="exit 2 when any change is at alert severity (for CI)")
    args = parser.parse_args()
    try:
        report = compare(load(args.before), load(args.after))
    except (OSError, ValueError, json.JSONDecodeError) as error:
        parser.error(str(error))
    rendered = markdown(report) if args.format == "markdown" else json.dumps(report, indent=2, sort_keys=True) + "\n"
    if args.output:
        Path(args.output).write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")
    if args.usage_log:
        with Path(args.usage_log).open("a", encoding="utf-8") as stream:
            stream.write(json.dumps({"event": "manifest_compared", "day": date.today().isoformat(), "product": "mcp-supply-chain-watch"}) + "\n")
    if args.fail_on_alert and any(change["severity"] == "alert" for change in report["changes"]):
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
