"""Canon lenses identified from the maker note's focal range and aperture when the file names none.

CameraSettings (maker note tag 0x0001) indexes 22 to 26, as Exiv2 and ExifTool number them, are checked on five
real bodies in ``eval/canon-lens-from-range-2026-11-14.md``; the files here are synthetic. The database is a
made-up file in lensfun's XML format (no lensfun data is copied).
"""

from __future__ import annotations

import os
import tempfile
import unittest

from shootflow import cr2
from shootflow import lens_profiles as lp
from shootflow import raw_develop as rd
from test_cr2 import make_cr2

DB_XML = """<lensdatabase version="2">
    <mount><name>Canon EF</name></mount>
    <mount><name>Canon EF-S</name><compat>Canon EF</compat></mount>
    <mount><name>Nikon F AF</name></mount>
    <camera><maker>Canon</maker><model>Canon EOS 5D Mark II</model><mount>Canon EF</mount><cropfactor>1.0</cropfactor></camera>
    <camera><maker>Canon</maker><model>Canon EOS 7D</model><mount>Canon EF-S</mount><cropfactor>1.6</cropfactor></camera>
    <lens><maker>Sigma</maker><model>Sigma 105mm f/2.8 EX DG Macro</model><mount>Canon EF</mount>
        <cropfactor>1.0</cropfactor><calibration><distortion model="poly3" focal="105" k1="0.004"/></calibration></lens>
    <lens><maker>Canon</maker><model>Canon EF 100mm f/2.8 Macro USM</model><mount>Canon EF</mount>
        <cropfactor>1.0</cropfactor><calibration><distortion model="poly3" focal="100" k1="0.002"/></calibration></lens>
    <lens><maker>Canon</maker><model>Canon EF 70-200mm f/4L USM</model><mount>Canon EF</mount>
        <cropfactor>1.0</cropfactor><calibration><distortion model="poly3" focal="70" k1="0.01"/>
        <distortion model="poly3" focal="200" k1="-0.01"/></calibration></lens>
    <lens><maker>Canon</maker><model>Canon EF 70-200mm f/2.8L USM</model><mount>Canon EF</mount>
        <cropfactor>1.0</cropfactor><calibration><distortion model="poly3" focal="70" k1="0.01"/>
        <distortion model="poly3" focal="200" k1="-0.01"/></calibration></lens>
    <lens><maker>Canon</maker><model>Canon EF 70-200mm f/2.8L IS USM</model><mount>Canon EF</mount>
        <cropfactor>1.0</cropfactor><calibration><distortion model="poly3" focal="70" k1="0.01"/>
        <distortion model="poly3" focal="200" k1="-0.01"/></calibration></lens>
    <lens><maker>Canon</maker><model>Canon EF 70-200mm f/2.8L IS USM + 1.4x extender</model><mount>Canon EF</mount>
        <cropfactor>1.0</cropfactor><calibration><distortion model="poly3" focal="98" k1="0.01"/></calibration></lens>
    <lens><maker>Canon</maker><model>Canon EF-S 18-55mm f/3.5-5.6 IS</model><mount>Canon EF-S</mount>
        <cropfactor>1.6</cropfactor><calibration><distortion model="poly3" focal="18" k1="-0.02"/>
        <distortion model="poly3" focal="55" k1="0.005"/></calibration></lens>
    <lens><maker>Nikon</maker><model>Nikkor AF 28-200mm f/3.5-5.6G IF-ED</model><mount>Nikon F AF</mount>
        <cropfactor>1.0</cropfactor><calibration><distortion model="poly3" focal="28" k1="-0.02"/></calibration></lens>
</lensdatabase>
"""


def make_db():
    d = tempfile.mkdtemp()
    with open(os.path.join(d, "canon.xml"), "w") as fh:
        fh.write(DB_XML)
    return lp.load_db(d)


