import math, random, unittest
from closedloop_twin import *

A, B, K, S = 1.1, 1.0, 0.6, 1.0
RHO = pole(A, B, K)


class M(unittest.TestCase):
    def test_pole_and_var(self):
        self.assertAlmostEqual(RHO, 0.5)
        self.assertAlmostEqual(stationary_var(A, B, K, S, 0.0), 1 / 0.75)

    def test_fit_recovers_with_dither(self):
        ah, bh, s2, _ = fit(log_data(random.Random(1), A, B, K, 0.5, S, 20000))
        self.assertAlmostEqual(ah, A, delta=0.03)
        self.assertAlmostEqual(bh, B, delta=0.05)
        self.assertAlmostEqual(s2, 1.0, delta=0.05)

    def test_minnorm_without_dither(self):
        ah, bh, _, _ = minnorm_fit(log_data(random.Random(2), A, B, K, 0.0, S, 5000))
        self.assertAlmostEqual(ah - bh * K, RHO, delta=0.03)   # identified: the logged pole
        self.assertAlmostEqual(bh, -K * RHO / (1 + K * K), delta=0.03)  # min-norm split, wrong sign
        self.assertLess(bh, 0)

    def test_pred_sd_matches_simulation(self):
        rng = random.Random(3)
        for tau, k2 in ((0.5, 0.05), (0.3, 0.3)):
            ps = [twin_pole(*fit(log_data(rng, A, B, K, tau, S, 500))[:2], k2) for _ in range(1500)]
            m = sum(ps) / len(ps)
            sd = math.sqrt(sum((p - m) ** 2 for p in ps) / len(ps))
            self.assertAlmostEqual(sd / pred_sd(RHO, B, K, k2, S, tau, 500), 1.0, delta=0.07)
            self.assertAlmostEqual(m, pole(A, B, k2), delta=0.02)

    def test_pred_var_at_logging_gain_has_no_extrapolation_term(self):
        self.assertAlmostEqual(pred_var(RHO, B, K, K, S, 0.5, 100), S * S / 100 * (1 - RHO ** 2) / (S * S + B * B * 0.25))

    def test_heldout_blind_to_dither(self):
        rng = random.Random(4)
        out = []
        for tau in (1.0, 0.0):
            rows = log_data(rng, A, B, K, tau, S, 500)
            ah, bh, _, _ = minnorm_fit(rows) if tau == 0 else fit(rows)
            out.append(heldout_mse(rng, A, B, K, tau, S, ah, bh, 20000))
        for m in out:
            self.assertAlmostEqual(m, 1.0, delta=0.06)

    def test_tau_required_inverts(self):
        tau = tau_required(RHO, B, K, 0.05, S, 1000, 0.05)
        self.assertAlmostEqual(pred_sd(RHO, B, K, 0.05, S, tau, 1000), 0.05, places=9)

    def test_bound_is_conservative_direction(self):
        ah, bh, s2, inv = fit(log_data(random.Random(5), A, B, K, 0.3, S, 500))
        self.assertGreater(ols_pole_bound(ah, bh, s2, inv, 0.05), twin_pole(ah, bh, 0.05))


if __name__ == "__main__":
    unittest.main()
