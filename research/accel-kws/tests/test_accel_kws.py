import os
import shutil
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from accel_kws import cost, mfcc, model, rtl  # noqa: E402

HAVE_TOOLS = shutil.which("iverilog") and shutil.which("yosys")


def toy(seed=0, n=1500, d=70):
    rng = np.random.default_rng(seed)
    c = rng.normal(0, 1, (model.OUT, d))
    y = rng.integers(0, model.OUT, n)
    return c[y] + rng.normal(0, 1.5, (n, d)), y


class TestFrontEnd(unittest.TestCase):
    def test_shapes(self):
        clips = np.random.default_rng(0).normal(0, 0.1, (3, mfcc.CLIP))
        c = mfcc.mfcc(clips)
        self.assertEqual(c.shape, (3, 49, 10))
        self.assertEqual(mfcc.pool_segments(c, 7).shape, (3, 70))
        self.assertEqual(mfcc.pool_segments(c, 12).shape, (3, 120))

    def test_dct_rows_orthonormal(self):
        m = mfcc.dct_matrix(40, 10)
        np.testing.assert_allclose(m @ m.T, np.eye(10), atol=1e-12)

    def test_filterbank_nonnegative_and_nonempty(self):
        fb = mfcc.mel_filterbank()
        self.assertTrue((fb >= 0).all())
        self.assertTrue((fb.sum(axis=1) > 0).all())

    def test_tone_changes_features(self):
        t = np.arange(mfcc.CLIP) / mfcc.SR
        a = mfcc.mfcc(np.sin(2 * np.pi * 300 * t)[None] * 0.3)
        b = mfcc.mfcc(np.sin(2 * np.pi * 2500 * t)[None] * 0.3)
        self.assertGreater(np.abs(a - b).mean(), 0.5)


class TestModel(unittest.TestCase):
    def test_int_forward_matches_manual(self):
        x, y = toy()
        m = model.train_qat(x, y, 8, 4, epochs=3)
        xq = model.quantise_inputs(x[:5], m.mean, m.std)
        lg, h = model.int_forward(m, xq)
        for n in range(5):
            hh = [min(max((int(np.dot(xq[n], m.w1[j])) + int(m.b1[j])) >> m.s1, 0), 255) for j in range(8)]
            self.assertEqual(hh, h[n].tolist())
            ref = [int(np.dot(hh, m.w2[k])) + int(m.b2[k]) for k in range(model.OUT)]
            self.assertEqual(ref, lg[n].tolist())

    def test_weight_range(self):
        x, y = toy()
        for b in (2, 3, 4, 8):
            m = model.train_qat(x, y, 8, b, epochs=2)
            self.assertLessEqual(np.abs(m.w1).max(), model.qmax(b))
            self.assertLessEqual(np.abs(m.w2).max(), model.qmax(b))

    def test_learns_toy_task(self):
        x, y = toy()
        m = model.train_qat(x, y, 32, 4, epochs=10)
        pred = model.int_predict(m, model.quantise_inputs(x, m.mean, m.std))
        self.assertGreater((pred == y).mean(), 0.8)

    def test_macs(self):
        self.assertEqual(model.macs(70, 32), 70 * 32 + 32 * 11)


class TestCost(unittest.TestCase):
    def test_energy_grows_with_bits_and_macs(self):
        self.assertLess(cost.energy_per_mac_pj(2), cost.energy_per_mac_pj(8))
        self.assertLess(cost.energy_per_inference_nj(1000, 4), cost.energy_per_inference_nj(2000, 4))

    def test_power_units(self):
        # 1 nJ per inference at 4 Hz is 4 nW = 0.004 uW
        self.assertAlmostEqual(cost.always_on_uw(1.0, 4.0), 0.004)


@unittest.skipUnless(HAVE_TOOLS, "needs iverilog and yosys")
class TestRTL(unittest.TestCase):
    def test_bit_exact_all_widths(self):
        x, y = toy(1)
        for b in (2, 3, 4, 8):
            m = model.train_qat(x, y, 8, b, epochs=3)
            xq = model.quantise_inputs(x[:12], m.mean, m.std)
            cls, cyc, lg = rtl.simulate(m, xq)
            ref, _ = model.int_forward(m, xq)
            np.testing.assert_array_equal(lg, ref)
            np.testing.assert_array_equal(cls, ref.argmax(axis=1))
            self.assertEqual(set(cyc.tolist()), {model.macs(70, 8) + 3})

    def test_extreme_inputs_saturate_like_reference(self):
        x, y = toy(2)
        m = model.train_qat(x, y, 8, 4, epochs=2)
        xq = np.full((2, 70), 127)
        xq[1] = -128
        cls, _, lg = rtl.simulate(m, xq)
        ref, _ = model.int_forward(m, xq)
        np.testing.assert_array_equal(lg, ref)

    def test_area_grows_with_hidden_and_bits(self):
        base = dict(IN=70, H=8, OUT=11, WB=4, ACCW=24, S1=4)
        a = rtl.synth(base)["cells"]
        self.assertGreater(rtl.synth({**base, "H": 32})["cells"], a)
        self.assertGreater(rtl.synth({**base, "WB": 8})["cells"], a)


if __name__ == "__main__":
    unittest.main()
