import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from einvoice_preflight.checks import check_invoice
from einvoice_preflight.cli import main
from einvoice_preflight.period import inspect_invoice_period, parse_iso_date
from einvoice_preflight.ubl import parse_ubl_invoice


def _invoice(period=None, include_period=True):
    invoice = {
        "invoice_number": "INV-1",
        "issue_date": "2026-08-24",
        "currency": "EUR",
        "supplier": {"id": "S1", "name": "Supplier GmbH"},
        "customer": {"id": "C1", "name": "Customer GmbH"},
        "lines": [{"description": "Work", "quantity": 2, "unit_price": 100, "tax_percent": 19, "net": 200}],
        "totals": {"net": 200, "tax": 38, "gross": 238},
    }
    if include_period:
        invoice["period"] = period
    return invoice


UBL_WITH_PERIOD = b'''<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>INV-XML-P</cbc:ID><cbc:IssueDate>2026-08-24</cbc:IssueDate><cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:InvoicePeriod><cbc:StartDate>2026-07-01</cbc:StartDate><cbc:EndDate>2026-07-31</cbc:EndDate></cac:InvoicePeriod>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID>S1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Supplier</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID>C1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Customer</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">38</cbc:TaxAmount></cac:TaxTotal>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity>2</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount>200</cbc:LineExtensionAmount>
    <cac:InvoicePeriod><cbc:StartDate>2026-08-01</cbc:StartDate><cbc:EndDate>2026-08-15</cbc:EndDate></cac:InvoicePeriod>
    <cac:Item><cbc:Name>Work</cbc:Name><cac:ClassifiedTaxCategory><cbc:Percent>19</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount>100</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>200</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>238</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal>
</Invoice>'''


class PeriodHelpersTest(unittest.TestCase):
    def test_parse_iso_date_accepts_extended_form(self):
        self.assertEqual(parse_iso_date("2026-07-01").isoformat(), "2026-07-01")
        self.assertIsNone(parse_iso_date("20260701"))
        self.assertIsNone(parse_iso_date("2026-13-01"))
        self.assertIsNone(parse_iso_date("2026-02-30"))
        self.assertIsNone(parse_iso_date(None))


class PeriodRuleTest(unittest.TestCase):
    def test_omitted_period_is_not_a_finding(self):
        self.assertEqual(inspect_invoice_period(_invoice(include_period=False)), [])
        self.assertEqual(inspect_invoice_period(_invoice(None)), [])
        self.assertEqual(inspect_invoice_period(_invoice("")), [])

    def test_complete_period_produces_no_finding(self):
        self.assertEqual(inspect_invoice_period(_invoice({"start": "2026-07-01", "end": "2026-07-31"})), [])
        self.assertEqual(inspect_invoice_period(_invoice({"start": "2026-07-01", "end": "2026-07-01"})), [])

    def test_string_period_is_inv_042(self):
        findings = inspect_invoice_period(_invoice("2026-07-01"))
        self.assertEqual([item["rule"] for item in findings], ["INV-042"])
        self.assertEqual(findings[0]["path"], "/period")

    def test_empty_object_is_inv_042(self):
        findings = inspect_invoice_period(_invoice({}))
        self.assertEqual([item["rule"] for item in findings], ["INV-042"])
        self.assertEqual(findings[0]["path"], "/period")

    def test_missing_start_is_inv_042(self):
        findings = inspect_invoice_period(_invoice({"end": "2026-07-31"}))
        self.assertEqual([item["rule"] for item in findings], ["INV-042"])
        self.assertEqual(findings[0]["path"], "/period/start")

    def test_missing_end_is_inv_042(self):
        findings = inspect_invoice_period(_invoice({"start": "2026-07-01"}))
        self.assertEqual([item["rule"] for item in findings], ["INV-042"])
        self.assertEqual(findings[0]["path"], "/period/end")

    def test_invalid_start_is_inv_042(self):
        findings = inspect_invoice_period(_invoice({"start": "2026-13-01", "end": "2026-07-31"}))
        self.assertEqual([item["rule"] for item in findings], ["INV-042"])
        self.assertEqual(findings[0]["path"], "/period/start")
        self.assertNotIn("2026-13-01", findings[0]["message"])
        self.assertNotIn("2026-13-01", findings[0]["fix"])

    def test_end_before_start_is_inv_043(self):
        findings = inspect_invoice_period(_invoice({"start": "2026-07-31", "end": "2026-07-01"}))
        self.assertEqual([item["rule"] for item in findings], ["INV-043"])
        self.assertEqual(findings[0]["path"], "/period/end")
        self.assertNotIn("2026-07-31", findings[0]["message"])
        self.assertNotIn("2026-07-01", findings[0]["message"])


