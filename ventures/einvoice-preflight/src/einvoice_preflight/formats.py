"""Read the e-invoice files an ERP actually emits into one internal shape.

The v0 JSON shape this project started with is convenient but hypothetical: a
bookkeeper does not have it. What lands in their outbox is either a UBL 2.1
``Invoice``/``CreditNote`` (Peppol BIS Billing 3.0, XRechnung UBL) or a
UN/CEFACT ``CrossIndustryInvoice`` (XRechnung CII, the XML inside a Factur-X /
ZUGFeRD PDF). Both express EN 16931 semantics, and both spell every term
differently.

This module normalises either syntax -- plus the original JSON -- into a single
dictionary that :mod:`einvoice_preflight.checks` reads, so a rule is written
once instead of once per syntax. Nothing here validates against a schema or an
official Schematron: it extracts the document facts, and the checks then look
for defects. That distinction is the project's safety boundary, so parsing is
deliberately lenient -- a field this module cannot find comes back missing and
becomes a check finding, never a parse crash.

Amounts are carried as strings exactly as written in the file. Converting them
to float here would introduce the rounding error the arithmetic checks exist to
detect, so the decimal conversion happens once, in the checks.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any
from xml.etree import ElementTree

from .facturx import EmbeddedInvoiceError, extract_embedded_invoice_xml, looks_like_pdf

__all__ = [
    "DocumentError",
    "detect_syntax",
    "load_document",
    "parse_bytes",
    "parse_cii_invoice",
    "to_checker_invoice",
]

# A preflight tool is pointed at files from outside the operator's control, so
# parsing is bounded before it starts. 16 MiB is far above any real invoice
# (a large one with 1000 lines is well under 2 MiB) and far below a size that
# could exhaust memory.
MAX_BYTES = 16 * 1024 * 1024

UBL_INVOICE_NS = "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
UBL_CREDIT_NOTE_NS = "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"
CAC = "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
CBC = "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
RSM = "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
RAM = "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
UDT = "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"


class DocumentError(Exception):
    """The file could not be read as an invoice at all.

    Distinct from a check finding: a finding says "this invoice has a defect",
    while this says "there is no invoice here to check".
    """


def _reject_doctype(data: bytes) -> None:
    """Refuse a document type declaration before handing bytes to the parser.

    Python's ElementTree does not resolve external entities and raises on
    undefined ones, so an XXE read is already out of reach. Refusing the
    declaration outright also rules out entity-expansion blowups and keeps the
    guarantee simple enough to state in the README: this tool opens no
    reference an invoice points at, local or remote.
    """
    prologue = data[:4096].lstrip()
    if re.match(rb"<\?xml[^>]*\?>\s*", prologue):
        prologue = re.sub(rb"^<\?xml[^>]*\?>\s*", b"", prologue)
    while prologue.startswith(b"<!--"):
        end = prologue.find(b"-->")
        if end == -1:
            break
        prologue = prologue[end + 3 :].lstrip()
    if prologue.upper().startswith(b"<!DOCTYPE"):
        raise DocumentError(
            "The file carries a document type declaration. This tool does not "
            "process DTDs or entity references; export the invoice without one."
        )


def detect_syntax(data: bytes) -> str:
    """Return ``"ubl"``, ``"cii"`` or ``"json"`` for the raw file bytes.

    Detection reads the content rather than the file extension, because
    ``.xml`` covers both XML syntaxes and an ERP export is as likely to be
    named ``invoice.txt`` as anything else.
    """
    head = data.lstrip()[:2048]
    if head.startswith(b"{"):
        return "json"
    if UBL_INVOICE_NS.encode() in head or UBL_CREDIT_NOTE_NS.encode() in head:
        return "ubl"
    if RSM.encode() in head:
        return "cii"
    if head.startswith(b"<"):
        raise DocumentError(
            "This is XML, but not a UBL Invoice/CreditNote or a UN/CEFACT "
            "CrossIndustryInvoice. Check that the file is the e-invoice XML "
            "itself and not a wrapper or a transport envelope."
        )
    raise DocumentError("The file is neither JSON nor recognised e-invoice XML.")


def load_document(path: Path | str) -> tuple[dict[str, Any], str]:
    """Read one invoice file. Returns ``(document, syntax)``."""
    path = Path(path)
    try:
        size = path.stat().st_size
    except OSError as exc:  # pragma: no cover - surfaced identically by read
        raise DocumentError(str(exc)) from exc
    if size > MAX_BYTES:
        raise DocumentError(
            f"The file is {size} bytes, above this tool's {MAX_BYTES}-byte limit."
        )
    try:
        data = path.read_bytes()
    except OSError as exc:
        raise DocumentError(str(exc)) from exc
    return parse_bytes(data)


def parse_bytes(data: bytes) -> tuple[dict[str, Any], str]:
    """Parse raw invoice bytes into ``(document, syntax)``."""
    if len(data) > MAX_BYTES:
        raise DocumentError(
            f"The input is {len(data)} bytes, above this tool's {MAX_BYTES}-byte limit."
        )
    if looks_like_pdf(data):
        try:
            data = extract_embedded_invoice_xml(data)
        except EmbeddedInvoiceError as exc:
            raise DocumentError(str(exc)) from exc
    syntax = detect_syntax(data)
    if syntax == "json":
        try:
            document = json.loads(data)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise DocumentError(f"The file is not valid JSON: {exc}") from exc
        return document, syntax
    _reject_doctype(data)
    try:
        root = ElementTree.fromstring(data)
    except ElementTree.ParseError as exc:
        raise DocumentError(f"The XML is not well formed: {exc}") from exc
    return (_parse_ubl(root) if syntax == "ubl" else _parse_cii(root)), syntax


# --------------------------------------------------------------------------
# shared helpers
# --------------------------------------------------------------------------


def _text(node: Any, *path: str) -> str | None:
    """Follow a namespaced element path and return stripped text, or None.

    Every extraction goes through this so that a missing branch anywhere in the
    path yields ``None`` -- which the checks report as a missing field -- rather
    than an ``AttributeError`` in the middle of a preflight run.
    """
    current = node
    for step in path:
        if current is None:
            return None
        current = current.find(step)
    if current is None or current.text is None:
        return None
    stripped = current.text.strip()
    return stripped or None


def _attr(node: Any, path: str, name: str) -> str | None:
    found = None if node is None else node.find(path)
    return None if found is None else found.get(name)


def _party(name: str | None, identifier: str | None, vat_id: str | None, country: str | None) -> dict[str, Any]:
    # `id` keeps the v0 JSON field name so one rule covers both inputs. An
    # e-invoice has several candidate identifiers (endpoint, legal
    # registration, VAT number); the callers pass them in preference order and
    # the first present one wins, because the check only asks whether the party
    # is identified at all.
    return {"id": identifier, "name": name, "vat_id": vat_id, "country": country}


def _first(*values: str | None) -> str | None:
    for value in values:
        if value:
            return value
    return None


def _iso_date(value: str | None) -> str | None:
    """Normalise a CII ``format="102"`` date (``YYYYMMDD``) to ``YYYY-MM-DD``.

    UBL already writes ISO dates. Normalising here means the date check does
    not need to know which syntax it is looking at.
    """
    if value and len(value) == 8 and value.isdigit():
        return f"{value[0:4]}-{value[4:6]}-{value[6:8]}"
    return value


# --------------------------------------------------------------------------
# UBL 2.1 (Peppol BIS Billing 3.0, XRechnung UBL)
# --------------------------------------------------------------------------


def _parse_ubl(root: Any) -> dict[str, Any]:
    is_credit_note = root.tag == f"{{{UBL_CREDIT_NOTE_NS}}}CreditNote"
    line_tag = f"{{{CAC}}}CreditNoteLine" if is_credit_note else f"{{{CAC}}}InvoiceLine"
    quantity_tag = f"{{{CBC}}}CreditedQuantity" if is_credit_note else f"{{{CBC}}}InvoicedQuantity"

    document: dict[str, Any] = {
        "syntax": "ubl",
        "profile": _text(root, f"{{{CBC}}}CustomizationID"),
        "document_type": "credit_note" if is_credit_note else "invoice",
        "type_code": _text(root, f"{{{CBC}}}InvoiceTypeCode") or _text(root, f"{{{CBC}}}CreditNoteTypeCode"),
        "invoice_number": _text(root, f"{{{CBC}}}ID"),
        "issue_date": _text(root, f"{{{CBC}}}IssueDate"),
        "due_date": _text(root, f"{{{CBC}}}DueDate"),
        "currency": _text(root, f"{{{CBC}}}DocumentCurrencyCode"),
        "buyer_reference": _text(root, f"{{{CBC}}}BuyerReference"),
    }

    for key, wrapper in (("supplier", "AccountingSupplierParty"), ("customer", "AccountingCustomerParty")):
        party = root.find(f"{{{CAC}}}{wrapper}/{{{CAC}}}Party")
        document[key] = _party(
            name=_first(
                _text(party, f"{{{CAC}}}PartyName", f"{{{CBC}}}Name"),
                _text(party, f"{{{CAC}}}PartyLegalEntity", f"{{{CBC}}}RegistrationName"),
            ),
            identifier=_first(
                _text(party, f"{{{CAC}}}PartyIdentification", f"{{{CBC}}}ID"),
                _text(party, f"{{{CBC}}}EndpointID"),
                _text(party, f"{{{CAC}}}PartyLegalEntity", f"{{{CBC}}}CompanyID"),
                _text(party, f"{{{CAC}}}PartyTaxScheme", f"{{{CBC}}}CompanyID"),
            ),
            vat_id=_ubl_vat_id(party),
            country=_text(party, f"{{{CAC}}}PostalAddress", f"{{{CAC}}}Country", f"{{{CBC}}}IdentificationCode"),
        )

    document["lines"] = [_parse_ubl_line(line, quantity_tag) for line in root.findall(line_tag)]
    document["allowances"], document["charges"] = _parse_ubl_allowance_charges(root)
    document["vat_breakdown"] = _parse_ubl_vat_breakdown(root)
    document["totals"] = _parse_ubl_totals(root)
    document["payment"] = _parse_ubl_payment(root)
    return document


def _ubl_vat_id(party: Any) -> str | None:
    # A party can register several tax schemes; only the VAT one carries BT-31.
    if party is None:
        return None
    for scheme in party.findall(f"{{{CAC}}}PartyTaxScheme"):
        scheme_id = _text(scheme, f"{{{CAC}}}TaxScheme", f"{{{CBC}}}ID")
        if scheme_id and scheme_id.upper() == "VAT":
            return _text(scheme, f"{{{CBC}}}CompanyID")
    return None


def _parse_ubl_line(line: Any, quantity_tag: str) -> dict[str, Any]:
    category = line.find(f"{{{CAC}}}Item/{{{CAC}}}ClassifiedTaxCategory")
    price = _text(line, f"{{{CAC}}}Price", f"{{{CBC}}}PriceAmount")
    base_quantity = _text(line, f"{{{CAC}}}Price", f"{{{CBC}}}BaseQuantity")
    return {
        "id": _text(line, f"{{{CBC}}}ID"),
        "description": _first(
            _text(line, f"{{{CAC}}}Item", f"{{{CBC}}}Name"),
            _text(line, f"{{{CAC}}}Item", f"{{{CBC}}}Description"),
        ),
        "quantity": _text(line, quantity_tag),
        "unit_code": _attr(line, quantity_tag, "unitCode"),
        "unit_price": price,
        # BT-149: a price stated per 10 or per 1000 units. Left as written and
        # divided by the checks, which do the arithmetic in decimal.
        "base_quantity": base_quantity,
        "net": _text(line, f"{{{CBC}}}LineExtensionAmount"),
        "tax_category": _text(category, f"{{{CBC}}}ID"),
        "tax_percent": _text(category, f"{{{CBC}}}Percent"),
        # A line may carry its own discounts and surcharges (BG-27/BG-28).
        # Without them the "net equals quantity times price" check would
        # report a defect on every correctly discounted line.
        "allowances": _line_allowance_charges(line, f"{{{CAC}}}AllowanceCharge", f"{{{CBC}}}ChargeIndicator", f"{{{CBC}}}Amount", False),
        "charges": _line_allowance_charges(line, f"{{{CAC}}}AllowanceCharge", f"{{{CBC}}}ChargeIndicator", f"{{{CBC}}}Amount", True),
    }


def _line_allowance_charges(
    parent: Any, tag: str, indicator_path: str, amount_path: str, want_charge: bool
) -> list[str]:
    """Collect a line's own allowance (or charge) amounts, as written."""
    amounts: list[str] = []
    if parent is None:
        return amounts
    for node in parent.findall(tag):
        indicator = node.find(indicator_path)
        # CII wraps the boolean one level deeper than UBL does.
        text = None
        if indicator is not None:
            text = (indicator.text or "").strip() or _text(indicator, f"{{{UDT}}}Indicator")
        if ((text or "").lower() == "true") != want_charge:
            continue
        amount = _text(node, amount_path)
        if amount is not None:
            amounts.append(amount)
    return amounts


