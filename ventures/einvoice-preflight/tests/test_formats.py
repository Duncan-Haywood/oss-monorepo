"""CII (UN/CEFACT CrossIndustryInvoice) read path.

UBL stays on ubl.py. This module only covers the ERP syntax that was still
off main: XRechnung CII / Factur-X XML.
"""

from __future__ import annotations

import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from einvoice_preflight.checks import check_invoice
from einvoice_preflight.cli import main
from einvoice_preflight.formats import (
    DocumentError,
    detect_syntax,
    parse_bytes,
    parse_cii_invoice,
)

ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = ROOT / "examples"
CII = EXAMPLES / "cii-invoice.xml"


class CiiDetectionTest(unittest.TestCase):
    def test_shipped_example_is_recognised_as_cii(self) -> None:
        self.assertEqual(detect_syntax(CII.read_bytes()), "cii")

    def test_detection_reads_content_not_the_extension(self) -> None:
        self.assertEqual(detect_syntax(CII.read_bytes()), "cii")

    def test_unrelated_xml_is_not_silently_treated_as_cii(self) -> None:
        with self.assertRaises(DocumentError) as caught:
            detect_syntax(b"<Order><ID>1</ID></Order>")
        self.assertIn("CrossIndustryInvoice", str(caught.exception))

    def test_document_type_declaration_is_refused(self) -> None:
        with self.assertRaises(DocumentError):
            parse_bytes(b'<!DOCTYPE CrossIndustryInvoice [<!ENTITY x "x">]>' + CII.read_bytes())


class CiiParsingTest(unittest.TestCase):
    def setUp(self) -> None:
        self.invoice = parse_cii_invoice(CII.read_bytes())

    def test_cii_dates_are_normalised_to_iso(self) -> None:
        self.assertEqual(self.invoice["issue_date"], "2026-08-24")
        self.assertEqual(self.invoice["due_date"], "2026-09-23")

    def test_parties_and_reverse_charge_are_extracted(self) -> None:
        self.assertEqual(self.invoice["invoice_number"], "INV-2026-0043")
        self.assertEqual(self.invoice["currency"], "EUR")
        self.assertEqual(self.invoice["supplier"]["name"], "Supplier GmbH")
        self.assertEqual(self.invoice["supplier"]["vat_id"], "DE136695976")
        self.assertEqual(self.invoice["customer"]["name"], "Acheteur SARL")
        self.assertEqual(self.invoice["lines"][0]["net"], "250.00")
        self.assertEqual(self.invoice["tax_breakdown"][0]["tax_category"], "AE")
        self.assertEqual(self.invoice["payment"]["iban"], "DE02120300000000202051")
        self.assertEqual(self.invoice["tax_exemption_reason"], "Reverse charge")

    def test_reverse_charge_invoice_is_clean(self) -> None:
        self.assertEqual(check_invoice(self.invoice), [])

    def test_missing_exemption_reason_is_observed(self) -> None:
        source = CII.read_bytes().replace(
            b"<ram:ExemptionReason>Reverse charge</ram:ExemptionReason>",
            b"",
        )
        findings = {finding["rule"]: finding for finding in check_invoice(parse_cii_invoice(source))}
        self.assertIn("INV-035", findings)


class CiiCliTest(unittest.TestCase):
    def test_cli_reads_the_shipped_cii_example(self) -> None:
        with TemporaryDirectory() as tmp:
            usage = Path(tmp) / "usage.json"
            code = main([str(CII), "--format", "summary", "--usage-file", str(usage)])
            self.assertEqual(code, 0)
            recorded = json.loads(usage.read_text())
            self.assertEqual(recorded["events"]["invoice_preflight_checked"], 1)
            # Usage never stores invoice content.
            dumped = json.dumps(recorded)
            self.assertNotIn("INV-2026-0043", dumped)
            self.assertNotIn("DE02120300000000202051", dumped)


if __name__ == "__main__":
    unittest.main()
