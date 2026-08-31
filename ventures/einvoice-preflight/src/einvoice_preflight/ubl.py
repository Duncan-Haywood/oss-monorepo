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


def _nested_text(element: ElementTree.Element, container: str, field: str) -> str:
    """Text of ``<container><field>``, scoped to that container.

    ``_children`` walks every descendant, so an unscoped lookup for ``ID`` on a
    party answers with whatever ``ID`` comes first in document order -- which on
    a party carrying ``cac:PartyTaxScheme`` is ``cac:TaxScheme/cbc:ID``, the
    name of the tax scheme ("VAT"). Scoping the search to the container first
    keeps a party identifier from being read out of an unrelated element.
    """
    for child in _children(element, container):
        value = _text(child, field, required=False)
        if value:
            return value
    return ""


def _party_identifier(party: ElementTree.Element) -> str:
    """The party's own identifier, in the order a receiver would resolve it.

    EN 16931 makes the seller and buyer identifiers (BT-29/BT-46) optional --
    plenty of real Peppol invoices identify a party by its electronic address
    and name alone. Treating the identifier as mandatory made those invoices
    unreadable rather than reporting a finding, so this returns "" and lets the
    checks decide what a missing identifier means.
    """
    return (
        _nested_text(party, "PartyIdentification", "ID")
        or _text(party, "EndpointID", required=False)
        or _nested_text(party, "PartyLegalEntity", "CompanyID")
        or _nested_text(party, "PartyTaxScheme", "CompanyID")
    )


def _party(element: ElementTree.Element) -> dict[str, Any]:
    party = next(iter(_children(element, "Party")), element)
    identifier = _party_identifier(party)
    # XRechnung carries the legal name in PartyLegalEntity/RegistrationName and
    # may omit PartyName entirely, so that is a source for the name, not a
    # reason to refuse the document.
    name = _nested_text(party, "PartyName", "Name") or _nested_text(
        party, "PartyLegalEntity", "RegistrationName"
    ) or _text(party, "Name")
    mapped: dict[str, Any] = {"id": identifier, "name": name}
    vat_id = ""
    for scheme in _children(party, "PartyTaxScheme"):
        vat_id = _text(scheme, "CompanyID", required=False)
        if vat_id:
            break
    if vat_id:
        mapped["vat_id"] = vat_id
    endpoint = _endpoint(party)
    if endpoint:
        mapped["endpoint"] = endpoint
    return mapped


def _endpoint(party: ElementTree.Element) -> dict[str, str] | None:
    """Map Party/EndpointID and its schemeID when either is present."""
    for child in party.iter():
        if child.tag.rsplit("}", 1)[-1] != "EndpointID":
            continue
        value = (child.text or "").strip()
        scheme = ""
        for key, attr in child.attrib.items():
            if key.rsplit("}", 1)[-1] == "schemeID":
                scheme = (attr or "").strip()
        if value or scheme:
            return {"id": value, "scheme": scheme}
    return None


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
        mapped_line = {
            "description": _text(line, "Name"),
            "quantity": _number(quantity),
            "unit_price": _number(price),
            "tax_percent": _number(_text(category, "Percent")),
            "net": _number(net),
        }
        mapped_line.update(_tax_category_fields(category))
        lines.append(mapped_line)

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
    terms_days = _payment_terms_days(root)
    if terms_days:
        if not payment:
            payment = {}
        payment["terms_days"] = terms_days
    if payment:
        invoice["payment"] = payment
    exemption = _document_exemption(root)
    if exemption:
        invoice.update(exemption)
    breakdown = _tax_breakdown(root)
    if breakdown:
        invoice["tax_breakdown"] = breakdown
    period = _invoice_period(root)
    if period:
        invoice["period"] = period
    invoice.update(_commercial_references(root))
    adjustments = _header_adjustments(root)
    if adjustments:
        invoice["adjustments"] = adjustments
    return invoice


def _tax_category_fields(category: ElementTree.Element) -> dict[str, str]:
    """Map ClassifiedTaxCategory ID and exemption reason / code when present."""
    extras: dict[str, str] = {}
    tax_id = ""
    for child in list(category):
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "ID":
            tax_id = (child.text or "").strip()
    if tax_id:
        extras["tax_category"] = tax_id
    reason = _text(category, "TaxExemptionReason", required=False)
    if reason:
        extras["tax_reason"] = reason
    reason_code = _text(category, "TaxExemptionReasonCode", required=False)
    if reason_code:
        extras["tax_reason_code"] = reason_code
    return extras


