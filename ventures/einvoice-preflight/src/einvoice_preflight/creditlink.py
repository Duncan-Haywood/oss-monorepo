"""Batch-only checks tying a credit note to the invoice it reverses.

Mirrors creditlink.mjs. A credit note whose original is not in the batch is
left alone: the original may have gone out in an earlier run.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .document import normalize_document_type

_FIXES = {
    "INV-056": (
        "The credit note and the invoice it reverses are in different currencies.",
        "Credit in the currency of the original invoice, or name the right original in original_invoice.",
    ),
    "INV-057": (
        "Credit notes in this batch against one invoice add up to more than that invoice's gross total.",
        "Check the credit amounts and original_invoice: a credit note cannot return more than was invoiced.",
    ),
    "INV-058": (
        "The invoice this credit note reverses is in the batch, but it was issued by a different seller.",
        "Check original_invoice and the credit note's supplier: a credit note comes from the party that issued the invoice.",
    ),
}


def _finding(rule: str) -> dict[str, str]:
    message, fix = _FIXES[rule]
    return {"rule": rule, "message": message, "fix": fix, "path": "/original_invoice"}


def _ref(value: Any) -> str:
    return value.strip().lower() if isinstance(value, str) else ""


def _seller(invoice: dict[str, Any]) -> str:
    seller = invoice.get("supplier")
    if isinstance(seller, dict):
        for field in ("id", "vat_id", "name"):
            value = seller.get(field)
            if isinstance(value, str) and value.strip():
                return f"{field}:{' '.join(value.lower().split())}"
    return ""


def _kind(invoice: dict[str, Any]) -> str:
    for key in ("document_type", "document_code"):
        kind = normalize_document_type(invoice.get(key))
        if kind and kind != "invalid":
            return kind
    return "invoice"


def _cents(invoice: dict[str, Any]) -> int | None:
    totals = invoice.get("totals")
    gross = totals.get("gross") if isinstance(totals, dict) else None
    if isinstance(gross, str) and gross.strip():
        try:
            gross = float(gross)
        except ValueError:
            return None
    if isinstance(gross, bool) or not isinstance(gross, (int, float)):
        return None
    return int(abs(gross) * 100 + 0.5)


def _currency(invoice: dict[str, Any]) -> str:
    value = invoice.get("currency")
    return value.strip().upper() if isinstance(value, str) else ""


def credit_link_findings(invoices: list[tuple[Path, Any]]) -> dict[Path, list[dict[str, str]]]:
    out: dict[Path, list[dict[str, str]]] = {}
    docs = [(p, i) for p, i in invoices if isinstance(i, dict)]
    originals = [(p, i) for p, i in docs if _kind(i) == "invoice" and _ref(i.get("invoice_number"))]
    credits = [(p, i) for p, i in docs if _kind(i) == "credit_note" and _ref(i.get("original_invoice"))]
    totals: dict[Path, int] = {}
    groups: dict[Path, list[Path]] = {}
    for path, credit in credits:
        wanted = _ref(credit["original_invoice"])
        seller = _seller(credit)
        named = [(p, i) for p, i in originals if _ref(i["invoice_number"]) == wanted]
        same = [(p, i) for p, i in named if _seller(i) == seller]
        if not same:
            if named:
                out.setdefault(path, []).append(_finding("INV-058"))
            continue
        if len(same) > 1:
            continue
        opath, original = same[0]
        have, want = _currency(original), _currency(credit)
        if have and want and have != want:
            out.setdefault(path, []).append(_finding("INV-056"))
        amount = _cents(credit)
        if amount is not None and have == want:
            totals[opath] = totals.get(opath, 0) + amount
            groups.setdefault(opath, []).append(path)
    for opath, total in totals.items():
        gross = _cents(next(i for p, i in originals if p == opath))
        if gross is not None and total > gross:
            for path in groups[opath]:
                out.setdefault(path, []).append(_finding("INV-057"))
    return out
