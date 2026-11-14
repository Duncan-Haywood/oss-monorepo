import contextlib
import io
import tempfile
import unittest
from pathlib import Path

import check_loose_number_pattern as g

# The 2026-11-14 ucr-fee-calculator line: "0-2: ," parsed as a $0 bracket.
LOOSE = r'const m = /^(\d+)\s*(?:-\s*(\d+)|(\+))\s*:\s*\$?([\d,]+(?:\.\d+)?)$/.exec(line);' + "\n"
STRICT = r'const m = /^(\d+)\s*(?:-\s*(\d+)|(\+))\s*:\s*\$?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)$/.exec(line);' + "\n"


class LooseNumberPattern(unittest.TestCase):
    def tree(self, files, baseline=""):
        d = Path(tempfile.mkdtemp())
        for rel, text in files.items():
            p = d / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(text)
        (d / "base.txt").write_text(baseline)
        return d

    def run_main(self, d):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = g.main(["--root", str(d), "--baseline", str(d / "base.txt")])
        return code, out.getvalue()

    def test_pattern_shapes(self):
        for s in (r"([\d,]+)", r"([\d.,]+)", r"([\d,.]+)", r"(-?[\d,.]+)", r"(\$?\s*[\d.,]+)"):
            self.assertTrue(g.LOOSE.search(s), s)
        for s in (r"([\d.]+)", r"(\d+)", r"[\d,]+", r"(\d{1,3}(?:,\d{3})+)"):
            self.assertFalse(g.LOOSE.search(s), s)

    def test_new_loose_capture_fails_strict_passes(self):
        code, out = self.run_main(self.tree({"ventures/a/calc.mjs": LOOSE}))
        self.assertEqual(code, 1)
        self.assertIn("ventures/a/calc.mjs: 1 loose", out)
        code, _ = self.run_main(self.tree({"ventures/a/calc.mjs": STRICT}))
        self.assertEqual(code, 0)

    def test_baseline_is_a_ratchet(self):
        d = self.tree({"ventures/a/calc.mjs": LOOSE}, "ventures/a/calc.mjs 1\n")
        self.assertEqual(self.run_main(d)[0], 0)
        (d / "ventures/a/calc.mjs").write_text(LOOSE * 2)
        self.assertEqual(self.run_main(d)[0], 1)
        (d / "ventures/a/calc.mjs").write_text(STRICT)
        code, out = self.run_main(d)
        self.assertEqual(code, 1)
        self.assertIn("remove its line", out)

    def test_tests_and_node_modules_are_skipped(self):
        d = self.tree({"ventures/a/calc.test.mjs": LOOSE, "ventures/a/node_modules/x/i.js": LOOSE})
        self.assertEqual(self.run_main(d)[0], 0)

    def test_repository_is_green(self):
        self.assertEqual(g.compare(g.scan(g.ROOT), g.read_baseline(g.BASELINE)), [])


if __name__ == "__main__":
    unittest.main()
