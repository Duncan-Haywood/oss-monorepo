import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from einvoice_preflight.bic import aba_checksum_ok, classify_provider_id, inspect_payment_bic, looks_like_complete_bic, normalize_bic
from einvoice_preflight.checks import check_invoice
from einvoice_preflight.cli import main
from einvoice_preflight.ubl import parse_ubl_invoice


def _invoice(iban=None, bic=None):
    invoice = {
        "invoice_number": "INV-1",
        "issue_date": "2026-08-24",
        "currency": "EUR",
        "supplier": {"id": "S1", "name": "Supplier GmbH"},
        "customer": {"id": "C1", "name": "Customer GmbH"},
        "lines": [{"description": "Work", "quantity": 2, "unit_price": 100, "tax_percent": 19, "net": 200}],
        "totals": {"net": 200, "tax": 38, "gross": 238},
    }
    payment = {}
    if iban is not None:
        payment["iban"] = iban
        payment["remittance"] = "INV-1"
    if bic is not None:
        payment["bic"] = bic
    if payment:
        invoice["payment"] = payment
    return invoice


UBL_WITH_ACCOUNT = b'''<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>INV-XML-BIC</cbc:ID><cbc:IssueDate>2026-08-24</cbc:IssueDate><cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID>S1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Supplier</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID>C1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Customer</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cbc:PaymentID>INV-XML-BIC</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>DE89370400440532013000</cbc:ID>
      <cac:FinancialInstitutionBranch><cbc:ID>COBADEFFXXX</cbc:ID></cac:FinancialInstitutionBranch>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">38</cbc:TaxAmount></cac:TaxTotal>
  <cac:InvoiceLine><cbc:InvoicedQuantity>2</cbc:InvoicedQuantity><cbc:LineExtensionAmount>200</cbc:LineExtensionAmount><cac:Item><cbc:Name>Work</cbc:Name><cac:ClassifiedTaxCategory><cbc:Percent>19</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount>100</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>200</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>238</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal>
</Invoice>'''


class BicHelpersTest(unittest.TestCase):
    def test_normalize_strips_separators(self):
        self.assertEqual(normalize_bic("coba deff xxx"), "COBADEFFXXX")
        self.assertEqual(normalize_bic("DEUT-DEFF"), "DEUTDEFF")
        self.assertIsNone(normalize_bic("   "))
        self.assertIsNone(normalize_bic(None))

    def test_short_internal_codes_are_not_complete_bics(self):
        self.assertFalse(looks_like_complete_bic("BANK1"))
        self.assertFalse(looks_like_complete_bic("COBADE"))
        self.assertFalse(looks_like_complete_bic("S1"))
        self.assertTrue(looks_like_complete_bic("COBADEFFXXX"))
        self.assertTrue(looks_like_complete_bic("DEUTDEFF"))


class BicShapeTest(unittest.TestCase):
    def test_valid_bics_produce_no_finding(self):
        valid = ["COBADEFFXXX", "DEUTDEFF", "NEDSZAJJ", "BARCGB22", "BNPAFRPP"]
        for code in valid:
            with self.subTest(code=code):
                self.assertEqual(inspect_payment_bic({"payment": {"bic": code}}), [])

    def test_wrong_length_is_format(self):
        findings = inspect_payment_bic({"payment": {"bic": "COBADEFFXX"}})
        self.assertEqual([item["rule"] for item in findings], ["INV-026"])
        self.assertEqual(findings[0]["path"], "/payment/bic")
        self.assertNotIn("COBADEFFXX", findings[0]["message"])
        self.assertNotIn("COBADEFFXX", findings[0]["fix"])

    def test_digits_in_bank_code_are_format(self):
        findings = inspect_payment_bic({"payment": {"bic": "CO12DEFFXXX"}})
        self.assertEqual([item["rule"] for item in findings], ["INV-026"])
        self.assertNotIn("CO12DEFFXXX", findings[0]["message"])

    def test_short_internal_id_on_explicit_bic_is_format(self):
        findings = inspect_payment_bic({"payment": {"bic": "BANK1"}})
        self.assertEqual([item["rule"] for item in findings], ["INV-026"])

    def test_missing_payment_is_not_a_finding(self):
        self.assertEqual(inspect_payment_bic({}), [])
        self.assertEqual(inspect_payment_bic({"payment": {}}), [])
        self.assertEqual(inspect_payment_bic({"payment": {"bic": ""}}), [])


class BicIbanCountryTest(unittest.TestCase):
    def test_matching_countries_stay_clean(self):
        self.assertEqual(
            inspect_payment_bic({
                "payment": {"iban": "DE89 3704 0044 0532 0130 00", "bic": "COBADEFFXXX"},
            }),
            [],
        )

    def test_country_mismatch_does_not_echo_either_value(self):
        findings = inspect_payment_bic({
            "payment": {"iban": "DE89370400440532013000", "bic": "CHASUS33"},
        })
        self.assertEqual([item["rule"] for item in findings], ["INV-027"])
        self.assertEqual(findings[0]["path"], "/payment/bic")
        self.assertIn("country", findings[0]["message"])
        self.assertNotIn("CHASUS33", findings[0]["message"])
        self.assertNotIn("DE89370400440532013000", findings[0]["message"])
        self.assertNotIn("CHASUS33", findings[0]["fix"])
        self.assertNotIn("370400440532013000", findings[0]["fix"])

    def test_incomplete_iban_skips_country_match(self):
        findings = inspect_payment_bic({"payment": {"iban": "DE89", "bic": "COBADEFFXXX"}})
        self.assertEqual(findings, [])

    def test_wrong_length_iban_still_gets_country_match(self):
        # The IBAN is truncated (20 chars, DE needs 22) and gets its own
        # INV-024 finding elsewhere, but its country prefix is still
        # readable, and a mismatched BIC country is a second, independent
        # typo the truncation does not excuse. This used to be silently
        # skipped because looks_like_complete_iban read any wrong-length
        # IBAN as "no IBAN here".
        findings = inspect_payment_bic({
            "payment": {"iban": "DE893704004405320130", "bic": "BARCGB22"},
        })
        self.assertEqual([item["rule"] for item in findings], ["INV-027"])

    def test_format_error_wins_over_country_match(self):
        findings = inspect_payment_bic({
            "payment": {"iban": "DE89370400440532013000", "bic": "US33"},
        })
        self.assertEqual([item["rule"] for item in findings], ["INV-026"])


