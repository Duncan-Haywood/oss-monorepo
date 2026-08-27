import contextlib
import io
import json
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path

from einvoice_preflight.adjustment import (
    header_adjustment_net_delta,
    inspect_header_adjustments,
    normalize_kind,
)
from einvoice_preflight.checks import check_invoice
from einvoice_preflight.cli import main
from einvoice_preflight.ubl import parse_ubl_invoice


def _invoice(adjustments=None, include_adjustments=False, net=200, tax=38, gross=238):
    invoice = {
        "invoice_number": "INV-1",
        "issue_date": "2026-08-24",
        "currency": "EUR",
        "supplier": {"id": "S1", "name": "Supplier GmbH"},
        "customer": {"id": "C1", "name": "Customer GmbH"},
        "lines": [{"description": "Work", "quantity": 2, "unit_price": 100, "tax_percent": 19, "net": 200}],
        "totals": {"net": net, "tax": tax, "gross": gross},
    }
    if include_adjustments or adjustments is not None:
        invoice["adjustments"] = adjustments
    return invoice


def _row(**overrides):
    row = {
        "kind": "allowance",
        "amount": 20,
        "base": 200,
        "percent": 10,
        "reason": "Early payment discount",
    }
    row.update(overrides)
    return row


UBL_WITH_ALLOWANCE = b'''<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>INV-XML-A</cbc:ID><cbc:IssueDate>2026-08-24</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID>S1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Supplier</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID>C1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Customer</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
  <cac:AllowanceCharge>
    <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
    <cbc:AllowanceChargeReason>Early payment discount</cbc:AllowanceChargeReason>
    <cbc:MultiplierFactorNumeric>10</cbc:MultiplierFactorNumeric>
    <cbc:Amount currencyID="EUR">20.00</cbc:Amount>
    <cbc:BaseAmount currencyID="EUR">200.00</cbc:BaseAmount>
  </cac:AllowanceCharge>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">38</cbc:TaxAmount></cac:TaxTotal>
  <cac:InvoiceLine><cbc:InvoicedQuantity>2</cbc:InvoicedQuantity><cbc:LineExtensionAmount>200</cbc:LineExtensionAmount><cac:Item><cbc:Name>Work</cbc:Name><cac:ClassifiedTaxCategory><cbc:Percent>19</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount>100</cbc:PriceAmount></cac:Price>
    <cac:AllowanceCharge><cbc:ChargeIndicator>true</cbc:ChargeIndicator><cbc:Amount currencyID="EUR">5.00</cbc:Amount><cbc:AllowanceChargeReason>Line packing</cbc:AllowanceChargeReason></cac:AllowanceCharge>
  </cac:InvoiceLine>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>180</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>218</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal>
</Invoice>'''


class AdjustmentHelpersTest(unittest.TestCase):
    def test_normalize_kind(self):
        self.assertEqual(normalize_kind("allowance"), "allowance")
        self.assertEqual(normalize_kind("Discount"), "allowance")
        self.assertEqual(normalize_kind("charge"), "charge")
        self.assertEqual(normalize_kind(False), "allowance")
        self.assertEqual(normalize_kind(True), "charge")
        self.assertIsNone(normalize_kind("fee"))
        self.assertIsNone(normalize_kind(""))

    def test_net_delta_subtracts_allowances_and_adds_charges(self):
        invoice = _invoice([_row(), _row(kind="charge", amount=5, percent=None, base=None, reason="Packing")])
        self.assertEqual(header_adjustment_net_delta(invoice), Decimal("-15.00"))


class AdjustmentRuleTest(unittest.TestCase):
    def test_omitted_adjustments_are_not_a_finding(self):
        self.assertEqual(inspect_header_adjustments(_invoice()), [])

    def test_real_allowance_is_clean(self):
        self.assertEqual(inspect_header_adjustments(_invoice([_row()])), [])

    def test_empty_list_is_clean(self):
        self.assertEqual(inspect_header_adjustments(_invoice([])), [])

    def test_missing_amount_is_inv_050(self):
        findings = inspect_header_adjustments(_invoice([_row(amount="")]))
        self.assertEqual([item["rule"] for item in findings], ["INV-050"])
        self.assertEqual(findings[0]["path"], "/adjustments/0/amount")

    def test_unknown_kind_is_inv_050_and_does_not_echo(self):
        findings = inspect_header_adjustments(_invoice([_row(kind="fee-X99")]))
        self.assertEqual([item["rule"] for item in findings], ["INV-050"])
        self.assertNotIn("fee-X99", findings[0]["message"])
        self.assertNotIn("fee-X99", findings[0]["fix"])

    def test_percent_mismatch_is_inv_051(self):
        findings = inspect_header_adjustments(_invoice([_row(amount=15)]))
        self.assertEqual([item["rule"] for item in findings], ["INV-051"])
        self.assertEqual(findings[0]["path"], "/adjustments/0/amount")
        self.assertIn("20.00", findings[0]["fix"])
        self.assertNotIn("15", findings[0]["message"])

    def test_missing_reason_is_inv_052(self):
        findings = inspect_header_adjustments(_invoice([{"kind": "allowance", "amount": 20}]))
        self.assertEqual([item["rule"] for item in findings], ["INV-052"])
        self.assertEqual(findings[0]["path"], "/adjustments/0/reason")

    def test_placeholder_reason_is_inv_052_and_does_not_echo(self):
        findings = inspect_header_adjustments(_invoice([_row(reason="N/A")]))
        self.assertEqual([item["rule"] for item in findings], ["INV-052"])
        self.assertNotIn("N/A", findings[0]["message"])
        self.assertNotIn("N/A", findings[0]["fix"])


