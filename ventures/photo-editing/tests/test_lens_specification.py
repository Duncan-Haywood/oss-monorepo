"""Lenses identified from EXIF LensSpecification or DNG LensInfo when the file names none (any maker).

The tag layout (four rationals: short and long focal length, widest f-number at each end, 0/0 for unknown) is
EXIF 2.3's LensSpecification (0xA432) and the DNG specification's LensInfo (50736). The real files it was
checked on are in ``eval/lens-specification-2026-11-14.md``; the database here is a made-up file in lensfun's XML
format (no lensfun data is copied).
"""

from __future__ import annotations

import os
import tempfile
import unittest

from shootflow import lens_profiles as lp
from shootflow import raw_develop as rd

DB_XML = """<lensdatabase version="2">
    <mount><name>Nikon F AF</name><compat>Nikon F</compat><compat>M42</compat></mount>
    <mount><name>Nikon F</name></mount>
    <mount><name>M42</name></mount>
    <mount><name>Fujifilm X100</name></mount>
    <camera><maker>Nikon Corporation</maker><model>Nikon D750</model><mount>Nikon F AF</mount><cropfactor>1.0</cropfactor></camera>
    <camera><maker>Fujifilm</maker><model>X100S</model><mount>Fujifilm X100</mount><cropfactor>1.53</cropfactor></camera>
    <lens><maker>Fujifilm</maker><model>fixed lens</model><mount>Fujifilm X100</mount>
        <cropfactor>1.53</cropfactor><calibration><distortion model="poly3" focal="23" k1="-0.01"/></calibration></lens>
    <lens><maker>Nikon</maker><model>Nikkor AF-S 24-70mm f/2.8G ED</model><mount>Nikon F AF</mount>
        <cropfactor>1.0</cropfactor><calibration><distortion model="poly3" focal="24" k1="-0.02"/></calibration></lens>
    <lens><maker>Nikon</maker><model>Nikkor AF-S 24-70mm f/2.8E ED VR</model><mount>Nikon F AF</mount>
        <cropfactor>1.0</cropfactor><calibration><distortion model="poly3" focal="24" k1="-0.02"/></calibration></lens>
    <lens><maker>Nikon</maker><model>Nikkor AF-S 24-120mm f/4G ED VR</model><mount>Nikon F AF</mount>
        <cropfactor>1.0</cropfactor><calibration><distortion model="poly3" focal="24" k1="-0.03"/>
        <distortion model="poly3" focal="120" k1="0.01"/></calibration></lens>
    <lens><maker>Nikon</maker><model>Nikkor AF-S 24-120mm f/3.5-5.6G IF-ED VR</model><mount>Nikon F AF</mount>
        <cropfactor>1.0</cropfactor><calibration><distortion model="poly3" focal="24" k1="-0.03"/></calibration></lens>
    <lens><maker>Tamron</maker><model>Tamron SP 24-70mm f/2.8 Di VC USD</model><mount>Nikon F AF</mount>
        <cropfactor>1.0</cropfactor><calibration><distortion model="poly3" focal="24" k1="-0.02"/></calibration></lens>
    <lens><maker>Helios</maker><model>Helios 44-2 58mm f/2</model><mount>M42</mount>
        <cropfactor>1.0</cropfactor><calibration><distortion model="poly3" focal="58" k1="0.001"/></calibration></lens>
</lensdatabase>
"""


def make_db():
    d = tempfile.mkdtemp()
    with open(os.path.join(d, "nikon.xml"), "w") as fh:
        fh.write(DB_XML)
    return lp.load_db(d)


SPEC = lp.TAG_LENS_SPECIFICATION
INFO = lp.TAG_DNG_LENS_INFO


