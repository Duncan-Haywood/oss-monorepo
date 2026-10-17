import math
import unittest

from windup_twin.model import gains, sat, simulate, overshoot, settle_time, saturated_phase

KP, KI = gains(1.0, 0.7)


class T(unittest.TestCase):
    def test_twin_exact_when_command_within_limit(self):
        x0 = 0.7                        # kp x0 = 0.98 < U = 1
        xr, _ = simulate(KP, KI, 1.0, x0, 30.0, dt=1e-3)
        xt, _ = simulate(KP, KI, 1e9, x0, 30.0, dt=1e-3)
        self.assertLess(max(abs(a - b) for a, b in zip(xr, xt)), 1e-12)

    def test_twin_fails_beyond_limit(self):
        x0 = 1.5
        xr, _ = simulate(KP, KI, 1.0, x0, 30.0, dt=1e-3)
        xt, _ = simulate(KP, KI, 1e9, x0, 30.0, dt=1e-3)
        self.assertGreater(max(abs(a - b) for a, b in zip(xr, xt)), 0.05)

    def test_twin_overshoot_independent_of_step(self):
        a = overshoot(simulate(KP, KI, 1e9, 1.0, 60.0)[0], 1.0)
        b = overshoot(simulate(KP, KI, 1e9, 37.0, 60.0)[0], 37.0)
        self.assertAlmostEqual(a, b, places=9)

    def test_saturated_phase_closed_form(self):
        x0 = 5.0
        te, ze = saturated_phase(KP, KI, 1.0, x0)
        x = x0 - te
        self.assertAlmostEqual(KP * x + KI * ze, 1.0, places=9)
        dt = 1e-4
        xs, zs = simulate(KP, KI, 1.0, x0, te, dt=dt)
        self.assertAlmostEqual(xs[-1], x, places=4)
        self.assertAlmostEqual(zs[-1], ze, places=4)

    def test_peak_integrator_state_is_x0_squared_over_2U(self):
        for x0 in (5.0, 10.0):
            _, zs = simulate(KP, KI, 1.0, x0, 12 * x0, dt=2e-3)
            self.assertAlmostEqual(max(zs) / (x0 * x0 / 2), 1.0, places=2)

    def test_windup_overshoot_grows_and_clamp_helps(self):
        os_ = []
        for x0 in (0.5, 2.0, 10.0):
            xr, _ = simulate(KP, KI, 1.0, x0, 400.0, dt=2e-3)
            xa, _ = simulate(KP, KI, 1.0, x0, 400.0, dt=2e-3, antiwindup=True)
            os_.append(overshoot(xr, x0))
            if x0 > 1:
                self.assertLess(overshoot(xa, x0), overshoot(xr, x0))
        self.assertLess(os_[0], os_[1])
        self.assertLess(os_[1], os_[2])

    def test_load_at_limit_never_settles(self):
        xs, _ = simulate(KP, KI, 1.0, 5.0, 400.0, d=1.05, dt=5e-3)
        self.assertTrue(math.isinf(settle_time(xs, 5.0, 5e-3)))
        xs, _ = simulate(KP, KI, 1.0, 5.0, 400.0, d=0.5, dt=5e-3)
        self.assertFalse(math.isinf(settle_time(xs, 5.0, 5e-3)))


if __name__ == "__main__":
    unittest.main()
