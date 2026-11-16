"""The noise-aware blend of the directional and bilinear demosaics (``xtrans_demosaic.frame_measures``,
``blend``, ``noise_aware``; eval/xtrans-noise-aware-blend-2026-11-16.md).

Pinned: the noise estimate tracks the noise drawn on a flat field, sensels keep their own values, a
flat noisy field leans to bilinear and a sharp clean edge to directional, the blend lies between its
two inputs, and the weights follow the documented ramp.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from test_raf import XE1_PATTERN, has_numpy


def _bilinear(c, pat):
    import numpy as np

    from shootflow import raw_develop_np as rnp

    h, w = c.shape
    out = np.empty((h, w, 3), dtype=np.float64)
    rnp._bilinear(c, w, h, pat, (1.0, 1.0, 1.0), 1e9, None, None, None, None, sink=out, threads=1)
    return out


def _mosaic(truth, pat):
    import numpy as np

    from shootflow.xtrans_demosaic import colour_map

    cm = colour_map(pat, *truth.shape[:2])
    return np.take_along_axis(truth, cm[..., None].astype(np.int64), axis=2)[..., 0]


@unittest.skipUnless(has_numpy(), "numpy not installed")
class NoiseAwareTests(unittest.TestCase):
    def setUp(self):
        import numpy as np

        self.np = np
        self.rng = np.random.default_rng(3)

    def _flat(self, sigma, n=144):
        truth = self.np.full((n, n, 3), (0.3, 0.4, 0.25))
        c = _mosaic(truth, XE1_PATTERN)
        return truth, c + self.rng.normal(size=c.shape) * sigma

    def test_noise_estimate_tracks_drawn_noise(self):
        from shootflow.xtrans_demosaic import directional, frame_measures

        for sigma in (0.004, 0.012):
            _, c = self._flat(sigma)
            m = frame_measures(c, XE1_PATTERN, _bilinear(c, XE1_PATTERN), directional(c, XE1_PATTERN))
            self.assertAlmostEqual(m["sigma"] / sigma, 1.0, delta=0.2)

    def test_flat_noisy_field_leans_bilinear_and_scores_better(self):
        from shootflow.xtrans_demosaic import directional, noise_aware

        truth, c = self._flat(0.01)
        b, d = _bilinear(c, XE1_PATTERN), directional(c, XE1_PATTERN)
        out = noise_aware(c, XE1_PATTERN, bilinear=b, directional_out=d)
        err = lambda a: float(self.np.mean((a[6:-6, 6:-6] - truth[6:-6, 6:-6]) ** 2))  # noqa: E731
        self.assertLess(err(out), err(d))
        self.assertLessEqual(err(out), err(b) * 1.05)

    def test_clean_edge_keeps_directional(self):
        from shootflow.xtrans_demosaic import directional, noise_aware

        np = self.np
        y, x = np.mgrid[0:96, 0:96]
        truth = np.where((x > 47)[..., None], (0.7, 0.35, 0.12), (0.2, 0.3, 0.45)).astype(np.float64)
        c = _mosaic(truth, XE1_PATTERN) + self.rng.normal(size=(96, 96)) * 1e-4
        b, d = _bilinear(c, XE1_PATTERN), directional(c, XE1_PATTERN)
        out = noise_aware(c, XE1_PATTERN, bilinear=b, directional_out=d, noise=(0.0, 1e-8))
        edge = (slice(24, 72), slice(36, 60))
        np.testing.assert_allclose(out[edge], d[edge], atol=1e-9)

    def test_sensels_keep_their_values_and_blend_lies_between(self):
        from shootflow.xtrans_demosaic import colour_map, directional, noise_aware

        np = self.np
        truth = self.rng.uniform(0.1, 0.8, size=(72, 72, 3))
        c = _mosaic(truth, XE1_PATTERN)
        b, d = _bilinear(c, XE1_PATTERN), directional(c, XE1_PATTERN)
        out = noise_aware(c, XE1_PATTERN, bilinear=b, directional_out=d, q_low=0.0, q_high=1e6)
        cm = colour_map(XE1_PATTERN, 72, 72)
        own = np.take_along_axis(out, cm[..., None].astype(np.int64), axis=2)[..., 0]
        np.testing.assert_allclose(own, c, atol=1e-9)
        self.assertTrue(np.all(out >= np.minimum(b, d) - 1e-12) and np.all(out <= np.maximum(b, d) + 1e-12))

    def test_bayer_uses_its_own_demosaic_and_ramp(self):
        from shootflow.bayer_demosaic import directional as bayer
        from shootflow.xtrans_demosaic import RAMPS, noise_aware

        np = self.np
        pat = (0, 1, 1, 2)
        truth = np.full((96, 96, 3), (0.3, 0.4, 0.25))
        c = _mosaic(truth, pat) + self.rng.normal(size=(96, 96)) * 0.01
        b, d = _bilinear(c, pat), bayer(c, pat)
        a = noise_aware(c, pat, noise=(0.0, 1e-4))
        e = noise_aware(c, pat, bilinear=b, directional_out=d, noise=(0.0, 1e-4), q_low=RAMPS[2][0], q_high=RAMPS[2][1])
        np.testing.assert_allclose(a, e, atol=1e-12)

    def test_blend_ramp(self):
        from shootflow.xtrans_demosaic import blend

        np = self.np
        b, d = np.zeros((48, 48, 3)), np.ones((48, 48, 3))
        for q, want in ((0.5, 0.0), (1.0, 0.0), (1.5, 0.5), (2.0, 1.0), (3.0, 1.0)):
            out = blend(b, d, np.full((2, 2), q), 1.0, 2.0)
            np.testing.assert_allclose(out, want, atol=1e-12)


class DevelopNoiseAwareTests(unittest.TestCase):
    """``--demosaic noise-aware`` in the developer: the DNG's NoiseProfile drives it; without one it falls back."""

    def _dng(self, noise_profile=None, seed=5, w=96, h=72, sigma=40.0):
        import random

        from test_raw_develop import make_dng

        rng = random.Random(seed)
        black, white = 256, 4095
        sensor = []
        for y in range(h):
            for x in range(w):
                c = (0, 1, 1, 2)[(y % 2) * 2 + x % 2]
                base = (0.35, 0.45, 0.3)[c] if x < w // 2 else (0.15, 0.5, 0.6)[c]
                v = black + base * (white - black) + rng.gauss(0.0, sigma)
                sensor.append(int(min(white, max(0, round(v)))))
        extra = [] if noise_profile is None else [(51041, 12, noise_profile)]
        return make_dng(sensor, w, h, extra_raw_tags=extra)

    def _develop(self, blob, **kw):
        from shootflow import raw_develop as rd

        return rd.develop(rd.parse_raw(blob), rd.DevelopSettings(**kw))

    def test_noise_profile_read(self):
        from shootflow import raw_develop as rd

        shot, read = rd.noise_profile({rd.TAG_NOISE_PROFILE: (2e-5, 1e-6, 4e-5, 3e-6)})
        self.assertAlmostEqual(shot, 3e-5, places=15)
        self.assertAlmostEqual(read, 2e-6, places=15)
        self.assertIsNone(rd.noise_profile({rd.TAG_NOISE_PROFILE: (2e-5,)}))
        self.assertIsNone(rd.noise_profile({rd.TAG_NOISE_PROFILE: (2e-5, 0.0)}))
        self.assertIsNone(rd.noise_profile({}))

    @unittest.skipUnless(has_numpy(), "numpy not installed")
    def test_noise_aware_with_profile_differs_and_without_falls_back(self):
        sigma = 40.0 / (4095 - 256)
        with_np = self._dng((0.0, sigma * sigma))
        w, h, px, rep = self._develop(with_np, engine="numpy", demosaic="noise-aware")
        self.assertEqual(rep.demosaic, "noise-aware")
        _, _, dpx, drep = self._develop(with_np, engine="numpy", demosaic="directional")
        self.assertEqual(len(px), len(dpx))
        self.assertNotEqual(list(px), list(dpx))  # a flat noisy field: blended toward bilinear
        _, _, fpx, frep = self._develop(self._dng(None), engine="numpy", demosaic="noise-aware")
        self.assertEqual(frep.demosaic, "directional")
        self.assertTrue(any("NoiseProfile" in n for n in frep.notes), frep.notes)
        _, _, dpx2, _ = self._develop(self._dng(None), engine="numpy", demosaic="directional")
        self.assertEqual(list(fpx), list(dpx2))
        _, _, hpx, hrep = self._develop(with_np, engine="numpy", demosaic="noise-aware", half=True)
        self.assertEqual(hrep.demosaic, "noise-aware")


if __name__ == "__main__":
    unittest.main()
