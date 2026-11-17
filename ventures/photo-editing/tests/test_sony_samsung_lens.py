"""Sony and Samsung lenses identified from the maker note when the file names none (or names it only in a tie).

The Sony DSLR-A500 and Samsung's Galaxy NX and NX20 write no EXIF LensModel or LensSpecification. Sony's maker
note keeps LensSpec (0xB02A: eight bytes, hex digits read as decimal, feature flags in bytes 0 and 7) and
Samsung's keeps LensType (0xA003, the lens's number in Samsung's NX list). Notes here are built in the layouts
the real files use (an ARW's headerless note with offsets from the TIFF header; an SRW's headerless note with
offsets from the note's start); the byte values are the real frames' (eval/sony-samsung-lens-2026-11-14.md).
The database is made up in lensfun's XML format.
"""

from __future__ import annotations

import os
import struct
import tempfile
import unittest

from shootflow import lens_profiles as lp
from shootflow import raw_develop as rd

DB_XML = """<lensdatabase version="2">
    <mount><name>Sony Alpha</name></mount>
    <mount><name>Sony E</name></mount>
    <mount><name>Samsung NX</name></mount>
    <camera><maker>Sony</maker><model>DSLR-A500</model><mount>Sony Alpha</mount><cropfactor>1.523</cropfactor></camera>
    <camera><maker>Sony</maker><model>NEX-7</model><mount>Sony E</mount><cropfactor>1.523</cropfactor></camera>
    <camera><maker>Samsung</maker><model>NX20</model><mount>Samsung NX</mount><cropfactor>1.534</cropfactor></camera>
    <lens><maker>Sony</maker><model>Sony DT 18-55mm f/3.5-5.6 SAM (SAL1855)</model><mount>Sony Alpha</mount>
        <cropfactor>1.523</cropfactor><calibration><distortion model="poly3" focal="18" k1="-0.02"/></calibration></lens>
    <lens><maker>Minolta</maker><model>Minolta AF 18-55mm f/3.5-5.6 DT</model><mount>Sony Alpha</mount>
        <cropfactor>1.523</cropfactor><calibration><distortion model="poly3" focal="18" k1="-0.02"/></calibration></lens>
    <lens><maker>Sony</maker><model>E 24mm f/1.8 ZA</model><mount>Sony E</mount>
        <cropfactor>1.523</cropfactor><calibration><distortion model="poly3" focal="24" k1="-0.01"/></calibration></lens>
    <lens><maker>Samyang</maker><model>Samyang AF 24mm f/1.8 FE</model><mount>Sony E</mount>
        <cropfactor>1.0</cropfactor><calibration><distortion model="poly3" focal="24" k1="-0.01"/></calibration></lens>
    <lens><maker>Samsung</maker><model>Samsung NX 18-55mm f/3.5-5.6 OIS</model><mount>Samsung NX</mount>
        <cropfactor>1.534</cropfactor><calibration><distortion model="poly3" focal="18" k1="-0.02"/></calibration></lens>
    <lens><maker>Samsung</maker><model>Samsung NX 18-55mm f/3.5-5.6</model><mount>Samsung NX</mount>
        <cropfactor>1.534</cropfactor><calibration><distortion model="poly3" focal="18" k1="-0.02"/></calibration></lens>
</lensdatabase>
"""

# The real frames' LensSpec bytes (metadata-extractor prints them as decimals: "1 0 24 0 85 53 86 2").
A500_SPEC = bytes([0x01, 0x00, 0x18, 0x00, 0x55, 0x35, 0x56, 0x02])  # DT 18-55mm F3.5-5.6 SAM
NEX7_SPEC = bytes([0x03, 0x00, 0x24, 0x00, 0x00, 0x18, 0x00, 0x04])  # E 24mm F1.8 ZA
A7M3_SPEC = bytes([0x82, 0x00, 0x24, 0x01, 0x05, 0x40, 0x00, 0x08])  # FE 24-105mm F4 G OSS
A7M4_SPEC = bytes([0x0A, 0x00, 0x24, 0x00, 0x70, 0x28, 0x00, 0x00])  # FE 24-70mm F2.8 II


def make_db():
    d = tempfile.mkdtemp()
    with open(os.path.join(d, "db.xml"), "w") as fh:
        fh.write(DB_XML)
    return lp.load_db(d)