def settings(long_f, short_f, aperture_code, lens_type=65535, units=1):
    cs = [92] + [0] * 45
    cs[22], cs[23], cs[24], cs[25], cs[26] = lens_type, long_f, short_f, units, aperture_code
    return cs


def hint_of(data):
    reader = rd._Reader(data)
    return cr2.lens_hint(reader, reader.read_ifd(reader.first_ifd_offset())[0])


class CanonEv(unittest.TestCase):
    def test_codes_from_real_files(self):
        # The five real bodies' MaxAperture codes and the f-numbers their lenses are marked with.
        for code, f in ((20, 1.2), (96, 2.8), (128, 4.0), (140, 4.5), (159, 5.6)):
            self.assertAlmostEqual(2 ** (cr2.canon_ev(code) / 2), f, delta=0.06, msg=code)

    def test_thirds_and_sign(self):
        self.assertAlmostEqual(cr2.canon_ev(0x20 + 0x0C), 1 + 1 / 3)
        self.assertAlmostEqual(cr2.canon_ev(0x20 + 0x14), 1 + 2 / 3)
        self.assertAlmostEqual(cr2.canon_ev(-(0x40 + 0x10)), -2.5)


class HintFromCr2(unittest.TestCase):
    def test_the_350d_layout(self):
        data, _ = make_cr2(camera_settings=settings(200, 28, 159))
        self.assertEqual(hint_of(data), rd.LensHint(28.0, 200.0, 5.6, None))

    def test_focal_units_and_lens_type(self):
        data, _ = make_cr2(camera_settings=settings(1700, 1000, 128, lens_type=160, units=100))
        self.assertEqual(hint_of(data), rd.LensHint(10.0, 17.0, 4.0, 160))

    def test_nothing_usable(self):
        self.assertIsNone(hint_of(make_cr2()[0]))  # no CameraSettings
        self.assertIsNone(hint_of(make_cr2(camera_settings=settings(200, 28, 159, units=0))[0]))
        self.assertIsNone(hint_of(make_cr2(camera_settings=settings(28, 200, 159))[0]))  # short > long
        self.assertIsNone(hint_of(make_cr2(camera_settings=[92] * 20)[0]))  # too short an array
        self.assertIsNone(hint_of(make_cr2(camera_settings=settings(50, 50, 0x7FFF))[0]).aperture)

    def test_parse_cr2_carries_it(self):
        data, _ = make_cr2(camera_settings=settings(105, 105, 96, lens_type=183))
        raw = cr2.parse_cr2(data)
        self.assertEqual(raw.lens_hint, rd.LensHint(105.0, 105.0, 2.83, 183))
        info = lp.shot_info(raw.ifd0, raw.exif, raw.lens_hint)
        self.assertEqual(info.hint.short, 105.0)


class NameRange(unittest.TestCase):
    def test_forms(self):
        self.assertEqual(lp.name_range("Canon EF-S 18-55mm f/3.5-5.6 IS"), (18, 55, 3.5, 5.6))
        self.assertEqual(lp.name_range("Canon EF 50mm f/1.8 STM"), (50, 50, 1.8, 1.8))
        self.assertEqual(lp.name_range("Tamron E 28-200mm F2.8-5.6 A071"), (28, 200, 2.8, 5.6))
        self.assertEqual(lp.name_range("Lumix S 28–200mm f/4–7.1 Macro OIS"), (28, 200, 4.0, 7.1))

    def test_refusals(self):
        self.assertIsNone(lp.name_range("Canon EF-S 18-55mm IS STM"))  # no f-number
        self.assertIsNone(lp.name_range("fixed lens"))
        self.assertIsNone(lp.name_range("Kenko Teleplus 2x converter 50mm f/1.8"))


