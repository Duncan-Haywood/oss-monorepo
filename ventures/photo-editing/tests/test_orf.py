"""Olympus ORF read straight into the developer (``shootflow.orf``).

Each test builds a small ORF here: a TIFF with the ORF magic ("IIRO", or "IIRS"
for the packed compacts) whose IFD0 holds the sensor strip and points at an EXIF
IFD carrying the CFAPattern and an Olympus maker note. The newer note
("OLYMPUS\\0" + byte order + 3) has an ImageProcessing sub-IFD with WB_RBLevels
and BlackLevel2; the older ("OLYMP\\0") has RedBalance and BlueBalance in its
main IFD, with offsets from the file's header. The compressed sensor is coded by
an encoder in this file that inverts the decoder's rules (escape field included),
so every decoded sensel is checked exactly, on the C decoder and the Python
reference. 18 real ORFs against LibRaw (every sensel equal):
``tools/orf_libraw_check.py`` and ``eval/olympus-orf-reader-2026-11-14.md``.
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

from shootflow import camera_profiles, ljpeg_native, orf
from shootflow import raw_develop as rd
from shootflow.cli import main
from test_arw import make_profile
from test_raw_develop import _ifd_bytes

W, H = 36, 10


class _BitWriter:
    def __init__(self):
        self.acc, self.n, self.out = 0, 0, bytearray()

    def put(self, value: int, n: int) -> None:
        for i in range(n - 1, -1, -1):
            self.acc = (self.acc << 1) | ((value >> i) & 1)
            self.n += 1
            if self.n == 8:
                self.out.append(self.acc)
                self.acc, self.n = 0, 0

    def done(self) -> bytes:
        if self.n:
            self.out.append(self.acc << (8 - self.n))
        return bytes(self.out) + b"\0" * 8


def _predict(out, row, col, width):
    if row < 2 and col < 2:
        return 0
    if row < 2:
        return out[row * width + col - 2]
    if col < 2:
        return out[(row - 2) * width + col]
    w = out[row * width + col - 2]
    n = out[(row - 2) * width + col]
    nw = out[(row - 2) * width + col - 2]
    if (w < nw < n) or (n < nw < w):
        return w + n - nw if (abs(w - nw) > 32 or abs(n - nw) > 32) else (w + n) >> 1
    return w if abs(w - nw) > abs(n - nw) else n


def encode(values, width, height):
    """Olympus-compress 12-bit ``values`` (row-major): 7 header bytes, then the stream. Lossless."""

    wr = _BitWriter()
    out = [0] * (width * height)
    escapes = 0
    for row in range(height):
        carry = [[0, 0, 0], [0, 0, 0]]
        for col in range(width):
            c = carry[col & 1]
            i = 2 if c[2] < 3 else 0
            nbits = 2 + i
            while (c[0] & 0xFFFF) >> (nbits + i):
                nbits += 1
            v = values[row * width + col]
            residual = v - _predict(out, row, col, width)
            low, diff = residual & 3, residual >> 2
            m = diff - c[1]
            sign, c0 = (0, m) if m >= 0 else (1, -m - 1)
            high = c0 >> nbits
            wr.put((sign << 2) | low, 3)
            if high >= 12:
                assert (high << 1) < (1 << (16 - nbits)), "magnitude too large for the escape field"
                wr.put(0, 12)
                wr.put(high << 1, 16 - nbits)
                escapes += 1
            else:
                wr.put(1, high + 1)  # high zeros, then a one
            wr.put(c0 & ((1 << nbits) - 1), nbits)
            c[0] = c0
            d = (c0 ^ (-1 if sign else 0)) + c[1]
            assert d == diff
            c[1] = (d * 3 + c[1]) >> 5
            c[2] = 0 if c0 > 16 else c[2] + 1
            out[row * width + col] = v
    return b"\0" * orf.OLYMPUS_HEADER + wr.done(), escapes


def field(seed=3, width=W, height=H):
    rng = random.Random(seed)
    vals = []
    for y in range(height):
        for x in range(width):
            v = 300 + 40 * x + 25 * y + rng.randint(-30, 30)
            if (x * 7 + y * 3) % 13 == 0:
                v += 2500  # sharp spikes: large differences take the escape field
            if x > width // 2 and y % 3 == 0:
                v = 60 + rng.randint(0, 5)  # flat dark run: small magnitudes, the run counter
            vals.append(max(0, min(4095, v)))
    return vals


def _new_note(wb, black, crop=None):
    """'OLYMPUS\\0II' + 3, main IFD at 12 pointing at ImageProcessing; offsets from the note's start."""

    ip_entries = []
    if wb:
        ip_entries.append((0x0100, 3, (wb[0], wb[1], 256, 256)))
    if black:
        ip_entries.append((0x0600, 3, tuple(black)))
    if crop:
        ip_entries += [(0x0612 + k, 3, (v, 0)) for k, v in enumerate(crop)]
    main_at = 12
    main_len = len(_ifd_bytes([(0x2040, 4, (0,))], main_at))
    ip_at = main_at + main_len
    return b"OLYMPUS\0II\x03\0" + _ifd_bytes([(0x2040, 4, (ip_at,))], main_at) + _ifd_bytes(ip_entries, ip_at)


