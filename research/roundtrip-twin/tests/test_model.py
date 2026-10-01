import math
import unittest

from roundtrip_twin.model import (P, real_energy, twin_energy, ratio, v_opt_real, v_opt_twin, regret, one_leg_energy,
                                  breakeven_margin, simulate_roundtrip)


class T(unittest.TestCase):
    def test_zero_wind_real_equals_twin(self):
        for v in (0.7, 1.0, 1.9):
            self.assertAlmostEqual(real_energy(v, 0.0), twin_energy(v), places=12)
            self.assertAlmostEqual(ratio(v, 0.0), 1.0, places=12)

    def test_ratio_formula_and_symmetry(self):
        self.assertAlmostEqual(real_energy(1.5, 0.6) / twin_energy(1.5), ratio(1.5, 0.6), places=12)
        self.assertAlmostEqual(real_energy(1.5, 0.6), real_energy(1.5, -0.6), places=12)
        self.assertGreater(ratio(1.5, 0.6), 1.0)

    def test_matches_simulation(self):
        self.assertAlmostEqual(simulate_roundtrip(1.4, 0.5), real_energy(1.4, 0.5), delta=1e-3)

    def test_optimal_airspeed_closed_form(self):
        w = 0.6
        vs = v_opt_real(w)
        self.assertAlmostEqual(vs * vs, w * w + math.sqrt(w ** 4 + 1), places=12)
        for d in (-1e-3, 1e-3):
            self.assertLess(real_energy(vs, w), real_energy(vs + d, w))
        self.assertGreater(vs, v_opt_twin())

    def test_regret_nonnegative_zero_at_no_wind(self):
        self.assertAlmostEqual(regret(0.0), 0.0, places=12)
        self.assertGreater(regret(0.7), 0.0)
        self.assertGreater(regret(0.7), regret(0.3))

    def test_stall(self):
        self.assertEqual(real_energy(0.5, 0.5), math.inf)
        self.assertEqual(ratio(0.4, 0.5), math.inf)

    def test_one_leg_twin_sign_and_pooling(self):
        v, w = 1.5, 0.5
        self.assertGreater(one_leg_energy(v, w), real_energy(v, w))      # calibrated on headwind leg: pessimistic
        self.assertLess(one_leg_energy(v, -w), real_energy(v, w))        # calibrated on tailwind leg: optimistic
        self.assertAlmostEqual(one_leg_energy(v, 0.0), twin_energy(v), places=12)

    def test_breakeven_margin(self):
        v, w = 1.3, 0.5
        self.assertAlmostEqual((1 + breakeven_margin(v, w)) * twin_energy(v), real_energy(v, w), places=12)

    def test_one_leg_ratio_is_one_plus_minus_w_over_v(self):
        v, w = 1.5, 0.6
        self.assertAlmostEqual(one_leg_energy(v, w) / real_energy(v, w), 1 + w / v, places=12)
        self.assertAlmostEqual(one_leg_energy(v, -w) / real_energy(v, w), 1 - w / v, places=12)


if __name__ == "__main__":
    unittest.main()