def _parse_ubl_allowance_charges(root: Any) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    allowances: list[dict[str, Any]] = []
    charges: list[dict[str, Any]] = []
    for node in root.findall(f"{{{CAC}}}AllowanceCharge"):
        category = node.find(f"{{{CAC}}}TaxCategory")
        entry = {
            "amount": _text(node, f"{{{CBC}}}Amount"),
            "reason": _first(
                _text(node, f"{{{CBC}}}AllowanceChargeReason"),
                _text(node, f"{{{CBC}}}AllowanceChargeReasonCode"),
            ),
            "tax_category": _text(category, f"{{{CBC}}}ID"),
            "tax_percent": _text(category, f"{{{CBC}}}Percent"),
        }
        indicator = (_text(node, f"{{{CBC}}}ChargeIndicator") or "").lower()
        (charges if indicator == "true" else allowances).append(entry)
    return allowances, charges


def _parse_ubl_vat_breakdown(root: Any) -> list[dict[str, Any]]:
    breakdown: list[dict[str, Any]] = []
    for total in root.findall(f"{{{CAC}}}TaxTotal"):
        for subtotal in total.findall(f"{{{CAC}}}TaxSubtotal"):
            category = subtotal.find(f"{{{CAC}}}TaxCategory")
            breakdown.append(
                {
                    "taxable_amount": _text(subtotal, f"{{{CBC}}}TaxableAmount"),
                    "tax_amount": _text(subtotal, f"{{{CBC}}}TaxAmount"),
                    "tax_category": _text(category, f"{{{CBC}}}ID"),
                    "tax_percent": _text(category, f"{{{CBC}}}Percent"),
                    "exemption_reason": _first(
                        _text(category, f"{{{CBC}}}TaxExemptionReason"),
                        _text(category, f"{{{CBC}}}TaxExemptionReasonCode"),
                    ),
                }
            )
    return breakdown


