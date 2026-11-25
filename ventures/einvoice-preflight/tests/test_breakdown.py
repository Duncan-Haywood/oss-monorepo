import contextlib
import io
import json
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path

from einvoice_preflight.breakdown import inspect_tax_breakdown
from einvoice_preflight.checks import check_invoice
from einvoice_preflight.cli import main
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


def _mixed(**overrides):
    invoice = _invoice(
        lines=[
            {"description": "Consulting", "quantity": 2, "unit_price": 100, "tax_percent": 19, "net": 200},
            {"description": "Books", "quantity": 1, "unit_price": 100, "tax_percent": 7, "net": 100},
        ],
        totals={"net": 300, "tax": 45, "gross": 345},
        tax_breakdown=[
            {"tax_percent": 19, "taxable": 200, "tax": 38},
            {"tax_percent": 7, "taxable": 100, "tax": 7},
        ],
    )
    invoice.update(overrides)
    return invoice


UBL_MIXED = b'''<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>INV-MIX</cbc:ID><cbc:IssueDate>2026-08-24</cbc:IssueDate><cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID>S1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Supplier</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID>C1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Customer</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">45</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount>200</cbc:TaxableAmount><cbc:TaxAmount>38</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>19</cbc:Percent></cac:TaxCategory>
    </cac:TaxSubtotal>
    <cac:TaxSubtotal><cbc:TaxableAmount>100</cbc:TaxableAmount><cbc:TaxAmount>7</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>AA</cbc:ID><cbc:Percent>7</cbc:Percent></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:InvoiceLine><cbc:InvoicedQuantity>2</cbc:InvoicedQuantity><cbc:LineExtensionAmount>200</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Consulting</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>19</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount>100</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
  <cac:InvoiceLine><cbc:InvoicedQuantity>1</cbc:InvoicedQuantity><cbc:LineExtensionAmount>100</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Books</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>AA</cbc:ID><cbc:Percent>7</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount>100</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>300</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>345</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal>
</Invoice>'''


