"""A converted DNG's original maker note, read from DNGPrivateData ("Adobe\\0" + "MakN").

Adobe DNG Converter drops the EXIF MakerNote and keeps the camera's note in IFD0's DNGPrivateData: records of
a four-letter name and a big-endian length; "MakN" holds the original byte order, the big-endian offset the
note sat at in the original file, then the note (ExifTool's DNG.pm). The Canon values below are the real
EOS 350D DNG's (ExifTool's t/images/DNG.dng: note at original offset 700, CameraSettings 18-55 mm, f/4 at
the shot's 55 mm, lens type n/a; eval/dng-maker-note-2026-11-14.md).
"""

from __future__ import annotations

import struct
import unittest

from shootflow import lens_profiles as lp

from test_lens_specification import nikon_note
from test_olympus_equipment import E30, equipment_entries, ifd_bytes


def adobe_private(note: bytes, original: int, order: bytes = b"II", before: bytes = b"") -> tuple:
    """IFD0's DNGPrivateData as Adobe writes it, with optional records ahead of MakN."""

    makn = order + struct.pack(">I", original) + note
    return tuple(b"Adobe\0" + before + b"MakN" + struct.pack(">I", len(makn)) + makn)


def canon_note(original: int, cs: tuple[int, ...], lens_name: bytes = b"") -> bytes:
    """A Canon note as it sat in the original file: a bare IFD whose offsets count from the TIFF header."""

    entries = [(0x0001, 3, len(cs), struct.pack("<%dH" % len(cs), *cs))]
    if lens_name:
        entries.append((0x0095, 2, len(lens_name) + 1, lens_name + b"\0"))
    return ifd_bytes(entries, original)


# The real 350D DNG's CameraSettings, first 30 of its 46 values.
CS_350D = (92, 2, 0, 4, 0, 0, 0, 0, 0, 6, 65535, 1, 0, 0, 0, 0, 32767, 5, 2, 0, 3, 65535, 65535, 55, 18, 1,
           128, 304, 0, 0)
CANON = {271: tuple(b"Canon\0"), 272: tuple(b"Canon EOS 350D DIGITAL\0")}


class AdobeMakN(unittest.TestCase):
    def test_canon_note_relocated_to_its_original_offset(self):
        ifd0 = {**CANON, lp.TAG_DNG_PRIVATE_DATA: adobe_private(canon_note(700, CS_350D), 700)}
        note = lp.dng_maker_note(ifd0)
        self.assertEqual(note.offsets[lp.TAG_MAKER_NOTE], 700)
        hint = lp.spec_hint(ifd0, None)
        self.assertEqual((hint.short, hint.long, hint.aperture, hint.lens_type), (18.0, 55.0, 4.0, None))
        self.assertEqual(hint.source, "converted DNG's Canon maker note's CameraSettings")

    def test_canon_lens_name_becomes_the_tie_break_name(self):
        private = adobe_private(canon_note(1200, CS_350D, b"EF-S18-55mm f/3.5-5.6"), 1200,
                                before=b"XXXX" + struct.pack(">I", 3) + b"abc")
        ifd0 = {**CANON, lp.TAG_DNG_PRIVATE_DATA: private}
        self.assertEqual(lp.spec_hint(ifd0, None).name, "EF-S18-55mm f/3.5-5.6")

    def test_canon_note_only_read_when_the_make_is_canon(self):
        ifd0 = {271: tuple(b"Pentax\0"), lp.TAG_DNG_PRIVATE_DATA: adobe_private(canon_note(700, CS_350D), 700)}
        self.assertIsNone(lp.spec_hint(ifd0, None))

    def test_nikon_note(self):
        ifd0 = {lp.TAG_DNG_PRIVATE_DATA: adobe_private(bytes(nikon_note((24, 120, 3.5, 5.6))), 800, b"MM")}
        hint = lp.spec_hint(ifd0, None)
        self.assertEqual((hint.short, hint.long, hint.marked), (24.0, 120.0, (3.5, 5.6)))
        self.assertEqual(hint.source, "converted DNG's Nikon maker note")

    def test_old_style_olympus_offsets_from_the_original_header(self):
        original = 300
        note_ifd_at = original + 8
        eq_at = note_ifd_at + 2 + 12 + 4
        eq = ifd_bytes(equipment_entries(**E30), eq_at)
        note = b"OLYMP\0\x02\0" + ifd_bytes([(0x2010, 7, len(eq), eq)], note_ifd_at)
        hint = lp.spec_hint({lp.TAG_DNG_PRIVATE_DATA: adobe_private(note, original)}, None)
        self.assertEqual((hint.short, hint.long, hint.marked), (14.0, 54.0, (2.8, 3.5)))
        self.assertEqual(hint.name, "OLYMPUS 14-54mm Lens")

    def test_camera_raw_jpeg_quirk_skips_twelve_bytes(self):
        note = b"\0\0\0\x01" + b"8bytes!!" + bytes(nikon_note((24, 70, 2.8, 2.8)))
        hint = lp.spec_hint({lp.TAG_DNG_PRIVATE_DATA: adobe_private(note, 800)}, None)
        self.assertEqual((hint.short, hint.long), (24.0, 70.0))


