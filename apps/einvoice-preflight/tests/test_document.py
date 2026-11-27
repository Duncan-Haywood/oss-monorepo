import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from einvoice_preflight.checks import check_invoice
from einvoice_preflight.cli import main
from einvoice_preflight.document import inspect_document_type, normalize_document_type
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


UBL_CREDIT = b'''<?xml version="1.0" encoding="UTF-8"?>
<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"
 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>CN-1</cbc:ID><cbc:IssueDate>2026-08-25</cbc:IssueDate>
  <cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>INV-1001</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID>S1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Supplier</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID>C1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Customer</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">38</cbc:TaxAmount></cac:TaxTotal>
  <cac:CreditNoteLine><cbc:CreditedQuantity>2</cbc:CreditedQuantity><cbc:LineExtensionAmount>200</cbc:LineExtensionAmount><cac:Item><cbc:Name>Work</cbc:Name><cac:ClassifiedTaxCategory><cbc:Percent>19</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount>100</cbc:PriceAmount></cac:Price></cac:CreditNoteLine>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>200</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>238</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal>
</CreditNote>'''

UBL_INVOICE_AS_CREDIT = b'''<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>CN-AS-INV</cbc:ID><cbc:IssueDate>2026-08-25</cbc:IssueDate>
  <cbc:InvoiceTypeCode>381</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID>S1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Supplier</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID>C1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Customer</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">38</cbc:TaxAmount></cac:TaxTotal>
  <cac:InvoiceLine><cbc:InvoicedQuantity>2</cbc:InvoicedQuantity><cbc:LineExtensionAmount>200</cbc:LineExtensionAmount><cac:Item><cbc:Name>Work</cbc:Name><cac:ClassifiedTaxCategory><cbc:Percent>19</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount>100</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>200</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>238</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal>
</Invoice>'''


class DocumentHelpersTest(unittest.TestCase):
    def test_normalize_names_and_codes(self):
        self.assertEqual(normalize_document_type("credit_note"), "credit_note")
        self.assertEqual(normalize_document_type("Credit-Note"), "credit_note")
        self.assertEqual(normalize_document_type(381), "credit_note")
        self.assertEqual(normalize_document_type("380"), "invoice")
        self.assertEqual(normalize_document_type("383"), "debit_note")
        self.assertEqual(normalize_document_type(""), None)
        self.assertEqual(normalize_document_type(None), None)
        self.assertEqual(normalize_document_type("proforma"), "invalid")


class DocumentRuleTest(unittest.TestCase):
    def test_ordinary_invoice_needs_no_original(self):
        self.assertEqual(inspect_document_type(_invoice()), [])
        self.assertEqual(inspect_document_type(_invoice(document_type="invoice")), [])
        self.assertEqual(inspect_document_type(_invoice(document_code="380")), [])

    def test_unknown_type_is_inv_032(self):
        findings = inspect_document_type(_invoice(document_type="proforma"))
        self.assertEqual([item["rule"] for item in findings], ["INV-032"])
        self.assertEqual(findings[0]["path"], "/document_type")
        self.assertNotIn("proforma", findings[0]["message"])

    def test_credit_note_without_original_is_inv_033(self):
        findings = inspect_document_type(_invoice(document_type="credit_note"))
        self.assertEqual([item["rule"] for item in findings], ["INV-033"])
        self.assertEqual(findings[0]["path"], "/original_invoice")

    def test_code_381_without_original_is_inv_033(self):
        findings = inspect_document_type(_invoice(document_code=381))
        self.assertEqual([item["rule"] for item in findings], ["INV-033"])

    def test_credit_note_with_original_passes(self):
        self.assertEqual(
            inspect_document_type(_invoice(document_type="credit_note", original_invoice="INV-1001")),
            [],
        )

    def test_self_reference_is_inv_034_and_does_not_echo(self):
        findings = inspect_document_type(_invoice(
            invoice_number="CN-SELF",
            document_type="credit_note",
            original_invoice="cn-self",
        ))
        self.assertEqual([item["rule"] for item in findings], ["INV-034"])
        self.assertEqual(findings[0]["path"], "/original_invoice")
        self.assertNotIn("CN-SELF", findings[0]["message"])
        self.assertNotIn("cn-self", findings[0]["message"])

    def test_invoice_envelope_with_credit_code_is_inv_034(self):
        findings = inspect_document_type(_invoice(document_type="invoice", document_code="381"))
        rules = [item["rule"] for item in findings]
        self.assertIn("INV-034", rules)
        self.assertIn("INV-033", rules)
        self.assertFalse(any("INV-1" in item["message"] for item in findings))


