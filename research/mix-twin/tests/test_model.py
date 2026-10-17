import math, random, unittest
from mix_twin import *


class M(unittest.TestCase):
    def test_wstar_minimises(self):
        a, b, d = 0.1, 0.02, 0.3
        w = w_star(a, b, d)
        self.assertAlmostEqual(mse_w(w, a, b, d), mse_star(a, b, d), places=12)
        for e in (-0.05, 0.05):
            self.assertGreater(mse_w(w + e, a, b, d), mse_star(a, b, d))

    def test_mse_w_matches_simulation(self):
        rng = random.Random(3); n, m, s, t, d, w = 8, 40, 1.0, 1.5, 0.4, 0.3
        a, b = s * s / n, t * t / m; tot = 0
        R = 200000
        for _ in range(R):
            yb = rng.gauss(0, math.sqrt(a)); zb = d + rng.gauss(0, math.sqrt(b))
            tot += ((1 - w) * yb + w * zb) ** 2
        self.assertAlmostEqual(tot / R / mse_w(w, a, b, d), 1.0, delta=0.02)

    def test_equivalent_samples_consistent(self):
        n, s2, b, d = 10, 1.0, 0.001, 0.2
        a = s2 / n
        self.assertAlmostEqual(s2 / equiv_real(n, s2, b, d), mse_star(a, b, d), places=12)

    def test_twin_cap_is_limit(self):
        n, s2, d = 10, 1.0, 0.2
        self.assertLess(equiv_real(n, s2, 1e-9, d) - n, twin_cap(s2, d) + 1e-6)
        self.assertAlmostEqual(equiv_real(n, s2, 1e-9, d) - n, twin_cap(s2, d), places=3)

    def test_naive_matches_mse_w_and_threshold(self):
        n, m, s2, d = 10, 30, 1.0, 0.3
        a, b = s2 / n, s2 / m
        self.assertAlmostEqual(mse_naive(n, m, s2, s2, d), mse_w(naive_weight(n, m), a, b, d), places=12)
        for d in (0.1, 0.5, 0.6, 0.7):
            self.assertEqual(mse_naive(n, m, s2, s2, d) < a, pool_helps(a, b, d))

    def test_sample_weight_ratio(self):
        n, m, s2, t2, d = 10, 50, 1.0, 2.0, 0.2
        a, b = s2 / n, t2 / m; w = w_star(a, b, d)
        self.assertAlmostEqual((w / m) / ((1 - w) / n), sample_weight_ratio(s2, t2, m, d), places=12)

    def test_quadrature_matches_simulation(self):
        a, b, d = 0.1, 0.01, 0.2
        for wf in (w_plugin(a, b), w_debiased(a, b), w_pretest(a, b)):
            q = mse_adaptive(wf, a, b, d, h=0.05)
            sm = mse_adaptive_sim(wf, a, b, d, 300000, 5)
            self.assertAlmostEqual(sm / q, 1.0, delta=0.02)

    def test_quadrature_reduces_to_fixed_weight(self):
        a, b, d = 0.1, 0.02, 0.3
        self.assertAlmostEqual(mse_adaptive(lambda D: 0.4, a, b, d), mse_w(0.4, a, b, d), places=8)

    def test_oracle_beats_adaptive(self):
        a, b = 0.1, 0.005
        for d in (0.0, 0.2, 0.6):
            for wf in (w_plugin(a, b), w_debiased(a, b), w_pretest(a, b)):
                self.assertLessEqual(mse_star(a, b, d), mse_adaptive(wf, a, b, d) + 1e-9)


if __name__ == "__main__":
    unittest.main()
