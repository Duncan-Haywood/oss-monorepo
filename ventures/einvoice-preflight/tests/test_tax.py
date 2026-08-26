import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from einvoice_preflight.checks import check_invoice
from einvoice_preflight.cli import main
from einvoice_preflight.tax import (
    inspect_tax_exemption,
    looks_like_exemption_category,
    normalize_tax_category,
)
from einvoice_preflight.ubl import parse_ubl_invoice


def _invoice(**overrides):
    invoice = {
        "invoice_number": "INV-1",
        "issue_date": "2026-08-24",
        "currency": "EUR",
        "supplier": {"id": "S1", "name": "Supplier GmbH"},
        "customer": {"id": "C1", "name": "Customer GmbH"},
        "lines": [{"description": "Work", "quantity": 2, "unit_price": 100, "tax_percent": 19, "net": 200}],
        "totals": {"net": 200, "tax": 38, "gross": 238},
    }
    invoice.update(overrides)
    return invoice


def _zero_line(**overrides):
    line = {"description": "Intra-community", "quantity": 1, "unit_price": 200, "tax_percent": 0, "net": 200}
    line.update(overrides)
    return line


UBL_ZERO = b'''<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>INV-ZERO</cbc:ID><cbc:IssueDate>2026-08-24</cbc:IssueDate><cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID>S1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Supplier</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID>C1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Customer</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">0</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount>200</cbc:TaxableAmount><cbc:TaxAmount>0</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>K</cbc:ID><cbc:Percent>0</cbc:Percent>
        <cbc:TaxExemptionReasonCode>VATEX-EU-IC</cbc:TaxExemptionReasonCode>
        <cbc:TaxExemptionReason>Intra-community supply</cbc:TaxExemptionReason>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:InvoiceLine><cbc:InvoicedQuantity>1</cbc:InvoicedQuantity><cbc:LineExtensionAmount>200</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Work</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:ID>K</cbc:ID><cbc:Percent>0</cbc:Percent>
        <cbc:TaxExemptionReasonCode>VATEX-EU-IC</cbc:TaxExemptionReasonCode>
        <cbc:TaxExemptionReason>Intra-community supply</cbc:TaxExemptionReason>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount>200</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>200</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>200</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal>
</Invoice>'''


class TaxHelpersTest(unittest.TestCase):
    def test_normalize_category(self):
        self.assertEqual(normalize_tax_category(" k "), "K")
        self.assertEqual(normalize_tax_category("AE"), "AE")
        self.assertIsNone(normalize_tax_category(""))
        self.assertIsNone(normalize_tax_category(None))

    def test_exemption_categories(self):
        for code in ("E", "AE", "K", "G", "O", "Z", "e"):
            self.assertTrue(looks_like_exemption_category(code), code)
        self.assertFalse(looks_like_exemption_category("S"))
        self.assertFalse(looks_like_exemption_category("H"))
        self.assertFalse(looks_like_exemption_category(""))


