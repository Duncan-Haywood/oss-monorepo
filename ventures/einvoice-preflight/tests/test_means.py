import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from einvoice_preflight.checks import check_invoice
from einvoice_preflight.cli import main
from einvoice_preflight.means import inspect_payment_means, looks_like_known_means, normalize_means
from einvoice_preflight.ubl import parse_ubl_invoice


def _invoice(payment=None, include_payment=True):
    invoice = {
        "invoice_number": "INV-1",
        "issue_date": "2026-08-24",
        "currency": "EUR",
        "supplier": {"id": "S1", "name": "Supplier GmbH"},
        "customer": {"id": "C1", "name": "Customer GmbH"},
        "lines": [{"description": "Work", "quantity": 2, "unit_price": 100, "tax_percent": 19, "net": 200}],
        "totals": {"net": 200, "tax": 38, "gross": 238},
    }
    if include_payment:
        invoice["payment"] = payment
    return invoice


UBL_WITH_MEANS = b'''<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>INV-XML-M</cbc:ID><cbc:IssueDate>2026-08-24</cbc:IssueDate><cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID>S1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Supplier</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID>C1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Customer</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>
    <cbc:PaymentID>RF18539007547034</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>DE89370400440532013000</cbc:ID>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">38</cbc:TaxAmount></cac:TaxTotal>
  <cac:InvoiceLine><cbc:InvoicedQuantity>2</cbc:InvoicedQuantity><cbc:LineExtensionAmount>200</cbc:LineExtensionAmount><cac:Item><cbc:Name>Work</cbc:Name><cac:ClassifiedTaxCategory><cbc:Percent>19</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount>100</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>200</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>238</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal>
</Invoice>'''


class MeansHelpersTest(unittest.TestCase):
    def test_normalize_means_accepts_int_and_text(self):
        self.assertEqual(normalize_means(30), "30")
        self.assertEqual(normalize_means(" 58 "), "58")
        self.assertIsNone(normalize_means(""))
        self.assertIsNone(normalize_means(None))
        self.assertIsNone(normalize_means(True))
        self.assertIsNone(normalize_means(-1))

    def test_looks_like_known_means(self):
        self.assertTrue(looks_like_known_means("30"))
        self.assertTrue(looks_like_known_means(58))
        self.assertFalse(looks_like_known_means("99"))
        self.assertFalse(looks_like_known_means("030"))


class MeansRuleTest(unittest.TestCase):
    def test_omitted_means_is_not_a_finding(self):
        self.assertEqual(inspect_payment_means(_invoice(include_payment=False)), [])
        self.assertEqual(inspect_payment_means(_invoice({})), [])
        self.assertEqual(inspect_payment_means(_invoice({"iban": "DE89370400440532013000"})), [])

    def test_known_means_with_matching_iban_is_clean(self):
        self.assertEqual(inspect_payment_means(_invoice({
            "means": "58",
            "iban": "DE89370400440532013000",
        })), [])
        self.assertEqual(inspect_payment_means(_invoice({"means": 30, "iban": "DE89370400440532013000"})), [])
        self.assertEqual(inspect_payment_means(_invoice({"means": "10"})), [])

    def test_empty_means_is_inv_044(self):
        findings = inspect_payment_means(_invoice({"means": ""}))
        self.assertEqual([item["rule"] for item in findings], ["INV-044"])
        self.assertEqual(findings[0]["path"], "/payment/means")

    def test_unknown_means_is_inv_044_and_does_not_echo(self):
        findings = inspect_payment_means(_invoice({"means": "99"}))
        self.assertEqual([item["rule"] for item in findings], ["INV-044"])
        self.assertEqual(findings[0]["path"], "/payment/means")
        self.assertNotIn("99", findings[0]["message"])
        self.assertNotIn("99", findings[0]["fix"])

    def test_sepa_without_iban_is_inv_045(self):
        findings = inspect_payment_means(_invoice({"means": "58"}))
        self.assertEqual([item["rule"] for item in findings], ["INV-045"])
        self.assertEqual(findings[0]["path"], "/payment/iban")

    def test_cash_with_iban_is_inv_046(self):
        findings = inspect_payment_means(_invoice({
            "means": "10",
            "iban": "DE89370400440532013000",
        }))
        self.assertEqual([item["rule"] for item in findings], ["INV-046"])
        self.assertEqual(findings[0]["path"], "/payment/means")
        self.assertNotIn("DE89370400440532013000", findings[0]["message"])


