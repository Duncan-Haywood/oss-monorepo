"""Vignetting (lensfun ``pa``) as a FixVignetteRadial in ``shootflow.lens_profiles``.

``lensfun_gain`` writes lensfun's devignetting out step by step in its own coordinates, from the sources
read for this (master, 2026-11-13): ``lfModifier::lfModifier`` (``NormScale = 43.27 / crop / hypot(W + 1,
H + 1) / real_focal`` with ``W = width - 1``; centre ``W / 2 * NormScale``), ``ApplyColorModification``
(``x * NormScale - CenterX``), ``rescale_polynomial_coefficients`` in mod-color.cpp (``k_i *=
hugin_scaling^(2i)``, ``hugin_scaling = real_focal / (43.27 / calibration crop / 2)``) and
``ModifyColor_DeVignetting_PA`` (the pixel is multiplied by ``1 / (1 + k1 r^2 + k2 r^4 + k3 r^6)``).
The interpolation is checked against inverse distance weighting worked by hand. The database is a
small XML with made-up numbers (no lensfun data is vendored).
"""

from __future__ import annotations

import math
import os
import tempfile
import unittest

from shootflow import dng_opcodes as do
from shootflow import lens_profiles as lp
from shootflow import raw_develop as rd
from test_dng_opcodes import HAVE_NUMPY, list_tag
from test_raw_develop import make_dng, patch_sensor

XML = """<lensdatabase version="2">
  <mount><name>V Mount</name></mount>
  <camera><maker>Vcam</maker><model>Vcam One</model><mount>V Mount</mount><cropfactor>1.5</cropfactor></camera>
  <lens>
    <maker>Vlens</maker><model>Vlens 18-55mm f/3.5-5.6</model><mount>V Mount</mount><cropfactor>1.5</cropfactor>
    <calibration>
      <distortion model="poly3" focal="18" k1="-0.03"/>
      <distortion model="poly3" focal="55" k1="0.01"/>
      <vignetting model="pa" focal="18" aperture="3.5" distance="10" k1="-0.50" k2="0.10" k3="-0.05"/>
      <vignetting model="pa" focal="18" aperture="8" distance="10" k1="-0.20" k2="0.02" k3="-0.01"/>
      <vignetting model="pa" focal="55" aperture="5.6" distance="10" k1="-0.30" k2="0.05" k3="-0.02"/>
      <vignetting model="pa" focal="55" aperture="11" distance="10" k1="-0.10" k2="0.01" k3="0"/>
      <vignetting model="pa" focal="18" aperture="3.5" distance="1000" k1="-0.52" k2="0.11" k3="-0.05"/>
    </calibration>
  </lens>
  <lens>
    <maker>Vlens</maker><model>Vlens 50mm f/1.8</model><mount>V Mount</mount><cropfactor>1.0</cropfactor>
    <calibration>
      <vignetting model="pa" focal="50" aperture="1.8" distance="1000" alpha1="-0.9" alpha2="0.4" alpha3="-0.1"/>
    </calibration>
  </lens>
  <lens>
    <maker>Vlens</maker><model>Vlens 8mm broken</model><mount>V Mount</mount><cropfactor>1.0</cropfactor>
    <focal value="8"/>
    <calibration>
      <distortion model="poly3" focal="8" k1="-0.01"/>
      <vignetting model="pa" focal="8" aperture="4" distance="1000" k1="-1.5" k2="0.2" k3="0"/>
    </calibration>
  </lens>
</lensdatabase>
"""

DIAG = math.hypot(36.0, 24.0)


def database():
    d = tempfile.mkdtemp()
    with open(os.path.join(d, "v.xml"), "w") as f:
        f.write(XML)
    return lp.load_db(d)


def lensfun_gain(terms, calib_crop, crop, w, h, x, y, real_focal=37.0):
    """Lensfun's devignetting multiplier at pixel (x, y), its pipeline written out."""

    W, H = float(w - 1), float(h - 1)
    norm = DIAG / crop / math.hypot(W + 1.0, H + 1.0) / real_focal
    cx, cy = W / 2.0 * norm, H / 2.0 * norm
    hs = real_focal / (DIAG / calib_crop / 2.0)
    k = [terms[0] * hs ** 2, terms[1] * hs ** 4, terms[2] * hs ** 6]
    xn, yn = x * norm - cx, y * norm - cy
    r2 = xn * xn + yn * yn
    return 1.0 / (1.0 + k[0] * r2 + k[1] * r2 * r2 + k[2] * r2 ** 3)