def ifd_bytes(entries, base: int, order: str = "<") -> bytes:
    """A classic IFD placed at ``base``: (tag, type, count, payload bytes); long payloads follow the IFD and
    their offsets are written as ``base`` + position (so ``base`` is the IFD's place in whatever the offsets
    count from)."""

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


def tiff(make: bytes, note_fn, lens_spec_values=None, order: str = "<"):
    """IFD0 (Make, ExifIFD) -> EXIF IFD (MakerNote[, LensSpecification]) -> note; ``note_fn(note_at)`` builds
    the note given where its payload lands in the file. Read back through the real reader."""

    make = make + b"\0"
    ifd0_len = 2 + 12 * 2 + 4 + len(make) + (len(make) % 2)
    exif_at = 8 + ifd0_len
    n_exif = 1 + (lens_spec_values is not None)
    probe = note_fn(0)
    # The EXIF IFD's tail holds LensSpecification (tag 0xA432) after the MakerNote (tag 0x927C) when sorted.
    note_at = exif_at + 2 + 12 * n_exif + 4
    note = note_fn(note_at)
    assert len(note) == len(probe)
    entries = [(lp.TAG_MAKER_NOTE, 7, len(note), note)]
    if lens_spec_values is not None:
        entries.append((lp.TAG_LENS_SPECIFICATION, 5, 4,
                        b"".join(struct.pack(order + "II", int(v * 10), 10) for v in lens_spec_values)))
    exif = ifd_bytes(entries, exif_at, order)
    ifd0 = ifd_bytes([(271, 2, len(make), make), (rd.TAG_EXIF_IFD, 4, 1, struct.pack(order + "I", exif_at))], 8,
                     order)
    mark = b"II" if order == "<" else b"MM"
    data = mark + struct.pack(order + "HI", 42, 8) + ifd0 + exif
    reader = rd._Reader(data)
    ifd0_r, _ = reader.read_ifd(reader.first_ifd_offset())
    exif_r, _ = reader.read_ifd(int(ifd0_r.get(rd.TAG_EXIF_IFD)[0]))
    return ifd0_r, exif_r


def sony_note(spec: bytes, header: bytes = b""):
    """An ARW note: no header (or "SONY DSC \\0\\0\\0" in a JPEG), offsets from the file's TIFF header."""

    def build(note_at):
        return header + ifd_bytes([(lp.SONY_LENS_SPEC, 7, 8, spec), (0xB027, 4, 1, struct.pack("<I", 55))],
                                  note_at + len(header))
    return build


def samsung_note(lens_type: int, order: str = "<"):
    """An SRW note: no header, offsets from the note's own start."""

    def build(_note_at):
        return ifd_bytes([(lp.SAMSUNG_LENS_TYPE, 4, 1, struct.pack(order + "I", lens_type)),
                          (0xA004, 2, 8, b"0123456\0")], 0, order)
    return build


