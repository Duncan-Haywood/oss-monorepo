"""Tests for ``shootflow.lens_profiles``: lensfun database lens correction as a WarpRectilinear2.

The database here is a small file in lensfun's XML format with made-up numbers (no lensfun data is
copied). Lensfun's own pipeline (libs/lensfun: ``lfModifier`` constructor, ``rescale_polynomial_coefficients``,
``ModifyCoord_Dist_PTLens`` / ``_Poly3`` / ``_Poly5``, ``InterpolateDistortion`` and ``_lf_interpolate``) is
written out again below, in its own coordinates (units of the focal length, pixel centres at whole
numbers), and the module's warp is checked against it point by point.
"""

from __future__ import annotations

import math
import os
import struct
import tempfile
import unittest

from shootflow import dng_opcodes as do
from shootflow import lens_profiles as lp
from shootflow import raw_develop as rd
from test_dng_opcodes import HAVE_NUMPY, list_tag
from test_raw_develop import make_dng, patch_sensor

DB_XML = """<lensdatabase version="2">
    <mount><name>Test Mount</name><compat>Old Mount</compat></mount>
    <mount><name>Fixed Body</name></mount>
    <camera><maker>Testcam</maker><model>Testcam X1</model><mount>Test Mount</mount><cropfactor>1.5</cropfactor></camera>
    <camera><maker>Testcam</maker><model>Testcam Full</model><mount>Test Mount</mount><cropfactor>1.0</cropfactor></camera>
    <camera><maker>Testcam</maker><model>Testcam Compact</model><mount>Fixed Body</mount><cropfactor>2.7</cropfactor></camera>
    <lens>
        <maker>Testcam</maker>
        <model>Testcam TC 18-55mm f/3.5-5.6 IS</model>
        <mount>Test Mount</mount>
        <cropfactor>1.5</cropfactor>
        <calibration>
            <distortion model="ptlens" focal="18" a="0.012" b="-0.045" c="0.003"/>
            <distortion model="ptlens" focal="24" a="0.004" b="-0.02" c="0.001"/>
            <distortion model="ptlens" focal="35" a="0.001" b="0.004" c="-0.002"/>
            <distortion model="ptlens" focal="55" a="-0.002" b="0.011" c="0.0"/>
        </calibration>
    </lens>
    <lens>
        <maker>Testcam</maker>
        <model>Testcam TC 50mm f/1.8</model>
        <mount>Old Mount</mount>
        <cropfactor>1.0</cropfactor>
        <aspect-ratio>4:3</aspect-ratio>
        <calibration>
            <distortion model="poly3" focal="50" k1="0.012"/>
        </calibration>
    </lens>
    <lens>
        <maker>Othermaker</maker>
        <model>Other 50mm f/1.8</model>
        <mount>Elsewhere</mount>
        <cropfactor>1.0</cropfactor>
        <calibration><distortion model="poly5" focal="50" k1="-0.03" k2="0.004"/></calibration>
    </lens>
    <lens>
        <maker>Testcam</maker>
        <model>Testcam Compact 6-24mm</model>
        <model lang="en">fixed lens</model>
        <mount>Fixed Body</mount>
        <cropfactor>2.7</cropfactor>
        <calibration>
            <distortion model="ptlens" focal="6" a="0.02" b="-0.06" c="0.01"/>
            <distortion model="ptlens" focal="24" a="0.0" b="0.01" c="0.0"/>
        </calibration>
    </lens>
</lensdatabase>
"""


def db():
    d = tempfile.mkdtemp()
    with open(os.path.join(d, "test.xml"), "w") as fh:
        fh.write(DB_XML)
    return lp.load_db(d)


def lensfun_source(model, terms, cal_crop, cal_aspect, img_crop, focal, x, y, w, h):
    """Where lensfun's distortion correction reads output pixel (x, y) from, in its own coordinates."""

    # lfModifier: Width/Height between pixel centres; NormScale from the crop factor and the pixel diagonal.
    W, H = w - 1.0, h - 1.0
    norm = math.hypot(36.0, 24.0) / img_crop / math.hypot(W + 1.0, H + 1.0) / focal
    cx, cy = W / 2.0 * norm, H / 2.0 * norm
    xn, yn = x * norm - cx, y * norm - cy
    # rescale_polynomial_coefficients: Hugin's r = 1 at half the calibration sensor's height.
    hugin = focal / (math.hypot(36.0, 24.0) / cal_crop / math.hypot(cal_aspect, 1.0) / 2.0)
    ru2 = xn * xn + yn * yn
    ru = math.sqrt(ru2)
    if model == "ptlens":
        a, b, c = terms
        d = 1 - a - b - c
        a_, b_, c_ = a * hugin**3 / d**4, b * hugin**2 / d**3, c * hugin / d**2
        k = a_ * ru2 * ru + b_ * ru2 + c_ * ru + 1
    elif model == "poly3":
        k1 = terms[0] * hugin**2 / (1 - terms[0]) ** 3
        k = k1 * ru2 + 1
    else:
        k = 1 + terms[0] * hugin**2 * ru2 + terms[1] * hugin**4 * ru2 * ru2
    return (xn * k + cx) / norm, (yn * k + cy) / norm


