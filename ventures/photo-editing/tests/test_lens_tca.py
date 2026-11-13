"""Lateral colour (lensfun TCA) composed onto the distortion in ``shootflow.lens_profiles``, and the
Canon maker-note lens name.

Lensfun runs TCA after distortion, on the distorted point, for red and blue only
(``lfModifier::ApplySubpixelGeometryDistortion``: coordinate callbacks, then subpixel callbacks;
``ModifyCoord_TCA_Poly3``: ``R_d = R_u (b R_u^2 + c R_u + v)``; ``ModifyCoord_TCA_Linear``: ``R_u k``;
``rescale_polynomial_coefficients`` in mod-subpix.cpp scales ``c`` by ``hugin_scaling`` and ``b`` by its
square). ``lensfun_rgb_source`` writes that pipeline out step by step in lensfun's coordinates; the
module's three-plane WarpRectilinear2 is checked against it. The database is a small XML with made-up
numbers (no lensfun data is vendored).
"""

from __future__ import annotations

import math
import os
import random
import tempfile
import unittest

from shootflow import dng_opcodes as do
from shootflow import lens_profiles as lp
from shootflow import raw_develop as rd
from test_cr2 import make_cr2
from test_dng_opcodes import HAVE_NUMPY, list_tag
from test_raw_develop import make_dng, patch_sensor

XML = """<lensdatabase version="2">
  <mount><name>T Mount</name></mount>
  <camera><maker>Tcam</maker><model>Tcam One</model><mount>T Mount</mount><cropfactor>1.6</cropfactor></camera>
  <lens>
    <maker>Tlens</maker><model>Tlens 17-70mm f/2.8-4 Macro</model><mount>T Mount</mount><cropfactor>1.5</cropfactor>
    <calibration>
      <distortion model="ptlens" focal="17" a="0.011" b="-0.038" c="0.015"/>
      <distortion model="ptlens" focal="28" a="0.003" b="-0.010" c="0.002"/>
      <distortion model="ptlens" focal="50" a="0.001" b="0.005" c="-0.004"/>
      <distortion model="ptlens" focal="70" a="0.0004" b="0.008" c="-0.003"/>
      <tca model="poly3" focal="17" vr="1.0005" vb="0.9996" cr="0.00012" cb="-0.00009" br="-0.00025" bb="0.00018"/>
      <tca model="poly3" focal="28" vr="1.0003" vb="0.9998" cr="0.00006" cb="-0.00004" br="-0.00012" bb="0.00009"/>
      <tca model="poly3" focal="50" vr="1.0001" vb="0.9999" cr="0.00002" cb="0.00001" br="-0.00005" bb="0.00004"/>
      <tca model="poly3" focal="70" vr="1.0000" vb="1.0001" br="-0.00002" bb="0.00002"/>
    </calibration>
  </lens>
  <lens>
    <maker>Tlens</maker><model>Tlens 35mm f/2</model><mount>T Mount</mount><cropfactor>1.0</cropfactor>
    <aspect-ratio>4:3</aspect-ratio>
    <calibration>
      <distortion model="poly5" focal="35" k1="-0.02" k2="0.006"/>
      <tca model="linear" focal="35" kr="1.0004" kb="0.9997"/>
    </calibration>
  </lens>
  <lens>
    <maker>Tlens</maker><model>Tlens 24mm f/2.8</model><mount>T Mount</mount><cropfactor>1.0</cropfactor>
    <calibration><distortion model="poly3" focal="24" k1="-0.02"/></calibration>
  </lens>
</lensdatabase>
"""


def database():
    d = tempfile.mkdtemp()
    with open(os.path.join(d, "t.xml"), "w") as fh:
        fh.write(XML)
    return lp.load_db(d)


