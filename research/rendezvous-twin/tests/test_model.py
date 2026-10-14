import math, random, unittest
from rendezvous_twin import *

C, LAM, S2 = 50.0, 1.0, 1.0


class T(unittest.TestCase):
    def test_twin_interval_is_optimum_without_bias(self):
        t = twin_interval(C, LAM, S2)
        self.assertAlmostEqual(t, 10.0)
        self.assertAlmostEqual(real_interval(C, LAM, S2, 0.0), t, places=9)
        for d in (0.9, 1.1):
            self.assertGreater(cost_rate(d * t, C, LAM, S2, 0), cost_rate(t, C, LAM, S2, 0))

    def test_real_interval_stationary_and_shorter(self):
        for b2 in (0.01, 0.1, 0.3):
            r = real_interval(C, LAM, S2, b2)
            h = 1e-5
            d = (cost_rate(r + h, C, LAM, S2, b2) - cost_rate(r - h, C, LAM, S2, b2)) / (2 * h)
            self.assertAlmostEqual(d, 0, places=6)
            self.assertLess(r, twin_interval(C, LAM, S2))
            self.assertGreater(regret(twin_interval(C, LAM, S2), C, LAM, S2, b2), 0)

    def test_regret_increases_with_bias(self):
        t = twin_interval(C, LAM, S2)
        g = [regret(t, C, LAM, S2, b) for b in (0.0, 0.01, 0.1, 0.3)]
        self.assertAlmostEqual(g[0], 0, places=9)
        self.assertTrue(all(y > x for x, y in zip(g, g[1:])))

    def test_budget_interval_and_violation(self):
        eps = 3.0
        tt, tr = budget_interval_twin(eps, S2), budget_interval_real(eps, S2, 0.1)
        self.assertAlmostEqual(V(tr, S2, 0.1), eps * eps, places=9)
        self.assertLess(tr, tt)
        self.assertAlmostEqual(violation_fraction(tt, eps, S2, 0.1), 1 - tr / tt)
        self.assertEqual(violation_fraction(tt, eps, S2, 0.0), 0.0)
        self.assertAlmostEqual(peak_ratio(tt, S2, 0.1) ** 2, V(tt, S2, 0.1) / (S2 * tt))

    def test_shared_bias_cancels_in_relative_frame(self):
        self.assertEqual(relative_b2(0.1, 1.0), 0.0)
        self.assertAlmostEqual(relative_b2(0.1, 0.0), 0.2)
        self.assertAlmostEqual(pair_V(4.0, 1.0, 0.1, 0.5), 2 * 4 + 0.1 * 16)

    def test_two_lag_fit_recovers_exact_moments(self):
        s2, b2 = fit_two_lag(V(2, 1.0, 0.1), 2, V(10, 1.0, 0.1), 10)
        self.assertAlmostEqual(s2, 1.0 + 0.1 * 2)   # short lag leaks a little bias into s2
        s2, b2 = fit_two_lag(V(1, 1.0, 0.0), 1, V(10, 1.0, 0.0), 10)
        self.assertAlmostEqual(b2, 0.0)

    def test_variance_law_matches_simulation(self):
        rng = random.Random(3)
        for t, b2 in ((5, 0.1), (10, 0.3)):
            m, se = simulate_V(t, S2, b2, 40000, rng)
            self.assertLess(abs(m - V(t, S2, b2)), 4 * se)

    def test_pair_variance_matches_simulation(self):
        rng = random.Random(4)
        t, b2, kap, n = 10, 0.2, 0.5, 40000
        xs = []
        for _ in range(n):
            z, u1, u2 = (rng.gauss(0, 1) for _ in range(3))
            b1 = math.sqrt(b2) * (math.sqrt(kap) * z + math.sqrt(1 - kap) * u1)
            b_2 = math.sqrt(b2) * (math.sqrt(kap) * z + math.sqrt(1 - kap) * u2)
            e = sum(rng.gauss(0, 1) - rng.gauss(0, 1) for _ in range(t)) + (b1 - b_2) * t
            xs.append(e * e)
        m = sum(xs) / n
        se = math.sqrt(sum((x - m) ** 2 for x in xs) / n / n)
        self.assertLess(abs(m - pair_V(t, S2, b2, kap)), 4 * se)


if __name__ == "__main__":
    unittest.main()
