"""Offline payment terms-days versus due-date observations.

An invoice that names Net-N days but whose due date is not issue date plus
N is a common ERP export mistake. Access points then reject the file after
the bookkeeper already sent it. This is an arithmetic check, not a Peppol
profile determination and not a claim that the buyer must pay by that
date. Findings never repeat party or account data. The expected due date
may appear in the fix, the same way other arithmetic rules name the
expected total.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any


def parse_iso_date(value: Any) -> date | None:
    """Accept the documented extended YYYY-MM-DD form only."""
    if not isinstance(value, str) or len(value) != 10 or value[4] != "-" or value[7] != "-":
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def parse_terms_days(value: Any) -> int | None:
    """Return a positive whole number of days, or None when the value is not one."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value >= 1 else None
    if isinstance(value, float):
        if value.is_integer() and value >= 1:
            return int(value)
        return None
    if isinstance(value, str):
        compact = value.strip()
        if compact.isdigit():
            days = int(compact)
            return days if days >= 1 else None
        return None
    return None


def inspect_payment_terms(invoice: dict[str, Any]) -> list[dict[str, str]]:
    """Return INV-053 / INV-054 observations for an optional terms_days."""
    payment = invoice.get("payment")
    if not isinstance(payment, dict) or "terms_days" not in payment:
        return []
    raw = payment.get("terms_days")
    if raw in (None, ""):
        return [_finding(
            "INV-053",
            "Payment terms days is empty or not a positive whole number of days.",
            "Use a positive whole number of days, for example 30, or omit payment.terms_days.",
            "/payment/terms_days",
        )]
    days = parse_terms_days(raw)
    if days is None:
        return [_finding(
            "INV-053",
            "Payment terms days is empty or not a positive whole number of days.",
            "Use a positive whole number of days, for example 30, or omit payment.terms_days.",
            "/payment/terms_days",
        )]

    if "due_date" not in invoice or invoice.get("due_date") in (None, ""):
        return []
    issue = parse_iso_date(invoice.get("issue_date"))
    due = parse_iso_date(invoice.get("due_date"))
    if issue is None or due is None:
        return []
    expected = issue + timedelta(days=days)
    if due != expected:
        return [_finding(
            "INV-054",
            "Payment due date does not match the issue date plus the stated terms days.",
            f"Set due_date to {expected.isoformat()} or correct payment.terms_days.",
            "/due_date",
        )]
    return []


def _finding(rule: str, message: str, fix: str, path: str) -> dict[str, str]:
    return {"rule": rule, "message": message, "fix": fix, "path": path}
