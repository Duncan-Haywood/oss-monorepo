"""The noise-aware develop's full-frame steps run in bands (eval/noise-aware-full-frame-cost-2026-11-17.md).

Pinned: the leave-one-out residual, the per-block detail, the blend weights and the blend itself give the
same bits whatever the band height and thread count; the weights are the documented interpolation of the
block values (the dense ``_interp_matrix`` product, to rounding); a blend written over its bilinear input
equals one written to a new array; and the develop path's in-place blend and clip equal the plain
``noise_aware`` result clipped.
"""

from __future__ import annotations

import sys
import os
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from test_raf import XE1_PATTERN, has_numpy

BAYER = (0, 1, 1, 2)
SIZES = ((13, 9), (50, 31), (241, 77), (500, 49))


def _old_residual(c, pat):
    """The whole-frame residual as written before 2026-11-17's bands."""

    import numpy as np

    from shootflow.xtrans_demosaic import _box3, colour_map

    h, w = c.shape
    cmap = colour_map(pat, h, w)
    pred = np.zeros_like(c)
    for k in range(3):
        m = (cmap == k).astype(np.float64)
        s = _box3(_box3(c * m)) - 9.0 * c * m
        n = _box3(_box3(m)) - 9.0 * m
        pred += np.where(m > 0, s / np.maximum(n, 1e-9), 0.0)
    return np.abs(c - pred) * 1.4826 * 0.85


@unittest.skipUnless(has_numpy(), "numpy not installed")
class BandsTest(unittest.TestCase):
    def setUp(self):
        import numpy as np

        self.rng = np.random.default_rng(7)

    def test_residual_is_the_whole_frame_residual_bit_for_bit(self):
        import numpy as np

        from shootflow.xtrans_demosaic import _residual

        for pat in (BAYER, (1, 0, 2, 1), XE1_PATTERN):
            for h, w in SIZES:
                c = self.rng.random((h, w))
                ref = _old_residual(c, pat)
                for band, threads in ((240, None), (7, 3), (1, 1), (100, 4)):
                    with self.subTest(pat=len(pat), h=h, w=w, band=band):
                        self.assertTrue(np.array_equal(_residual(c, pat, band=band, threads=threads), ref))

    def test_weights_band_by_band_equal_the_frame_and_the_dense_product(self):
        import numpy as np

        from shootflow.xtrans_demosaic import _interp_matrix, _weights

        for h, w in ((7, 30), (24, 24), (50, 24), (700, 530)):
            q = self.rng.random((max(1, h // 24), max(1, w // 24))) * 3.0
            full = _weights(q, 0.4, 2.0, h, w)
            ab = np.clip((q - 0.4) / 1.6, 0.0, 1.0)
            dense = _interp_matrix(h, ab.shape[0]) @ ab @ _interp_matrix(w, ab.shape[1]).T
            np.testing.assert_allclose(full, dense, rtol=0, atol=1e-15)
            for band in (1, 37, 240):
                parts = [_weights(q, 0.4, 2.0, h, w, slice(y0, y0 + band)) for y0 in range(0, h, band)]
                self.assertTrue(np.array_equal(np.concatenate(parts), full))

    def test_block_detail_matches_the_whole_frame_block_stat(self):
        import numpy as np

        from shootflow.xtrans_demosaic import BLOCK, _block_detail, _block_stat

        for h, w in ((10, 10), (24, 50), (251, 97), (600, 75)):
            b = self.rng.random((h, w, 3))
            d = (b + self.rng.normal(0, 0.05, b.shape)).astype(np.float32)
            diff = d.astype(np.float64) - b
            ref = _block_stat(diff, lambda t: np.sqrt(np.mean(t**2, axis=-1)))
            for threads in (1, 3):
                det, detail = _block_detail(b, d, threads=threads)
                self.assertTrue(np.array_equal(det, ref), (h, w))
                self.assertAlmostEqual(detail, float(np.sqrt(np.mean(diff**2))), places=12)
            self.assertEqual(det.shape, (max(1, h // BLOCK), max(1, w // BLOCK)) if h >= BLOCK and w >= BLOCK else (1, 1))

    def test_blend_in_place_and_threads_change_no_bit(self):
        import numpy as np

        from shootflow.xtrans_demosaic import blend

        h, w = 530, 290
        b = self.rng.random((h, w, 3))
        d = (b + self.rng.normal(0, 0.05, b.shape)).astype(np.float32)
        q = self.rng.random((h // 24, w // 24)) * 3.0
        for luma in (None, (0.8, 1.5)):
            ref = blend(b, d, q, 0.4, 1.2, luma_ramp=luma, threads=1)
            self.assertTrue(np.array_equal(blend(b, d, q, 0.4, 1.2, luma_ramp=luma, threads=4), ref))
            b2 = b.copy()
            got = blend(b2, d, q, 0.4, 1.2, luma_ramp=luma, out=b2, threads=3)
            self.assertIs(got, b2)
            self.assertTrue(np.array_equal(got, ref))

    def test_develop_path_equals_noise_aware_clipped(self):
        import numpy as np

        from shootflow import raw_develop_np as rnp
        from shootflow.bayer_demosaic import directional as bayer
        from shootflow.xtrans_demosaic import directional, noise_aware

        # The develop path holds the bilinear image (and so the blend) in float32 since 2026-11-17
        # (eval/noise-aware-float32-2026-11-17.md): it equals the float64 blend to float32 rounding (each value
        # within a few float32 steps of values up to 0.9; 16-bit output needs 1.5e-5), and its own bytes do not
        # depend on the thread count.
        for pat in (BAYER, XE1_PATTERN):
            for noise in ((2e-4, 1e-5), (2e-2, 1e-3)):  # a light blend and a heavy one
                c = np.clip(0.4 + 0.3 * self.rng.random((300, 264)) - 0.1, 0.0, None)
                hi = 0.9
                got = rnp._noise_aware_plane(c, pat, hi, noise)
                self.assertEqual(got.dtype, np.float32)
                d = bayer(c, pat, laplace=0.1875) if len(pat) == 4 else directional(c, pat, scale=hi)
                b = np.empty((300, 264, 3))
                rnp._bilinear(c, 264, 300, pat, (1.0, 1.0, 1.0), 1e9, None, None, None, None, sink=b, threads=1)
                ref = rnp._clip(noise_aware(c, pat, bilinear=b, directional_out=d, noise=noise), hi)
                self.assertLessEqual(float(np.abs(got - ref).max()), 4 * 2.0**-24, (len(pat), noise))
                old = os.environ.get("SHOOTFLOW_THREADS")
                try:
                    os.environ["SHOOTFLOW_THREADS"] = "1"
                    one = rnp._noise_aware_plane(c, pat, hi, noise)
                finally:
                    if old is None:
                        os.environ.pop("SHOOTFLOW_THREADS", None)
                    else:
                        os.environ["SHOOTFLOW_THREADS"] = old
                self.assertTrue(np.array_equal(one, got), (len(pat), noise))


if __name__ == "__main__":
    unittest.main()
