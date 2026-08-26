"""Offline BIC shape and IBAN-country observations.

This is a typo catch for payment instructions, not a bank lookup and not a
determination that an institution exists, belongs to the named party, or
may receive funds. Short internal bank codes are left alone unless they
are placed in payment.bic.
"""

from __future__ import annotations

from typing import Any

from .iban import looks_like_complete_iban, normalize_iban


def normalize_bic(value: Any) -> str | None:
    """Uppercase and strip separators. Empty or non-text becomes None."""
    if not isinstance(value, str):
        return None
    compact = "".join(ch for ch in value.upper() if ch.isalnum())
    return compact or None


def looks_like_complete_bic(value: Any) -> bool:
    """True when the value is an 8- or 11-character ISO 9362 BIC."""
    compact = normalize_bic(value)
    return compact is not None and _classify(compact) == "ok"


def inspect_payment_bic(invoice: dict[str, Any]) -> list[dict[str, str]]:
    """Return INV-026 / INV-027 observations for an optional payment BIC."""
    payment = invoice.get("payment")
    if not isinstance(payment, dict):
        return []
    bic = payment.get("bic")
    if bic in (None, ""):
        return []
    findings = _check_explicit(bic, "/payment/bic")
    if findings:
        return findings
    return _country_mismatch(payment)


def _check_explicit(value: Any, path: str) -> list[dict[str, str]]:
    if not isinstance(value, str) or not value.strip():
        return [_finding(
            "INV-026",
            "Payment BIC is empty or not text.",
            "Provide the BIC as text, or omit payment.bic.",
            path,
        )]
    compact = normalize_bic(value)
    if compact is None:
        return [_finding(
            "INV-026",
            "Payment BIC is empty or not text.",
            "Provide the BIC as text, or omit payment.bic.",
            path,
        )]
    kind = _classify(compact)
    if kind == "unknown":
        return [_finding(
            "INV-026",
            "Payment BIC is not an 8- or 11-character bank identifier.",
            "Use four letters, a two-letter country, a two-character location, and an optional three-character branch, or omit payment.bic.",
            path,
        )]
    return []


def _country_mismatch(payment: dict[str, Any]) -> list[dict[str, str]]:
    """Flag a complete BIC whose country is not the complete IBAN country."""
    compact_bic = normalize_bic(payment.get("bic"))
    compact_iban = normalize_iban(payment.get("iban"))
    if compact_bic is None or compact_iban is None:
        return []
    if not looks_like_complete_bic(compact_bic) or not looks_like_complete_iban(compact_iban):
        return []
    bic_country = compact_bic[4:6]
    iban_country = compact_iban[:2]
    if bic_country == iban_country:
        return []
    return [_finding(
        "INV-027",
        "Payment BIC country does not match the payment IBAN country.",
        "Correct the BIC or the IBAN so both use the same country, or omit payment.bic.",
        "/payment/bic",
    )]


def _classify(compact: str) -> str:
    # ISO 9362: BBBBCCLL or BBBBCCLLBBB. Bank letters, country letters,
    # location and optional branch alphanumeric. No checksum is published.
    if len(compact) not in {8, 11}:
        return "unknown"
    bank, country, location = compact[:4], compact[4:6], compact[6:8]
    branch = compact[8:]
    if not bank.isalpha() or not country.isalpha():
        return "unknown"
    if not location.isalnum() or (branch and not branch.isalnum()):
        return "unknown"
    return "ok"


def _finding(rule: str, message: str, fix: str, path: str) -> dict[str, str]:
    return {"rule": rule, "message": message, "fix": fix, "path": path}
