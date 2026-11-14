"""Olympus lenses identified from the maker note's Equipment IFD when the file names none.

Four Thirds and early Micro Four Thirds bodies write no EXIF LensModel or LensSpecification; the maker note's
Equipment IFD (tag 0x2010) still has the focal range (0x0207, 0x0208), the widest f-number at each end
(0x0205, 0x0206, stored as v with f = sqrt(2) ** (v / 256)) and a lens name (0x0203). The notes here are built
in the three layouts the real files use (eval/olympus-equipment-2026-11-14.md: an E-1 JPEG, E-30 to E-PM1
ORFs, OM-1); the values are the real frames', the database is made up in lensfun's XML format.
"""

from __future__ import annotations

import math
import os
import struct
import tempfile
import unittest

from shootflow import lens_profiles as lp
from shootflow import raw_develop as rd

DB_XML = """<lensdatabase version="2">
    <mount><name>4/3 System</name></mount>
    <mount><name>Micro 4/3 System</name><compat>4/3 System</compat></mount>
    <camera><maker>Olympus Imaging Corp.</maker><model>E-30</model><mount>4/3 System</mount><cropfactor>2.0</cropfactor></camera>
    <camera><maker>Olympus Imaging Corp.</maker><model>E-PM1</model><mount>Micro 4/3 System</mount><cropfactor>2.0</cropfactor></camera>
    <lens><maker>Olympus</maker><model>Olympus Zuiko Digital 14-54mm f/2.8-3.5</model><mount>4/3 System</mount>
        <cropfactor>2.0</cropfactor><calibration><distortion model="poly3" focal="14" k1="-0.02"/></calibration></lens>
    <lens><maker>Olympus</maker><model>Olympus M.Zuiko Digital ED 14-42mm f/3.5-5.6 II R</model>
        <mount>Micro 4/3 System</mount><cropfactor>2.0</cropfactor>
        <calibration><distortion model="poly3" focal="14" k1="-0.03"/></calibration></lens>
    <lens><maker>Olympus</maker><model>Olympus M.Zuiko Digital ED 14-42mm f/3.5-5.6 L</model>
        <mount>Micro 4/3 System</mount><cropfactor>2.0</cropfactor>
        <calibration><distortion model="poly3" focal="14" k1="-0.03"/></calibration></lens>
    <lens><maker>Panasonic</maker><model>Lumix G Vario 14-42mm f/3.5-5.6</model>
        <mount>Micro 4/3 System</mount><cropfactor>2.0</cropfactor>
        <calibration><distortion model="poly3" focal="14" k1="-0.03"/></calibration></lens>
</lensdatabase>
"""


def make_db():
    d = tempfile.mkdtemp()
    with open(os.path.join(d, "olympus.xml"), "w") as fh:
        fh.write(DB_XML)
    return lp.load_db(d)


def f_code(f: float) -> int:
    return round(512 * math.log2(f))


def ifd_bytes(entries, base: int, order: str = "<") -> bytes:
    """A classic IFD placed at ``base``: (tag, type, count, payload bytes); long payloads follow the IFD."""

    head = struct.pack(order + "H", len(entries))
    tail = b""
    data_at = base + 2 + 12 * len(entries) + 4
    for tag, typ, count, payload in sorted(entries, key=lambda e: e[0]):
        if len(payload) <= 4:
            head += struct.pack(order + "HHI", tag, typ, count) + payload.ljust(4, b"\0")
        else:
            head += struct.pack(order + "HHII", tag, typ, count, data_at + len(tail))
            tail += payload + (b"\0" if len(payload) % 2 else b"")
    return head + struct.pack(order + "I", 0) + tail


def short(tag, v, order="<"):
    return (tag, 3, 1, struct.pack(order + "H", v))


def equipment_entries(min_f, max_f, a_min, a_max, current, name=b"", order="<"):
    out = [short(0x0207, min_f, order), short(0x0208, max_f, order), short(0x0205, a_min, order),
           short(0x0206, a_max, order), short(0x020A, current, order)]
    if name:
        out.append((0x0203, 2, len(name) + 1, name + b"\0"))
    return out


