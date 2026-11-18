import tempfile
import unittest
from pathlib import Path

import tax_year_staleness as t


class Scan(unittest.TestCase):
    def mk(self, files):
        d = Path(tempfile.mkdtemp())
        for name, text in files.items():
            (d / name).write_text(text)
        return d

    def test_old_year_flagged(self):
        d = self.mk({"calc.mjs": "// IRS Rev. Proc. 2025-16 limits\n// IRS IRS tax limit for 2025\n"})
        newest, auth, _ = t.scan(d, 2026)
        self.assertEqual(newest, 2025)
        self.assertGreaterEqual(auth, 2)

    def test_current_year_wins(self):
        d = self.mk({"calc.mjs": "// tax limit 2025\n// tax limit 2026\n"})
        self.assertEqual(t.scan(d, 2026)[0], 2026)

    def test_tests_and_money_amounts_ignored(self):
        d = self.mk({"calc.test.mjs": "// tax 2026\n", "calc.mjs": "// tax rate $2,025 and 12025\n"})
        self.assertEqual(t.scan(d, 2026)[0], 0)

    def test_fixture_dir_ignored_but_other_dirs_scanned(self):
        d = self.mk({})
        (d / "fixture").mkdir()
        (d / "fixture" / "a.mjs").write_text("// tax 2026\n")
        (d / "src").mkdir()
        (d / "src" / "b.mjs").write_text("// tax 2024\n")
        self.assertEqual(t.scan(d, 2026)[0], 2024)

    def test_next_year_counts_but_not_two_ahead(self):
        d = self.mk({"a.mjs": "// tax 2027\n"})
        self.assertEqual(t.scan(d, 2026)[0], 2027)
        d = self.mk({"a.mjs": "// tax 2028\n"})
        self.assertEqual(t.scan(d, 2026)[0], 0)
        d = self.mk({"a.mjs": "// tax 2024\n// 2027 plain text\n"})
        self.assertEqual(t.scan(d, 2026)[0], 2024)

    def test_shipped_filters_each_condition_independently(self):
        d = self.mk({"a.mjs": "x", "notes.txt": "x", "test_b.py": "x", "c_test.py": "x",
                     "d.test.mjs": "x", "e.py": "x"})
        (d / "node_modules").mkdir()
        (d / "node_modules" / "n.mjs").write_text("x")
        (d / "sub.mjs").mkdir()  # a directory with a shipped suffix
        names = sorted(p.name for p in t.shipped(d))
        self.assertEqual(names, ["a.mjs", "e.py"])

    def test_test_file_naming_patterns_each_excluded(self):
        for n in ("test_x.py", "x_test.py", "x.test.mjs"):
            d = self.mk({n: "// tax 2026\n"})
            self.assertEqual(t.scan(d, 2026)[0], 0, n)

    def test_line_length_cutoff_is_600(self):
        pad = "x" * (600 - len("// tax 2024 "))
        d = self.mk({"a.mjs": "// tax 2024 " + pad + "\n"})
        self.assertEqual(len("// tax 2024 " + pad), 600)
        self.assertEqual(t.scan(d, 2026)[0], 2024)
        d = self.mk({"a.mjs": "// tax 2024 " + pad + "x\n"})
        self.assertEqual(t.scan(d, 2026)[0], 0)


class Main(unittest.TestCase):
    def run_main(self, products, argv):
        import contextlib
        import io
        import json
        import sys
        from unittest import mock
        root = Path(tempfile.mkdtemp())
        (root / "ventures").mkdir()
        for name, text in products.items():
            (root / "ventures" / name).mkdir()
            (root / "ventures" / name / "a.mjs").write_text(text)
        buf = io.StringIO()
        with mock.patch.object(t, "ROOT", root), mock.patch.object(sys, "argv", ["x", *argv]), \
                contextlib.redirect_stdout(buf):
            self.assertEqual(t.main(), 0)
        return buf.getvalue(), json

    def test_threshold_of_three_authority_mentions(self):
        three = "// IRS IRS IRS tax 2024\n"
        two = "// IRS IRS tax 2024\n"
        out, json = self.run_main({"three": three, "two": two}, ["--year", "2026", "--json"])
        self.assertEqual([r["product"] for r in json.loads(out)], ["three"])

    def test_current_year_and_no_year_not_flagged(self):
        cur = "// IRS IRS IRS tax 2026\n"
        none = "// IRS IRS IRS tax\n"
        out, json = self.run_main({"cur": cur, "none": none}, ["--year", "2026", "--json"])
        self.assertEqual(json.loads(out), [])

    def test_json_output_is_indent_1(self):
        out, _ = self.run_main({"p": "// IRS IRS IRS tax 2024\n"}, ["--year", "2026", "--json"])
        self.assertIn('\n  "product"', out)

    def test_default_limit_is_40(self):
        products = {f"p{i:03d}": "// IRS IRS IRS tax 2024\n" for i in range(45)}
        out, _ = self.run_main(products, ["--year", "2026"])
        self.assertEqual(len(out.strip().splitlines()), 1 + 40)


if __name__ == "__main__":
    unittest.main()