def make_orf(*, wb=(536, 414), black=(254, 255, 253, 252), cfa=(0, 1, 1, 2), model="E-M10",
             make="OLYMPUS IMAGING CORP.", values=None, crop=(2, 2, 30, 6)):
    """A compressed ORF: (file bytes, expected sensels)."""

    expected = values if values is not None else field()
    payload, _ = encode(expected, W, H)
    note = _new_note(wb, black, crop)
    cfa_bytes = struct.pack("<HH", 2, 2) + bytes(cfa)
    exif_entries = [(0xA302, 7, tuple(cfa_bytes)), (37500, 7, tuple(note))]
    ifd0 = lambda exif_at, data_at: [  # noqa: E731
        (256, 4, (W,)), (257, 4, (H,)), (258, 3, (16,)), (259, 3, (1,)), (262, 3, (1,)),
        (271, 2, tuple(make.encode() + b"\0")), (272, 2, tuple(model.encode() + b"\0")),
        (273, 4, (data_at,)), (279, 4, (len(payload),)), (34665, 4, (exif_at,)),
    ]
    exif_at = 8 + len(_ifd_bytes(ifd0(0, 0), 8))
    exif = _ifd_bytes(exif_entries, exif_at)
    data_at = exif_at + len(exif)
    blob = b"IIRO" + struct.pack("<I", 8) + _ifd_bytes(ifd0(exif_at, data_at), 8) + exif + payload
    return blob, expected


