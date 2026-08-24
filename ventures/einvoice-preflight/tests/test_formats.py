"""Reading real e-invoice XML, and the checks that only that XML can trigger.

The shipped examples are treated as fixtures: a change that makes
``ubl-invoice.xml`` fail preflight, or that stops
``ubl-invoice-with-defects.xml`` reporting exactly its six planted defects, is
a regression in the checks rather than a stale expectation.
"""

import json
import tempfile
import unittest
from pathlib import Path

from einvoice_preflight.checks import ERROR, WARNING, check_invoice
from einvoice_preflight.cli import main
from einvoice_preflight.formats import DocumentError, detect_syntax, load_document, parse_bytes

EXAMPLES = Path(__file__).resolve().parent.parent / "examples"


def findings_by_rule(document):
    return {finding["rule"] for finding in check_invoice(document)}


class SyntaxDetectionTest(unittest.TestCase):
    def test_each_shipped_example_is_recognised(self):
        for name, expected in (
            ("ubl-invoice.xml", "ubl"),
            ("ubl-invoice-with-defects.xml", "ubl"),
            ("cii-invoice.xml", "cii"),
            ("valid-invoice.json", "json"),
        ):
            with self.subTest(example=name):
                _, syntax = load_document(EXAMPLES / name)
                self.assertEqual(syntax, expected)

    def test_detection_reads_content_not_the_file_extension(self):
        # An ERP export named .txt is still a UBL invoice.
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "export.txt"
            path.write_bytes((EXAMPLES / "ubl-invoice.xml").read_bytes())
            _, syntax = load_document(path)
            self.assertEqual(syntax, "ubl")

    def test_unrelated_xml_is_refused_with_an_actionable_message(self):
        with self.assertRaises(DocumentError) as caught:
            detect_syntax(b"<html><body>not an invoice</body></html>")
        self.assertIn("not a UBL Invoice", str(caught.exception))

    def test_malformed_xml_is_a_read_error_not_a_crash(self):
        with self.assertRaises(DocumentError):
            parse_bytes(b'<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><cbc:ID>')

    def test_document_type_declaration_is_refused(self):
        # The tool opens no reference an invoice points at, so a DTD is
        # rejected before the parser sees it rather than trusted to be inert.
        payload = (
            b'<?xml version="1.0"?>\n'
            b'<!DOCTYPE Invoice [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>\n'
            b'<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"/>'
        )
        with self.assertRaises(DocumentError) as caught:
            parse_bytes(payload)
        self.assertIn("document type declaration", str(caught.exception))

    def test_oversized_input_is_refused_before_parsing(self):
        with self.assertRaises(DocumentError):
            parse_bytes(b"{}" + b" " * (16 * 1024 * 1024))


class UblParsingTest(unittest.TestCase):
    def setUp(self):
        self.document, _ = load_document(EXAMPLES / "ubl-invoice.xml")

    def test_header_and_parties_are_extracted(self):
        self.assertEqual(self.document["invoice_number"], "INV-2026-0042")
        self.assertEqual(self.document["issue_date"], "2026-08-24")
        self.assertEqual(self.document["currency"], "EUR")
        self.assertEqual(self.document["buyer_reference"], "04011000-12345-34")
        self.assertEqual(self.document["supplier"]["name"], "Supplier GmbH")
        # BT-31 comes from the VAT tax scheme specifically, not from any
        # company ID that happens to be on the party.
        self.assertEqual(self.document["supplier"]["vat_id"], "DE123456789")
        self.assertEqual(self.document["customer"]["country"], "DE")

    def test_lines_totals_and_breakdown_are_extracted(self):
        self.assertEqual([line["description"] for line in self.document["lines"]], ["Consulting", "Printed handbook"])
        self.assertEqual(self.document["totals"]["taxable"], "340.00")
        self.assertEqual(self.document["totals"]["payable"], "300.00")
        self.assertEqual(len(self.document["vat_breakdown"]), 2)
        self.assertEqual(self.document["allowances"][0]["reason"], "Volume discount")
        self.assertEqual(self.document["payment"]["account"], "DE02120300000000202051")

    def test_a_clean_invoice_reports_nothing(self):
        self.assertEqual(check_invoice(self.document), [])

    def test_credit_note_element_names_are_read_too(self):
        source = (EXAMPLES / "ubl-invoice.xml").read_bytes()
        credit_note = (
            source.replace(b"xsd:Invoice-2", b"xsd:CreditNote-2")
            .replace(b"<Invoice ", b"<CreditNote ")
            .replace(b"</Invoice>", b"</CreditNote>")
            .replace(b"cac:InvoiceLine", b"cac:CreditNoteLine")
            .replace(b"cbc:InvoicedQuantity", b"cbc:CreditedQuantity")
            .replace(b"cbc:InvoiceTypeCode>380", b"cbc:CreditNoteTypeCode>381")
            .replace(b"cbc:InvoiceTypeCode", b"cbc:CreditNoteTypeCode")
        )
        document, syntax = parse_bytes(credit_note)
        self.assertEqual(syntax, "ubl")
        self.assertEqual(document["document_type"], "credit_note")
        self.assertEqual(len(document["lines"]), 2)
        self.assertEqual(check_invoice(document), [])


