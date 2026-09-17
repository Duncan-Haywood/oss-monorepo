"""Offline IBAN shape and checksum observations.

This is a typo catch for payment instructions, not a bank lookup and not a
determination that an account exists, belongs to the named party, or may
receive funds. Short internal account numbers are left alone.
"""

from __future__ import annotations

from typing import Any


# Published IBAN lengths (ISO 13616 / SWIFT registry). A matching country
# with the wrong length is a format observation; unknown countries still
# get the universal MOD-97 check when the compact value looks complete.
_LENGTHS = {
    "AD": 24, "AE": 23, "AL": 28, "AT": 20, "AZ": 28, "BA": 20, "BE": 16,
    "BG": 22, "BH": 22, "BR": 29, "BY": 28, "CH": 21, "CR": 22, "CY": 28,
    "CZ": 24, "DE": 22, "DK": 18, "DO": 28, "EE": 20, "EG": 29, "ES": 24,
    "FI": 18, "FO": 18, "FR": 27, "GB": 22, "GE": 22, "GI": 23, "GL": 18,
    "GR": 27, "GT": 28, "HR": 21, "HU": 28, "IE": 22, "IL": 23, "IQ": 23,
    "IS": 26, "IT": 27, "JO": 30, "KW": 30, "KZ": 20, "LB": 28, "LC": 32,
    "LI": 21, "LT": 20, "LU": 20, "LV": 21, "LY": 25, "MC": 27, "MD": 24,
    "ME": 22, "MK": 19, "MR": 27, "MT": 31, "MU": 30, "NL": 18, "NO": 15,
    "PK": 24, "PL": 28, "PS": 29, "PT": 25, "QA": 29, "RO": 24, "RS": 22,
    "SA": 24, "SE": 24, "SI": 19, "SK": 24, "SM": 27, "TN": 24, "TR": 26,
    "UA": 29, "VA": 22, "VG": 24, "XK": 20,
}


def normalize_iban(value: Any) -> str | None:
    """Uppercase and strip separators. Empty or non-text becomes None."""
    if not isinstance(value, str):
        return None
    compact = "".join(ch for ch in value.upper() if ch.isalnum())
    return compact or None


def looks_like_complete_iban(value: Any) -> bool:
    """True when the value is a country-prefixed IBAN, right length or not.

    "checksum" is a known-length (or unknown-country) shape ready for the
    mod-97 check; "bad-format" is a known country whose length is wrong.
    Both are IBAN-shaped enough for the cross-field checks that gate on this
    (BIC country match, remittance-missing, payment-means-needs-IBAN) --
    only "unknown" (no country-shaped prefix at all, e.g. an internal
    account id) should read as "there is no IBAN here". This used to check
    for a _classify() result of "format", which _classify() never returns,
    so every wrong-length IBAN silently read as "not an IBAN" and skipped
    those checks instead of surfacing them alongside the length finding.
    """
    compact = normalize_iban(value)
    if compact is None:
        return False
    return _classify(compact) in {"checksum", "bad-format"}


def inspect_payment_iban(invoice: dict[str, Any]) -> list[dict[str, str]]:
    """Return INV-024 / INV-025 observations for an optional payment IBAN."""
    payment = invoice.get("payment")
    if not isinstance(payment, dict):
        return []
    iban = payment.get("iban")
    if iban in (None, ""):
        return []
    return _check_explicit(iban, "/payment/iban")


def _check_explicit(value: Any, path: str) -> list[dict[str, str]]:
    if not isinstance(value, str) or not value.strip():
        return [_finding(
            "INV-024",
            "Payment IBAN is empty or not text.",
            "Provide the IBAN as text, or omit payment.iban.",
            path,
        )]
    compact = normalize_iban(value)
    if compact is None:
        return [_finding(
            "INV-024",
            "Payment IBAN is empty or not text.",
            "Provide the IBAN as text, or omit payment.iban.",
            path,
        )]
    kind = _classify(compact)
    if kind == "unknown":
        return [_finding(
            "INV-024",
            "Payment IBAN is not a country-prefixed account number.",
            "Use a two-letter country prefix, two check digits, and the national account number, or omit payment.iban.",
            path,
        )]
    if kind == "bad-format":
        country = compact[:2]
        return [_finding(
            "INV-024",
            f"Payment IBAN does not match the published {country} length.",
            f"Correct the {country} IBAN length and characters, or omit payment.iban for an internal account id.",
            path,
        )]
    if kind == "checksum" and not _mod97_ok(compact):
        country = compact[:2]
        return [_finding(
            "INV-025",
            f"Payment IBAN fails the published {country} checksum.",
            f"Correct the {country} IBAN digits. This is a checksum typo check, not a bank lookup.",
            path,
        )]
    return []


def _classify(compact: str) -> str:
    if len(compact) < 15 or len(compact) > 34:
        return "unknown"
    country, check, bban = compact[:2], compact[2:4], compact[4:]
    if not country.isalpha() or not check.isdigit() or not bban.isalnum():
        return "unknown"
    expected = _LENGTHS.get(country)
    if expected is None:
        return "checksum"
    if len(compact) != expected:
        return "bad-format"
    return "checksum"


def _mod97_ok(compact: str) -> bool:
    rearranged = compact[4:] + compact[:4]
    numeric = "".join(str(int(char, 36)) for char in rearranged)
    return int(numeric) % 97 == 1


def _finding(rule: str, message: str, fix: str, path: str) -> dict[str, str]:
    return {"rule": rule, "message": message, "fix": fix, "path": path}
