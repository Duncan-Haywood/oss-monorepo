import unittest

from einvoice_preflight.checks import check_invoice
from einvoice_preflight.ubl import parse_ubl_invoice
from einvoice_preflight.vat import inspect_party_vat, looks_like_complete_vat, normalize_vat


def _invoice(supplier_id="S1", customer_id="C1", supplier_vat=None, customer_vat=None):
    supplier = {"id": supplier_id, "name": "Supplier GmbH"}
    customer = {"id": customer_id, "name": "Customer GmbH"}
    if supplier_vat is not None:
        supplier["vat_id"] = supplier_vat
    if customer_vat is not None:
        customer["vat_id"] = customer_vat
    return {
        "invoice_number": "INV-1",
        "issue_date": "2026-08-24",
        "currency": "EUR",
        "supplier": supplier,
        "customer": customer,
        "lines": [{"description": "Work", "quantity": 2, "unit_price": 100, "tax_percent": 19, "net": 200}],
        "totals": {"net": 200, "tax": 38, "gross": 238},
    }


class VatHelpersTest(unittest.TestCase):
    def test_normalize_strips_separators(self):
        self.assertEqual(normalize_vat("de 136 695 976"), "DE136695976")
        self.assertEqual(normalize_vat("AT-U-12345675"), "ATU12345675")
        self.assertIsNone(normalize_vat("   "))
        self.assertIsNone(normalize_vat(None))

    def test_short_internal_ids_are_not_complete_vat(self):
        self.assertFalse(looks_like_complete_vat("S1"))
        self.assertFalse(looks_like_complete_vat("DE123"))
        self.assertFalse(looks_like_complete_vat("DE456"))
        self.assertTrue(looks_like_complete_vat("DE136695976"))
        self.assertTrue(looks_like_complete_vat("de 136 695 976"))


class VatChecksumTest(unittest.TestCase):
    def test_valid_published_shapes_produce_no_finding(self):
        valid = [
            "DE136695976",
            "ATU12345675",
            "FR40303265045",
            "BE0411905847",
            "NL123456782B01",
            "IT00743110157",
            "PL5260250274",
            "SE556188740601",
            "DK13585628",
            "FI09853608",
            "PT502757191",
            "LU15027442",
            "IE6433435F",
            "GB434031494",
            "ESA58818501",
        ]
        for number in valid:
            with self.subTest(number=number):
                self.assertEqual(inspect_party_vat({"id": "S1", "name": "A", "vat_id": number}, "supplier"), [])

    def test_checksum_failure_does_not_echo_the_number(self):
        findings = inspect_party_vat({"id": "S1", "name": "A", "vat_id": "DE136695977"}, "supplier")
        self.assertEqual([item["rule"] for item in findings], ["INV-023"])
        self.assertEqual(findings[0]["path"], "/supplier/vat_id")
        self.assertNotIn("136695977", findings[0]["message"])
        self.assertNotIn("136695977", findings[0]["fix"])
        self.assertIn("checksum", findings[0]["message"])

    def test_nl_elfproef_weighs_the_check_digit_at_minus_one(self):
        # 9*1+8*2+7*3+6*4+5*5+4*6+3*7+2*8-1*2 = 154, divisible by 11: a
        # genuine valid Dutch VAT number under the real elfproef.
        self.assertEqual(
            inspect_party_vat({"id": "S1", "name": "A", "vat_id": "NL123456782B01"}, "supplier"), []
        )
        # Same 8 digits, wrong check digit: 156 - 3 = 153, not divisible by 11.
        findings = inspect_party_vat({"id": "S1", "name": "A", "vat_id": "NL123456783B01"}, "supplier")
        self.assertEqual([item["rule"] for item in findings], ["INV-023"])

    def test_ie_legacy_letter_second_character_shape_rearranges_before_weighing(self):
        # The 8-character Irish shape covers two different real numbers: the
        # common one is 7 digits plus a check letter (already covered by
        # IE6433435F above); the legacy one is a digit, a letter, 5 digits,
        # and a check letter -- e.g. "8Z49289F". Revenue's own check-digit
        # definition does not weigh a legacy number as typed. It first
        # rearranges it to "0" + the middle 5 digits + the leading digit,
        # *then* applies the same weights [8,7,6,5,4,3,2] mod 23:
        # "0" + "49289" + "8" = "0492898" ->
        # 0*8+4*7+9*6+2*5+8*4+9*3+8*2 = 167, 167 % 23 = 6 -> "F" (0 is "W",
        # so 6 is the 7th letter after it: "F").
        self.assertEqual(
            inspect_party_vat({"id": "S1", "name": "A", "vat_id": "IE8Z49289F"}, "supplier"), []
        )
        # Same number, wrong check letter.
        findings = inspect_party_vat({"id": "S1", "name": "A", "vat_id": "IE8Z49289X"}, "supplier")
        self.assertEqual([item["rule"] for item in findings], ["INV-023"])
        # The old code spliced a literal "7" in for the letter and left the
        # leading digit in place instead of moving it to the end -- it
        # computed a checksum for "8749289" (never rearranged, never
        # prepended a "0"), landing on weighted sum 232, 232 % 23 = 2 -> "B".
        # Every genuinely valid legacy-format Irish VAT number therefore
        # failed this check.

    def test_explicit_wrong_shape_is_format_not_checksum(self):
        findings = inspect_party_vat({"id": "S1", "name": "A", "vat_id": "DE123"}, "customer")
        self.assertEqual([item["rule"] for item in findings], ["INV-022"])
        self.assertEqual(findings[0]["path"], "/customer/vat_id")
        self.assertNotIn("DE123", findings[0]["message"])

    def test_unrecognized_prefix_on_explicit_vat_id(self):
        findings = inspect_party_vat({"id": "S1", "name": "A", "vat_id": "XX123456789"}, "supplier")
        self.assertEqual([item["rule"] for item in findings], ["INV-022"])

    def test_complete_vat_in_id_is_checked_without_vat_id_field(self):
        findings = inspect_party_vat({"id": "DE136695977", "name": "A"}, "supplier")
        self.assertEqual([item["rule"] for item in findings], ["INV-023"])
        self.assertEqual(findings[0]["path"], "/supplier/id")

    def test_same_number_in_id_and_vat_id_is_reported_once(self):
        findings = inspect_party_vat(
            {"id": "DE136695977", "name": "A", "vat_id": "DE 136 695 977"},
            "supplier",
        )
        self.assertEqual([item["rule"] for item in findings], ["INV-023"])
        self.assertEqual(findings[0]["path"], "/supplier/vat_id")

    def test_format_only_country_accepts_published_length(self):
        self.assertEqual(inspect_party_vat({"id": "S1", "name": "A", "vat_id": "HU12892312"}, "supplier"), [])
        # MT stays shape-only: no checksum is implemented for it.
        self.assertEqual(inspect_party_vat({"id": "S1", "name": "A", "vat_id": "MT12345678"}, "supplier"), [])
        findings = inspect_party_vat({"id": "S1", "name": "A", "vat_id": "HU123"}, "supplier")
        self.assertEqual([item["rule"] for item in findings], ["INV-022"])


