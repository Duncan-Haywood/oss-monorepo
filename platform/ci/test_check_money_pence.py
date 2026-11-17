import pathlib
import re
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import check_money_pence as c  # noqa: E402

BARE = 'const gbp = (n) => "£" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });'


class MoneyPence(unittest.TestCase):
    def test_flags_a_formatter_that_drops_the_trailing_zero(self):
        for text in [
            BARE,
            'const money = (n) => "GBP " + n.toLocaleString("en-GB", { maximumFractionDigits: 2, minimumFractionDigits: 0 });',
            'const format = (v) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;',
        ]:
            self.assertEqual(c.scan_text(text), [1], text)

    def test_accepts_padded_or_two_digit_formatters_and_non_money(self):
        for text in [
            BARE.replace("2 });", '2 }).replace(/\\.\\d$/, (m) => m + "0");'),
            'const gbp = (n) => "£" + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });',
            'const pct = (n) => n.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + "%";',
        ]:
            self.assertEqual(c.scan_text(text), [], text)

    def test_the_padding_gives_two_pence_digits_and_keeps_whole_pounds(self):
        # The fix the check asks for, applied the way the JavaScript regex applies it.
        pad = lambda t: re.sub(r"\.\d$", lambda m: m.group(0) + "0", t)  # noqa: E731
        self.assertEqual(pad("5,955.3"), "5,955.30")
        self.assertEqual(pad("0.5"), "0.50")
        self.assertEqual(pad("751"), "751")
        self.assertEqual(pad("2,191.85"), "2,191.85")

    def test_main_reports_a_file_and_skips_tests(self):
        with tempfile.TemporaryDirectory() as d:
            (pathlib.Path(d) / "calc.mjs").write_text("x\n" + BARE + "\n", encoding="utf-8")
            (pathlib.Path(d) / "calc.test.mjs").write_text(BARE + "\n", encoding="utf-8")
            self.assertEqual(c.main([d]), 1)
            (pathlib.Path(d) / "calc.mjs").write_text("x\n", encoding="utf-8")
            self.assertEqual(c.main([d]), 0)

    def test_the_tree_is_clean(self):
        self.assertEqual(c.main([]), 0)


if __name__ == "__main__":
    unittest.main()
