"""Offline payment-means (BT-81 / UNCL 4461) observations.

A credit-transfer or SEPA invoice that names the code but not the IBAN,
or a cash invoice that still carries an IBAN, is a common ERP export
mistake. Access points then reject the file after the bookkeeper already
sent it. This is a code-list and consistency check, not a Peppol profile
determination and not a claim that the buyer can pay that way. Findings
never repeat the typed code or the account.
"""

from __future__ import annotations

from typing import Any

from .iban import looks_like_complete_iban


# The UNCL 4461 list EN 16931 accepts for BT-81 (rule BR-CL-16 in the CEN
# Schematron). A typo catch, not a determination that a network accepts it.
KNOWN_MEANS = {
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
    "12",
    "13",
    "14",
    "15",
    "16",
    "17",
    "18",
    "19",
    "20",
    "21",
    "22",
    "23",
    "24",
    "25",
    "26",
    "27",
    "28",
    "29",
    "30",
    "31",
    "32",
    "33",
    "34",
    "35",
    "36",
    "37",
    "38",
    "39",
    "40",
    "41",
    "42",
    "43",
    "44",
    "45",
    "46",
    "47",
    "48",
    "49",
    "50",
    "51",
    "52",
    "53",
    "54",
    "55",
    "56",
    "57",
    "58",
    "59",
    "60",
    "61",
    "62",
    "63",
    "64",
    "65",
    "66",
    "67",
    "68",
    "69",
    "70",
    "74",
    "75",
    "76",
    "77",
    "78",
    "91",
    "92",
    "93",
    "94",
    "95",
    "96",
    "97",
    "98",
    "ZZZ",
}

# Credit transfer, debit transfer, payment to bank account and SEPA credit
# transfer name the payee's account. Direct debits (49, 59) name the payer's
# account (BT-91) instead, so they do not need a payee IBAN.
ACCOUNT_REQUIRED = {"30", "31", "42", "58"}

# Cash, cheque, and card. An IBAN on the same payment block is a mismatch.
CASH_LIKE = {"10", "20", "48"}


def normalize_means(value: Any) -> str | None:
    """Return a compact UNCL 4461 code, or None when empty / not text-or-int."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and not isinstance(value, bool):
        if value < 0:
            return None
        return str(value)
    if not isinstance(value, str):
        return None
    compact = value.strip()
    return compact or None


def looks_like_known_means(value: Any) -> bool:
    """True when the value is one of the documented UNCL 4461 codes."""
    compact = normalize_means(value)
    return compact in KNOWN_MEANS


def inspect_payment_means(invoice: dict[str, Any]) -> list[dict[str, str]]:
    """Return INV-044 / INV-045 / INV-046 observations for an optional means."""
    payment = invoice.get("payment")
    if not isinstance(payment, dict) or "means" not in payment:
        return []
    raw = payment.get("means")
    if raw in (None, ""):
        return [_finding(
            "INV-044",
            "Payment means code is empty or not a documented UNCL 4461 code.",
            "Use a published payment means code such as 30, 58, or 10, or omit payment.means.",
            "/payment/means",
        )]
    compact = normalize_means(raw)
    if compact is None or compact not in KNOWN_MEANS:
        return [_finding(
            "INV-044",
            "Payment means code is empty or not a documented UNCL 4461 code.",
            "Use a published payment means code such as 30, 58, or 10, or omit payment.means.",
            "/payment/means",
        )]

    findings: list[dict[str, str]] = []
    has_iban = looks_like_complete_iban(payment.get("iban"))
    # A value that is present but malformed is INV-024's finding, not a missing IBAN.
    iban_present = isinstance(payment.get("iban"), str) and payment.get("iban").strip() != ""
    if compact in ACCOUNT_REQUIRED and not has_iban and not iban_present:
        findings.append(_finding(
            "INV-045",
            "Payment means is a credit transfer or SEPA transfer without an IBAN.",
            "Add payment.iban for that means, switch to a cash or card means, or omit payment.means.",
            "/payment/iban",
        ))
    if compact in CASH_LIKE and has_iban:
        findings.append(_finding(
            "INV-046",
            "Payment means is cash, cheque, or card but the invoice also names an IBAN.",
            "Use a credit-transfer or SEPA means with the IBAN, or omit payment.iban.",
            "/payment/means",
        ))
    return findings


def _finding(rule: str, message: str, fix: str, path: str) -> dict[str, str]:
    return {"rule": rule, "message": message, "fix": fix, "path": path}
