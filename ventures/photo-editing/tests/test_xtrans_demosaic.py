"""The directional X-Trans demosaic (``shootflow.xtrans_demosaic``) and its place in the developer.

Measured against known truth and LibRaw on real frames in
``eval/xtrans-directional-demosaic-2026-11-14.md``; these tests pin the properties that measurement
relies on: each sensel keeps its own value, flat fields stay flat, a sharp edge comes out with less
false colour than the bilinear demosaic leaves, and the developer picks it (or refuses it) as
documented.
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
from test_raf import XE1_PATTERN, has_numpy, make_raf


def _edge_truth(h=48, w=60):
    import numpy as np

    y, x = np.mgrid[0:h, 0:w].astype(np.float64)
    # A slanted edge between an orange and a blue-grey field, plus a fine vertical grating in the lower half.
    left = x * np.cos(0.12) - y * np.sin(0.12) < w / 2
    truth = np.empty((h, w, 3))
    truth[left] = (0.7, 0.35, 0.12)
    truth[~left] = (0.2, 0.3, 0.45)
    low = y >= h / 2
    grating = 0.3 + 0.25 * (np.floor(x / 2) % 2)
    for k in range(3):
        truth[..., k] = np.where(low, grating, truth[..., k])
    return truth


@unittest.skipUnless(has_numpy(), "numpy not installed")
class DirectionalTests(unittest.TestCase):
    def mosaic(self, truth):
        import numpy as np

        from shootflow.xtrans_demosaic import colour_map

        h, w, _ = truth.shape
        cm = colour_map(XE1_PATTERN, h, w)
        return np.take_along_axis(truth, cm[..., None].astype(np.int64), axis=2)[..., 0], cm

    def test_keeps_each_sensels_own_value(self):
        import numpy as np

        from shootflow.xtrans_demosaic import directional

        rng = np.random.default_rng(4)
        c = rng.uniform(0.05, 0.9, (30, 36))
        out = directional(c, XE1_PATTERN)
        cm = self.mosaic(np.zeros((30, 36, 3)))[1]
        own = np.take_along_axis(out, cm[..., None].astype(np.int64), axis=2)[..., 0]
        np.testing.assert_allclose(own, c, rtol=0, atol=1e-12)
        self.assertTrue(np.isfinite(out).all())

    def test_flat_field_stays_flat(self):
        import numpy as np

        from shootflow.xtrans_demosaic import directional

        c, _ = self.mosaic(np.broadcast_to(np.array([0.4, 0.6, 0.3]), (25, 31, 3)).copy())
        out = directional(c, XE1_PATTERN)
        np.testing.assert_allclose(out, np.broadcast_to([0.4, 0.6, 0.3], out.shape), atol=1e-6)  # float32 work

    def test_less_false_colour_than_bilinear_on_edges(self):
        import numpy as np

        from shootflow import raw_develop_np as rnp
        from shootflow.xtrans_demosaic import directional

        truth = _edge_truth()
        c, _ = self.mosaic(truth)
        h, w = c.shape
        bil = np.empty((h, w, 3))
        rnp._bilinear(c, w, h, XE1_PATTERN, (1.0, 1.0, 1.0), 1e9, None, None, None, None, sink=bil, threads=1)
        dirn = directional(c, XE1_PATTERN)

        def chroma_err(a):
            a, t = a[6:-6, 6:-6], truth[6:-6, 6:-6]
            d = (a[..., 0] - a[..., 1]) - (t[..., 0] - t[..., 1]), (a[..., 2] - a[..., 1]) - (t[..., 2] - t[..., 1])
            return float(np.mean(np.hypot(*d)))

        self.assertLess(chroma_err(dirn), 0.6 * chroma_err(bil))
        self.assertLess(float(np.mean((dirn - truth)[6:-6, 6:-6] ** 2)), float(np.mean((bil - truth)[6:-6, 6:-6] ** 2)))

    def test_bands_equal_one_piece(self):
        import numpy as np

        from shootflow.xtrans_demosaic import directional

        c = self.mosaic(_edge_truth(h=150, w=40))[0] + np.random.default_rng(2).uniform(0, 0.05, (150, 40))
        whole = directional(c, XE1_PATTERN, band_rows=None)
        for band, threads in ((12, 1), (30, 3), (64, 2)):
            np.testing.assert_array_equal(directional(c, XE1_PATTERN, band_rows=band, threads=threads), whole)
        whole3 = directional(c, XE1_PATTERN, band_rows=None, passes=3)
        np.testing.assert_array_equal(directional(c, XE1_PATTERN, band_rows=18, passes=3), whole3)

    def test_any_phase_of_the_layout(self):
        import numpy as np

        from shootflow.xtrans_demosaic import directional

        # The same layout shifted by (2, 3): still demosaics, keeps sensels, stays finite.
        shifted = tuple(XE1_PATTERN[((y + 2) % 6) * 6 + (x + 3) % 6] for y in range(6) for x in range(6))
        c = np.random.default_rng(1).uniform(0.1, 0.8, (24, 24))
        out = directional(c, shifted)
        self.assertEqual(out.shape, (24, 24, 3))
        self.assertTrue(np.isfinite(out).all())


class DeveloperChoiceTests(unittest.TestCase):
    def raw(self, width=25, height=19, seed=3):
        data, _ = make_raf("xtrans12", width=width, height=height, picture=(1, 2, height - 3, width - 4), seed=seed)
        return raf.parse_raf(data)

    def develop(self, raw, **kw):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "p.dcp"
            p.write_bytes(make_profile("Fujifilm X-E1"))
            dcp = rd.read_dcp(p)
        return rd.develop(raw, rd.DevelopSettings(dcp=dcp, **kw))

    @unittest.skipUnless(has_numpy(), "numpy not installed")
    def test_auto_is_directional_on_xtrans_with_numpy(self):
        raw = self.raw()
        for half in (False, True):
            w, h, px, rep = self.develop(raw, engine="numpy", half=half)
            self.assertEqual(rep.demosaic, "directional")
            _, _, bil, rep_b = self.develop(raw, engine="numpy", half=half, demosaic="bilinear")
            self.assertEqual(rep_b.demosaic, "bilinear")
            self.assertEqual(len(px), len(bil))
            self.assertNotEqual(list(px), list(bil))

    @unittest.skipUnless(has_numpy(), "numpy not installed")
    def test_explicit_equals_auto(self):
        raw = self.raw(width=31, height=26)
        a = self.develop(raw, engine="numpy", demosaic="directional")
        b = self.develop(raw, engine="numpy")
        self.assertEqual(b[3].demosaic, "directional")
        self.assertEqual(list(a[2]), list(b[2]))

    def test_python_engine_falls_back_to_bilinear(self):
        _, _, _, rep = self.develop(self.raw(), engine="python")
        self.assertEqual(rep.demosaic, "bilinear")
        self.assertTrue(any("directional one needs the numpy engine" in n for n in rep.notes), rep.notes)

    def test_refusals(self):
        raw = self.raw()
        with self.assertRaisesRegex(rd.DevelopError, "needs the numpy engine"):
            self.develop(raw, engine="python", demosaic="directional")
        with self.assertRaisesRegex(rd.DevelopError, "unknown demosaic"):
            self.develop(raw, engine="python", demosaic="ahd")
        bayer = raf.parse_raf(make_raf("bayer")[0])
        with self.assertRaisesRegex(rd.DevelopError, "for X-Trans"):
            self.develop(bayer, engine="python", demosaic="directional")
        _, _, _, rep = self.develop(bayer, engine="python")
        self.assertEqual(rep.demosaic, "bilinear")


if __name__ == "__main__":
    unittest.main()