def new_style_note(equipment, header=b"OLYMPUS\0II\x03\0") -> bytes:
    """IFD 12 (or 16) bytes in, 0x2010 a pointer, offsets from the note's start (E-3 onwards, OM-1)."""

    start = len(header)
    eq_at = start + 2 + 12 + 4
    note_ifd = ifd_bytes([(0x2010, 13, 1, struct.pack("<I", eq_at))], start)
    assert len(note_ifd) == eq_at - start
    return header + note_ifd + ifd_bytes(equipment, eq_at)


def exif_ifd_from_note(note: bytes, magic: int = 42):
    """A whole little-endian TIFF: IFD0 -> EXIF IFD -> MakerNote, read back through the real reader."""

    exif_at = 8 + 2 + 12 + 4
    exif = ifd_bytes([(lp.TAG_MAKER_NOTE, 7, len(note), note)], exif_at)
    ifd0 = ifd_bytes([(rd.TAG_EXIF_IFD, 4, 1, struct.pack("<I", exif_at))], 8)
    data = b"II" + struct.pack("<HI", magic, 8) + ifd0 + exif
    reader = rd._Reader(data)
    ifd0_r, _ = reader.read_ifd(reader.first_ifd_offset())
    exif_r, _ = reader.read_ifd(int(ifd0_r.get(rd.TAG_EXIF_IFD)[0]))
    return ifd0_r, exif_r


def old_style_exif(equipment_fn):
    """The E-1's layout: "OLYMP\\0" + version, IFD 8 bytes in, Equipment inline as UNDEFINED bytes, and every
    offset (the note's and the Equipment's own) counted from the TIFF header."""

    exif_at = 8 + 2 + 12 + 4
    note_at = exif_at + 2 + 12 + 4  # the MakerNote payload follows the EXIF IFD
    note_ifd_at = note_at + 8
    eq_at = note_ifd_at + 2 + 12 + 4
    eq = ifd_bytes(equipment_fn(), eq_at)
    note = b"OLYMP\0\x02\0" + ifd_bytes([(0x2010, 7, len(eq), eq)], note_ifd_at)
    exif = ifd_bytes([(lp.TAG_MAKER_NOTE, 7, len(note), note)], exif_at)
    ifd0 = ifd_bytes([(rd.TAG_EXIF_IFD, 4, 1, struct.pack("<I", exif_at))], 8)
    data = b"II" + struct.pack("<HI", 42, 8) + ifd0 + exif
    reader = rd._Reader(data)
    ifd0_r, _ = reader.read_ifd(reader.first_ifd_offset())
    exif_r, _ = reader.read_ifd(int(ifd0_r.get(rd.TAG_EXIF_IFD)[0]))
    return exif_r


# The real E-30 frame: 14-54 mm, f/2.8 at 14, f/3.5 at 54, f/3.0 at the shot's 27 mm.
E30 = dict(min_f=14, max_f=54, a_min=f_code(2.8), a_max=f_code(3.5), current=f_code(3.0),
           name=b"OLYMPUS 14-54mm Lens")
# The real E-PM1 frame: 14-42 mm f/3.5-5.6, f/4.3 at 22 mm, named "OLYMPUS M.14-42mm F3.5-5.6 II R".
EPM1 = dict(min_f=14, max_f=42, a_min=f_code(3.5), a_max=f_code(5.6), current=f_code(4.3),
            name=b"OLYMPUS M.14-42mm F3.5-5.6 II R")