class Parse(unittest.TestCase):
    def test_terms_and_alpha_names(self):
        db = database()
        self.assertEqual(db.lenses[0].calibrations[0].vignetting[0].terms, (-0.5, 0.1, -0.05))
        self.assertEqual(db.lenses[1].calibrations[0].vignetting[0].terms, (-0.9, 0.4, -0.1))

    def test_focal_range_as_lensfun_guesses_it(self):
        db = database()
        self.assertEqual((db.lenses[0].min_focal, db.lenses[0].max_focal), (18.0, 55.0))  # from the name
        self.assertEqual((db.lenses[1].min_focal, db.lenses[1].max_focal), (50.0, 50.0))
        self.assertEqual((db.lenses[2].min_focal, db.lenses[2].max_focal), (8.0, 8.0))  # <focal value>

    def test_name_regexes(self):
        def rng(name, calib_focals=()):
            lens = lp.Lens(("M",), (name,), ("V Mount",), "rectilinear",
                           [lp.CalibrationSet(1.0, 1.5, [lp.Distortion(f, "poly3", (0, 0, 0)) for f in calib_focals])])
            import xml.etree.ElementTree as ET

            return lp.guess_focal_range(ET.fromstring("<lens/>"), lens)

        self.assertEqual(rng("Canon EF 70-200mm f/2.8L IS USM"), (70.0, 200.0))
        self.assertEqual(rng("smc PENTAX-DA 1:3.5-5.6 18-55mm AL"), (18.0, 55.0))
        self.assertEqual(rng("Nikkor 3.5-4.5/28-85"), (28.0, 85.0))
        # The name's range widened by a calibration outside it, as lensfun's loop does.
        self.assertEqual(rng("Tamron 17-50mm f/2.8", [16.0]), (16.0, 50.0))
        # A teleconverter's name is not read.
        self.assertEqual(rng("Kenko 1.4x Teleplus", [100.0]), (100.0, 100.0))


class Interpolate(unittest.TestCase):
    def setUp(self):
        self.db = database()
        self.lens = self.db.lenses[0]

    def test_exact_calibration_is_used_as_is(self):
        v, _ = lp.interpolate_vignetting(self.lens, 1.5, 18.0, 8.0, 10.0)
        self.assertEqual(v.terms, (-0.2, 0.02, -0.01))

    def test_inverse_distance_weighting_by_hand(self):
        focal, ap, dist = 30.0, 5.0, 10.0
        acc, total = [0.0, 0.0, 0.0], 0.0
        for v in self.lens.calibrations[0].vignetting:
            df = (v.focal - 18.0) / 37.0 - (focal - 18.0) / 37.0
            da = 4.0 / v.aperture - 4.0 / ap
            dd = 0.1 / v.distance - 0.1 / dist
            wgt = 1.0 / math.sqrt(df * df + da * da + dd * dd) ** 3.5
            acc = [a + wgt * t for a, t in zip(acc, v.terms)]
            total += wgt
        got, _ = lp.interpolate_vignetting(self.lens, 1.5, focal, ap, dist)
        for g, a in zip(got.terms, acc):
            self.assertAlmostEqual(g, a / total, places=12)

    def test_too_far_from_every_calibration_gives_none(self):
        # f/1 is 4/1 - 4/3.5 = 2.86 away on the aperture axis: lensfun refuses beyond 1.
        self.assertIsNone(lp.interpolate_vignetting(self.lens, 1.5, 18.0, 1.0, 10.0))

    def test_crop_rule(self):
        self.assertIsNone(lp.interpolate_vignetting(self.lens, 1.4, 18.0, 8.0, 10.0))  # 1.4 / 1.5 < 0.96
        self.assertIsNotNone(lp.interpolate_vignetting(self.lens, 2.0, 18.0, 8.0, 10.0))


