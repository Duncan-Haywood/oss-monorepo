"""``tools/hdrplus_noise_truth.py``: the reference-minus-merge truth recovers a known noise model.

A smooth synthetic scene stands in for the merge; the "reference" is the scene through a lens-shading gain and
an offset, plus shot/read noise of a known model per colour, quantised to 10-bit steps, with sparse
misalignment spikes on edges. The fitted truth must come back within a few percent, so a real burst's truth is
the frame's noise and not the fit's leftovers (eval/hdrplus-noise-truth-2026-11-22.md).
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
class TruthRecovery(unittest.TestCase):
    def _frames(self, seed=1):
        rng = np.random.default_rng(seed)
        h, w = 768, 1024
        y, x = np.mgrid[0:h, 0:w] / max(h, w)
        scene = 0.02 + 0.25 * (0.5 + 0.5 * np.sin(6 * x) * np.cos(4 * y)) + 0.1 * (x > 0.6)
        shade = 1.0 / (1.0 + 1.2 * ((x - 0.5) ** 2 + (y - 0.37) ** 2))  # the reference's vignetting
        pat = (2, 1, 1, 0)  # BGGR, as the HDR+ phones
        cm = np.array(pat).reshape(2, 2)[np.arange(h)[:, None] % 2, np.arange(w)[None, :] % 2]
        models = np.array([[2.0e-4, 1.0e-6], [1.0e-4, 5.0e-7], [1.5e-4, 1.2e-6]])
        clean = scene * shade
        var = models[cm, 0] * clean + models[cm, 1]
        ref = clean + rng.normal(size=(h, w)) * np.sqrt(var)
        ref = np.round(ref * 480) / 480  # about 1 DN steps on the white-balanced plane
        ref += (rng.random((h, w)) < 0.002) * 0.05  # sparse misalignment leftovers
        merged = scene / 0.6 + 0.001  # its own exposure scale and offset, no shading
        return ref, merged, pat, models

    def test_recovers_the_model(self):
        import hdrplus_noise_truth as t

        ref, merged, pat, models = self._frames()
        sites = t.residual_sites(ref, merged)
        got, bins = t.truth_model(sites, pat, m=0.0)
        for k in range(3):
            for lv in (0.05, 0.18):
                want = models[k, 0] * lv + models[k, 1]
                have = got[k, 0] * lv + got[k, 1]
                # sigma, as the eval reports it
                self.assertAlmostEqual(np.sqrt(have / want), 1.0, delta=0.04, msg=f"colour {k} at {lv}")
            # every bin but the darkest (noise near one quantisation step) within 7% in variance
            want = models[k, 0] * np.array(bins[k]["level"]) + models[k, 1]
            ratio = np.array(bins[k]["var"]) / want
            self.assertTrue(np.all(np.abs(ratio[1:] - 1) < 0.07), msg=f"colour {k}: {np.round(ratio, 3)}")

    def test_m_scales_variance(self):
        import hdrplus_noise_truth as t

        ref, merged, pat, _ = self._frames(2)
        sites = t.residual_sites(ref, merged)
        a, _ = t.truth_model(sites, pat, m=0.0)
        b, _ = t.truth_model(sites, pat, m=0.2)
        np.testing.assert_allclose(b, a / 0.8, rtol=1e-9)

    def test_clipped_var_ignores_outliers(self):
        import hdrplus_noise_truth as t

        rng = np.random.default_rng(3)
        r = rng.normal(size=200_000)
        r[:200] = 40.0
        self.assertAlmostEqual(t.clipped_var(r), 1.0, delta=0.02)


if __name__ == "__main__":
    unittest.main()