class CiiParsingTest(unittest.TestCase):
    def setUp(self):
        self.document, _ = load_document(EXAMPLES / "cii-invoice.xml")

    def test_cii_dates_are_normalised_to_iso(self):
        # CII writes format="102" dates as YYYYMMDD.
        self.assertEqual(self.document["issue_date"], "2026-08-24")
        self.assertEqual(self.document["due_date"], "2026-09-23")

    def test_reverse_charge_invoice_is_clean(self):
        self.assertEqual(self.document["vat_breakdown"][0]["tax_category"], "AE")
        self.assertEqual(self.document["supplier"]["vat_id"], "DE123456789")
        self.assertEqual(self.document["payment"]["account"], "DE02120300000000202051")
        self.assertEqual(check_invoice(self.document), [])

    def test_missing_exemption_reason_is_a_warning_not_a_rejection(self):
        source = (EXAMPLES / "cii-invoice.xml").read_bytes()
        document, _ = parse_bytes(source.replace(b"<ram:ExemptionReason>Reverse charge</ram:ExemptionReason>", b""))
        findings = {finding["rule"]: finding for finding in check_invoice(document)}
        self.assertIn("INV-029", findings)
        self.assertEqual(findings["INV-029"]["severity"], WARNING)


class PlantedDefectsTest(unittest.TestCase):
    def setUp(self):
        self.document, _ = load_document(EXAMPLES / "ubl-invoice-with-defects.xml")
        self.findings = check_invoice(self.document)

    def test_every_planted_defect_is_reported_and_nothing_else_is(self):
        self.assertEqual(
            {finding["rule"] for finding in self.findings},
            {"INV-020", "INV-023", "INV-024", "INV-027", "INV-030", "INV-033"},
        )

    def test_severities_separate_contradictions_from_profile_risks(self):
        by_rule = {finding["rule"]: finding["severity"] for finding in self.findings}
        self.assertEqual(by_rule["INV-020"], ERROR)
        self.assertEqual(by_rule["INV-023"], ERROR)
        self.assertEqual(by_rule["INV-027"], WARNING)
        self.assertEqual(by_rule["INV-033"], WARNING)

    def test_each_finding_states_the_corrected_figure(self):
        fixes = {finding["rule"]: finding["fix"] for finding in self.findings}
        # A bookkeeper should not have to redo the arithmetic to act on this.
        self.assertIn("386.60", fixes["INV-020"])
        self.assertIn("190.00", fixes["INV-023"])
        self.assertIn("38.00", fixes["INV-024"])

    def test_every_finding_carries_a_rule_severity_message_and_fix(self):
        for finding in self.findings:
            self.assertTrue(finding["rule"] and finding["message"] and finding["fix"])
            self.assertIn(finding["severity"], (ERROR, WARNING))