def _parse_ubl_totals(root: Any) -> dict[str, Any]:
    monetary = root.find(f"{{{CAC}}}LegalMonetaryTotal")
    # BT-110 sits on the *document-level* TaxTotal, the one without a
    # currency-converted duplicate; taking the first is what receivers do.
    tax_total = root.find(f"{{{CAC}}}TaxTotal")
    return {
        "net": _text(monetary, f"{{{CBC}}}LineExtensionAmount"),
        "taxable": _text(monetary, f"{{{CBC}}}TaxExclusiveAmount"),
        "tax": _text(tax_total, f"{{{CBC}}}TaxAmount"),
        "gross": _text(monetary, f"{{{CBC}}}TaxInclusiveAmount"),
        "allowance_total": _text(monetary, f"{{{CBC}}}AllowanceTotalAmount"),
        "charge_total": _text(monetary, f"{{{CBC}}}ChargeTotalAmount"),
        "prepaid": _text(monetary, f"{{{CBC}}}PrepaidAmount"),
        "rounding": _text(monetary, f"{{{CBC}}}PayableRoundingAmount"),
        "payable": _text(monetary, f"{{{CBC}}}PayableAmount"),
    }


def _parse_ubl_payment(root: Any) -> dict[str, Any]:
    means = root.find(f"{{{CAC}}}PaymentMeans")
    return {
        "means_code": _text(means, f"{{{CBC}}}PaymentMeansCode"),
        "account": _text(means, f"{{{CAC}}}PayeeFinancialAccount", f"{{{CBC}}}ID"),
        "terms": _text(root, f"{{{CAC}}}PaymentTerms", f"{{{CBC}}}Note"),
    }


