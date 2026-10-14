import math
import random
import unittest
from ordinal_scores import *


def rsimplex(K, rng):
    x = [rng.expovariate(1) for _ in range(K)]
    s = sum(x)
    return [a / s for a in x]


class T(unittest.TestCase):
    def test_strictly_proper(self):
        rng = random.Random(1)
        for _ in range(300):
            K = rng.choice([3, 5, 8])
            p, r = rsimplex(K, rng), rsimplex(K, rng)
            self.assertGreater(regret(rps_loss, r, p), 0)
            self.assertAlmostEqual(regret(rps_loss, p, p), 0, 12)

    def test_regret_closed_form(self):
        rng = random.Random(2)
        for _ in range(100):
            p, r = rsimplex(6, rng), rsimplex(6, rng)
            self.assertAlmostEqual(regret(rps_loss, r, p), rps_regret(r, p), 12)
            self.assertAlmostEqual(regret(brier_loss, r, p), brier_regret(r, p), 12)

    def test_shift_law(self):
        p = [.1, .2, .3, .25, .15]
        for i, j in ((0, 1), (0, 4), (3, 1), (2, 2)):
            r = shift(p, i, j, 0.05)
            self.assertAlmostEqual(rps_regret(r, p), shift_regret_rps(i, j, .05), 14)
            if i != j:
                self.assertAlmostEqual(brier_regret(r, p), shift_regret_brier(i, j, .05), 14)

    def test_worst_case_exact(self):
        rng = random.Random(3)
        for _ in range(40):
            K = rng.choice([3, 4, 7])
            p = rsimplex(K, rng)
            m = max(rps_regret(rsimplex(K, rng), p) for _ in range(3000))
            self.assertLessEqual(m, max_regret_rps(p) + 1e-12)
            self.assertLessEqual(max_regret_rps(p), K - 1)
            vb = max(brier_regret([float(j == v) for j in range(K)], p) for v in range(K))
            self.assertAlmostEqual(vb, max_regret_brier(p), 12)

    def test_merge(self):
        rng = random.Random(4)
        for _ in range(50):
            p = rsimplex(6, rng)
            i = rng.randrange(5)
            r = merge(p, i)
            self.assertAlmostEqual(rps_regret(r, p), merge_regret_rps(p, i), 14)
            self.assertAlmostEqual(brier_regret(r, p), merge_regret_brier(p, i), 14)
            self.assertAlmostEqual(merge_regret_rps(p, i) * 2, merge_regret_brier(p, i), 14)

    def test_threshold_transfer(self):
        rng = random.Random(5)
        for _ in range(200):
            p, r = rsimplex(6, rng), rsimplex(6, rng)
            g = threshold_gap_bound(rps_regret(r, p))
            self.assertLessEqual(max(abs(a - b) for a, b in zip(cdf(r), cdf(p))), g + 1e-12)

    def test_brier_blind_to_order(self):
        p = [.5, .3, .1, .05, .05]
        near, far = shift(p, 0, 1, .04), shift(p, 0, 4, .04)
        self.assertAlmostEqual(brier_regret(near, p), brier_regret(far, p), 14)
        self.assertAlmostEqual(rps_regret(far, p) / rps_regret(near, p), 4, 12)


if __name__ == "__main__":
    unittest.main()
