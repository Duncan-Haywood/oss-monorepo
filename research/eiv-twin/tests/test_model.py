import math
import random
import unittest

from eiv_twin.model import (reliability, plim_ols, plim_corrected, ols_var, simulate, ols, corrected, iv,
                            resid_corr, cov)


class T(unittest.TestCase):
    def setUp(self):
        self.a, self.su2, self.sv2, self.sw2 = 2.0, 1.0, 0.25, 0.25

    def test_no_noise_is_identity(self):
        self.assertEqual(reliability(1.0, 0.0), 1.0)
        self.assertEqual(plim_ols(2.0, 1.0, 0.0), 2.0)

    def test_attenuation_matches_simulation(self):
        x, _, y = simulate(400000, self.a, self.su2, self.sv2, self.sw2, random.Random(1))
        self.assertAlmostEqual(ols(x, y), plim_ols(self.a, self.su2, self.sv2), delta=0.01)

    def test_corrections_consistent(self):
        x, x2, y = simulate(400000, self.a, self.su2, self.sv2, self.sw2, random.Random(2), second=True)
        self.assertAlmostEqual(corrected(x, y, self.sv2), self.a, delta=0.02)
        self.assertAlmostEqual(iv(x, x2, y), self.a, delta=0.02)

    def test_misjudged_noise_bias(self):
        x, _, y = simulate(400000, self.a, self.su2, self.sv2, self.sw2, random.Random(3))
        self.assertAlmostEqual(corrected(x, y, 0.35), plim_corrected(self.a, self.su2, self.sv2, 0.35), delta=0.03)

    def test_ols_variance_and_no_residual_signal(self):
        n, reps, rng = 200, 4000, random.Random(4)
        bs = []
        for _ in range(reps):
            x, _, y = simulate(n, self.a, self.su2, self.sv2, self.sw2, rng)
            bs.append(ols(x, y))
        m = sum(bs) / reps
        v = sum((b - m) ** 2 for b in bs) / (reps - 1)
        want = ols_var(self.a, self.su2, self.sv2, self.sw2, n)
        self.assertAlmostEqual(v / want, 1.0, delta=0.08)
        x, _, y = simulate(n, self.a, self.su2, self.sv2, self.sw2, rng)
        self.assertAlmostEqual(resid_corr(x, y, ols(x, y)), 0.0, places=9)


if __name__ == "__main__":
    unittest.main()
