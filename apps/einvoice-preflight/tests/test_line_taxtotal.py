"""The document tax and breakdown come from the root's TaxTotal, not a line's.

Mirror of line-taxtotal.test.mjs. ZATCA invoices carry a TaxTotal on every
line (KSA-11/12) and a prepayment line puts the advance's subtotal there
(KSA-31/32); a SAR invoice also repeats BT-110 as BT-111 with no subtotal.
"""

from __future__ import annotations

import unittest
from pathlib import Path

from einvoice_preflight.breakdown import inspect_tax_breakdown
from einvoice_preflight.checks import check_invoice
from einvoice_preflight.ubl import parse_ubl_invoice

EXAMPLES = Path(__file__).resolve().parents[1] / "examples"


def read(name: str) -> str:
    return (EXAMPLES / name).read_text(encoding="utf-8")


class LineTaxTotalTest(unittest.TestCase):
    def test_breakdown_and_tax_come_from_the_document_level(self) -> None:
        invoice = parse_ubl_invoice(read("zatca-prepayment-rate-change.xml"))
        self.assertEqual(len(invoice["tax_breakdown"]), 1)
        self.assertEqual(float(invoice["tax_breakdown"][0]["tax_percent"]), 15)
        self.assertEqual(float(invoice["tax_breakdown"][0]["taxable"]), 1000)
        self.assertEqual(float(invoice["totals"]["tax"]), 150)

    def test_no_tax_arithmetic_finding_on_the_prepayment_invoice(self) -> None:
        invoice = parse_ubl_invoice(read("zatca-prepayment-rate-change.xml"))
        rules = {finding["rule"] for finding in check_invoice(invoice)}
        self.assertFalse(rules & {"INV-017", "INV-018", "INV-038"}, rules)

    def test_sar_repeat_is_not_added_twice(self) -> None:
        invoice = parse_ubl_invoice(read("zatca-simplified-invoice.xml"))
        self.assertEqual(float(invoice["totals"]["tax"]), 15)

    def test_zero_net_rate_group_needs_no_row(self) -> None:
        base = {
            "lines": [
                {"description": "Widgets", "quantity": 1, "unit_price": 100, "net": 100, "tax_percent": 15},
                {"description": "Advance deducted", "quantity": 0, "unit_price": 0, "net": 0, "tax_percent": 5},
            ],
            "tax_breakdown": [{"tax_percent": 15, "taxable": 100, "tax": 15}],
        }
        self.assertEqual(inspect_tax_breakdown(base), [])
        base["lines"][1] = {"description": "Gadget", "quantity": 1, "unit_price": 10, "net": 10, "tax_percent": 5}
        self.assertTrue(any("missing a row" in f["message"] for f in inspect_tax_breakdown(base)))


if __name__ == "__main__":
    unittest.main()