class Precedence(unittest.TestCase):
    def private(self, values):
        return adobe_private(bytes(nikon_note(values)), 800, b"MM")

    def test_maker_note_fills_in_lens_info_without_f_numbers(self):
        # Adobe's LensInfo "24-120mm f/?" (0/0 f-numbers): the note's same range adds the apertures.
        ifd0 = {lp.TAG_DNG_LENS_INFO: (24.0, 120.0, 0.0, 0.0), lp.TAG_DNG_PRIVATE_DATA: self.private((24, 120, 3.5, 5.6))}
        self.assertEqual(lp.spec_hint(ifd0, None).marked, (3.5, 5.6))

    def test_lens_info_with_f_numbers_wins(self):
        ifd0 = {lp.TAG_DNG_LENS_INFO: (24.0, 120.0, 4.0, 4.0), lp.TAG_DNG_PRIVATE_DATA: self.private((24, 120, 3.5, 5.6))}
        hint = lp.spec_hint(ifd0, None)
        self.assertEqual((hint.marked, hint.source), ((4.0, 4.0), "file's DNG LensInfo"))

    def test_a_different_range_leaves_lens_info(self):
        ifd0 = {lp.TAG_DNG_LENS_INFO: (24.0, 120.0, 0.0, 0.0), lp.TAG_DNG_PRIVATE_DATA: self.private((24, 70, 2.8, 2.8))}
        hint = lp.spec_hint(ifd0, None)
        self.assertEqual((hint.long, hint.marked, hint.source), (120.0, None, "file's DNG LensInfo"))

    def test_exif_maker_note_before_private_data(self):
        exif = {lp.TAG_MAKER_NOTE: nikon_note((24, 70, 2.8, 2.8))}
        hint = lp.spec_hint({lp.TAG_DNG_PRIVATE_DATA: self.private((24, 120, 3.5, 5.6))}, exif)
        self.assertEqual((hint.long, hint.source), (70.0, "Nikon maker note"))


class Junk(unittest.TestCase):
    def test_not_adobe_or_truncated(self):
        good = bytes(adobe_private(bytes(nikon_note((24, 70, 2.8, 2.8))), 800))
        for raw in (b"PENTAX \0" + good[6:], good[:30], b"Adobe\0MakN\xff\xff\xff\xff" + good[14:],
                    b"Adobe\0MakN\0\0\0\x04ZZ\0\0", b""):
            self.assertIsNone(lp.dng_maker_note({lp.TAG_DNG_PRIVATE_DATA: tuple(raw)}), raw[:16])
        self.assertIsNone(lp.dng_maker_note({}))
        self.assertIsNone(lp.dng_maker_note(None))

    def test_huge_original_offset_keeps_self_relative_notes(self):
        note = lp.dng_maker_note({lp.TAG_DNG_PRIVATE_DATA: adobe_private(bytes(nikon_note((24, 70, 2.8, 2.8))), 1 << 30)})
        self.assertIsNone(note.source)
        self.assertEqual(lp.spec_hint({lp.TAG_DNG_PRIVATE_DATA: adobe_private(
            bytes(nikon_note((24, 70, 2.8, 2.8))), 1 << 30)}, None).long, 70.0)


if __name__ == "__main__":
    unittest.main()
