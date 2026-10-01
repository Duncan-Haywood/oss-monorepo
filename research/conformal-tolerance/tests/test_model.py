import math, random, unittest
from conformal_tolerance import *


class T(unittest.TestCase):
    def test_marginal_fpr_exact_and_distribution_free(self):
        n, k = 9, 8
        for name, draw in (("exp", lambda r: r.expovariate(1)), ("pareto", lambda r: pareto_sample(1.5, r)),
                           ("lognormal", lambda r: math.exp(r.gauss(0, 2)))):
            rng = random.Random(1)
            hit, N = 0, 60000
            for _ in range(N):
                cal = [draw(rng) for _ in range(n)]
                hit += draw(rng) > conformal_threshold(cal, k)
            self.assertAlmostEqual(hit / N, marginal_fpr(n, k), delta=0.008, msg=name)
        self.assertAlmostEqual(marginal_fpr(99, cal_index(99, 0.05)), 0.05, 12)

    def test_pac_prob_matches_simulation_and_beta_variance(self):
        rng = random.Random(2)
        n, alpha = 40, 0.1
        for k in (34, 37, 39):
            ok, N = 0, 30000
            fprs = []
            for _ in range(N):
                u = sorted(rng.random() for _ in range(n))
                f = 1 - u[k - 1]            # conditional false-slash rate for U(0,1) drift
                fprs.append(f)
                ok += f <= alpha
            self.assertAlmostEqual(ok / N, pac_prob(n, k, alpha), delta=0.01)
            m = sum(fprs) / N
            v = sum((x - m) ** 2 for x in fprs) / N
            self.assertAlmostEqual(v, cond_fpr_var(n, k), delta=0.0008)

    def test_min_n_and_pac_index(self):
        self.assertEqual(min_n_pac(0.01, 0.01), 459)
        self.assertGreaterEqual(pac_prob(459, 459, 0.01), 0.99)
        self.assertLess(pac_prob(458, 458, 0.01), 0.99)
        self.assertIsNone(pac_index(458, 0.01, 0.01))
        k = pac_index(2000, 0.01, 0.01)
        self.assertGreaterEqual(pac_prob(2000, k, 0.01), 0.99)
        self.assertLess(pac_prob(2000, k - 1, 0.01), 0.99)
        self.assertLess(pac_prob(2000, cal_index(2000, 0.01), 0.01), 0.6)   # plain conformal is only ~50% PAC

    def test_inflation_shrinks_with_n(self):
        vals = [pareto_inflation(n, 0.01, 0.01, 3.0) for n in (500, 2000, 10000)]
        self.assertTrue(vals[0] > vals[1] > vals[2] >= 1.0)
        self.assertGreater(pareto_inflation(2000, 0.01, 0.01, 1.5), pareto_inflation(2000, 0.01, 0.01, 3.0))

    def test_gauss_plugin_is_misspecified_for_lognormal(self):
        self.assertGreater(gauss_plugin_fpr_lognormal(1e-3, 1.0), 10e-3)
        self.assertAlmostEqual(z_quantile(0.975), 1.959964, 5)

    def test_pooled_threshold_and_shift(self):
        pis, mus, s = (0.5, 0.3, 0.2), (0.0, math.log(2), math.log(4)), 0.5
        t = pooled_threshold(pis, mus, s, 0.01)
        self.assertAlmostEqual(sum(p * lognormal_sf(t, m, s) for p, m in zip(pis, mus)), 0.01, 9)
        self.assertLess(lognormal_sf(t, mus[0], s), 1e-4)
        self.assertGreater(lognormal_sf(t, mus[2], s), 0.03)
        self.assertGreater(shifted_fpr(t, mus[0], s, 1.5), lognormal_sf(t, mus[0], s))

    def test_float32_residual_positive(self):
        rng = random.Random(3)
        r = [honest_residual(6, rng) for _ in range(5)]
        self.assertTrue(all(0 < x < 1e-4 for x in r))


if __name__ == "__main__":
    unittest.main()