def _tax_breakdown(root: ElementTree.Element) -> list[dict[str, Any]]:
    """Map TaxTotal/TaxSubtotal rows into tax_breakdown."""
    rows: list[dict[str, Any]] = []
    for subtotal in _children(root, "TaxSubtotal"):
        taxable = _text(subtotal, "TaxableAmount", required=False)
        tax = _text(subtotal, "TaxAmount", required=False)
        category = next(iter(_children(subtotal, "TaxCategory")), None)
        percent = _text(category, "Percent", required=False) if category is not None else ""
        tax_id = ""
        if category is not None:
            for child in list(category):
                if child.tag.rsplit("}", 1)[-1] == "ID":
                    tax_id = (child.text or "").strip()
        if not taxable and not tax and not percent:
            continue
        row: dict[str, Any] = {}
        if percent:
            row["tax_percent"] = _number(percent)
        if taxable:
            row["taxable"] = _number(taxable)
        if tax:
            row["tax"] = _number(tax)
        if tax_id:
            row["tax_category"] = tax_id
        if row:
            rows.append(row)
    return rows


def _document_exemption(root: ElementTree.Element) -> dict[str, str]:
    """Map TaxSubtotal/TaxCategory exemption reason when present."""
    extras: dict[str, str] = {}
    for subtotal in _children(root, "TaxSubtotal"):
        for category in _children(subtotal, "TaxCategory"):
            reason = _text(category, "TaxExemptionReason", required=False)
            if reason and "tax_exemption_reason" not in extras:
                extras["tax_exemption_reason"] = reason
            reason_code = _text(category, "TaxExemptionReasonCode", required=False)
            if reason_code and "tax_exemption_reason_code" not in extras:
                extras["tax_exemption_reason_code"] = reason_code
    return extras


def _header_adjustments(root: ElementTree.Element) -> list[dict[str, Any]]:
    """Map invoice-level AllowanceCharge rows. Ignore line-level charges."""
    rows: list[dict[str, Any]] = []
    for child in list(root):
        if child.tag.rsplit("}", 1)[-1] != "AllowanceCharge":
            continue
        indicator = _text(child, "ChargeIndicator", required=False)
        amount = _text(child, "Amount", required=False)
        base = _text(child, "BaseAmount", required=False)
        percent = _text(child, "MultiplierFactorNumeric", required=False)
        reason = _text(child, "AllowanceChargeReason", required=False)
        reason_code = _text(child, "AllowanceChargeReasonCode", required=False)
        if not any((indicator, amount, base, percent, reason, reason_code)):
            continue
        row: dict[str, Any] = {}
        if indicator:
            row["kind"] = "charge" if indicator.strip().casefold() in {"true", "1"} else "allowance"
        if amount:
            row["amount"] = _number(amount)
        if base:
            row["base"] = _number(base)
        if percent:
            row["percent"] = _number(percent)
        if reason:
            row["reason"] = reason
        if reason_code:
            row["reason_code"] = reason_code
        if row:
            rows.append(row)
    return rows


def _commercial_references(root: ElementTree.Element) -> dict[str, str]:
    """Map invoice-level BuyerReference and OrderReference/ID when present."""
    extras: dict[str, str] = {}
    for child in list(root):
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "BuyerReference":
            extras["buyer_reference"] = (child.text or "").strip()
        elif tag == "OrderReference":
            extras["order_reference"] = _text(child, "ID", required=False)
    return extras


def _invoice_period(root: ElementTree.Element) -> dict[str, str] | None:
    """Map invoice-level InvoicePeriod StartDate/EndDate. Ignore line periods."""
    for child in list(root):
        if child.tag.rsplit("}", 1)[-1] != "InvoicePeriod":
            continue
        start = _text(child, "StartDate", required=False)
        end = _text(child, "EndDate", required=False)
        if start or end:
            period: dict[str, str] = {}
            if start:
                period["start"] = start
            if end:
                period["end"] = end
            return period
    return None


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


def _payment_terms_days(root: ElementTree.Element) -> str:
    """Map invoice-level PaymentTerms/SettlementPeriod/DurationMeasure in days."""
    for child in list(root):
        if child.tag.rsplit("}", 1)[-1] != "PaymentTerms":
            continue
        for period in _children(child, "SettlementPeriod"):
            for measure in list(period):
                if measure.tag.rsplit("}", 1)[-1] != "DurationMeasure":
                    continue
                unit = (measure.get("unitCode") or "").strip().upper()
                value = (measure.text or "").strip()
                if value and unit in {"DAY", "D"}:
                    return value
    return ""


def _payee_payment(root: ElementTree.Element) -> dict[str, str]:
    """Map payment means code, remittance, payee account, and branch BIC."""
    for means in _children(root, "PaymentMeans"):
        payment: dict[str, str] = {}
        code = _text(means, "PaymentMeansCode", required=False)
        if code:
            payment["means"] = code
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