class FindByRange(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = make_db()
        cls.ff = lp.find_camera(cls.db, "Canon", "Canon EOS 5D Mark II")
        cls.aps = lp.find_camera(cls.db, "Canon", "Canon EOS 7D")

    def names(self, *args, camera=None):
        return sorted(lens.name for lens in lp.find_lenses_by_range(self.db, *args, camera=camera))

    def test_a_prime_alone(self):
        self.assertEqual(self.names(105, 105, 2.83, camera=self.ff), ["Sigma 105mm f/2.8 EX DG Macro"])

    def test_aperture_splits_zooms_but_not_versions(self):
        self.assertEqual(self.names(70, 200, 4.0, camera=self.ff), ["Canon EF 70-200mm f/4L USM"])
        self.assertEqual(self.names(70, 200, 2.83, camera=self.ff),
                         ["Canon EF 70-200mm f/2.8L IS USM", "Canon EF 70-200mm f/2.8L USM"])  # no extender entry

    def test_variable_aperture_anywhere_in_its_range(self):
        for a in (3.5, 4.0, 4.49, 5.6):
            self.assertEqual(self.names(18, 55, a, camera=self.aps), ["Canon EF-S 18-55mm f/3.5-5.6 IS"], a)
        self.assertEqual(self.names(18, 55, 2.8, camera=self.aps), [])
        self.assertEqual(self.names(18, 55, 6.3, camera=self.aps), [])

    def test_mount_and_crop(self):
        self.assertEqual(self.names(28, 200, 5.6, camera=self.ff), [])  # only a Nikon F lens has that range
        self.assertEqual(self.names(18, 55, 4.0, camera=self.ff), [])  # an EF-S lens is not on a full-frame body


class CorrectionFor(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = make_db()

    def info(self, lens, hint, focal=105.0, body="Canon EOS 5D Mark II"):
        return lp.ShotInfo("Canon", body, lens, None, focal, None, None, None, hint)

    def test_a_bare_focal_name_resolved(self):
        corr = lp.correction_for(self.db, self.info("105mm", rd.LensHint(105, 105, 2.83, 183)), 600, 400)
        self.assertEqual(corr.lens.name, "Sigma 105mm f/2.8 EX DG Macro")
        self.assertIn("from the maker note (105 mm at f/2.8 wide open)", corr.notes[0])

    def test_no_name_resolved(self):
        corr = lp.correction_for(self.db, self.info(None, rd.LensHint(70, 200, 4.0), 135.0), 600, 400)
        self.assertEqual(corr.lens.name, "Canon EF 70-200mm f/4L USM")

    def test_ambiguous_refused_with_the_candidates(self):
        with self.assertRaises(lp.LensProfileError) as cm:
            lp.correction_for(self.db, self.info(None, rd.LensHint(70, 200, 2.83), 135.0), 600, 400)
        self.assertIn("fits 2 lenses", str(cm.exception))
        self.assertIn("Canon EF 70-200mm f/2.8L IS USM", str(cm.exception))

    def test_nothing_fits(self):
        with self.assertRaises(lp.LensProfileError) as cm:
            lp.correction_for(self.db, self.info(None, rd.LensHint(28, 200, 5.6), 182.0), 600, 400)
        self.assertIn("28-200 mm at f/5.6", str(cm.exception))
        with self.assertRaises(lp.LensProfileError) as cm:
            lp.correction_for(self.db, self.info("10-17mm", rd.LensHint(10, 17, 4.0), 13.0, "Canon EOS 7D"), 600, 400)
        self.assertIn("gives only numbers", str(cm.exception))

    def test_a_real_name_and_lens_override_win(self):
        corr = lp.correction_for(self.db, self.info("EF100mm f/2.8 Macro USM", rd.LensHint(105, 105, 2.83), 100.0),
                                 600, 400)
        self.assertEqual(corr.lens.name, "Canon EF 100mm f/2.8 Macro USM")  # the file's name, not the hint
        corr = lp.correction_for(self.db, self.info(None, rd.LensHint(70, 200, 2.83), 135.0), 600, 400,
                                 lens_name="Canon EF 70-200mm f/2.8L USM")
        self.assertEqual(corr.lens.name, "Canon EF 70-200mm f/2.8L USM")


if __name__ == "__main__":
    unittest.main()
