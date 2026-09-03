import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from einvoice_preflight.checks import check_invoice
from einvoice_preflight.cli import main
from einvoice_preflight.remittance import (
    inspect_payment_remittance,
    looks_like_structured_rf,
    normalize_remittance,
)
from einvoice_preflight.ubl import parse_ubl_invoice


def _invoice(iban=None, remittance=None):
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
    if remittance is not None:
        payment["remittance"] = remittance
    if payment:
        invoice["payment"] = payment
    return invoice


UBL_WITH_PAYMENT = b'''<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>INV-XML-RF</cbc:ID><cbc:IssueDate>2026-08-24</cbc:IssueDate><cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID>S1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Supplier</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID>C1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Customer</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cbc:PaymentID>RF18539007547034</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>DE89370400440532013000</cbc:ID>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">38</cbc:TaxAmount></cac:TaxTotal>
  <cac:InvoiceLine><cbc:InvoicedQuantity>2</cbc:InvoicedQuantity><cbc:LineExtensionAmount>200</cbc:LineExtensionAmount><cac:Item><cbc:Name>Work</cbc:Name><cac:ClassifiedTaxCategory><cbc:Percent>19</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount>100</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>200</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>238</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal>
</Invoice>'''


class RemittanceHelpersTest(unittest.TestCase):
    def test_normalize_strips_separators(self):
        self.assertEqual(normalize_remittance("rf18 5390 0754 7034"), "RF18539007547034")
        self.assertEqual(normalize_remittance("INV-1001"), "INV1001")
        self.assertIsNone(normalize_remittance("   "))
        self.assertIsNone(normalize_remittance(None))

    def test_structured_rf_shape(self):
        self.assertTrue(looks_like_structured_rf("RF18 5390 0754 7034"))
        self.assertTrue(looks_like_structured_rf("RF06INV1001"))
        self.assertFalse(looks_like_structured_rf("INV-1001"))
        self.assertFalse(looks_like_structured_rf("RF"))
        self.assertFalse(looks_like_structured_rf("RF1"))


class RemittanceRuleTest(unittest.TestCase):
    def test_complete_iban_without_remittance_is_inv_030(self):
        findings = inspect_payment_remittance(_invoice("DE89 3704 0044 0532 0130 00"))
        self.assertEqual([item["rule"] for item in findings], ["INV-030"])
        self.assertEqual(findings[0]["path"], "/payment/remittance")
        self.assertNotIn("37040044", findings[0]["message"])
        self.assertNotIn("DE893704", findings[0]["message"])

    def test_internal_account_does_not_require_remittance(self):
        self.assertEqual(inspect_payment_remittance(_invoice("123456")), [])
        self.assertEqual(inspect_payment_remittance(_invoice()), [])
        self.assertEqual(inspect_payment_remittance({}), [])

    def test_wrong_length_iban_without_remittance_is_still_inv_030(self):
        # Truncated (20 chars, DE needs 22), but still an IBAN, not an
        # internal account id -- a buyer still needs a remittance reference
        # to quote on the transfer. This used to be silently skipped because
        # looks_like_complete_iban read any wrong-length IBAN as "no IBAN
        # here".
        findings = inspect_payment_remittance(_invoice("DE893704004405320130"))
        self.assertEqual([item["rule"] for item in findings], ["INV-030"])
        self.assertEqual(findings[0]["path"], "/payment/remittance")

    def test_unstructured_and_valid_rf_pass(self):
        self.assertEqual(
            inspect_payment_remittance(_invoice("DE89370400440532013000", "INV-1001")),
            [],
        )
        self.assertEqual(
            inspect_payment_remittance(_invoice("DE89370400440532013000", "RF18 5390 0754 7034")),
            [],
        )
        self.assertEqual(
            inspect_payment_remittance(_invoice("DE89370400440532013000", "RF06INV1001")),
            [],
        )

    def test_rf_checksum_failure_does_not_echo_the_reference(self):
        findings = inspect_payment_remittance(_invoice(
            "DE89370400440532013000",
            "RF18539007547035",
        ))
        self.assertEqual([item["rule"] for item in findings], ["INV-031"])
        self.assertEqual(findings[0]["path"], "/payment/remittance")
        self.assertNotIn("539007547035", findings[0]["message"])
        self.assertNotIn("RF18539007547035", findings[0]["message"])
        self.assertIn("checksum", findings[0]["message"])

    def test_rf_wrong_shape_is_format_not_checksum(self):
        findings = inspect_payment_remittance(_invoice("DE89370400440532013000", "RF12"))
        self.assertEqual([item["rule"] for item in findings], ["INV-031"])
        self.assertIn("structured RF", findings[0]["message"])
        self.assertNotIn("RF12", findings[0]["message"])

    def test_overlong_unstructured_note_is_inv_031(self):
        findings = inspect_payment_remittance(_invoice(
            "DE89370400440532013000",
            "X" * 141,
        ))
        self.assertEqual([item["rule"] for item in findings], ["INV-031"])
        self.assertIn("140", findings[0]["message"])
        self.assertNotIn("XXXX", findings[0]["message"])

    def test_whitespace_remittance_on_iban_is_missing_not_checksum(self):
        findings = inspect_payment_remittance(_invoice("DE89370400440532013000", "   "))
        self.assertEqual([item["rule"] for item in findings], ["INV-030"])