def lensfun_rgb_source(dist, tca, cal_crop, cal_aspect, img_crop, x, y, w, h, plane, zoom=1.0, real_focal=31.0):
    """Lensfun's source point for pixel (x, y) of a colour plane (0 red, 1 green, 2 blue)."""

    Wd, Hd = float(w - 1), float(h - 1)
    norm = math.hypot(36.0, 24.0) / img_crop / math.hypot(Wd + 1, Hd + 1) / real_focal
    cx, cy = Wd / 2 * norm, Hd / 2 * norm
    X, Y = (x * norm - cx) / zoom, (y * norm - cy) / zoom  # ModifyCoord_Scale (priority 100) first
    hs = real_focal / (math.hypot(36.0, 24.0) / cal_crop / math.hypot(cal_aspect, 1.0) / 2.0)
    r = math.hypot(X, Y)
    if dist.model == "ptlens":
        a, b, c = dist.terms
        d = 1 - a - b - c
        poly = a * hs**3 / d**4 * r**3 + b * hs**2 / d**3 * r**2 + c * hs / d**2 * r + 1
    elif dist.model == "poly3":
        k1 = dist.terms[0]
        poly = k1 * hs**2 / (1 - k1) ** 3 * r * r + 1
    else:
        k1, k2 = dist.terms[:2]
        poly = 1 + k1 * hs**2 * r * r + k2 * hs**4 * r**4
    X, Y = X * poly, Y * poly
    if tca is not None and plane != 1:
        vr, vb, cr, cb, br, bb = tca.terms
        v, c, b = (vr, cr, br) if plane == 0 else (vb, cb, bb)
        r = math.hypot(X, Y)
        p2 = b * hs * hs * r * r + c * hs * r + v
        X, Y = X * p2, Y * p2
    return (X + cx) / norm, (Y + cy) / norm


class TcaReading(unittest.TestCase):
    def test_tca_is_read_with_lensfuns_defaults(self):
        db = database()
        zoom = db.lenses[0]
        self.assertEqual(len(zoom.calibrations[0].tca), 4)
        self.assertEqual(zoom.calibrations[0].tca[3].terms, (1.0, 1.0001, 0.0, 0.0, -0.00002, 0.00002))
        self.assertEqual(db.lenses[1].calibrations[0].tca[0].terms, (1.0004, 0.9997, 0.0, 0.0, 0.0, 0.0))

    def test_interpolation_scales_all_but_v_by_focal(self):
        lens = database().lenses[0]
        f = 35.0
        got = lp.interpolate_tca(lens, 1.6, f)
        t = (f - 28.0) / (50.0 - 28.0)
        cals = lens.calibrations[0].tca  # 17, 28, 50, 70
        for i in range(6):
            sc = [1.0] * 4 if i < 2 else [c.focal for c in cals]
            y = [c.terms[i] * s for c, s in zip(cals, sc)]
            want = lp.hermite(y[0], y[1], y[2], y[3], t) / (1.0 if i < 2 else f)
            self.assertAlmostEqual(got.terms[i], want, places=15)

    def test_exact_and_outside(self):
        lens = database().lenses[0]
        self.assertEqual(lp.interpolate_tca(lens, 1.6, 28.0).terms[0], 1.0003)
        self.assertEqual(lp.interpolate_tca(lens, 1.6, 10.0).terms, lens.calibrations[0].tca[0].terms)
        self.assertIsNone(lp.interpolate_tca(database().lenses[2], 1.0, 24.0))


