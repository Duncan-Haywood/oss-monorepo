from __future__ import annotations

from decimal import Decimal
from xml.etree import ElementTree
from typing import Any


def _children(element: ElementTree.Element, name: str) -> list[ElementTree.Element]:
    return [child for child in element.iter() if child.tag.rsplit("}", 1)[-1] == name]


def _text(element: ElementTree.Element, name: str, required: bool = True) -> str:
    matches = _children(element, name)
    value = matches[0].text.strip() if matches and matches[0].text else ""
    if required and not value:
        raise ValueError(f"UBL field {name} is missing")
    return value


def _number(value: str) -> int | float:
    number = Decimal(value)
    return int(number) if number == number.to_integral_value() else float(number)


def _party(element: ElementTree.Element) -> dict[str, str]:
    party = next(iter(_children(element, "Party")), element)
    identifier = _text(party, "ID")
    name = _text(party, "Name")
    mapped = {"id": identifier, "name": name}
    vat_id = ""
    for scheme in _children(party, "PartyTaxScheme"):
        vat_id = _text(scheme, "CompanyID", required=False)
        if vat_id:
            break
    if vat_id:
        mapped["vat_id"] = vat_id
    return mapped


_DOCUMENT_ROOTS = {
    "Invoice": ("invoice", "InvoiceLine", "InvoicedQuantity"),
    "CreditNote": ("credit_note", "CreditNoteLine", "CreditedQuantity"),
    "DebitNote": ("debit_note", "DebitNoteLine", "DebitedQuantity"),
}


def parse_ubl_invoice(source: bytes | str) -> dict[str, Any]:
    """Map a local UBL Invoice, CreditNote, or DebitNote into the checker shape."""
    raw = source.encode() if isinstance(source, str) else source
    if b"<!DOCTYPE" in raw.upper() or b"<!ENTITY" in raw.upper():
        raise ValueError("DTD and entity declarations are not supported")
    try:
        root = ElementTree.fromstring(raw)
    except ElementTree.ParseError as exc:
        raise ValueError(str(exc)) from exc
    root_name = root.tag.rsplit("}", 1)[-1]
    if root_name not in _DOCUMENT_ROOTS:
        raise ValueError("UBL document root must be Invoice, CreditNote, or DebitNote")
    document_type, line_name, quantity_name = _DOCUMENT_ROOTS[root_name]

    lines = []
    for line in _children(root, line_name):
        quantity = _text(line, quantity_name)
        price = _text(line, "PriceAmount")
        net = _text(line, "LineExtensionAmount")
        category = next(iter(_children(line, "ClassifiedTaxCategory")), line)
        lines.append({
            "description": _text(line, "Name"),
            "quantity": _number(quantity),
            "unit_price": _number(price),
            "tax_percent": _number(_text(category, "Percent")),
            "net": _number(net),
        })

    supplier = next(iter(_children(root, "AccountingSupplierParty")), root)
    customer = next(iter(_children(root, "AccountingCustomerParty")), root)
    total = next(iter(_children(root, "LegalMonetaryTotal")), root)
    tax_totals = _children(root, "TaxTotal")
    if not tax_totals:
        raise ValueError("UBL field TaxAmount is missing")
    tax_total = sum((Decimal(_text(item, "TaxAmount")) for item in tax_totals), Decimal("0"))
    due_date = _text(root, "DueDate", required=False)
    type_code = (
        _text(root, "InvoiceTypeCode", required=False)
        or _text(root, "CreditNoteTypeCode", required=False)
        or _text(root, "DebitNoteTypeCode", required=False)
    )
    original = _billing_reference(root)
    invoice = {
        "invoice_number": _text(root, "ID"),
        "issue_date": _text(root, "IssueDate"),
        **({"due_date": due_date} if due_date else {}),
        "document_type": document_type,
        **({"document_code": type_code} if type_code else {}),
        **({"original_invoice": original} if original else {}),
        "currency": _text(root, "DocumentCurrencyCode"),
        "supplier": _party(supplier),
        "customer": _party(customer),
        "lines": lines,
        "totals": {
            "net": _number(_text(total, "TaxExclusiveAmount")),
            # UBL permits a TaxTotal per tax scheme; the invoice tax is their sum.
            "tax": _number(str(tax_total)),
            "gross": _number(_text(total, "TaxInclusiveAmount")),
            **_optional_monetary_totals(total),
        },
    }
    payment = _payee_payment(root)
    if payment:
        invoice["payment"] = payment
    return invoice


def _billing_reference(root: ElementTree.Element) -> str:
    """Map BillingReference/InvoiceDocumentReference/ID when present."""
    for ref in _children(root, "BillingReference"):
        for invoice_ref in _children(ref, "InvoiceDocumentReference"):
            value = _text(invoice_ref, "ID", required=False)
            if value:
                return value
    return ""


def _optional_monetary_totals(total: ElementTree.Element) -> dict[str, int | float]:
    """Map PrepaidAmount and PayableAmount when the UBL invoice includes them."""
    extras: dict[str, int | float] = {}
    prepaid = _text(total, "PrepaidAmount", required=False)
    if prepaid:
        extras["prepaid"] = _number(prepaid)
    payable = _text(total, "PayableAmount", required=False)
    if payable:
        extras["due"] = _number(payable)
    return extras


def _payee_payment(root: ElementTree.Element) -> dict[str, str]:
    """Map remittance, payee account, and nested branch BIC when present."""
    for means in _children(root, "PaymentMeans"):
        payment: dict[str, str] = {}
        remittance = _payment_reference(means)
        if remittance:
            payment["remittance"] = remittance
        for account in _children(means, "PayeeFinancialAccount"):
            for child in list(account):
                tag = child.tag.rsplit("}", 1)[-1]
                if tag == "ID":
                    value = (child.text or "").strip()
                    if value:
                        payment["iban"] = value
                elif tag == "FinancialInstitutionBranch":
                    bic = _branch_bic(child)
                    if bic:
                        payment["bic"] = bic
        if payment:
            return payment
    return {}


def _payment_reference(means: ElementTree.Element) -> str:
    """Map PaymentID, then InstructionNote, as the remittance the buyer quotes."""
    for name in ("PaymentID", "InstructionNote"):
        for child in list(means):
            if child.tag.rsplit("}", 1)[-1] == name:
                value = (child.text or "").strip()
                if value:
                    return value
    return ""


def _branch_bic(branch: ElementTree.Element) -> str:
    """Accept branch/ID or branch/FinancialInstitution/ID."""
    for child in branch.iter():
        if child.tag.rsplit("}", 1)[-1] == "ID":
            value = (child.text or "").strip()
            if value:
                return value
    return ""