class BicInvoiceIntegrationTest(unittest.TestCase):
    def test_invoice_without_bic_stays_clean(self):
        self.assertEqual(check_invoice(_invoice()), [])
        self.assertEqual(check_invoice(_invoice("DE89 3704 0044 0532 0130 00")), [])

    def test_matching_bic_keeps_a_clean_invoice_clean(self):
        self.assertEqual(check_invoice(_invoice("DE89 3704 0044 0532 0130 00", "COBA DEFF XXX")), [])

    def test_mismatched_bic_fails_preflight(self):
        errors = check_invoice(_invoice("DE89370400440532013000", "CHASUS33"))
        self.assertTrue(any(item["rule"] == "INV-027" for item in errors))
        self.assertTrue(any(item["path"] == "/payment/bic" for item in errors))
        self.assertFalse(any("CHASUS33" in item["message"] for item in errors))

    def test_ubl_maps_branch_id_as_bic(self):
        invoice = parse_ubl_invoice(UBL_WITH_ACCOUNT)
        self.assertEqual(invoice["payment"]["iban"], "DE89370400440532013000")
        self.assertEqual(invoice["payment"]["bic"], "COBADEFFXXX")
        self.assertEqual(check_invoice(invoice), [])

    def test_ubl_nested_financial_institution_id_is_mapped(self):
        source = UBL_WITH_ACCOUNT.replace(
            b"<cac:FinancialInstitutionBranch><cbc:ID>COBADEFFXXX</cbc:ID></cac:FinancialInstitutionBranch>",
            b"<cac:FinancialInstitutionBranch><cac:FinancialInstitution><cbc:ID>COBADEFFXXX</cbc:ID></cac:FinancialInstitution></cac:FinancialInstitutionBranch>",
        )
        invoice = parse_ubl_invoice(source)
        self.assertEqual(invoice["payment"]["bic"], "COBADEFFXXX")

    def test_cli_formats_do_not_print_the_bic(self):
        invoice = _invoice("DE89370400440532013000", "CHASUS33")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "invoice.json"
            path.write_text(json.dumps(invoice))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(path), "--format", "checklist"]), 1)
            checklist = output.getvalue()
            self.assertIn("INV-027", checklist)
            self.assertNotIn("CHASUS33", checklist)
            self.assertNotIn("DE89370400440532013000", checklist)

            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(path), "--format", "json"]), 1)
            report = output.getvalue()
            self.assertIn("INV-027", report)
            self.assertNotIn("CHASUS33", report)


if __name__ == "__main__":
    unittest.main()


class ClearingCodeTest(unittest.TestCase):
    """BT-86 admits a national clearing code as well as a BIC (mirrors bic.test.mjs, 2026-11-12)."""

    def test_clearing_codes_are_not_malformed(self):
        for code in ("20-00-00", "37040044", "062-000", "021000021", "SBIN0001234", "7171", "951234567"):
            self.assertEqual(inspect_payment_bic({"payment": {"bic": code}}), [], code)
            self.assertEqual(classify_provider_id(code), "clearing", code)
        for code in ("BA11", "[BIC]", "US33", "COBADEFFXX"):
            self.assertEqual(classify_provider_id(code), "unknown", code)

    def test_bad_us_routing_number(self):
        self.assertTrue(aba_checksum_ok("021000021"))
        self.assertTrue(aba_checksum_ok("121000358"))
        findings = inspect_payment_bic({"payment": {"bic": "121000359"}})
        self.assertEqual([f["rule"] for f in findings], ["INV-026"])
        # Leading 0 could be Canadian EFT or a Russian BIK: a note in JS, silent here.
        self.assertEqual(inspect_payment_bic({"payment": {"bic": "021000022"}}), [])

    def test_clearing_code_against_iban(self):
        cases = [
            ("DE89370400440532013000", "37040044", []),
            ("DE89370400440532013000", "37040045", ["INV-027"]),
            ("GB29NWBK60161331926819", "60-16-13", []),
            ("GB29NWBK60161331926819", "20-00-00", ["INV-027"]),
            ("CH9300762011623852957", "762", []),
            ("CH9300762011623852957", "9000", ["INV-027"]),
            ("IT60X0542811101000000123456", "05428", []),
            ("IT60X0542811101000000123456", "0542811101", []),
            ("FR1420041010050500013M02606", "2004101005", []),
            ("NL91ABNA0417164300", "123456", []),
        ]
        for iban, bic, rules in cases:
            findings = inspect_payment_bic({"payment": {"iban": iban, "bic": bic}})
            self.assertEqual([f["rule"] for f in findings], rules, f"{iban} {bic}")
