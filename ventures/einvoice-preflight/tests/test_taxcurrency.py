"""INV-059: BT-111 in the invoice's own currency must equal BT-110.

Mirror of taxcurrency.test.mjs (UBL only; the Python CII reader keeps the first
TaxTotalAmount and does not read a repeat).
"""

from __future__ import annotations

import unittest
from decimal import Decimal
from pathlib import Path

from einvoice_preflight.checks import check_invoice
from einvoice_preflight.taxcurrency import inspect_accounting_currency_tax
from einvoice_preflight.ubl import parse_ubl_invoice

EXAMPLES = Path(__file__).resolve().parents[1] / "examples"
ZATCA = (EXAMPLES / "zatca-simplified-invoice.xml").read_text(encoding="utf-8")
REPEAT = '<cac:TaxTotal>\n    <cbc:TaxAmount currencyID="SAR">15.00</cbc:TaxAmount>\n  </cac:TaxTotal>'
SEEDED = ZATCA.replace(REPEAT, REPEAT.replace("15.00", "22.00"))


def inv059(invoice: dict) -> list[dict]:
    return [finding for finding in check_invoice(invoice) if finding["rule"] == "INV-059"]


class AccountingCurrencyTaxTest(unittest.TestCase):
    def test_seed_is_in_place(self) -> None:
        self.assertIn(REPEAT, ZATCA)
        self.assertNotEqual(SEEDED, ZATCA)

    def test_matching_repeat_is_quiet(self) -> None:
        invoice = parse_ubl_invoice(ZATCA)
        self.assertEqual(invoice["totals"]["tax_accounting_currency"], Decimal("15.00"))
        self.assertEqual(inv059(invoice), [])

    def test_differing_repeat_is_flagged(self) -> None:
        invoice = parse_ubl_invoice(SEEDED)
        self.assertEqual(float(invoice["totals"]["tax"]), 15)
        found = inv059(invoice)
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["path"], "/totals/tax_accounting_currency")
        self.assertIn("22.00", found[0]["message"])
        self.assertIn("15.00", found[0]["fix"])

    def test_other_currency_is_not_compared(self) -> None:
        usd = SEEDED.replace(
            '<cbc:TaxAmount currencyID="SAR">22.00</cbc:TaxAmount>\n  </cac:TaxTotal>',
            '<cbc:TaxAmount currencyID="USD">22.00</cbc:TaxAmount>\n  </cac:TaxTotal>',
        )
        self.assertNotEqual(usd, SEEDED)
        invoice = parse_ubl_invoice(usd)
        self.assertNotIn("tax_accounting_currency", invoice["totals"])
        self.assertEqual(inv059(invoice), [])

    def test_inspector_edges(self) -> None:
        base = {"currency": "EUR", "totals": {"tax": "10.00"}}
        self.assertEqual(inspect_accounting_currency_tax(base), [])
        self.assertEqual(inspect_accounting_currency_tax({**base, "totals": {"tax": "10.00", "tax_accounting_currency": "10"}}), [])
        self.assertEqual(len(inspect_accounting_currency_tax({**base, "totals": {"tax": "10.00", "tax_accounting_currency": "10.01"}})), 1)
        self.assertEqual(inspect_accounting_currency_tax({**base, "totals": {"tax": "10.00", "tax_accounting_currency": "ten"}}), [])
        self.assertEqual(inspect_accounting_currency_tax(None), [])


if __name__ == "__main__":
    unittest.main()
