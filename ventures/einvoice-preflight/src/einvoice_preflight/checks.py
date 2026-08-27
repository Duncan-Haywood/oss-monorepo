from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

from .adjustment import header_adjustment_net_delta, inspect_header_adjustments
from .bic import inspect_payment_bic
from .breakdown import inspect_tax_breakdown
from .document import inspect_document_type
from .endpoint import inspect_party_endpoint
from .iban import inspect_payment_iban
from .means import inspect_payment_means
from .period import inspect_invoice_period
from .reference import inspect_commercial_references
from .remittance import inspect_payment_remittance
from .tax import inspect_tax_exemption
from .terms import inspect_payment_terms
from .vat import inspect_party_vat


def _money(value: Any) -> Decimal | None:
    result = _number(value)
    return result.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if result is not None else None


def _number(value: Any) -> Decimal | None:
    """Parse a finite number without applying currency-specific rounding."""
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None
    return result if result.is_finite() else None


def _iso_date(value: Any) -> date | None:
    """Accept the documented extended YYYY-MM-DD form only."""
    if not isinstance(value, str) or len(value) != 10 or value[4] != "-" or value[7] != "-":
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def check_invoice(invoice: Any) -> list[dict[str, str]]:
    errors: list[dict[str, str]] = []

    def fail(rule: str, message: str, fix: str, path: str = "") -> None:
        errors.append({"rule": rule, "message": message, "fix": fix, "path": path})

    if not isinstance(invoice, dict):
        return [{"rule": "INV-001", "message": "Invoice must be a JSON object.", "fix": "Provide the invoice object at the document root.", "path": ""}]
    for field in ("invoice_number", "issue_date", "currency", "supplier", "customer", "lines", "totals"):
        if field not in invoice:
            fail("INV-001", f"Required field '{field}' is missing.", f"Add a '{field}' field.", f"/{field}")
    if not isinstance(invoice.get("invoice_number"), str) or not invoice.get("invoice_number", "").strip():
        fail("INV-002", "Invoice number is empty or not text.", "Provide a non-empty invoice number.", "/invoice_number")
    issue_date = _iso_date(invoice.get("issue_date"))
    if issue_date is None:
        fail("INV-003", "Issue date is not an ISO date.", "Use YYYY-MM-DD, for example 2026-08-24.", "/issue_date")
    if "due_date" in invoice and invoice.get("due_date") not in (None, ""):
        due_date = _iso_date(invoice["due_date"])
        if due_date is None:
            fail("INV-020", "Due date is not an ISO date.", "Use YYYY-MM-DD, for example 2026-09-23.", "/due_date")
        if due_date is not None and issue_date is not None and due_date < issue_date:
            fail("INV-021", "Due date is earlier than the issue date.", "Set due date to the issue date or a later date.", "/due_date")
    if not isinstance(invoice.get("currency"), str) or len(invoice.get("currency", "")) != 3 or not invoice.get("currency", "").isupper():
        fail("INV-004", "Currency is not a three-letter uppercase code.", "Use an ISO-style code such as EUR or GBP.", "/currency")
    for party_name in ("supplier", "customer"):
        party = invoice.get(party_name)
        if not isinstance(party, dict) or not isinstance(party.get("id"), str) or not party.get("id", "").strip():
            fail("INV-005", f"{party_name.title()} identifier is missing.", f"Add the {party_name} identifier from the source system.", f"/{party_name}/id")
        if not isinstance(party, dict) or not isinstance(party.get("name"), str) or not party.get("name", "").strip():
            fail("INV-006", f"{party_name.title()} name is missing.", f"Add the {party_name} name.", f"/{party_name}/name")
        if isinstance(party, dict):
            for finding in inspect_party_vat(party, party_name):
                fail(finding["rule"], finding["message"], finding["fix"], finding["path"])
            for finding in inspect_party_endpoint(party, party_name):
                fail(finding["rule"], finding["message"], finding["fix"], finding["path"])
    for finding in inspect_payment_iban(invoice):
        fail(finding["rule"], finding["message"], finding["fix"], finding["path"])
    for finding in inspect_payment_means(invoice):
        fail(finding["rule"], finding["message"], finding["fix"], finding["path"])
    for finding in inspect_payment_terms(invoice):
        fail(finding["rule"], finding["message"], finding["fix"], finding["path"])
    for finding in inspect_payment_bic(invoice):
        fail(finding["rule"], finding["message"], finding["fix"], finding["path"])
    for finding in inspect_payment_remittance(invoice):
        fail(finding["rule"], finding["message"], finding["fix"], finding["path"])
    for finding in inspect_document_type(invoice):
        fail(finding["rule"], finding["message"], finding["fix"], finding["path"])
    for finding in inspect_tax_exemption(invoice):
        fail(finding["rule"], finding["message"], finding["fix"], finding["path"])
    for finding in inspect_tax_breakdown(invoice):
        fail(finding["rule"], finding["message"], finding["fix"], finding["path"])
    for finding in inspect_invoice_period(invoice):
        fail(finding["rule"], finding["message"], finding["fix"], finding["path"])
    for finding in inspect_commercial_references(invoice):
        fail(finding["rule"], finding["message"], finding["fix"], finding["path"])
    for finding in inspect_header_adjustments(invoice):
        fail(finding["rule"], finding["message"], finding["fix"], finding["path"])
    lines = invoice.get("lines")
    if not isinstance(lines, list) or not lines:
        fail("INV-007", "Invoice has no line items.", "Add at least one line item.", "/lines")
        lines = []
    expected_net = Decimal("0")
    expected_tax = Decimal("0")
    for index, line in enumerate(lines, 1):
        if not isinstance(line, dict):
            fail("INV-008", f"Line {index} is not an object.", "Provide description, quantity, unit_price, and tax_percent.", f"/lines/{index - 1}")
            continue
        if not isinstance(line.get("description"), str) or not line.get("description", "").strip():
            fail("INV-008", f"Line {index} has no description.", "Add a human-readable line description.", f"/lines/{index - 1}/description")
        quantity, price, tax = _number(line.get("quantity")), _money(line.get("unit_price")), _number(line.get("tax_percent"))
        if quantity is None or quantity <= 0:
            fail("INV-009", f"Line {index} quantity is invalid.", "Use a positive numeric quantity.", f"/lines/{index - 1}/quantity")
        if price is None or price < 0:
            fail("INV-010", f"Line {index} unit price is invalid.", "Use a non-negative numeric unit price.", f"/lines/{index - 1}/unit_price")
        if tax is None or tax < 0 or tax > 100:
            fail("INV-011", f"Line {index} tax percentage is invalid.", "Use the tax percentage supplied by your authoritative source; this tool does not choose it.", f"/lines/{index - 1}/tax_percent")
        if quantity is not None and price is not None and quantity > 0 and price >= 0:
            line_net = (quantity * price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            expected_net += line_net
            if tax is not None and 0 <= tax <= 100:
                expected_tax += (line_net * tax / Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            supplied = _money(line.get("net"))
            if supplied is None or supplied != line_net:
                fail("INV-012", f"Line {index} net is missing or does not match quantity times unit price.", f"Set line net to {line_net} or correct the inputs.", f"/lines/{index - 1}/net")
    expected_net = (expected_net + header_adjustment_net_delta(invoice)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if expected_net < 0:
        expected_net = Decimal("0.00")
    totals = invoice.get("totals")
    if not isinstance(totals, dict):
        totals = {}
    net, tax_total, gross = (_money(totals.get(key)) for key in ("net", "tax", "gross"))
    if net is None or net < 0:
        fail("INV-013", "Invoice net total is missing or invalid.", "Provide a non-negative numeric net total.", "/totals/net")
    elif net != expected_net:
        if invoice.get("adjustments"):
            fail("INV-014", "Invoice net total does not match line items after header allowances and charges.", f"Set net total to {expected_net} or correct the line items and adjustments.", "/totals/net")
        else:
            fail("INV-014", "Invoice net total does not match its line items.", f"Set net total to {expected_net} or correct the line items.", "/totals/net")
    if tax_total is None or tax_total < 0:
        fail("INV-015", "Invoice tax total is missing or invalid.", "Provide a non-negative numeric tax total.", "/totals/tax")
    elif tax_total != expected_tax:
        fail("INV-018", "Invoice tax total does not match its line tax percentages.", f"Set tax total to {expected_tax} or correct the line inputs.", "/totals/tax")
    if gross is None or gross < 0:
        fail("INV-016", "Invoice gross total is missing or invalid.", "Provide a non-negative numeric gross total.", "/totals/gross")
    elif net is not None and tax_total is not None and gross != net + tax_total:
        fail("INV-017", "Gross total does not equal net plus tax.", f"Set gross total to {net + tax_total} or correct the totals.", "/totals/gross")
    prepaid = _optional_money(totals, "prepaid")
    if prepaid is not None:
        if prepaid < 0:
            fail("INV-028", "Prepaid amount is missing or invalid.", "Provide a non-negative numeric prepaid amount, or omit totals.prepaid.", "/totals/prepaid")
        elif gross is not None and gross >= 0 and prepaid > gross:
            fail("INV-028", "Prepaid amount is greater than the invoice gross.", f"Set prepaid to at most {gross} or correct the totals.", "/totals/prepaid")
    due = _optional_money(totals, "due")
    if due is not None:
        if due < 0:
            fail("INV-029", "Amount due is missing or invalid.", "Provide a non-negative numeric amount due, or omit totals.due.", "/totals/due")
        elif gross is not None and gross >= 0 and (prepaid is None or prepaid >= 0):
            applied = prepaid if prepaid is not None and prepaid >= 0 else Decimal("0")
            expected_due = (gross - applied).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            if expected_due < 0:
                expected_due = Decimal("0.00")
            if due != expected_due:
                fail("INV-029", "Amount due does not equal gross minus prepaid.", f"Set amount due to {expected_due} or correct prepaid and gross.", "/totals/due")
    return errors


def _optional_money(totals: dict[str, Any], key: str) -> Decimal | None:
    """Parse an optional money field. Missing or blank is None; unparseable is -1."""
    if key not in totals or totals.get(key) in (None, ""):
        return None
    parsed = _money(totals.get(key))
    return parsed if parsed is not None else Decimal("-1")
