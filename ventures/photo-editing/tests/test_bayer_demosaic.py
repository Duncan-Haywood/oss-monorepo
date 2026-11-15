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

    def test_bands_equal_one_piece(self):
        import numpy as np

        from shootflow.bayer_demosaic import directional

        rng = np.random.default_rng(4)
        c = rng.random((75, 41)).astype(np.float32) * 3.0
        for kw in ({}, {"median_passes": 1}, {"rb": "simple"}):
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
    def test_auto_is_directional_on_bayer_with_numpy(self):
        raw = self.raw()
        _w, _h, px, rep = self.develop(raw, engine="numpy")
        self.assertEqual(rep.demosaic, "directional")
        _, _, bil, rep_b = self.develop(raw, engine="numpy", demosaic="bilinear")
        self.assertEqual(rep_b.demosaic, "bilinear")
        self.assertEqual(len(px), len(bil))
        self.assertNotEqual(list(px), list(bil))
        explicit = self.develop(raw, engine="numpy", demosaic="directional")
        self.assertEqual(list(explicit[2]), list(px))

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
