"""``lens_profiles``' vignetting (lensfun's master branch) against lensfun's latest release, 0.3.4.

``tools/lensfun_vignetting_released_check.py`` explains the identity: 0.3.4 measures the ``pa`` radius by
``hypot(w - 1, h - 1)`` where master uses ``hypot(w, h)``, so the release's gain is ours with the scale times
``hypot(w, h) / hypot(w - 1, h - 1)``. These tests write v0.3.4's pipeline out step by step (``modifier.cpp``
constructor, ``AddColorCallbackVignetting``, ``ApplyColorModification``, ``ModifyColor_DeVignetting_PA``) and
check the tool's helpers against it. With lensfunpy installed (it bundles liblensfun 0.3.4) the last test runs
the real library on a lens from its database.
"""

from __future__ import annotations

import importlib.util
import math
import os
import unittest

from shootflow import dng_opcodes as do
from shootflow import lens_profiles as lp
from test_lens_vignetting import database

try:
    import numpy as np

    HAVE_NUMPY = True
except ImportError:  # pragma: no cover - optional
    HAVE_NUMPY = False

try:
    import lensfunpy

    HAVE_LENSFUNPY = True
except ImportError:  # pragma: no cover - optional
    HAVE_LENSFUNPY = False

TOOL = os.path.join(os.path.dirname(__file__), "..", "tools", "lensfun_vignetting_released_check.py")


def tool():
    spec = importlib.util.spec_from_file_location("lensfun_vignetting_released_check", TOOL)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def gain_034(terms, calib_crop, calib_aspect, crop, width, height, x, y):
    """liblensfun 0.3.4's devignetting multiplier at pixel (x, y), written out from its source, in float64."""

    W = float(width - 1 if width >= 2 else 1)
    H = float(height - 1 if height >= 2 else 1)
    size = min(W, H)
    image_aspect = max(W, H) / min(W, H)
    arc = math.sqrt(calib_aspect * calib_aspect + 1.0)  # AspectRatioCorrection
    cc = 1.0 / math.sqrt(image_aspect * image_aspect + 1.0) * calib_crop / crop * arc
    norm = 2.0 / size * cc
    cx, cy = W / size * cc, H / size * cc
    xn, yn = (x * norm - cx) / arc, (y * norm - cy) / arc  # ApplyColorModification, then param[4] = 1 / ARC
    r2 = xn * xn + yn * yn
    return 1.0 / (1.0 + terms[0] * r2 + terms[1] * r2 * r2 + terms[2] * r2 ** 3)


