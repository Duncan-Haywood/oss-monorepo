import contextlib
import io
import tempfile
import unittest
from pathlib import Path

import check_se_tax_floor as c


class SeTaxFloorTest(unittest.TestCase):
    def test_no_floor_is_flagged(self):
        src = "export const se = (p) => p * 0.9235 * 0.153;\n"
        self.assertEqual(len(c.problems_in("ventures/x/calc.mjs", src)), 1)

    def test_floor_in_a_comment_only_is_flagged(self):
        src = "// under $400 owes none\nconst se = p * 0.9235 * 0.153;\n"
        self.assertEqual(len(c.problems_in("ventures/x/calc.mjs", src)), 1)

    def test_floor_comparisons_pass(self):
        for floor in ("if (base < 400) return 0;", "const s = b >= SE_TAX_FLOOR;",
                      "if (cents < 40000) return 0;", "if (n < SE_MINIMUM) return 0;"):
            src = f"const base = p * 0.9235;\n{floor}\n"
            self.assertEqual(c.problems_in("ventures/x/calc.mjs", src), [], floor)

    def test_exempt_and_unrelated_files_pass(self):
        src = "const r = 0.153 * 0.9235;\n"
        self.assertEqual(c.problems_in(next(iter(c.EXEMPT)), src), [])
        self.assertEqual(c.problems_in("ventures/x/calc.mjs", "const x = 1;\n"), [])

    def test_tests_and_node_modules_are_skipped(self):
        self.assertFalse(c.is_candidate("ventures/x/calc.test.mjs"))
        self.assertFalse(c.is_candidate("ventures/x/node_modules/y/a.js"))
        self.assertTrue(c.is_candidate("ventures/x/calc.mjs"))

    def test_main_fails_on_a_finding_with_no_stale_exemption(self):
        # Red-team 2026-11-12: `if found or stale` as `and` passed a real finding.
        with tempfile.TemporaryDirectory(dir=c.ROOT / "ventures") as d:
            bad = Path(d) / "calc.mjs"
            bad.write_text("export const se = (p) => p * 0.9235 * 0.153;\n", encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()) as out:
                self.assertEqual(c.main([str(bad)]), 1)
            self.assertIn("$400", out.getvalue())

    def test_tree_is_clean(self):
        self.assertEqual(c.main([]), 0)


if __name__ == "__main__":
    unittest.main()