class PeriodInvoiceIntegrationTest(unittest.TestCase):
    def test_invoice_without_period_stays_clean(self):
        self.assertEqual(check_invoice(_invoice(include_period=False)), [])

    def test_good_period_keeps_a_clean_invoice_clean(self):
        self.assertEqual(check_invoice(_invoice({"start": "2026-07-01", "end": "2026-07-31"})), [])

    def test_reversed_period_fails_preflight(self):
        errors = check_invoice(_invoice({"start": "2026-07-31", "end": "2026-07-01"}))
        self.assertTrue(any(item["rule"] == "INV-043" for item in errors))
        self.assertTrue(any(item["path"] == "/period/end" for item in errors))

    def test_ubl_invoice_period_is_mapped_and_line_period_is_ignored(self):
        invoice = parse_ubl_invoice(UBL_WITH_PERIOD)
        self.assertEqual(invoice["period"], {"start": "2026-07-01", "end": "2026-07-31"})
        self.assertEqual(check_invoice(invoice), [])

    def test_ubl_without_period_stays_clean(self):
        source = UBL_WITH_PERIOD.replace(
            b"<cac:InvoicePeriod><cbc:StartDate>2026-07-01</cbc:StartDate><cbc:EndDate>2026-07-31</cbc:EndDate></cac:InvoicePeriod>",
            b"",
        )
        invoice = parse_ubl_invoice(source)
        self.assertNotIn("period", invoice)
        self.assertEqual(check_invoice(invoice), [])

    def test_ubl_period_missing_end_is_inv_042(self):
        source = UBL_WITH_PERIOD.replace(
            b"<cac:InvoicePeriod><cbc:StartDate>2026-07-01</cbc:StartDate><cbc:EndDate>2026-07-31</cbc:EndDate></cac:InvoicePeriod>",
            b"<cac:InvoicePeriod><cbc:StartDate>2026-07-01</cbc:StartDate></cac:InvoicePeriod>",
        )
        invoice = parse_ubl_invoice(source)
        self.assertEqual(invoice["period"], {"start": "2026-07-01"})
        errors = check_invoice(invoice)
        self.assertTrue(any(item["rule"] == "INV-042" and item["path"] == "/period/end" for item in errors))

    def test_ubl_reversed_period_is_inv_043(self):
        source = UBL_WITH_PERIOD.replace(
            b"<cbc:StartDate>2026-07-01</cbc:StartDate><cbc:EndDate>2026-07-31</cbc:EndDate>",
            b"<cbc:StartDate>2026-07-31</cbc:StartDate><cbc:EndDate>2026-07-01</cbc:EndDate>",
            1,
        )
        invoice = parse_ubl_invoice(source)
        errors = check_invoice(invoice)
        self.assertTrue(any(item["rule"] == "INV-043" and item["path"] == "/period/end" for item in errors))
        self.assertFalse(any("2026-07-31" in item["message"] for item in errors))
        self.assertFalse(any("2026-07-01" in item["message"] for item in errors))

    def test_cli_formats_do_not_print_the_dates(self):
        invoice = _invoice({"start": "2026-07-31", "end": "2026-07-01"})
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "invoice.json"
            path.write_text(json.dumps(invoice))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(path), "--format", "checklist"]), 1)
            checklist = output.getvalue()
            self.assertIn("INV-043", checklist)
            self.assertNotIn("2026-07-31", checklist)
            self.assertNotIn("2026-07-01", checklist)

            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(path), "--format", "json"]), 1)
            report = output.getvalue()
            self.assertIn("INV-043", report)
            self.assertNotIn("2026-07-31", report)
            self.assertNotIn("2026-07-01", report)


if __name__ == "__main__":
    unittest.main()
