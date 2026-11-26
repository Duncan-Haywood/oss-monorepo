import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from einvoice_preflight.checks import check_invoice
from einvoice_preflight.cli import main
from einvoice_preflight.reference import (
    inspect_commercial_references,
    looks_like_placeholder,
    normalize_reference,
)
from einvoice_preflight.ubl import parse_ubl_invoice


def _invoice(buyer=None, order=None, include_buyer=False, include_order=False, invoice_number="INV-1"):
    invoice = {
        "invoice_number": invoice_number,
        "issue_date": "2026-08-24",
        "currency": "EUR",
        "supplier": {"id": "S1", "name": "Supplier GmbH"},
        "customer": {"id": "C1", "name": "Customer GmbH"},
        "lines": [{"description": "Work", "quantity": 2, "unit_price": 100, "tax_percent": 19, "net": 200}],
        "totals": {"net": 200, "tax": 38, "gross": 238},
    }
    if include_buyer or buyer is not None:
        invoice["buyer_reference"] = buyer
    if include_order or order is not None:
        invoice["order_reference"] = order
    return invoice


UBL_WITH_REFS = b'''<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>INV-XML-R</cbc:ID><cbc:IssueDate>2026-08-24</cbc:IssueDate>
  <cbc:BuyerReference>COST-441</cbc:BuyerReference>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:OrderReference><cbc:ID>PO-9001</cbc:ID></cac:OrderReference>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID>S1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Supplier</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID>C1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Customer</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">38</cbc:TaxAmount></cac:TaxTotal>
  <cac:InvoiceLine><cbc:InvoicedQuantity>2</cbc:InvoicedQuantity><cbc:LineExtensionAmount>200</cbc:LineExtensionAmount><cac:Item><cbc:Name>Work</cbc:Name><cac:ClassifiedTaxCategory><cbc:Percent>19</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount>100</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>200</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>238</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal>
</Invoice>'''


class ReferenceHelpersTest(unittest.TestCase):
    def test_normalize_reference(self):
        self.assertEqual(normalize_reference(" PO-1 "), "PO-1")
        self.assertIsNone(normalize_reference(""))
        self.assertIsNone(normalize_reference("   "))
        self.assertIsNone(normalize_reference(None))
        self.assertIsNone(normalize_reference(12))

    def test_looks_like_placeholder(self):
        self.assertTrue(looks_like_placeholder("N/A"))
        self.assertTrue(looks_like_placeholder("n.a."))
        self.assertTrue(looks_like_placeholder("none"))
        self.assertTrue(looks_like_placeholder("-"))
        self.assertFalse(looks_like_placeholder("PO-9001"))
        self.assertFalse(looks_like_placeholder("COST-441"))


class ReferenceRuleTest(unittest.TestCase):
    def test_omitted_refs_are_not_a_finding(self):
        self.assertEqual(inspect_commercial_references(_invoice()), [])

    def test_real_refs_are_clean(self):
        self.assertEqual(inspect_commercial_references(_invoice(
            buyer="COST-441",
            order="PO-9001",
        )), [])

    def test_empty_buyer_reference_is_inv_047(self):
        findings = inspect_commercial_references(_invoice(buyer="", include_buyer=True))
        self.assertEqual([item["rule"] for item in findings], ["INV-047"])
        self.assertEqual(findings[0]["path"], "/buyer_reference")

    def test_placeholder_buyer_reference_is_inv_047_and_does_not_echo(self):
        findings = inspect_commercial_references(_invoice(buyer="N/A"))
        self.assertEqual([item["rule"] for item in findings], ["INV-047"])
        self.assertNotIn("N/A", findings[0]["message"])
        self.assertNotIn("N/A", findings[0]["fix"])

    def test_empty_order_reference_is_inv_048(self):
        findings = inspect_commercial_references(_invoice(order="", include_order=True))
        self.assertEqual([item["rule"] for item in findings], ["INV-048"])
        self.assertEqual(findings[0]["path"], "/order_reference")

    def test_placeholder_order_reference_is_inv_048_and_does_not_echo(self):
        findings = inspect_commercial_references(_invoice(order="TBD"))
        self.assertEqual([item["rule"] for item in findings], ["INV-048"])
        self.assertNotIn("TBD", findings[0]["message"])

    def test_long_order_reference_is_inv_048(self):
        findings = inspect_commercial_references(_invoice(order="P" * 71))
        self.assertEqual([item["rule"] for item in findings], ["INV-048"])
        self.assertNotIn("P" * 71, findings[0]["message"])

    def test_order_repeating_invoice_number_is_inv_049(self):
        findings = inspect_commercial_references(_invoice(order="inv-1", invoice_number="INV-1"))
        self.assertEqual([item["rule"] for item in findings], ["INV-049"])
        self.assertEqual(findings[0]["path"], "/order_reference")
        self.assertNotIn("INV-1", findings[0]["message"])
        self.assertNotIn("inv-1", findings[0]["fix"])


