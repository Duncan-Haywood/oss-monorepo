"""``tools/hdrplus_demosaic_sweep.py``: the binned scene and its noise (eval/hdrplus-demosaic-sweep-2026-11-22.md).

A synthetic reference (a smooth scene through vignetting, plus a known per-colour noise model) and a "merge"
(the scene with a fraction ``m`` of the same noise, as an average that includes the reference keeps). The binned
mosaic's noise must be the reference's whole noise at the truth's level, and the truth the binned scene.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None


@unittest.skipIf(np is None, "numpy not installed")
class BinnedScene(unittest.TestCase):
    def setUp(self):
        rng = np.random.default_rng(3)
        h, w = 1024, 1280
        y, x = np.mgrid[0:h, 0:w] / max(h, w)
        self.scene = 0.05 + 0.3 * (0.5 + 0.5 * np.sin(5 * x) * np.cos(3 * y))
        shade = 1.0 / (1.0 + 1.0 * ((x - 0.5) ** 2 + (y - 0.4) ** 2))
        self.pat = (2, 1, 1, 0)
        cm = np.array(self.pat).reshape(2, 2)[np.arange(h)[:, None] % 2, np.arange(w)[None, :] % 2]
        self.models = np.array([[2.0e-4, 1.0e-6], [1.0e-4, 5.0e-7], [1.5e-4, 1.2e-6]])
        clean = self.scene * shade
        sd = np.sqrt(self.models[cm, 0] * clean + self.models[cm, 1])
        n_ref = rng.normal(size=(h, w)) * sd
        self.m = 0.2
        # the merge: the scene (no shading, its own scale) holding a fraction m of the reference's noise variance
        n_other = rng.normal(size=(h, w)) * sd
        merge_noise = self.m * n_ref + np.sqrt(self.m * (1 - self.m)) * n_other
        self.ref = clean + n_ref
        self.merged = (clean + merge_noise) / shade / 0.7

    def test_noise_is_the_references_at_the_truths_level(self):
        import hdrplus_demosaic_sweep as s
        import hdrplus_noise_truth as hn

        planes, _ = hn.truth_model(hn.residual_sites(self.ref, self.merged), self.pat, self.m, keep=1.0)
        for k in range(3):  # the truth model is the reference's noise
            self.assertAlmostEqual(np.sqrt((planes[k, 0] * 0.18 + planes[k, 1]) /
                                           (self.models[k, 0] * 0.18 + self.models[k, 1])), 1.0, delta=0.05)
        fit, res, ok = s.full_fit(self.ref, self.merged)
        self.assertTrue(ok.all())
        truth, noisy, bad, z = s.binned_scene(fit, res, ok, self.pat, planes, self.m)
        self.assertEqual(truth.shape[:2], noisy.shape)
        self.assertFalse(bad.any())
        # z is the noise over the truth model's sigma at the truth's level: unit variance, few past 6
        self.assertAlmostEqual(float(z.std()), 1.0, delta=0.05)
        self.assertLess(float((np.abs(z) > 6).mean()), 1e-4)
        # the noise is the reference's whole noise (not 1 - m of it) against the model it was drawn from
        from shootflow.xtrans_demosaic import colour_map

        small = colour_map(self.pat, *noisy.shape)
        clean = np.take_along_axis(truth, small[..., None].astype(np.int64), axis=2)[..., 0]
        want = self.models[small, 0] * clean + self.models[small, 1]
        self.assertAlmostEqual(float(np.sqrt(np.mean((noisy - clean) ** 2 / want))), 1.0, delta=0.06)

    def test_grow_and_masked_scores(self):
        import hdrplus_demosaic_sweep as s

        m = np.zeros((20, 20), dtype=bool)
        m[10, 10] = True
        self.assertEqual(int(s._grow(m, 2).sum()), 25)
        t = np.zeros((60, 60, 3))
        r = t.copy()
        r[30, 30] = 1.0  # a single bad site, masked out: the score is the clean one
        keep = np.ones((60, 60), dtype=bool)
        keep[30, 30] = False
        self.assertEqual(s.masked_scores(r, t, keep)[0], 200.0)
        self.assertLess(s.masked_scores(r, t, np.ones((60, 60), dtype=bool))[0], 50)


if __name__ == "__main__":
    unittest.main()
