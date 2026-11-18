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


# BT-86 admits a BIC or a national clearing code (see bic.mjs for the reasoning). Where the
# domestic bank (and branch) code sits inside each BBAN, from the SWIFT IBAN registry's bank and
# branch identifier positions (0-based, end exclusive). Kept identical to IBAN_CLEARING in bic.mjs.
_IBAN_CLEARING: dict[str, list[tuple[int, int]]] = {
    "AT": [(0, 5)], "BE": [(0, 3)], "CH": [(0, 5)], "CZ": [(0, 4)], "DE": [(0, 8)], "DK": [(0, 4)],
    "ES": [(0, 4), (0, 8)], "FO": [(0, 4)], "FR": [(0, 5), (0, 10)], "GB": [(4, 10)], "GL": [(0, 4)],
    "HR": [(0, 7)], "HU": [(0, 3), (0, 7)], "IE": [(4, 10)], "IT": [(1, 6), (1, 11)], "LI": [(0, 5)],
    "MC": [(0, 5), (0, 10)], "NO": [(0, 4)], "PL": [(0, 8)], "PT": [(0, 4), (0, 8)], "SI": [(0, 5)],
    "SK": [(0, 4)], "SM": [(1, 6), (1, 11)],
}
_PAD_COUNTRIES = {"CH", "LI"}


def aba_checksum_ok(digits: str) -> bool:
    """US ABA routing number check digit: weights 3, 7, 1, sum divisible by 10."""
    if len(digits) != 9 or not digits.isdigit():
        return False
    weights = (3, 7, 1) * 3
    return sum(int(d) * w for d, w in zip(digits, weights)) % 10 == 0


def _aba_prefix(digits: str) -> bool:
    p = int(digits[:2])
    return p <= 12 or 21 <= p <= 32 or 61 <= p <= 72 or p == 80


def _is_ifsc(compact: str) -> bool:
    return (
        len(compact) == 11 and compact[:4].isalpha() and compact[4] == "0"
        and compact[5:].isalnum()
    )


def classify_provider_id(value: Any) -> str:
    """bic, clearing, bad-routing, maybe-routing or unknown (mirrors classifyProviderId)."""
    compact = normalize_bic(value)
    if compact is None:
        return "unknown"
    if _classify(compact) == "ok":
        return "bic"
    if _is_ifsc(compact):
        return "clearing"
    if compact.isdigit() and 3 <= len(compact) <= 11:
        if len(compact) == 9 and _aba_prefix(compact) and not aba_checksum_ok(compact):
            return "maybe-routing" if compact[0] == "0" else "bad-routing"
        return "clearing"
    return "unknown"


def inspect_payment_bic(invoice: dict[str, Any]) -> list[dict[str, str]]:
    """Return INV-026 / INV-027 observations for an optional payment BIC or clearing code."""
    payment = invoice.get("payment")
    if not isinstance(payment, dict):
        return []
    bic = payment.get("bic")
    if bic in (None, ""):
        return []
    findings = _check_explicit(bic, "/payment/bic")
    if findings:
        return findings
    if classify_provider_id(bic) == "clearing":
        return _clearing_mismatch(payment)
    return _country_mismatch(payment)


def _clearing_mismatch(payment: dict[str, Any]) -> list[dict[str, str]]:
    """Flag a numeric clearing code that is not the bank code inside the IBAN."""
    compact = normalize_bic(payment.get("bic"))
    compact_iban = normalize_iban(payment.get("iban"))
    if compact is None or compact_iban is None or not compact.isdigit():
        return []
    if not looks_like_complete_iban(compact_iban):
        return []
    country = compact_iban[:2]
    slices = _IBAN_CLEARING.get(country)
    if not slices:
        return []
    bban = compact_iban[4:]
    for a, b in slices:
        part = bban[a:b]
        if part == compact:
            return []
        if country in _PAD_COUNTRIES and len(compact) < len(part) and compact.zfill(len(part)) == part:
            return []
    return [_finding(
        "INV-027",
        "Payment clearing code does not match the bank code inside the payment IBAN.",
        "Correct the clearing code or the IBAN so they name the same bank, or omit payment.bic.",
        "/payment/bic",
    )]


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
    kind = classify_provider_id(compact)
    if kind == "bad-routing":
        return [_finding(
            "INV-026",
            "Payment provider id has nine digits like a US ABA routing number, but its check digit does not add up.",
            "Copy the routing number again from the bank's documents, or give the BIC instead.",
            path,
        )]
    # "maybe-routing" (leading 0, could be Canadian EFT or a Russian BIK) is a note in bic.mjs;
    # the Python checks have no note severity, so it stays silent here rather than fail a file.
    if kind == "unknown":
        return [_finding(
            "INV-026",
            "Payment BIC is not an 8- or 11-character bank identifier, nor a national clearing code (3 to 11 digits, or an Indian IFSC).",
            "Use four letters, a two-letter country, a two-character location, and an optional three-character branch; or the bank's national clearing code (sort code, BLZ, routing number); or omit payment.bic.",
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
