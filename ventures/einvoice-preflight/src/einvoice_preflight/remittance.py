"""Offline remittance / payment-reference observations.

When a complete IBAN is present, a remittance reference is what the buyer
puts on the transfer so the seller can match the payment. Structured RF
values (ISO 11649) get a MOD-97 typo catch. This is not a bank lookup and
not a determination that a payment will be allocated. Findings never repeat
the reference.
"""

from __future__ import annotations

from typing import Any

from .iban import looks_like_complete_iban


# SEPA unstructured remittance information is limited to 140 characters.
_UNSTRUCTURED_MAX = 140


def normalize_remittance(value: Any) -> str | None:
    """Uppercase and strip separators. Empty or non-text becomes None."""
    if not isinstance(value, str):
        return None
    compact = "".join(ch for ch in value.upper() if ch.isalnum())
    return compact or None


def looks_like_structured_rf(value: Any) -> bool:
    """True when the value is an ISO 11649 RF creditor reference shape."""
    compact = normalize_remittance(value)
    return compact is not None and _classify_rf(compact) in {"ok", "checksum"}


def inspect_payment_remittance(invoice: dict[str, Any]) -> list[dict[str, str]]:
    """Return INV-030 / INV-031 observations for an optional remittance."""
    payment = invoice.get("payment")
    if not isinstance(payment, dict):
        return []
    remittance = payment.get("remittance")
    missing = remittance in (None, "") or (isinstance(remittance, str) and not remittance.strip())
    if missing:
        if looks_like_complete_iban(payment.get("iban")):
            return [_finding(
                "INV-030",
                "Payment remittance reference is missing on an invoice that already names an IBAN.",
                "Add payment.remittance so the buyer can quote it on the transfer, or omit payment.iban.",
                "/payment/remittance",
            )]
        return []
    return _check_explicit(remittance, "/payment/remittance")


def _check_explicit(value: Any, path: str) -> list[dict[str, str]]:
    if not isinstance(value, str) or not value.strip():
        return [_finding(
            "INV-031",
            "Payment remittance reference is empty or not text.",
            "Provide the remittance as text, or omit payment.remittance.",
            path,
        )]
    stripped = value.strip()
    if len(stripped) > _UNSTRUCTURED_MAX:
        return [_finding(
            "INV-031",
            "Payment remittance reference is longer than the usual 140-character transfer note.",
            "Shorten the remittance so a bank transfer can carry it, or omit payment.remittance.",
            path,
        )]
    compact = normalize_remittance(value)
    if compact is None:
        return [_finding(
            "INV-031",
            "Payment remittance reference is empty or not text.",
            "Provide the remittance as text, or omit payment.remittance.",
            path,
        )]
    if not compact.startswith("RF"):
        return []
    kind = _classify_rf(compact)
    if kind == "unknown":
        return [_finding(
            "INV-031",
            "Payment remittance reference is not a structured RF creditor reference.",
            "Use RF, two check digits, and up to 21 characters, or an unstructured note that does not start with RF.",
            path,
        )]
    if kind == "checksum" and not _mod97_ok(compact):
        return [_finding(
            "INV-031",
            "Payment remittance reference fails the published RF checksum.",
            "Correct the RF check digits. This is a checksum typo check, not a bank lookup.",
            path,
        )]
    return []


def _classify_rf(compact: str) -> str:
    # ISO 11649: RF + 2 digits + 1 to 21 alphanumeric characters.
    if not compact.startswith("RF") or len(compact) < 5 or len(compact) > 25:
        return "unknown"
    check, body = compact[2:4], compact[4:]
    if not check.isdigit() or not body.isalnum():
        return "unknown"
    return "checksum"


def _mod97_ok(compact: str) -> bool:
    rearranged = compact[4:] + compact[:4]
    numeric = "".join(str(int(char, 36)) for char in rearranged)
    return int(numeric) % 97 == 1


def _finding(rule: str, message: str, fix: str, path: str) -> dict[str, str]:
    return {"rule": rule, "message": message, "fix": fix, "path": path}
