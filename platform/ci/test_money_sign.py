"""Guard for money_sign.py: no venture formatter prints "-$0.00" for float noise."""
import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import money_sign  # noqa: E402

BAD = 'export const money2 = (x) => `${x < 0 ? "-" : ""}$${Math.abs(x).toFixed(2)}`;\n'
BAD_PLUS = "const usd = (n) => `${n < 0 ? '−' : '+'}$${Math.abs(n).toFixed(2)}`;\n"


class MoneySign(unittest.TestCase):
    def test_flags_both_quote_styles_and_the_plus_variant(self):
        self.assertEqual(money_sign.scan_text(BAD), [1])
        self.assertEqual(money_sign.scan_text("x\n" + BAD_PLUS), [2])

    def test_fix_is_clean_on_rescan_and_leaves_other_code_alone(self):
        fixed = money_sign.fix_text(BAD + BAD_PLUS + "const y = 1;\n")
        self.assertEqual(money_sign.scan_text(fixed), [])
        self.assertIn('x < 0 && Math.abs(x).toFixed(2) !== "0.00" ? "-" : ""', fixed)
        self.assertIn("n < 0 && Math.abs(n).toFixed(2) !== '0.00' ? '−' : '+'", fixed)
        self.assertTrue(fixed.endswith("const y = 1;\n"))

    @unittest.skipUnless(shutil.which("node"), "node not installed")
    def test_fixed_formatter_prints_zero_without_a_minus(self):
        body = money_sign.fix_text(BAD).replace("export ", "")
        script = body + "console.log([0.3 - 0.1 - 0.2, -0.004, -12.5, 0, 3].map(money2).join(' '));\n"
        with tempfile.TemporaryDirectory() as d:
            p = pathlib.Path(d) / "m.mjs"
            p.write_text(script, encoding="utf-8")
            out = subprocess.run(["node", str(p)], capture_output=True, text=True, check=True).stdout.strip()
        self.assertEqual(out, "$0.00 $0.00 -$12.50 $0.00 $3.00")

    def test_no_venture_file_has_the_unguarded_formatter(self):
        found = []
        for rel in money_sign.tracked():
            try:
                text = (money_sign.ROOT / rel).read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                continue
            found += [f"{rel}:{n}" for n in money_sign.scan_text(text)]
        self.assertEqual(found, [], "run: python3 platform/ci/money_sign.py --fix")


if __name__ == "__main__":
    unittest.main()
