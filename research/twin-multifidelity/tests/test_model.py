import math, random, statistics as st, unittest
from twin_multifidelity import *
from twin_multifidelity.model import _gram

a, b = 0.9, 1.0
k = optimal_gain(a, b)
c = a - b * k


class T(unittest.TestCase):
    def test_identical_twin_is_perfectly_correlated(self):
        self.assertAlmostEqual(corr_long_run(c, c), 1.0, places=12)
        self.assertAlmostEqual(corr_finite(c, c, 50), 1.0, places=12)

    def test_finite_horizon_converges_to_long_run(self):
        for ch in (-0.17, 0.5):
            self.assertAlmostEqual(corr_finite(c, ch, 400), corr_long_run(c, ch), places=2)

    def test_gram_matches_direct_sum(self):
        T_, cc = 6, 0.7
        A = _gram(cc, T_)
        # x_t = sum_{s<t} cc^(t-1-s) w_s, Y = sum_t x_t^2; coefficient matrix of w_i w_j
        for i in range(T_):
            for j in range(T_):
                d = sum(cc ** (t - 1 - i) * cc ** (t - 1 - j) for t in range(max(i, j) + 1, T_ + 1))
                self.assertAlmostEqual(A[i][j], d, places=12)

    def test_corr_matches_monte_carlo(self):
        Y, Yh = simulate_pairs(a, b, 1.3, k, 100, 5000, 1.0, seed=1)
        self.assertAlmostEqual(st.correlation(Y, Yh), corr_finite(c, a - 1.3 * k, 100), delta=0.02)

    def test_noise_sharing_scales_correlation_by_lam_squared(self):
        ch = a - 1.3 * k
        self.assertAlmostEqual(corr_long_run(c, ch, 0.7), 0.49 * corr_long_run(c, ch), places=12)
        self.assertAlmostEqual(corr_finite(c, ch, 30, 0.7), 0.49 * corr_finite(c, ch, 30), places=12)

    def test_small_bias_law(self):
        for cc in (0.0767, 0.5):
            e = 1e-3
            g = (1 - corr_long_run(cc, cc + e)) / e ** 2
            self.assertAlmostEqual(g, (1 + cc ** 4) / (1 - cc ** 4) ** 2, places=2)

    def test_long_run_sd_matches_finite_matrix(self):
        T_ = 500
        A = _gram(c, T_)
        var = 2 * sum(A[i][j] ** 2 for i in range(T_) for j in range(T_))
        wgt = 1 + 0.1 * k * k
        self.assertAlmostEqual(math.sqrt(var) * wgt / T_ * math.sqrt(T_), cost_sd_long_run(c, k), delta=0.01 * cost_sd_long_run(c, k))

    def test_split_is_optimal_and_budget_feasible(self):
        rho, cr, ct, B = 0.94, 1.0, 0.02, 20.0
        n, N, var = best_split(rho, cr, ct, B)
        self.assertAlmostEqual(n * cr + N * ct, B, places=10)
        self.assertAlmostEqual(mf_variance(1, rho, n, N), var, places=12)
        for dn in (-0.5, 0.5):
            n2 = n + dn
            N2 = (B - n2 * cr) / ct
            self.assertGreater(mf_variance(1, rho, n2, N2), var)

    def test_breakeven_price_is_where_gain_hits_one(self):
        for rho in (0.5, 0.9):
            w = breakeven_price(rho)
            self.assertAlmostEqual((math.sqrt(1 - rho ** 2) + math.sqrt(w) * rho) ** 2, 1.0, places=12)
            self.assertLess(mf_gain(rho, 0.9 * w), 1.0)
            self.assertEqual(mf_gain(rho, 1.1 * w), 1.0)

    def test_estimator_unbiased_and_variance_law(self):
        bh, n, N = 1.3, 8, 80
        rho = corr_finite(c, a - bh * k, 60)
        Y0, Y0h = simulate_pairs(a, b, bh, k, 60, 2000, 1.0, seed=9)
        beta = rho * math.sqrt(st.pvariance(Y0) / st.pvariance(Y0h))
        est = []
        for i in range(1500):
            Yy, Yh = simulate_pairs(a, b, bh, k, 60, N, 1.0, seed=1000 + i)
            est.append(mfmc_trial(Yy, Yh, n, N, beta))
        self.assertAlmostEqual(st.mean(est), st.mean(Y0), delta=0.01)
        self.assertAlmostEqual(st.pvariance(est) / (st.pvariance(Y0) * mf_variance(1, rho, n, N)), 1.0, delta=0.12)

    def test_twin_only_crossover(self):
        B = twin_only_crossover(1e-3, 1.0, 1e-3, 0.02, 0.05)
        self.assertAlmostEqual(1e-3 / B, 0.05 ** 2 + 1e-3 * 0.02 / B, places=12)


if __name__ == "__main__":
    unittest.main()
