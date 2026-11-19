"""More tach pulses a revolution (2026-11-19, firmware/esp32/README.md "More tach pulses a revolution"): the drop fit's
`per` / `angles` leave a once-a-revolution fit unchanged, `magnet_spacing` recovers uneven magnets on a settling
wheel, and a four-magnet fit with learnt spacing reads a known drop."""

import math
import os
import random
import sys
import unittest

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "firmware", "esp32"))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from feeder_sim import controller  # noqa: E402
import loop_residual_sweep as lrs  # noqa: E402


def magnet_periods(shares, n_rev, rpm0=3000.0, ramp=0.0):
    """Periods of a wheel whose period changes by `ramp` us a revolution, magnets at the given shares of it."""
    out = []
    for r in range(n_rev):
        rev_us = 60e6 / rpm0 + ramp * r
        for s in shares:
            out.append(rev_us * s)
    return out


class MagnetSpacingTest(unittest.TestCase):
    def test_one_magnet(self):
        self.assertEqual(controller.magnet_spacing([20000.0] * 10, 1), [1.0])

    def test_too_few_revolutions(self):
        self.assertIsNone(controller.magnet_spacing([5000.0] * 8, 4))

    def test_recovers_uneven_magnets_on_a_settling_wheel(self):
        shares = [0.2512, 0.2479, 0.2531, 0.2478]
        ps = magnet_periods(shares, 20, ramp=-3.0)      # the period shrinking 3 us a revolution
        got = controller.magnet_spacing(ps, 4)
        for g, s in zip(got, shares):
            self.assertAlmostEqual(g, s, delta=3e-5)     # magnets 1e-3 apart; the ramp steps by revolution
        self.assertAlmostEqual(sum(got), 1.0, places=12)


class PerFitTest(unittest.TestCase):
    def test_per_one_is_the_old_fit(self):
        ps, tk = lrs.wheel(3500, 0.08, 0.3, ball_ms=1500.4)
        a = controller.drop_from_commands(ps, tk)
        b = controller.drop_from_commands(ps, tk, per=1, angles=None)
        self.assertEqual(a, b)

    def test_four_magnets_with_learnt_spacing_read_the_drop(self):
        import tach_pulses_sweep as tps
        edges, ticks, _, t_ball = tps.trial(3500, 0.3, 0.0, 0, 4, 0.5, 0.0, 11)
        for n_use in (1, 4):
            ps, tk = tps.fit_inputs(edges, ticks, n_use, 4, t_ball)
            k = 0
            tt = 0.0
            while tt + ps[k] < 250000:
                tt += ps[k]
                k += 1
            f = controller.magnet_spacing(ps[:k - k % n_use], n_use)
            angles = [f[j % n_use] for j in range(len(ps))]
            r = controller.drop_from_commands(ps, tk, angles=angles, per=n_use)
            self.assertIsNotNone(r)
            self.assertAlmostEqual(r[0], tps.DROP, delta=0.0005)
            self.assertAlmostEqual(r[1], 3500, delta=20)

    def test_naive_spacing_misfits(self):
        import tach_pulses_sweep as tps
        edges, ticks, _, t_ball = tps.trial(3500, 0.3, 0.0, 0, 4, 1.0, 0.0, 11)
        ps, tk = tps.fit_inputs(edges, ticks, 4, 4, t_ball)
        naive = controller.drop_from_commands(ps, tk, per=4)
        k = 0
        tt = 0.0
        while tt + ps[k] < 250000:
            tt += ps[k]
            k += 1
        f = controller.magnet_spacing(ps[:k - k % 4], 4)
        learnt = controller.drop_from_commands(ps, tk, angles=[f[j % 4] for j in range(len(ps))], per=4)
        self.assertGreater(naive[4], 10 * learnt[4])     # the rms per period, as a share of the speed


if __name__ == "__main__":
    unittest.main()
