"""Offline header allowance / charge (BT-92 / BT-99) observations.

A document-level discount or surcharge whose amount does not match its
percent of the base, or that has no reason, is a common ERP export
mistake. Access points then reject the file after the bookkeeper already
sent it. This is arithmetic and shape, not a Peppol profile determination
and not a claim that the discount is commercially correct. Findings never
repeat the amount, percent, or reason. Line-level AllowanceCharge is
ignored.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

from .reference import looks_like_placeholder

_MAX_REASON = 100


def _money(value: Any) -> Decimal | None:
    parsed = _number(value)
    return parsed.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if parsed is not None else None


def _number(value: Any) -> Decimal | None:
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None
    return result if result.is_finite() else None


def normalize_kind(value: Any) -> str | None:
    """Return allowance or charge, or None when empty / unknown."""
    if isinstance(value, bool):
        return "charge" if value else "allowance"
    if not isinstance(value, str):
        return None
    compact = value.strip().casefold()
    if compact in {"true", "1", "charge", "surcharge"}:
        return "charge"
    if compact in {"false", "0", "allowance", "discount"}:
        return "allowance"
    return None


def header_adjustment_net_delta(invoice: dict[str, Any]) -> Decimal:
    """Charges minus allowances for rows with a usable amount. Others are 0."""
    delta = Decimal("0.00")
    for row in _rows(invoice):
        if not isinstance(row, dict):
            continue
        kind = normalize_kind(row.get("kind"))
        amount = _money(row.get("amount"))
        if kind is None or amount is None or amount < 0:
            continue
        if kind == "charge":
            delta += amount
        else:
            delta -= amount
    return delta.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def inspect_header_adjustments(invoice: dict[str, Any]) -> list[dict[str, str]]:
    """Return INV-050 / INV-051 / INV-052 observations for optional rows."""
    if not isinstance(invoice, dict) or "adjustments" not in invoice:
        return []
    raw = invoice.get("adjustments")
    if raw in (None, ""):
        return [_finding(
            "INV-050",
            "Header allowance or charge list is empty or not a list of rows.",
            "Add adjustments as a list of allowance or charge rows, or omit adjustments.",
            "/adjustments",
        )]
    if not isinstance(raw, list):
        return [_finding(
            "INV-050",
            "Header allowance or charge list is empty or not a list of rows.",
            "Add adjustments as a list of allowance or charge rows, or omit adjustments.",
            "/adjustments",
        )]
    findings: list[dict[str, str]] = []
    for index, row in enumerate(raw):
        findings.extend(_inspect_row(row, index))
    return findings


def _rows(invoice: dict[str, Any]) -> list[Any]:
    raw = invoice.get("adjustments") if isinstance(invoice, dict) else None
    return raw if isinstance(raw, list) else []


def _inspect_row(row: Any, index: int) -> list[dict[str, str]]:
    path = f"/adjustments/{index}"
    if not isinstance(row, dict):
        return [_finding(
            "INV-050",
            "Header allowance or charge row is not an object.",
            "Provide kind, amount, and a reason, or omit the row.",
            path,
        )]
    findings: list[dict[str, str]] = []
    kind = normalize_kind(row.get("kind")) if "kind" in row else None
    if "kind" in row and kind is None:
        findings.append(_finding(
            "INV-050",
            "Header allowance or charge kind is missing or not allowance or charge.",
            "Set kind to allowance or charge, or omit the row.",
            f"{path}/kind",
        ))
    elif "kind" not in row:
        findings.append(_finding(
            "INV-050",
            "Header allowance or charge kind is missing or not allowance or charge.",
            "Set kind to allowance or charge, or omit the row.",
            f"{path}/kind",
        ))

    if "amount" not in row or row.get("amount") in (None, ""):
        findings.append(_finding(
            "INV-050",
            "Header allowance or charge amount is missing or invalid.",
            "Provide a non-negative amount, or omit the row.",
            f"{path}/amount",
        ))
        amount = None
    else:
        amount = _money(row.get("amount"))
        if amount is None or amount < 0:
            findings.append(_finding(
                "INV-050",
                "Header allowance or charge amount is missing or invalid.",
                "Provide a non-negative amount, or omit the row.",
                f"{path}/amount",
            ))
            amount = None

    base = None
    percent = None
    if "base" in row and row.get("base") not in (None, ""):
        base = _money(row.get("base"))
        if base is None or base < 0:
            findings.append(_finding(
                "INV-051",
                "Header allowance or charge base is missing or invalid.",
                "Provide a non-negative base amount, or omit base and percent.",
                f"{path}/base",
            ))
            base = None
    if "percent" in row and row.get("percent") not in (None, ""):
        percent = _number(row.get("percent"))
        if percent is None or percent < 0 or percent > 100:
            findings.append(_finding(
                "INV-051",
                "Header allowance or charge percentage is missing or invalid.",
                "Use a percentage between 0 and 100, or omit percent and base.",
                f"{path}/percent",
            ))
            percent = None
    if amount is not None and base is not None and percent is not None:
        expected = (base * percent / Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if amount != expected:
            findings.append(_finding(
                "INV-051",
                "Header allowance or charge amount does not match its percentage of the base.",
                f"Set the amount to {expected} or correct percent and base.",
                f"{path}/amount",
            ))

    if "reason" in row or "reason_code" in row:
        reason = row.get("reason")
        code = row.get("reason_code")
        has_reason = isinstance(reason, str) and reason.strip() and not looks_like_placeholder(reason)
        has_code = isinstance(code, str) and code.strip() and not looks_like_placeholder(code)
        if isinstance(reason, str) and len(reason.strip()) > _MAX_REASON:
            findings.append(_finding(
                "INV-052",
                "Header allowance or charge reason is longer than the usual 100-character network field.",
                "Shorten the reason so a receiving system can store it, or omit the row.",
                f"{path}/reason",
            ))
        elif not has_reason and not has_code:
            findings.append(_finding(
                "INV-052",
                "Header allowance or charge reason is empty or a placeholder.",
                "Add a settlement or packing reason, or omit reason and reason_code.",
                f"{path}/reason" if "reason" in row else f"{path}/reason_code",
            ))
    else:
        findings.append(_finding(
            "INV-052",
            "Header allowance or charge has no reason.",
            "Add a reason such as a settlement or packing description, or omit the row.",
            f"{path}/reason",
        ))
    return findings


def _finding(rule: str, message: str, fix: str, path: str) -> dict[str, str]:
    return {"rule": rule, "message": message, "fix": fix, "path": path}
