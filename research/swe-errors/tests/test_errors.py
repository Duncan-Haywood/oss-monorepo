import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from swe_errors import boot_median_diff, category_counts, classify, error_share, median, wilson


class T(unittest.TestCase):
    def test_classify(self):
        self.assertEqual(classify("slug collision with a parallel run"), "collision")
        self.assertEqual(classify("pip installed into a different interpreter"), "environment")
        self.assertEqual(classify("killed by the tool timeout"), "timeout")
        self.assertEqual(classify("zzz"), "unclassified")

    def test_counts_and_share(self):
        runs = [{"errors": ["timeout"]}, {"errors": []}, {"errors": ["a", "b"]}]
        self.assertEqual(error_share(runs), (2, 3))
        self.assertEqual(sum(category_counts(runs).values()), 3)

    def test_wilson_bounds(self):
        lo, hi = wilson(5, 10)
        self.assertTrue(lo < 0.5 < hi)
        self.assertEqual(wilson(0, 0), (0.0, 0.0))

    def test_median(self):
        self.assertEqual(median([3, 1, 2]), 2)
        self.assertEqual(median([1, 2, 3, 4]), 2.5)

    def test_boot_covers_known_shift(self):
        d, lo, hi = boot_median_diff([10, 11, 12, 13, 14], [1, 2, 3, 4, 5])
        self.assertEqual(d, 9)
        self.assertTrue(lo <= 9 <= hi)


if __name__ == "__main__":
    unittest.main()
