import pathlib
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import check_date_digit_boundary as c  # noqa: E402


class DateDigitBoundary(unittest.TestCase):
    def test_flags_dates_that_stop_mid_number(self):
        for line in [
            r"let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);",
            r"let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(.*)$/);",
            r"m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(.*)$/);",
            r"else if ((m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})/.exec(s))) {",
            r"if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/))) [d, m, y] = m;",
            r"let m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2}))?/);",
            r"const m = /^(\d{1,2})([/.-])(\d{1,2})\2(\d{4})/.exec(v);",
        ]:
            self.assertEqual(c.scan_text(line), [1], line)

    def test_accepts_bounded_dates(self):
        for line in [
            r"let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/);",
            r"let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);",
            r"m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)(.*)$/);",
            r"m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);",
            r"m = /^(\d{1,2})([\/.-])(\d{1,2})[\/.-](\d{2}|\d{4})[T\s]+(\d{1,2})/i.exec(s);",
            r"m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:[T\s]+(\d{1,2}):(\d{2}))?$/i);",
            r"const ok = /^\d{4}-\d{2}-\d{2}$/.test(s);",
        ]:
            self.assertEqual(c.scan_text(line), [], line)

    def test_the_fix_reads_what_it_should(self):
        # The fixed shapes, run through Python's re (same semantics for these constructs).
        import re
        iso = re.compile(r"^(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)")
        us = re.compile(r"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)")
        self.assertIsNone(iso.match("2025-03-091"))
        self.assertEqual(iso.match("2025-3-5T10:00").groups(), ("2025", "3", "5"))
        self.assertIsNone(us.match("01/05/20261"))
        self.assertEqual(us.match("01/05/2026 9:00").group(3), "2026")
        self.assertEqual(us.match("01/05/26").group(3), "26")

    def test_scan_skips_tests_and_node_modules(self):
        with tempfile.TemporaryDirectory() as d:
            root = pathlib.Path(d)
            bad = r"let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);" + "\n"
            (root / "calc.mjs").write_text(bad)
            (root / "calc.test.mjs").write_text(bad)
            (root / "node_modules").mkdir()
            (root / "node_modules" / "x.js").write_text(bad)
            hits = c.scan([root])
            self.assertEqual(len(hits), 1)
            self.assertTrue(hits[0].endswith("calc.mjs:1"))
            self.assertEqual(c.main([str(root)]), 1)

    def test_the_tree_is_clean(self):
        self.assertEqual(c.scan([c.ROOT / "ventures", c.ROOT / "platform"]), [])


if __name__ == "__main__":
    unittest.main()
