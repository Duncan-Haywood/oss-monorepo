import unittest

from flex_twin.model import (coeffs, cubic, eps_crit, eps_crit_cubic, hurwitz4, params, real_stable,
                             settle_time, simulate, twin_gains)


class T(unittest.TestCase):
    def test_hurwitz(self):
        self.assertTrue(hurwitz4(1, 4, 6, 4, 1))        # (s+1)^4
        self.assertFalse(hurwitz4(1, 1, 1, 1, 1))       # s^4+...+1 has roots in the RHP

    def test_rigid_twin_is_stable_for_any_bandwidth(self):
        # rigid closed loop M s^2 + kd s + kp: decays in simulation for eps far above anything the real plant tolerates
        J1, J2, k, c = params(0.2, 0.01)
        for eps in (0.01, 1.0, 50.0):
            kp, kd = twin_gains(1.0, eps, 0.7)
            dt = 0.02 / eps                                  # w dt = 0.02; run 30 decay times 1/(zeta w)
            ys = simulate(J1, J2, k, c, kp, kd, int(30 / (0.7 * eps) / dt), dt, x2_0=1.0, twin=True)
            self.assertLess(abs(ys[-1]), 1e-6)

    def test_critical_bandwidth_independent_of_mass_ratio(self):
        vals = [eps_crit(mu, 0.05, 0.7) for mu in (0.01, 0.05, 0.1, 0.2, 0.25)]
        self.assertLess(max(vals) - min(vals), 1e-9)

    def test_critical_bandwidth_matches_cubic(self):
        for d in (0.005, 0.05, 0.2):
            for z in (0.5, 0.7, 1.0):
                self.assertAlmostEqual(eps_crit(0.2, d, z), eps_crit_cubic(d, z), places=9)
                self.assertLess(abs(cubic(eps_crit_cubic(d, z), d, z)), 1e-9)

    def test_small_damping_law(self):
        for z in (0.5, 1.0):
            self.assertAlmostEqual(eps_crit(0.2, 1e-4, z) * z / 1e-4, 1.0, places=3)

    def test_undamped_flexible_mode_unstable_at_any_gain(self):
        for eps in (1e-4, 1e-2, 0.3, 3.0):
            self.assertFalse(real_stable(0.2, 0.0, eps, 0.7))

    def test_collocated_always_stable(self):
        for mu in (0.05, 0.25):
            for d in (0.0, 0.01, 0.5):
                for eps in (1e-3, 0.1, 1.0, 100.0):
                    self.assertTrue(real_stable(mu, d, eps, 0.7, collocated=True))

    def test_simulation_agrees_with_routh_on_both_sides(self):
        d, z, mu = 0.2, 0.7, 0.2
        J1, J2, k, c = params(mu, d)
        ec = eps_crit(mu, d, z)
        for f, grows in ((0.7, False), (1.6, True)):
            kp, kd = twin_gains(1.0, f * ec, z)
            ys = simulate(J1, J2, k, c, kp, kd, 60000, 0.01, x2_0=1.0)
            early = max(abs(y) for y in ys[2000:6000])
            late = max(abs(y) for y in ys[-4000:])
            self.assertEqual(late > early, grows)

    def test_settle_time(self):
        self.assertEqual(settle_time([0.0, 1.0, 1.0], 1.0, 1.0), 1.0)
        self.assertIsNone(settle_time([0.0, 0.5, 0.0], 1.0, 1.0))


if __name__ == "__main__":
    unittest.main()
