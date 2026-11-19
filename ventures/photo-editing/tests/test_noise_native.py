"""The C noise-reading helper (shootflow.noise_native, 2026-11-19) must equal the numpy reference bit for bit."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

try:
    import numpy as np

    from shootflow import noise_native
    from shootflow import xtrans_demosaic as xd

    HAVE = noise_native.available()
except ImportError:  # the no-numpy CI job: the noise-aware demosaic needs numpy
    HAVE = False

XTRANS = [1, 1, 0, 1, 1, 2, 1, 1, 2, 1, 1, 0, 2, 0, 1, 0, 2, 1, 1, 1, 2, 1, 1, 0, 1, 1, 0, 1, 1, 2, 0, 2, 1, 2, 0, 1]
BAYERS = ([0, 1, 1, 2], [2, 1, 1, 0], [1, 0, 2, 1], [1, 2, 0, 1])


def _bits(a):
    return np.ascontiguousarray(a).view(np.uint64)


def _median_np(a):
    return xd._block_stat(a, lambda t: np.median(t, axis=-1))


@unittest.skipUnless(HAVE, "needs numpy and a C compiler")
class NoiseNativeTest(unittest.TestCase):
    def test_residual_equals_numpy_on_every_cfa_and_odd_sizes(self):
        rng = np.random.default_rng(7)
        for trial in range(36):
            pat = XTRANS if trial % 3 == 0 else BAYERS[trial % 4]
            h, w = (int(v) for v in rng.integers(2, 90, 2))
            # negatives (a black-subtracted plane), so masked-out sensels are -0.0 as in numpy
            c = rng.normal(0.2, 0.08, (h, w)) * rng.choice([1.0, 1.0, -1.0], (h, w))
            band, threads = int(rng.integers(1, 40)), int(rng.integers(1, 5))
            got = noise_native.residual(c, pat, band=band, threads=threads)
            want = xd._residual_np(c, pat)
            self.assertTrue(np.array_equal(_bits(got), _bits(want)), (trial, h, w, band, threads))

    def test_residual_is_the_default_path(self):
        c = np.random.default_rng(1).normal(0.3, 0.05, (60, 66))
        self.assertTrue(np.array_equal(_bits(xd._residual(c, XTRANS)), _bits(xd._residual_np(c, XTRANS))))

    def test_block_median_equals_numpy_with_ties_and_nan(self):
        rng = np.random.default_rng(3)
        for trial in range(12):
            h, w = (int(v) for v in rng.integers(24, 130, 2))
            a = rng.random((h, w))
            if trial % 3 == 1:
                a = np.round(a * 8) / 8  # many equal values
            if trial % 3 == 2:
                a[rng.integers(0, h), rng.integers(0, w)] = np.nan
            got = noise_native.block_median(a, 24, threads=int(rng.integers(1, 4)))
            want = _median_np(a)
            self.assertTrue(np.array_equal(got, want, equal_nan=True), trial)
        for block in (5, 6):  # an odd count takes the middle value
            a = rng.random((31, 40))
            self.assertTrue(np.array_equal(noise_native.block_median(a, block), _median_np_block(a, block)))

    def test_small_planes_go_to_numpy(self):
        self.assertIsNone(noise_native.residual(np.zeros((1, 9)), BAYERS[0]))
        self.assertIsNone(noise_native.block_median(np.zeros((10, 30)), 24))

    def test_block_spread_unchanged(self):
        c = np.random.default_rng(5).normal(0.25, 0.04, (97, 121))
        level, spread = xd._block_spread(c, BAYERS[0])
        self.assertTrue(np.array_equal(spread, _median_np(xd._residual_np(c, BAYERS[0]))))
        self.assertEqual(level.shape, spread.shape)


def _median_np_block(a, block):
    return xd._block_stat(a, lambda t: np.median(t, axis=-1), block=block)



def _no_native(name):
    """A context in which ``noise_native.<name>`` declines, so the numpy reference runs."""

    from unittest import mock

    return mock.patch.object(noise_native, name, lambda *a, **k: False)


@unittest.skipUnless(HAVE, "needs numpy and a C compiler")
class NativeBlendTest(unittest.TestCase):
    """The bilinear image and the blend in C (2026-11-19, eval/noise-aware-native-blend-2026-11-19.md)."""

    def test_bilinear_sink_equals_numpy(self):
        from shootflow import raw_develop_np as rnp

        rng = np.random.default_rng(11)
        for trial in range(30):
            pat = XTRANS if trial % 3 == 0 else BAYERS[trial % 4]
            h, w = (int(v) for v in rng.integers(1, 70, 2))
            norm = rng.normal(0.4, 0.3, (h, w)) * rng.choice([1.0, -1.0, 1.0], (h, w))
            mults = tuple(float(v) for v in rng.uniform(0.5, 2.5, 3))
            hi = float(rng.choice([1.0, 0.7, 1e9]))
            dtype = np.float32 if trial % 2 else np.float64
            got = np.full((h, w, 3), np.nan, dtype=dtype)
            self.assertTrue(noise_native.bilinear(norm, pat, mults, hi, got, threads=int(rng.integers(1, 4))))
            want = np.full((h, w, 3), np.nan, dtype=dtype)
            with _no_native("bilinear"):
                rnp._bilinear(norm, w, h, pat, mults, hi, None, None, None, None, sink=want, threads=1)
            self.assertTrue(np.array_equal(got.view(np.uint8), want.view(np.uint8)), (trial, h, w))

    def test_blend_equals_numpy(self):
        rng = np.random.default_rng(5)
        for trial in range(24):
            h, w = (int(v) for v in rng.integers(1, 200, 2))
            hb, wb = max(1, h // 24), max(1, w // 24)
            q = rng.uniform(0.0, 2.5, (hb, wb))
            bt = np.float32 if trial % 2 else np.float64
            dt = np.float32 if trial % 3 else np.float64
            b = rng.normal(0.4, 0.3, (h, w, 3)).astype(bt)
            d = (b + rng.normal(0, 0.05, (h, w, 3))).astype(dt)
            luma = None if trial % 4 == 0 else (0.8, 1.5)
            clip = trial % 2 == 1 and trial % 5 != 0  # float32 out only
            out_t = np.float32 if trial % 2 else np.float64
            hi = 0.6 if clip else None
            threads = int(rng.integers(1, 4))
            got = xd.blend(b.copy(), d, q, 0.4, 1.2, luma_ramp=luma, out=np.empty((h, w, 3), out_t),
                           threads=threads, clip_hi=hi)
            with _no_native("blend"):
                want = xd.blend(b.copy(), d, q, 0.4, 1.2, luma_ramp=luma, out=np.empty((h, w, 3), out_t),
                                threads=1, clip_hi=hi)
            self.assertTrue(np.array_equal(got.view(np.uint8), want.view(np.uint8)), (trial, h, w, bt, dt, luma, clip))

    def test_blend_in_place_over_the_bilinear_image(self):
        rng = np.random.default_rng(9)
        b = rng.normal(0.4, 0.2, (97, 130, 3)).astype(np.float32)
        d = (b + rng.normal(0, 0.05, b.shape)).astype(np.float32)
        q = rng.uniform(0, 2, (4, 5))
        want = xd.blend(b.copy(), d, q, 0.4, 1.2, luma_ramp=(0.8, 1.5), out=np.empty_like(b), clip_hi=0.5)
        bb = b.copy()
        got = xd.blend(bb, d, q, 0.4, 1.2, luma_ramp=(0.8, 1.5), out=bb, clip_hi=0.5)
        self.assertIs(got, bb)
        self.assertTrue(np.array_equal(got, want))

    def test_luma_order_is_the_fixed_elementwise_one(self):
        # one channel moved by (a_l - a) * Y with Y in the documented order, not a BLAS product's
        b = np.zeros((24, 24, 3))
        d = np.tile(np.array([0.1, 0.3, 0.7]), (24, 24, 1))
        q = np.array([[1.0]])
        got = xd.blend(b, d, q, 0.0, 2.0, luma_ramp=(0.0, 4.0))
        y = (0.1 * 0.2126 + 0.3 * 0.7152) + 0.7 * 0.0722
        a, a_l = 0.5, 0.25
        want = np.array([a * v + (1 - a) * 0.0 for v in (0.1, 0.3, 0.7)]) + (a_l - a) * y
        self.assertTrue(np.array_equal(got[5, 5], want))


@unittest.skipUnless(HAVE, "needs numpy and a C compiler")
class NativeBlockLevelTest(unittest.TestCase):
    """Block means of the clipped plane and block maxima in C (2026-11-19, eval/noise-aware-native-levels-2026-11-19.md)."""

    def test_block_mean_and_max_equal_numpy_bit_for_bit(self):
        rng = np.random.default_rng(11)
        for trial in range(24):
            block = (24, 24, 5, 6, 12, 3)[trial % 6]
            h, w = (int(v) for v in rng.integers(block, 140, 2))
            # wide dynamic range and negatives (clipped to +0.0; -0.0 too), so the summation order shows
            a = rng.normal(0.2, 0.3, (h, w)) * 10.0 ** rng.integers(-3, 4, (h, w))
            a[rng.random((h, w)) < 0.05] = -0.0
            if trial % 4 == 3:
                a[rng.integers(0, h), rng.integers(0, w)] = np.nan
            mean, top = noise_native.block_mean_max(a, block, top=True, threads=int(rng.integers(1, 4)))
            want_mean = xd._block_stat(np.clip(a, 0.0, None), lambda t: t.mean(axis=-1), block=block)
            want_top = xd._block_stat(a, lambda t: t.max(axis=-1), block=block)
            self.assertTrue(np.array_equal(_bits(mean), _bits(want_mean)), (trial, block, h, w))
            self.assertTrue(np.array_equal(_bits(top), _bits(want_top)), (trial, block, h, w))

    def test_level_and_top_are_the_default_path(self):
        c = np.random.default_rng(2).normal(0.3, 0.2, (100, 130))
        self.assertTrue(np.array_equal(_bits(xd._block_level(c)),
                                       _bits(xd._block_stat(np.clip(c, 0.0, None), lambda t: t.mean(axis=-1)))))
        self.assertTrue(np.array_equal(_bits(xd._block_top(c)), _bits(xd._block_stat(c, lambda t: t.max(axis=-1)))))

    def test_small_planes_go_to_numpy_too(self):
        self.assertIsNone(noise_native.block_mean_max(np.zeros((10, 30)), 24))
        c = np.random.default_rng(4).random((12, 30))  # under one block: numpy's single whole-frame block
        self.assertEqual(xd._block_level(c).shape, (1, 1))
        self.assertEqual(xd._block_level(c)[0, 0], np.clip(c, 0.0, None).mean())


if __name__ == "__main__":
    unittest.main()
