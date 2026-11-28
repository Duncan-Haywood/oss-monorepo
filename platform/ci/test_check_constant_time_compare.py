"""Tests for check_constant_time_compare.py (red-team 2026-11-28)."""

import subprocess
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_constant_time_compare import problems_in  # noqa: E402

GOOD = """
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
"""

SEEDED = """
  let d = got.length ^ rec.hash.length;
  for (let i = 0; i < Math.min(got.length, rec.hash.length); i++) d |= got.charCodeAt(i) ^ rec.hash.charCodeAt(i);
"""

MULTILINE = """
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
"""


class ConstantTimeCompare(unittest.TestCase):
    def test_correct_shapes_pass(self):
        for src in (GOOD, SEEDED, MULTILINE):
            self.assertEqual(problems_in(src), [], src)

    def test_skipped_first_character(self):
        bad = GOOD.replace("let i = 0", "let i = 1")
        self.assertTrue(any("starts at i = 1" in p for p in problems_in(bad)))

    def test_missing_length_check(self):
        bad = GOOD.replace("  if (a.length !== b.length) return false;\n", "")
        self.assertTrue(any("no length check" in p for p in problems_in(bad)))

    def test_short_bound(self):
        bad = GOOD.replace("i < a.length", "i < a.length - 1")
        self.assertTrue(any("not the full length" in p for p in problems_in(bad)))

    def test_min_bound_without_seed(self):
        bad = SEEDED.replace("let d = got.length ^ rec.hash.length;", "if (got.length !== rec.hash.length) return;\n  let d = 0;")
        self.assertTrue(any("Math.min" in p for p in problems_in(bad)))

    def test_tree_is_clean(self):
        here = Path(__file__).resolve().parent
        r = subprocess.run([sys.executable, str(here / "check_constant_time_compare.py")], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("compare loop(s)", r.stdout)


if __name__ == "__main__":
    unittest.main()