class BreakdownHelpersTest(unittest.TestCase):
    def test_single_rate_without_breakdown_is_ok(self):
        self.assertEqual(inspect_tax_breakdown(_invoice()), [])

    def test_mixed_rates_without_breakdown_is_inv_037(self):
        invoice = _mixed()
        del invoice["tax_breakdown"]
        findings = inspect_tax_breakdown(invoice)
        self.assertEqual([item["rule"] for item in findings], ["INV-037"])
        self.assertEqual(findings[0]["path"], "/tax_breakdown")

    def test_empty_breakdown_on_mixed_rates_is_inv_037(self):
        findings = inspect_tax_breakdown(_mixed(tax_breakdown=[]))
        self.assertEqual([item["rule"] for item in findings], ["INV-037"])

    def test_matching_breakdown_is_ok(self):
        self.assertEqual(inspect_tax_breakdown(_mixed()), [])
        self.assertEqual(check_invoice(_mixed()), [])

    def test_wrong_taxable_is_inv_038(self):
        findings = inspect_tax_breakdown(_mixed(
            tax_breakdown=[
                {"tax_percent": 19, "taxable": 150, "tax": 28.5},
                {"tax_percent": 7, "taxable": 100, "tax": 7},
            ],
        ))
        self.assertTrue(any(item["rule"] == "INV-038" for item in findings))
        self.assertTrue(any(item["path"] == "/tax_breakdown/0/taxable" for item in findings))

    def test_tax_not_equal_to_rate_is_inv_038(self):
        findings = inspect_tax_breakdown(_mixed(
            tax_breakdown=[
                {"tax_percent": 19, "taxable": 200, "tax": 20},
                {"tax_percent": 7, "taxable": 100, "tax": 7},
            ],
        ))
        self.assertTrue(any(item["path"] == "/tax_breakdown/0/tax" for item in findings))

    def test_missing_rate_row_is_inv_038(self):
        findings = inspect_tax_breakdown(_mixed(
            tax_breakdown=[{"tax_percent": 19, "taxable": 200, "tax": 38}],
        ))
        self.assertTrue(any("missing a row" in item["message"] for item in findings))

    def test_extra_rate_row_is_inv_038(self):
        findings = inspect_tax_breakdown(_mixed(
            tax_breakdown=[
                {"tax_percent": 19, "taxable": 200, "tax": 38},
                {"tax_percent": 7, "taxable": 100, "tax": 7},
                {"tax_percent": 0, "taxable": 50, "tax": 0},
            ],
        ))
        self.assertTrue(any("no line uses" in item["message"] for item in findings))

    def test_zero_row_for_zero_header_charge_is_clean(self):
        findings = inspect_tax_breakdown(_mixed(
            tax_breakdown=[
                {"tax_percent": 19, "taxable": 200, "tax": 38},
                {"tax_percent": 7, "taxable": 100, "tax": 7},
                {"tax_percent": 0, "taxable": 0, "tax": 0},
            ],
        ))
        self.assertEqual([], findings)

    def test_duplicate_rate_is_inv_038(self):
        findings = inspect_tax_breakdown(_mixed(
            tax_breakdown=[
                {"tax_percent": 19, "taxable": 200, "tax": 38},
                {"tax_percent": 19, "taxable": 200, "tax": 38},
                {"tax_percent": 7, "taxable": 100, "tax": 7},
            ],
        ))
        self.assertTrue(any("repeats" in item["message"] for item in findings))

    def test_non_list_breakdown_is_inv_038(self):
        findings = inspect_tax_breakdown(_invoice(tax_breakdown={"tax_percent": 19}))
        self.assertEqual([item["rule"] for item in findings], ["INV-038"])

    def test_single_rate_optional_breakdown_still_checked(self):
        findings = inspect_tax_breakdown(_invoice(
            tax_breakdown=[{"tax_percent": 19, "taxable": 50, "tax": 9.5}],
        ))
        self.assertTrue(any(item["rule"] == "INV-038" for item in findings))

    def test_findings_do_not_echo_line_text(self):
        invoice = _mixed()
        del invoice["tax_breakdown"]
        invoice["lines"][0]["description"] = "SECRET-LINE"
        findings = inspect_tax_breakdown(invoice)
        self.assertFalse(any("SECRET-LINE" in item["message"] or "SECRET-LINE" in item["fix"] for item in findings))

    def test_check_invoice_flags_mixed_without_breakdown(self):
        invoice = _mixed()
        del invoice["tax_breakdown"]
        errors = check_invoice(invoice)
        self.assertTrue(any(item["rule"] == "INV-037" for item in errors))

    def test_ubl_mixed_maps_and_passes(self):
        invoice = parse_ubl_invoice(UBL_MIXED)
        self.assertEqual(len(invoice["tax_breakdown"]), 2)
        self.assertEqual(invoice["tax_breakdown"][0]["tax_percent"], 19)
        self.assertEqual(invoice["tax_breakdown"][1]["tax_percent"], 7)
        self.assertEqual(invoice["tax_breakdown"][0]["tax_category"], "S")
        self.assertEqual(check_invoice(invoice), [])

    def test_ubl_mixed_without_subtotals_is_inv_037(self):
        source = UBL_MIXED.replace(
            b"<cac:TaxSubtotal><cbc:TaxableAmount>200</cbc:TaxableAmount><cbc:TaxAmount>38</cbc:TaxAmount>\n"
            b"      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>19</cbc:Percent></cac:TaxCategory>\n"
            b"    </cac:TaxSubtotal>\n"
            b"    <cac:TaxSubtotal><cbc:TaxableAmount>100</cbc:TaxableAmount><cbc:TaxAmount>7</cbc:TaxAmount>\n"
            b"      <cac:TaxCategory><cbc:ID>AA</cbc:ID><cbc:Percent>7</cbc:Percent></cac:TaxCategory>\n"
            b"    </cac:TaxSubtotal>\n",
            b"",
        )
        invoice = parse_ubl_invoice(source)
        self.assertNotIn("tax_breakdown", invoice)
        errors = check_invoice(invoice)
        self.assertTrue(any(item["rule"] == "INV-037" for item in errors))

    def test_cli_does_not_print_line_text(self):
        invoice = _mixed()
        del invoice["tax_breakdown"]
        invoice["lines"][0]["description"] = "SECRET-LINE"
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "mixed.json"
            path.write_text(json.dumps(invoice))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(path), "--format", "checklist"]), 1)
            checklist = output.getvalue()
            self.assertIn("INV-037", checklist)
            self.assertNotIn("SECRET-LINE", checklist)

            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(path), "--format", "json"]), 1)
            report = output.getvalue()
            self.assertIn("INV-037", report)
            self.assertNotIn("SECRET-LINE", report)


def _rounded_per_line(row_tax, total_tax=None):
    total_tax = row_tax if total_tax is None else total_tax
    return {
        "invoice_number": "INV-1", "issue_date": "2026-08-24", "currency": "EUR",
        "supplier": {"id": "S1", "name": "S"}, "customer": {"id": "C1", "name": "C"},
        "lines": [{"description": f"L{i}", "quantity": 1, "unit_price": "10.07", "tax_percent": 19, "net": "10.07"} for i in range(3)],
        "tax_breakdown": [{"tax_percent": 19, "taxable": "30.21", "tax": str(row_tax)}],
        "totals": {"net": "30.21", "tax": str(total_tax), "gross": str(Decimal("30.21") + Decimal(str(total_tax)))},
    }


class BrCo17ToleranceTest(unittest.TestCase):
    def test_within_one_unit_passes_as_cen_does(self):
        # Per-line rounding: 3 x 1.91 = 5.73 against 30.21 x 19% = 5.74 (breakdown.mjs warns; the CLI is silent).
        from einvoice_preflight.checks import check_invoice
        assert check_invoice(_rounded_per_line("5.73")) == []
        assert check_invoice(_rounded_per_line("6.73")) == []
        assert sorted(f["rule"] for f in check_invoice(_rounded_per_line("6.74"))) == ["INV-018", "INV-038"]
        assert [f["rule"] for f in check_invoice(_rounded_per_line("5.73", "5.72"))] == ["INV-018"]


    def test_tolerance_edges(self):
        from einvoice_preflight.breakdown import br_co_17_tolerated
        D = Decimal
        assert br_co_17_tolerated(D("-5.73"), D("5.74"), D("19")) is False
        assert br_co_17_tolerated(D("0.30"), D("0.00"), D("0")) is True
        assert br_co_17_tolerated(D("0.50"), D("0.00"), D("0")) is False


if __name__ == "__main__":
    unittest.main()
