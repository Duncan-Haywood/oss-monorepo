"""The patch-PCA noise estimator (``shootflow.noise_pca``; eval/noise-pca-estimator-2026-11-17.md).

Pinned: on white noise the eigenvalue reading is the variance; on a smooth field with shot and read noise the
fitted model reads the true sigma; on a field whose fine texture is the same in every colour, the estimate
stays near the truth where the block-spread estimator (``estimate_noise``) reads high; X-Trans works too, and
reads texture with touching same-colour sensels by default (eval/xtrans-noise-pca-12-2026-11-17.md).
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from test_raf import XE1_PATTERN, has_numpy

BAYER = (0, 1, 1, 2)


@unittest.skipUnless(has_numpy(), "numpy not installed")
class NoisePcaTests(unittest.TestCase):
    def setUp(self):
        import numpy as np

        self.np = np
        self.rng = np.random.default_rng(7)
        y, x = np.mgrid[0:480, 0:480] / 480.0
        self.smooth = 0.05 + 0.6 * x * y + 0.05 * np.sin(20 * x)
        # fine texture, the same on every sensel colour (as scene detail is, unlike noise)
        self.texture = self.smooth + 0.02 * np.sin(2.5 * x * 480) * np.sin(1.7 * y * 480)
        s2 = (0.18 / 25) ** 2
        self.model = (0.8 * s2 / 0.18, 0.2 * s2)

    def _noisy(self, clean):
        g, r = self.model
        return clean + self.rng.normal(size=clean.shape) * self.np.sqrt(g * clean + r)

    def _sigma(self, m):
        return float(self.np.sqrt(m[0] * 0.18 + m[1]))

    def test_eigenvalues_of_white_noise_read_its_variance(self):
        from shootflow.noise_pca import eig_sigma2

        p = self.rng.normal(size=(5000, 36)) * 0.01
        self.assertAlmostEqual(eig_sigma2(p) / 1e-4, 1.0, delta=0.1)

    def test_smooth_field_reads_the_true_sigma(self):
        from shootflow.noise_pca import estimate_noise_pca

        est = self._sigma(estimate_noise_pca(self._noisy(self.smooth), BAYER))
        self.assertAlmostEqual(est / self._sigma(self.model), 1.0, delta=0.15)

    def test_colour_correlated_texture_does_not_read_as_noise(self):
        from shootflow.noise_pca import estimate_noise_pca
        from shootflow.xtrans_demosaic import estimate_noise

        c = self._noisy(self.texture)
        true = self._sigma(self.model)
        pca = self._sigma(estimate_noise_pca(c, BAYER)) / true
        spread = self._sigma(estimate_noise(c, BAYER)) / true
        self.assertLess(pca, 1.25)
        self.assertGreater(pca, 0.7)
        self.assertGreater(spread, 1.5)

    def test_xtrans_mosaic(self):
        from shootflow.noise_pca import estimate_noise_pca

        est = self._sigma(estimate_noise_pca(self._noisy(self.smooth), XE1_PATTERN))
        self.assertAlmostEqual(est / self._sigma(self.model), 1.0, delta=0.2)

    def test_near_rows_pair_touching_sensels_of_one_colour(self):
        from shootflow.noise_pca import _near_matrix

        d = 6
        D = _near_matrix(XE1_PATTERN, d)
        self.assertGreater(D.shape[0], 20)
        for row in D:
            i, j = (int(k) for k in self.np.flatnonzero(row))
            (yi, xi), (yj, xj) = divmod(i, d), divmod(j, d)
            self.assertLessEqual(max(abs(yi - yj), abs(xi - xj)), 1)
            self.assertEqual(XE1_PATTERN[(yi % 6) * 6 + xi % 6], XE1_PATTERN[(yj % 6) * 6 + xj % 6])
            self.assertEqual(row.sum(), 0.0)

    def test_xtrans_lattice_shift_keeps_the_layout(self):
        from shootflow.noise_pca import XTRANS_SHIFTS, mosaic_patches

        a = self.np.asarray(XE1_PATTERN).reshape(6, 6)
        for dy, dx in XTRANS_SHIFTS:
            self.assertTrue((self.np.roll(a, (-dy, -dx), (0, 1)) == a).all())
        tiled = self.np.tile(a, (8, 8)).astype(float)
        p = mosaic_patches(tiled, 6, 6, shifts=XTRANS_SHIFTS)
        self.assertTrue((p == p[0]).all())  # every patch, both lattices, has the same colour layout

    def test_xtrans_default_is_the_near_test_and_texture_stays_bounded(self):
        from shootflow.noise_pca import estimate_noise_pca

        c = self._noisy(self.texture)
        self.assertEqual(estimate_noise_pca(c, XE1_PATTERN), estimate_noise_pca(c, XE1_PATTERN, texture="near"))
        est = self._sigma(estimate_noise_pca(c, XE1_PATTERN)) / self._sigma(self.model)
        self.assertLess(est, 1.25)
        self.assertGreater(est, 0.6)

    def test_tiny_frame_gives_a_model_not_an_error(self):
        from shootflow.noise_pca import estimate_noise_pca

        shot, read = estimate_noise_pca(self.rng.normal(size=(12, 12)) * 0.01 + 0.3, BAYER)
        self.assertGreaterEqual(shot, 0.0)
        self.assertGreaterEqual(read, 0.0)


if __name__ == "__main__":
    unittest.main()
