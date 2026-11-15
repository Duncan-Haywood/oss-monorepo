"""Pentax PEF read straight into the developer (``shootflow.pef``).

An encoder here writes a known sensor through compression 65535's rules (a
Huffman table of its own, stored in the maker note's 0x0220 layout; per-parity
running values for the first two columns, two-left prediction after), so the
decoded sensels are checked exactly on the C decoder and the Python reference.
Random byte streams check that the two agree (or both refuse) on input no
encoder made. A small PEF (a TIFF with a Pentax Make, a "PENTAX \\0" maker note
with the table and levels, EXIF CFAPattern and an embedded JPEG's size) goes
through ``parse_pef``, ``parse_raw``, the profile chooser and the CLI. The real
K-1 Mark II PEF against LibRaw (every sensel equal): ``tools/pef_libraw_check.py``
and ``eval/pentax-pef-reader-2026-11-14.md``.
"""

from __future__ import annotations

import io
import random
import struct
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from shootflow import camera_profiles, catalog, ingest, ljpeg_native, pef, raw_preview
from shootflow import raw_develop as rd
from shootflow.cli import main
from test_arw import make_profile
from test_raw_develop import _ifd_bytes
from test_srw import _Bits, field


def engines():
    return ["python", "native"] if ljpeg_native.available() else ["python"]


# Code lengths for difference bit counts 0..14 (they fill the 12-bit space exactly). The codes are assigned
# canonically here, shortest first, so they differ from the camera's own table.
LENGTHS = (8, 7, 6, 5, 4, 3, 3, 3, 2, 2, 9, 10, 11, 12, 12)


def canonical(lengths=LENGTHS) -> dict[int, tuple[int, int]]:
    """difference bits -> (code, length), codes assigned shortest first."""

    out = {}
    code, prev = 0, 0
    for bits, length in sorted(enumerate(lengths), key=lambda t: (t[1], t[0])):
        code <<= length - prev
        out[bits] = (code, length)
        code += 1
        prev = length
    return out


def table_blob(codes: dict[int, tuple[int, int]], order: str = "<") -> bytes:
    """Maker note 0x0220: (n - 12) & 15, 12 bytes, n codes left-aligned in 12 bits, n lengths."""

    n = len(codes)
    head = struct.pack(order + "H", (n - 12) & 15) + bytes(12)
    left = struct.pack(f"{order}{n}H", *(codes[b][0] << (12 - codes[b][1]) for b in range(n)))
    return head + left + bytes(codes[b][1] for b in range(n))


def encode(values: list[int], width: int, height: int, codes=None) -> bytes:
    codes = codes or canonical()
    w = _Bits()
    vpred = [[0, 0], [0, 0]]
    hpred = [0, 0]
    for row in range(height):
        for col in range(width):
            v = values[row * width + col]
            prev = vpred[row & 1][col] if col < 2 else hpred[col & 1]
            d = v - prev
            n = abs(d).bit_length()
            code, length = codes[n]
            w.put(code, length)
            if n:
                w.put(d if d > 0 else d + (1 << n) - 1, n)
            if col < 2:
                vpred[row & 1][col] = v
            hpred[col & 1] = v
    return w.big_endian()


