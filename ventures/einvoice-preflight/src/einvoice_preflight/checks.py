from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any


def _money(value: Any) -> Decimal | None:
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None
    return result.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if result.is_finite() else None


def check_invoice(invoice: Any) -> list[dict[str, str]]:
    errors: list[dict[str, str]] = []

    def fail(rule: str, message: str, fix: str) -> None:
        errors.append({"rule": rule, "message": message, "fix": fix})

    if not isinstance(invoice, dict):
        return [{"rule": "INV-001", "message": "Invoice must be a JSON object.", "fix": "Provide the invoice object at the document root."}]
    for field in ("invoice_number", "issue_date", "currency", "supplier", "customer", "lines", "totals"):
        if field not in invoice:
            fail("INV-001", f"Required field '{field}' is missing.", f"Add a '{field}' field.")
    if not isinstance(invoice.get("invoice_number"), str) or not invoice.get("invoice_number", "").strip():
        fail("INV-002", "Invoice number is empty or not text.", "Provide a non-empty invoice number.")
    try:
        date.fromisoformat(invoice.get("issue_date", ""))
    except (ValueError, TypeError):
        fail("INV-003", "Issue date is not an ISO date.", "Use YYYY-MM-DD, for example 2026-08-24.")
    if not isinstance(invoice.get("currency"), str) or len(invoice.get("currency", "")) != 3 or not invoice.get("currency", "").isupper():
        fail("INV-004", "Currency is not a three-letter uppercase code.", "Use an ISO-style code such as EUR or GBP.")
    for party_name in ("supplier", "customer"):
        party = invoice.get(party_name)
        if not isinstance(party, dict) or not isinstance(party.get("id"), str) or not party.get("id", "").strip():
            fail("INV-005", f"{party_name.title()} identifier is missing.", f"Add the {party_name} identifier from the source system.")
        if not isinstance(party, dict) or not isinstance(party.get("name"), str) or not party.get("name", "").strip():
            fail("INV-006", f"{party_name.title()} name is missing.", f"Add the {party_name} name.")
    lines = invoice.get("lines")
    if not isinstance(lines, list) or not lines:
        fail("INV-007", "Invoice has no line items.", "Add at least one line item.")
        lines = []
    expected_net = Decimal("0")
    expected_tax = Decimal("0")
    for index, line in enumerate(lines, 1):
        if not isinstance(line, dict):
            fail("INV-008", f"Line {index} is not an object.", "Provide description, quantity, unit_price, and tax_percent.")
            continue
        if not isinstance(line.get("description"), str) or not line.get("description", "").strip():
            fail("INV-008", f"Line {index} has no description.", "Add a human-readable line description.")
        quantity, price, tax = (_money(line.get(key)) for key in ("quantity", "unit_price", "tax_percent"))
        if quantity is None or quantity <= 0:
            fail("INV-009", f"Line {index} quantity is invalid.", "Use a positive numeric quantity.")
        if price is None or price < 0:
            fail("INV-010", f"Line {index} unit price is invalid.", "Use a non-negative numeric unit price.")
        if tax is None or tax < 0 or tax > 100:
            fail("INV-011", f"Line {index} tax percentage is invalid.", "Use the tax percentage supplied by your authoritative source; this tool does not choose it.")
        if quantity is not None and price is not None and quantity > 0 and price >= 0:
            line_net = (quantity * price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            expected_net += line_net
            if tax is not None and 0 <= tax <= 100:
                expected_tax += (line_net * tax / Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            supplied = _money(line.get("net"))
            if supplied is not None and supplied != line_net:
                fail("INV-012", f"Line {index} net does not match quantity times unit price.", f"Set line net to {line_net} or correct the inputs.")
    totals = invoice.get("totals")
    if not isinstance(totals, dict):
        totals = {}
    net, tax_total, gross = (_money(totals.get(key)) for key in ("net", "tax", "gross"))
    if net is None or net < 0:
        fail("INV-013", "Invoice net total is missing or invalid.", "Provide a non-negative numeric net total.")
    elif net != expected_net:
        fail("INV-014", "Invoice net total does not match its line items.", f"Set net total to {expected_net} or correct the line items.")
    if tax_total is None or tax_total < 0:
        fail("INV-015", "Invoice tax total is missing or invalid.", "Provide a non-negative numeric tax total.")
    elif tax_total != expected_tax:
        fail("INV-018", "Invoice tax total does not match its line tax percentages.", f"Set tax total to {expected_tax} or correct the line inputs.")
    if gross is None or gross < 0:
        fail("INV-016", "Invoice gross total is missing or invalid.", "Provide a non-negative numeric gross total.")
    elif net is not None and tax_total is not None and gross != net + tax_total:
        fail("INV-017", "Gross total does not equal net plus tax.", f"Set gross total to {net + tax_total} or correct the totals.")
    return errors
