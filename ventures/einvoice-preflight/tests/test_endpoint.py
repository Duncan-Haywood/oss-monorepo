import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from einvoice_preflight.checks import check_invoice
from einvoice_preflight.cli import main
from einvoice_preflight.endpoint import (
    inspect_party_endpoint,
    inspect_party_endpoints,
    looks_like_known_scheme,
    normalize_endpoint_id,
    normalize_scheme,
)
from einvoice_preflight.ubl import parse_ubl_invoice


def _invoice(customer_endpoint=None, supplier_endpoint=None):
    invoice = {
        "invoice_number": "INV-1",
        "issue_date": "2026-08-24",
        "currency": "EUR",
        "supplier": {"id": "S1", "name": "Supplier GmbH"},
        "customer": {"id": "C1", "name": "Customer GmbH"},
        "lines": [{"description": "Work", "quantity": 2, "unit_price": 100, "tax_percent": 19, "net": 200}],
        "totals": {"net": 200, "tax": 38, "gross": 238},
    }
    if supplier_endpoint is not None:
        invoice["supplier"]["endpoint"] = supplier_endpoint
    if customer_endpoint is not None:
        invoice["customer"]["endpoint"] = customer_endpoint
    return invoice


UBL_WITH_ENDPOINTS = b'''<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>INV-XML-EP</cbc:ID><cbc:IssueDate>2026-08-24</cbc:IssueDate><cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0088">1234567890128</cbc:EndpointID>
    <cac:PartyIdentification><cbc:ID>S1</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name>Supplier</cbc:Name></cac:PartyName>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0088">1234567890129</cbc:EndpointID>
    <cac:PartyIdentification><cbc:ID>C1</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name>Customer</cbc:Name></cac:PartyName>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">38</cbc:TaxAmount></cac:TaxTotal>
  <cac:InvoiceLine><cbc:InvoicedQuantity>2</cbc:InvoicedQuantity><cbc:LineExtensionAmount>200</cbc:LineExtensionAmount><cac:Item><cbc:Name>Work</cbc:Name><cac:ClassifiedTaxCategory><cbc:Percent>19</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount>100</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>200</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>238</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal>
</Invoice>'''


class EndpointHelpersTest(unittest.TestCase):
    def test_normalize_scheme_and_id(self):
        self.assertEqual(normalize_scheme(" 0088 "), "0088")
        self.assertEqual(normalize_scheme("em"), "EM")
        self.assertIsNone(normalize_scheme("   "))
        self.assertIsNone(normalize_scheme(None))
        self.assertEqual(normalize_endpoint_id("  ap@buyer.example  "), "ap@buyer.example")
        self.assertIsNone(normalize_endpoint_id("   "))
        self.assertTrue(looks_like_known_scheme("0088"))
        self.assertTrue(looks_like_known_scheme("EM"))
        self.assertFalse(looks_like_known_scheme("088"))
        self.assertFalse(looks_like_known_scheme("ZZZZ"))


class EndpointChecksumTest(unittest.TestCase):
    def test_valid_published_endpoints_produce_no_finding(self):
        valid = [
            {"scheme": "0088", "id": "1234567890128"},
            {"scheme": "0088", "id": "0614141000005"},
            {"scheme": "EM", "id": "ap@customer.example"},
            {"scheme": "0192", "id": "981276957"},
            {"scheme": "0208", "id": "0123456749"},
            {"scheme": "0184", "id": "12345678"},
            {"scheme": "0007", "id": "5566778899"},
            {"scheme": "9930", "id": "DE136695976"},
        ]
        for endpoint in valid:
            with self.subTest(endpoint=endpoint):
                self.assertEqual(inspect_party_endpoint({"endpoint": endpoint}, "customer"), [])

    def test_gln_checksum_failure_does_not_echo_the_number(self):
        findings = inspect_party_endpoint(
            {"endpoint": {"scheme": "0088", "id": "1234567890129"}},
            "customer",
        )
        self.assertEqual([item["rule"] for item in findings], ["INV-041"])
        self.assertEqual(findings[0]["path"], "/customer/endpoint/id")
        self.assertNotIn("1234567890129", findings[0]["message"])
        self.assertNotIn("1234567890129", findings[0]["fix"])
        self.assertIn("0088", findings[0]["message"])

    def test_unknown_scheme_is_format_not_checksum(self):
        findings = inspect_party_endpoint(
            {"endpoint": {"scheme": "088", "id": "1234567890128"}},
            "supplier",
        )
        self.assertEqual([item["rule"] for item in findings], ["INV-039"])
        self.assertEqual(findings[0]["path"], "/supplier/endpoint/scheme")

    def test_missing_scheme_is_inv_039(self):
        findings = inspect_party_endpoint({"endpoint": {"id": "1234567890128"}}, "customer")
        self.assertEqual([item["rule"] for item in findings], ["INV-039"])

    def test_empty_id_is_inv_040(self):
        findings = inspect_party_endpoint({"endpoint": {"scheme": "0088", "id": "  "}}, "customer")
        self.assertEqual([item["rule"] for item in findings], ["INV-040"])

    def test_string_endpoint_is_inv_039(self):
        findings = inspect_party_endpoint({"endpoint": "1234567890128"}, "customer")
        self.assertEqual([item["rule"] for item in findings], ["INV-039"])

    def test_email_without_at_is_inv_041(self):
        findings = inspect_party_endpoint(
            {"endpoint": {"scheme": "EM", "id": "not-an-email"}},
            "customer",
        )
        self.assertEqual([item["rule"] for item in findings], ["INV-041"])
        self.assertNotIn("not-an-email", findings[0]["message"])

    def test_omitted_endpoint_is_not_a_finding(self):
        self.assertEqual(inspect_party_endpoint({}, "customer"), [])
        self.assertEqual(inspect_party_endpoint({"endpoint": ""}, "customer"), [])
        self.assertEqual(inspect_party_endpoints({}), [])


