import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from eda_screenplaced import screen  # noqa: E402


class T(unittest.TestCase):
    def test_hv2_known(self):
        self.assertAlmostEqual(screen.hv2([(0, 0)]), 1.21)
        self.assertAlmostEqual(screen.hv2([(0.5, 0.5)]), 0.36)
        self.assertAlmostEqual(screen.hv2([(0, 1.0), (1.0, 0)]), 1.1 * 0.1 + 0.1 * 1.0)

    def test_fronts(self):
        O = np.array([[0, 1], [1, 0], [1, 1], [2, 2.0]])
        self.assertEqual(screen.fronts(O).tolist(), [0, 0, 1, 2])

    def test_oracle_reaches_full_hv(self):
        rs = np.random.RandomState(0)
        O = screen.normalise(rs.uniform(1, 9, 20), rs.uniform(1, 9, 20))
        n_front = int((screen.fronts(O) == 0).sum())
        c = screen.hv_curve(O, screen.oracle_order(O, 20), screen.hv2(O))
        self.assertAlmostEqual(c[n_front - 1], 1.0)
        self.assertTrue(np.all(np.diff(c) >= -1e-12))

    def test_screen_never_reads_unplaced_truth(self):
        """Poisoning the truth of a design the screen has not placed must not change its first choices."""
        rs = np.random.RandomState(1)
        n = 15
        Xs, Xo = rs.uniform(1, 5, (n, 3)), rs.uniform(1, 5, (30, 3))
        ao, po = np.exp(Xo @ [1, .5, .2]), np.exp(Xo @ [.2, 1, .1])
        a, p = np.exp(Xs @ [1, .5, .2]), np.exp(Xs @ [.2, 1, .1])
        base = screen.screen(Xs, a, p, Xo, ao, po, 4, ("ridge", "ridge"), refit=False)
        a2, p2 = a.copy(), p.copy()
        rest = [i for i in range(n) if i not in base]
        a2[rest], p2[rest] = a[rest] * 50, p[rest] / 50
        self.assertEqual(base, screen.screen(Xs, a2, p2, Xo, ao, po, 4, ("ridge", "ridge"), refit=False))

    def test_random_order_is_a_permutation_prefix(self):
        o = screen.random_order(10, 5, np.random.RandomState(0))
        self.assertEqual(len(set(o)), 5)


if __name__ == "__main__":
    unittest.main()