class SonyLensSpec(unittest.TestCase):
    def test_decodes_the_real_frames(self):
        self.assertEqual(lp.sony_lens_spec(A500_SPEC), (18.0, 55.0, 3.5, 5.6, "DT 18-55mm F3.5-5.6 SAM"))
        self.assertEqual(lp.sony_lens_spec(NEX7_SPEC), (24.0, 24.0, 1.8, 1.8, "E 24mm F1.8 ZA"))
        self.assertEqual(lp.sony_lens_spec(A7M3_SPEC), (24.0, 105.0, 4.0, 4.0, "FE 24-105mm F4 G OSS"))
        self.assertEqual(lp.sony_lens_spec(A7M4_SPEC)[4], "FE 24-70mm F2.8 II")

    def test_letter_digit_and_rejects(self):
        # f/11 is written 0xB0 ("b" counts ten); a zero focal length, a zero f-number or a short count is no lens.
        self.assertEqual(lp.sony_lens_spec(bytes([0, 0, 0x50, 0, 0, 0xB0, 0, 0]))[2], 11.0)
        self.assertIsNone(lp.sony_lens_spec(bytes(8)))
        self.assertIsNone(lp.sony_lens_spec(bytes([0, 0, 0x50, 0, 0, 0, 0, 0])))
        self.assertIsNone(lp.sony_lens_spec(A500_SPEC[:7]))
        self.assertIsNone(lp.sony_lens_spec(bytes([0, 0, 0x55, 0, 0x18, 0x35, 0x56, 0])))  # long < short

    def test_a500_hint_from_headerless_note(self):
        ifd0, exif = tiff(b"SONY", sony_note(A500_SPEC))
        hint = lp.spec_hint(ifd0, exif)
        self.assertEqual((hint.short, hint.long, hint.marked), (18.0, 55.0, (3.5, 5.6)))
        self.assertEqual(hint.name, "DT 18-55mm F3.5-5.6 SAM")
        self.assertEqual(hint.source, "Sony maker note's LensSpec")

    def test_jpeg_style_header(self):
        ifd0, exif = tiff(b"SONY", sony_note(A500_SPEC, header=b"SONY DSC \0\0\0"))
        self.assertEqual(lp.spec_hint(ifd0, exif).name, "DT 18-55mm F3.5-5.6 SAM")

    def test_other_make_not_read_as_sony(self):
        ifd0, exif = tiff(b"Minolta", sony_note(A500_SPEC))
        self.assertIsNone(lp.spec_hint(ifd0, exif))

    def test_name_breaks_the_range_tie(self):
        db = make_db()
        ifd0, exif = tiff(b"SONY", sony_note(A500_SPEC))
        info = lp.ShotInfo("SONY", "DSLR-A500", None, None, 30.0, None, 5.0, None, lp.spec_hint(ifd0, exif))
        corr = lp.correction_for(db, info, 4592, 3056, vignetting=False)
        self.assertEqual(corr.lens.name, "Sony DT 18-55mm f/3.5-5.6 SAM (SAL1855)")

    def test_names_the_lens_beside_exif_lens_specification(self):
        # NEX-7: LensSpecification says 24 mm f/1.8, which fits two lenses; the note's "E 24mm F1.8 ZA" picks.
        db = make_db()
        ifd0, exif = tiff(b"SONY", sony_note(NEX7_SPEC), lens_spec_values=(24, 24, 1.8, 1.8))
        hint = lp.spec_hint(ifd0, exif)
        self.assertEqual(hint.source, "file's LensSpecification")
        self.assertEqual(hint.name, "E 24mm F1.8 ZA")
        info = lp.ShotInfo("SONY", "NEX-7", None, None, 24.0, None, 1.8, None, hint)
        self.assertEqual(lp.correction_for(db, info, 6000, 4000, vignetting=False).lens.name, "E 24mm f/1.8 ZA")

    def test_disagreeing_note_is_ignored(self):
        ifd0, exif = tiff(b"SONY", sony_note(A500_SPEC), lens_spec_values=(24, 24, 1.8, 1.8))
        self.assertIsNone(lp.spec_hint(ifd0, exif).name)


class SamsungLensType(unittest.TestCase):
    def test_galaxy_nx_lens_type_2(self):
        for order in ("<", ">"):
            ifd0, exif = tiff(b"SAMSUNG", samsung_note(2, order), order=order)
            hint = lp.spec_hint(ifd0, exif)
            self.assertEqual((hint.short, hint.long, hint.marked), (18.0, 55.0, (3.5, 5.6)))
            self.assertEqual(hint.name, "Samsung NX 18-55mm F3.5-5.6 OIS")
            self.assertEqual(hint.source, "Samsung maker note's LensType 2")

    def test_prime_and_unknown(self):
        ifd0, exif = tiff(b"SAMSUNG", samsung_note(1))
        hint = lp.spec_hint(ifd0, exif)
        self.assertEqual((hint.short, hint.long, hint.marked), (30.0, 30.0, (2.0, 2.0)))
        for unknown in (0, 16, 999):  # built-in or manual; gaps in the list
            ifd0, exif = tiff(b"SAMSUNG", samsung_note(unknown))
            self.assertIsNone(lp.spec_hint(ifd0, exif))

    def test_name_picks_ois(self):
        db = make_db()
        ifd0, exif = tiff(b"SAMSUNG", samsung_note(2))
        info = lp.ShotInfo("SAMSUNG", "NX20", None, None, 25.0, None, 4.0, None, lp.spec_hint(ifd0, exif))
        corr = lp.correction_for(db, info, 6000, 4000, vignetting=False)
        self.assertEqual(corr.lens.name, "Samsung NX 18-55mm f/3.5-5.6 OIS")

    def test_every_listed_name_parses(self):
        for number, name in lp.SAMSUNG_LENS_TYPES.items():
            ifd0, exif = tiff(b"SAMSUNG", samsung_note(number))
            hint = lp.spec_hint(ifd0, exif)
            self.assertIsNotNone(hint, name)
            self.assertLessEqual(hint.short, hint.long)


if __name__ == "__main__":
    unittest.main()