class EndpointInvoiceIntegrationTest(unittest.TestCase):
    def test_invoice_without_endpoints_stays_clean(self):
        self.assertEqual(check_invoice(_invoice()), [])

    def test_good_endpoints_keep_a_clean_invoice_clean(self):
        self.assertEqual(check_invoice(_invoice(
            customer_endpoint={"scheme": "EM", "id": "ap@customer.example"},
            supplier_endpoint={"scheme": "0088", "id": "1234567890128"},
        )), [])

    def test_bad_buyer_gln_fails_preflight(self):
        errors = check_invoice(_invoice(customer_endpoint={"scheme": "0088", "id": "1234567890129"}))
        self.assertTrue(any(item["rule"] == "INV-041" for item in errors))
        self.assertTrue(any(item["path"] == "/customer/endpoint/id" for item in errors))

    def test_ubl_endpoint_id_and_scheme_are_mapped(self):
        invoice = parse_ubl_invoice(UBL_WITH_ENDPOINTS)
        self.assertEqual(invoice["supplier"]["endpoint"], {"scheme": "0088", "id": "1234567890128"})
        self.assertEqual(invoice["customer"]["endpoint"], {"scheme": "0088", "id": "1234567890129"})
        errors = check_invoice(invoice)
        self.assertTrue(any(item["rule"] == "INV-041" and item["path"] == "/customer/endpoint/id" for item in errors))
        self.assertFalse(any(item["rule"] == "INV-041" and "supplier" in item["path"] for item in errors))
        self.assertFalse(any("1234567890129" in item["message"] for item in errors))
        self.assertFalse(any("1234567890128" in item["message"] for item in errors))

    def test_ubl_without_endpoint_stays_clean(self):
        source = UBL_WITH_ENDPOINTS.replace(
            b'<cbc:EndpointID schemeID="0088">1234567890128</cbc:EndpointID>',
            b"",
        ).replace(
            b'<cbc:EndpointID schemeID="0088">1234567890129</cbc:EndpointID>',
            b"",
        )
        invoice = parse_ubl_invoice(source)
        self.assertNotIn("endpoint", invoice["supplier"])
        self.assertNotIn("endpoint", invoice["customer"])
        self.assertEqual(check_invoice(invoice), [])

    def test_ubl_endpoint_without_scheme_is_inv_039(self):
        source = UBL_WITH_ENDPOINTS.replace(
            b'<cbc:EndpointID schemeID="0088">1234567890129</cbc:EndpointID>',
            b"<cbc:EndpointID>1234567890128</cbc:EndpointID>",
        ).replace(
            b'<cbc:EndpointID schemeID="0088">1234567890128</cbc:EndpointID>',
            b"",
        )
        invoice = parse_ubl_invoice(source)
        self.assertEqual(invoice["customer"]["endpoint"]["id"], "1234567890128")
        self.assertEqual(invoice["customer"]["endpoint"]["scheme"], "")
        errors = check_invoice(invoice)
        self.assertTrue(any(item["rule"] == "INV-039" and item["path"] == "/customer/endpoint/scheme" for item in errors))

    def test_cli_formats_do_not_print_the_address(self):
        invoice = _invoice(customer_endpoint={"scheme": "0088", "id": "1234567890129"})
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "invoice.json"
            path.write_text(json.dumps(invoice))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(path), "--format", "checklist"]), 1)
            checklist = output.getvalue()
            self.assertIn("INV-041", checklist)
            self.assertNotIn("1234567890129", checklist)

            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(path), "--format", "json"]), 1)
            report = output.getvalue()
            self.assertIn("INV-041", report)
            self.assertNotIn("1234567890129", report)


