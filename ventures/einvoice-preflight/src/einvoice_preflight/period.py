"""Offline invoice-period (BT-73 / BT-74) observations.

A service invoice that names only one end of the billing window, or that
ends before it starts, is a common ERP export mistake. Networks then
reject the file after the bookkeeper already sent it. This is a
date-shape check, not a Peppol profile determination and not a claim
that the dates match the underlying contract. Findings never repeat the
dates.
"""

from __future__ import annotations

from datetime import date
from typing import Any


def parse_iso_date(value: Any) -> date | None:
    """Accept the documented extended YYYY-MM-DD form only."""
    if not isinstance(value, str) or len(value) != 10 or value[4] != "-" or value[7] != "-":
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def inspect_invoice_period(invoice: dict[str, Any]) -> list[dict[str, str]]:
    """Return INV-042 / INV-043 observations for an optional invoice period."""
    if "period" not in invoice:
        return []
    period = invoice.get("period")
    if period in (None, ""):
        return []
    if not isinstance(period, dict):
        return [_finding(
            "INV-042",
            "Invoice period is not an object with start and end dates.",
            "Use period.start and period.end as YYYY-MM-DD, or omit period.",
            "/period",
        )]

    start_raw = period.get("start")
    end_raw = period.get("end")
    start_missing = start_raw in (None, "")
    end_missing = end_raw in (None, "")
    if start_missing and end_missing:
        return [_finding(
            "INV-042",
            "Invoice period is missing both start and end dates.",
            "Add period.start and period.end as YYYY-MM-DD, or omit period.",
            "/period",
        )]

    findings: list[dict[str, str]] = []
    start = None if start_missing else parse_iso_date(start_raw)
    end = None if end_missing else parse_iso_date(end_raw)
    if start_missing:
        findings.append(_finding(
            "INV-042",
            "Invoice period is missing a start date.",
            "Add period.start as YYYY-MM-DD, or omit period.",
            "/period/start",
        ))
    elif start is None:
        findings.append(_finding(
            "INV-042",
            "Invoice period start is not an ISO date.",
            "Use YYYY-MM-DD, for example 2026-07-01.",
            "/period/start",
        ))
    if end_missing:
        findings.append(_finding(
            "INV-042",
            "Invoice period is missing an end date.",
            "Add period.end as YYYY-MM-DD, or omit period.",
            "/period/end",
        ))
    elif end is None:
        findings.append(_finding(
            "INV-042",
            "Invoice period end is not an ISO date.",
            "Use YYYY-MM-DD, for example 2026-07-31.",
            "/period/end",
        ))
    if start is not None and end is not None and end < start:
        findings.append(_finding(
            "INV-043",
            "Invoice period end is earlier than the start.",
            "Set period.end to period.start or a later date.",
            "/period/end",
        ))
    return findings


def _finding(rule: str, message: str, fix: str, path: str) -> dict[str, str]:
    return {"rule": rule, "message": message, "fix": fix, "path": path}