class SpecHint(unittest.TestCase):
    def test_exif_lens_specification(self):
        hint = lp.spec_hint({}, {SPEC: (24.0, 120.0, 4.0, 4.0)})
        self.assertEqual((hint.short, hint.long, hint.marked, hint.aperture), (24.0, 120.0, (4.0, 4.0), None))
        self.assertEqual(hint.source, "file's LensSpecification")

    def test_dng_lens_info_and_precedence(self):
        self.assertEqual(lp.spec_hint({INFO: (18.0, 55.0, 3.5, 5.6)}, None).source, "file's DNG LensInfo")
        both = lp.spec_hint({INFO: (18.0, 55.0, 3.5, 5.6)}, {SPEC: (24.0, 70.0, 2.8, 2.8)})
        self.assertEqual(both.short, 24.0)  # the EXIF IFD's tag first

    def test_unknown_parts(self):
        self.assertIsNone(lp.spec_hint({INFO: (0.0, 0.0, 0.0, 0.0)}, None))  # an adapted lens: nothing known
        self.assertIsNone(lp.spec_hint({INFO: (70.0, 24.0, 2.8, 2.8)}, None))  # short > long
        self.assertIsNone(lp.spec_hint({INFO: (24.0, 70.0)}, None))  # too few values
        self.assertIsNone(lp.spec_hint({INFO: (24.0, 70.0, 0.0, 0.0)}, None).marked)  # 0/0 f-numbers
        self.assertIsNone(lp.spec_hint({INFO: (24.0, 70.0, 5.6, 3.5)}, None).marked)  # wider at the long end

    def test_shot_info_reads_it_and_a_maker_note_hint_wins(self):
        info = lp.shot_info({}, {SPEC: (24.0, 70.0, 2.8, 2.8)})
        self.assertEqual(info.hint.marked, (2.8, 2.8))
        canon = rd.LensHint(105.0, 105.0, 2.83, 183)
        self.assertIs(lp.shot_info({}, {SPEC: (24.0, 70.0, 2.8, 2.8)}, canon).hint, canon)


def nikon_note(values, version=b"\x02\x10\x00\x00", tag=0x0084):
    """A type-3 Nikon maker note: ``Nikon\\0`` + version, then a big-endian TIFF with one RATIONAL[4] entry."""

    import struct
    body = struct.pack(">2sHI", b"MM", 42, 8) + struct.pack(">H", 1)
    body += struct.pack(">HHII", tag, 5, 4, 8 + 2 + 12 + 4) + struct.pack(">I", 0)
    for v in values:
        body += struct.pack(">II", int(round(v * 10)), 10)
    return tuple(b"Nikon\0" + version + body)


class NikonMakerNote(unittest.TestCase):
    def test_values_from_real_nefs(self):
        # 0x0084 as read from the real D300 (18-70 f/3.5-4.5) and D810 (50 mm f/1.4) NEFs in the eval note.
        for values in ((18.0, 70.0, 3.5, 4.5), (50.0, 50.0, 1.4, 1.4)):
            hint = lp.spec_hint({}, {lp.TAG_MAKER_NOTE: nikon_note(values)})
            self.assertEqual((hint.short, hint.long, hint.marked), (values[0], values[1], values[2:]))
            self.assertEqual(hint.source, "Nikon maker note")

    def test_exif_tag_wins_and_junk_is_ignored(self):
        exif = {lp.TAG_MAKER_NOTE: nikon_note((18.0, 70.0, 3.5, 4.5)), SPEC: (24.0, 120.0, 4.0, 4.0)}
        self.assertEqual(lp.spec_hint({}, exif).short, 24.0)
        self.assertIsNone(lp.spec_hint({}, {lp.TAG_MAKER_NOTE: nikon_note((18.0, 70.0, 3.5, 4.5), tag=0x0083)}))
        self.assertIsNone(lp.spec_hint({}, {lp.TAG_MAKER_NOTE: tuple(b"Nikon\0\x02\x10\x00\x00XXjunkjunk")}))
        self.assertIsNone(lp.spec_hint({}, {lp.TAG_MAKER_NOTE: tuple(b"Canon" * 10)}))

    def test_corrects_a_nef_shaped_file(self):
        db = make_db()
        info = lp.shot_info({271: "Nikon Corporation", 272: "Nikon D750"},
                            {lp.TAG_MAKER_NOTE: nikon_note((24.0, 120.0, 3.5, 5.6)), 37386: (50.0,)})
        corr = lp.correction_for(db, info, 600, 400)
        self.assertEqual(corr.lens.name, "Nikkor AF-S 24-120mm f/3.5-5.6G IF-ED VR")
        self.assertIn("from the Nikon maker note (24-120 mm f/3.5-5.6)", corr.notes[0])


