import math, random, unittest
from forgetting_audit import *


class T(unittest.TestCase):
    def test_honest_reduces_to_forgetting_law(self):
        d, r = 12, 3
        rho0 = 1 - r / d
        lam0 = rho0 - r * (d - r) / ((d + 2) * (d - 1))
        self.assertAlmostEqual(rho(d, r), rho0, places=12)
        self.assertAlmostEqual(lam(d, r), lam0, places=12)
        for k in (0, 1, 3, 9):
            self.assertAlmostEqual(audit_mean(d, r, (1, 1), 1, 1 + k), (r / d) * rho0 * (rho0 ** k - lam0 ** k), places=12)
        self.assertAlmostEqual(audit_mean(d, r, (1, 1), 1, 1), 0.0, places=12)

    def test_d2_exact_quadrature_partial_step(self):
        # d=2, r=1, fixed step a: loss of task 1 after tasks 1,2 (lag 1), e_init=(1,0); 2-D midpoint quadrature
        a, n = 0.6, 500
        th = [math.pi * (i + .5) / n for i in range(n)]
        def step(u, e):
            p = u[0] * e[0] + u[1] * e[1]
            return (e[0] - a * p * u[0], e[1] - a * p * u[1])
        tot = 0.0
        for t1 in th:
            u1 = (math.cos(t1), math.sin(t1))
            e1 = step(u1, (1.0, 0.0))
            for t2 in th:
                e2 = step((math.cos(t2), math.sin(t2)), e1)
                tot += (u1[0] * e2[0] + u1[1] * e2[1]) ** 2
        self.assertAlmostEqual(tot / n / n, audit_mean(2, 1, moments_step(a), 1, 2), places=5)

    def test_skip_mean_and_fresh_are_probability_consistent(self):
        d, r = 16, 2
        self.assertAlmostEqual(fresh_mean(d, r, (1, 1), 0), r / d)
        # never skipping: fresh loss (r/d) rho^T ; skipping always: fresh loss r/d
        self.assertAlmostEqual(fresh_mean(d, r, moments_skip(1.0), 9), r / d)

    def test_skip_ratio_floor_and_window(self):
        d, r = 16, 2
        self.assertAlmostEqual(ratio_floor(d, r), 16 / 14)
        self.assertGreater(skip_ratio(d, r, 1), skip_ratio(d, r, 5))
        self.assertAlmostEqual(skip_ratio(d, r, 400), ratio_floor(d, r), places=9)
        k = window(d, r, 1.5)
        self.assertAlmostEqual(skip_ratio(d, r, k), 1.5, places=9)
        self.assertIsNone(window(d, r, 1.1))

    def test_skip_ratio_matches_direct_formula(self):
        d, r, k = 12, 3, 4
        rho0 = 1 - r / d
        lam0 = rho0 - r * (d - r) / ((d + 2) * (d - 1))
        skipped = (r / d) * rho0 ** k
        honest = (r / d) * rho0 * (rho0 ** k - lam0 ** k)
        self.assertAlmostEqual(skip_ratio(d, r, k), skipped / honest, places=12)

    def test_monte_carlo_matches_law(self):
        rng = random.Random(3)
        d, r, Tn = 10, 2, 8
        for m, draw in [((1, 1), lambda g: 1.0),
                        (moments_skip(0.3), lambda g: 0.0 if g.random() < 0.3 else 1.0),
                        (moments_step(0.5), lambda g: 0.5)]:
            per, fresh = collect(d, r, Tn, draw, 4000, rng)
            for t in (1, 4, 7):
                sim = sum(per[t - 1]) / len(per[t - 1])
                law = audit_mean(d, r, m, t, Tn)
                self.assertLess(abs(sim - law), 0.0015 + 0.06 * law, (m, t, sim, law))
            self.assertLess(abs(sum(fresh) / len(fresh) - fresh_mean(d, r, m, Tn)), 0.0015 + 0.06 * fresh_mean(d, r, m, Tn))

    def test_samples_needed_and_power(self):
        rng = random.Random(5)
        h0 = [rng.gauss(0, 1) for _ in range(20000)]
        h1 = [rng.gauss(0.5, 1) for _ in range(20000)]
        N = math.ceil(samples_needed(h0, h1))
        size, pw = test_power(h0, h1, N, 0.05, 600, rng)
        self.assertLess(abs(size - 0.05), 0.03)
        self.assertLess(abs(pw - 0.8), 0.07)
        self.assertAlmostEqual(z_quantile(0.975), 1.959964, places=4)


if __name__ == "__main__":
    unittest.main()