class ArithmeticRuleTest(unittest.TestCase):
    """Each rule fired by mutating one field of a known-clean invoice."""

    def load(self, replacements):
        source = (EXAMPLES / "ubl-invoice.xml").read_bytes()
        for old, new in replacements:
            self.assertIn(old, source, f"fixture no longer contains {old!r}")
            source = source.replace(old, new)
        document, _ = parse_bytes(source)
        return document

    def test_line_net_must_match_quantity_times_price(self):
        document = self.load([(b'<cbc:LineExtensionAmount currencyID="EUR">200.00', b'<cbc:LineExtensionAmount currencyID="EUR">210.00')])
        self.assertIn("INV-012", findings_by_rule(document))

    def test_price_stated_per_base_quantity_is_not_a_false_alarm(self):
        # BT-149: 200.00 per 2 units is the same line as 100.00 per unit.
        document = self.load(
            [
                (
                    b'<cac:Price><cbc:PriceAmount currencyID="EUR">100.00</cbc:PriceAmount></cac:Price>',
                    b'<cac:Price><cbc:PriceAmount currencyID="EUR">200.00</cbc:PriceAmount>'
                    b"<cbc:BaseQuantity>2</cbc:BaseQuantity></cac:Price>",
                )
            ]
        )
        self.assertNotIn("INV-012", findings_by_rule(document))

    def test_line_level_discount_is_taken_into_account(self):
        # 2 x 100.00 less a 20.00 line discount is 180.00, not a defect.
        document = self.load(
            [
                (
                    b"<cbc:LineExtensionAmount currencyID=\"EUR\">200.00</cbc:LineExtensionAmount>",
                    b"<cbc:LineExtensionAmount currencyID=\"EUR\">180.00</cbc:LineExtensionAmount>"
                    b"<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator>"
                    b"<cbc:Amount currencyID=\"EUR\">20.00</cbc:Amount></cac:AllowanceCharge>",
                )
            ]
        )
        self.assertNotIn("INV-012", findings_by_rule(document))

    def test_tax_exclusive_amount_must_account_for_the_discount(self):
        document = self.load([(b"<cbc:TaxExclusiveAmount currencyID=\"EUR\">340.00", b"<cbc:TaxExclusiveAmount currencyID=\"EUR\">350.00")])
        self.assertIn("INV-018", findings_by_rule(document))

    def test_stated_allowance_total_must_match_the_allowances(self):
        document = self.load([(b"<cbc:AllowanceTotalAmount currencyID=\"EUR\">10.00", b"<cbc:AllowanceTotalAmount currencyID=\"EUR\">15.00")])
        self.assertIn("INV-019", findings_by_rule(document))

    def test_amount_due_must_account_for_the_prepayment(self):
        document = self.load([(b"<cbc:PayableAmount currencyID=\"EUR\">300.00", b"<cbc:PayableAmount currencyID=\"EUR\">386.60")])
        self.assertIn("INV-021", findings_by_rule(document))

    def test_vat_total_must_match_the_sum_of_the_breakdown(self):
        document = self.load([(b"<cbc:TaxAmount currencyID=\"EUR\">46.60", b"<cbc:TaxAmount currencyID=\"EUR\">50.00")])
        self.assertIn("INV-022", findings_by_rule(document))

    def test_line_total_must_match_the_lines(self):
        document = self.load([(b"<cbc:LineExtensionAmount currencyID=\"EUR\">350.00", b"<cbc:LineExtensionAmount currencyID=\"EUR\">360.00")])
        self.assertIn("INV-014", findings_by_rule(document))

    def test_zero_rate_category_may_not_carry_a_rate(self):
        document = self.load([(b"<cbc:ID>S</cbc:ID>\n        <cbc:Percent>7</cbc:Percent>", b"<cbc:ID>E</cbc:ID>\n        <cbc:Percent>7</cbc:Percent>")])
        self.assertIn("INV-025", findings_by_rule(document))

    def test_missing_buyer_reference_does_not_fire_on_the_hand_written_json_shape(self):
        # The v0 JSON shape claims no profile, so holding it to XRechnung's
        # buyer-reference requirement would be inventing a defect.
        plain = json.loads((EXAMPLES / "valid-invoice.json").read_text())
        self.assertNotIn("INV-027", findings_by_rule(plain))


class CliTest(unittest.TestCase):
    def test_xml_report_is_machine_readable_for_an_erp_adapter(self):
        import contextlib
        import io

        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            exit_code = main([str(EXAMPLES / "ubl-invoice-with-defects.xml"), "--format", "json"])
        report = json.loads(buffer.getvalue())
        self.assertEqual(exit_code, 1)
        self.assertEqual(report["status"], "fail")
        self.assertEqual(report["syntax"], "ubl")
        self.assertEqual(report["counts"], {"errors": 4, "warnings": 2})
        # v0 adapters read `errors`; warnings arrived as a new list rather
        # than as a change to the meaning of that one.
        self.assertTrue(all(finding["severity"] == ERROR for finding in report["errors"]))

    def test_warnings_alone_pass_unless_strict_is_asked_for(self):
        import contextlib
        import io

        source = (EXAMPLES / "ubl-invoice.xml").read_bytes()
        without_reference = source.replace(b"<cbc:BuyerReference>04011000-12345-34</cbc:BuyerReference>", b"")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "invoice.xml"
            path.write_bytes(without_reference)
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main([str(path), "--format", "json"]), 0)
                self.assertEqual(main([str(path), "--format", "json", "--strict"]), 1)

    def test_unreadable_input_exits_two_not_one(self):
        # Exit 2 means "I could not check this"; exit 1 means "I checked it
        # and it has defects". An ERP adapter must be able to tell them apart.
        import contextlib
        import io

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "invoice.xml"
            path.write_bytes(b"<html>not an invoice</html>")
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main([str(path)]), 2)

    def test_usage_counter_records_the_syntax_and_the_outcome(self):
        import contextlib
        import io

        with tempfile.TemporaryDirectory() as directory:
            usage_path = Path(directory) / "usage.json"
            with contextlib.redirect_stdout(io.StringIO()):
                main([str(EXAMPLES / "ubl-invoice-with-defects.xml"), "--usage-file", str(usage_path)])
            events = json.loads(usage_path.read_text())["events"]
            self.assertEqual(events["invoice_preflight_checked"], 1)
            self.assertEqual(events["syntax_ubl"], 1)
            self.assertEqual(events["defect_found"], 1)
            self.assertNotIn("preflight_clean", events)


if __name__ == "__main__":
    unittest.main()
