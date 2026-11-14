"""liblensfun 0.3.4's 16-bit and SIMD devignetting paths (``tools/lensfun_vignetting_paths_check.py``).

The model tests run with numpy alone; the last class needs lensfunpy (it bundles liblensfun 0.3.4) and calls
the library through ctypes with RGBA rows, which lensfunpy's own API does not accept.
"""

from __future__ import annotations

import importlib.util
import os
import sys
import unittest

from shootflow import lens_profiles as lp
from test_lens_vignetting import database

try:
    import numpy as np

    HAVE_NUMPY = True
except ImportError:  # pragma: no cover - optional
    HAVE_NUMPY = False

try:
    import lensfunpy  # noqa: F401

    HAVE_LENSFUNPY = True
except ImportError:  # pragma: no cover - optional
    HAVE_LENSFUNPY = False

TOOLS = os.path.join(os.path.dirname(__file__), "..", "tools")


def load(name):
    if TOOLS not in sys.path:
        sys.path.insert(0, TOOLS)
    spec = importlib.util.spec_from_file_location(name, os.path.join(TOOLS, name + ".py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@unittest.skipUnless(HAVE_NUMPY, "numpy not installed")
class Models(unittest.TestCase):
    def setUp(self):
        self.t = load("lensfun_vignetting_paths_check")
        self.r = load("lensfun_vignetting_released_check")
        self.lens = database().lenses[0]  # Vlens 18-55mm, terms (-0.5, 0.1, -0.05) at 18 mm f/3.5

    def case(self, w=602, h=401):
        vig, cs = lp.interpolate_vignetting(self.lens, 1.5, 18.0, 3.5, 10.0)
        return vig.terms, self.r.released_scale(cs, 1.5, w, h), w, h

    def test_u16_plain_truncates_to_1024ths_and_caps_at_31x(self):
        g = np.array([1.0, 1.0 + 0.9 / 1024, 1.0 + 1.0 / 1024, 2.5, 40.0], np.float32)
        out = self.t.u16_plain(g, 10000)
        self.assertEqual(int(out[0]), 10000)
        self.assertEqual(int(out[1]), 10000)  # 0.9/1024 of gain lost to truncation: about 9 steps
        self.assertEqual(int(out[2]), (10000 * 1025 + 512) >> 10)
        self.assertEqual(int(out[3]), 25000)
        self.assertEqual(int(out[4]), 65535)
        self.assertEqual(int(self.t.u16_plain(np.array([40.0], np.float32), 1000)[0]), 31000)  # capped at 31x

    def test_tolerance_grows_with_the_gain(self):
        self.assertEqual(self.t.sse2_tolerance(0.0, 8192), 9)  # one fraction unit (8 steps) plus rounding
        self.assertGreater(self.t.sse2_tolerance(8.0, 8192), self.t.sse2_tolerance(1.0, 8192))

    def test_fixed_loop_is_exact_to_one_fraction_unit(self):
        terms, s, w, h = self.case()
        v = 8192
        for y in (0, 200, 400):
            ex = self.r.exact_gain(terms, s, w, h, np.arange(w, dtype=float), np.full(w, float(y))) * v
            fixed = self.t.model_sse2_row(terms, s, w, h, y, v, released=False)
            self.assertLessEqual(float(np.max(np.abs(fixed - ex))), v / 1024 + 1, msg=y)

    def test_released_loop_lane_drift_grows_with_lane_and_along_the_row(self):
        terms, s, w, h = self.case()
        v = 8192
        ex = self.r.exact_gain(terms, s, w, h, np.arange(w, dtype=float), np.zeros(w)) * v
        rel = self.t.model_sse2_row(terms, s, w, h, 0, v) / ex - 1.0
        body = 4 * (w // 4)
        lane = [float(np.max(np.abs(rel[j:body:4]))) for j in range(4)]
        self.assertLess(lane[0], 1.5 / 1024)  # lane 0's r^2 is stepped correctly
        self.assertGreater(lane[1], 2 / 1024)
        self.assertGreater(lane[2], lane[1])
        self.assertGreater(lane[3], lane[2])
        # r^2 for lane j is short by 8 j p3^2 per loop of four pixels: so the lane-3 gap grows along the row
        self.assertGreater(abs(rel[body - 1]), abs(rel[w // 2 + 3]))

    def test_released_tail_is_far_outside_the_frame(self):
        terms, s, w, h = self.case()  # 602 = 4 * 150 + 2: two tail pixels per row
        v = 8192
        ex = self.r.exact_gain(terms, s, w, h, np.arange(w, dtype=float), np.full(w, 100.0)) * v
        rel = self.t.model_sse2_row(terms, s, w, h, 100, v)[600:] / ex[600:] - 1.0
        self.assertTrue(np.all(np.abs(rel) > 0.5), rel)
        fixed = self.t.model_sse2_row(terms, s, w, h, 100, v, released=False)[600:]
        self.assertLessEqual(float(np.max(np.abs(fixed - ex[600:]))), v / 1024 + 1)
        # a width that is a multiple of four has no tail
        terms4, s4, w4, h4 = self.case(600, 400)
        self.assertEqual(len(self.t.model_sse2_row(terms4, s4, w4, h4, 0, v)), 600)


@unittest.skipUnless(HAVE_NUMPY and HAVE_LENSFUNPY, "lensfunpy not installed")
class RealLibrary(unittest.TestCase):
    """The bundled liblensfun 0.3.4, RGBA rows through ctypes, on the Canon EF 100-200mm f/4.5A."""

    @classmethod
    def setUpClass(cls):
        cls.t = load("lensfun_vignetting_paths_check")
        cls.r = load("lensfun_vignetting_released_check")
        cls.lf = cls.t.Lensfun()
        cls.ptr = next(p for _, m, p in cls.lf.lenses if m == "Canon EF 100-200mm f/4.5A")
        ours = lp.load_db(cls.lf.db_dir)
        lens = next(ln for ln in ours.lenses if ln.name == "Canon EF 100-200mm f/4.5A")
        cls.cs0 = next(c for c in lens.calibrations if c.vignetting)
        v = cls.cs0.vignetting[0]
        cls.fad = (v.focal, v.aperture, v.distance)
        cls.W, cls.H = 602, 401
        vig, cs = lp.interpolate_vignetting(lens, cls.cs0.crop, *cls.fad)
        cls.terms, cls.s3 = vig.terms, cls.r.released_scale(cs, cls.cs0.crop, cls.W, cls.H)

    def row(self, y, value, dtype, ch, aligned=True):
        out, ok = self.lf.devignette_row(self.ptr, self.cs0.crop, self.W, self.H, *self.fad, y, value, dtype, ch,
                                         aligned=aligned)
        self.assertTrue(ok)
        return out

    def test_float_sse_matches_plain_but_scales_alpha(self):
        for y in (0, 200):
            plain = self.row(y, 1.0, np.float32, 3)
            sse = self.row(y, 1.0, np.float32, 4)
            ctrl = self.row(y, 1.0, np.float32, 4, aligned=False)
            self.assertLess(float(np.max(np.abs(sse[:, 0] / plain[:, 0] - 1.0))), 1e-4)
            self.assertTrue(np.array_equal(ctrl[:, 0], plain[:, 0]))
            self.assertTrue(np.all(ctrl[:, 3] == 1.0))  # the plain loop skips LF_CR_UNKNOWN
            self.assertGreater(float(sse[0, 3]), 1.01)  # the SSE loop multiplies it like a colour

    def test_u16_plain_is_the_model(self):
        plain = self.row(0, 1.0, np.float32, 3)
        u3 = self.row(0, 8192, np.uint16, 3)
        self.assertTrue(np.array_equal(u3[:, 0].astype(np.int64), self.t.u16_plain(plain[:, 0], 8192)))

    def test_sse2_is_the_model_with_both_faults(self):
        v = 8192
        for y in (0, 133, 400):
            u4 = self.row(y, v, np.uint16, 4)
            mod = self.t.model_sse2_row(self.terms, self.s3, self.W, self.H, y, v)
            gmax = float(np.max(self.row(y, 1.0, np.float32, 3)[:, 0]))
            self.assertLessEqual(int(np.max(np.abs(u4[:, 0].astype(np.int64) - mod))), self.t.sse2_tolerance(gmax, v),
                                 msg=y)
            ex = self.r.exact_gain(self.terms, self.s3, self.W, self.H, np.arange(self.W, dtype=float),
                                   np.full(self.W, float(y))) * v
            self.assertTrue(np.all(np.abs(u4[600:, 0] / ex[600:] - 1.0) > 0.5))  # the tail
            ctrl = self.row(y, v, np.uint16, 4, aligned=False)  # same pixels, plain loop
            self.assertTrue(np.array_equal(ctrl[:, 0].astype(np.int64),
                                           self.t.u16_plain(self.row(y, 1.0, np.float32, 3)[:, 0], v)))


if __name__ == "__main__":
    unittest.main()