class TaxRuleTest(unittest.TestCase):
    def test_taxed_line_needs_no_reason(self):
        self.assertEqual(inspect_tax_exemption(_invoice()), [])

    def test_zero_percent_without_reason_is_inv_035(self):
        findings = inspect_tax_exemption(_invoice(
            lines=[_zero_line()],
            totals={"net": 200, "tax": 0, "gross": 200},
        ))
        self.assertEqual([item["rule"] for item in findings], ["INV-035"])
        self.assertEqual(findings[0]["path"], "/lines/0/tax_reason")
        self.assertNotIn("Intra-community", findings[0]["message"])

    def test_exempt_category_without_reason_is_inv_035(self):
        findings = inspect_tax_exemption(_invoice(
            lines=[_zero_line(tax_percent=0, tax_category="K")],
            totals={"net": 200, "tax": 0, "gross": 200},
        ))
        self.assertEqual([item["rule"] for item in findings], ["INV-035"])

    def test_line_reason_passes(self):
        self.assertEqual(
            inspect_tax_exemption(_invoice(
                lines=[_zero_line(tax_reason="Intra-community supply")],
                totals={"net": 200, "tax": 0, "gross": 200},
            )),
            [],
        )

    def test_line_reason_code_passes(self):
        self.assertEqual(
            inspect_tax_exemption(_invoice(
                lines=[_zero_line(tax_reason_code="VATEX-EU-IC")],
                totals={"net": 200, "tax": 0, "gross": 200},
            )),
            [],
        )

    def test_document_reason_covers_zero_lines(self):
        self.assertEqual(
            inspect_tax_exemption(_invoice(
                tax_exemption_reason="Intra-community supply",
                lines=[_zero_line()],
                totals={"net": 200, "tax": 0, "gross": 200},
            )),
            [],
        )

    def test_empty_reason_is_inv_036_and_does_not_echo(self):
        findings = inspect_tax_exemption(_invoice(
            lines=[_zero_line(tax_reason="   ")],
            totals={"net": 200, "tax": 0, "gross": 200},
        ))
        rules = [item["rule"] for item in findings]
        self.assertIn("INV-036", rules)
        self.assertIn("INV-035", rules)
        self.assertFalse(any("Intra-community" in item["message"] for item in findings))

    def test_empty_document_reason_is_inv_036(self):
        findings = inspect_tax_exemption(_invoice(tax_exemption_reason=""))
        self.assertEqual([item["rule"] for item in findings], ["INV-036"])
        self.assertEqual(findings[0]["path"], "/tax_exemption_reason")


class TaxInvoiceIntegrationTest(unittest.TestCase):
    def test_plain_invoice_stays_clean(self):
        self.assertEqual(check_invoice(_invoice()), [])

    def test_zero_percent_fails_preflight_without_reason(self):
        errors = check_invoice(_invoice(
            lines=[_zero_line()],
            totals={"net": 200, "tax": 0, "gross": 200},
        ))
        self.assertTrue(any(item["rule"] == "INV-035" for item in errors))

    def test_zero_percent_with_reason_stays_clean(self):
        self.assertEqual(
            check_invoice(_invoice(
                lines=[_zero_line(tax_reason="Intra-community supply")],
                totals={"net": 200, "tax": 0, "gross": 200},
            )),
            [],
        )

    def test_ubl_zero_rated_maps_reason(self):
        invoice = parse_ubl_invoice(UBL_ZERO)
        self.assertEqual(invoice["lines"][0]["tax_percent"], 0)
        self.assertEqual(invoice["lines"][0]["tax_category"], "K")
        self.assertEqual(invoice["lines"][0]["tax_reason_code"], "VATEX-EU-IC")
        self.assertEqual(invoice["tax_exemption_reason_code"], "VATEX-EU-IC")
        self.assertEqual(check_invoice(invoice), [])

    def test_ubl_zero_rated_without_reason_is_inv_035(self):
        source = UBL_ZERO.replace(
            b"<cbc:TaxExemptionReasonCode>VATEX-EU-IC</cbc:TaxExemptionReasonCode>",
            b"",
        ).replace(
            b"<cbc:TaxExemptionReason>Intra-community supply</cbc:TaxExemptionReason>",
            b"",
        )
        invoice = parse_ubl_invoice(source)
        self.assertNotIn("tax_reason", invoice["lines"][0])
        errors = check_invoice(invoice)
        self.assertTrue(any(item["rule"] == "INV-035" for item in errors))
        self.assertFalse(any("VATEX" in item["message"] for item in errors))
        self.assertFalse(any("Intra-community" in item["message"] for item in errors))

    def test_cli_does_not_print_the_reason(self):
        invoice = _invoice(
            lines=[_zero_line(tax_reason="")],
            totals={"net": 200, "tax": 0, "gross": 200},
        )
        invoice["lines"][0]["description"] = "SECRET-LINE"
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "zero.json"
            path.write_text(json.dumps(invoice))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(path), "--format", "checklist"]), 1)
            checklist = output.getvalue()
            self.assertIn("INV-035", checklist)
            self.assertIn("INV-036", checklist)
            self.assertNotIn("SECRET-LINE", checklist)

            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(path), "--format", "json"]), 1)
            report = output.getvalue()
            self.assertIn("INV-035", report)
            self.assertNotIn("SECRET-LINE", report)


if __name__ == "__main__":
    unittest.main()
