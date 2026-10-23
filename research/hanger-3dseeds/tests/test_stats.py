import sys
import unittest
from pathlib import Path

R = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(R / "hanger-3dseeds" / "src"), str(R / "hanger-fit" / "src")]
from hanger3dseeds.bounds import WIDE, to_wide  # noqa: E402
from hanger3dseeds.stats import boot_ci, perm_p  # noqa: E402


class T(unittest.TestCase):
    def test_perm_exact_small(self):
        # [1,2] vs [3,4]: 6 splits, |diff|=2 reached by 2 of them -> p = 1/3
        self.assertAlmostEqual(perm_p([1, 2], [3, 4]), 2 / 6)

    def test_perm_identical(self):
        self.assertEqual(perm_p([1, 2, 3], [1, 2, 3]), 1.0)

    def test_ci_brackets_shift(self):
        lo, hi = boot_ci([5.0, 5.1, 4.9, 5.0], [1.0, 1.1, 0.9, 1.0])
        self.assertTrue(lo > 3.5 and hi < 4.5)

    def test_bounds(self):
        import numpy as np
        h = to_wide(np.ones(4))
        self.assertEqual((h.bow, h.r), (5.0, 6.0))
        self.assertEqual(to_wide(np.zeros(4)).w, WIDE[0, 0])


if __name__ == "__main__":
    unittest.main()