class MeansInvoiceIntegrationTest(unittest.TestCase):
    def test_invoice_without_means_stays_clean(self):
        self.assertEqual(check_invoice(_invoice(include_payment=False)), [])

    def test_good_sepa_keeps_a_clean_invoice_clean(self):
        self.assertEqual(check_invoice(_invoice({
            "means": "58",
            "iban": "DE89370400440532013000",
            "remittance": "RF18539007547034",
        })), [])

    def test_sepa_without_iban_fails_preflight(self):
        errors = check_invoice(_invoice({"means": "58"}))
        self.assertTrue(any(item["rule"] == "INV-045" for item in errors))
        self.assertTrue(any(item["path"] == "/payment/iban" for item in errors))

    def test_ubl_maps_payment_means_code(self):
        invoice = parse_ubl_invoice(UBL_WITH_MEANS)
        self.assertEqual(invoice["payment"]["means"], "58")
        self.assertEqual(invoice["payment"]["iban"], "DE89370400440532013000")
        self.assertEqual(check_invoice(invoice), [])

    def test_ubl_means_only_sepa_is_inv_045(self):
        source = UBL_WITH_MEANS.replace(
            b"""    <cbc:PaymentID>RF18539007547034</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>DE89370400440532013000</cbc:ID>
    </cac:PayeeFinancialAccount>
""",
            b"",
        )
        invoice = parse_ubl_invoice(source)
        self.assertEqual(invoice["payment"], {"means": "58"})
        errors = check_invoice(invoice)
        self.assertTrue(any(item["rule"] == "INV-045" and item["path"] == "/payment/iban" for item in errors))

    def test_ubl_cash_with_iban_is_inv_046(self):
        source = UBL_WITH_MEANS.replace(b"<cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>", b"<cbc:PaymentMeansCode>10</cbc:PaymentMeansCode>")
        invoice = parse_ubl_invoice(source)
        self.assertEqual(invoice["payment"]["means"], "10")
        errors = check_invoice(invoice)
        self.assertTrue(any(item["rule"] == "INV-046" and item["path"] == "/payment/means" for item in errors))
        self.assertFalse(any("DE89370400440532013000" in item["message"] for item in errors))

    def test_ubl_without_payment_means_stays_clean(self):
        source = UBL_WITH_MEANS.replace(
            b"""  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>
    <cbc:PaymentID>RF18539007547034</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>DE89370400440532013000</cbc:ID>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
""",
            b"",
        )
        invoice = parse_ubl_invoice(source)
        self.assertNotIn("payment", invoice)
        self.assertEqual(check_invoice(invoice), [])

    def test_cli_formats_do_not_print_the_code_or_account(self):
        invoice = _invoice({"means": "99"})
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "invoice.json"
            path.write_text(json.dumps(invoice))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(path), "--format", "checklist"]), 1)
            checklist = output.getvalue()
            self.assertIn("INV-044", checklist)
            self.assertNotIn("99", checklist)

            cash = _invoice({"means": "10", "iban": "DE89370400440532013000"})
            path.write_text(json.dumps(cash))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(path), "--format", "json"]), 1)
            report = output.getvalue()
            self.assertIn("INV-046", report)
            self.assertNotIn("DE89370400440532013000", report)


if __name__ == "__main__":
    unittest.main()
