"""Offline buyer / purchase-order reference (BT-10 / BT-13) observations.

A placeholder PO, an empty buyer reference, or a purchase-order field that
repeats the invoice number is a common ERP export mistake. Accounts-payable
systems then bounce the file after the bookkeeper already sent it. This is
a shape and consistency check, not a Peppol profile determination and not
a claim that the buyer issued that order. Findings never repeat the
reference.
"""

from __future__ import annotations

from typing import Any

# Published CIUS text fields often cap buyer/order references at 70.
_MAX_LENGTH = 70

# Values that pass schema but never match a real purchase order.
_PLACEHOLDERS = {"na", "none", "null", "tbd", "todo", "unknown", "-", "--", "..."}


def normalize_reference(value: Any) -> str | None:
    """Strip surrounding space. Empty or non-text becomes None."""
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped or None


def looks_like_placeholder(value: Any) -> bool:
    """True when the value is a documented empty-token placeholder."""
    compact = normalize_reference(value)
    if compact is None:
        return False
    token = "".join(ch for ch in compact.lower() if ch.isalnum() or ch in "-.")
    if token in _PLACEHOLDERS:
        return True
    letters = "".join(ch for ch in compact.lower() if ch.isalnum())
    return letters in _PLACEHOLDERS


def inspect_commercial_references(invoice: dict[str, Any]) -> list[dict[str, str]]:
    """Return INV-047 / INV-048 / INV-049 observations for optional refs."""
    findings: list[dict[str, str]] = []
    if "buyer_reference" in invoice:
        findings.extend(_check_explicit(
            invoice.get("buyer_reference"),
            "INV-047",
            "/buyer_reference",
            "Buyer reference",
            "Add buyer_reference as the cost-center or buyer text, or omit buyer_reference.",
        ))
    if "order_reference" in invoice:
        order_findings = _check_explicit(
            invoice.get("order_reference"),
            "INV-048",
            "/order_reference",
            "Purchase-order reference",
            "Add order_reference as the buyer purchase-order number, or omit order_reference.",
        )
        findings.extend(order_findings)
        if not order_findings and _same_reference(
            invoice.get("order_reference"),
            invoice.get("invoice_number"),
        ):
            findings.append(_finding(
                "INV-049",
                "Purchase-order reference repeats the invoice number.",
                "Set order_reference to the buyer purchase-order number, or omit order_reference.",
                "/order_reference",
            ))
    return findings


def _check_explicit(value: Any, rule: str, path: str, label: str, omit_fix: str) -> list[dict[str, str]]:
    if not isinstance(value, str) or not value.strip():
        return [_finding(
            rule,
            f"{label} is empty or not text.",
            omit_fix,
            path,
        )]
    stripped = value.strip()
    if len(stripped) > _MAX_LENGTH:
        return [_finding(
            rule,
            f"{label} is longer than the usual 70-character network field.",
            f"Shorten the {label.lower()} so a receiving system can store it, or omit the field.",
            path,
        )]
    if looks_like_placeholder(value):
        return [_finding(
            rule,
            f"{label} is a placeholder, not a buyer or purchase-order number.",
            omit_fix,
            path,
        )]
    return []


def _same_reference(left: Any, right: Any) -> bool:
    first = normalize_reference(left)
    second = normalize_reference(right)
    if first is None or second is None:
        return False
    return first.casefold() == second.casefold()


def _finding(rule: str, message: str, fix: str, path: str) -> dict[str, str]:
    return {"rule": rule, "message": message, "fix": fix, "path": path}