class VatInvoiceIntegrationTest(unittest.TestCase):
    def test_documented_example_ids_stay_internal(self):
        self.assertEqual(check_invoice(_invoice(supplier_id="DE123", customer_id="DE456")), [])

    def test_bad_supplier_vat_fails_preflight(self):
        errors = check_invoice(_invoice(supplier_vat="DE136695977"))
        self.assertTrue(any(item["rule"] == "INV-023" for item in errors))
        self.assertTrue(any(item["path"] == "/supplier/vat_id" for item in errors))

    def test_good_supplier_vat_keeps_a_clean_invoice_clean(self):
        self.assertEqual(check_invoice(_invoice(supplier_vat="DE136695976", customer_vat="ATU12345675")), [])

    def test_ubl_party_tax_scheme_company_id_is_mapped(self):
        source = b'''<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>INV-XML-VAT</cbc:ID><cbc:IssueDate>2026-08-24</cbc:IssueDate><cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyIdentification><cbc:ID>S1</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name>Supplier</cbc:Name></cac:PartyName>
    <cac:PartyTaxScheme><cbc:CompanyID>DE136695977</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cac:PartyIdentification><cbc:ID>C1</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name>Customer</cbc:Name></cac:PartyName>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">38</cbc:TaxAmount></cac:TaxTotal>
  <cac:InvoiceLine><cbc:InvoicedQuantity>2</cbc:InvoicedQuantity><cbc:LineExtensionAmount>200</cbc:LineExtensionAmount><cac:Item><cbc:Name>Work</cbc:Name><cac:ClassifiedTaxCategory><cbc:Percent>19</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount>100</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>200</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>238</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal>
</Invoice>'''
        invoice = parse_ubl_invoice(source)
        self.assertEqual(invoice["supplier"]["id"], "S1")
        self.assertEqual(invoice["supplier"]["vat_id"], "DE136695977")
        errors = check_invoice(invoice)
        self.assertTrue(any(item["rule"] == "INV-023" and item["path"] == "/supplier/vat_id" for item in errors))
        self.assertFalse(any("136695977" in item["message"] for item in errors))

    def test_cli_formats_do_not_print_the_vat_identifier(self):
        import contextlib
        import io
        import json
        import tempfile
        from pathlib import Path

        from einvoice_preflight.cli import main

        invoice = _invoice(supplier_vat="DE136695977")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "invoice.json"
            path.write_text(json.dumps(invoice))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(path), "--format", "checklist"]), 1)
            checklist = output.getvalue()
            self.assertIn("INV-023", checklist)
            self.assertNotIn("136695977", checklist)
            self.assertNotIn("DE136695977", checklist)

            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(path), "--format", "json"]), 1)
            report = output.getvalue()
            self.assertIn("INV-023", report)
            self.assertNotIn("136695977", report)


if __name__ == "__main__":
    unittest.main()