class PeppolCommonRulesTest(unittest.TestCase):
    """2026-11-17: the checksummed schemes follow OpenPeppol's PEPPOL-COMMON rules.

    Same cases as endpoint.test.mjs (tests/endpoint_peppol_cases.json).
    """

    @classmethod
    def setUpClass(cls):
        import json
        from pathlib import Path

        cls.cases = json.loads((Path(__file__).with_name("endpoint_peppol_cases.json")).read_text(encoding="utf-8"))

    def test_peppol_valid_ids_pass(self):
        for scheme, identifier in self.cases["valid"]:
            with self.subTest(scheme=scheme, id=identifier):
                self.assertEqual(inspect_party_endpoint({"endpoint": {"scheme": scheme, "id": identifier}}, "customer"), [])

    def test_peppol_invalid_ids_are_inv_041(self):
        for scheme, identifier in self.cases["invalid"]:
            with self.subTest(scheme=scheme, id=identifier):
                findings = inspect_party_endpoint({"endpoint": {"scheme": scheme, "id": identifier}}, "supplier")
                self.assertEqual([item["rule"] for item in findings], ["INV-041"])
                self.assertNotIn(identifier, findings[0]["message"])
                self.assertNotIn(identifier, findings[0]["fix"])
                self.assertIn("digits", findings[0]["fix"])

    def test_br_cl_25_codes_are_known(self):
        for scheme in ("0225", "0217", "0147", "0170", "0194", "0203", "0205", "9960", "AN", "AQ", "AS", "AU"):
            with self.subTest(scheme=scheme):
                self.assertTrue(looks_like_known_scheme(scheme))


class PartyIdentifierTests(unittest.TestCase):
    """INV-062: Peppol's fatal id rules on legal_id and party_ids (endpoint.mjs, party-ids.test.mjs)."""

    @classmethod
    def setUpClass(cls):
        cls.cases = json.loads((Path(__file__).with_name("endpoint_peppol_cases.json")).read_text(encoding="utf-8"))

    def test_endpoint_verdicts_hold_for_legal_id_and_party_ids(self):
        from einvoice_preflight.endpoint import inspect_party_identifiers

        for scheme, identifier in self.cases["valid"]:
            with self.subTest(scheme=scheme, identifier=identifier):
                party = {"legal_id": {"scheme": scheme, "id": identifier}, "party_ids": [{"scheme": scheme, "id": identifier}]}
                self.assertEqual(inspect_party_identifiers(party, "supplier"), [])
        for scheme, identifier in self.cases["invalid"]:
            with self.subTest(scheme=scheme, identifier=identifier):
                party = {"legal_id": {"scheme": scheme, "id": identifier}, "party_ids": [{"scheme": scheme, "id": identifier}]}
                found = inspect_party_identifiers(party, "customer")
                self.assertEqual([(f["rule"], f["path"]) for f in found],
                                 [("INV-062", "/customer/legal_id/id"), ("INV-062", "/customer/party_ids/0/id")])
                for f in found:
                    self.assertNotIn(identifier, f["message"] + f["fix"])

    def test_check_invoice_blocks_a_dotted_kbo_number(self):
        invoice = _invoice()
        invoice["supplier"]["legal_id"] = {"scheme": "0208", "id": "0403.170.701"}
        self.assertIn(("INV-062", "/supplier/legal_id/id"), [(f["rule"], f["path"]) for f in check_invoice(invoice)])
        invoice["supplier"]["legal_id"]["id"] = "0403170701"
        self.assertNotIn("INV-062", [f["rule"] for f in check_invoice(invoice)])

    def test_warning_schemes_stay_silent_in_python(self):
        from einvoice_preflight.endpoint import inspect_party_identifiers

        self.assertEqual(inspect_party_identifiers({"legal_id": {"scheme": "0106", "id": "1234567"}}, "customer"), [])


if __name__ == "__main__":
    unittest.main()