class MarkedApertures(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = make_db()
        cls.d750 = lp.find_camera(cls.db, "Nikon Corporation", "Nikon D750")

    def names(self, short, long, marked):
        return sorted(lens.name for lens in lp.find_lenses_by_range(self.db, short, long, None, self.d750,
                                                                    marked=marked))

    def test_both_ends_must_match(self):
        self.assertEqual(self.names(24, 120, (4.0, 4.0)), ["Nikkor AF-S 24-120mm f/4G ED VR"])
        self.assertEqual(self.names(24, 120, (3.5, 5.6)), ["Nikkor AF-S 24-120mm f/3.5-5.6G IF-ED VR"])
        # A single aperture of 4.0 (Canon's kind of hint) fits both: f/4 lies inside f/3.5-5.6.
        both = sorted(x.name for x in lp.find_lenses_by_range(self.db, 24, 120, 4.0, self.d750))
        self.assertEqual(len(both), 2)

    def test_versions_still_tie(self):
        self.assertEqual(len(self.names(24, 70, (2.8, 2.8))), 3)


class CorrectionFromSpec(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = make_db()

    def info(self, spec, lens=None, make="Nikon Corporation", model="Nikon D750", focal=50.0):
        return lp.shot_info({271: make, 272: model}, {SPEC: spec, 37386: (focal,)} | (
            {lp.TAG_LENS_MODEL: lens} if lens else {}))

    def test_no_name_resolved_with_a_note(self):
        corr = lp.correction_for(self.db, self.info((24.0, 120.0, 4.0, 4.0)), 600, 400)
        self.assertEqual(corr.lens.name, "Nikkor AF-S 24-120mm f/4G ED VR")
        self.assertIn("from the file's LensSpecification (24-120 mm f/4)", corr.notes[0])

    def test_tie_refused_naming_the_tag(self):
        with self.assertRaises(lp.LensProfileError) as cm:
            lp.correction_for(self.db, self.info((24.0, 70.0, 2.8, 2.8)), 600, 400)
        self.assertIn("its file's LensSpecification gives a 24-70 mm f/2.8 lens, which fits 3 lenses", str(cm.exception))

    def test_nothing_fits_names_the_tag(self):
        with self.assertRaises(lp.LensProfileError) as cm:
            lp.correction_for(self.db, self.info((28.0, 300.0, 3.5, 6.3)), 600, 400)
        self.assertIn("file's LensSpecification's 28-300 mm f/3.5-6.3", str(cm.exception))

    def test_a_real_name_wins(self):
        corr = lp.correction_for(self.db, self.info((24.0, 120.0, 3.5, 5.6), "Nikkor AF-S 24-120mm f/4G ED VR"),
                                 600, 400)
        self.assertEqual(corr.lens.name, "Nikkor AF-S 24-120mm f/4G ED VR")

    def test_unknown_camera_ignores_the_tag(self):
        # Without the body's mount, a tag would match lenses on any mount: refused as before.
        with self.assertRaises(lp.LensProfileError) as cm:
            lp.correction_for(self.db, self.info((24.0, 120.0, 4.0, 4.0), make="Acme", model="Z1"), 600, 400,
                              crop=1.0)
        self.assertIn("names no lens", str(cm.exception))
        self.assertNotIn("LensSpecification", str(cm.exception))

    def test_fixed_lens_camera_keeps_its_own_entry(self):
        corr = lp.correction_for(self.db, self.info((23.0, 23.0, 2.0, 2.0), make="Fujifilm", model="X100S",
                                                    focal=23.0), 600, 400)
        self.assertTrue(any("fixed-lens camera" in n for n in corr.notes))


if __name__ == "__main__":
    unittest.main()