# --------------------------------------------------------------------------
# UN/CEFACT CII (XRechnung CII, Factur-X / ZUGFeRD)
# --------------------------------------------------------------------------


def _parse_cii(root: Any) -> dict[str, Any]:
    header = root.find(f"{{{RSM}}}ExchangedDocument")
    transaction = root.find(f"{{{RSM}}}SupplyChainTradeTransaction")
    agreement = None if transaction is None else transaction.find(f"{{{RAM}}}ApplicableHeaderTradeAgreement")
    settlement = None if transaction is None else transaction.find(f"{{{RAM}}}ApplicableHeaderTradeSettlement")

    type_code = _text(header, f"{{{RAM}}}TypeCode")
    document: dict[str, Any] = {
        "syntax": "cii",
        "profile": _text(
            root, f"{{{RSM}}}ExchangedDocumentContext", f"{{{RAM}}}GuidelineSpecifiedDocumentContextParameter", f"{{{RAM}}}ID"
        ),
        # UNTDID 1001: 381 is a credit note, 380 a commercial invoice.
        "document_type": "credit_note" if type_code == "381" else "invoice",
        "type_code": type_code,
        "invoice_number": _text(header, f"{{{RAM}}}ID"),
        "issue_date": _iso_date(_text(header, f"{{{RAM}}}IssueDateTime", f"{{{UDT}}}DateTimeString")),
        "due_date": _iso_date(
            _text(settlement, f"{{{RAM}}}SpecifiedTradePaymentTerms", f"{{{RAM}}}DueDateDateTime", f"{{{UDT}}}DateTimeString")
        ),
        "currency": _text(settlement, f"{{{RAM}}}InvoiceCurrencyCode"),
        "buyer_reference": _text(agreement, f"{{{RAM}}}BuyerReference"),
    }

    for key, tag in (("supplier", "SellerTradeParty"), ("customer", "BuyerTradeParty")):
        party = None if agreement is None else agreement.find(f"{{{RAM}}}{tag}")
        document[key] = _party(
            name=_text(party, f"{{{RAM}}}Name"),
            identifier=_first(
                _text(party, f"{{{RAM}}}ID"),
                _text(party, f"{{{RAM}}}GlobalID"),
                _text(party, f"{{{RAM}}}SpecifiedLegalOrganization", f"{{{RAM}}}ID"),
                _text(party, f"{{{RAM}}}URIUniversalCommunication", f"{{{RAM}}}URIID"),
                _cii_vat_id(party),
            ),
            vat_id=_cii_vat_id(party),
            country=_text(party, f"{{{RAM}}}PostalTradeAddress", f"{{{RAM}}}CountryID"),
        )

    lines = [] if transaction is None else transaction.findall(f"{{{RAM}}}IncludedSupplyChainTradeLineItem")
    document["lines"] = [_parse_cii_line(line) for line in lines]
    document["allowances"], document["charges"] = _parse_cii_allowance_charges(settlement)
    document["vat_breakdown"] = _parse_cii_vat_breakdown(settlement)
    document["totals"] = _parse_cii_totals(settlement)
    document["payment"] = _parse_cii_payment(settlement)
    return document


