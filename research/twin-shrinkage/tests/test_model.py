import math, random, unittest
from twin_shrinkage import *


class M(unittest.TestCase):
    def test_exact_js_risk_matches_simulation(self):
        for d, lam in ((5, 0.0), (5, 4.0), (10, 0.0), (10, 10.0), (10, 60.0)):   # d=3,4: squared error has infinite variance, MC unreliable
            delta = [math.sqrt(lam)] + [0.0] * (d - 1)
            r, _ = mc_risk(lambda x: js_estimate(x, [0.0] * d, 1.0), delta, 1.0, 40000, 5)
            self.assertAlmostEqual(r, js_risk(d, lam), delta=0.04 * max(1.0, js_risk(d, lam)) ** 0.5 + 0.03)

    def test_risk_at_zero_is_two_and_dominates_real_only(self):
        for d in (3, 5, 20, 100):
            self.assertAlmostEqual(js_risk(d, 0.0), 2.0, places=12)
            for lam in (0.0, 1.0, 10.0, 100.0, 1e4):
                self.assertLess(js_risk(d, lam), d)                    # never worse than real-only in aggregate, d >= 3
        self.assertAlmostEqual(50 - js_risk(50, 1e6), 48 ** 2 / 1e6, delta=2e-5)   # saving vanishes like (d-2)^2/lam for a bad twin

    def test_oracle_blend_lower_bounds_js_and_crossover(self):
        for d in (3, 10, 40):
            for lam in (0.5, 5.0, 40.0):
                self.assertLessEqual(oracle_blend_risk(d, lam), js_risk(d, lam) + 1e-9)
        self.assertAlmostEqual(twin_only_risk(crossover_lam(10)), 10.0)
        self.assertAlmostEqual(oracle_weight(10, 10.0), 0.5)

    def test_large_d_approaches_bayes_ratio(self):
        tau2 = 0.5
        prev = 1.0
        for d in (10, 100, 1000):
            gap = abs(js_risk(d, d * tau2) / d - bayes_js_ratio(tau2))
            self.assertLess(gap, prev)
            prev = gap
        self.assertLess(prev, 0.002)
        self.assertAlmostEqual(n_equivalent(50, 4.0, 0.25), 50 + 16.0)

    def test_positive_part_never_worse_than_js(self):
        d, lam = 6, 2.0
        delta = [math.sqrt(lam)] + [0.0] * (d - 1)
        a, _ = mc_risk(lambda x: js_estimate(x, [0.0] * d, 1.0), delta, 1.0, 20000, 8)
        b, _ = mc_risk(lambda x: js_plus_estimate(x, [0.0] * d, 1.0), delta, 1.0, 20000, 8)
        self.assertLessEqual(b, a + 1e-9)

    def test_hadamard_is_orthogonal_design(self):
        H = hadamard(3)
        n = len(H)
        for i in range(n):
            for j in range(n):
                self.assertEqual(sum(H[k][i] * H[k][j] for k in range(n)), n if i == j else 0)

    def test_coordinate_hazard_exists_while_total_risk_is_safe(self):
        d = 10
        delta = [4.0] + [0.0] * (d - 1)                                 # one badly mismatched parameter
        tot, per = mc_risk(lambda x: js_estimate(x, [0.0] * d, 1.0), delta, 1.0, 30000, 11)
        self.assertLess(tot, d)
        self.assertGreater(per[0], 1.0)                                # yet that parameter is worse than real-only (risk 1)


if __name__ == "__main__":
    unittest.main()
