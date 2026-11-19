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

    def test_min_eigen_reads_white_noise_and_rejects_dense_texture(self):
        # eval/noise-pca-min-eigen-2026-11-19.md: the smallest eigenvalue over the Marchenko-Pastur edge reads
        # white noise's variance; texture spread over every direction but one quiet one does not raise it.
        from shootflow.noise_pca import _eig_sigma2_idx, _mp_floor

        np = self.np
        p = self.rng.normal(size=(5000, 36)) * 0.01
        idx = np.arange(5000)
        self.assertAlmostEqual(_eig_sigma2_idx(p, idx, "mp") / 1e-4, 1.0, delta=0.06)
        basis = np.linalg.qr(self.rng.normal(size=(36, 36)))[0][:, :30]  # texture in 30 of 36 directions
        t = p + (self.rng.normal(size=(5000, 30)) * 0.03) @ basis.T
        self.assertGreater(_eig_sigma2_idx(t, idx, "chen") / 1e-4, 3.0)
        self.assertAlmostEqual(_eig_sigma2_idx(t, idx, "mp") / 1e-4, 1.0, delta=0.15)
        self.assertAlmostEqual(_mp_floor(3600, 36), 0.81, places=6)

    def test_mpc_reads_the_colours_mean_variance(self):
        from shootflow.noise_pca import _eig_sigma2_idx

        np = self.np
        sd = np.where(np.arange(36) < 9, 0.02, 0.01)  # one colour (9 columns) twice the others' sigma
        p = self.rng.normal(size=(8000, 36)) * sd
        want = float(np.mean(sd**2))
        cols = [np.arange(9), np.arange(9, 36)]
        idx = np.arange(8000)
        self.assertAlmostEqual(_eig_sigma2_idx(p, idx, "mpc", cols) / want, 1.0, delta=0.08)
        self.assertLess(_eig_sigma2_idx(p, idx, "mp") / want, 0.6)  # the quietest colour only
        with self.assertRaises(ValueError):
            from shootflow.noise_pca import estimate_noise_pca

            estimate_noise_pca(p[:100, :1].reshape(10, 10), BAYER, eig="nope")

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

    def test_info_counts_the_patches_the_texture_test_keeps(self):
        from shootflow.noise_pca import estimate_noise_pca

        info: dict = {}
        m = estimate_noise_pca(self._noisy(self.smooth), BAYER, info=info)
        self.assertEqual(len(m), 2)
        self.assertGreater(info["patches"], 0)
        self.assertLessEqual(info["kept"], info["patches"])
        self.assertGreater(info["kept"] / info["patches"], 0.5)  # a smooth noisy field keeps most patches

    def test_binned_mosaic_keeps_the_layout_and_halves_white_noise(self):
        from shootflow.noise_pca import bin_mosaic

        np = self.np
        c = np.zeros((48, 48))
        c[0::2, 0::2], c[1::2, 1::2] = 1.0, 3.0  # R at (0, 0), B at (1, 1): layout must survive binning
        b = bin_mosaic(c, 2)
        self.assertEqual(b.shape, (24, 24))
        self.assertTrue((b[0::2, 0::2] == 1.0).all() and (b[1::2, 1::2] == 3.0).all())
        n = self.rng.normal(size=(480, 480))
        self.assertAlmostEqual(float(bin_mosaic(n, 2).std()), 0.5, delta=0.02)
        self.assertEqual(bin_mosaic(np.zeros((36, 36)), 6).shape, (18, 18))

    def test_whiteness_is_one_half_on_white_noise(self):
        from shootflow.noise_pca import whiteness

        # 960 x 960: on a 480 x 480 tile the binned plane (240 x 240) is too small and reads 0.39
        # (eval/noise-scale-per-frame-2026-11-17.md)
        n = self.rng.normal(size=(960, 960)) * 0.01 + 0.3
        self.assertAlmostEqual(whiteness(n, BAYER), 0.5, delta=0.05)
        self.assertIsNone(whiteness(self.np.full((96, 96), 0.3), BAYER))  # no noise read: no ratio


if __name__ == "__main__":
    unittest.main()