class WordTests(unittest.TestCase):
    def test_split_follows_lensfun(self):
        # Letters, digit runs (with dots) and punctuation runs are words; a lone "f" or lone mark is dropped.
        self.assertEqual(lp.split_words("EF24-105mm f/4L IS USM"), sorted(["ef", "24", "105", "mm", "4", "l", "is", "usm"]))
        self.assertEqual(lp.split_words("Summilux 1:1.4/35 ASPH."), sorted(["summilux", "1", "1.4", "35", "asph"]))
        self.assertEqual(lp.split_words("18.0-46.0 mm"), ["18", "46", "mm"])  # a trailing ".0" is stripped
        self.assertIn("+", lp.split_words("Lens + 1.4x"))  # "+" and "*" are kept

    def test_every_pattern_word_must_match(self):
        pattern = lp.split_words("EF 50mm f/1.8")
        self.assertEqual(lp.fuzzy_score(pattern, "Canon EF 50mm f/1.8 II"), 200 * 4 // (4 + 6))
        self.assertEqual(lp.fuzzy_score(pattern, "Canon EF 50mm f/1.4"), 0)
        self.assertEqual(lp.fuzzy_score(lp.split_words(""), "anything"), 0)

    def test_numbers_only_is_not_specific(self):
        self.assertFalse(lp.specific("105mm"))
        self.assertFalse(lp.specific("24-70mm"))
        self.assertTrue(lp.specific("EF100-400mm f/4.5-5.6L IS USM"))


class MatchTests(unittest.TestCase):
    def setUp(self):
        self.db = db()

    def test_camera_and_mount(self):
        cam = lp.find_camera(self.db, "TESTCAM", "testcam  x1")
        self.assertEqual((cam.mount, cam.crop), ("Test Mount", 1.5))
        hits = lp.find_lenses(self.db, "TC 18-55mm f/3.5-5.6 IS", cam)
        self.assertEqual(hits[0][1].name, "Testcam TC 18-55mm f/3.5-5.6 IS")
        # A lens on a compatible mount is found; one on an unrelated mount is not.
        full = lp.find_camera(self.db, "Testcam", "Testcam Full")
        names = [h[1].name for h in lp.find_lenses(self.db, "50mm f/1.8", full)]
        self.assertEqual(names, ["Testcam TC 50mm f/1.8"])

    def test_crop_rule(self):
        # A full-frame camera cannot use a lens calibrated only on a 1.5x crop (camera crop < 0.96 x calibration's).
        full = lp.find_camera(self.db, "Testcam", "Testcam Full")
        self.assertEqual(lp.find_lenses(self.db, "TC 18-55mm", full), [])

    def test_fixed_lens(self):
        cam = lp.find_camera(self.db, "Testcam", "Testcam Compact")
        self.assertEqual(lp.fixed_lens(self.db, cam).name, "Testcam Compact 6-24mm")
        self.assertIsNone(lp.fixed_lens(self.db, lp.find_camera(self.db, "Testcam", "Testcam X1")))


class InterpolationTests(unittest.TestCase):
    def setUp(self):
        self.lens = lp.find_lenses(db(), "TC 18-55mm", crop=1.5)[0][1]

    def test_hermite_ends_and_lines(self):
        self.assertEqual(lp.hermite(None, 2.0, 5.0, None, 0.0), 2.0)
        self.assertEqual(lp.hermite(None, 2.0, 5.0, None, 1.0), 5.0)
        for t in (0.1, 0.5, 0.9):  # evenly spaced points on a line stay on it
            self.assertAlmostEqual(lp.hermite(1.0, 2.0, 3.0, 4.0, t), 2.0 + t)

    def test_exact_and_outside(self):
        d, _ = lp.interpolate_distortion(self.lens, 1.5, 24.0)
        self.assertEqual(d.terms, (0.004, -0.02, 0.001))
        self.assertEqual(lp.interpolate_distortion(self.lens, 1.5, 10.0)[0].focal, 18.0)
        self.assertEqual(lp.interpolate_distortion(self.lens, 1.5, 70.0)[0].focal, 55.0)

    def test_between_follows_lensfun(self):
        # 30 mm: spline[0..3] are 18, 24, 35, 55; terms x focal through _lf_interpolate, divided by 30.
        d, _ = lp.interpolate_distortion(self.lens, 1.5, 30.0)
        cal = {18: (0.012, -0.045, 0.003), 24: (0.004, -0.02, 0.001), 35: (0.001, 0.004, -0.002), 55: (-0.002, 0.011, 0.0)}
        t = (30 - 24) / (35 - 24)
        for i in range(3):
            y1, y2, y3, y4 = (cal[f][i] * f for f in (18, 24, 35, 55))
            tg2, tg3 = (y3 - y1) * 0.5, (y4 - y2) * 0.5
            want = ((2 * t**3 - 3 * t**2 + 1) * y2 + (t**3 - 2 * t**2 + t) * tg2 + (-2 * t**3 + 3 * t**2) * y3
                    + (t**3 - t**2) * tg3) / 30
            self.assertAlmostEqual(d.terms[i], want, places=15)
        # 20 mm: no calibration below 18, so the lower tangent is the chord's.
        d, _ = lp.interpolate_distortion(self.lens, 1.5, 20.0)
        t = (20 - 18) / 6
        y1, y2, y3 = (cal[f][1] * f for f in (18, 24, 35))
        tg2, tg3 = y2 - y1, (y3 - y1) * 0.5
        want = ((2 * t**3 - 3 * t**2 + 1) * y1 + (t**3 - 2 * t**2 + t) * tg2 + (-2 * t**3 + 3 * t**2) * y2
                + (t**3 - t**2) * tg3) / 20
        self.assertAlmostEqual(d.terms[1], want, places=15)


class WarpTests(unittest.TestCase):
    def setUp(self):
        self.db = db()

    def check(self, lens_name, crop, focal, w, h, places=7):
        lens = lp.find_lenses(self.db, lens_name, crop=crop)[0][1]
        corr = lp.build_warp(lens, focal, crop, w, h, fill=False)
        dist, cs = lp.interpolate_distortion(lens, crop, focal)
        worst = 0.0
        for x, y in ((0, 0), (w - 1, h - 1), (w // 3, h // 5), (w - 7, 3), (w // 2, h // 2), (11, h // 2), (w - 1, 0)):
            sx, sy = do.warp_source(corr.warp, 0, x, y, w, h)
            lx, ly = lensfun_source(dist.model, dist.terms, cs.crop, cs.aspect, crop, focal, x, y, w, h)
            worst = max(worst, abs(sx - lx), abs(sy - ly))
        self.assertLess(worst, 10 ** -places, (lens_name, crop, focal))
        return corr

    def test_matches_lensfun_pipeline(self):
        self.check("TC 18-55mm", 1.5, 24.0, 6000, 4000)  # exact calibration
        self.check("TC 18-55mm", 1.5, 30.0, 6000, 4000)  # interpolated
        self.check("TC 18-55mm", 1.6, 18.0, 5184, 3456)  # camera crop differs from the calibration's
        self.check("TC 18-55mm", 1.5, 40.0, 4000, 6000)  # portrait frame
        self.check("TC 50mm", 1.0, 50.0, 6000, 4000)  # poly3, calibrated on a 4:3 sensor
        self.check("Other 50mm", 1.0, 50.0, 7952, 5304)  # poly5

    def test_focal_length_cancels(self):
        # The same nominal calibration at a different reported focal changes only the interpolation, not the frame.
        lens = lp.find_lenses(self.db, "TC 50mm", crop=1.0)[0][1]
        a = lp.build_warp(lens, 50.0, 1.0, 600, 400, fill=False).warp
        b = lp.build_warp(lens, 50.0, 1.0, 1200, 800, fill=False).warp
        self.assertAlmostEqual(do.warp_source(a, 0, 0, 0, 600, 400)[0] * 2, do.warp_source(b, 0, 0, 0, 1200, 800)[0], places=0)

    def test_fill_puts_the_border_just_inside(self):
        lens = lp.find_lenses(self.db, "TC 18-55mm", crop=1.5)[0][1]
        w, h = 600, 400
        for focal, zoom_in in ((18.0, False), (55.0, True)):  # barrel at 18 mm (zoom out), pincushion at 55 mm
            corr = lp.build_warp(lens, focal, 1.5, w, h, fill=True)
            self.assertEqual(corr.scale > 1.0, zoom_in, focal)
            worst_out, nearest = 0.0, math.inf
            for i in range(0, w, 7):
                for x, y in ((i, 0), (i, h - 1)):
                    sx, sy = do.warp_source(corr.warp, 0, x, y, w, h)
                    worst_out = max(worst_out, -sx, -sy, sx - (w - 1), sy - (h - 1))
                    nearest = min(nearest, sx, sy, w - 1 - sx, h - 1 - sy)
            self.assertLess(worst_out, 1e-3)
            self.assertLess(nearest, 0.05)  # tight: the zoom is no larger than it needs to be

    def test_correction_for_reads_the_tags(self):
        cam = lp.ShotInfo("Testcam", "Testcam X1", "TC 18-55mm f/3.5-5.6 IS", None, 35.0, None)
        corr = lp.correction_for(self.db, cam, 600, 400)
        self.assertEqual(corr.crop, 1.5)
        self.assertIn("calibrated at 35 mm", corr.notes[-1])
        compact = lp.ShotInfo("Testcam", "Testcam Compact", None, None, 12.0, None)
        corr = lp.correction_for(self.db, compact, 600, 400)
        self.assertIn("fixed-lens camera", corr.notes[0])
        # An unknown body: the crop factor from the 35 mm equivalent focal length.
        other = lp.ShotInfo("Nobody", "Body 9", "TC 18-55mm f/3.5-5.6 IS", None, 20.0, 30.0)
        corr = lp.correction_for(self.db, other, 600, 400)
        self.assertAlmostEqual(corr.crop, 1.5)
        with self.assertRaises(lp.LensProfileError):  # a name that is only a focal length
            lp.correction_for(self.db, lp.ShotInfo("Testcam", "Testcam X1", "35mm", None, 35.0, None), 600, 400)
        with self.assertRaises(lp.LensProfileError):  # no focal length
            lp.correction_for(self.db, lp.ShotInfo("Testcam", "Testcam X1", "TC 18-55mm", None, None, None), 600, 400)


def warp2_tag(kr):
    terms = tuple(kr) + (0.0, 0.0, 0.0, 1.0)
    params = struct.pack(">I", 1) + struct.pack(">19d", *terms) + struct.pack(">2d", 0.5, 0.5) + struct.pack(">I", 0)
    return list_tag([(do.WARP_RECTILINEAR_2, 0, params)], do.TAG_OPCODE_LIST_3)


class DevelopTests(unittest.TestCase):
    W, H = 48, 32

    def setUp(self):
        self.db = db()
        self.sensor = patch_sensor(self.W, self.H)

    def settings(self, **kw):
        return rd.DevelopSettings(engine="python", lens_db=self.db, lens_name="TC 18-55mm", lens_focal=18.0,
                                  lens_crop=1.5, **kw)

    def test_same_bytes_as_the_warp_written_into_the_file(self):
        lens = lp.find_lenses(self.db, "TC 18-55mm", crop=1.5)[0][1]
        warp = lp.build_warp(lens, 18.0, 1.5, self.W, self.H).warp
        a = rd.develop(rd.parse_raw(make_dng(self.sensor, self.W, self.H)), self.settings())
        b = rd.develop(rd.parse_raw(make_dng(self.sensor, self.W, self.H, extra_raw_tags=[warp2_tag(warp.terms[0][:15])])),
                       rd.DevelopSettings(engine="python"))
        self.assertEqual(a[2].tobytes(), b[2].tobytes())
        self.assertTrue(any(n.startswith("lens correction from lensfun: Testcam TC 18-55mm") for n in a[3].notes))
        plain = rd.develop(rd.parse_raw(make_dng(self.sensor, self.W, self.H)), rd.DevelopSettings(engine="python"))
        self.assertNotEqual(a[2].tobytes(), plain[2].tobytes())

    def test_the_files_own_warp_wins(self):
        blob = make_dng(self.sensor, self.W, self.H, extra_raw_tags=[warp2_tag((1.0,) + (0.0,) * 14)])
        got = rd.develop(rd.parse_raw(blob), self.settings())
        self.assertIn("lens database not used: the file carries its own lens warp", got[3].notes)
        # With the file's opcodes off, the database's correction runs instead.
        got = rd.develop(rd.parse_raw(blob), self.settings(opcodes=False))
        self.assertTrue(any(n.startswith("lens correction from lensfun") for n in got[3].notes))

    def test_unknown_lens_is_a_note_not_an_error(self):
        s = rd.DevelopSettings(engine="python", lens_db=self.db, lens_name="Nonexistent 99mm Zoom", lens_focal=18.0,
                               lens_crop=1.5)
        got = rd.develop(rd.parse_raw(make_dng(self.sensor, self.W, self.H)), s)
        self.assertTrue(any(n.startswith("no lens correction: no lens in the database matches") for n in got[3].notes))

    @unittest.skipUnless(HAVE_NUMPY, "numpy not installed")
    def test_numpy_gives_the_pure_bytes(self):
        blob = make_dng(self.sensor, self.W, self.H)
        a = rd.develop(rd.parse_raw(blob), self.settings())
        b = rd.develop(rd.parse_raw(blob), rd.DevelopSettings(engine="numpy", lens_db=self.db, lens_name="TC 18-55mm",
                                                              lens_focal=18.0, lens_crop=1.5))
        self.assertEqual(a[2].tobytes(), b[2].tobytes())


if __name__ == "__main__":
    unittest.main()