class TcaWarp(unittest.TestCase):
    def setUp(self):
        self.db = database()
        self.rng = random.Random(3)

    def check(self, lens, focal, crop, w, h, fill=False):
        corr = lp.build_warp(lens, focal, crop, w, h, fill=fill)
        dist = lp.interpolate_distortion(lens, crop, focal)[0]
        tca = lp.interpolate_tca(lens, crop, focal)
        cs = lens.calibrations[0]
        pts = [(0, 0), (w - 1, h - 1), (w - 1, 0), (0, h // 2)] + [(self.rng.randrange(w), self.rng.randrange(h)) for _ in range(50)]
        worst = 0.0
        for x, y in pts:
            for p in range(3):
                gx, gy = do.warp_source(corr.warp, p, float(x), float(y), w, h)
                lx, ly = lensfun_rgb_source(dist, tca, cs.crop, cs.aspect, crop, x, y, w, h, p, zoom=corr.scale)
                worst = max(worst, abs(gx - lx), abs(gy - ly))
        self.assertLess(worst, 1e-7)
        return corr

    def test_ptlens_with_poly3_tca_interpolated(self):
        corr = self.check(self.db.lenses[0], 22.0, 1.6, 640, 427)
        self.assertEqual(len(corr.warp.terms), 3)
        self.assertNotEqual(corr.warp.terms[0], corr.warp.terms[1])
        self.assertIn("lateral colour poly3", corr.notes[0])

    def test_with_the_fill_zoom(self):
        corr = self.check(self.db.lenses[0], 17.0, 1.5, 600, 400, fill=True)
        self.assertNotEqual(corr.scale, 1.0)

    def test_poly5_with_linear_tca(self):
        self.check(self.db.lenses[1], 35.0, 1.0, 400, 300)

    def test_red_and_blue_differ_and_green_is_the_distortion_alone(self):
        lens = self.db.lenses[0]
        with_tca = lp.build_warp(lens, 17.0, 1.6, 600, 400, fill=False)
        without = lp.build_warp(lens, 17.0, 1.6, 600, 400, fill=False, tca=False)
        self.assertEqual(len(without.warp.terms), 1)
        self.assertEqual(with_tca.warp.terms[1], without.warp.terms[0])
        r = do.warp_source(with_tca.warp, 0, 0.0, 0.0, 600, 400)
        b = do.warp_source(with_tca.warp, 2, 0.0, 0.0, 600, 400)
        self.assertGreater(math.hypot(r[0] - b[0], r[1] - b[1]), 0.01)

    def test_lens_without_tca_gives_one_plane(self):
        self.assertEqual(len(lp.build_warp(self.db.lenses[2], 24.0, 1.0, 300, 200).warp.terms), 1)

    def test_fill_keeps_every_plane_inside(self):
        w, h = 600, 400
        corr = lp.build_warp(self.db.lenses[0], 17.0, 1.5, w, h)
        for p in range(3):
            for x, y in [(0, 0), (w - 1, 0), (w // 2, 0), (0, h // 2), (w - 1, h - 1)]:
                sx, sy = do.warp_source(corr.warp, p, float(x), float(y), w, h)
                self.assertTrue(-1e-6 <= sx <= w - 1 + 1e-6 and -1e-6 <= sy <= h - 1 + 1e-6, (p, x, y, sx, sy))


class TcaDevelop(unittest.TestCase):
    W, H = 48, 32

    def test_develop_runs_the_three_plane_warp_both_engines(self):
        db = database()
        info = lp.ShotInfo("Tcam", "Tcam One", "Tlens 17-70mm f/2.8-4 Macro", None, 17.0, None)
        corr = lp.correction_for(db, info, self.W, self.H)
        tag = list_tag([(do.WARP_RECTILINEAR_2, 0, warp_bytes(corr.warp))], do.TAG_OPCODE_LIST_3)
        sensor = patch_sensor(self.W, self.H)
        for engine in ["python"] + (["numpy"] if HAVE_NUMPY else []):
            a = rd.develop(rd.parse_raw(make_dng(sensor, self.W, self.H)), rd.DevelopSettings(engine=engine, lens_db=db, lens_name=info.lens, lens_focal=17.0, lens_crop=1.6))
            b = rd.develop(rd.parse_raw(make_dng(sensor, self.W, self.H, extra_raw_tags=[tag])), rd.DevelopSettings(engine=engine))
            self.assertEqual(bytes(a[2]), bytes(b[2]), engine)
            self.assertTrue(any("lateral colour poly3" in n for n in a[3].notes))
            c = rd.develop(rd.parse_raw(make_dng(sensor, self.W, self.H)), rd.DevelopSettings(engine=engine, lens_db=db, lens_name=info.lens, lens_focal=17.0, lens_crop=1.6, lens_tca=False))
            self.assertNotEqual(bytes(a[2]), bytes(c[2]))


def warp_bytes(wp):
    import struct

    out = struct.pack(">I", len(wp.terms))
    for t in wp.terms:
        out += struct.pack(">19d", *t)
    return out + struct.pack(">2d", wp.cx, wp.cy) + struct.pack(">I", 1 if wp.reciprocal else 0)


class CanonMakerNoteLens(unittest.TestCase):
    def test_lens_name_from_the_maker_note_when_exif_has_none(self):
        blob, _ = make_cr2(lens_name="EF50mm f/1.2L USM")
        raw = rd.parse_raw(blob)
        info = lp.shot_info(raw.ifd0, raw.exif)
        self.assertEqual(info.lens, "EF50mm f/1.2L USM")

    def test_no_maker_note_name_leaves_it_empty(self):
        blob, _ = make_cr2()
        raw = rd.parse_raw(blob)
        self.assertIsNone(lp.shot_info(raw.ifd0, raw.exif).lens)


if __name__ == "__main__":
    unittest.main()
