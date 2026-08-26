import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from einvoice_preflight.checks import check_invoice
from einvoice_preflight.cli import main
from einvoice_preflight.iban import inspect_payment_iban, looks_like_complete_iban, normalize_iban
from einvoice_preflight.ubl import parse_ubl_invoice


def _invoice(iban=None):
    invoice = {
        "invoice_number": "INV-1",
        "issue_date": "2026-08-24",
        "currency": "EUR",
        "supplier": {"id": "S1", "name": "Supplier GmbH"},
        "customer": {"id": "C1", "name": "Customer GmbH"},
        "lines": [{"description": "Work", "quantity": 2, "unit_price": 100, "tax_percent": 19, "net": 200}],
        "totals": {"net": 200, "tax": 38, "gross": 238},
    }
    if iban is not None:
        invoice["payment"] = {"iban": iban, "remittance": "INV-1"}
    return invoice


UBL_WITH_ACCOUNT = b'''<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>INV-XML-IBAN</cbc:ID><cbc:IssueDate>2026-08-24</cbc:IssueDate><cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID>S1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Supplier</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID>C1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Customer</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cbc:PaymentID>INV-XML-IBAN</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>DE89370400440532013001</cbc:ID>
      <cac:FinancialInstitutionBranch><cbc:ID>COBADEFFXXX</cbc:ID></cac:FinancialInstitutionBranch>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">38</cbc:TaxAmount></cac:TaxTotal>
  <cac:InvoiceLine><cbc:InvoicedQuantity>2</cbc:InvoicedQuantity><cbc:LineExtensionAmount>200</cbc:LineExtensionAmount><cac:Item><cbc:Name>Work</cbc:Name><cac:ClassifiedTaxCategory><cbc:Percent>19</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount>100</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>200</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>238</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal>
</Invoice>'''


class IbanHelpersTest(unittest.TestCase):
    def test_normalize_strips_separators(self):
        self.assertEqual(normalize_iban("de89 3704 0044 0532 0130 00"), "DE89370400440532013000")
        self.assertEqual(normalize_iban("GB82-WEST-1234-5698-7654-32"), "GB82WEST12345698765432")
        self.assertIsNone(normalize_iban("   "))
        self.assertIsNone(normalize_iban(None))

    def test_short_internal_accounts_are_not_complete_ibans(self):
        self.assertFalse(looks_like_complete_iban("123456"))
        self.assertFalse(looks_like_complete_iban("DE89"))
        self.assertFalse(looks_like_complete_iban("S1"))
        self.assertTrue(looks_like_complete_iban("DE89 3704 0044 0532 0130 00"))
        self.assertTrue(looks_like_complete_iban("NL91ABNA0417164300"))


class IbanChecksumTest(unittest.TestCase):
    def test_valid_published_ibans_produce_no_finding(self):
        valid = [
            "DE89 3704 0044 0532 0130 00",
            "GB82WEST12345698765432",
            "FR1420041010050500013M02606",
            "NL91ABNA0417164300",
            "BE68539007547034",
            "AT611904300234573201",
            "IT60X0542811101000000123456",
            "ES9121000418450200051332",
            "IE29AIBK93115212345678",
            "PT50000201231234567890154",
            "SE4550000000058398257466",
            "DK5000400440116243",
            "FI2112345600000785",
            "LU280019400644750000",
            "PL61109010140000071219812874",
        ]
        for number in valid:
            with self.subTest(number=number):
                self.assertEqual(inspect_payment_iban({"payment": {"iban": number}}), [])

    def test_checksum_failure_does_not_echo_the_number(self):
        findings = inspect_payment_iban({"payment": {"iban": "DE89 3704 0044 0532 0130 01"}})
        self.assertEqual([item["rule"] for item in findings], ["INV-025"])
        self.assertEqual(findings[0]["path"], "/payment/iban")
        self.assertNotIn("370400440532013001", findings[0]["message"])
        self.assertNotIn("DE89370400440532013001", findings[0]["message"])
        self.assertNotIn("370400440532013001", findings[0]["fix"])
        self.assertIn("checksum", findings[0]["message"])

    def test_wrong_length_is_format_not_checksum(self):
        findings = inspect_payment_iban({"payment": {"iban": "DE8937040044"}})
        self.assertEqual([item["rule"] for item in findings], ["INV-024"])
        self.assertNotIn("37040044", findings[0]["message"])

    def test_short_internal_id_on_explicit_iban_is_format(self):
        findings = inspect_payment_iban({"payment": {"iban": "123456"}})
        self.assertEqual([item["rule"] for item in findings], ["INV-024"])

    def test_missing_payment_is_not_a_finding(self):
        self.assertEqual(inspect_payment_iban({}), [])
        self.assertEqual(inspect_payment_iban({"payment": {}}), [])
        self.assertEqual(inspect_payment_iban({"payment": {"iban": ""}}), [])


class IbanInvoiceIntegrationTest(unittest.TestCase):
    def test_invoice_without_payment_stays_clean(self):
        self.assertEqual(check_invoice(_invoice()), [])

    def test_good_iban_keeps_a_clean_invoice_clean(self):
        self.assertEqual(check_invoice(_invoice("DE89 3704 0044 0532 0130 00")), [])

    def test_bad_iban_fails_preflight(self):
        errors = check_invoice(_invoice("DE89370400440532013001"))
        self.assertTrue(any(item["rule"] == "INV-025" for item in errors))
        self.assertTrue(any(item["path"] == "/payment/iban" for item in errors))

    def test_ubl_payee_account_id_and_branch_bic_are_mapped(self):
        invoice = parse_ubl_invoice(UBL_WITH_ACCOUNT)
        self.assertEqual(invoice["payment"]["iban"], "DE89370400440532013001")
        self.assertEqual(invoice["payment"]["bic"], "COBADEFFXXX")
        errors = check_invoice(invoice)
        self.assertTrue(any(item["rule"] == "INV-025" and item["path"] == "/payment/iban" for item in errors))
        self.assertFalse(any(item["rule"] == "INV-027" for item in errors))
        self.assertFalse(any("370400440532013001" in item["message"] for item in errors))
        self.assertFalse(any("COBADEFFXXX" in item["message"] for item in errors))

    def test_ubl_without_payment_means_stays_clean(self):
        source = UBL_WITH_ACCOUNT.replace(
            b"""  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cbc:PaymentID>INV-XML-IBAN</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>DE89370400440532013001</cbc:ID>
      <cac:FinancialInstitutionBranch><cbc:ID>COBADEFFXXX</cbc:ID></cac:FinancialInstitutionBranch>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
""",
            b"",
        )
        invoice = parse_ubl_invoice(source)
        self.assertNotIn("payment", invoice)
        self.assertEqual(check_invoice(invoice), [])

    def test_cli_formats_do_not_print_the_iban(self):
        invoice = _invoice("DE89370400440532013001")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "invoice.json"
            path.write_text(json.dumps(invoice))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(path), "--format", "checklist"]), 1)
            checklist = output.getvalue()
            self.assertIn("INV-025", checklist)
            self.assertNotIn("370400440532013001", checklist)
            self.assertNotIn("DE89370400440532013001", checklist)

            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(path), "--format", "json"]), 1)
            report = output.getvalue()
            self.assertIn("INV-025", report)
            self.assertNotIn("370400440532013001", report)


if __name__ == "__main__":
    unittest.main()
