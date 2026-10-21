import os, sys, unittest
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'accel-kws', 'src'))
from accel_frontend import frontend as F
from accel_kws import mfcc as KM


def tone(f=700, a=0.3):
    t = np.arange(F.WIN) / F.SR
    return F.q15(a * np.sin(2 * np.pi * f * t))


class T(unittest.TestCase):
    def test_filterbank_matches_accel_kws(self):
        self.assertTrue(np.allclose(F.FB, KM.mel_filterbank()))
        self.assertTrue(np.allclose(F.dct_matrix(), KM.dct_matrix()))

    def test_fft_counts_and_values(self):
        rng = np.random.default_rng(1)
        re = [int(v) for v in rng.integers(-3000, 3000, 256)]
        im = [int(v) for v in rng.integers(-3000, 3000, 256)]
        o = F.Ops()
        zr, zi = F.cfft256(re, im, o)
        self.assertEqual(o.mul, 4 * 128 * 8)   # 8 stages of 128 butterflies, 4 multiplies each
        self.assertEqual(o.add, 6 * 128 * 8)
        ref = np.fft.fft(np.array(re) + 1j * np.array(im)) / 256
        self.assertLess(np.max(np.abs(np.array(zr) + 1j * np.array(zi) - ref)), 12)

    def test_tone_cepstra_close_to_float(self):
        # a pure tone leaves mel bands empty, where the integer path floors at 1 LSB and the float one does not
        x = F.q15(tone() / F.ONE + np.random.default_rng(2).normal(0, 0.02, F.WIN)); o = F.Ops()
        ref = F.float_cepstra(x, int(x[0]))
        wide = np.array(F.frame_cepstra(x, int(x[0]), o, (1, 1, 0, 0, 0, 0, 0, 0))) / F.ONE
        self.assertLess(np.max(np.abs(wide - ref)), 0.2)
        # one shift per stage floors the quiet mel bands: a smooth bias of a couple of units
        narrow = np.array(F.frame_cepstra(x, int(x[0]), F.Ops())) / F.ONE
        self.assertGreater(np.max(np.abs(narrow - ref)), 1.0)

    def test_counts_do_not_depend_on_data(self):
        a, b = F.Ops(), F.Ops()
        F.frame_cepstra(tone(300), 0, a); F.frame_cepstra(tone(2500, 0.05), 0, b)
        self.assertEqual(a.as_dict(), b.as_dict())

    def test_mel_weights_counted(self):
        self.assertEqual(sum(len(r) for r in F.FB_NZ), 247)

    def test_fewer_shifts_need_wider_words(self):
        x = tone(700, 0.5); a, b = F.Ops(), F.Ops()
        F.frame_cepstra(x, 0, a); F.frame_cepstra(x, 0, b, (1, 1, 0, 0, 0, 0, 0, 0))
        self.assertGreater(b.peak, a.peak)


if __name__ == '__main__':
    unittest.main()
