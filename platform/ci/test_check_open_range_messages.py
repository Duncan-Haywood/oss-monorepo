"""Tests for check_open_range_messages.py (python3 -m unittest)."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_open_range_messages as c  # noqa: E402


class ScanTest(unittest.TestCase):
    def test_flags_open_default_with_plain_message(self):
        src = "function num(v, name, { min = 0, max = Infinity } = {}) {\n" \
              "  if (v < min || v > max) throw new Error(`${name} must be between ${min} and ${max}`);\n}"
        self.assertEqual([n for n, _ in c.scan(src)], [2])

    def test_passes_when_line_handles_infinity(self):
        src = "const f = (min = 0, max = Infinity) =>\n" \
              "  `must be ${max === Infinity ? `${min} or more` : `between ${min} and ${max}`}`;"
        self.assertEqual(c.scan(src), [])

    def test_passes_with_finite_bounds_only(self):
        src = "function num(v, min = 0, max = 100) { return `between ${min} and ${max}`; }"
        self.assertEqual(c.scan(src), [])

    def test_open_lower_bound_counts(self):
        src = "function num(v, { lo = -Infinity, hi = 10 } = {}) {\n  return `between ${lo} and ${hi}`;\n}"
        self.assertEqual([n for n, _ in c.scan(src)], [2])

    def test_venture_tree_is_clean(self):
        self.assertEqual(c.main([]), 0)


if __name__ == "__main__":
    unittest.main()
