"""The C noise-reading helper (shootflow.noise_native, 2026-11-19) must equal the numpy reference bit for bit."""

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from shootflow import noise_native  # noqa: E402
from shootflow import xtrans_demosaic as xd  # noqa: E402

XTRANS = [1, 1, 0, 1, 1, 2, 1, 1, 2, 1, 1, 0, 2, 0, 1, 0, 2, 1, 1, 1, 2, 1, 1, 0, 1, 1, 0, 1, 1, 2, 0, 2, 1, 2, 0, 1]
BAYERS = ([0, 1, 1, 2], [2, 1, 1, 0], [1, 0, 2, 1], [1, 2, 0, 1])


def _bits(a):
    return np.ascontiguousarray(a).view(np.uint64)


def _median_np(a):
    return xd._block_stat(a, lambda t: np.median(t, axis=-1))


@unittest.skipUnless(noise_native.available(), "no C compiler")
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


if __name__ == "__main__":
    unittest.main()
