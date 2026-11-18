import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import check_negative_zero_money as c

FIXED = '((t) => (n < 0 && /[1-9∞]/.test(t) ? "-$" : "$") + t)'


class HitsIn(unittest.TestCase):
    def test_flags_each_spelling_that_rounds(self):
        for src in [
            'export const money2 = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);',
            'const m = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");',
            "const usd = v => (v < 0 ? '-' : '') + '$' + Math.round(Math.abs(v));",
            'const g = (n) => (n<0?"-":"") + "£" + round(Math.abs(n), 2);',
            'return (x.total < 0 ? "-$" : "$") + money(Math.abs(x.total)).toFixed(0);',
        ]:
            self.assertEqual(len(c.hits_in(src)), 1, src)

    def test_passes_the_fixed_form(self):
        self.assertEqual(c.hits_in(f"export const money2 = (n) => {FIXED}(Math.abs(n).toFixed(2));"), [])

    def test_passes_integer_minor_units_that_never_round(self):
        src = 'return (n < 0 ? "-" : "") + (e ? `${whole}.${s.slice(-e)}` : whole);'
        self.assertEqual(c.hits_in(src), [])

    def test_reports_the_line_number(self):
        self.assertEqual(c.hits_in('a\nb\nconst f = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);\n')[0][0], 3)


class Scan(unittest.TestCase):
    def test_scan_and_main_exit_codes(self):
        with tempfile.TemporaryDirectory() as d:
            bad = Path(d, "v", "calc.mjs")
            bad.parent.mkdir()
            bad.write_text('export const m = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);\n')
            Path(d, "node_modules").mkdir()
            Path(d, "node_modules", "x.js").write_text(bad.read_text())
            self.assertEqual([p.name for p, _, _ in c.scan([Path(d)])], ["calc.mjs"])
            self.assertEqual(c.main([d]), 1)
            bad.write_text(f"export const m = (n) => {FIXED}(Math.abs(n).toFixed(2));\n")
            self.assertEqual(c.main([d]), 0)


@unittest.skipUnless(shutil.which("node"), "node not installed")
class FixedFormBehaves(unittest.TestCase):
    """The replacement the check recommends prints what a reader expects."""

    def test_values(self):
        js = (f"const money2 = (n) => {FIXED}(Math.abs(n).toFixed(2));"
              f"const money = (n) => {FIXED}(Math.abs(Math.round(n)).toLocaleString('en-US'));"
              "console.log(JSON.stringify([money2(-0.001), money2(0), money2(-0.005), money2(-12.3),"
              " money(-0.4), money(-1234.6), money(-Infinity), money2(NaN)]));")
        out = subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout
        self.assertEqual(out.strip(),
                         '["$0.00","$0.00","-$0.01","-$12.30","$0","-$1,235","-$∞","$NaN"]')


class Tree(unittest.TestCase):
    def test_tree_is_clean(self):
        self.assertEqual(c.main([]), 0)


if __name__ == "__main__":
    unittest.main()
