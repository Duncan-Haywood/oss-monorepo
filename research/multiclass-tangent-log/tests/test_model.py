import math
import random
import unittest
from multiclass_tangent_log import *


def rsimplex(K, rng):
    x = [rng.expovariate(1) ** 3 for _ in range(K)]  # heavy: many coordinates below eps
    s = sum(x)
    return [a / s for a in x]


class T(unittest.TestCase):
    def test_c2_and_convex(self):
        eps = 0.05
        self.assertAlmostEqual(psi(eps, eps), eps * math.log(eps), 14)
        for f, g in ((psi, dpsi), (dpsi, d2psi)):
            a, b = f(eps - 1e-9, eps), f(eps + 1e-9, eps)
            self.assertAlmostEqual(a, b, 6)
        for x in (0.0, 0.01, 0.05, 0.3):
            self.assertGreater(d2psi(x, eps), 0)

    def test_strictly_proper(self):
        rng = random.Random(1)
        for _ in range(500):
            K = rng.choice([3, 5, 8])
            p, r = rsimplex(K, rng), rsimplex(K, rng)
            eps = rng.choice([0.2, 0.05, 0.001])
            self.assertGreater(regret(r, p, eps), 0)
            self.assertAlmostEqual(regret(r, p, eps), sum(bregman1(a, b, eps) for a, b in zip(p, r)), 10)

    def test_equals_log_inside(self):
        rng = random.Random(2)
        eps = 0.01
        for _ in range(200):
            K = 5
            r = [eps + (1 - K * eps) * x for x in rsimplex(K, rng)]
            for y in range(K):
                self.assertAlmostEqual(loss(r, y, eps), -math.log(r[y]), 12)

    def test_range_exact(self):
        rng = random.Random(3)
        for K in (2, 3, 6):
            for eps in (0.2, 0.01):
                vals = []
                for _ in range(20000):
                    r = rsimplex(K, rng)
                    vals += [loss(r, y, eps) for y in range(K)]
                for j in range(K):
                    e = [float(i == j) for i in range(K)]
                    vals += [loss(e, y, eps) for y in range(K)]
                self.assertAlmostEqual(max(vals) - min(vals), range_exact(K, eps), 9)
                self.assertGreaterEqual(range_exact(K, eps) + 1e-12, max(vals) - min(vals))

    def test_worst_case_regret_vertex(self):
        rng = random.Random(4)
        for _ in range(30):
            K = rng.choice([3, 5])
            eps = rng.choice([0.1, 0.01])
            p = rsimplex(K, rng)
            m = max(regret(rsimplex(K, rng), p, eps) for _ in range(3000))
            self.assertLessEqual(m, max_regret(p, eps) + 1e-12)

    def test_curvature_matches_regret(self):
        p, eps, t = [0.3, 0.2, 0.4, 0.1], 0.05, 1e-5
        d = [1, -1, 0.5, -0.5]
        r = [a + t * x for a, x in zip(p, d)]
        self.assertAlmostEqual(regret(r, p, eps) / t ** 2, curvature(p, d, eps), 3)
        p = [0.01, 0.3, 0.4, 0.29]  # p_0 < eps
        r = [a + t * x for a, x in zip(p, d)]
        self.assertAlmostEqual(regret(r, p, eps) / t ** 2, curvature(p, d, eps), 3)

    def test_dropped_class_closed_form(self):
        # r_0 = 0, rest rescaled; needs rho >= eps and every other class >= eps
        for K, rho, eps in ((5, 0.02, 0.02), (5, 0.05, 0.01), (8, 0.3, 0.001)):
            p = rare_class(K, rho)
            r = [0.0] + [x / (1 - rho) for x in p[1:]]
            want = rho * math.log(rho / eps) + eps / 2 + rho + (1 - rho) * math.log(1 - rho)
            self.assertAlmostEqual(regret(r, p, eps), want, 12)


if __name__ == "__main__":
    unittest.main()
