import math
import random
import unittest
from categorical_scores import *


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
            for L in (brier_loss, spherical_loss, log_loss):
                self.assertGreater(regret(L, r, p), 0)

    def test_regret_closed_forms(self):
        rng = random.Random(2)
        for _ in range(100):
            p, r = rsimplex(6, rng), rsimplex(6, rng)
            self.assertAlmostEqual(regret(brier_loss, r, p), brier_regret(r, p), 12)
            self.assertAlmostEqual(regret(spherical_loss, r, p), spherical_regret(r, p), 12)
            self.assertAlmostEqual(regret(log_loss, r, p), kl(p, r), 12)

    def test_worst_case_regret_exact(self):
        rng = random.Random(3)
        for _ in range(40):
            K = rng.choice([3, 4, 7])
            p = rsimplex(K, rng)
            mb = max(brier_regret(rsimplex(K, rng), p) for _ in range(3000))
            ms = max(spherical_regret(rsimplex(K, rng), p) for _ in range(3000))
            vb = max(brier_regret([float(j == v) for j in range(K)], p) for v in range(K))
            vs = max(spherical_regret([float(j == v) for j in range(K)], p) for v in range(K))
            self.assertAlmostEqual(vb, max_regret_brier(p), 12)
            self.assertAlmostEqual(vs, max_regret_spherical(p), 12)
            self.assertLessEqual(mb, vb + 1e-12)
            self.assertLessEqual(ms, vs + 1e-12)

    def test_local_curvature(self):
        rng = random.Random(4)
        for _ in range(50):
            p = rsimplex(5, rng)
            d = [rng.gauss(0, 1) for _ in range(5)]
            m = sum(d) / 5
            d = [x - m for x in d]
            t = 1e-4 / max(abs(x) / a for x, a in zip(d, p))
            r = [a + t * x for a, x in zip(p, d)]
            self.assertAlmostEqual(brier_regret(r, p) / (t * t), curv_brier(p, d), 6)
            self.assertAlmostEqual(spherical_regret(r, p) / (t * t) / curv_spherical(p, d), 1, 2)
            self.assertAlmostEqual(kl(p, r) / (t * t) / curv_log(p, d), 1, 2)

    def test_uniform_ratio_is_sqrt_k(self):
        for K in (2, 4, 9, 16):
            p = uniform(K)
            d = [1.0 if j == 0 else -1.0 if j == 1 else 0.0 for j in range(K)]
            per_range_sph = curv_spherical(p, d) / 1.0
            per_range_br = curv_brier(p, d) / 2.0
            self.assertAlmostEqual(per_range_sph / per_range_br, math.sqrt(K), 12)

    def test_pair_shift(self):
        p = rare_class(5, 0.02)
        r = pair_shift(p, 0, 1, 1e-4)
        self.assertAlmostEqual(sum(r), 1, 12)
        d = [-1e-4, 1e-4, 0, 0, 0]
        self.assertAlmostEqual(spherical_regret(r, p), curv_spherical(p, d), 10)


if __name__ == "__main__":
    unittest.main()
