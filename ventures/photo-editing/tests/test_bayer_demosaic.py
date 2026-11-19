"""The directional Bayer demosaic (``shootflow.bayer_demosaic``) and its place in the developer.

Measured against known truth and seven LibRaw methods on five real frames in
``eval/bayer-directional-demosaic-2026-11-15.md``; these tests pin the properties that measurement
relies on: each sensel keeps its own value, flat fields stay flat, every Bayer phase works, the band
height never changes the output, an edge and a grating come out with less error than the bilinear
demosaic gives, and the developer picks it (or falls back) as documented.
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from shootflow import raf
from shootflow import raw_develop as rd
from test_arw import make_profile
from test_raf import has_numpy, make_raf

PHASES = ((0, 1, 1, 2), (2, 1, 1, 0), (1, 0, 2, 1), (1, 2, 0, 1))  # RGGB, BGGR, GRBG, GBRG


def _truth(h=48, w=60):
    import numpy as np

    y, x = np.mgrid[0:h, 0:w].astype(np.float64)
    left = x * np.cos(0.12) - y * np.sin(0.12) < w / 2
    truth = np.empty((h, w, 3))
    truth[left] = (0.7, 0.35, 0.12)
    truth[~left] = (0.2, 0.3, 0.45)
    low = y >= h / 2
    grating = 0.3 + 0.25 * (np.floor(x / 2) % 2)
    for k in range(3):
        truth[..., k] = np.where(low, grating, truth[..., k])
    return truth


def _mosaic(truth, pat):
    import numpy as np

    from shootflow.xtrans_demosaic import colour_map

    h, w, _ = truth.shape
    cm = colour_map(pat, h, w)
    return np.take_along_axis(truth, cm[..., None].astype(np.int64), axis=2)[..., 0], cm


def _bilinear(c, pat):
    import numpy as np

    from shootflow import raw_develop_np as rnp

    h, w = c.shape
    out = np.empty((h, w, 3))
    rnp._bilinear(c, w, h, pat, (1.0, 1.0, 1.0), 1e9, None, None, None, None, sink=out, threads=1)
    return out


@unittest.skipUnless(has_numpy(), "numpy not installed")
class DirectionalTests(unittest.TestCase):
    def test_keeps_each_sensels_own_value(self):
        import numpy as np

        from shootflow.bayer_demosaic import directional

        rng = np.random.default_rng(1)
        for pat in PHASES:
            c = rng.random((21, 30)).astype(np.float32)
            out = directional(c, pat)
            _, cm = _mosaic(np.zeros((21, 30, 3)), pat)
            own = np.take_along_axis(out, cm[..., None].astype(np.int64), axis=2)[..., 0]
            self.assertTrue(np.array_equal(own, c), pat)

    def test_flat_field_stays_flat(self):
        import numpy as np

        from shootflow.bayer_demosaic import directional

        truth = np.ones((20, 26, 3)) * np.array([0.6, 0.4, 0.25])
        for pat in PHASES:
            c, _ = _mosaic(truth, pat)
            out = directional(c, pat, median_passes=1)
            self.assertLess(float(np.max(np.abs(out - truth))), 1e-6, pat)

    def test_every_phase_beats_bilinear_on_edge_and_grating(self):
        import numpy as np

        from shootflow.bayer_demosaic import directional

        truth = _truth()
        inner = (slice(4, -4), slice(4, -4))
        for pat in PHASES:
            c, _ = _mosaic(truth, pat)
            ours = float(np.mean((directional(c, pat)[inner] - truth[inner]) ** 2))
            bil = float(np.mean((_bilinear(c, pat)[inner] - truth[inner]) ** 2))
            self.assertLess(ours, bil / 4, pat)  # over 6 dB better on this picture

    def test_laplace_weight(self):
        """3/16 (the default since eval/bayer-laplace-weight-2026-11-15.md) against Hamilton and Adams' 1/4:
        on the tuning sheet (zone plate, discs, slanted colour edge) luma is over 3 dB nearer the truth on
        every phase; any weight keeps flat fields flat and each sensel's own value."""

        import numpy as np

        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
        from xtrans_demosaic_check import synthetic_sheet

        from shootflow.bayer_demosaic import directional

        truth = synthetic_sheet(192)
        lum = lambda a: 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]  # noqa: E731
        inner = (slice(12, -12), slice(12, -12))
        for pat in PHASES:
            c, _ = _mosaic(truth, pat)
            err = {lap: float(np.mean((lum(directional(c, pat, laplace=lap))[inner] - lum(truth)[inner]) ** 2))
                   for lap in (0.25, 0.1875)}
            self.assertLess(err[0.1875], err[0.25] / 2, pat)
            self.assertTrue(np.array_equal(directional(c, pat), directional(c, pat, laplace=0.1875)))
        flat = np.ones((20, 26, 3)) * np.array([0.6, 0.4, 0.25])
        for lap in (0.0, 0.125, 0.3):
            c, _ = _mosaic(flat, (0, 1, 1, 2))
            self.assertLess(float(np.max(np.abs(directional(c, (0, 1, 1, 2), laplace=lap) - flat))), 1e-6, lap)

    def test_adaptive_laplace(self):
        """laplace="adaptive" (eval/bayer-adaptive-laplace-2026-11-16.md): the per-sensel weight stays in
        [1/8, 1/4]; on the tuning sheet luma is nearer the truth than the fixed 3/16 on every phase; flat
        fields stay flat; each sensel keeps its own value; the C path refuses it and an unknown name is
        refused."""

        import numpy as np

        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
        from xtrans_demosaic_check import synthetic_sheet

        from shootflow import bayer_demosaic as bd

        truth = synthetic_sheet(192)
        lum = lambda a: 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]  # noqa: E731
        inner = (slice(12, -12), slice(12, -12))
        for pat in PHASES:
            c, cm = _mosaic(truth, pat)
            err = {lap: float(np.mean((lum(bd.directional(c, pat, laplace=lap))[inner] - lum(truth)[inner]) ** 2))
                   for lap in ("adaptive", 0.1875)}
            self.assertLess(err["adaptive"], err[0.1875], pat)
            out = bd.directional(c, pat, laplace="adaptive")
            own = np.take_along_axis(out, cm[..., None].astype(np.int64), axis=2)[..., 0]
            self.assertTrue(np.allclose(own, c, atol=1e-6), pat)
        c, cm = _mosaic(truth, (0, 1, 1, 2))
        c = c.astype(np.float32)
        sh = bd._sh
        sign = np.where(cm == 1, np.float32(1), np.float32(-1))
        w = bd._laplace_map(c, sign, (sh(c, 0, -1) + sh(c, 0, 1)) / 2, 2 * c - sh(c, 0, -2) - sh(c, 0, 2),
                            (sh(c, -1, 0) + sh(c, 1, 0)) / 2, 2 * c - sh(c, -2, 0) - sh(c, 2, 0),
                            bd.ADAPTIVE_LAPLACE, np.float32(1e-6))
        self.assertGreaterEqual(float(w.min()), 0.125)
        self.assertLessEqual(float(w.max()), 0.25)
        self.assertGreater(float(np.std(w)), 0.01)  # it does vary
        flat = np.ones((20, 26, 3)) * np.array([0.6, 0.4, 0.25])
        c, _ = _mosaic(flat, (0, 1, 1, 2))
        self.assertLess(float(np.max(np.abs(bd.directional(c, (0, 1, 1, 2), laplace="adaptive") - flat))), 1e-6)
        with self.assertRaises(ValueError):
            bd.directional(c, (0, 1, 1, 2), laplace="auto")
        with self.assertRaises(RuntimeError):
            bd.directional(c, (0, 1, 1, 2), laplace="adaptive", native=True)

    def test_learned_laplace(self):
        """laplace="learned" (eval/bayer-learned-laplace-2026-11-16.md): 45 fitted weights (intercept, 8
        features, 36 products); features are scale-free and in range; the weight stays in [1/8, 1/4];
        each sensel keeps its value; flat fields stay flat; the C path (2026-11-16) gives numpy's output when
        it builds and is refused when it cannot; a weight list of the wrong length is refused."""

        import numpy as np

        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
        from xtrans_demosaic_check import synthetic_sheet

        from shootflow import bayer_demosaic as bd

        self.assertEqual(len(bd.LEARNED_LAPLACE), 45)
        truth = synthetic_sheet(160)
        for pat in PHASES:
            c, cm = _mosaic(truth, pat)
            f = bd.laplace_features(c, pat)
            self.assertEqual(f.shape, (8,) + c.shape)
            self.assertTrue(np.all(np.isfinite(f)))
            self.assertGreaterEqual(float(f.min()), 0.0)
            self.assertLessEqual(float(f.max()), 1.0)
            # scale-free: exposure (a gain on the whole plane) moves no feature
            f2 = bd.laplace_features(c * 7.5, pat)
            self.assertLess(float(np.max(np.abs(f2 - f))), 1e-3, pat)
            w = bd._laplace_learned(list(f), bd.LEARNED_LAPLACE)
            self.assertGreaterEqual(float(w.min()), 0.125)
            self.assertLessEqual(float(w.max()), 0.25)
            out = bd.directional(c, pat, laplace="learned")
            own = np.take_along_axis(out, cm[..., None].astype(np.int64), axis=2)[..., 0]
            self.assertTrue(np.allclose(own, c, atol=1e-6), pat)
        flat = np.ones((20, 26, 3)) * np.array([0.6, 0.4, 0.25])
        c, _ = _mosaic(flat, (0, 1, 1, 2))
        self.assertLess(float(np.max(np.abs(bd.directional(c, (0, 1, 1, 2), laplace="learned") - flat))), 1e-6)
        # a constant model equal to a fixed weight gives that fixed weight's output
        const = (0.25,) + (0.0,) * 8
        self.assertTrue(np.allclose(bd.directional(c, (0, 1, 1, 2), laplace=const, native=False),
                                    bd.directional(c, (0, 1, 1, 2), laplace=0.25, native=False), atol=1e-6))
        c, _ = _mosaic(truth, (0, 1, 1, 2))
        self.assertTrue(np.allclose(bd.directional(c, (0, 1, 1, 2), laplace=const),
                                    bd.directional(c, (0, 1, 1, 2), laplace=0.25, native=False), atol=1e-5))
        from shootflow import bayer_native

        if bayer_native.available():
            self.assertTrue(np.array_equal(bd.directional(c, (0, 1, 1, 2), laplace="learned", native=True),
                                           bd.directional(c, (0, 1, 1, 2), laplace="learned", native=False)))
        else:
            with self.assertRaises(RuntimeError):
                bd.directional(c, (0, 1, 1, 2), laplace="learned", native=True)
        with self.assertRaises(ValueError):
            bd.directional(c, (0, 1, 1, 2), laplace=(0.2, 0.1))

    def test_bands_equal_one_piece(self):
        import numpy as np

        from shootflow.bayer_demosaic import directional

        rng = np.random.default_rng(4)
        c = rng.random((75, 41)).astype(np.float32) * 3.0
        for kw in ({}, {"median_passes": 1}, {"rb": "simple"}, {"laplace": "adaptive"}, {"laplace": "learned"}):
            whole = directional(c, (0, 1, 1, 2), band=1000, **kw)
            for band in (16, 17, 40):
                for threads in (1, 3):
                    got = directional(c, (0, 1, 1, 2), band=band, threads=threads, **kw)
                    self.assertTrue(np.array_equal(got, whole), (kw, band, threads))

    def test_tiny_and_odd_frames(self):
        import numpy as np

        from shootflow.bayer_demosaic import directional

        for h, w in ((2, 2), (3, 5), (7, 4)):
            out = directional(np.full((h, w), 0.5, dtype=np.float32), (0, 1, 1, 2))
            self.assertEqual(out.shape, (h, w, 3))
            self.assertTrue(np.allclose(out, 0.5))

    def test_refusals(self):
        import numpy as np

        from shootflow.bayer_demosaic import directional

        c = np.zeros((8, 8), dtype=np.float32)
        for bad in ((0, 0, 1, 2), (1, 1, 0, 2), (0, 1, 2)):
            with self.assertRaises(ValueError):
                directional(c, bad)
        with self.assertRaises(ValueError):
            directional(c, (0, 1, 1, 2), rb="ahd")

    def test_correlation_features(self):
        """The inter-channel detail correlation features (eval/bayer-channel-correlation-2026-11-16.md): in
        [0, 1], scale-free, high on a grey zone plate and low where the channels' detail is unrelated; a model
        with them runs in numpy (the C path reads the eight only), keeps each sensel's value and flat fields
        flat, and its weight count picks the feature count."""

        import numpy as np

        from shootflow import bayer_demosaic as bd

        y, x = np.mgrid[0:96, 0:96].astype(np.float64)
        zone = 0.5 + 0.3 * np.cos(np.pi * 0.0025 * (x * x + y * y))
        grey = np.repeat(zone[..., None], 3, axis=2)
        rng = np.random.default_rng(5)
        # three channels' detail unrelated: each its own smooth random field
        k = np.outer(np.hanning(7), np.hanning(7))
        k /= k.sum()
        def smooth(a):
            f = np.fft.rfft2(a) * np.fft.rfft2(k, a.shape)
            return np.fft.irfft2(f, a.shape)
        mixed = np.stack([0.5 + 2.0 * (smooth(rng.random((96, 96))) - 0.5) for _ in range(3)], axis=2)
        pat = (0, 1, 1, 2)
        sel = (slice(10, -10, 2), slice(10, -10, 2))  # red sensels inside the border
        means = {}
        for name, img in (("grey", grey), ("mixed", mixed)):
            c, _ = _mosaic(img, pat)
            f = bd.laplace_features(c, pat, extra=bd.CORRELATION_FEATURES)
            self.assertEqual(f.shape, (12,) + c.shape)
            self.assertTrue(np.all(np.isfinite(f)))
            self.assertGreaterEqual(float(f.min()), 0.0)
            self.assertLessEqual(float(f.max()), 1.0)
            f2 = bd.laplace_features(c * 7.5, pat, extra=bd.CORRELATION_FEATURES)
            self.assertLess(float(np.max(np.abs(f2[8:] - f[8:]))), 1e-3)
            means[name] = float(f[9][sel].mean())  # corr3sq
        self.assertGreater(means["grey"], 0.5)
        self.assertLess(means["mixed"], 0.25)
        self.assertGreater(means["grey"], 2 * means["mixed"])
        with self.assertRaises(ValueError):
            bd.laplace_features(c, pat, extra=("corr7",))

        self.assertEqual(bd._n_features(45), (8, True))
        self.assertEqual(bd._n_features(66), (10, True))
        self.assertEqual(bd._n_features(11), (10, False))
        with self.assertRaises(ValueError):
            bd._n_features(46)
        model = (0.1875,) + (0.0,) * 9 + (0.05,) + (0.0,) * 55  # 66 weights: a nudge on corr5sq only
        extra = ("corr3sq", "corr5sq")
        c, cm = _mosaic(grey, pat)
        out = bd.directional(c, pat, laplace=model, laplace_extra=extra)
        own = np.take_along_axis(out, cm[..., None].astype(np.int64), axis=2)[..., 0]
        self.assertTrue(np.allclose(own, c, atol=1e-6))
        self.assertFalse(np.array_equal(out, bd.directional(c, pat, native=False)))
        with self.assertRaises(RuntimeError):
            bd.directional(c, pat, laplace=model, laplace_extra=extra, native=True)
        with self.assertRaises(ValueError):  # 66 weights need two correlation features
            bd.directional(c, pat, laplace=model, laplace_extra=("corr3",))
        flat = np.ones((20, 26, 3)) * np.array([0.6, 0.4, 0.25])
        c, _ = _mosaic(flat, pat)
        self.assertLess(float(np.max(np.abs(bd.directional(c, pat, laplace=model, laplace_extra=extra) - flat))), 1e-6)

    def test_training_inputs_noise_and_near_nyquist(self):
        """The trainer's augmentation (eval/bayer-learned-noisy-nyquist-2026-11-16.md): the near-Nyquist
        frames are seeded, in range, not the test sheet, and carry detail near Nyquist; a noisy copy keeps the
        clean truth as its target and moves the greens; the fit honours a frame's weight."""

        import numpy as np

        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
        import bayer_laplace_train as t
        from xtrans_demosaic_check import synthetic_sheet

        a, b = t.near_nyquist_texture(3, n=128), t.near_nyquist_texture(3, n=128)
        self.assertTrue(np.array_equal(a, b))
        self.assertFalse(np.array_equal(a, t.near_nyquist_texture(4, n=128)))
        self.assertGreaterEqual(float(a.min()), 0.05)
        self.assertLessEqual(float(a.max()), 0.85)
        self.assertNotEqual(a.shape, synthetic_sheet(64).shape)
        # energy above 0.3 cycles per pixel (tile-to-tile level steps hold most of the rest; a 512 x 512 crop of the
        # binned Nikon D90 frame has 0.2% there)
        g = a[..., 1] - a[..., 1].mean()
        spec = np.abs(np.fft.fft2(g)) ** 2
        fy, fx = np.meshgrid(np.fft.fftfreq(128), np.fft.fftfreq(128), indexing="ij")
        self.assertGreater(spec[np.hypot(fy, fx) > 0.3].sum() / spec.sum(), 0.02)

        clean = t.truth_samples(a, (0, 1, 1, 2), 500, seed=1)
        noisy = t.truth_samples(a, (0, 1, 1, 2), 500, seed=1, snr=25)
        self.assertTrue(np.array_equal(clean["gt"], noisy["gt"]))
        self.assertFalse(np.allclose(clean["g8"], noisy["g8"]))
        self.assertEqual(noisy["X"].shape, (500, 8 + 4))  # the eight, then every correlation feature
        self.assertEqual(t.select_features(noisy)["X"].shape, (500, 8))
        picked = t.select_features(noisy, ("corr5sq", "corr3"))["X"]
        self.assertTrue(np.array_equal(picked[:, 8], noisy["X"][:, 11]))
        self.assertTrue(np.array_equal(picked[:, 9], noisy["X"][:, 8]))

        frames = [dict(t.synthetic_samples(i, 2000), weight=1.0) for i in range(2)]
        base = t.fit(frames, pairs=False, ridge=1e-3)
        frames[1]["weight"] = 0.0
        only0 = t.fit(frames, pairs=False, ridge=1e-3)
        self.assertTrue(np.allclose(only0, t.fit(frames[:1], pairs=False, ridge=1e-3)))
        self.assertFalse(np.allclose(base, only0))

        # grouped cross-validation: a held-out real frame takes every copy with it; synthetic frames always train
        tags = [("a", False), ("a", False), ("a", False), ("b", False), ("b", False), ("s", True), ("s", True)]
        folds = list(t.cv_folds([{"group": g, "synthetic": syn} for g, syn in tags]))
        self.assertEqual(folds, [([0, 1, 2], [3, 4, 5, 6]), ([3, 4], [0, 1, 2, 5, 6])])

    @unittest.skipUnless(has_numpy(), "numpy not installed")
    def test_oracle_ceiling_tiles(self):
        """tools/bayer_oracle_ceiling.py (eval/bayer-oracle-ceiling-2026-11-16.md): the box sum matches a
        brute-force sum; each tile's weight is the best constant on a fine grid; the 1 x 1 tile oracle is the
        trainer's per-sensel oracle on the same sample; nested tiles (1, 2, 4, ... 32) never gain more as
        they grow; the trainer's sample is drawn the same way."""

        import numpy as np

        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
        import bayer_laplace_train as t
        import bayer_oracle_ceiling as oc

        rng = np.random.default_rng(3)
        a = rng.random((9, 11))
        for b in (1, 2, 4, 5):
            lo = b // 2
            ref = np.array([[a[max(0, y - lo) : max(0, y - lo + b), max(0, x - lo) : max(0, x - lo + b)].sum()
                             for x in range(11)] for y in range(9)])
            self.assertTrue(np.allclose(oc.box_sum(a, b), ref), b)

        D = rng.normal(size=(8, 8))
        ws = rng.uniform(0.0, 0.4, size=(8, 8))
        wt = oc.tile_weights(D * D * ws, D * D, 4)
        grid = np.linspace(0.125, 0.25, 1251)
        for ty in (0, 4):
            for tx in (0, 4):
                d, w = D[ty : ty + 4, tx : tx + 4], ws[ty : ty + 4, tx : tx + 4]
                best = grid[np.argmin([np.sum(d * d * (g - w) ** 2) for g in grid])]
                self.assertAlmostEqual(float(wt[ty, tx]), float(best), delta=1e-4)
                self.assertTrue(np.all(wt[ty : ty + 4, tx : tx + 4] == wt[ty, tx]))

        truth = t.near_nyquist_texture(seed=1, n=128, tile=32)
        scores, s = oc.copy_rows(truth, (0, 1, 1, 2), seed=0, snr=None, per_frame=2000)
        gains = [scores[f"tile{b}"] for b in oc.TILES]
        self.assertTrue(all(x <= y * (1 + 1e-9) for x, y in zip(gains, gains[1:])), gains)
        self.assertLess(scores["tile1"], min(scores["1/8"], scores["1/4"], scores["B"]))
        ref = t.truth_samples(truth, (0, 1, 1, 2), 2000, seed=0)
        for k in ("g8", "g4", "g316", "gt"):
            self.assertTrue(np.allclose(s[k], ref[k], atol=1e-6), k)
        self.assertTrue(np.allclose(s["X"], ref["X"][:, :8], atol=1e-6))

    def test_boosted_weight_tool(self):
        """tools/bayer_boosted_weight.py (eval/bayer-boosted-weight-2026-11-16.md): the 5 x 5 mean matches a
        brute-force mean with reflected edges; the sample is the trainer's (same sensels, greens and twelve
        features); the gain of B's weight matches a direct score; the linear refit on one copy beats 3/16
        on that copy (in sample)."""

        import numpy as np

        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
        import bayer_boosted_weight as bw
        import bayer_laplace_train as t

        rng = np.random.default_rng(4)
        a = rng.random((7, 9))
        p = np.pad(a, 2, mode="reflect")
        ref = np.array([[p[y : y + 5, x : x + 5].mean() for x in range(9)] for y in range(7)])
        self.assertTrue(np.allclose(bw.window_mean(a), ref))

        truth = t.near_nyquist_texture(seed=2, n=128, tile=32)
        s = bw.copy_samples(truth, (0, 1, 1, 2), seed=0, snr=None, per_frame=2000)
        self.assertEqual(s["X"].shape, (2000, len(bw.FEATURE_NAMES)))
        ref = t.truth_samples(truth, (0, 1, 1, 2), 2000, seed=0)
        for k in ("g8", "g4", "g316", "gt"):
            self.assertTrue(np.allclose(s[k], ref[k], atol=1e-6), k)
        self.assertTrue(np.allclose(s["X"][:, :12], ref["X"], atol=1e-5))
        D = 8.0 * (s["g4"] - s["g8"])
        direct = np.mean((s["g8"] + (s["wB"] - 0.125) * D - s["gt"]) ** 2)
        self.assertAlmostEqual(bw.gain(s, s["wB"]), 10 * np.log10(np.mean((s["g316"] - s["gt"]) ** 2) / direct), 9)
        coef = bw.fit_linear([s])
        self.assertGreater(bw.gain(s, bw.predict_linear(coef, s)), 0.0)

    def test_boosted_guard_tool(self):
        """tools/bayer_boosted_guard.py (eval/bayer-boosted-guard-2026-11-16.md): the frame guards fall back
        to B only outside the training range (C1a on feature 5 alone, C1b on any of eight); the clamp stays
        within 1/64 of B; the CV rule takes the highest eligible mean, prefers the simpler within 0.005 dB,
        and refuses a candidate whose worst frame is below the linear weight by more than 0.05 dB."""

        import numpy as np

        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
        import bayer_boosted_guard as g

        T, B = np.array([0.15, 0.24, 0.13]), np.array([0.18, 0.18, 0.18])
        lo, hi = np.zeros(8), np.ones(8)
        inside = np.full(8, 0.5)
        maps, flags = g.candidates(T, B, inside, lo, hi)
        self.assertFalse(flags["fallback_f5"] or flags["fallback_any"])
        self.assertIs(maps["C1a"], T)
        self.assertTrue(np.all(np.abs(maps["C2"] - B) <= 1 / 64 + 1e-12))
        self.assertTrue(np.allclose(maps["C3"], (T + B) / 2))
        other = inside.copy()
        other[2] = 2.0  # out of range on a feature other than 5
        maps, flags = g.candidates(T, B, other, lo, hi)
        self.assertIs(maps["C1a"], T)
        self.assertIs(maps["C1b"], B)
        f5 = inside.copy()
        f5[5] = -1.0
        maps, _ = g.candidates(T, B, f5, lo, hi)
        self.assertIs(maps["C1a"], B)

        def row(group, lin, **c):
            return {"group": group, "cv_gain_linear": lin, **{f"cv_gain_{k}": v for k, v in c.items()}}

        # C2 has the higher mean but loses 0.1 dB on frame b; C3 is within the floor, C1a/C1b below the bar.
        rows = [row("a", 0.3, C3=0.40, C2=0.50, C1a=0.31, C1b=0.31), row("b", 0.3, C3=0.27, C2=0.20, C1a=0.31, C1b=0.31)]
        pick, summary = g.choose(rows)
        self.assertEqual(pick, "C3")
        self.assertFalse(summary["C2"]["eligible"])
        self.assertEqual(summary["C2"]["worst_frame"], "b")
        # Within 0.005 dB the simpler (C3 before C2) wins.
        rows = [row("a", 0.3, C3=0.400, C2=0.404, C1a=0.3, C1b=0.3)]
        self.assertEqual(g.choose(rows)[0], "C3")
        self.assertIsNone(g.choose([row("a", 0.3, C3=0.31, C2=0.31, C1a=0.31, C1b=0.31)])[0])

        v = g.verdict([{"group": "a", "gain_B": 0.3, "gain_X": 0.4}, {"group": "b", "gain_B": 0.3, "gain_X": 0.2}], "gain_X")
        self.assertFalse(v["pass"])  # frame b is 0.1 dB below B
        self.assertEqual(v["wins"], 1)


