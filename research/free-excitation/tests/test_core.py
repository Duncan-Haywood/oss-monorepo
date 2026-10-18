import math
import unittest

from free_excitation import (TRUE, simulate, inputs, crb_std, fit, trial_errors, heldout_rmse,
                             condition_number)
from free_excitation import core


class Tests(unittest.TestCase):
    def test_step_final_value(self):
        # static deflection u/k for a unit step, after 10 s of 10% damping (decay e^{-0.2*10})
        y = simulate(TRUE, lambda t: 1.0)
        # the deviation from u/k is bounded by the decay envelope e^{-zeta wn t}/sqrt(1-zeta^2) times u/k
        env = math.exp(-0.2 * 10.0) / math.sqrt(1 - 0.1 ** 2) / TRUE[2]
        self.assertLessEqual(abs(y[-1] - 1 / TRUE[2]), 1.02 * env)

    def test_free_decay_rate(self):
        # damped natural frequency check: zero crossings of a step response about u/k are spaced pi/wd
        y = simulate(TRUE, lambda t: 1.0)
        wd = 2 * math.sqrt(1 - 0.1 ** 2)
        xs = [i for i in range(1, len(y)) if (y[i - 1] - 0.25) * (y[i] - 0.25) < 0]
        self.assertAlmostEqual((xs[1] - xs[0]) * core.DT, math.pi / wd, delta=2 * core.DT)

    def test_inputs_unit_rms(self):
        for f in inputs().values():
            r = math.sqrt(sum(f(i * core.DT) ** 2 for i in range(core.N)) / core.N)
            self.assertAlmostEqual(r, 1.0, places=9)

    def test_noiseless_fit_recovers_truth(self):
        u = inputs()["chirp"]
        y = simulate(TRUE, u)
        th = fit(y, u, [1.2, 0.3, 3.5], iters=25)
        for a, b in zip(th, TRUE):
            self.assertAlmostEqual(a / b, 1.0, delta=1e-3)

    def test_crb_scales_with_noise(self):
        u = inputs()["chirp"]
        a = crb_std(u)
        old = core.SIGMA
        core.SIGMA = old * 2
        try:
            b = crb_std(u)
        finally:
            core.SIGMA = old
        for p, q in zip(a, b):
            self.assertAlmostEqual(q / p, 2.0, places=6)

    def test_fit_matches_crb_roughly(self):
        u = inputs()["chirp"]
        fits = trial_errors(u, 30, 1)
        bound = crb_std(u)
        for j in range(3):
            mean = sum(f[j] for f in fits) / len(fits)
            sd = math.sqrt(sum((f[j] - mean) ** 2 for f in fits) / (len(fits) - 1))
            self.assertGreater(sd / bound[j], 0.6)
            self.assertLess(sd / bound[j], 1.6)

    def test_condition_number_at_least_one(self):
        self.assertGreaterEqual(condition_number(inputs()["step"]), 1.0)

    def test_heldout_zero_at_truth(self):
        self.assertEqual(heldout_rmse(TRUE, core.heldout_input()), 0.0)


if __name__ == "__main__":
    unittest.main()
