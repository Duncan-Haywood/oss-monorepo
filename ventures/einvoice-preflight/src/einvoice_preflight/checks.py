"""Explainable preflight checks for one invoice document.

Every check reads the normalised document produced by
:mod:`einvoice_preflight.formats` and, when it finds a defect, reports a rule
ID, a severity, the EN 16931 business term or rule the check is modelled on, a
plain-language message, and a fix. Nothing here asserts legal compliance: the
tool checks the arithmetic and structure of the facts in the file, which is a
different and much smaller claim than "this invoice will be accepted".

Two severities:

``error``
    An internal contradiction in the document -- totals that do not add up,
    a required field that is absent. A receiver's validator will reject these,
    and no judgement call is involved in saying so.

``warning``
    Something that is legal in EN 16931 but is the most common reason a real
    submission bounces at a national or Peppol profile: a missing buyer
    reference under XRechnung, a credit transfer with no account number. These
    are reported but do not fail the run unless ``--strict`` is used, because
    whether they matter depends on the profile the receiver enforces.

Checks that ask "is this field present" only run on a document parsed from
real e-invoice XML (which sets ``syntax``). The original hand-written JSON
shape makes no claim to follow a profile, so holding it to XRechnung's
requirements would be reporting a defect against a standard the author never
invoked.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

__all__ = ["check_invoice", "ERROR", "WARNING"]

ERROR = "error"
WARNING = "warning"

CENT = Decimal("0.01")

# EN 16931 / UNTDID 5305 VAT category codes that must carry a zero rate. A
# non-zero rate on any of them is a contradiction rather than a judgement call.
ZERO_RATE_CATEGORIES = {
    "E",   # exempt from VAT
    "Z",   # zero rated
    "AE",  # reverse charge
    "K",   # intra-community supply
    "G",   # export outside the EU
    "O",   # outside the scope of VAT
}
# Of those, the ones a receiver expects an exemption reason for. "Z" (zero
# rated) is a rate, not an exemption, so it needs no reason.
REASON_CATEGORIES = ZERO_RATE_CATEGORIES - {"Z"}
# UNTDID 4461 payment means that settle to a bank account, so an invoice using
# one without an account number cannot actually be paid from the document.
CREDIT_TRANSFER_CODES = {"30", "58"}


def _decimal(value: Any) -> Decimal | None:
    """Parse an amount without rounding it.

    Rounding on the way in would hide exactly the cent-level disagreement
    these checks exist to find, so the quantise happens per comparison.
    """
    if value is None or isinstance(value, bool):
        return None
    try:
        result = Decimal(str(value).strip())
    except (InvalidOperation, ValueError, TypeError):
        return None
    return result if result.is_finite() else None


def _money(value: Any) -> Decimal | None:
    result = _decimal(value)
    return None if result is None else result.quantize(CENT, rounding=ROUND_HALF_UP)


def _round(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def _sum(values: Any) -> Decimal:
    total = Decimal("0")
    for value in values or []:
        amount = _decimal(value)
        if amount is not None:
            total += amount
    return total


def _text(value: Any) -> str | None:
    return value.strip() or None if isinstance(value, str) else None


def check_invoice(invoice: Any) -> list[dict[str, str]]:
    """Return every finding for one document, most structural first."""
    findings: list[dict[str, str]] = []

    def report(rule: str, message: str, fix: str, *, severity: str = ERROR, reference: str = "") -> None:
        finding = {"rule": rule, "severity": severity, "message": message, "fix": fix}
        if reference:
            finding["reference"] = reference
        findings.append(finding)

    if not isinstance(invoice, dict):
        return [
            {
                "rule": "INV-001",
                "severity": ERROR,
                "message": "Invoice must be a JSON object.",
                "fix": "Provide the invoice object at the document root.",
            }
        ]

    # Only a document parsed from real e-invoice XML carries a profile claim,
    # so only that document is held to profile expectations. See module docs.
    structured = bool(invoice.get("syntax"))

    _check_header(invoice, report)
    _check_parties(invoice, report, structured)
    line_nets, groupable = _check_lines(invoice, report, structured)
    _check_totals(invoice, report, line_nets)
    _check_vat_breakdown(invoice, report, structured, groupable)
    _check_payment(invoice, report, structured)
    return findings


# --------------------------------------------------------------------------
# header and parties
# --------------------------------------------------------------------------


def _check_header(invoice: dict[str, Any], report: Any) -> None:
    for field in ("invoice_number", "issue_date", "currency", "supplier", "customer", "lines", "totals"):
        if field not in invoice:
            report("INV-001", f"Required field '{field}' is missing.", f"Add a '{field}' field.")
    if not _text(invoice.get("invoice_number")):
        report(
            "INV-002",
            "Invoice number is empty or not text.",
            "Provide a non-empty invoice number.",
            reference="BT-1",
        )
    issue_date = _parse_date(invoice.get("issue_date"))
    if issue_date is None:
        report(
            "INV-003",
            "Issue date is not an ISO date.",
            "Use YYYY-MM-DD, for example 2026-08-24.",
            reference="BT-2",
        )
    currency = invoice.get("currency")
    if not isinstance(currency, str) or len(currency) != 3 or not currency.isupper() or not currency.isalpha():
        report(
            "INV-004",
            "Currency is not a three-letter uppercase code.",
            "Use an ISO-style code such as EUR or GBP.",
            reference="BT-5",
        )
    # A due date before the issue date is always a data-entry defect: it makes
    # the payment term negative and dunning software will act on it immediately.
    due_date = _parse_date(invoice.get("due_date"))
    if issue_date is not None and due_date is not None and due_date < issue_date:
        report(
            "INV-030",
            f"Payment due date {due_date.isoformat()} is before the issue date {issue_date.isoformat()}.",
            "Correct the due date, or the issue date if that is the one that is wrong.",
            reference="BT-9",
        )


def _parse_date(value: Any) -> date | None:
    try:
        return date.fromisoformat(value)
    except (ValueError, TypeError):
        return None


def _check_parties(invoice: dict[str, Any], report: Any, structured: bool) -> None:
    for party_name in ("supplier", "customer"):
        party = invoice.get(party_name)
        party = party if isinstance(party, dict) else {}
        if not _text(party.get("id")):
            # EN 16931 makes the seller and buyer *identifiers* optional -- the
            # names are what it requires -- so a missing one is reported as a
            # warning rather than as a rejection-grade defect.
            report(
                "INV-005",
                f"{party_name.title()} identifier is missing.",
                f"Add the {party_name} identifier from the source system.",
                severity=WARNING,
                reference="BT-29 / BT-46",
            )
        if not _text(party.get("name")):
            report(
                "INV-006",
                f"{party_name.title()} name is missing.",
                f"Add the {party_name} name.",
                reference="BT-27 / BT-44",
            )

    if not structured:
        return
    supplier = invoice.get("supplier") if isinstance(invoice.get("supplier"), dict) else {}
    charges_vat = any(
        (_text(line.get("tax_category")) or "").upper() == "S"
        for line in invoice.get("lines") or []
        if isinstance(line, dict)
    )
    if charges_vat and not _text(supplier.get("vat_id")):
        report(
            "INV-028",
            "The invoice charges standard-rate VAT but the seller has no VAT identifier.",
            "Add the seller's VAT registration number to the party's tax registration.",
            severity=WARNING,
            reference="BT-31",
        )
    if not _text(invoice.get("buyer_reference")):
        report(
            "INV-027",
            "No buyer reference is present.",
            "Add the buyer reference (Leitweg-ID for German public bodies). "
            "XRechnung requires it, and receivers that enforce it reject the "
            "invoice outright rather than querying it.",
            severity=WARNING,
            reference="BT-10",
        )


# --------------------------------------------------------------------------
# lines
# --------------------------------------------------------------------------


def _check_lines(invoice: dict[str, Any], report: Any, structured: bool) -> tuple[Decimal, dict[Any, Decimal] | None]:
    """Check every line. Returns the line-net total and per-VAT-group subtotals.

    ``groupable`` is ``None`` when at least one line could not be assigned to a
    VAT group -- the breakdown comparison is then skipped rather than reported
    against a subtotal this function knows is incomplete.
    """
    lines = invoice.get("lines")
    if not isinstance(lines, list) or not lines:
        report("INV-007", "Invoice has no line items.", "Add at least one line item.", reference="BG-25")
        return Decimal("0"), None

    expected_net = Decimal("0")
    groups: dict[Any, Decimal] = {}
    groupable = True

    for index, line in enumerate(lines, 1):
        if not isinstance(line, dict):
            report(
                "INV-008",
                f"Line {index} is not an object.",
                "Provide description, quantity, unit_price, and tax_percent.",
            )
            groupable = False
            continue
        label = f"Line {_text(line.get('id')) or index}"
        if not _text(line.get("description")):
            report(
                "INV-008",
                f"{label} has no description.",
                "Add a human-readable line description.",
                reference="BT-153",
            )

        quantity = _decimal(line.get("quantity"))
        price = _decimal(line.get("unit_price"))
        tax = _decimal(line.get("tax_percent"))
        supplied_net = _money(line.get("net"))

        # A credit note's quantities are positive; a negative *line* on an
        # invoice is a legitimate correction, so only a zero or unparseable
        # quantity is a defect.
        if quantity is None or quantity == 0:
            report(
                "INV-009",
                f"{label} quantity is invalid.",
                "Use a non-zero numeric quantity.",
                reference="BT-129",
            )
        if price is None or price < 0:
            report(
                "INV-010",
                f"{label} unit price is invalid.",
                "Use a non-negative numeric unit price.",
                reference="BT-146",
            )
        if tax is None or tax < 0 or tax > 100:
            report(
                "INV-011",
                f"{label} tax percentage is invalid.",
                "Use the tax percentage supplied by your authoritative source; this tool does not choose it.",
                reference="BT-152",
            )

        computed = _line_net(line, quantity, price)
        if computed is not None and supplied_net is not None and supplied_net != computed:
            report(
                "INV-012",
                f"{label} net does not match quantity times unit price"
                f"{' after its own allowances and charges' if line.get('allowances') or line.get('charges') else ''}.",
                f"Set line net to {computed} or correct the inputs.",
                reference="BR-CO-4",
            )

        # The stated line net is what the document totals are built from, so
        # it is what the totals are checked against; the computed value is the
        # fallback for the hand-written JSON shape, which may omit it.
        line_net = supplied_net if supplied_net is not None else computed
        if line_net is None:
            groupable = False
            continue
        expected_net += line_net

        category = (_text(line.get("tax_category")) or "").upper()
        if structured and not category:
            report(
                "INV-031",
                f"{label} has no VAT category code.",
                "Add the line's VAT category (S, Z, E, AE, K, G or O) so it can be matched to the VAT breakdown.",
                severity=WARNING,
                reference="BT-151",
            )
        if not category or tax is None:
            groupable = False
            continue
        if category in ZERO_RATE_CATEGORIES and tax != 0:
            report(
                "INV-025",
                f"{label} uses VAT category {category}, which must carry a zero rate, but states {tax}%.",
                f"Set the rate to 0 for category {category}, or use category S if the line really is taxed.",
                reference="BR-E/Z/AE/K/G/O",
            )
        if category == "S" and tax == 0:
            report(
                "INV-025",
                f"{label} uses standard-rate VAT category S with a 0% rate.",
                "Use category Z, E, AE, K, G or O for an untaxed line, or state the standard rate.",
                reference="BR-S-05",
            )
        groups[(category, tax)] = groups.get((category, tax), Decimal("0")) + line_net

    _add_document_adjustments_to_groups(invoice, groups)
    return expected_net, groups if groupable else None


def _line_net(line: dict[str, Any], quantity: Decimal | None, price: Decimal | None) -> Decimal | None:
    """Net for one line: quantity x price / base quantity - allowances + charges."""
    if quantity is None or price is None or price < 0:
        return None
    base = _decimal(line.get("base_quantity"))
    if base is not None and base != 0:
        # BT-149/BT-150: a price quoted per 10 or per 1000 units.
        price = price / base
    net = quantity * price
    net -= _sum(line.get("allowances"))
    net += _sum(line.get("charges"))
    return _round(net)


def _add_document_adjustments_to_groups(invoice: dict[str, Any], groups: dict[Any, Decimal]) -> None:
    """Fold document-level allowances and charges into their VAT groups.

    A document discount reduces the taxable amount of the group it is coded to,
    so the VAT breakdown will not match the raw line subtotals without this.
    """
    for key, sign in (("allowances", Decimal("-1")), ("charges", Decimal("1"))):
        for entry in invoice.get(key) or []:
            if not isinstance(entry, dict):
                continue
            amount = _decimal(entry.get("amount"))
            category = (_text(entry.get("tax_category")) or "").upper()
            rate = _decimal(entry.get("tax_percent"))
            if amount is None or not category or rate is None:
                continue
            groups[(category, rate)] = groups.get((category, rate), Decimal("0")) + sign * amount


# --------------------------------------------------------------------------
# totals
# --------------------------------------------------------------------------


def _check_totals(invoice: dict[str, Any], report: Any, line_nets: Decimal) -> None:
    totals = invoice.get("totals")
    totals = totals if isinstance(totals, dict) else {}
    net = _money(totals.get("net"))
    tax_total = _money(totals.get("tax"))
    gross = _money(totals.get("gross"))
    taxable = _money(totals.get("taxable"))

    if net is None or net < 0:
        report(
            "INV-013",
            "Invoice net total is missing or invalid.",
            "Provide a non-negative numeric net total.",
            reference="BT-106",
        )
    elif net != line_nets:
        report(
            "INV-014",
            "Invoice net total does not match its line items.",
            f"Set net total to {line_nets} or correct the line items.",
            reference="BR-CO-10",
        )
    if tax_total is None or tax_total < 0:
        report(
            "INV-015",
            "Invoice tax total is missing or invalid.",
            "Provide a non-negative numeric tax total.",
            reference="BT-110",
        )
    if gross is None or gross < 0:
        report(
            "INV-016",
            "Invoice gross total is missing or invalid.",
            "Provide a non-negative numeric gross total.",
            reference="BT-112",
        )

    allowance_total = _money(totals.get("allowance_total"))
    charge_total = _money(totals.get("charge_total"))
    _check_adjustment_totals(invoice, report, allowance_total, charge_total)

    if taxable is not None:
        # BR-CO-13. Only a structured document states a separate
        # tax-exclusive amount; when it does, it -- not the line total -- is
        # what the gross is built from.
        expected_taxable = _round(
            (net if net is not None else line_nets)
            - (allowance_total or Decimal("0"))
            + (charge_total or Decimal("0"))
        )
        if taxable != expected_taxable:
            report(
                "INV-018",
                f"Tax-exclusive amount {taxable} does not equal the line total minus allowances plus charges ({expected_taxable}).",
                f"Set the tax-exclusive amount to {expected_taxable}, or correct the line total, allowances or charges.",
                reference="BR-CO-13",
            )
        if gross is not None and tax_total is not None and gross != _round(taxable + tax_total):
            report(
                "INV-020",
                f"Tax-inclusive amount {gross} does not equal the tax-exclusive amount plus VAT ({_round(taxable + tax_total)}).",
                f"Set the tax-inclusive amount to {_round(taxable + tax_total)} or correct the VAT total.",
                reference="BR-CO-15",
            )
    elif gross is not None and net is not None and tax_total is not None and gross != _round(net + tax_total):
        # The hand-written JSON shape has no separate tax-exclusive amount, so
        # for it the gross is checked straight against net plus tax.
        report(
            "INV-017",
            "Gross total does not equal net plus tax.",
            f"Set gross total to {_round(net + tax_total)} or correct the totals.",
            reference="BR-CO-15",
        )

    payable = _money(totals.get("payable"))
    if payable is not None and gross is not None:
        prepaid = _money(totals.get("prepaid")) or Decimal("0")
        rounding = _money(totals.get("rounding")) or Decimal("0")
        expected_payable = _round(gross - prepaid + rounding)
        if payable != expected_payable:
            report(
                "INV-021",
                f"Amount due for payment {payable} does not equal the tax-inclusive amount minus prepaid plus rounding ({expected_payable}).",
                f"Set the amount due to {expected_payable}, or correct the prepaid or rounding amount.",
                reference="BR-CO-16",
            )


def _check_adjustment_totals(
    invoice: dict[str, Any], report: Any, allowance_total: Decimal | None, charge_total: Decimal | None
) -> None:
    for key, stated, rule, term in (
        ("allowances", allowance_total, "INV-019", "BT-107"),
        ("charges", charge_total, "INV-019", "BT-108"),
    ):
        entries = invoice.get(key)
        if not entries or stated is None:
            continue
        expected = _round(_sum(entry.get("amount") for entry in entries if isinstance(entry, dict)))
        if stated != expected:
            report(
                rule,
                f"Stated document-level {key[:-1]} total {stated} does not equal the sum of the {key} ({expected}).",
                f"Set the {key[:-1]} total to {expected} or correct the individual {key}.",
                reference=term,
            )


# --------------------------------------------------------------------------
# VAT breakdown
# --------------------------------------------------------------------------


def _check_vat_breakdown(
    invoice: dict[str, Any], report: Any, structured: bool, groups: dict[Any, Decimal] | None
) -> None:
    breakdown = invoice.get("vat_breakdown")
    breakdown = [entry for entry in breakdown or [] if isinstance(entry, dict)]
    totals = invoice.get("totals") if isinstance(invoice.get("totals"), dict) else {}
    tax_total = _money(totals.get("tax"))

    if not breakdown:
        if structured and tax_total is not None:
            report(
                "INV-032",
                "The invoice states a VAT total but has no VAT breakdown.",
                "Add a VAT breakdown group for each category and rate used on the lines.",
                reference="BG-23",
            )
        return

    stated_by_key: dict[Any, Decimal] = {}
    breakdown_tax = Decimal("0")
    for entry in breakdown:
        category = (_text(entry.get("tax_category")) or "").upper()
        rate = _decimal(entry.get("tax_percent"))
        taxable = _money(entry.get("taxable_amount"))
        tax_amount = _money(entry.get("tax_amount"))
        label = f"VAT group {category or '?'} at {rate if rate is not None else '?'}%"

        if tax_amount is not None:
            breakdown_tax += tax_amount
        if not category or rate is None:
            report(
                "INV-026",
                "A VAT breakdown group is missing its category code or rate.",
                "Give every VAT breakdown group a category code and a rate.",
                reference="BT-118 / BT-119",
            )
            continue
        if taxable is None or tax_amount is None:
            report(
                "INV-026",
                f"{label} is missing its taxable amount or its VAT amount.",
                "Give every VAT breakdown group both a taxable amount and a VAT amount.",
                reference="BT-116 / BT-117",
            )
            continue

        stated_by_key[(category, rate)] = stated_by_key.get((category, rate), Decimal("0")) + taxable

        expected_tax = _round(taxable * rate / Decimal("100"))
        # One cent of slack: a sender that rounds VAT per line and then sums
        # can legitimately land a cent away from rounding the group once.
        if abs(tax_amount - expected_tax) > CENT:
            report(
                "INV-024",
                f"{label} states VAT of {tax_amount} on a taxable amount of {taxable}, but the rate gives {expected_tax}.",
                f"Set the group's VAT amount to {expected_tax}, or correct its taxable amount or rate.",
                reference="BR-S-09",
            )
        if category in ZERO_RATE_CATEGORIES and rate != 0:
            report(
                "INV-025",
                f"{label} must carry a zero rate for category {category}.",
                f"Set the rate to 0 for category {category}.",
                reference="BR-E/Z/AE/K/G/O",
            )
        if category in REASON_CATEGORIES and not _text(entry.get("exemption_reason")):
            report(
                "INV-029",
                f"{label} gives no exemption reason.",
                "State the exemption reason or its code — receivers enforcing "
                "a national profile reject an untaxed group without one.",
                severity=WARNING,
                reference="BT-120 / BT-121",
            )

    if tax_total is not None and _round(breakdown_tax) != tax_total:
        report(
            "INV-022",
            f"The VAT breakdown sums to {_round(breakdown_tax)} but the invoice states a VAT total of {tax_total}.",
            f"Set the VAT total to {_round(breakdown_tax)} or correct the breakdown groups.",
            reference="BR-CO-14",
        )

    if groups is None:
        return
    for key in sorted(set(groups) | set(stated_by_key), key=lambda item: (item[0], item[1])):
        category, rate = key
        expected = _round(groups.get(key, Decimal("0")))
        stated = stated_by_key.get(key)
        label = f"VAT group {category} at {rate}%"
        if stated is None:
            report(
                "INV-023",
                f"Lines totalling {expected} use {category} at {rate}% but there is no matching VAT breakdown group.",
                f"Add a VAT breakdown group for {category} at {rate}% with a taxable amount of {expected}.",
                reference="BR-S-08",
            )
        elif stated != expected:
            report(
                "INV-023",
                f"{label} states a taxable amount of {stated}, but the lines and document-level adjustments in that group total {expected}.",
                f"Set the group's taxable amount to {expected}, or correct the lines assigned to it.",
                reference="BR-S-08",
            )


# --------------------------------------------------------------------------
# payment
# --------------------------------------------------------------------------


def _check_payment(invoice: dict[str, Any], report: Any, structured: bool) -> None:
    if not structured:
        return
    payment = invoice.get("payment")
    payment = payment if isinstance(payment, dict) else {}
    means_code = _text(payment.get("means_code"))
    if means_code in CREDIT_TRANSFER_CODES and not _text(payment.get("account")):
        report(
            "INV-033",
            f"Payment means {means_code} is a credit transfer but no account identifier is given.",
            "Add the payee account (IBAN or proprietary account ID) so the invoice can actually be paid.",
            severity=WARNING,
            reference="BT-84",
        )
