"""Amounts the CLI and the web page must read the same way, and never crash on.

Red-team run 2026-11-11 found four defects behind one cause, each reproduced
before the fix: a UBL amount that is not a number raised decimal.InvalidOperation
(an ArithmeticError, not the ValueError the CLI catches) and the batch died with a
traceback; a gross of "inf" or "nan" crashed the credit-note linker on a whole
directory; a quantity of 1e27 overflowed Decimal's 28-digit context when the line
was rounded to cents; and Decimal accepted "1_000" and Arabic-Indic digits while
the browser rejected them (and the browser accepted "0x64" while this side did not).
"""

import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from einvoice_preflight.checks import check_invoice
from einvoice_preflight.cli import main
from einvoice_preflight.creditlink import credit_link_findings
from einvoice_preflight.numbers import parse_decimal

EXAMPLES = Path(__file__).resolve().parents[1] / "examples"


def invoice(**over):
    base = {
        "invoice_number": "INV-1", "issue_date": "2026-08-24", "currency": "EUR",
        "supplier": {"id": "S1", "name": "Supplier"}, "customer": {"id": "C1", "name": "Customer"},
        "lines": [{"description": "Work", "quantity": 2, "unit_price": 100, "tax_percent": 19, "net": 200}],
        "totals": {"net": 200, "tax": 38, "gross": 238},
    }
    base.update(over)
    return base


class ParseDecimal(unittest.TestCase):
    def test_plain_numbers_read(self):
        for text, want in [("12.50", "12.50"), (" 3 ", "3"), ("-4", "-4"), ("+.5", "0.5"),
                           ("5.", "5"), ("1e-7", "1E-7"), (238, "238"), (1e-07, "1E-7")]:
            self.assertEqual(str(parse_decimal(text)), want, text)

    def test_what_the_browser_rejects_is_rejected(self):
        for text in ["0x64", "0b11", "0o7", "1_000", "١٢", "1,00", "nan", "inf",
                     "-Infinity", "", " ", ".", True, None, [1]]:
            self.assertIsNone(parse_decimal(text), repr(text))

    def test_magnitudes_a_browser_cannot_hold_to_the_cent_are_rejected(self):
        self.assertIsNotNone(parse_decimal("999999999999999.99"))
        for text in ["1e15", "1000000000000000", "1e27", "1e999999", "1e9999999999999999999999"]:
            self.assertIsNone(parse_decimal(text), text)


class NeverCrash(unittest.TestCase):
    def test_huge_quantity_is_a_finding_not_a_crash(self):
        for quantity in ["1e27", "1e30", "99999999999999"]:
            line = {"description": "Work", "quantity": quantity, "unit_price": "999999999999",
                    "tax_percent": 19, "net": 200}
            rules = {e["rule"] for e in check_invoice(invoice(lines=[line]))}
            self.assertTrue(rules, quantity)

    def test_hex_amounts_are_invalid_as_in_the_browser(self):
        line = {"description": "Work", "quantity": "0x2", "unit_price": "0x64", "tax_percent": 19, "net": 200}
        rules = {e["rule"] for e in check_invoice(invoice(lines=[line]))}
        self.assertIn("INV-009", rules)
        self.assertIn("INV-010", rules)

    def test_infinite_gross_does_not_crash_the_credit_linker(self):
        for gross in ["inf", "nan", "1e400"]:
            original = invoice(invoice_number="INV-1001", totals={"net": 1, "tax": 0, "gross": gross})
            note = invoice(invoice_number="CN-1", document_type="credit_note", original_invoice="INV-1001",
                           totals={"net": 1, "tax": 0, "gross": gross})
            # raised OverflowError / ValueError before, killing a whole-directory run
            credit_link_findings([(Path("inv.json"), original), (Path("cn.json"), note)])

    def test_a_ubl_amount_that_is_not_a_number_is_a_read_error_not_a_traceback(self):
        source = (EXAMPLES / "ubl-invoice.xml").read_text(encoding="utf-8")
        start = source.index("<cbc:PriceAmount")
        end = source.index("</cbc:PriceAmount>", start)
        bad = source[:source.index(">", start) + 1] + "abc" + source[end:]
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "a-bad.xml").write_text(bad, encoding="utf-8")
            Path(tmp, "b-good.json").write_text(json.dumps(invoice()), encoding="utf-8")
            out = io.StringIO()
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()):
                main([tmp, "--format", "json"])
        report = json.loads(out.getvalue())
        self.assertIn("not a number", json.dumps(report))
        self.assertIn("b-good.json", json.dumps(report))


if __name__ == "__main__":
    unittest.main()