class DocumentInvoiceIntegrationTest(unittest.TestCase):
    def test_plain_invoice_stays_clean(self):
        self.assertEqual(check_invoice(_invoice()), [])

    def test_credit_note_fails_preflight_without_original(self):
        errors = check_invoice(_invoice(document_type="credit_note"))
        self.assertTrue(any(item["rule"] == "INV-033" for item in errors))

    def test_credit_note_with_original_stays_clean(self):
        self.assertEqual(
            check_invoice(_invoice(document_type="credit_note", original_invoice="INV-1001")),
            [],
        )

    def test_ubl_credit_note_maps_type_and_reference(self):
        invoice = parse_ubl_invoice(UBL_CREDIT)
        self.assertEqual(invoice["document_type"], "credit_note")
        self.assertEqual(invoice["document_code"], "381")
        self.assertEqual(invoice["original_invoice"], "INV-1001")
        self.assertEqual(invoice["invoice_number"], "CN-1")
        self.assertEqual(check_invoice(invoice), [])

    def test_ubl_credit_note_without_reference_is_inv_033(self):
        source = UBL_CREDIT.replace(
            b"<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>INV-1001</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>",
            b"",
        )
        invoice = parse_ubl_invoice(source)
        self.assertNotIn("original_invoice", invoice)
        errors = check_invoice(invoice)
        self.assertTrue(any(item["rule"] == "INV-033" for item in errors))
        self.assertFalse(any("INV-1001" in item["message"] for item in errors))
        self.assertFalse(any("CN-1" in item["message"] for item in errors))

    def test_ubl_invoice_with_credit_type_code_is_inv_034(self):
        invoice = parse_ubl_invoice(UBL_INVOICE_AS_CREDIT)
        self.assertEqual(invoice["document_type"], "invoice")
        self.assertEqual(invoice["document_code"], "381")
        errors = check_invoice(invoice)
        rules = {item["rule"] for item in errors}
        self.assertIn("INV-034", rules)
        self.assertIn("INV-033", rules)
        self.assertFalse(any("CN-AS-INV" in item["message"] for item in errors))

    def test_order_xml_is_still_rejected(self):
        with self.assertRaisesRegex(ValueError, "Invoice, CreditNote, or DebitNote"):
            parse_ubl_invoice(b"<Order><ID>1</ID></Order>")

    def test_cli_does_not_print_the_original_invoice(self):
        invoice = _invoice(document_type="credit_note", original_invoice="SECRET-INV-99")
        invoice["original_invoice"] = "SECRET-INV-99"
        # Self-reference so INV-034 fires with a number that must stay off stdout.
        invoice["invoice_number"] = "SECRET-INV-99"
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "credit.json"
            path.write_text(json.dumps(invoice))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(path), "--format", "checklist"]), 1)
            checklist = output.getvalue()
            self.assertIn("INV-034", checklist)
            self.assertNotIn("SECRET-INV-99", checklist)

            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(path), "--format", "json"]), 1)
            report = output.getvalue()
            self.assertIn("INV-034", report)
            self.assertNotIn("SECRET-INV-99", report)


if __name__ == "__main__":
    unittest.main()