def make_pef(*, width=24, height=8, bits=14, model="PENTAX K-1 Mark II", make="RICOH IMAGING COMPANY, LTD.",
             black=(1024, 1024, 1024, 1024), wb=(16672, 8192, 8192, 13824), cfa=(0, 1, 1, 2), cfa_be=True,
             preview=(22, 8), comp=pef.COMP_PENTAX, values=None, table=True):
    """A PEF: (file bytes, expected sensels). ``preview`` = the embedded JPEG's (width, height)."""

    if values is None:
        values = [min(v + 1000, (1 << bits) - 1) for v in field(5, width, height, bits - 1)]
    payload = encode(values, width, height)
    note_entries = []
    if table:
        note_entries.append((pef.MN_HUFFMAN, 7, tuple(table_blob(canonical()))))
    if black is not None:
        note_entries.append((pef.MN_BLACK, 3, tuple(black)))
    if wb is not None:
        note_entries.append((pef.MN_WHITE_POINT, 3, tuple(wb)))
    note_blob = b"PENTAX \0II" + _ifd_bytes(note_entries, 10)  # offsets count from the note's first byte
    repeat = (0, 2, 0, 2) if cfa_be else (2, 0, 2, 0)

    def layout(exif_at, prev_at, data_at):
        ifd0 = [
            (254, 4, (0,)), (256, 4, (width,)), (257, 4, (height,)), (258, 3, (bits,)), (259, 3, (comp,)),
            (262, 3, (rd.PHOTOMETRIC_CFA,)), (271, 2, tuple(make.encode() + b"\0")),
            (272, 2, tuple(model.encode() + b"\0")), (273, 4, (data_at,)), (279, 4, (len(payload),)),
            (0x8769, 4, (exif_at,)),
        ]
        if preview:
            ifd0.append((0x14A, 4, (prev_at,)))
        exif = [(0x829A, 5, (0.01,)), (0x927C, 7, tuple(note_blob))]
        if cfa is not None:
            exif.append((pef.TAG_EXIF_CFA, 7, repeat + tuple(cfa)))
        prev = [(254, 4, (1,)), (256, 4, (preview[0] if preview else 0,)), (257, 4, (preview[1] if preview else 0,)), (259, 3, (6,))]
        return ifd0, exif, prev

    ifd0, exif, prev = layout(0, 0, 0)
    exif_at = 8 + len(_ifd_bytes(ifd0, 8))
    prev_at = exif_at + len(_ifd_bytes(exif, exif_at))
    data_at = prev_at + len(_ifd_bytes(prev, prev_at))
    ifd0, exif, prev = layout(exif_at, prev_at, data_at)
    blob = b"II*\0" + struct.pack("<I", 8) + _ifd_bytes(ifd0, 8) + _ifd_bytes(exif, exif_at) + _ifd_bytes(prev, prev_at)
    return blob + payload, values


def _raw_ifd(width, height, size, bits=14, comp=pef.COMP_PENTAX):
    ifd = rd.Ifd()
    ifd.entries = {rd.TAG_WIDTH: (width,), rd.TAG_HEIGHT: (height,), rd.TAG_BITS: (bits,),
                   pef.TAG_COMPRESSION: (comp,), pef.TAG_STRIP_OFFSETS: (0,), pef.TAG_STRIP_BYTES: (size,)}
    return ifd


def _note(order="<", codes=None):
    note = rd.Ifd(byte_order=order)
    note.entries = {pef.MN_HUFFMAN: tuple(table_blob(codes or canonical(), order))}
    return note


class DecoderTests(unittest.TestCase):
    def test_exact_on_both_engines(self):
        for width, height, seed, bits in ((24, 7, 1, 14), (37, 5, 2, 12), (2, 9, 3, 14), (64, 3, 4, 13)):
            vals = field(seed, width, height, bits)
            data = encode(vals, width, height)
            for e in engines():
                got = pef.decode_pef(data, _raw_ifd(width, height, len(data), bits), _note(), e)
                self.assertEqual(list(got[0]), vals, (width, bits, e))
                self.assertEqual(got[2], bits)

    def test_table_layout_both_byte_orders(self):
        codes = canonical()
        for order in ("<", ">"):
            lut = pef.huffman_lut(table_blob(codes, order), order)
            self.assertEqual(len(lut), 4096)
            for bits, (code, length) in codes.items():
                self.assertEqual(lut[code << (12 - length)], (length << 8) | bits, (order, bits))
            self.assertNotIn(0, lut)  # the lengths fill the 12-bit space

    def test_the_k1_mark_ii_table_fills_the_space(self):
        # The camera's own 0x0220 (first 59 bytes of the real file's tag), as numbers: 15 codes.
        real = bytes((3, 0) + (0,) * 12) + struct.pack(
            "<15H", 4064, 4032, 3968, 3840, 3584, 2560, 3072, 2048, 0, 1024, 4080, 4088, 4092, 4094, 4095
        ) + bytes(LENGTHS)
        lut = pef.huffman_lut(real)
        self.assertNotIn(0, lut)
        self.assertEqual(lut[0], (2 << 8) | 8)  # 00........: 8 difference bits
        self.assertEqual(lut[4095], (12 << 8) | 14)

    def test_refusals(self):
        bad = _Bits()
        code, length = canonical()[9]
        bad.put(code, length)
        bad.put(0, 9)  # -511 from 0: below zero
        for e in engines():
            with self.assertRaises(rd.DevelopError):
                pef.decode_pef(bad.big_endian(), _raw_ifd(2, 1, 3), _note(), e)
        # A table with a gap (one code missing): a stream that lands in it is refused by both.
        codes = canonical()
        gap = {b: c for b, c in codes.items() if b != 14}
        top = codes[14][0] << (12 - codes[14][1])
        partial = struct.pack("<H", (14 - 12) & 15) + bytes(12) + struct.pack(
            "<14H", *(gap[b][0] << (12 - gap[b][1]) for b in range(14))) + bytes(gap[b][1] for b in range(14))
        note = rd.Ifd(byte_order="<")
        note.entries = {pef.MN_HUFFMAN: tuple(partial)}
        stream = struct.pack(">H", top << 4)
        for e in engines():
            with self.assertRaises(rd.DevelopError):
                pef.decode_pef(stream, _raw_ifd(1, 1, 2), note, e)
        with self.assertRaisesRegex(rd.DevelopError, "Huffman table"):
            pef.decode_pef(b"\0" * 8, _raw_ifd(2, 1, 8), None)
        with self.assertRaisesRegex(rd.DevelopError, "too short"):
            pef.huffman_lut(b"\3\0" + bytes(12))
        with self.assertRaisesRegex(rd.DevelopError, "compression 1.*not supported"):
            pef.decode_pef(b"\0" * 8, _raw_ifd(2, 1, 8, comp=1), _note())

    def test_engines_agree_on_random_streams(self):
        if len(engines()) < 2:
            self.skipTest("no C compiler")
        rnd = random.Random(13)
        for trial in range(60):
            width, height = rnd.randint(1, 40), rnd.randint(1, 6)
            junk = bytes(rnd.randrange(256) for _ in range(width * height * 2))
            outs = []
            for e in engines():
                try:
                    outs.append(tuple(pef.decode_pef(junk, _raw_ifd(width, height, len(junk)), _note(), e)[0]))
                except rd.DevelopError:
                    outs.append("refused")
            self.assertEqual(outs[0], outs[1], trial)


