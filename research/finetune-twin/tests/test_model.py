import math, unittest
from finetune_twin import *


class M(unittest.TestCase):
    def test_risk_k0_is_initial_loss(self):
        L = [0.2, 1.0]; e = [1.0, 0.5]
        self.assertAlmostEqual(risk(L, e, 0.1, 0.3, 0), 0.5 * sum(l * x * x for l, x in zip(L, e)))

    def test_risk_converges_to_floor(self):
        L = spectrum(4, 10)
        self.assertAlmostEqual(risk(L, [1] * 4, 0.1, 0.5, 5000), floor(L, 0.1, 0.5), places=9)

    def test_matches_simulation(self):
        L = [0.1, 0.5, 1.0]; e = [1.0, -0.7, 0.4]
        ex = risk(L, e, 0.2, 0.4, 15)
        self.assertAlmostEqual(risk_sim(L, e, 0.2, 0.4, 15, 40000, 1) / ex, 1.0, delta=0.02)

    def test_noise_free_bias_bound_holds_any_spectrum(self):
        for kappa in (2, 50, 1e3):
            L = spectrum(30, kappa); b = [0.3] * 30
            b2 = sum(x * x for x in b)
            for k in (5, 50, 500):
                self.assertLessEqual(risk(L, b, 0.5, 0.0, k), residual_bound(b2 * 1.0, 0.5, k) * 1.000001)

    def test_bound_nearly_tight_for_single_direction_at_worst_lambda(self):
        eta, k = 0.01, 200
        lam = worst_direction(eta, k)  # = 0.25
        self.assertAlmostEqual(risk([lam], [1.0], eta, 0.0, k) / residual_bound(1.0, eta, k), 1.0, delta=0.02)

    def test_warm_start_saves_steps_and_negative_transfer(self):
        L = spectrum(5, 20)
        cold = [1.0] * 5
        good = [0.1] * 5; bad = [2.0] * 5
        tgt = 2 * floor(L, 0.1, 0.3)
        self.assertGreater(steps_saved(L, good, cold, 0.1, 0.3, tgt), 0)
        self.assertLess(steps_saved(L, bad, cold, 0.1, 0.3, tgt), 0)

    def test_target_below_floor_unreachable(self):
        L = [1.0]
        self.assertIsNone(steps_to(L, [1.0], 0.1, 0.5, 0.5 * floor(L, 0.1, 0.5)))

    def test_single_direction_steps_saved_closed_form(self):
        # noise-free, one direction: k = ln(e0^2 lam/2 / target)/(-2 ln r); saving = ln(ec^2/eb^2)/(-2 ln r)
        lam, eta = 0.5, 0.1
        r = 1 - eta * lam
        ks = steps_saved([lam], [0.1], [1.0], eta, 1e-9, 1e-6)
        self.assertAlmostEqual(ks, math.log(100) / (-2 * math.log(r)), delta=1.0)


if __name__ == "__main__":
    unittest.main()
