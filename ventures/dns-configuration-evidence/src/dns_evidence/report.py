"""Deterministic comparison of customer-supplied DNS observation snapshots."""

from __future__ import annotations

import json
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any


REQUIRED = ("name", "type", "resolver", "observed_at")
UNCERTAIN = {"timeout", "disagreement", "dnssec_failure", "refused", "error"}


def load_snapshot(source: str | Path | dict[str, Any]) -> dict[str, Any]:
    if isinstance(source, dict):
        snapshot = source
    else:
        snapshot = json.loads(Path(source).read_text(encoding="utf-8"))
    if snapshot.get("authorized") is not True:
        raise ValueError("input must declare authorized: true")
    if not snapshot.get("domain"):
        raise ValueError("input must include a customer-authorized domain")
    observations = snapshot.get("observations")
    if not isinstance(observations, list):
        raise ValueError("input must include an observations list")
    identities: set[tuple[str, str, str]] = set()
    for observation in observations:
        if not isinstance(observation, dict):
            raise ValueError("each observation must be an object")
        missing = [key for key in REQUIRED if not observation.get(key)]
        if missing:
            raise ValueError(f"observation missing required fields: {', '.join(missing)}")
        try:
            datetime.fromisoformat(observation["observed_at"].replace("Z", "+00:00"))
        except ValueError as error:
            raise ValueError("observation observed_at must be an ISO 8601 timestamp") from error
        if "answers" not in observation and observation.get("status") not in UNCERTAIN:
            raise ValueError("successful observations require answers; failures require a known status")
        identity = _key(observation)
        if identity in identities:
            raise ValueError("snapshot contains duplicate name/type/resolver observations")
        identities.add(identity)
    captured_at = snapshot.get("captured_at")
    if captured_at:
        try:
            datetime.fromisoformat(captured_at.replace("Z", "+00:00"))
        except ValueError as error:
            raise ValueError("captured_at must be an ISO 8601 timestamp") from error
    return snapshot


def _key(observation: dict[str, Any]) -> tuple[str, str, str]:
    return observation["name"].lower(), observation["type"].upper(), observation["resolver"]


def _value(observation: dict[str, Any]) -> tuple[str, ...] | None:
    if observation.get("status") in UNCERTAIN:
        return None
    return tuple(sorted(str(answer) for answer in observation.get("answers", [])))


def build_report(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    if before["domain"].lower() != after["domain"].lower():
        raise ValueError("snapshots must describe the same domain")
    old = {_key(item): item for item in before["observations"]}
    new = {_key(item): item for item in after["observations"]}
    findings = []
    for key in sorted(set(old) | set(new)):
        previous, current = old.get(key), new.get(key)
        previous_value = _value(previous) if previous else None
        current_value = _value(current) if current else None
        if not previous or not current or previous_value is None or current_value is None:
            status = "inconclusive"
        elif previous_value == current_value:
            status = "unchanged"
        else:
            status = "changed"
        findings.append({
            "name": key[0], "type": key[1], "resolver": key[2], "status": status,
            "before_status": previous.get("status", "ok") if previous else "missing",
            "after_status": current.get("status", "ok") if current else "missing",
            "before_answers": list(previous_value) if previous_value is not None else None,
            "after_answers": list(current_value) if current_value is not None else None,
            "before_observed_at": previous.get("observed_at") if previous else None,
            "after_observed_at": current.get("observed_at") if current else None,
        })
    return {
        "domain": before["domain"],
        "before_captured_at": before.get("captured_at"),
        "after_captured_at": after.get("captured_at"),
        "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "finding_counts": dict(Counter(item["status"] for item in findings)),
        "findings": findings,
        "limitations": [
            "This records observations from named resolvers; it does not establish global DNS truth.",
            "Inconclusive observations are not reported as unchanged.",
            "The customer must verify authorization and decide on remediation.",
        ],
    }


def _escape_cell(value: str) -> str:
    """Keep arbitrary DNS text inside a Markdown table cell."""
    return value.replace("&", "&amp;").replace("|", "&#124;").replace("`", "&#96;").replace("\n", "<br>")


def _display_answers(answers: list[str] | None, status: str) -> str:
    if answers is None:
        return f"{status} (not observed)"
    if not answers:
        return "(no answers)"
    return "<br>".join(f"`{_escape_cell(answer)}`" for answer in answers)


def markdown_report(report: dict[str, Any]) -> str:
    lines = [f"# DNS evidence: `{report['domain']}`", "", "This is an observation record, not a security, deliverability, or compliance warranty.", "", "## Summary", ""]
    counts = report["finding_counts"]
    lines.append(" · ".join(f"**{key}:** {counts.get(key, 0)}" for key in ("changed", "unchanged", "inconclusive")))
    lines.extend(["", "## Findings", "", "| Name | Type | Resolver | Result | Before | After |", "|---|---|---|---|---|---|"])
    for finding in report["findings"]:
        before = _display_answers(finding["before_answers"], finding["before_status"])
        after = _display_answers(finding["after_answers"], finding["after_status"])
        lines.append(f"| `{finding['name']}` | `{finding['type']}` | `{finding['resolver']}` | **{finding['status']}** | {before} | {after} |")
    lines.extend(["", "## Limits", ""])
    lines.extend(f"- {limit}" for limit in report["limitations"])
    return "\n".join(lines) + "\n"