class ParseTests(unittest.TestCase):
    def test_parse_levels_cfa_crop(self):
        data, expected = make_pef()
        for e in engines():
            raw = pef.parse_pef(data, engine=e)
            self.assertEqual(list(raw.values), expected, e)
        ent = raw.ifd.entries
        self.assertEqual(raw.source, "pef")
        self.assertEqual(ent[rd.TAG_WHITE_LEVEL], (16383,))
        self.assertEqual(ent[rd.TAG_BLACK_LEVEL], (1024.0,) * 4)
        self.assertEqual(ent[rd.TAG_CFA_PATTERN], (0, 1, 1, 2))
        r, _, b = (1 / v for v in ent[rd.TAG_AS_SHOT_NEUTRAL])
        self.assertAlmostEqual(r, 16672 / 8192)
        self.assertAlmostEqual(b, 13824 / 8192)
        self.assertEqual((ent[rd.TAG_CROP_ORIGIN], ent[rd.TAG_CROP_SIZE]), ((1, 0), (22, 8)))
        self.assertTrue(any("no measured picture area" in n for n in raw.notes))

    def test_measured_crop_for_the_k1_mark_ii(self):
        self.assertEqual(pef.MEASURED_CROPS["PENTAX K-1 Mark II"], (14, 28, 7360, 4912))
        data, _ = make_pef(model="PENTAX K-1 Mark II", width=24, height=8)
        # Too small for the measured area: falls back to the centred preview, with the note.
        raw = pef.parse_pef(data)
        self.assertEqual(raw.ifd.entries[rd.TAG_CROP_ORIGIN], (1, 0))
        pef.MEASURED_CROPS["TEST BODY"] = (2, 2, 20, 4)
        self.addCleanup(pef.MEASURED_CROPS.pop, "TEST BODY")
        raw = pef.parse_pef(make_pef(model="TEST BODY")[0])
        self.assertEqual((raw.ifd.entries[rd.TAG_CROP_ORIGIN], raw.ifd.entries[rd.TAG_CROP_SIZE]), ((2, 2), (20, 4)))
        self.assertTrue(any("as measured on its JPEG" in n for n in raw.notes))

    def test_black_lands_on_each_cfa_position(self):
        # R, G, G, B levels onto a GBRG pattern: G, B, R, G.
        for cfa_be in (True, False):
            raw = pef.parse_pef(make_pef(black=(10, 20, 30, 40), cfa=(1, 2, 0, 1), cfa_be=cfa_be)[0])
            self.assertEqual(raw.ifd.entries[rd.TAG_CFA_PATTERN], (1, 2, 0, 1))
            self.assertEqual(raw.ifd.entries[rd.TAG_BLACK_LEVEL], (20.0, 40.0, 10.0, 30.0))

    def test_missing_pieces_are_noted(self):
        raw = pef.parse_pef(make_pef(black=None, wb=None, cfa=None, preview=None)[0])
        ent = raw.ifd.entries
        self.assertEqual(ent[rd.TAG_BLACK_LEVEL], (0.0,) * 4)
        self.assertEqual(ent[rd.TAG_CFA_PATTERN], pef.DEFAULT_CFA)
        self.assertNotIn(rd.TAG_AS_SHOT_NEUTRAL, ent)
        self.assertNotIn(rd.TAG_CROP_SIZE, ent)
        for words in ("black level", "white balance", "CFAPattern"):
            self.assertTrue(any(words in n for n in raw.notes), words)
        # A preview much smaller than the frame is not a crop.
        self.assertNotIn(rd.TAG_CROP_SIZE, pef.parse_pef(make_pef(preview=(8, 4))[0]).ifd.entries)
        with self.assertRaisesRegex(rd.DevelopError, "0x0220"):
            pef.parse_pef(make_pef(table=False)[0])

    def test_dispatch_names_and_refusals(self):
        data, _ = make_pef()
        self.assertTrue(pef.is_pef(data))
        self.assertEqual(pef.camera_model(data), "Pentax K-1 Mark II")
        self.assertEqual(pef.camera_model(make_pef(model="K10D", make="PENTAX Corporation")[0]), "Pentax K10D")
        samsung = make_pef(model="GX10", make="SAMSUNG TECHWIN")[0]
        self.assertTrue(pef.is_pef(samsung))
        self.assertEqual(pef.camera_model(samsung), "Samsung GX10")
        self.assertEqual(rd.parse_raw(samsung).source, "pef")  # not taken for an SRW
        self.assertEqual(rd.parse_raw(data).source, "pef")
        tiff = b"II*\0" + struct.pack("<I", 8) + _ifd_bytes([(271, 2, tuple(b"PENTAX\0"))], 8)
        self.assertFalse(pef.is_pef(tiff))
        with self.assertRaisesRegex(rd.DevelopError, "not a Pentax PEF"):
            pef.parse_pef(tiff)
        self.assertFalse(pef.is_pef(make_pef(make="NIKON")[0]))
        for name in ("IMGP0001.PEF", "imgp0001.pef"):
            self.assertTrue(raw_preview.needs_profile_path(Path(name)))
            self.assertTrue(raw_preview.is_raw_path(Path(name)))
            self.assertTrue(raw_preview.is_developable_path(Path(name)))

    def test_ingest_and_catalog_take_pef(self):
        self.assertIn(".pef", ingest.MEDIA_EXTENSIONS)
        self.assertIn(".pef", catalog._PHOTO_EXTENSIONS)


class DevelopTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)
        (self.dir / "profiles").mkdir()
        (self.dir / "profiles" / "Pentax K-1 Mark II Adobe Standard.dcp").write_bytes(make_profile("Pentax K-1 Mark II"))

    def test_needs_a_profile(self):
        raw = rd.parse_raw(make_pef()[0])
        with self.assertRaisesRegex(rd.DevelopError, "a PEF carries no colour matrix.*Pentax K-1 Mark II"):
            rd.develop(raw, rd.DevelopSettings(engine="python"))

    def test_profile_chooser_and_cli(self):
        src = self.dir / "IMGP0001.PEF"
        src.write_bytes(make_pef()[0])
        self.assertEqual(camera_profiles.camera_of(src), "Pentax K-1 Mark II")
        out, err = io.StringIO(), io.StringIO()
        code = main(["develop", str(src), "--out", str(self.dir / "m"), "--dcp", str(self.dir / "profiles")], stdout=out, stderr=err)
        self.assertEqual(code, 0, err.getvalue())
        master = self.dir / "m" / "IMGP0001.tif"
        tif = rd._Reader(master.read_bytes())
        ifd, _ = tif.read_ifd(tif.first_ifd_offset())
        self.assertEqual((ifd.one(rd.TAG_WIDTH), ifd.one(rd.TAG_HEIGHT)), (22, 8))  # the preview-sized crop
        self.assertIn("Pentax K-1 Mark II Adobe Standard.dcp", out.getvalue())


if __name__ == "__main__":
    unittest.main()
