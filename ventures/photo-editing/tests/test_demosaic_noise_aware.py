"""The noise-aware blend of the directional and bilinear demosaics (``xtrans_demosaic.frame_measures``,
``blend``, ``noise_aware``; eval/xtrans-noise-aware-blend-2026-11-16.md).

Pinned: the noise estimate tracks the noise drawn on a flat field, an overstated NoiseProfile is read and
scaled down (``profile_ratio``, ``guard_profile``), sensels keep their own values, a
flat noisy field leans to bilinear and a sharp clean edge to directional, the blend lies between its
two inputs, the weights follow the documented ramp, and a second luma ramp takes luma from one blend
and colour difference from the other.
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

    def test_frame_noise_is_the_scaled_estimate_and_never_above_it(self):
        from shootflow.noise_pca import estimate_noise_pca
        from shootflow.xtrans_demosaic import FRAME_SCALE, estimate_noise, frame_noise

        _, c = self._flat(0.01)
        shot, read = estimate_noise_pca(c, XE1_PATTERN)
        fs, fr = frame_noise(c, XE1_PATTERN)
        # sigma scaled by FRAME_SCALE (the guard only ever lowers it further)
        self.assertLessEqual(fs, shot * FRAME_SCALE**2 + 1e-15)
        self.assertLessEqual(fr, read * FRAME_SCALE**2 + 1e-15)
        self.assertGreater(fs + fr, 0.0)
        fs1, fr1 = frame_noise(c, XE1_PATTERN, scale=1.0)
        self.assertGreater(fs1 + fr1, fs + fr)
        # the block-spread model of the morning of 2026-11-17 stays reachable
        ss, sr = frame_noise(c, XE1_PATTERN, estimator="spread")
        es, er = estimate_noise(c, XE1_PATTERN)
        self.assertLessEqual(ss, es * FRAME_SCALE**2 + 1e-15)
        self.assertLessEqual(sr, er * FRAME_SCALE**2 + 1e-15)
        with self.assertRaises(ValueError):
            frame_noise(c, XE1_PATTERN, estimator="nope")

    def test_frame_noise_blend_beats_directional_on_a_flat_noisy_field(self):
        from shootflow.xtrans_demosaic import directional, frame_noise, noise_aware

        truth, c = self._flat(0.01)
        b, d = _bilinear(c, XE1_PATTERN), directional(c, XE1_PATTERN)
        out = noise_aware(c, XE1_PATTERN, bilinear=b, directional_out=d, noise=frame_noise(c, XE1_PATTERN))
        err = lambda a: float(self.np.mean((a[6:-6, 6:-6] - truth[6:-6, 6:-6]) ** 2))  # noqa: E731
        self.assertLess(err(out), err(d))

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
        out = noise_aware(c, XE1_PATTERN, bilinear=b, directional_out=d, q_low=0.0, q_high=1e6, luma_ramp=False)
        cm = colour_map(XE1_PATTERN, 72, 72)
        own = np.take_along_axis(out, cm[..., None].astype(np.int64), axis=2)[..., 0]
        np.testing.assert_allclose(own, c, atol=1e-9)
        self.assertTrue(np.all(out >= np.minimum(b, d) - 1e-12) and np.all(out <= np.maximum(b, d) + 1e-12))

    def test_bayer_uses_its_own_demosaic_and_ramp(self):
        from shootflow.bayer_demosaic import directional as bayer
        from shootflow.xtrans_demosaic import LUMA_RAMPS, RAMPS, noise_aware

        np = self.np
        pat = (0, 1, 1, 2)
        truth = np.full((96, 96, 3), (0.3, 0.4, 0.25))
        c = _mosaic(truth, pat) + self.rng.normal(size=(96, 96)) * 0.01
        b, d = _bilinear(c, pat), bayer(c, pat)
        a = noise_aware(c, pat, noise=(0.0, 1e-4))
        e = noise_aware(c, pat, bilinear=b, directional_out=d, noise=(0.0, 1e-4), q_low=RAMPS[2][0], q_high=RAMPS[2][1],
                        luma_ramp=LUMA_RAMPS[2])
        np.testing.assert_allclose(a, e, atol=1e-12)

    def test_luma_ramp_takes_luma_from_one_blend_and_colour_from_the_other(self):
        """eval/noise-aware-luma-ramp-2026-11-17.md: with ``luma_ramp`` the output's Rec. 709 luma is the
        luma-ramp blend's and its R-G, B-G are the colour-ramp blend's; luma lies between the inputs' luma;
        both ramps at 1 (a clean frame) give the directional result; ``noise_aware`` uses LUMA_RAMPS by default."""

        from shootflow.xtrans_demosaic import LUMA_RAMPS, LUMA_WEIGHTS, RAMPS, blend, directional, frame_measures, noise_aware

        np = self.np
        b = self.rng.uniform(0.1, 0.8, size=(72, 72, 3))
        d = self.rng.uniform(0.1, 0.8, size=(72, 72, 3))
        q = self.rng.uniform(0.0, 3.0, size=(3, 3))
        colour, luma = blend(b, d, q, 0.4, 2.0), blend(b, d, q, 0.8, 2.0)
        out = blend(b, d, q, 0.4, 2.0, luma_ramp=(0.8, 2.0))
        np.testing.assert_allclose(out @ LUMA_WEIGHTS, luma @ LUMA_WEIGHTS, atol=1e-12)
        diff = lambda a: np.stack([a[..., 0] - a[..., 1], a[..., 2] - a[..., 1]], -1)  # noqa: E731
        np.testing.assert_allclose(diff(out), diff(colour), atol=1e-12)
        y = out @ LUMA_WEIGHTS
        self.assertTrue(np.all(y >= np.minimum(b @ LUMA_WEIGHTS, d @ LUMA_WEIGHTS) - 1e-12))
        self.assertTrue(np.all(y <= np.maximum(b @ LUMA_WEIGHTS, d @ LUMA_WEIGHTS) + 1e-12))
        np.testing.assert_allclose(blend(b, d, np.full((3, 3), 5.0), 0.4, 2.0, luma_ramp=(0.8, 2.0)), d, atol=1e-12)
        truth, c = self._flat(0.01)
        bb, dd = _bilinear(c, XE1_PATTERN), directional(c, XE1_PATTERN)
        qb = frame_measures(c, XE1_PATTERN, bb, dd, blocks=True)["q_blocks"]
        np.testing.assert_allclose(
            noise_aware(c, XE1_PATTERN, bilinear=bb, directional_out=dd),
            blend(bb, dd, qb, *RAMPS[6], luma_ramp=LUMA_RAMPS[6]), atol=1e-12)
        err = lambda a: float(np.mean(((a - truth)[6:-6, 6:-6] @ LUMA_WEIGHTS) ** 2))  # noqa: E731
        self.assertLessEqual(err(noise_aware(c, XE1_PATTERN, bilinear=bb, directional_out=dd)),
                             err(noise_aware(c, XE1_PATTERN, bilinear=bb, directional_out=dd, luma_ramp=False)) + 1e-15)

    def test_blend_ramp(self):
        from shootflow.xtrans_demosaic import blend

        np = self.np
        b, d = np.zeros((48, 48, 3)), np.ones((48, 48, 3))
        for q, want in ((0.5, 0.0), (1.0, 0.0), (1.5, 0.5), (2.0, 1.0), (3.0, 1.0)):
            out = blend(b, d, np.full((2, 2), q), 1.0, 2.0)
            np.testing.assert_allclose(out, want, atol=1e-12)

    def test_lift_near_detail_raises_only_neighbours_of_high_q(self):
        """eval/near-clean-gate-2026-11-19.md: each block's q becomes at least its largest 3 x 3 neighbour's / k;
        a block with no such neighbour, and every block already above it, keeps its own q."""

        from shootflow.xtrans_demosaic import lift_near_detail

        np = self.np
        q = np.full((5, 5), 0.3)
        q[2, 2] = 40.0
        out = lift_near_detail(q, 16.0)
        want = np.full((5, 5), 0.3)
        want[1:4, 1:4] = 2.5
        want[2, 2] = 40.0
        np.testing.assert_allclose(out, want)
        self.assertTrue(np.all(out >= q))
        np.testing.assert_allclose(lift_near_detail(np.full((3, 4), 1.7), 16.0), 1.7)
        np.testing.assert_allclose(lift_near_detail(np.array([[2.0]]), 16.0), [[2.0]])

    def test_lift_stops_the_leak_into_a_clean_edge_beside_a_flat_field(self):
        """A clean frame, half flat and half fine stripes: unlifted, the stripes' blocks beside the flat half take
        part of its bilinear weight (``blend`` interpolates block weights between centres) and lose to directional;
        lifted (the Bayer default since 2026-11-19, ``NEAR_DETAIL``), the result there is directional's."""

        from shootflow.bayer_demosaic import directional as bayer
        from shootflow.xtrans_demosaic import noise_aware

        np = self.np
        pat = (0, 1, 1, 2)
        y, x = np.mgrid[0:144, 0:144]
        # flat left of x = 72 (a block edge), stripes fading in over 4 pixels right of it, so no step edge
        s = 0.4 + 0.25 * np.clip((x - 72) / 4, 0, 1) * np.sin(x * 0.45 + y * 0.18)
        truth = np.stack([s, s * 0.9, s * 1.1], -1)
        c = _mosaic(truth, pat) + self.rng.normal(size=(144, 144)) * 2e-4
        b, d = _bilinear(c, pat), bayer(c, pat)
        noise = (0.0, 4e-8)
        plain = noise_aware(c, pat, bilinear=b, directional_out=d, noise=noise, near_detail=False)
        lifted = noise_aware(c, pat, bilinear=b, directional_out=d, noise=noise)  # Bayer default: k = 12
        np.testing.assert_array_equal(lifted, noise_aware(c, pat, bilinear=b, directional_out=d, noise=noise,
                                                          near_detail=12.0))
        band = (slice(8, -8), slice(72, 96))  # the stripes' first block column, beside the flat half
        err = lambda a: float(np.mean((a[band] - truth[band]) ** 2))  # noqa: E731
        self.assertGreater(err(plain), err(d) * 2)
        self.assertLessEqual(err(lifted), err(d) * 1.001)

    def test_thin_frames_are_one_block(self):
        # under one BLOCK tall but several wide (or the reverse): one block, the whole frame. Until 2026-11-19
        # ``_block_stat`` made hb = 1 but wb = w // BLOCK there and the reshape failed (eval/auto-noise-aware-2026-11-19.md).
        from shootflow.xtrans_demosaic import _block_stat, noise_aware

        for shape in ((16, 60), (60, 16), (16, 16)):
            a = self.rng.uniform(0.1, 0.9, shape)
            m = _block_stat(a, lambda t: t.mean(axis=-1))
            self.assertEqual(m.shape, (1, 1))
            self.assertAlmostEqual(float(m[0, 0]), float(a.mean()), places=12)
        for pat in (XE1_PATTERN, (0, 1, 1, 2)):
            c = self.rng.uniform(0.1, 0.8, (18, 60))
            out = noise_aware(c, pat, noise=(1e-4, 1e-6))
            self.assertEqual(out.shape, (18, 60, 3))
            self.assertTrue(self.np.isfinite(out).all())