def _cii_vat_id(party: Any) -> str | None:
    # schemeID "VA" marks the VAT registration; "FC" is the local tax number.
    if party is None:
        return None
    for registration in party.findall(f"{{{RAM}}}SpecifiedTaxRegistration"):
        identifier = registration.find(f"{{{RAM}}}ID")
        if identifier is not None and (identifier.get("schemeID") or "").upper() == "VA":
            return (identifier.text or "").strip() or None
    return None


def _parse_cii_line(line: Any) -> dict[str, Any]:
    agreement = line.find(f"{{{RAM}}}SpecifiedLineTradeAgreement")
    delivery = line.find(f"{{{RAM}}}SpecifiedLineTradeDelivery")
    settlement = line.find(f"{{{RAM}}}SpecifiedLineTradeSettlement")
    tax = None if settlement is None else settlement.find(f"{{{RAM}}}ApplicableTradeTax")
    price = None if agreement is None else agreement.find(f"{{{RAM}}}NetPriceProductTradePrice")
    return {
        "id": _text(line, f"{{{RAM}}}AssociatedDocumentLineDocument", f"{{{RAM}}}LineID"),
        "description": _first(
            _text(line, f"{{{RAM}}}SpecifiedTradeProduct", f"{{{RAM}}}Name"),
            _text(line, f"{{{RAM}}}SpecifiedTradeProduct", f"{{{RAM}}}Description"),
        ),
        "quantity": _text(delivery, f"{{{RAM}}}BilledQuantity"),
        "unit_code": _attr(delivery, f"{{{RAM}}}BilledQuantity", "unitCode"),
        "unit_price": _text(price, f"{{{RAM}}}ChargeAmount"),
        "base_quantity": _text(price, f"{{{RAM}}}BasisQuantity"),
        "net": _text(
            settlement, f"{{{RAM}}}SpecifiedTradeSettlementLineMonetarySummation", f"{{{RAM}}}LineTotalAmount"
        ),
        "tax_category": _text(tax, f"{{{RAM}}}CategoryCode"),
        "tax_percent": _text(tax, f"{{{RAM}}}RateApplicablePercent"),
        "allowances": _line_allowance_charges(
            settlement, f"{{{RAM}}}SpecifiedTradeAllowanceCharge", f"{{{RAM}}}ChargeIndicator", f"{{{RAM}}}ActualAmount", False
        ),
        "charges": _line_allowance_charges(
            settlement, f"{{{RAM}}}SpecifiedTradeAllowanceCharge", f"{{{RAM}}}ChargeIndicator", f"{{{RAM}}}ActualAmount", True
        ),
    }


