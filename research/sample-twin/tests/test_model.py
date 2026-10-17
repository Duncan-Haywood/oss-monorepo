import math
import random
import unittest

from sample_twin.model import (gains, eigenvalues, spectral_radius, is_stable, critical_wnT, design_poles, simulate,
                               simulate_rk4, overshoot, settle_time, twin_overshoot)


class T(unittest.TestCase):
    def test_step_matrix_matches_rk4(self):
        for kp, kd, Ts in ((1.0, 1.4, 0.3), (2.0, 0.5, 0.9), (0.3, 3.0, 0.1)):
            a = simulate(kp, kd, Ts, 1.0, 12)
            b = simulate_rk4(kp, kd, Ts, 1.0, 12, sub=50)
            self.assertLess(max(abs(p - q) for u, w in zip(a, b) for p, q in zip(u, w)), 1e-10)

    def test_jury_region_matches_spectral_radius(self):
        rng = random.Random(1)
        for _ in range(3000):
            kp, kd, Ts = rng.uniform(0.01, 5), rng.uniform(0.01, 5), rng.uniform(0.05, 1.5)
            if abs(spectral_radius(kp, kd, Ts) - 1) < 1e-9:
                continue
            self.assertEqual(is_stable(kp, kd, Ts), spectral_radius(kp, kd, Ts) < 1)

    def test_critical_wnT(self):
        for z in (0.3, 0.5, 0.7, 1.0, 2.0):
            kp, kd = gains(1.0, z)
            c = critical_wnT(z)
            self.assertLess(spectral_radius(kp, kd, c * 0.999), 1)
            self.assertGreater(spectral_radius(kp, kd, c * 1.001), 1)

    def test_twin_always_stable_real_not(self):
        kp, kd = gains(1.0, 0.7)
        self.assertTrue(spectral_radius(kp, kd, 1.5) > 1)       # wn T = 1.5 > 1/0.7 = 1.43
        xs = simulate(kp, kd, 1.5, 1.0, 60)
        self.assertGreater(abs(xs[-1][0]), 10)

    def test_deadbeat(self):
        kp, kd = design_poles(0.0, 0.0, 0.2)
        self.assertAlmostEqual(kp * 0.04, 1.0)
        self.assertAlmostEqual(kd * 0.2, 1.5)
        x, v = simulate(kp, kd, 0.2, 1.0, 2)[-1]
        self.assertLess(abs(x) + abs(v), 1e-12)

    def test_pole_placement(self):
        kp, kd = design_poles(0.8, 0.5, 0.3)
        z = sorted(eigenvalues(kp, kd, 0.3), key=lambda c: c.imag)
        self.assertAlmostEqual(z[1], 0.8 * complex(math.cos(0.5), math.sin(0.5)), places=12)

    def test_small_T_recovers_twin_overshoot(self):
        kp, kd = gains(1.0, 0.5)
        self.assertAlmostEqual(overshoot(kp, kd, 1e-3, 20000), twin_overshoot(0.5), places=3)

    def test_settle_inf_when_unstable(self):
        kp, kd = gains(1.0, 0.7)
        self.assertEqual(settle_time(kp, kd, 1.5, 100), math.inf)


if __name__ == "__main__":
    unittest.main()
