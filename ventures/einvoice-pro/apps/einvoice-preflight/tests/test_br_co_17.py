"""BR-CO-17 tolerance, mirror of br-co-17-tolerance.test.mjs (added 2026-11-27).

The CLI has no warning severity, so a row under one currency unit off taxable x rate on an
EN 16931 document is silent here (the browser reports it as an INV-038 warning).
"""

from __future__ import annotations

import unittest
from pathlib import Path

from einvoice_preflight.checks import check_invoice
from einvoice_preflight.ubl import parse_ubl_invoice

BASE = (Path(__file__).resolve().parents[1] / "examples" / "ubl-invoice.xml").read_text(encoding="utf-8")


def shifted(off: float, row_off: float | None = None, xml: str = BASE) -> str:
    row_off = off if row_off is None else row_off
    f = lambda n, d: f"{n + d:.2f}"  # noqa: E731
    return (xml.replace(">38.00<", f">{f(38, row_off)}<", 1)
            .replace(">48.50<", f">{f(48.5, off)}<", 1)
            .replace(">398.50<", f">{f(398.5, off)}<", 1)
            .replace(">300.00</cbc:PayableAmount", f">{f(300, off)}</cbc:PayableAmount", 1))


def rules(xml: str) -> list[str]:
    return sorted({f["rule"] for f in check_invoice(parse_ubl_invoice(xml)) if f["rule"] in ("INV-018", "INV-038")})


class BrCo17Tolerance(unittest.TestCase):
    def test_example_clean(self):
        self.assertEqual(rules(BASE), [])

    def test_within_a_unit_passes(self):
        for off in (0.01, 0.99, -0.99):
            self.assertEqual(rules(shifted(off)), [], off)

    def test_a_unit_or_more_blocks(self):
        for off in (1, 1.2):
            self.assertEqual(rules(shifted(off)), ["INV-018", "INV-038"], off)

    def test_total_neither_reading_blocks(self):
        self.assertEqual(rules(shifted(0.02, row_off=0.01)), ["INV-018"])

    def test_pint_keeps_exact_test(self):
        import re
        pint = re.sub(r"<cbc:CustomizationID>[^<]*<", "<cbc:CustomizationID>urn:peppol:pint:billing-1@aunz-1<", BASE, count=1)
        self.assertEqual(rules(shifted(0.01, xml=pint)), ["INV-018", "INV-038"])


if __name__ == "__main__":
    unittest.main()