@unittest.skipUnless(HAVE_NUMPY, "numpy not installed")
class Identity(unittest.TestCase):
    def setUp(self):
        self.t = tool()
        self.lens = database().lenses[0]  # Vlens 18-55mm, calibrated at crop 1.5, aspect 1.5

    def test_released_scale_is_the_034_pipeline(self):
        for w, h, crop in ((600, 400, 1.5), (400, 600, 1.5), (1200, 900, 2.25), (7, 5, 1.6)):
            vig, cs = lp.interpolate_vignetting(self.lens, crop, 24.0, 4.0, 10.0)
            s3 = self.t.released_scale(cs, crop, w, h)
            for x, y in ((0, 0), (w - 1, h - 1), (w // 2, 0), (0, h // 3), (w // 2, h // 2), (w // 3, 2 * h // 3)):
                want = gain_034(vig.terms, cs.crop, cs.aspect, crop, w, h, x, y)
                got = self.t.exact_gain(vig.terms, s3, w, h, np.array([float(x)]), np.array([float(y)]))[0]
                self.assertAlmostEqual(got, want, places=12, msg=(w, h, crop, x, y))

    def test_master_scale_differs_by_the_pixel_unit(self):
        # The point of the identity: master's unit alone is off at the corner by more than rounding.
        w, h = 600, 400
        vig, cs = lp.interpolate_vignetting(self.lens, 1.5, 18.0, 3.5, 10.0)
        sm = lp.vignetting_scale(cs, 1.5, w, h)
        master = self.t.exact_gain(vig.terms, sm, w, h, np.array([0.0]), np.array([0.0]))[0]
        release = gain_034(vig.terms, cs.crop, cs.aspect, 1.5, w, h, 0, 0)
        self.assertGreater(abs(master / release - 1.0), 1e-4)

    def test_float32_loop_tracks_float64(self):
        w, h = 600, 400
        vig, cs = lp.interpolate_vignetting(self.lens, 1.5, 18.0, 3.5, 10.0)
        s3 = self.t.released_scale(cs, 1.5, w, h)
        row = self.t.float32_row(vig.terms, s3, w, h, 0)
        exact = self.t.exact_gain(vig.terms, s3, w, h, np.arange(w, dtype=float), np.zeros(w))
        self.assertLess(float(np.max(np.abs(row / exact - 1.0))), 1e-4)

    def test_opcode_gain_matches_dng_opcodes(self):
        vc = lp.build_vignette(self.lens, 18.0, 1.5, 300, 200, 3.5, 10.0)
        xs = np.arange(300, dtype=float)
        g = self.t.opcode_gain(vc.opcode, 300, 200, xs, 17.0)
        for x in (0, 1, 150, 299):
            self.assertAlmostEqual(g[x], do.vignette_gain(vc.opcode, float(x), 17.0, 300, 200), places=12)

    def test_points_include_both_midpoints(self):
        cs = self.lens.calibrations[0]
        pts = self.t.points(cs)
        self.assertIn((18.0, math.sqrt(3.5 * 8.0), 10.0, True), pts)  # aperture midpoint
        self.assertEqual(sum(1 for p in pts if not p[3]), 5)  # every calibration point, as is
        two = lp.CalibrationSet(1.0, 1.5, vignetting=[lp.Vignetting(f, 4.0, 10.0, (-0.1, 0, 0)) for f in (18.0, 55.0)])
        self.assertIn((36.5, 4.0, 10.0, True), self.t.points(two))  # focal midpoint at one aperture and distance


@unittest.skipUnless(HAVE_NUMPY and HAVE_LENSFUNPY, "lensfunpy not installed")
class RealLibrary(unittest.TestCase):
    def test_one_bundled_lens(self):
        t = tool()
        db_dir = os.path.join(os.path.dirname(lensfunpy.__file__), "db_files")
        ours = lp.load_db(db_dir)
        ldb = lensfunpy.Database(
            paths=sorted(os.path.join(db_dir, f) for f in os.listdir(db_dir) if f.endswith(".xml")),
            load_common=False,
            load_bundled=False,
        )
        L = next(ln for ln in ldb.lenses if ln.model == "Canon EF 100-200mm f/4.5A")
        lens = next(ln for ln in ours.lenses if ln.name == L.model)
        W, H = 600, 400
        cs0 = next(c for c in lens.calibrations if c.vignetting)
        v = cs0.vignetting[0]
        mod = lensfunpy.Modifier(L, cs0.crop, W, H)
        mod.initialize(v.focal, v.aperture, v.distance, scale=1.0, pixel_format=np.float32,
                       flags=lensfunpy.ModifyFlags.VIGNETTING)
        img = np.ones((H, W, 3), np.float32)
        self.assertTrue(mod.apply_color_modification(img))
        vig, cs = lp.interpolate_vignetting(lens, cs0.crop, v.focal, v.aperture, v.distance)
        s3 = t.released_scale(cs, cs0.crop, W, H)
        for y in (0, 133, 399):
            ex = t.exact_gain(vig.terms, s3, W, H, np.arange(W, dtype=float), np.full(W, float(y)))
            self.assertLess(float(np.max(np.abs(img[y, :, 0] / ex - 1.0))), 1e-5)


if __name__ == "__main__":
    unittest.main()
