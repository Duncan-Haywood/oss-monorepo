"""tests/speed_ramp_fit.py, the ramp-then-PI drop fit for a speed-mode ESC (firmware/esp32/README.md "A ramp-then-PI
drop fit for a speed-mode ESC"): its closed forms, the spin-up's limit and drag, a clamped ball read on the simulator,
and the mark on a ball the revolutions cannot see."""

import math
import unittest

import speed_ramp_fit as R
from loop_residual_sweep import wheel
from speed_ramp_survey import spinup, step_pick


def integral(fn, T, n=20000):
    return sum(fn((i + 0.5) * T / n) for i in range(n)) * T / n


class KernelTest(unittest.TestCase):
    def test_integrals_under_and_over_damped(self):
        for z in (0.4, 0.95, 1.3):
            K = R.Kernel(2 * math.pi * 6e-6, z)
            T = 120000.0
            self.assertAlmostEqual(integral(K.x, T), K.X(T), delta=1e-4 * max(abs(K.X(T)), 1.0))
            self.assertAlmostEqual(integral(K.X, T), K.XX(T), delta=1e-4 * abs(K.XX(T)))
            self.assertEqual(K.x(0), 1.0)
            self.assertEqual(K.X(-3.0), 0.0)

    def test_ball_response_matches_its_integral(self):
        br = R.BallResponse(11250.0, 0.8, 20.0, 0.4, 4000.0)       # a 10% ball clamps here (e* about 1.6%)
        self.assertTrue(0 < br.es < 0.1)
        t1 = br.exit_time(0.10)
        self.assertGreater(t1, 0)
        self.assertAlmostEqual(br.e(t1 - 1e-3, 0.10), br.es, delta=1e-6)       # the error is continuous at the exit
        self.assertAlmostEqual(br.e(t1 + 1e-3, 0.10), br.es, delta=1e-6)
        T = 150000.0
        self.assertAlmostEqual(integral(lambda t: br.e(t, 0.10), T), br.G(T, 0.10), delta=2e-4 * br.G(T, 0.10))

    def test_plan_without_steps_is_the_plain_response(self):
        br = R.BallResponse(11250.0, 0.8, 20.0, 0.4, 4000.0)
        pl = br.plan(0.10, [])
        for t in (1000.0, 30000.0, 90000.0, 200000.0):
            self.assertAlmostEqual(br.Gp(t, 0.10, pl), br.G(t, 0.10), delta=1e-6 * abs(br.G(t, 0.10)) + 1e-9)


class SpinupTest(unittest.TestCase):
    def test_reads_the_limit_and_drag(self):
        for tau in (0.2, 0.8):
            for jit in (0, 5):
                ps, start = spinup(tau, 9000.0 / tau, jitter_us=jit)
                a, t, _ = R.spinup_fit(ps, start)
                self.assertAlmostEqual(a * tau / 9000.0, 1.0, delta=0.002)
                self.assertAlmostEqual(t / tau, 1.0, delta=0.002)


class StepTrainTest(unittest.TestCase):
    def test_reads_the_loop_from_a_step_train(self):
        # +-2% steps at 1,500 rpm on a free wheel: the loop within 2% in frequency and 0.03 in damping, 5 us tach
        for f, z, tau in ((2, 0.4, 0.8), (10, 0.7, 0.2), (20, 0.4, 0.8)):
            hz, zt, _ = step_pick(f, z, tau, 5)
            self.assertAlmostEqual(hz / f, 1.0, delta=0.02)
            self.assertAlmostEqual(zt, z, delta=0.03)
            self.assertFalse(R.step_clamped(1500, 0.02, f, z, 9000.0 / tau, tau))

    def test_a_big_step_is_flagged_clamped(self):
        self.assertTrue(R.step_clamped(3000, 0.02, 20, 0.7, 11250.0, 0.8))


class RampFitTest(unittest.TestCase):
    def test_reads_a_clamped_ball_on_the_simulator(self):
        # 10 Hz, damping 0.7, drag 0.8 s: the speed-loop survey's linear fit read these 31-77% off at its pick and
        # up to 50% off told the true loop (eval/speed-loop-survey-2026-11-18.txt)
        for rpm, drop in ((4000, 0.10), (6000, 0.06)):
            ps, tk = wheel(rpm, drop, 0.8, ball_ms=1504.5, speed_loop=(10, 0.7, 9000.0 / 0.8))
            r = R.drop_from_speed_ramp(ps, tk, 9000.0 / 0.8, 0.8, hz=(10,), zetas=(0.7,), levels=4)
            self.assertIsNotNone(r)
            self.assertAlmostEqual(r[0] / drop, 1.0, delta=0.01)
            self.assertGreater(r[7], R.SEEN_MIN)

    def test_marks_a_ball_the_revolutions_cannot_see(self):
        # 20 Hz on a light wheel at 1,500 rpm: the loop recovers inside the ball's own 40 ms revolution
        ps, tk = wheel(1500, 0.06, 0.2, ball_ms=1501.0, speed_loop=(20, 0.7, 45000.0))
        r = R.drop_from_speed_ramp(ps, tk, 45000.0, 0.2, hz=(20,), zetas=(0.7,), levels=4)
        self.assertIsNotNone(r)
        self.assertLess(r[7], R.SEEN_MIN)


if __name__ == "__main__":
    unittest.main()