def make_packed(width=8, tiff_height=5):
    """An 'IIRS' 12-bit packed interlaced ORF with an old 'OLYMP\\0' note: (file bytes, expected, height)."""

    height = tiff_height + (tiff_height & 1)
    rng = random.Random(11)
    expected = [rng.randint(0, 4095) for _ in range(width * height)]

    def pack(rows):
        wr = _BitWriter()
        for r in rows:
            for v in expected[r * width : (r + 1) * width]:
                wr.put(v, 12)
        return wr.done()[: len(rows) * width * 3 // 2]

    half = (height + 1) // 2
    even, odd = pack(range(0, height, 2)), pack(range(1, height, 2))
    gap = -(-len(even) // orf.FIELD_ALIGN) * orf.FIELD_ALIGN - len(even)
    sensor = even + b"\xAA" * gap + odd
    assert len(even) == half * width * 3 // 2
    strip_bytes = width * tiff_height * 3 // 2  # what the TIFF says: one row short when the height is odd

    def ifd0(exif_at, data_at):
        return [
            (256, 4, (width,)), (257, 4, (tiff_height,)), (258, 3, (12,)), (259, 3, (1,)), (262, 3, (2,)),
            (271, 2, tuple(b"OLYMPUS OPTICAL CO.,LTD\0")), (272, 2, tuple(b"C5050Z\0")),
            (273, 4, (data_at,)), (279, 4, (strip_bytes,)), (34665, 4, (exif_at,)),
        ]

    exif_at = 8 + len(_ifd_bytes(ifd0(0, 0), 8))
    # The old note: 'OLYMP\0' + version, IFD 8 bytes in, offsets from the file's header.
    cfa_bytes = struct.pack("<HH", 2, 2) + bytes((2, 1, 1, 0))
    probe = _ifd_bytes([(0xA302, 7, tuple(cfa_bytes)), (37500, 7, (0,) * 64)], exif_at)
    note_at = exif_at + len(probe) - 64
    note_ifd = _ifd_bytes([(0x1017, 3, (350, 62)), (0x1018, 3, (412, 64))], note_at + 8)
    note = (b"OLYMP\0\x01\0" + note_ifd).ljust(64, b"\0")
    exif = _ifd_bytes([(0xA302, 7, tuple(cfa_bytes)), (37500, 7, tuple(note))], exif_at)
    assert len(exif) == len(probe)
    data_at = exif_at + len(exif)
    blob = b"IIRS" + struct.pack("<I", 8) + _ifd_bytes(ifd0(exif_at, data_at), 8) + exif + sensor
    return blob, expected, height


def engines():
    return ["python", "native"] if ljpeg_native.available() else ["python"]


class ReadTests(unittest.TestCase):
    def test_compressed_sensels_exact_on_both_engines(self):
        data, expected = make_orf()
        _, escapes = encode(expected, W, H)
        self.assertGreater(escapes, 0, "the test field should exercise the escape field")
        for engine in engines():
            raw = orf.parse_orf(data, engine=engine)
            self.assertEqual(list(raw.values), expected, engine)
        self.assertEqual(raw.notes[0], "ORF: Olympus compressed (12-bit)")
        self.assertEqual(raw.source, "orf")

    def test_random_fields_both_engines_agree(self):
        for seed in range(4):
            vals = field(seed=seed + 20)
            payload, _ = encode(vals, W, H)
            outs = {e: list(orf.decode_olympus(payload, W, H, engine=e)) for e in engines()}
            for e, got in outs.items():
                self.assertEqual(got, vals, (seed, e))

    def test_truncated_stream_reads_zeros_on_both_decoders(self):
        payload, _ = encode(field(), W, H)
        cut = payload[:60]
        outs = {e: tuple(orf.decode_olympus(cut, W, H, engine=e)) for e in engines()}
        self.assertEqual(len(set(outs.values())), 1)

    def test_maker_note_levels_balance_and_cfa(self):
        raw = orf.parse_orf(make_orf()[0])
        e = raw.ifd.entries
        # BlackLevel2 is R, green on red rows, green on blue rows, B: placed on RGGB positions.
        self.assertEqual(e[rd.TAG_BLACK_LEVEL], (254.0, 255.0, 253.0, 252.0))
        r, _, b = (1 / v for v in e[rd.TAG_AS_SHOT_NEUTRAL])
        self.assertAlmostEqual(r, 536 / 256)
        self.assertAlmostEqual(b, 414 / 256)
        self.assertEqual(e[rd.TAG_CFA_PATTERN], (0, 1, 1, 2))
        self.assertEqual(e[rd.TAG_WHITE_LEVEL], (4095,))
        # The camera JPEG's frame (ImageProcessing 0x0612-0x0615) becomes the DefaultCrop.
        self.assertEqual((e[rd.TAG_CROP_ORIGIN], e[rd.TAG_CROP_SIZE]), ((2, 2), (30, 6)))
        outside = orf.parse_orf(make_orf(crop=(8, 0, 36, 10))[0]).ifd.entries
        self.assertNotIn(rd.TAG_CROP_SIZE, outside)
        # On a GRBG body the first green sits on the red row, the second on the blue row.
        g = orf.parse_orf(make_orf(cfa=(1, 0, 2, 1))[0]).ifd.entries[rd.TAG_BLACK_LEVEL]
        self.assertEqual(g, (255.0, 254.0, 252.0, 253.0))
        no_wb = orf.parse_orf(make_orf(wb=None)[0])
        self.assertNotIn(rd.TAG_AS_SHOT_NEUTRAL, no_wb.ifd.entries)
        self.assertTrue(any("white balance" in n for n in no_wb.notes))

    def test_packed_interlaced_compact(self):
        data, expected, height = make_packed()
        raw = orf.parse_orf(data)
        self.assertEqual(raw.height, height)  # one more row than the TIFF height, as the camera stored it
        self.assertEqual(list(raw.values), expected)
        self.assertIn("interlaced", raw.notes[0])
        e = raw.ifd.entries
        self.assertEqual(e[rd.TAG_CFA_PATTERN], (2, 1, 1, 0))
        self.assertEqual(e[rd.TAG_BLACK_LEVEL], (0.0,) * 4)
        r, _, b = (1 / v for v in e[rd.TAG_AS_SHOT_NEUTRAL])
        self.assertAlmostEqual(r, 350 / 256)
        self.assertAlmostEqual(b, 412 / 256)

    def test_unknown_layout_is_refused(self):
        data, _ = make_orf()
        # A strip of exactly 16 bits per sensel is a layout no test file had: refused, not guessed.
        big = data.replace(struct.pack("<HHII", 279, 4, 1, len(encode(field(), W, H)[0])),
                           struct.pack("<HHII", 279, 4, 1, 2 * W * H))
        self.assertNotEqual(big, data)
        with self.assertRaisesRegex(rd.DevelopError, "layout .* is not supported"):
            orf.parse_orf(big + b"\0" * (2 * W * H))

    def test_dispatch_and_names(self):
        data, _ = make_orf()
        self.assertTrue(orf.is_orf(data))
        self.assertEqual(orf.camera_model(data), "Olympus E-M10")
        om = make_orf(make="OM Digital Solutions", model="OM-1")[0]
        self.assertEqual(orf.camera_model(om), "OM Digital Solutions OM-1")
        self.assertEqual(rd.parse_raw(data).source, "orf")
        tiff = b"II*\0" + struct.pack("<I", 8) + _ifd_bytes([(271, 2, tuple(b"OLYMPUS\0"))], 8)
        self.assertFalse(orf.is_orf(tiff))  # an Olympus TIFF without the ORF magic (a JPEG's EXIF, say)
        with self.assertRaisesRegex(rd.DevelopError, "not an Olympus ORF"):
            orf.parse_orf(tiff)


class DevelopTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)
        (self.dir / "profiles").mkdir()
        (self.dir / "profiles" / "Olympus E-M10 Adobe Standard.dcp").write_bytes(make_profile("Olympus E-M10"))

    def test_needs_a_profile(self):
        raw = rd.parse_raw(make_orf()[0])
        with self.assertRaisesRegex(rd.DevelopError, "an ORF carries no colour matrix.*Olympus E-M10"):
            rd.develop(raw, rd.DevelopSettings(engine="python"))

    def test_profile_chooser_and_cli(self):
        src = self.dir / "P1010001.ORF"
        src.write_bytes(make_orf()[0])
        self.assertEqual(camera_profiles.camera_of(src), "Olympus E-M10")
        out, err = io.StringIO(), io.StringIO()
        code = main(["develop", str(src), "--out", str(self.dir / "m"), "--dcp", str(self.dir / "profiles")], stdout=out, stderr=err)
        self.assertEqual(code, 0, err.getvalue())
        master = self.dir / "m" / "P1010001.tif"
        self.assertTrue(master.exists())
        tif = rd._Reader(master.read_bytes())
        ifd, _ = tif.read_ifd(tif.first_ifd_offset())
        self.assertEqual((ifd.one(rd.TAG_WIDTH), ifd.one(rd.TAG_HEIGHT)), (30, 6))  # the camera's crop applied
        self.assertIn("Olympus E-M10 Adobe Standard.dcp", out.getvalue())


if __name__ == "__main__":
    unittest.main()
