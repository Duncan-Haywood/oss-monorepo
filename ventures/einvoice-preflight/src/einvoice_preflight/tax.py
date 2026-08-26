"""Offline 0% / exemption-category tax-reason observations.

A zero-rated or exempt line without a reason or reason code is a common
ERP export mistake. Peppol and many EN 16931 CIUS then reject the file
after the bookkeeper already sent it. This is a document-shape check, not
a tax-law determination and not a claim that 0% is legally correct.
Findings never repeat the reason text or category code.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any

# UNECE 5305 / Peppol categories that require an exemption reason (text or
# code) when they appear on a line. S / H / AA stay out — they are taxed.
_EXEMPT_CATEGORIES = frozenset({"E", "AE", "K", "G", "O", "Z"})


def normalize_tax_category(value: Any) -> str | None:
    """Uppercase a tax-category ID. Empty or non-text becomes None."""
    if not isinstance(value, str):
        return None
    compact = value.strip().upper()
    return compact or None


def looks_like_exemption_category(value: Any) -> bool:
    """True when the value is a known exempt / zero-rated category ID."""
    category = normalize_tax_category(value)
    return category is not None and category in _EXEMPT_CATEGORIES


def inspect_tax_exemption(invoice: dict[str, Any]) -> list[dict[str, str]]:
    """Return INV-035 / INV-036 observations for 0% and exempt lines."""
    if not isinstance(invoice, dict):
        return []
    findings: list[dict[str, str]] = []
    document_ok = _usable_reason(invoice.get("tax_exemption_reason")) or _usable_reason_code(
        invoice.get("tax_exemption_reason_code")
    )
    findings.extend(_explicit_empty(invoice, "tax_exemption_reason", "/tax_exemption_reason"))
    findings.extend(_explicit_empty(invoice, "tax_exemption_reason_code", "/tax_exemption_reason_code"))

    lines = invoice.get("lines")
    if not isinstance(lines, list):
        return findings
    for index, line in enumerate(lines):
        if not isinstance(line, dict):
            continue
        path_reason = f"/lines/{index}/tax_reason"
        path_code = f"/lines/{index}/tax_reason_code"
        findings.extend(_explicit_empty(line, "tax_reason", path_reason))
        findings.extend(_explicit_empty(line, "tax_reason_code", path_code))
        if not _needs_reason(line):
            continue
        if (
            _usable_reason(line.get("tax_reason"))
            or _usable_reason_code(line.get("tax_reason_code"))
            or document_ok
        ):
            continue
        findings.append(_finding(
            "INV-035",
            "A 0% or exempt line is missing the tax exemption reason networks require.",
            "Add tax_reason or tax_reason_code on the line (or tax_exemption_reason on the invoice), or correct the tax percentage.",
            path_reason,
        ))
    return findings


def _needs_reason(line: dict[str, Any]) -> bool:
    if looks_like_exemption_category(line.get("tax_category")):
        return True
    tax = _number(line.get("tax_percent"))
    return tax is not None and tax == 0


def _explicit_empty(holder: dict[str, Any], key: str, path: str) -> list[dict[str, str]]:
    if key not in holder or holder.get(key) in (None,):
        return []
    value = holder.get(key)
    usable = _usable_reason_code(value) if key.endswith("_code") else _usable_reason(value)
    if usable:
        return []
    label = "Tax exemption reason code" if key.endswith("_code") else "Tax exemption reason"
    return [_finding(
        "INV-036",
        f"{label} is empty or not text.",
        f"Provide {key} as text, or omit it if the line is not 0% or exempt.",
        path,
    )]


def _usable_reason(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _usable_reason_code(value: Any) -> bool:
    if not isinstance(value, str) or not value.strip():
        return False
    compact = "".join(ch for ch in value.upper() if ch.isalnum() or ch == "-")
    return bool(compact)


def _number(value: Any) -> Decimal | None:
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None
    return result if result.is_finite() else None


def _finding(rule: str, message: str, fix: str, path: str) -> dict[str, str]:
    return {"rule": rule, "message": message, "fix": fix, "path": path}