@unittest.skipUnless(has_numpy(), "numpy not installed")
class ProfileGuardTests(unittest.TestCase):
    """``profile_ratio`` / ``guard_profile`` (eval/noise-profile-real-dngs-2026-11-16.md): a profile that states
    far more noise than the mosaic shows is scaled down; an honest one is left alone."""

    def _scene(self, pat, shot=2e-4, read=2e-6, n=192, seed=4):
        import numpy as np


        rng = np.random.default_rng(seed)
        y, x = np.mgrid[0:n, 0:n].astype(np.float64)
        lum = np.where(x >= n // 2, 0.35 + 0.2 * np.sin(x * x / (2.2 * n) + y / 9), 0.15 + 0.35 * y / n)
        truth = np.stack([lum, lum * 0.9, lum * 0.7], axis=-1)
        c = _mosaic(truth, pat)
        return truth, c + rng.normal(size=c.shape) * np.sqrt(shot * c + read)

    def test_ratio_reads_the_overstatement_despite_texture(self):
        from shootflow.xtrans_demosaic import profile_ratio

        for pat in ((0, 1, 1, 2), XE1_PATTERN):
            _, c = self._scene(pat)
            for k in (1.0, 4.0, 16.0):
                r = profile_ratio(c, pat, (2e-4 * k * k, 2e-6 * k * k))
                self.assertAlmostEqual(r / k, 1.0, delta=0.2, msg=(len(pat), k))

    def test_guard_scales_an_overstated_profile_and_keeps_an_honest_one(self):
        from shootflow.xtrans_demosaic import PROFILE_CAP, guard_profile

        _, c = self._scene((0, 1, 1, 2))
        used, r = guard_profile(c, (0, 1, 1, 2), (2e-4, 2e-6))
        self.assertEqual(used, (2e-4, 2e-6))
        self.assertLess(r, PROFILE_CAP)
        used, r = guard_profile(c, (0, 1, 1, 2), (2e-4 * 256, 2e-6 * 256))
        self.assertGreater(r, 10)
        self.assertAlmostEqual(used[0] / used[1], 100.0, places=6)  # the profile's shape is kept
        self.assertAlmostEqual(used[0] / (2e-4 * 256), (PROFILE_CAP / r) ** 2, places=9)

    def test_guarded_blend_recovers_the_honest_result(self):
        import numpy as np

        from shootflow.xtrans_demosaic import directional, guard_profile, noise_aware

        for pat in ((0, 1, 1, 2), XE1_PATTERN):
            truth, c = self._scene(pat)
            if len(pat) == 4:
                from shootflow.bayer_demosaic import directional as bayer

                d = bayer(c, pat)
            else:
                d = directional(c, pat)
            b = _bilinear(c, pat)
            err = lambda a: float(np.mean((a[8:-8, 8:-8] - truth[8:-8, 8:-8]) ** 2))  # noqa: E731
            honest = err(noise_aware(c, pat, bilinear=b, directional_out=d, noise=(2e-4, 2e-6)))
            over = (2e-4 * 256, 2e-6 * 256)
            raw = err(noise_aware(c, pat, bilinear=b, directional_out=d, noise=over))
            guarded = err(noise_aware(c, pat, bilinear=b, directional_out=d, noise=guard_profile(c, pat, over)[0]))
            self.assertGreater(raw, honest * 2)  # 16x the noise leans every detailed block to bilinear
            self.assertLess(guarded, honest * 1.05)

    def _plane_scene(self, pat, model, n=192, seed=6):
        import numpy as np

        from shootflow.xtrans_demosaic import variance_map

        truth, _ = self._scene(pat, n=n)
        c = _mosaic(truth, pat)
        return truth, c + np.random.default_rng(seed).normal(size=c.shape) * np.sqrt(variance_map(c, pat, model))

    def test_one_pair_per_plane_is_the_scalar_model(self):
        import numpy as np

        from shootflow.xtrans_demosaic import as_planes, directional, frame_measures

        _, c = self._scene(XE1_PATTERN)
        b, d = _bilinear(c, XE1_PATTERN), directional(c, XE1_PATTERN)
        one = frame_measures(c, XE1_PATTERN, b, d, noise=(2e-4, 2e-6), blocks=True)
        three = frame_measures(c, XE1_PATTERN, b, d, noise=as_planes((2e-4, 2e-6)), blocks=True)
        np.testing.assert_allclose(three["q_blocks"], one["q_blocks"], rtol=1e-12)
        with self.assertRaises(ValueError):
            as_planes((1e-4, 1e-6, 1e-4))

    def test_plane_ratios_name_the_overstated_plane(self):
        import numpy as np

        from shootflow.xtrans_demosaic import PROFILE_CAP, guard_profile, plane_ratios

        # Noise as white balance leaves it: red 2x and blue 1.6x green's sigma.
        true = np.array([[2e-4 * 2.0, 2e-6 * 4.0], [2e-4, 2e-6], [2e-4 * 1.6, 2e-6 * 2.56]])
        for pat in ((0, 1, 1, 2), XE1_PATTERN):
            _, c = self._plane_scene(pat, true)
            np.testing.assert_allclose(plane_ratios(c, pat, true), 1.0, atol=0.2, err_msg=str(len(pat)))
            over = true.copy()
            over[2] *= 64.0  # blue 8x in sigma
            r = plane_ratios(c, pat, over)
            self.assertAlmostEqual(r[2] / 8.0, 1.0, delta=0.2, msg=str(r))
            self.assertLess(max(r[0], r[1]), PROFILE_CAP, msg=str(r))
            used, ratio = guard_profile(c, pat, over)
            self.assertAlmostEqual(ratio, r[2], places=9)
            np.testing.assert_array_equal(used[:2], over[:2])  # the honest planes are kept
            self.assertAlmostEqual(used[2, 0] / over[2, 0], (PROFILE_CAP / r[2]) ** 2, places=9)


class NoiseFromFrameFlagTests(unittest.TestCase):
    """``shootflow develop --noise-from-frame`` is on by default since 2026-11-17; ``--no-noise-from-frame`` turns
    the frame-read model off (eval/noise-fallback-real-2026-11-17.md)."""

    def test_flag_default_on_and_negatable(self):
        from shootflow.cli import _build_parser

        p = _build_parser()
        self.assertTrue(p.parse_args(["develop", "x.dng", "--out", "o"]).noise_from_frame)
        self.assertTrue(p.parse_args(["develop", "x.dng", "--out", "o", "--noise-from-frame"]).noise_from_frame)
        self.assertFalse(p.parse_args(["develop", "x.dng", "--out", "o", "--no-noise-from-frame"]).noise_from_frame)

    def test_settings_default_on(self):
        from shootflow.raw_develop import DevelopSettings

        self.assertTrue(DevelopSettings().noise_from_frame)


class NoiseReadTests(unittest.TestCase):
    """``--noise-read mpcws`` (the default since 2026-11-23, eval/hdrplus-joint-check-j4-2026-11-23.md and
    eval/camera-drawn-mpcws-2026-11-23.md): Bayer only, its own
    colour ramp, and exactly the shipped read where the ``mpcws`` read collapses."""

    def test_flag_and_setting_default_mpcws(self):
        from shootflow.cli import _build_parser
        from shootflow.raw_develop import DevelopSettings

        p = _build_parser()
        self.assertEqual(p.parse_args(["develop", "x.dng", "--out", "o"]).noise_read, "mpcws")
        self.assertEqual(p.parse_args(["develop", "x.dng", "--out", "o", "--noise-read", "ship"]).noise_read, "ship")
        self.assertEqual(p.parse_args(["develop", "x.dng", "--out", "o", "--noise-read", "mpcws"]).noise_read, "mpcws")
        self.assertEqual(DevelopSettings().noise_read, "mpcws")  # the default since 2026-11-23

    @unittest.skipUnless(has_numpy(), "numpy not installed")
    def test_read_rules(self):
        from unittest import mock

        from shootflow import xtrans_demosaic as xd

        reads = {None: (1e-4, 1e-6), "mpcws": (1.2e-4, 1e-6)}

        def fake(c, pat, eig=None):
            return reads[eig]

        with mock.patch.object(xd, "frame_noise", side_effect=fake):
            self.assertEqual(xd.frame_noise_read(None, (0, 1, 1, 2), "ship"), (reads[None], None, False))
            self.assertEqual(xd.frame_noise_read(None, (0, 1, 1, 2), "mpcws"),
                             (reads["mpcws"], xd.MPCWS_COLOUR_RAMP, False))
            self.assertEqual(xd.frame_noise_read(None, XE1_PATTERN, "mpcws"), (reads[None], None, False))
            # the evaluation-only X-Trans forms (eval/xtrans-drawn-mpcws-2026-11-24.md); develop never passes them
            self.assertEqual(xd.frame_noise_read(None, XE1_PATTERN, "mpcws", xtrans="own"), (reads["mpcws"], None, False))
            self.assertEqual(xd.frame_noise_read(None, XE1_PATTERN, "mpcws", xtrans="ramp"),
                             (reads["mpcws"], xd.MPCWS_COLOUR_RAMP, False))
            self.assertEqual(xd.frame_noise_read(None, XE1_PATTERN, "ship", xtrans="own"), (reads[None], None, False))
            with self.assertRaises(ValueError):
                xd.frame_noise_read(None, XE1_PATTERN, "mpcws", xtrans="chen")
            reads["mpcws"] = (0.3e-4, 0.3e-6)  # sigma about 0.55x the shipped read's: under the 0.6 line
            self.assertEqual(xd.frame_noise_read(None, (0, 1, 1, 2), "mpcws"), (reads[None], None, True))
            self.assertEqual(xd.frame_noise_read(None, XE1_PATTERN, "mpcws", xtrans="own"), (reads[None], None, True))
            with self.assertRaises(ValueError):
                xd.frame_noise_read(None, (0, 1, 1, 2), "chen")


class DevelopNoiseAwareTests(unittest.TestCase):
    """``--demosaic noise-aware`` in the developer: the DNG's NoiseProfile drives it; without one a model read from
    the frame (``frame_noise``, the default), or with ``noise_from_frame=False`` the directional demosaic."""

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
        # DNG 1.7.1.0: S_i > 0 and O_i >= 0, so a zero read term is legal (13 real phone profiles write one).
        self.assertEqual(rd.noise_profile({rd.TAG_NOISE_PROFILE: (2e-5, 0.0)}), (2e-5, 0.0))
        self.assertIsNone(rd.noise_profile({rd.TAG_NOISE_PROFILE: (0.0, 1e-6)}))
        self.assertIsNone(rd.noise_profile({rd.TAG_NOISE_PROFILE: (2e-5, -1e-9)}))
        self.assertIsNone(rd.noise_profile({}))

    def test_noise_profile_planes_read(self):
        from shootflow import raw_develop as rd

        NP, PC = rd.TAG_NOISE_PROFILE, rd.TAG_CFA_PLANE_COLOR
        self.assertEqual(rd.noise_profile_planes({NP: (2e-5, 1e-6)}), [(2e-5, 1e-6)] * 3)
        three = (1e-5, 1e-7, 2e-5, 2e-7, 3e-5, 3e-7)
        self.assertEqual(rd.noise_profile_planes({NP: three}), [(1e-5, 1e-7), (2e-5, 2e-7), (3e-5, 3e-7)])
        # Pairs follow CFAPlaneColor, so a B, G, R plane order lands on R, G, B.
        self.assertEqual(rd.noise_profile_planes({NP: three, PC: (2, 1, 0)}), [(3e-5, 3e-7), (2e-5, 2e-7), (1e-5, 1e-7)])
        self.assertIsNone(rd.noise_profile_planes({NP: three, PC: (0, 1, 1)}))
        self.assertIsNone(rd.noise_profile_planes({NP: (1e-5, 1e-7, 2e-5, 2e-7)}))  # two pairs, three planes
        self.assertIsNone(rd.noise_profile_planes({NP: (1e-5, 1e-7, 0.0, 2e-7, 3e-5, 3e-7)}))
        self.assertIsNone(rd.noise_profile_planes({}))

    @unittest.skipUnless(has_numpy(), "numpy not installed")
    def test_noise_aware_with_profile_differs_without_falls_back_or_reads_the_frame(self):
        sigma = 40.0 / (4095 - 256)
        with_np = self._dng((1e-12, sigma * sigma))
        w, h, px, rep = self._develop(with_np, engine="numpy", demosaic="noise-aware")
        self.assertEqual(rep.demosaic, "noise-aware")
        _, _, dpx, drep = self._develop(with_np, engine="numpy", demosaic="directional")
        self.assertEqual(len(px), len(dpx))
        self.assertNotEqual(list(px), list(dpx))  # a flat noisy field: blended toward bilinear
        # Default since 2026-11-17 evening: no profile, the model read from the frame.
        _, _, dpx2, _ = self._develop(self._dng(None), engine="numpy", demosaic="directional")
        _, _, epx, erep = self._develop(self._dng(None), engine="numpy", demosaic="noise-aware")
        self.assertEqual(erep.demosaic, "noise-aware")
        self.assertTrue(any("read from the frame" in n for n in erep.notes), erep.notes)
        self.assertEqual(len(epx), len(dpx2))
        self.assertNotEqual(list(epx), list(dpx2))  # the flat noisy field is blended toward bilinear here too
        _, _, xpx, _ = self._develop(self._dng(None), engine="numpy", demosaic="noise-aware", noise_from_frame=True)
        self.assertEqual(list(xpx), list(epx))  # the explicit flag is the default
        # Turned off: the old fallback to directional, said in the notes.
        _, _, fpx, frep = self._develop(self._dng(None), engine="numpy", demosaic="noise-aware", noise_from_frame=False)
        self.assertEqual(frep.demosaic, "directional")
        self.assertTrue(any("NoiseProfile" in n and "--no-noise-from-frame" in n for n in frep.notes), frep.notes)
        self.assertEqual(list(fpx), list(dpx2))
        # --noise-read mpcws (the default since 2026-11-23, eval/camera-drawn-mpcws-2026-11-23.md): the default bytes
        _, _, mpx, mrep = self._develop(self._dng(None), engine="numpy", demosaic="noise-aware", noise_read="mpcws")
        self.assertEqual(mrep.demosaic, "noise-aware")
        self.assertEqual(len(mpx), len(epx))
        self.assertEqual(list(mpx), list(epx))  # the default is the mpcws read
        _, _, spx, srep = self._develop(self._dng(None), engine="numpy", demosaic="noise-aware", noise_read="ship")
        self.assertEqual(srep.demosaic, "noise-aware")
        self.assertEqual(len(spx), len(epx))
        _, _, _, hfrep = self._develop(self._dng(None), engine="numpy", demosaic="noise-aware", half=True)
        self.assertEqual(hfrep.demosaic, "noise-aware")
        # A file with a profile ignores the flag either way: the profile drives the blend.
        for flag in (True, False):
            _, _, ppx, _ = self._develop(with_np, engine="numpy", demosaic="noise-aware", noise_from_frame=flag)
            self.assertEqual(list(ppx), list(px))
        _, _, hpx, hrep = self._develop(with_np, engine="numpy", demosaic="noise-aware", half=True)
        self.assertEqual(hrep.demosaic, "noise-aware")
        self.assertFalse(any("states" in n for n in rep.notes), rep.notes)  # an honest profile is not scaled

    @unittest.skipUnless(has_numpy(), "numpy not installed")
    def test_an_overstated_profile_is_scaled_and_noted(self):
        sigma = 40.0 / (4095 - 256)
        over = self._dng((1e-12, (20 * sigma) ** 2), w=192, h=144)  # 48 blocks: every brightness bin filled
        _, _, _, rep = self._develop(over, engine="numpy", demosaic="noise-aware")
        self.assertEqual(rep.demosaic, "noise-aware")
        self.assertTrue(any("NoiseProfile states" in n and "scaled" in n for n in rep.notes), rep.notes)
        _, _, _, hrep = self._develop(self._dng((1e-12, sigma * sigma), w=192, h=144), engine="numpy", demosaic="noise-aware")
        # The honest profile reads about 1x. Until the guard went plane by plane (2026-11-16) it read 1.3x on this
        # 48-block frame, whose planes carry unequal white-balance gains; a trim to 1.25x is harmless, so only a
        # reading well past the cap would be wrong.
        import re

        said = [float(m.group(1)) for n in hrep.notes for m in [re.search(r"states ([0-9.]+)x", n)] if m]
        self.assertTrue(all(v < 1.6 for v in said), hrep.notes)
        self.assertGreater(float(re.search(r"states ([0-9.]+)x", " ".join(rep.notes)).group(1)), 10)
        self.assertEqual(said, [])  # since the per-plane guard, not even trimmed

    @unittest.skipUnless(has_numpy(), "numpy not installed")
    def test_one_overstated_plane_is_found(self):
        import re

        sigma = 40.0 / (4095 - 256)
        honest = (1e-12, sigma * sigma)
        blue_over = self._dng(honest * 2 + (1e-12, (8 * sigma) ** 2), w=192, h=144)  # blue's pair 8x in sigma
        _, _, _, rep = self._develop(blue_over, engine="numpy", demosaic="noise-aware")
        self.assertEqual(rep.demosaic, "noise-aware")
        said = float(re.search(r"states ([0-9.]+)x", " ".join(rep.notes)).group(1))
        self.assertAlmostEqual(said / 8.0, 1.0, delta=0.2, msg=rep.notes)


if __name__ == "__main__":
    unittest.main()
