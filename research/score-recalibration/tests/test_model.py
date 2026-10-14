import math, unittest
from score_recalibration import *


class T(unittest.TestCase):
    def test_calibrated_has_zero_excess(self):
        self.assertAlmostEqual(rel_brier(0.3, 1.0, 1.0, 0.0), 0.0, 12)
        self.assertAlmostEqual(rel_log(0.3, 1.0, 1.0, 0.0), 0.0, 10)

    def test_brier_decomposition_exact(self):
        for pi, mu, a, b in ((0.5, 1, 0.5, 0), (0.2, 0.8, 2, 0.3), (0.7, 1.3, 3, -0.4)):
            self.assertAlmostEqual(brier(pi, mu, a, b) - brier(pi, mu), rel_brier(pi, mu, a, b), 10)

    def test_log_decomposition_exact(self):
        for pi, mu, a, b in ((0.5, 1, 0.5, 0), (0.2, 0.8, 2, 0.3)):
            self.assertAlmostEqual(log_loss(pi, mu, a, b) - log_loss(pi, mu), rel_log(pi, mu, a, b), 8)

    def test_calibrated_brier_below_any_distortion(self):
        for a, b in ((0.7, 0), (1.4, 0), (1, 0.2), (1, -0.2)):
            self.assertGreater(brier(0.4, 1.0, a, b), brier(0.4, 1.0))

    def test_uninformative_brier_is_prior_variance(self):
        self.assertAlmostEqual(brier(0.3, 1e-9), unc_brier(0.3), 6)

    def test_local_law_ratio_to_one(self):
        r = [rel_brier(0.5, 1.0, 1 + e, 0.5 * e) / local_excess(0.5, 1.0, 1 + e, 0.5 * e) for e in (0.2, 0.05, 0.01)]
        self.assertLess(abs(r[2] - 1), abs(r[1] - 1))
        self.assertLess(abs(r[1] - 1), abs(r[0] - 1))
        self.assertLess(abs(r[2] - 1), 0.02)

    def test_hessian_matches_finite_difference(self):
        pi, mu, h = 0.5, 1.0, 1e-3
        H = brier_hess(pi, mu)
        f = lambda a, b: brier(pi, mu, a, b)
        faa = (f(1 + h, 0) - 2 * f(1, 0) + f(1 - h, 0)) / h ** 2
        self.assertAlmostEqual(faa, H[0][0], 3)

    def test_fit_recovers_calibration(self):
        import random
        rng = random.Random(1)
        Ls, ys = [], []
        for _ in range(20000):
            L = rng.gauss(0, 2)
            Ls.append(L); ys.append(1 if rng.random() < expit(0.5 * L + 0.2) else 0)
        a, b = fit_logistic(Ls, ys)
        self.assertAlmostEqual(a, 0.5, delta=0.05)
        self.assertAlmostEqual(b, 0.2, delta=0.05)

    def test_predicted_excess_scales_as_one_over_n(self):
        self.assertAlmostEqual(predicted_excess(0.5, 1.0, 100) / predicted_excess(0.5, 1.0, 200), 2.0, 12)

    def test_simulated_excess_near_prediction(self):
        s = simulate_recal(0.5, 1.0, 200, 120, seed=3)
        p = predicted_excess(0.5, 1.0, 200)
        self.assertLess(abs(s / p - 1), 0.35)

    def test_log_reversal_at_overconfidence(self):
        # higher-resolution overconfident verifier loses to a calibrated weaker one under log, never under recalibration
        self.assertGreater(log_loss(0.5, 1.0, 8.0), log_loss(0.5, 0.7))
        self.assertLess(log_loss(0.5, 1.0), log_loss(0.5, 0.7))

    def test_brier_bounded_but_log_not(self):
        self.assertLess(brier(0.5, 1.0, 400.0), unc_brier(0.5))
        self.assertGreater(log_loss(0.5, 1.0, 20.0), math.log(2))


if __name__ == "__main__":
    unittest.main()