def _parse_cii_allowance_charges(settlement: Any) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    allowances: list[dict[str, Any]] = []
    charges: list[dict[str, Any]] = []
    if settlement is None:
        return allowances, charges
    for node in settlement.findall(f"{{{RAM}}}SpecifiedTradeAllowanceCharge"):
        entry = {
            "amount": _text(node, f"{{{RAM}}}ActualAmount"),
            "reason": _first(_text(node, f"{{{RAM}}}Reason"), _text(node, f"{{{RAM}}}ReasonCode")),
            "tax_category": _text(node, f"{{{RAM}}}CategoryTradeTax", f"{{{RAM}}}CategoryCode"),
            "tax_percent": _text(node, f"{{{RAM}}}CategoryTradeTax", f"{{{RAM}}}RateApplicablePercent"),
        }
        indicator = (_text(node, f"{{{RAM}}}ChargeIndicator", f"{{{UDT}}}Indicator") or "").lower()
        (charges if indicator == "true" else allowances).append(entry)
    return allowances, charges


def _parse_cii_vat_breakdown(settlement: Any) -> list[dict[str, Any]]:
    if settlement is None:
        return []
    return [
        {
            "taxable_amount": _text(tax, f"{{{RAM}}}BasisAmount"),
            "tax_amount": _text(tax, f"{{{RAM}}}CalculatedAmount"),
            "tax_category": _text(tax, f"{{{RAM}}}CategoryCode"),
            "tax_percent": _text(tax, f"{{{RAM}}}RateApplicablePercent"),
            "exemption_reason": _first(
                _text(tax, f"{{{RAM}}}ExemptionReason"), _text(tax, f"{{{RAM}}}ExemptionReasonCode")
            ),
        }
        for tax in settlement.findall(f"{{{RAM}}}ApplicableTradeTax")
    ]


