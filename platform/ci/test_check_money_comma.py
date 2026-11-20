import contextlib
import io
import tempfile
import unittest
from pathlib import Path

import check_money_comma as g

# The 2026-11-20 mrr-pulse line: "29,99" read as 2999.
STRIP = 'import { parseCsv } from "./csv.mjs";\nconst amount = Number(get("amount").replace(/[$,£€\\s]/g, ""));\n'
SHAPE = 'import { parseCsv } from "./csv.mjs";\nconst amount = toAmount(get("amount").replace(/[$£€\\s]/g, ""));\n'


class MoneyComma(unittest.TestCase):
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
        for s in ('.replace(/[$,\\s]/g, "")', ".replace(/[,]/g, '')", '.replace(/[$€£,%\\s]/g, "")', '.replace(/[ $,_]/g,"")'):
            self.assertTrue(g.STRIP.search(s), s)
        # Keeps commas, drops one thousands comma at a time, or replaces with something else.
        for s in ('.replace(/[^0-9.,]/g, "")', '.replace(/,/g, "")', '.replace(/[$\\s]/g, "")', '.replace(/[.,]/g, ".")'):
            self.assertFalse(g.STRIP.search(s), s)

    def test_new_strip_fails_shape_passes(self):
        code, out = self.run_main(self.tree({"ventures/a/csv.mjs": STRIP}))
        self.assertEqual(code, 1)
        self.assertIn("ventures/a/csv.mjs: 1 replace", out)
        self.assertEqual(self.run_main(self.tree({"ventures/a/csv.mjs": SHAPE}))[0], 0)

    def test_files_that_never_mention_csv_are_skipped(self):
        d = self.tree({"ventures/a/calc.mjs": 'const n = Number(v.replace(/[$,\\s]/g, ""));\n'})
        self.assertEqual(self.run_main(d)[0], 0)

    def test_baseline_is_a_ratchet(self):
        d = self.tree({"ventures/a/csv.mjs": STRIP}, "ventures/a/csv.mjs 1\n")
        self.assertEqual(self.run_main(d)[0], 0)
        (d / "ventures/a/csv.mjs").write_text(STRIP + STRIP)
        self.assertEqual(self.run_main(d)[0], 1)
        (d / "ventures/a/csv.mjs").write_text(SHAPE)
        code, out = self.run_main(d)
        self.assertEqual(code, 1)
        self.assertIn("remove its line", out)

    def test_tests_and_node_modules_are_skipped(self):
        d = self.tree({"ventures/a/csv.test.mjs": STRIP, "ventures/a/node_modules/x/csv.js": STRIP})
        self.assertEqual(self.run_main(d)[0], 0)

    def test_repository_is_green(self):
        self.assertEqual(g.compare(g.scan(g.ROOT), g.read_baseline(g.BASELINE)), [])

    def test_the_fixed_parsers_stay_off_the_baseline(self):
        base = g.read_baseline(g.BASELINE)
        for name in ("ventures/mrr-pulse/csv.mjs", "ventures/etsy-ads-roi-analyzer/calc.mjs"):
            self.assertNotIn(name, base)


if __name__ == "__main__":
    unittest.main()
