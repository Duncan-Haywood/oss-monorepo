"""Panasonic RW2 read straight into the developer (``shootflow.rw2``).

Each test builds a small RW2 here: a TIFF with the RW2 magic ("IIU\\0") whose
IFD0 holds Panasonic's sensor size, borders, CFA code, black levels and white
balance tags, and a RawDataOffset pointing at sensor data coded by an encoder in
this file. The encoder picks a shift for every three sensels and writes each
value through the decoder's own bit addressing (rotated 0x4000-byte blocks,
17-bit positions read downward), so every decoded sensel is checked exactly, on
the C decoder and the Python reference. Four real RW2s against LibRaw (every
sensel equal): ``tools/rw2_libraw_check.py`` and
``eval/panasonic-rw2-reader-2026-11-14.md``.
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

from shootflow import camera_profiles, lens_profiles, ljpeg_native, raw_preview, rw2
from shootflow import raw_develop as rd
from shootflow.cli import main
from test_arw import make_profile
from test_raw_develop import _ifd_bytes

W, H = 36, 10


class _PanaWriter:
    """Writes values where ``rw2._decode_python``'s ``bits`` reads them: blocks of 0x4000 bytes in their rotated
    order, 17-bit positions counting down from the top of each block."""

    def __init__(self):
        self.blocks: list[bytearray] = []
        self.vbits = 0
        self.set: list[set] = []

    def put(self, value: int, n: int) -> None:
        if self.vbits == 0:
            self.blocks.append(bytearray(rw2.BLOCK + 1))
            self.set.append(set())
            self.vbits = 0x20000  # a fresh block: positions count down from its top
        assert self.vbits >= n, "a value straddling two blocks: pick another size"
        self.vbits = (self.vbits - n) & 0x1FFFF
        buf, used = self.blocks[-1], self.set[-1]
        at = (self.vbits >> 3) ^ 0x3FF0
        shift = self.vbits & 7
        for k in range(n):
            byte, bit = at + (shift + k) // 8, (shift + k) % 8
            assert (byte, bit) not in used, "two values on one bit"
            used.add((byte, bit))
            if (value >> k) & 1:
                buf[byte] |= 1 << bit

    def file_bytes(self) -> bytes:
        """The blocks as the camera writes them: each rotated back (its first 0x2008 bytes go last)."""

        out = bytearray()
        for b in self.blocks:
            b = bytes(b[: rw2.BLOCK])
            out += b[rw2.SPLIT :] + b[: rw2.SPLIT]
        assert rw2.rotated_blocks(bytes(out)) == b"".join(bytes(b[: rw2.BLOCK]) for b in self.blocks)
        return bytes(out)


def _step(pred: int, sh: int, j: int) -> int:
    """The decoder's update for a non-zero step ``j`` at shift ``sh``."""

    pred -= 0x80 << sh
    if pred < 0 or sh == 4:
        pred &= ~(-1 << sh)
    return pred + (j << sh)


def _code(pred: int, sh: int, v: int) -> int | None:
    """The 8-bit step that takes ``pred`` to ``v`` at shift ``sh``, or None."""

    if v == pred:
        return 0
    for j in range(1, 256):
        if _step(pred, sh, j) == v:
            return j
    return None


SHIFT_CODE = {0: 0, 1: 1, 2: 2, 4: 3}  # sh = 4 >> (3 - code)