def _parse_cii_totals(settlement: Any) -> dict[str, Any]:
    summation = (
        None
        if settlement is None
        else settlement.find(f"{{{RAM}}}SpecifiedTradeSettlementHeaderMonetarySummation")
    )
    return {
        "net": _text(summation, f"{{{RAM}}}LineTotalAmount"),
        "taxable": _text(summation, f"{{{RAM}}}TaxBasisTotalAmount"),
        "tax": _text(summation, f"{{{RAM}}}TaxTotalAmount"),
        "gross": _text(summation, f"{{{RAM}}}GrandTotalAmount"),
        "allowance_total": _text(summation, f"{{{RAM}}}AllowanceTotalAmount"),
        "charge_total": _text(summation, f"{{{RAM}}}ChargeTotalAmount"),
        "prepaid": _text(summation, f"{{{RAM}}}TotalPrepaidAmount"),
        "rounding": _text(summation, f"{{{RAM}}}RoundingAmount"),
        "payable": _text(summation, f"{{{RAM}}}DuePayableAmount"),
    }


def _cii_terms_days(settlement: Any) -> str | None:
    """Map SpecifiedTradePaymentTerms duration in days when unitCode is DAY."""
    if settlement is None:
        return None
    terms = settlement.find(f"{{{RAM}}}SpecifiedTradePaymentTerms")
    if terms is None:
        return None
    period = terms.find(f"{{{RAM}}}SpecifiedPeriod")
    search = period if period is not None else terms
    for measure in search.findall(f"{{{RAM}}}DurationMeasure"):
        unit = (measure.get("unitCode") or "").strip().upper()
        value = (measure.text or "").strip()
        if value and unit in {"DAY", "D"}:
            return value
    return None


def _parse_cii_payment(settlement: Any) -> dict[str, Any]:
    means = None if settlement is None else settlement.find(f"{{{RAM}}}SpecifiedTradeSettlementPaymentMeans")
    payment = {
        "means_code": _text(means, f"{{{RAM}}}TypeCode"),
        "account": _first(
            _text(means, f"{{{RAM}}}PayeePartyCreditorFinancialAccount", f"{{{RAM}}}IBANID"),
            _text(means, f"{{{RAM}}}PayeePartyCreditorFinancialAccount", f"{{{RAM}}}ProprietaryID"),
        ),
        "remittance": _text(settlement, f"{{{RAM}}}PaymentReference"),
        "terms": _text(settlement, f"{{{RAM}}}SpecifiedTradePaymentTerms", f"{{{RAM}}}Description"),
    }
    terms_days = _cii_terms_days(settlement)
    if terms_days:
        payment["terms_days"] = terms_days
    return payment