class Layouts(unittest.TestCase):
    def test_new_style_pointer(self):
        _, exif = exif_ifd_from_note(new_style_note(equipment_entries(**E30)))
        hint = lp.spec_hint({}, exif)
        self.assertEqual((hint.short, hint.long), (14.0, 54.0))
        self.assertEqual(hint.marked, (2.8, 3.5))
        self.assertAlmostEqual(hint.aperture, 3.0, places=2)
        self.assertEqual(hint.name, "OLYMPUS 14-54mm Lens")
        self.assertEqual(hint.source, "Olympus maker note's Equipment")

    def test_om_system_header(self):
        note = new_style_note(equipment_entries(**EPM1), header=b"OM SYSTEM\0\0\0II\x04\0")
        _, exif = exif_ifd_from_note(note)
        self.assertEqual(lp.spec_hint({}, exif).marked, (3.5, 5.6))

    def test_old_style_inline_with_tiff_offsets(self):
        # The E-1 frame writes no 0x0205; only the long end's f-number and the current one.
        def eq():
            return [short(0x0207, 14), short(0x0208, 54), short(0x0206, 925), short(0x020A, 755)]
        hint = lp.spec_hint({}, old_style_exif(eq))
        self.assertEqual((hint.short, hint.long, hint.marked), (14.0, 54.0, None))
        self.assertAlmostEqual(hint.aperture, 2.78, places=2)  # the real E-1's 755: f/2.78

    def test_orf_magic_is_read(self):
        ifd0, exif = exif_ifd_from_note(new_style_note(equipment_entries(**E30)), magic=0x4F52)
        self.assertEqual(lp.spec_hint(ifd0, exif).long, 54.0)

    def test_manual_lens_zeros_and_compacts_give_none(self):
        zeros = dict(E30, min_f=0, max_f=0, a_min=256, a_max=256, current=256, name=b"")
        _, exif = exif_ifd_from_note(new_style_note(equipment_entries(**zeros)))
        self.assertIsNone(lp.spec_hint({}, exif))
        _, exif = exif_ifd_from_note(new_style_note([short(0x0104, 4097)]))  # a u760: no lens tags at all
        self.assertIsNone(lp.spec_hint({}, exif))

    def test_junk_notes_are_ignored(self):
        for note in (b"OLYMPUS\0XX\x03\0" + b"\0" * 20, b"OLYMPUS\0II\x03\0\xff\xff" + b"\0" * 8,
                     b"OLYMP\0\x01\0" + b"\0" * 12, b"SONY DSC \0\0\0" + b"\0" * 8):
            self.assertIsNone(lp.spec_hint({}, {lp.TAG_MAKER_NOTE: tuple(note)}))

    def test_exif_lens_specification_still_wins(self):
        _, exif = exif_ifd_from_note(new_style_note(equipment_entries(**E30)))
        exif.entries[lp.TAG_LENS_SPECIFICATION] = (12.0, 40.0, 2.8, 2.8)
        self.assertEqual(lp.spec_hint({}, exif).source, "file's LensSpecification")


class Correction(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = make_db()

    def corr(self, eq, model):
        _, exif = exif_ifd_from_note(new_style_note(equipment_entries(**eq)))
        info = lp.ShotInfo("OLYMPUS IMAGING CORP.", model, None, None, 20.0, None,
                           hint=lp.spec_hint({}, exif))
        return lp.correction_for(self.db, info, 4032, 3024, vignetting=False)

    def test_range_alone_picks_the_four_thirds_lens(self):
        corr = self.corr(E30, "E-30")
        self.assertEqual(corr.lens.name, "Olympus Zuiko Digital 14-54mm f/2.8-3.5")
        self.assertIn("only lens in the database", corr.notes[0])

    def test_the_name_breaks_a_tie_among_lenses_that_fit(self):
        corr = self.corr(EPM1, "E-PM1")
        self.assertEqual(corr.lens.name, "Olympus M.Zuiko Digital ED 14-42mm f/3.5-5.6 II R")
        self.assertIn("fits 3 lenses", corr.notes[0])
        self.assertIn("'OLYMPUS M.14-42mm F3.5-5.6 II R'", corr.notes[0])

    def test_a_generic_name_leaves_the_tie_refused(self):
        with self.assertRaises(lp.LensProfileError) as cm:
            self.corr(dict(EPM1, name=b"OLYMPUS 14-42mm Lens"), "E-PM1")
        self.assertIn("fits 3 lenses", str(cm.exception))

    def test_a_name_outside_the_range_does_not_pick(self):
        # A name for a lens the range rules out never wins over the range.
        with self.assertRaises(lp.LensProfileError):
            self.corr(dict(EPM1, name=b"OLYMPUS 14-54mm F2.8-3.5"), "E-PM1")


if __name__ == "__main__":
    unittest.main()