def encode(values, width, height):
    """Panasonic-compress 12-bit ``values`` (row-major) into RawFormat 4 sensor data; returns (bytes, shifts used)."""

    wr = _PanaWriter()
    used = set()
    for row in range(height):
        base = row * width
        pred, nonz, sh = [0, 0], [0, 0], 0
        col = 0
        while col < width:
            i = col % rw2.RUN
            if i == 0:
                pred, nonz = [0, 0], [0, 0]
            if i % 3 == 2:
                # The smallest shift that codes the next three sensels (fewer when the row or run ends).
                span = [c for c in range(col, min(col + 3, width)) if c // rw2.RUN == col // rw2.RUN]
                for sh in (0, 1, 2, 4):
                    p, nz, ok = list(pred), list(nonz), True
                    for c in span:
                        q, v = (c % rw2.RUN) & 1, values[base + c]
                        if not nz[q]:  # a first value is coded whole, at any shift
                            nz[q] = v >> 4
                            if nz[q] or c % rw2.RUN > 11:
                                p[q] = v
                            continue
                        j = _code(p[q], sh, v)
                        if j is None:
                            ok = False
                            break
                        if j:
                            p[q] = _step(p[q], sh, j)
                    if ok:
                        break
                else:
                    raise AssertionError(f"no shift codes row {row} columns {span}")
                wr.put(SHIFT_CODE[sh], 2)
                used.add(sh)
            q = i & 1
            v = values[base + col]
            if nonz[q]:
                j = _code(pred[q], sh, v)
                assert j is not None
                wr.put(j, 8)
                if j:
                    pred[q] = _step(pred[q], sh, j)
            else:
                assert v == 0 or v >= 16 or i > 11, "a run's first value per parity is 0 or at least 16"
                nonz[q] = v >> 4
                wr.put(nonz[q], 8)
                if nonz[q] or i > 11:
                    wr.put(v & 15, 4)
                    pred[q] = v
            assert pred[q] == v
            col += 1
    return wr.file_bytes(), used


def field(seed=3, width=W, height=H):
    """Values the format can code: built from random shifts and steps, mostly small (a smooth picture) with
    some large ones (edges), then coded back from the values alone by ``encode``."""

    rng = random.Random(seed)
    vals = []
    for _row in range(height):
        pred, nonz, sh = [0, 0], [0, 0], 0
        for col in range(width):
            i = col % rw2.RUN
            if i == 0:
                pred, nonz = [0, 0], [0, 0]
            if i % 3 == 2:
                sh = rng.choice((0, 0, 0, 1, 2, 4))
            q = i & 1
            if not nonz[q]:
                v = 0 if rng.random() < 0.05 else rng.randint(16, 4095)
                nonz[q] = v >> 4
                if nonz[q] or i > 11:
                    pred[q] = v
            elif rng.random() >= 0.1:
                ok = [j for j in range(1, 256) if _step(pred[q], sh, j) <= 4095]
                near = [j for j in ok if abs(_step(pred[q], sh, j) - pred[q]) <= 60]
                pred[q] = _step(pred[q], sh, rng.choice(near if near and rng.random() < 0.8 else ok))
            vals.append(pred[q])
    return vals


def _encodable(seed, width, height):
    vals = field(seed, width, height)
    return vals, encode(vals, width, height)


def make_rw2(*, width=W, height=H, cfa=2, black=(128, 129, 130), wb=(662, 256, 370), model="DMC-GF7",
             borders=(2, 4, 8, 32), linearity=4095, values=None, raw_format=4, jpeg=None):
    """An RW2: (file bytes, expected sensels). ``borders`` = (top, left, bottom, right); ``jpeg`` is the
    embedded JpgFromRaw (tag 0x2E), when given."""

    if values is None:
        expected, (payload, _) = _encodable(5, width, height)
    else:
        expected, (payload, _) = values, encode(values, width, height)

    def ifd0(data_at):
        e = [
            (0x02, 3, (width,)), (0x03, 3, (height,)),
            (0x04, 3, (borders[0],)), (0x05, 3, (borders[1],)), (0x06, 3, (borders[2],)), (0x07, 3, (borders[3],)),
            (0x09, 3, (cfa,)), (0x0A, 3, (12,)), (0x0B, 3, (34316,)),
            (0x0E, 3, (linearity,)), (0x0F, 3, (linearity,)), (0x10, 3, (linearity,)),
            (0x2D, 3, (raw_format,)),
            (271, 2, tuple(b"Panasonic\0")), (272, 2, tuple(model.encode() + b"\0")),
            (273, 4, (0xFFFFFFFF,)), (0x118, 4, (data_at,)),
        ]
        if black:
            e += [(0x1C, 3, (black[0],)), (0x1D, 3, (black[1],)), (0x1E, 3, (black[2],))]
        if wb:
            e += [(0x24, 3, (wb[0],)), (0x25, 3, (wb[1],)), (0x26, 3, (wb[2],))]
        if jpeg is not None:
            e.append((0x2E, 7, tuple(jpeg)))
        return e

    head_len = 8 + len(_ifd_bytes(ifd0(0), 8))
    blob = b"IIU\0" + struct.pack("<I", 8) + _ifd_bytes(ifd0(head_len), 8) + payload
    return blob, expected


def make_jpeg(lens_type=b"LUMIX G 20/F1.7", serial=b"00FG3102554", lens_model=None, magic=b"Panasonic\0\0\0",
              focal=20.0):
    """A JPEG head as a Lumix body embeds it: SOI, APP0, then APP1 "Exif" holding IFD0 -> EXIF IFD with
    FocalLength and a maker note ("Panasonic\\0\\0\\0", then an IFD whose offsets count from the EXIF's
    TIFF header) naming the lens in 0x51 and its serial in 0x52; then SOS and EOI (no picture data)."""

    exif_at = 8 + 2 + 12 + 4

    def exif_entries(note_bytes):
        e = [(0x920A, 5, (focal,)), (0x927C, 7, tuple(note_bytes))]
        if lens_model is not None:
            e.append((0xA434, 2, tuple(lens_model + b"\0")))
        return e

    def note_ifd(at):
        e = []
        if lens_type is not None:
            e.append((0x51, 2, tuple(lens_type + b"\0")))
        if serial is not None:
            e.append((0x52, 2, tuple(serial + b"\0")))
        return _ifd_bytes(e, at)

    # The note's place: after the EXIF IFD and the payloads _ifd_bytes puts before it (FocalLength's
    # 8 bytes; LensModel, tag 0xA434, sorts after the note and comes later).
    n = len(exif_entries(b""))
    note_at = exif_at + 2 + 12 * n + 4 + 8
    note = magic + note_ifd(note_at + len(magic))
    tiff = b"II*\0" + struct.pack("<I", 8) + _ifd_bytes([(0x8769, 4, (exif_at,))], 8)
    tiff += _ifd_bytes(exif_entries(note), exif_at)
    assert tiff[note_at : note_at + len(magic)] == magic
    app1 = b"Exif\0\0" + tiff
    app0 = b"JFIF\0\1\1\0\0\1\0\1\0\0"
    return (b"\xff\xd8" + b"\xff\xe0" + struct.pack(">H", len(app0) + 2) + app0
            + b"\xff\xe1" + struct.pack(">H", len(app1) + 2) + app1 + b"\xff\xda\x00\x02\xff\xd9")


LENS_XML = """<lensdatabase version="2">
    <mount><name>Micro 4/3 System</name></mount>
    <camera><maker>Panasonic</maker><model>DMC-GF7</model><mount>Micro 4/3 System</mount><cropfactor>2.0</cropfactor></camera>
    <lens>
        <maker>Panasonic</maker>
        <model>Lumix G 20mm f/1.7 Asph.</model>
        <mount>Micro 4/3 System</mount>
        <cropfactor>2.0</cropfactor>
        <calibration><distortion model="ptlens" focal="20" a="0.01" b="-0.03" c="0.002"/></calibration>
    </lens>
    <lens>
        <maker>Panasonic</maker>
        <model>Lumix G Vario 12-32mm f/3.5-5.6 Asph. Mega OIS</model>
        <mount>Micro 4/3 System</mount>
        <cropfactor>2.0</cropfactor>
        <calibration><distortion model="ptlens" focal="12" a="0.02" b="-0.05" c="0.004"/></calibration>
    </lens>
</lensdatabase>
"""


class LensTests(unittest.TestCase):
    """The lens an RW2 names only in its embedded JPEG's maker note (no lensfun data copied: made-up XML).
    The four real RW2s against metadata-extractor and lensfun 0.3.4: ``tools/rw2_lens_check.py``,
    ``eval/panasonic-rw2-lens-2026-11-14.md``."""

    def parse(self, **jpeg):
        blob, _ = make_rw2(jpeg=make_jpeg(**jpeg))
        return rw2.parse_rw2(blob)

    def test_lens_type_becomes_lens_model(self):
        raw = self.parse()
        self.assertEqual(rw2._text(raw.exif.get(rw2.TAG_LENS_MODEL)), "LUMIX G 20/F1.7")
        self.assertIn("RW2: lens 'LUMIX G 20/F1.7' from the embedded JPEG's Panasonic maker note (LensType)",
                      raw.notes)
        info = lens_profiles.shot_info(raw.ifd0, raw.exif)
        self.assertEqual((info.make, info.model, info.lens, info.focal), ("Panasonic", "DMC-GF7", "LUMIX G 20/F1.7", 20.0))
        blob, _ = make_rw2(jpeg=make_jpeg())
        reader = rd._Reader(blob)
        _, note = rw2.embedded_exif(blob, rd._all_ifds(reader)[0])
        self.assertEqual(rw2._text(note.get(rw2.PANA_NOTE_LENS_SERIAL)), "00FG3102554")

    def test_embedded_lens_model_wins_and_maker_note_stays_out(self):
        raw = self.parse(lens_model=b"LUMIX G VARIO 12-32/F3.5-5.6")
        self.assertEqual(rw2._text(raw.exif.get(rw2.TAG_LENS_MODEL)), "LUMIX G VARIO 12-32/F3.5-5.6")
        self.assertTrue(any("from the embedded JPEG's EXIF" in n for n in raw.notes))
        self.assertNotIn(rw2.TAG_EXIF_MAKER_NOTE, raw.exif.entries)

    def test_no_jpeg_no_lens_and_odd_notes_ignored(self):
        blob, _ = make_rw2()
        raw = rw2.parse_rw2(blob)
        self.assertIsNone(raw.exif)
        self.assertFalse(any("lens" in n for n in raw.notes))
        for kw in ({"magic": b"LEICA\0\0\0\0\0\0\0"}, {"lens_type": None}, {"lens_type": b"   "}):
            raw = self.parse(**kw)
            self.assertIsNone(raw.exif.get(rw2.TAG_LENS_MODEL), kw)
            self.assertEqual(raw.exif.get(0x920A), (20.0,))  # the JPEG's other EXIF tags still fill in
        for bad in (b"", b"\xff\xd8", b"\xff\xd8\xff\xe1\x00\x01", b"\xff\xd8\xff\xe1\x00\x10Exif\0\0II*\0\xff\xff\xff\x7f",
                    b"not a jpeg at all"):
            blob, _ = make_rw2(jpeg=bad)
            self.assertIsNone(rw2.parse_rw2(blob).exif, bad)

    def test_lensfun_picks_the_lens_from_the_name(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "m43.xml"
            path.write_text(LENS_XML)
            db = lens_profiles.load_db([str(path)])
            for lens_type, focal, want in ((b"LUMIX G 20/F1.7", 20.0, "Lumix G 20mm f/1.7 Asph."),
                                           (b"LUMIX G VARIO 12-32/F3.5-5.6", 12.0,
                                            "Lumix G Vario 12-32mm f/3.5-5.6 Asph. Mega OIS")):
                raw = self.parse(lens_type=lens_type, focal=focal)
                corr = lens_profiles.correction_for(db, lens_profiles.shot_info(raw.ifd0, raw.exif), 400, 300,
                                                    vignetting=False)
                self.assertEqual(corr.lens.name, want)


def engines():
    return ["python", "native"] if ljpeg_native.available() else ["python"]


class ReadTests(unittest.TestCase):
    def test_sensels_exact_on_both_engines(self):
        data, expected = make_rw2()
        for engine in engines():
            raw = rw2.parse_rw2(data, engine=engine)
            self.assertEqual(list(raw.values), expected, engine)
        self.assertEqual(raw.source, "rw2")
        self.assertIn("RawFormat 4", raw.notes[0])

    def test_every_shift_and_several_blocks(self):
        # 154 x 300 sensels at about nine bits each fill more than two 0x4000-byte blocks; the field uses most shifts.
        width, height = 154, 300
        for seed in (1, 2):
            vals, (payload, used) = _encodable(seed, width, height)
            self.assertGreater(len(payload), 2 * rw2.BLOCK)
            self.assertIn(4, used)
            self.assertGreaterEqual(len(used), 3)
            for e in engines():
                got = list(rw2.decode_panasonic(payload, width, height, engine=e))
                self.assertEqual(got, vals, (seed, e))

    def test_zero_runs_and_late_first_values(self):
        # A parity that stays at zero until the run's last two sensels reads four more bits there.
        width = 28
        vals = []
        for x in range(width):
            vals.append(0 if x % 14 < 12 else 5 + x % 14)
        vals = vals * 2
        payload, _ = encode(vals, width, 2)
        for e in engines():
            self.assertEqual(list(rw2.decode_panasonic(payload, width, 2, engine=e)), vals, e)

    def test_truncated_data_reads_zeros_on_both_decoders(self):
        payload, _ = encode(make_rw2()[1], W, H)
        cut = payload[:100]
        outs = {e: tuple(rw2.decode_panasonic(cut, W, H, engine=e)) for e in engines()}
        self.assertEqual(len(set(outs.values())), 1)

    def test_tags_levels_balance_cfa_and_crop(self):
        e = rw2.parse_rw2(make_rw2()[0]).ifd.entries
        # GRBG; black is the tag plus 15 (as dcraw and LibRaw), green's for both greens.
        self.assertEqual(e[rd.TAG_CFA_PATTERN], (1, 0, 2, 1))
        self.assertEqual(e[rd.TAG_BLACK_LEVEL], (144.0, 143.0, 145.0, 144.0))
        r, _, b = (1 / v for v in e[rd.TAG_AS_SHOT_NEUTRAL])
        self.assertAlmostEqual(r, 662 / 256)
        self.assertAlmostEqual(b, 370 / 256)
        self.assertEqual(e[rd.TAG_WHITE_LEVEL], (4095,))
        self.assertEqual((e[rd.TAG_CROP_ORIGIN], e[rd.TAG_CROP_SIZE]), ((4, 2), (28, 6)))
        for code, pattern in ((1, (0, 1, 1, 2)), (3, (1, 2, 0, 1)), (4, (2, 1, 1, 0))):
            got = rw2.parse_rw2(make_rw2(cfa=code)[0]).ifd.entries[rd.TAG_CFA_PATTERN]
            self.assertEqual(got, pattern)
        # The GF1 writes 16383 as its linearity limit: the 12-bit ceiling is kept.
        self.assertEqual(rw2.parse_rw2(make_rw2(linearity=16383)[0]).ifd.entries[rd.TAG_WHITE_LEVEL], (4095,))
        self.assertEqual(rw2.parse_rw2(make_rw2(linearity=3900)[0]).ifd.entries[rd.TAG_WHITE_LEVEL], (3900,))
        outside = rw2.parse_rw2(make_rw2(borders=(0, 0, 12, 40))[0]).ifd.entries
        self.assertNotIn(rd.TAG_CROP_SIZE, outside)
        no_wb = rw2.parse_rw2(make_rw2(wb=None)[0])
        self.assertNotIn(rd.TAG_AS_SHOT_NEUTRAL, no_wb.ifd.entries)
        self.assertTrue(any("white balance" in n for n in no_wb.notes))

    def test_other_raw_formats_are_refused(self):
        with self.assertRaisesRegex(rd.DevelopError, "RawFormat 5.*not supported"):
            rw2.parse_rw2(make_rw2(raw_format=5)[0])

    def test_dispatch_and_names(self):
        data, _ = make_rw2()
        self.assertTrue(rw2.is_rw2(data))
        self.assertEqual(rw2.camera_model(data), "Panasonic DMC-GF7")
        self.assertEqual(rd.parse_raw(data).source, "rw2")
        tiff = b"II*\0" + struct.pack("<I", 8) + _ifd_bytes([(271, 2, tuple(b"Panasonic\0"))], 8)
        self.assertFalse(rw2.is_rw2(tiff))
        with self.assertRaisesRegex(rd.DevelopError, "not a Panasonic RW2"):
            rw2.parse_rw2(tiff)
        self.assertTrue(raw_preview.needs_profile_path(Path("P1000001.RW2")))


class DevelopTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)
        (self.dir / "profiles").mkdir()
        (self.dir / "profiles" / "Panasonic DMC-GF7 Adobe Standard.dcp").write_bytes(make_profile("Panasonic DMC-GF7"))

    def test_needs_a_profile(self):
        raw = rd.parse_raw(make_rw2()[0])
        with self.assertRaisesRegex(rd.DevelopError, "an RW2 carries no colour matrix.*Panasonic DMC-GF7"):
            rd.develop(raw, rd.DevelopSettings(engine="python"))

    def test_profile_chooser_and_cli(self):
        src = self.dir / "P1000001.RW2"
        src.write_bytes(make_rw2()[0])
        self.assertEqual(camera_profiles.camera_of(src), "Panasonic DMC-GF7")
        out, err = io.StringIO(), io.StringIO()
        code = main(["develop", str(src), "--out", str(self.dir / "m"), "--dcp", str(self.dir / "profiles")], stdout=out, stderr=err)
        self.assertEqual(code, 0, err.getvalue())
        master = self.dir / "m" / "P1000001.tif"
        self.assertTrue(master.exists())
        tif = rd._Reader(master.read_bytes())
        ifd, _ = tif.read_ifd(tif.first_ifd_offset())
        self.assertEqual((ifd.one(rd.TAG_WIDTH), ifd.one(rd.TAG_HEIGHT)), (28, 6))  # the sensor borders applied
        self.assertIn("Panasonic DMC-GF7 Adobe Standard.dcp", out.getvalue())


if __name__ == "__main__":
    unittest.main()
