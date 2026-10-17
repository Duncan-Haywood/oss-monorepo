import unittest

from lag_twin.model import (gains, tau_star, real_stable, poles, decay_rate, growth_rate_slope, step,
                            twin_overshoot, overshoot)


class T(unittest.TestCase):
    def test_twin_always_stable(self):
        for wn, z in ((1, 0.1), (5, 0.7), (50, 2)):
            kp, kd = gains(wn, z)
            self.assertTrue(all(p.real < 0 for p in poles(kp, kd, 0.0)))

    def test_routh_boundary_matches_roots(self):
        kp, kd = gains(2.0, 0.7)
        ts = tau_star(kp, kd)
        self.assertAlmostEqual(ts, 2 * 0.7 / 2.0)
        self.assertTrue(real_stable(kp, kd, ts * 0.999) and not real_stable(kp, kd, ts * 1.001))
        self.assertGreater(decay_rate(kp, kd, ts * 0.999), 0)
        self.assertLess(decay_rate(kp, kd, ts * 1.001), 0)

    def test_boundary_frequency_is_twin_natural_frequency(self):
        kp, kd = gains(3.0, 0.5)
        om = max(abs(p.imag) for p in poles(kp, kd, tau_star(kp, kd)))
        self.assertAlmostEqual(om, 3.0, places=8)

    def test_growth_slope(self):
        wn, z = 1.7, 0.6
        kp, kd = gains(wn, z)
        h = 1e-6 * tau_star(kp, kd)
        num = -decay_rate(kp, kd, tau_star(kp, kd) + h) / h
        self.assertAlmostEqual(num / growth_rate_slope(wn, z), 1.0, places=4)

    def test_scale_invariance(self):
        a = decay_rate(*gains(1.0, 0.7), 0.3) / 1.0
        b = decay_rate(*gains(8.0, 0.7), 0.3 / 8.0) / 8.0
        self.assertAlmostEqual(a, b, places=9)

    def test_twin_overshoot_formula(self):
        kp, kd = gains(1.0, 0.5)
        self.assertAlmostEqual(overshoot(step(kp, kd, 0.0, 1.0, 20, 1e-3), 1.0), twin_overshoot(0.5), places=4)

    def test_sim_grows_beyond_limit_and_decays_below(self):
        kp, kd = gains(1.0, 0.7)
        lo = step(kp, kd, 1.3, 1.0, 400)
        hi = step(kp, kd, 1.5, 1.0, 400)
        self.assertLess(max(abs(x) for x in lo[-2000:]), 0.5 * max(abs(x) for x in lo[:2000]))
        self.assertGreater(max(abs(x) for x in hi[-2000:]), 2 * max(abs(x) for x in hi[:2000]))

    def test_speed_limit_one_over_three_tau(self):
        tau = 0.05
        for wn in (1, 3, 3.849, 6, 20):
            for z in (0.5, 0.866, 1.2):
                self.assertLessEqual(decay_rate(*gains(wn, z), tau), 1 / (3 * tau) + 1e-9)
        kp, kd = 1 / (27 * tau * tau), 1 / (3 * tau)
        self.assertAlmostEqual(decay_rate(kp, kd, tau), 1 / (3 * tau), places=4)


if __name__ == "__main__":
    unittest.main()