def to_checker_invoice(document: dict[str, Any]) -> dict[str, Any]:
    """Map a CII (or formats.py) document onto the checker invoice shape.

    Amounts stay strings. The checker converts them once, so this mapping
    must not introduce float rounding.
    """
    breakdown_src = document.get("vat_breakdown") if isinstance(document.get("vat_breakdown"), list) else []
    header_reason = None
    for row in breakdown_src:
        if isinstance(row, dict) and row.get("exemption_reason"):
            header_reason = row["exemption_reason"]
            break

    def party(raw: Any) -> dict[str, Any]:
        source = raw if isinstance(raw, dict) else {}
        mapped: dict[str, Any] = {
            "id": source.get("id") or "",
            "name": source.get("name") or "",
        }
        if source.get("vat_id"):
            mapped["vat_id"] = source["vat_id"]
        return mapped

    lines = []
    for line in document.get("lines") or []:
        if not isinstance(line, dict):
            continue
        mapped_line: dict[str, Any] = {
            "description": line.get("description") or "",
            "quantity": line.get("quantity"),
            "unit_price": line.get("unit_price"),
            "tax_percent": line.get("tax_percent"),
            "net": line.get("net"),
        }
        if line.get("tax_category"):
            mapped_line["tax_category"] = line["tax_category"]
        reason = line.get("tax_reason") or header_reason
        if reason:
            mapped_line["tax_reason"] = reason
        lines.append(mapped_line)

    totals_src = document.get("totals") if isinstance(document.get("totals"), dict) else {}
    invoice: dict[str, Any] = {
        "invoice_number": document.get("invoice_number") or "",
        "issue_date": document.get("issue_date"),
        "currency": document.get("currency"),
        "document_type": document.get("document_type") or "invoice",
        "supplier": party(document.get("supplier")),
        "customer": party(document.get("customer")),
        "lines": lines,
        "totals": {
            "net": totals_src.get("net"),
            "tax": totals_src.get("tax"),
            "gross": totals_src.get("gross"),
        },
    }
    if document.get("due_date"):
        invoice["due_date"] = document["due_date"]
    if document.get("type_code"):
        invoice["document_code"] = document["type_code"]
    if document.get("buyer_reference"):
        invoice["buyer_reference"] = document["buyer_reference"]
    if header_reason:
        invoice["tax_exemption_reason"] = header_reason
    if totals_src.get("prepaid") not in (None, ""):
        invoice["totals"]["prepaid"] = totals_src["prepaid"]
    if totals_src.get("payable") not in (None, ""):
        invoice["totals"]["payable"] = totals_src["payable"]

    rows = []
    for row in breakdown_src:
        if not isinstance(row, dict):
            continue
        mapped_row: dict[str, Any] = {}
        if row.get("tax_percent") not in (None, ""):
            mapped_row["tax_percent"] = row["tax_percent"]
        if row.get("taxable_amount") not in (None, ""):
            mapped_row["taxable"] = row["taxable_amount"]
        if row.get("tax_amount") not in (None, ""):
            mapped_row["tax"] = row["tax_amount"]
        if row.get("tax_category"):
            mapped_row["tax_category"] = row["tax_category"]
        if mapped_row:
            rows.append(mapped_row)
    if rows:
        invoice["tax_breakdown"] = rows

    payment_src = document.get("payment") if isinstance(document.get("payment"), dict) else {}
    payment: dict[str, Any] = {}
    if payment_src.get("account"):
        payment["iban"] = payment_src["account"]
    if payment_src.get("means_code"):
        payment["means_code"] = payment_src["means_code"]
    if payment_src.get("remittance"):
        payment["remittance"] = payment_src["remittance"]
    if payment_src.get("terms_days"):
        payment["terms_days"] = payment_src["terms_days"]
    if payment:
        invoice["payment"] = payment
    return invoice


def parse_cii_invoice(source: bytes | str) -> dict[str, Any]:
    """Read a UN/CEFACT CrossIndustryInvoice into the checker invoice shape."""
    raw = source.encode() if isinstance(source, str) else source
    document, syntax = parse_bytes(raw)
    if syntax != "cii":
        raise DocumentError("The file is not a UN/CEFACT CrossIndustryInvoice.")
    return to_checker_invoice(document)
