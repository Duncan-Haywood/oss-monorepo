"""tests/speed_loop_fit.py's drop fit for an ESC with its own speed loop (firmware/esp32/README.md "An ESC with its
own speed loop"): exact on wheels built from its own model when it is told the loop."""

import math
import unittest

import speed_loop_fit as S


def synth(rpm, drop, f, z, t0=200300.0):
    wn = 2 * math.pi * f * 1e-6
    sig, wd = z * wn, wn * math.sqrt(1 - z * z)
    w0 = rpm / 60e6
    edges, n = [0.0], 1
    while edges[-1] < 600000:
        lo, hi = edges[-1], edges[-1] + 3 / w0
        for _ in range(60):
            m = (lo + hi) / 2
            if w0 * m - w0 * drop * S._pi_X(m - t0, sig, wd) < n:
                lo = m
            else:
                hi = m
        edges.append(hi)
        n += 1
    return [edges[i + 1] - edges[i] for i in range(len(edges) - 1)]


class SpeedLoopFitTest(unittest.TestCase):
    def test_pi_X_is_the_error_integral(self):
        wn, z = 2 * math.pi * 5e-6, 0.6
        sig, wd = z * wn, wn * math.sqrt(1 - z * z)
        x = lambda t: math.exp(-sig * t) * (math.cos(wd * t) - sig / wd * math.sin(wd * t))
        n, T = 20000, 150000.0
        num = sum(x((i + 0.5) * T / n) for i in range(n)) * T / n
        self.assertAlmostEqual(num, S._pi_X(T, sig, wd), delta=1e-4 * abs(num))
        self.assertEqual(S._pi_X(-5.0, sig, wd), 0.0)

    def test_reads_its_own_model_exactly(self):
        for rpm, f, z in ((3000, 2, 0.7), (6000, 10, 0.7), (1500, 5, 0.4)):
            ps = synth(rpm, 0.06, f, z)
            r = S.drop_from_speed_loop(ps, [(0, 0, 0.3)], hz=(f,), zetas=(z,), levels=5)
            self.assertIsNotNone(r)
            self.assertAlmostEqual(r[0] / 0.06, 1.0, delta=0.002)


if __name__ == "__main__":
    unittest.main()
