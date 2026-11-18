"""Flat-amount taxes beside VAT: Malaysia's tourism tax (mirror of flat-tax.test.mjs).

A breakdown row in a scheme other than VAT/GST with no percentage (TTX, scheme AAL,
10 MYR a room-night) is a flat amount: its tax counts toward BT-110, it has no rate
to check, and a line's rate is its VAT/GST category whichever is listed first.
examples/pint-my-tourism-tax-invoice.xml is a made-up invoice.
"""

from __future__ import annotations

import unittest
from decimal import Decimal
from pathlib import Path

from einvoice_preflight.breakdown import inspect_tax_breakdown
from einvoice_preflight.checks import check_invoice
from einvoice_preflight.linenet import flat_tax_total, is_flat_tax_row
from einvoice_preflight.ubl import parse_ubl_invoice

XML = (Path(__file__).resolve().parents[1] / "examples" / "pint-my-tourism-tax-invoice.xml").read_text(encoding="utf-8")
ARITHMETIC = {"INV-011", "INV-012", "INV-014", "INV-017", "INV-018", "INV-038"}


def rules(invoice):
    return sorted(e["rule"] for e in check_invoice(invoice) if e["rule"] in ARITHMETIC)


class FlatTaxTest(unittest.TestCase):
    def test_flat_row_shape(self):
        self.assertTrue(is_flat_tax_row({"tax_scheme": "AAL", "tax": 30}))
        self.assertFalse(is_flat_tax_row({"tax_scheme": "AAL", "tax_percent": 10, "tax": 30}))
        self.assertFalse(is_flat_tax_row({"tax_scheme": "GST", "tax": 30}))
        self.assertEqual(flat_tax_total({"tax_breakdown": [{"tax_scheme": "AAL", "tax": "30.00"}]}), Decimal("30.00"))
        self.assertIsNone(flat_tax_total({"tax_breakdown": [{"tax_scheme": "AAL"}]}))

    def test_reader_takes_the_sst_category(self):
        invoice = parse_ubl_invoice(XML)
        self.assertEqual(invoice["lines"][0]["tax_category"], "SE")
        self.assertEqual(Decimal(str(invoice["lines"][0]["tax_percent"])), Decimal("8"))
        self.assertEqual(invoice["tax_breakdown"][1]["tax_scheme"], "AAL")

    def test_clean_file_passes(self):
        self.assertEqual(rules(parse_ubl_invoice(XML)), [])

    def test_total_without_tourism_tax_is_inv018(self):
        invoice = parse_ubl_invoice(XML)
        invoice["totals"]["tax"] = "63.20"
        invoice["totals"]["gross"] = "853.20"
        found = [e for e in check_invoice(invoice) if e["rule"] == "INV-018"]
        self.assertEqual(len(found), 1)
        self.assertIn("93.20", found[0]["fix"])

    def test_wrong_sst_row_still_inv038(self):
        invoice = parse_ubl_invoice(XML)
        invoice["tax_breakdown"][0]["tax"] = "79.00"
        found = inspect_tax_breakdown(invoice)
        self.assertEqual([e["path"] for e in found], ["/tax_breakdown/0/tax"])

    def test_flat_row_without_tax(self):
        invoice = parse_ubl_invoice(XML)
        del invoice["tax_breakdown"][1]["tax"]
        self.assertEqual([e["path"] for e in inspect_tax_breakdown(invoice)], ["/tax_breakdown/1/tax"])
        self.assertFalse(any(e["rule"] == "INV-018" for e in check_invoice(invoice)))


if __name__ == "__main__":
    unittest.main()