class Gain(unittest.TestCase):
    def test_exact_polynomial_is_reproduced(self):
        # Lensfun's c is a polynomial; its inverse is not. With c = 1 the fit is the identity.
        k, err = lp.fit_vignette_radial((0.0, 0.0, 0.0), 1.0)
        self.assertTrue(all(abs(t) < 1e-12 for t in k))
        self.assertLess(err, 1e-12)

    def test_opcode_gain_matches_lensfun_pixel_by_pixel(self):
        db = database()
        for lens, focal, crop, ap, (w, h) in [
            (db.lenses[0], 18.0, 1.5, 3.5, (600, 400)),
            (db.lenses[0], 30.0, 1.5, 5.0, (450, 600)),  # interpolated, portrait
            (db.lenses[0], 55.0, 2.0, 11.0, (640, 480)),  # crop bigger than the calibration's, 4:3
            (db.lenses[1], 50.0, 1.0, 1.8, (300, 200)),  # alpha names, strong fall-off
        ]:
            vc = lp.build_vignette(lens, focal, crop, w, h, ap, 10.0)
            cs = lp.vignetting_set(lens, crop)
            worst = 0.0
            for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (0, h // 2), (w // 2, h // 2),
                         (w // 3, h // 5), (7, h - 3)]:
                want = lensfun_gain(vc.vignetting.terms, cs.crop, crop, w, h, x, y)
                got = do.vignette_gain(vc.opcode, float(x), float(y), w, h)
                worst = max(worst, abs(got / want - 1.0))
            self.assertLessEqual(worst, vc.max_error + 1e-12, (lens.name, focal))
            self.assertLess(worst, 0.01, (lens.name, focal))
            # The corner gain reported is lensfun's at the farthest pixel.
            self.assertAlmostEqual(vc.corner_gain, lensfun_gain(vc.vignetting.terms, cs.crop, crop, w, h, 0, 0), places=9)

    def test_a_calibration_that_goes_dark_is_refused(self):
        db = database()
        with self.assertRaises(lp.LensProfileError):
            lp.build_vignette(db.lenses[2], 8.0, 1.0, 300, 200, 4.0, 1000.0)
        info = lp.ShotInfo("Vcam", "Vcam One", "Vlens 8mm broken", None, 8.0, None, 4.0, None)
        corr = lp.correction_for(db, info, 300, 200, crop=1.0)
        self.assertIsNone(corr.vignette)
        self.assertIsNotNone(corr.warp)
        self.assertTrue(any("no vignetting correction" in n for n in corr.notes))


class Correction(unittest.TestCase):
    def setUp(self):
        self.db = database()

    def test_vignette_runs_before_the_warp(self):
        info = lp.ShotInfo("Vcam", "Vcam One", "Vlens 18-55mm f/3.5-5.6", None, 18.0, None, 3.5, 10.0)
        corr = lp.correction_for(self.db, info, 600, 400)
        ops = corr.opcodes()
        self.assertIsInstance(ops[0], do.VignetteRadial)
        self.assertIsInstance(ops[1], do.WarpRectilinear2)
        self.assertTrue(any("vignetting from lensfun at 18 mm f/3.5, subject distance 10 m from EXIF" in n for n in corr.notes))

    def test_no_fnumber_no_vignette(self):
        info = lp.ShotInfo("Vcam", "Vcam One", "Vlens 18-55mm f/3.5-5.6", None, 18.0, None)
        corr = lp.correction_for(self.db, info, 600, 400)
        self.assertIsNone(corr.vignette)
        self.assertTrue(any("no FNumber" in n for n in corr.notes))

    def test_distance_defaults_to_far(self):
        info = lp.ShotInfo("Vcam", "Vcam One", "Vlens 18-55mm f/3.5-5.6", None, 18.0, None, 3.5, None)
        corr = lp.correction_for(self.db, info, 600, 400)
        # 1000 m is the far calibration exactly.
        self.assertEqual(corr.vignette.vignetting.terms, (-0.52, 0.11, -0.05))
        self.assertTrue(any("1000 m assumed" in n for n in corr.notes))

    def test_vignetting_only_lens(self):
        info = lp.ShotInfo("Vcam", "Vcam One", "Vlens 50mm f/1.8", None, 50.0, None, 1.8, None)
        corr = lp.correction_for(self.db, info, 300, 200, crop=1.0)
        self.assertIsNone(corr.warp)
        self.assertEqual(len(corr.opcodes()), 1)

    def test_off_switch(self):
        info = lp.ShotInfo("Vcam", "Vcam One", "Vlens 18-55mm f/3.5-5.6", None, 18.0, None, 3.5, 10.0)
        self.assertIsNone(lp.correction_for(self.db, info, 600, 400, vignetting=False).vignette)


def vignette_bytes(vg):
    import struct

    return struct.pack(">7d", *vg.k, vg.cx, vg.cy)


class VignetteDevelop(unittest.TestCase):
    W, H = 48, 32

    def test_develop_equals_the_same_opcodes_written_into_the_dng(self):
        db = database()
        info = lp.ShotInfo("Vcam", "Vcam One", "Vlens 18-55mm f/3.5-5.6", None, 18.0, None, 3.5, 10.0)
        corr = lp.correction_for(db, info, self.W, self.H, crop=1.5)
        from test_lens_tca import warp_bytes

        tag = list_tag([(do.FIX_VIGNETTE_RADIAL, 0, vignette_bytes(corr.vignette.opcode)),
                        (do.WARP_RECTILINEAR_2, 0, warp_bytes(corr.warp))], do.TAG_OPCODE_LIST_3)
        sensor = patch_sensor(self.W, self.H)
        common = dict(lens_db=db, lens_name=info.lens, lens_focal=18.0, lens_crop=1.5, lens_aperture=3.5, lens_distance=10.0)
        for engine in ["python"] + (["numpy"] if HAVE_NUMPY else []):
            a = rd.develop(rd.parse_raw(make_dng(sensor, self.W, self.H)), rd.DevelopSettings(engine=engine, **common))
            b = rd.develop(rd.parse_raw(make_dng(sensor, self.W, self.H, extra_raw_tags=[tag])), rd.DevelopSettings(engine=engine))
            self.assertEqual(bytes(a[2]), bytes(b[2]), engine)
            self.assertTrue(any("vignetting from lensfun" in n for n in a[3].notes))
            c = rd.develop(rd.parse_raw(make_dng(sensor, self.W, self.H)), rd.DevelopSettings(engine=engine, lens_vignetting=False, **common))
            self.assertNotEqual(bytes(a[2]), bytes(c[2]))


if __name__ == "__main__":
    unittest.main()