class ReferenceInvoiceIntegrationTest(unittest.TestCase):
    def test_invoice_without_refs_stays_clean(self):
        self.assertEqual(check_invoice(_invoice()), [])

    def test_good_refs_keep_a_clean_invoice_clean(self):
        self.assertEqual(check_invoice(_invoice(buyer="COST-441", order="PO-9001")), [])

    def test_repeated_invoice_number_fails_preflight(self):
        errors = check_invoice(_invoice(order="INV-1"))
        self.assertTrue(any(item["rule"] == "INV-049" for item in errors))
        self.assertTrue(any(item["path"] == "/order_reference" for item in errors))

    def test_ubl_maps_buyer_and_order_references(self):
        invoice = parse_ubl_invoice(UBL_WITH_REFS)
        self.assertEqual(invoice["buyer_reference"], "COST-441")
        self.assertEqual(invoice["order_reference"], "PO-9001")
        self.assertEqual(check_invoice(invoice), [])

    def test_ubl_order_repeating_invoice_id_is_inv_049(self):
        source = UBL_WITH_REFS.replace(b"<cbc:ID>PO-9001</cbc:ID>", b"<cbc:ID>INV-XML-R</cbc:ID>")
        invoice = parse_ubl_invoice(source)
        self.assertEqual(invoice["order_reference"], "INV-XML-R")
        errors = check_invoice(invoice)
        self.assertTrue(any(item["rule"] == "INV-049" and item["path"] == "/order_reference" for item in errors))
        self.assertFalse(any("INV-XML-R" in item["message"] for item in errors))

    def test_ubl_placeholder_buyer_reference_is_inv_047(self):
        source = UBL_WITH_REFS.replace(b"<cbc:BuyerReference>COST-441</cbc:BuyerReference>", b"<cbc:BuyerReference>none</cbc:BuyerReference>")
        invoice = parse_ubl_invoice(source)
        self.assertEqual(invoice["buyer_reference"], "none")
        errors = check_invoice(invoice)
        self.assertTrue(any(item["rule"] == "INV-047" and item["path"] == "/buyer_reference" for item in errors))
        self.assertFalse(any("none" in item["message"] for item in errors))

    def test_ubl_without_refs_stays_clean(self):
        source = UBL_WITH_REFS.replace(b"  <cbc:BuyerReference>COST-441</cbc:BuyerReference>\n", b"").replace(
            b"  <cac:OrderReference><cbc:ID>PO-9001</cbc:ID></cac:OrderReference>\n",
            b"",
        )
        invoice = parse_ubl_invoice(source)
        self.assertNotIn("buyer_reference", invoice)
        self.assertNotIn("order_reference", invoice)
        self.assertEqual(check_invoice(invoice), [])

    def test_cli_formats_do_not_print_the_reference(self):
        invoice = _invoice(order="XR-4419", invoice_number="XR-4419")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "invoice.json"
            path.write_text(json.dumps(invoice))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(path), "--format", "checklist"]), 1)
            checklist = output.getvalue()
            self.assertIn("INV-049", checklist)
            self.assertNotIn("XR-4419", checklist)

            placeholder = _invoice(buyer="N/A")
            path.write_text(json.dumps(placeholder))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(path), "--format", "json"]), 1)
            report = output.getvalue()
            self.assertIn("INV-047", report)
            self.assertNotIn("N/A", report)


if __name__ == "__main__":
    unittest.main()