class RemittanceInvoiceIntegrationTest(unittest.TestCase):
    def test_invoice_without_iban_stays_clean(self):
        self.assertEqual(check_invoice(_invoice()), [])
        self.assertEqual(check_invoice(_invoice(remittance="INV-1")), [])

    def test_iban_and_remittance_keep_a_clean_invoice_clean(self):
        self.assertEqual(check_invoice(_invoice("DE89 3704 0044 0532 0130 00", "INV-1")), [])

    def test_missing_remittance_fails_preflight(self):
        errors = check_invoice(_invoice("DE89370400440532013000"))
        self.assertTrue(any(item["rule"] == "INV-030" for item in errors))
        self.assertTrue(any(item["path"] == "/payment/remittance" for item in errors))

    def test_ubl_payment_id_maps_into_remittance(self):
        invoice = parse_ubl_invoice(UBL_WITH_PAYMENT)
        self.assertEqual(invoice["payment"]["iban"], "DE89370400440532013000")
        self.assertEqual(invoice["payment"]["remittance"], "RF18539007547034")
        self.assertEqual(check_invoice(invoice), [])

    def test_ubl_instruction_note_is_used_when_payment_id_is_absent(self):
        source = UBL_WITH_PAYMENT.replace(
            b"<cbc:PaymentID>RF18539007547034</cbc:PaymentID>",
            b"<cbc:InstructionNote>INV-XML-RF</cbc:InstructionNote>",
        )
        invoice = parse_ubl_invoice(source)
        self.assertEqual(invoice["payment"]["remittance"], "INV-XML-RF")
        self.assertEqual(check_invoice(invoice), [])

    def test_ubl_iban_without_remittance_is_inv_030(self):
        source = UBL_WITH_PAYMENT.replace(
            b"<cbc:PaymentID>RF18539007547034</cbc:PaymentID>\n    ",
            b"",
        )
        invoice = parse_ubl_invoice(source)
        self.assertNotIn("remittance", invoice["payment"])
        errors = check_invoice(invoice)
        self.assertTrue(any(item["rule"] == "INV-030" for item in errors))
        self.assertFalse(any("RF18539007547034" in item["message"] for item in errors))

    def test_cli_formats_do_not_print_the_remittance(self):
        invoice = _invoice("DE89370400440532013000", "RF18539007547035")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "invoice.json"
            path.write_text(json.dumps(invoice))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(path), "--format", "checklist"]), 1)
            checklist = output.getvalue()
            self.assertIn("INV-031", checklist)
            self.assertNotIn("RF18539007547035", checklist)
            self.assertNotIn("539007547035", checklist)

            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(path), "--format", "json"]), 1)
            report = output.getvalue()
            self.assertIn("INV-031", report)
            self.assertNotIn("RF18539007547035", report)


if __name__ == "__main__":
    unittest.main()
