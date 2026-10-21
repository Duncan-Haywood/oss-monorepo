import os, sys, unittest
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
from accel_frontendbfp import bfp
F = bfp.F


def frame(level, seed=0):
    r = np.random.default_rng(seed)
    t = np.arange(F.WIN) / F.SR
    x = np.sin(2 * np.pi * 700 * t) + 0.5 * np.sin(2 * np.pi * 1900 * t + 1) + 0.01 * r.normal(size=F.WIN)
    return F.q15(x / x.std() * 10 ** (level / 20))


class T(unittest.TestCase):
    def test_fft_matches_numpy_after_exponent(self):
        r = np.random.default_rng(3)
        for amp in (20, 2000, 30000):
            re = [int(v) for v in r.integers(-amp, amp, 256)]; im = [int(v) for v in r.integers(-amp, amp, 256)]
            o = F.Ops()
            zr, zi, net = bfp.cfft256_bfp(re, im, o)
            ref = np.fft.fft(np.array(re) + 1j * np.array(im))
            got = (np.array(zr) + 1j * np.array(zi)) * 2.0 ** net
            self.assertLess(np.max(np.abs(got - ref)) / max(np.max(np.abs(ref)), 1), 2e-3)

    def test_never_stores_beyond_16_bits(self):
        for lvl in (-60, -30, -3, 0):
            o = F.Ops(); bfp.frame_cepstra_bfp(frame(lvl), 0, o)
            self.assertLessEqual(o.stored, 32767)

    def test_multiplies_unchanged_adds_grow(self):
        a, b = F.Ops(), F.Ops()
        x = frame(-20)
        F.frame_cepstra(x, 0, a); bfp.frame_cepstra_bfp(x, 0, b)
        self.assertEqual(a.mul, b.mul)
        self.assertEqual(b.add - a.add, 2 * 256 + 4 * 128 * 8)

    def test_quiet_input_beats_fixed_schedule(self):
        x = frame(-50)
        ref = F.float_cepstra(x, 0)[1:]
        c0 = np.array(F.frame_cepstra(x, 0, F.Ops())) / F.ONE
        c1 = np.array(bfp.frame_cepstra_bfp(x, 0, F.Ops())[0]) / F.ONE
        self.assertLess(np.sqrt(np.mean((c1[1:] - ref) ** 2)), np.sqrt(np.mean((c0[1:] - ref) ** 2)))

    def test_agrees_with_float_when_loud(self):
        x = frame(-10)
        c = np.array(bfp.frame_cepstra_bfp(x, 0, F.Ops())[0]) / F.ONE
        self.assertLess(np.sqrt(np.mean((c[1:] - F.float_cepstra(x, 0)[1:]) ** 2)), 0.5)


if __name__ == '__main__':
    unittest.main()
