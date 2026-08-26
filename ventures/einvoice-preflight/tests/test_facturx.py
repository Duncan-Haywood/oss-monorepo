"""Factur-X / ZUGFeRD PDF unwrap."""

from __future__ import annotations

import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from einvoice_preflight.checks import check_invoice
from einvoice_preflight.cli import main
from einvoice_preflight.facturx import (
    EmbeddedInvoiceError,
    build_pdf_with_attachment,
    envelope_note,
    extract_embedded_invoice,
    extract_embedded_invoice_xml,
    looks_like_pdf,
    safe_attachment_label,
)
from einvoice_preflight.formats import DocumentError, parse_bytes, parse_cii_invoice

ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = ROOT / "examples"
CII = EXAMPLES / "cii-invoice.xml"
UBL = EXAMPLES / "ubl-invoice.xml"
PDF = EXAMPLES / "factur-x-invoice.pdf"


class FacturxDetectionTest(unittest.TestCase):
    def test_pdf_magic_is_recognised(self) -> None:
        self.assertTrue(looks_like_pdf(b"%PDF-1.4\n"))
        self.assertFalse(looks_like_pdf(CII.read_bytes()))

    def test_shipped_example_round_trips_the_cii_attachment(self) -> None:
        extracted = extract_embedded_invoice_xml(PDF.read_bytes())
        self.assertIn(b"CrossIndustryInvoice", extracted)
        self.assertEqual(parse_cii_invoice(extracted)["invoice_number"], "INV-2026-0043")

    def test_parse_bytes_unwraps_a_facturx_pdf(self) -> None:
        document, syntax = parse_bytes(PDF.read_bytes())
        self.assertEqual(syntax, "cii")
        self.assertEqual(document["invoice_number"], "INV-2026-0043")

    def test_flate_compressed_attachment_still_unwraps(self) -> None:
        pdf = build_pdf_with_attachment(CII.read_bytes(), flate=True)
        extracted = extract_embedded_invoice_xml(pdf)
        self.assertEqual(parse_cii_invoice(extracted)["invoice_number"], "INV-2026-0043")

    def test_preferred_filename_wins_over_an_unrelated_attachment(self) -> None:
        # A decoy text attachment plus the invoice under the Factur-X name.
        decoy = build_pdf_with_attachment(b"not an invoice", filename="notes.txt")
        invoice = build_pdf_with_attachment(CII.read_bytes(), filename="factur-x.xml")
        self.assertIn(b"CrossIndustryInvoice", extract_embedded_invoice_xml(invoice))
        with self.assertRaises(EmbeddedInvoiceError) as caught:
            extract_embedded_invoice_xml(decoy)
        self.assertIn("none of them is UBL", str(caught.exception))

    def test_encrypted_pdf_is_refused(self) -> None:
        pdf = build_pdf_with_attachment(CII.read_bytes(), encrypt=True)
        with self.assertRaises(EmbeddedInvoiceError) as caught:
            extract_embedded_invoice_xml(pdf)
        self.assertIn("encrypted", str(caught.exception))

    def test_pdf_without_attachment_is_refused(self) -> None:
        with self.assertRaises(DocumentError) as caught:
            parse_bytes(b"%PDF-1.4\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n")
        self.assertIn("no embedded invoice file", str(caught.exception))

    def test_ubl_inside_a_pdf_is_recognised(self) -> None:
        pdf = build_pdf_with_attachment(UBL.read_bytes(), filename="xrechnung.xml")
        document, syntax = parse_bytes(pdf)
        self.assertEqual(syntax, "ubl")
        self.assertTrue(document["invoice_number"])


class FacturxCliTest(unittest.TestCase):
    def test_cli_reads_the_shipped_facturx_example(self) -> None:
        with TemporaryDirectory() as tmp:
            usage = Path(tmp) / "usage.json"
            code = main([str(PDF), "--format", "summary", "--usage-file", str(usage)])
            self.assertEqual(code, 0)
            recorded = json.loads(usage.read_text())
            self.assertGreaterEqual(recorded.get("events", {}).get("invoice_preflight_checked", 0), 1)

    def test_cli_directory_scan_includes_pdf(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "invoice.pdf").write_bytes(PDF.read_bytes())
            code = main([str(root), "--format", "summary"])
            self.assertEqual(code, 0)

    def test_shipped_example_is_clean(self) -> None:
        invoice = parse_cii_invoice(extract_embedded_invoice_xml(PDF.read_bytes()))
        self.assertEqual(check_invoice(invoice), [])

    def test_safe_attachment_label_does_not_echo_custom_names(self) -> None:
        self.assertEqual(safe_attachment_label("factur-x.xml"), "factur-x.xml")
        self.assertEqual(safe_attachment_label("XRECHNUNG.XML"), "xrechnung.xml")
        self.assertEqual(safe_attachment_label("notes.txt"), "embedded invoice XML")
        self.assertEqual(safe_attachment_label("=cmd|calc"), "embedded invoice XML")

    def test_extract_returns_the_standard_label(self) -> None:
        payload, label = extract_embedded_invoice(PDF.read_bytes())
        self.assertEqual(label, "factur-x.xml")
        self.assertIn(b"CrossIndustryInvoice", payload)
        self.assertEqual(envelope_note(label, "cii"), "Unwrapped factur-x.xml (CII) from the PDF.")

    def test_cli_summary_names_the_unwrapped_attachment(self) -> None:
        from io import StringIO
        import contextlib

        buffer = StringIO()
        with contextlib.redirect_stdout(buffer):
            code = main([str(PDF), "--format", "summary"])
        self.assertEqual(code, 0)
        self.assertIn("Unwrapped factur-x.xml (CII) from the PDF.", buffer.getvalue())
        self.assertNotIn("notes.txt", buffer.getvalue())
