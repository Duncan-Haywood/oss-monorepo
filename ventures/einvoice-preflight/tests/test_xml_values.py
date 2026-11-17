"""INV-065 on the CLI: a number or date with a non-XML space (xmlvalues.py)."""

import unittest
from pathlib import Path

from einvoice_preflight.checks import check_invoice
from einvoice_preflight.formats import parse_cii_invoice
from einvoice_preflight.ubl import parse_ubl_invoice
from einvoice_preflight.xmlvalues import unreadable_value

ROOT = Path(__file__).resolve().parents[1]
UBL = (ROOT / "examples" / "peppol-credit-note.xml").read_text(encoding="utf-8")
CII = (ROOT / "examples" / "cii-invoice.xml").read_text(encoding="utf-8")


def _inv065(invoice):
    return [f for f in check_invoice(invoice) if f["rule"] == "INV-065"]


class XmlValuesTest(unittest.TestCase):
    def test_unreadable_value_matches_the_page(self):
        for value in ["238.00\u00a0", "\u00a0238.00", "\ufeff1", "2026-11-17\u3000", "20261117\u00a0", "true\u2009", "14:30:00\u00a0", "2026-11-17T14:30:00Z\u00a0"]:
            self.assertTrue(unreadable_value(value), repr(value))
        for value in ["238.00", " 238.00\n", "ACME\u00a0GmbH", "1\u00a0000.00", "", " 14:30:00 ", "14:30\u00a0"]:
            self.assertFalse(unreadable_value(value), repr(value))

    def test_examples_are_clean(self):
        assert _inv065(parse_ubl_invoice(UBL)) == []
        assert _inv065(parse_cii_invoice(CII)) == []

    def test_ubl_amount_with_no_break_space(self):
        xml = UBL.replace("</cbc:PayableAmount>", "\u00a0</cbc:PayableAmount>", 1)
        findings = _inv065(parse_ubl_invoice(xml))
        assert len(findings) == 1
        assert "/CreditNote[1]/LegalMonetaryTotal[1]/PayableAmount[1]" in findings[0]["message"]
        assert "[U+00A0]" in findings[0]["message"]

    def test_ubl_character_reference_reads_the_same(self):
        xml = UBL.replace("</cbc:PayableAmount>", "&#160;</cbc:PayableAmount>", 1)
        assert len(_inv065(parse_ubl_invoice(xml))) == 1

    def test_cii_quantity_with_bom_space(self):
        xml = CII.replace("</ram:BilledQuantity>", "\ufeff</ram:BilledQuantity>", 1)
        findings = _inv065(parse_cii_invoice(xml))
        assert [f["message"].split(" ")[0] for f in findings] == ["BilledQuantity"]


if __name__ == "__main__":
    unittest.main()
