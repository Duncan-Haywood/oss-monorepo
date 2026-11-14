import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import check_decimal_format as c  # noqa: E402


class DecimalFormat(unittest.TestCase):
    def test_flags_a_delimiter_only_choice(self):
        for text in [
            'const n = normalizeRows(parseCsv(text, delim), { decimalComma: delim === ";" });',
            "const n = norm(parseCsv(t, d), { decimalComma: d === ';', feeMode });",
            'const decimalComma = delim === ";";',
            'const o = { decimalComma: (d == ";") };',
        ]:
            self.assertEqual(c.scan_text(text), [1], text)

    def test_accepts_detection_from_the_values(self):
        for text in [
            'const n = normalizeRows(parseCsv(text, delim), { decimalComma: detectDecimalComma(parseCsv(text, delim), delim) });',
            'const n = normalizeRows(rows, { decimalComma: "auto", delimiter: delim });',
            'return comma === dot ? delim === ";" : comma > dot;',
            'const decimalComma = delim === ";" || hasCommaDecimals(text);',
        ]:
            self.assertEqual(c.scan_text(text), [], text)

    @unittest.skipUnless(shutil.which("node"), "needs node")
    def test_a_copy_that_answers_from_the_delimiter_fails_the_fixtures(self):
        with tempfile.TemporaryDirectory() as d:
            bad = pathlib.Path(d) / "calc.mjs"
            bad.write_text('export function detectDecimalComma(table, delim = ",") { return delim === ";"; }\n')
            hits, n = c.scan([d])
            self.assertEqual(n, 1)
            self.assertTrue(any("fixture 0" in h for h in hits), hits)
            self.assertTrue(any("fixture 1" in h for h in hits), hits)

    @unittest.skipUnless(shutil.which("node"), "needs node")
    def test_the_tree_is_clean(self):
        r = subprocess.run([sys.executable, str(pathlib.Path(c.__file__))], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)


if __name__ == "__main__":
    unittest.main()
