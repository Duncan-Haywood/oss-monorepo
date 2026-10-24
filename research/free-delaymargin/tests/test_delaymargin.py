import math, sys, unittest
from pathlib import Path
HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
from delaymargin import analytic_margin, spectral_radius, max_stable_steps, simulate  # noqa: E402


class Tests(unittest.TestCase):
    def test_analytic_known_case(self):
        # kp = 1, kd = 0: pure oscillator at w = 1, phi = 0: no delay is tolerated
        self.assertAlmostEqual(analytic_margin(1.0, 0.0)[0], 0.0, places=9)
        # kp = 1, kd = sqrt(2): w^2 = (2 + sqrt(8)) / 2 -> check the crossing equation directly
        kp, kd = 1.0, math.sqrt(2)
        tau, w = analytic_margin(kp, kd)
        lhs = complex(-w * w) + complex(kp, kd * w) * complex(math.cos(w * tau), -math.sin(w * tau))
        self.assertAlmostEqual(abs(lhs), 0.0, places=9)

    def test_discrete_margin_converges_to_analytic(self):
        kp, kd = 4.0, 2.8
        tau = analytic_margin(kp, kd)[0]
        errs = []
        for dt in (0.02, 0.005):
            n = max_stable_steps("zoh", dt, kp, kd)
            errs.append(abs(n * dt - tau))
        self.assertLess(errs[1], errs[0])
        self.assertLess(errs[1], 0.01)

    def test_spectral_radius_agrees_with_time_domain(self):
        kp, kd, dt = 4.0, 2.8, 0.01
        n = max_stable_steps("semi", dt, kp, kd)
        self.assertLess(simulate("semi", dt, n - 10, kp, kd, T=80), 1e-3)
        self.assertGreater(simulate("semi", dt, n + 3, kp, kd, T=80), 1.0)

    def test_margin_is_a_threshold(self):
        kp, kd, dt = 4.0, 2.8, 0.01
        n = max_stable_steps("zoh", dt, kp, kd)
        self.assertLess(spectral_radius("zoh", dt, n, kp, kd), 1)
        self.assertGreaterEqual(spectral_radius("zoh", dt, n + 1, kp, kd), 1 - 1e-9)

    def test_half_step_rule(self):
        for kd in (1.2, 2.8, 8.0):
            tau = analytic_margin(4.0, kd)[0]
            for dt in (0.05, 0.02):
                self.assertEqual(max_stable_steps("zoh", dt, 4.0, kd), math.ceil(tau / dt - 0.5) - 1)


if __name__ == "__main__":
    unittest.main()
