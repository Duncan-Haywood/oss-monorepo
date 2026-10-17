import math, random, unittest
from forgetting_law import *


class T(unittest.TestCase):
    def test_d2_r1_moment_identity_exact(self):
        # P = u u^T, u=(cos t, sin t): quadrature over t; c2 = E[(e^T P f)^2] for orthonormal e,f
        n = 20000
        c2q = sum((math.cos(t) * math.sin(t)) ** 2 for t in [math.pi * (i + .5) / n for i in range(n)]) / n
        self.assertAlmostEqual(c2q, c2(2, 1), places=9)
        c11 = sum(math.cos(t) ** 4 for t in [math.pi * (i + .5) / n for i in range(n)]) / n   # E[(e^T P e)^2] = c1+c2
        self.assertAlmostEqual(c11, c1(2, 1) + c2(2, 1), places=9)

    def test_identities(self):
        for d, r in [(5, 1), (12, 3), (30, 10)]:
            self.assertAlmostEqual(c1(d, r) + d * c2(d, r), r / d, places=12)
            self.assertAlmostEqual(lam(d, r) + d * c2(d, d - r), 1 - r / d, places=12)   # contraction of the complement
            self.assertGreater(lam(d, r), 0)
            self.assertLess(lam(d, r), rho(d, r))

    def test_forget_zero_at_lag_zero_and_vanishes(self):
        self.assertEqual(forget(12, 3, 0), 0.0)
        self.assertLess(forget(12, 3, 200), 1e-12)

    def test_peak_matches_grid(self):
        for d, r in [(12, 3), (40, 5), (8, 4)]:
            grid = max(forget(d, r, k / 50) for k in range(0, 50 * 200))
            self.assertAlmostEqual(grid, peak_forget(d, r), places=5)

    def test_total_is_series_sum(self):
        self.assertAlmostEqual(sum(forget(12, 3, k) for k in range(2000)), total_forget(12, 3), places=10)

    def test_monte_carlo_forgetting(self):
        rng = random.Random(7)
        d, r = 10, 2
        sim = simulate_forgetting(d, r, 6, 6000, rng)
        for k in range(7):
            self.assertLess(abs(sim[k] - forget(d, r, k)), 0.0025 + 0.05 * forget(d, r, k))

    def test_modular_reduces_to_shared_and_dilutes(self):
        for k in range(6):
            self.assertAlmostEqual(forget_mod(12, 3, 1, k), forget(12, 3, k), places=12)
        self.assertLess(forget_mod(12, 3, 4, 1), forget(12, 3, 1))
        self.assertGreater(fresh_mod(12, 3, 4, 8), fresh_mod(12, 3, 1, 8))
        # m -> large: nothing is ever overwritten
        self.assertLess(forget_mod(12, 3, 10 ** 6, 5), 1e-5)

    def test_monte_carlo_modular(self):
        rng = random.Random(3)
        for d, r, m, Tt in [(10, 2, 3, 6), (12, 3, 1, 12), (10, 2, 2, 10)]:
            seen, fresh = simulate_modular(d, r, m, Tt, 4000, rng)
            self.assertAlmostEqual(seen, avg_seen_loss(d, r, m, Tt), delta=0.003 + 0.05 * seen)
            self.assertAlmostEqual(fresh, fresh_mod(d, r, m, Tt), delta=0.003 + 0.05 * fresh)

    def test_conflict_floor(self):
        rng = random.Random(11)
        en, ls = simulate_conflict_floor(10, 2, 1.0, 40, 1500, rng)
        self.assertAlmostEqual(en, 1.0, delta=0.08)
        self.assertAlmostEqual(ls, conflict_floor(10, 2, 1.0), delta=0.06)


if __name__ == "__main__":
    unittest.main()
