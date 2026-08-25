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


def parse_ubl_invoice(source: bytes | str) -> dict[str, Any]:
    """Map a local UBL Invoice into the format-neutral checker shape."""
    raw = source.encode() if isinstance(source, str) else source
    if b"<!DOCTYPE" in raw.upper() or b"<!ENTITY" in raw.upper():
        raise ValueError("DTD and entity declarations are not supported")
    try:
        root = ElementTree.fromstring(raw)
    except ElementTree.ParseError as exc:
        raise ValueError(str(exc)) from exc
    if root.tag.rsplit("}", 1)[-1] != "Invoice":
        raise ValueError("UBL document root must be Invoice")

    lines = []
    for line in _children(root, "InvoiceLine"):
        quantity = _text(line, "InvoicedQuantity")
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
    return {
        "invoice_number": _text(root, "ID"),
        "issue_date": _text(root, "IssueDate"),
        **({"due_date": due_date} if due_date else {}),
        "currency": _text(root, "DocumentCurrencyCode"),
        "supplier": _party(supplier),
        "customer": _party(customer),
        "lines": lines,
        "totals": {
            "net": _number(_text(total, "TaxExclusiveAmount")),
            # UBL permits a TaxTotal per tax scheme; the invoice tax is their sum.
            "tax": _number(str(tax_total)),
            "gross": _number(_text(total, "TaxInclusiveAmount")),
        },
    }
