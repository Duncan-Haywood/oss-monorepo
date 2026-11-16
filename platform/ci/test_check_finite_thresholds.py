"""Tests for check_finite_thresholds.py."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import check_finite_thresholds as cft  # noqa: E402


def flags(source):
    return [flag for _, flag in cft.offending_flags(source)]


class OffendingFlags(unittest.TestCase):
    def test_bare_float_threshold_flags_are_caught(self):
        src = """
p.add_argument("--max-drop", type=float, default=0)
p.add_argument("--min-age-hours", type=float)
p.add_argument("-m", "--max", type=float)
p.add_argument(
    "--fail-under",
    type=float,
)
p.add_argument("--threshold", type=float)
"""
        self.assertEqual(flags(src), ["--max-drop", "--min-age-hours", "--max", "--fail-under", "--threshold"])

    def test_checked_types_and_other_flags_pass(self):
        src = """
p.add_argument("--max-drop", type=finite_nonneg)
p.add_argument("--max-orders", type=int)
p.add_argument("--budget", type=float)
p.add_argument("--maximal", type=float)
p.add_argument("--max-files")
"""
        self.assertEqual(flags(src), [])

    def test_unparseable_source_is_skipped(self):
        self.assertEqual(flags("def broken(:\n"), [])

    def test_tree_is_clean(self):
        self.assertEqual(cft.main(), 0)


if __name__ == "__main__":
    unittest.main()