class DeveloperChoiceTests(unittest.TestCase):
    def raw(self):
        return raf.parse_raf(make_raf("bayer", width=30, height=22, picture=(1, 2, 18, 26), seed=5)[0])

    def develop(self, raw, **kw):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "p.dcp"
            p.write_bytes(make_profile("Fujifilm X-E1"))
            dcp = rd.read_dcp(p)
        return rd.develop(raw, rd.DevelopSettings(dcp=dcp, **kw))

    @unittest.skipUnless(has_numpy(), "numpy not installed")
    def test_auto_is_noise_aware_on_bayer_with_numpy(self):
        # since 2026-11-19 (eval/auto-noise-aware-2026-11-19.md); directional before
        raw = self.raw()
        _w, _h, px, rep = self.develop(raw, engine="numpy")
        self.assertEqual(rep.demosaic, "noise-aware")
        _, _, bil, rep_b = self.develop(raw, engine="numpy", demosaic="bilinear")
        self.assertEqual(rep_b.demosaic, "bilinear")
        self.assertEqual(len(px), len(bil))
        self.assertNotEqual(list(px), list(bil))
        explicit = self.develop(raw, engine="numpy", demosaic="noise-aware")
        self.assertEqual(list(explicit[2]), list(px))
        _, _, _, rep_d = self.develop(raw, engine="numpy", demosaic="directional")
        self.assertEqual(rep_d.demosaic, "directional")  # the old default, by name
        # half size bins each 2x2 block and demosaics nothing: auto reads no noise there
        _, _, _, rep_h = self.develop(raw, engine="numpy", half=True)
        self.assertEqual(rep_h.demosaic, "directional")
        self.assertFalse(any("NoiseProfile" in n for n in rep_h.notes))

    @unittest.skipUnless(has_numpy(), "numpy not installed")
    def test_learned_is_an_opt_in_choice(self):
        raw = self.raw()
        _w, _h, px, rep = self.develop(raw, engine="numpy", demosaic="learned")
        self.assertEqual(rep.demosaic, "learned")
        _, _, auto, rep_a = self.develop(raw, engine="numpy")
        self.assertEqual(rep_a.demosaic, "noise-aware")  # not the default
        self.assertEqual(len(px), len(auto))
        with self.assertRaises(rd.DevelopError):
            self.develop(raw, engine="python", demosaic="learned")

    @unittest.skipUnless(has_numpy(), "numpy not installed")
    def test_half_size_bins_and_does_not_demosaic(self):
        raw = self.raw()
        a = self.develop(raw, engine="numpy", half=True)
        b = self.develop(raw, engine="numpy", half=True, demosaic="bilinear")
        self.assertEqual(list(a[2]), list(b[2]))

    def test_python_engine_falls_back_to_bilinear(self):
        _, _, _, rep = self.develop(self.raw(), engine="python")
        self.assertEqual(rep.demosaic, "bilinear")


if __name__ == "__main__":
    unittest.main()