class AdjustmentInvoiceIntegrationTest(unittest.TestCase):
    def test_invoice_without_adjustments_stays_clean(self):
        self.assertEqual(check_invoice(_invoice()), [])

    def test_good_allowance_keeps_a_clean_invoice_clean(self):
        self.assertEqual(check_invoice(_invoice([_row()], net=180, tax=38, gross=218)), [])

    def test_forgotten_net_reduction_is_inv_014(self):
        errors = check_invoice(_invoice([_row()]))
        self.assertTrue(any(item["rule"] == "INV-014" for item in errors))
        self.assertTrue(any("after header allowances" in item["message"] for item in errors))

    def test_percent_mismatch_fails_preflight(self):
        errors = check_invoice(_invoice([_row(amount=15)], net=185, tax=38, gross=223))
        self.assertTrue(any(item["rule"] == "INV-051" for item in errors))

    def test_ubl_maps_invoice_level_allowance_and_ignores_line_charge(self):
        invoice = parse_ubl_invoice(UBL_WITH_ALLOWANCE)
        self.assertEqual(invoice["adjustments"], [{
            "kind": "allowance",
            "amount": 20,
            "base": 200,
            "percent": 10,
            "reason": "Early payment discount",
        }])
        self.assertEqual(check_invoice(invoice), [])

    def test_ubl_percent_mismatch_is_inv_051(self):
        source = UBL_WITH_ALLOWANCE.replace(b">20.00<", b">15.00<")
        invoice = parse_ubl_invoice(source)
        errors = check_invoice(invoice)
        self.assertTrue(any(item["rule"] == "INV-051" and item["path"] == "/adjustments/0/amount" for item in errors))
        self.assertFalse(any("15" in item["message"] for item in errors))

    def test_ubl_placeholder_reason_is_inv_052(self):
        source = UBL_WITH_ALLOWANCE.replace(b"Early payment discount", b"none")
        invoice = parse_ubl_invoice(source)
        errors = check_invoice(invoice)
        self.assertTrue(any(item["rule"] == "INV-052" and item["path"] == "/adjustments/0/reason" for item in errors))
        self.assertFalse(any("none" in item["message"] for item in errors))

    def test_ubl_without_header_allowance_stays_clean(self):
        source = UBL_WITH_ALLOWANCE.replace(
            b"""  <cac:AllowanceCharge>
    <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
    <cbc:AllowanceChargeReason>Early payment discount</cbc:AllowanceChargeReason>
    <cbc:MultiplierFactorNumeric>10</cbc:MultiplierFactorNumeric>
    <cbc:Amount currencyID="EUR">20.00</cbc:Amount>
    <cbc:BaseAmount currencyID="EUR">200.00</cbc:BaseAmount>
  </cac:AllowanceCharge>
""",
            b"",
        ).replace(b"<cbc:TaxExclusiveAmount>180</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>218</cbc:TaxInclusiveAmount>", b"<cbc:TaxExclusiveAmount>200</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>238</cbc:TaxInclusiveAmount>")
        invoice = parse_ubl_invoice(source)
        self.assertNotIn("adjustments", invoice)
        self.assertEqual(check_invoice(invoice), [])

    def test_cli_formats_do_not_print_the_reason_or_amount(self):
        invoice = _invoice([_row(reason="SECRET-DISC", amount=15)], net=185, tax=38, gross=223)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "invoice.json"
            path.write_text(json.dumps(invoice))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(path), "--format", "checklist"]), 1)
            checklist = output.getvalue()
            self.assertIn("INV-051", checklist)
            self.assertNotIn("SECRET-DISC", checklist)

            placeholder = _invoice([_row(reason="N/A")], net=180, tax=38, gross=218)
            path.write_text(json.dumps(placeholder))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(path), "--format", "json"]), 1)
            report = output.getvalue()
            self.assertIn("INV-052", report)
            self.assertNotIn("N/A", report)


if __name__ == "__main__":
    unittest.main()
