"""Offline document-type and credit-note reference observations.

A credit that travels as a commercial invoice, or that omits the invoice
it reverses, is a common ERP export mistake. Networks then reject the
file after the bookkeeper already sent it. This is a document-shape
check, not a Peppol profile determination and not a claim that a credit
is legally valid. Findings never repeat the original invoice number.
"""

from __future__ import annotations

from typing import Any

# UN/CEFACT 1001 codes commonly seen on UBL InvoiceTypeCode /
# CreditNoteTypeCode / DebitNoteTypeCode, plus the JSON names.
_TYPES = {
    "invoice": "invoice",
    "commercial invoice": "invoice",
    "corrected invoice": "invoice",
    "self billed invoice": "invoice",
    "prepayment invoice": "invoice",
    "380": "invoice",
    "384": "invoice",
    "386": "invoice",
    "389": "invoice",
    "credit note": "credit_note",
    "creditnote": "credit_note",
    "credit": "credit_note",
    "self billed credit note": "credit_note",
    "381": "credit_note",
    "261": "credit_note",
    "debit note": "debit_note",
    "debitnote": "debit_note",
    "debit": "debit_note",
    "383": "debit_note",
}

_REVERSING = frozenset({"credit_note", "debit_note"})


def normalize_document_type(value: Any) -> str | None:
    """Map a type name or UNCL 1001 code to invoice / credit_note / debit_note.

    Empty or missing becomes None. An unrecognised value becomes ``invalid``.
    """
    if value is None:
        return None
    if isinstance(value, bool):
        return "invalid"
    if isinstance(value, int):
        key = str(value)
    elif isinstance(value, str):
        key = " ".join(value.strip().lower().replace("_", " ").replace("-", " ").split())
        if not key:
            return None
    else:
        return "invalid"
    if key in _TYPES:
        return _TYPES[key]
    compact = key.replace(" ", "")
    return _TYPES.get(compact, "invalid")


def inspect_document_type(invoice: dict[str, Any]) -> list[dict[str, str]]:
    """Return INV-032 / INV-033 / INV-034 observations for document type."""
    findings: list[dict[str, str]] = []
    explicit_kind = normalize_document_type(invoice.get("document_type"))
    code_kind = normalize_document_type(invoice.get("document_code"))

    if invoice.get("document_type") not in (None, "") and explicit_kind == "invalid":
        findings.append(_finding(
            "INV-032",
            "Document type is not a known invoice, credit note, or debit note.",
            "Use invoice, credit_note, or debit_note, or omit document_type.",
            "/document_type",
        ))
    if invoice.get("document_code") not in (None, "") and code_kind == "invalid":
        findings.append(_finding(
            "INV-032",
            "Document type code is not a known invoice, credit note, or debit note code.",
            "Use a UN/CEFACT 1001 code such as 380, 381, or 383, or omit document_code.",
            "/document_code",
        ))

    if (
        explicit_kind in {"invoice", "credit_note", "debit_note"}
        and code_kind in {"invoice", "credit_note", "debit_note"}
        and explicit_kind != code_kind
    ):
        findings.append(_finding(
            "INV-034",
            "This document is marked as a commercial invoice but its type code is a credit or debit note."
            if explicit_kind == "invoice"
            else "This document's type and type code do not describe the same kind of document.",
            "Send a CreditNote when the type code is 381, or set document_type to match document_code.",
            "/document_code",
        ))

    effective = _effective_type(explicit_kind, code_kind)
    needs_original = effective in _REVERSING or (
        explicit_kind == "invoice" and code_kind in _REVERSING
    )
    if needs_original:
        original = invoice.get("original_invoice")
        missing = original in (None, "") or (isinstance(original, str) and not original.strip())
        if missing:
            findings.append(_finding(
                "INV-033",
                "Credit or debit note is missing the original invoice it reverses.",
                "Add original_invoice with the invoice number being credited or debited.",
                "/original_invoice",
            ))
        elif not isinstance(original, str):
            findings.append(_finding(
                "INV-033",
                "Original invoice reference is empty or not text.",
                "Provide original_invoice as text, or omit document_type if this is a commercial invoice.",
                "/original_invoice",
            ))
        elif _same_reference(original, invoice.get("invoice_number")):
            findings.append(_finding(
                "INV-034",
                "This credit or debit note names itself as the invoice it reverses.",
                "Set original_invoice to the invoice being credited or debited, not this document's own number.",
                "/original_invoice",
            ))
    return findings


def _effective_type(explicit_kind: str | None, code_kind: str | None) -> str:
    if explicit_kind in {"invoice", "credit_note", "debit_note"}:
        return explicit_kind
    if code_kind in {"invoice", "credit_note", "debit_note"}:
        return code_kind
    return "invoice"


def _same_reference(left: Any, right: Any) -> bool:
    if not isinstance(left, str) or not isinstance(right, str):
        return False
    return left.strip().casefold() == right.strip().casefold() and bool(left.strip())


def _finding(rule: str, message: str, fix: str, path: str) -> dict[str, str]:
    return {"rule": rule, "message": message, "fix": fix, "path": path}
