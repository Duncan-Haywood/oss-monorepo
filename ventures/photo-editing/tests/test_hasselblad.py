"""Hasselblad 3FR read straight into the developer (``shootflow.hasselblad``).

A writer here builds 3FRs the way the bodies lay them out: a little-endian TIFF whose IFD0 is a thumbnail
with Make "Hasselblad", ColorMatrix1, AsShotNeutral and UniqueCameraModel, and whose second IFD is the
16-bit CFA image with BlackLevel, WhiteLevel and DefaultCrop, either uncompressed or in Hasselblad's
lossless JPEG (an SOF3 header, then pairs of size codes and differences read from little-endian 32-bit
words). The encoder below predicts exactly as the decoder does, so the decoded sensels are checked exactly,
through both the C decoder and the pure-Python reference. Ten real files from ten bodies against LibRaw
(every sensel equal): ``tools/hasselblad_libraw_check.py`` and ``eval/hasselblad-3fr-reader-2026-11-18.md``.
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

from shootflow import camera_profiles, hasselblad, ljpeg_native, raw_preview
from shootflow import raw_develop as rd
from shootflow.cli import main
from test_raw_develop import _ifd_bytes

W, H = 24, 10
# The CFV's own table: 17 size categories, 0 to 16.
COUNTS = bytes((0, 2, 1, 4, 2, 3, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0))
SYMBOLS = bytes((6, 7, 5, 4, 8, 9, 10, 3, 11, 1, 2, 12, 0, 13, 14, 15, 16))
CM1 = (0.4932, -0.0835, 0.0141, -0.4878, 1.1868, 0.3437, -0.1138, 0.1961, 0.7067)


def sensor(w=W, h=H, seed=3, lo=0, hi=65535):
    rng = random.Random(seed)
    return [rng.randrange(lo, hi + 1) for _ in range(w * h)]


class _Bits:
    def __init__(self):
        self.acc, self.n, self.out = 0, 0, bytearray()

    def put(self, value: int, n: int) -> None:
        for i in range(n - 1, -1, -1):
            self.acc = self.acc << 1 | (value >> i) & 1
            self.n += 1
            if self.n == 32:
                self.out += struct.pack("<I", self.acc)
                self.acc, self.n = 0, 0

    def done(self) -> bytes:
        if self.n:
            self.out += struct.pack("<I", self.acc << (32 - self.n))
        return bytes(self.out)


def encode(values, w, h, psv=1, minus_32768_as_ffff=True) -> bytes:
    """Hasselblad compression 7: the JPEG header and the stream, predicting as ``hasselblad_load_raw``."""

    codes = {size: (length, code) for (length, code), size in rd._huffman_table(COUNTS, SYMBOLS).items()}
    bits = _Bits()
    back = [[0] * w for _ in range(3)]
    for row in range(h):
        cur, up2 = back[row % 3], back[(row + 1) % 3]
        for col in range(0, w, 2):
            diffs = []
            for s in (col, col + 1):
                pred = cur[s - 2] if col else 0x8000
                if col and row > 1 and psv == 11:
                    pred += int(up2[s] / 2) - int(up2[s - 2] / 2)
                d = (values[row * w + s] - pred + 32768) % 65536 - 32768
                diffs.append(d)
                cur[s] = pred + d
            sized = []
            for d in diffs:
                if d == -32768 and minus_32768_as_ffff:
                    sized.append((16, 0xFFFF))
                    continue
                n = abs(d).bit_length()
                sized.append((n, d if d >= 0 else d + (1 << n) - 1))
            for n, _ in sized:
                bits.put(codes[n][1], codes[n][0])
            for n, v in sized:
                if n:
                    bits.put(v, n)
    sof = b"\xff\xc3" + struct.pack(">HBHHB", 11, 16, h, w, 1) + bytes((0, 0x11, 0))
    dht = b"\xff\xc4" + struct.pack(">H", 2 + 1 + 16 + len(SYMBOLS)) + b"\0" + COUNTS + SYMBOLS
    sos = b"\xff\xda" + struct.pack(">H", 8) + bytes((1, 0, 0, psv, 0, 0))
    return b"\xff\xd8" + sof + b"\xff" + dht + sos + bits.done()  # a fill byte before DHT, as the CFV writes


def make_3fr(values=None, w=W, h=H, compression=1, psv=1, black=256.0, white=65535, crop=(2, 2, 20, 6),
             model="Hasselblad X1D", unique="Hasselblad X1D", spp=1, orientation=1, dng_version=None,
             cm1=CM1, neutral=(0.6354, 1.0, 0.3868)) -> bytes:
    values = sensor(w, h) if values is None else values
    payload = struct.pack(f"<{len(values)}H", *values) if compression == 1 else encode(values, w, h, psv)
    ifd0 = [
        (271, 2, tuple(b"Hasselblad\0")),
        (272, 2, tuple(model.encode() + b"\0")),
        (274, 3, (orientation,)),
    ]
    if unique:
        ifd0.append((50708, 2, tuple(unique.encode() + b"\0")))
    if cm1:
        ifd0.append((50721, 10, cm1))
    if neutral:
        ifd0.append((50728, 5, neutral))
    if dng_version:
        ifd0.append((50706, 1, dng_version))

    def raw_ifd(offset):
        entries = [
            (254, 4, (0,)), (256, 4, (w,)), (257, 4, (h,)), (258, 3, (16,) * spp), (259, 3, (compression,)),
            (262, 3, (32803,)), (273, 4, (offset,)), (277, 3, (spp,)), (278, 4, (h,)),
            (279, 4, (w * h * 2,)),  # the unpacked size, as the bodies write it even when compressed
            (50717, 4, (white,)), (50719, 3, crop[:2]), (50720, 3, crop[2:]),
        ]
        if black is not None:
            entries.append((50714, 5, (black,)))
        return entries

    first = _ifd_bytes(ifd0, 8)
    second_at = 8 + len(first) + (len(first) % 2)
    second = _ifd_bytes(raw_ifd(0), second_at)
    data_at = second_at + len(second)
    second = _ifd_bytes(raw_ifd(data_at), second_at)
    first = bytearray(first)
    struct.pack_into("<I", first, 2 + 12 * len(ifd0), second_at)
    out = b"II*\0" + struct.pack("<I", 8) + bytes(first) + bytes(len(first) % 2) + second
    assert len(out) == data_at
    return out + payload


class ReaderTests(unittest.TestCase):
    def test_uncompressed_exact(self):
        vals = sensor()
        raw = hasselblad.parse_3fr(make_3fr(vals))
        self.assertEqual(list(raw.values), vals)
        self.assertEqual((raw.width, raw.height, raw.source), (W, H, "3fr"))
        self.assertIn("3FR: uncompressed 16-bit", raw.notes)

    def test_compressed_exact_both_decoders(self):
        for psv in (1, 11):
            for seed, lo, hi in ((1, 0, 65535), (2, 200, 900), (3, 30000, 34000)):
                vals = sensor(seed=seed, lo=lo, hi=hi)
                data = make_3fr(vals, compression=7, psv=psv)
                with self.subTest(psv=psv, seed=seed, engine="python"):
                    self.assertEqual(list(hasselblad.parse_3fr(data, engine="python").values), vals)
                if ljpeg_native.available():
                    with self.subTest(psv=psv, seed=seed, engine="native"):
                        self.assertEqual(list(hasselblad.parse_3fr(data).values), vals)

    def test_minus_32768_both_spellings(self):
        # 0x8000 at a row's start, then a sensel at 0: the difference is -32768.
        vals = [0x8000, 0x8000, 0, 0] * (W // 4) * H
        for spelling in (True, False):
            blob = encode(vals, W, H, 1, minus_32768_as_ffff=spelling)
            jw, jh, psv, table, start = hasselblad.jpeg_header(blob, 0)
            self.assertEqual(list(hasselblad._decode_python(blob[start:], jw, jh, psv, table)), vals)
            got = ljpeg_native.hasselblad_run(blob[start:], jw, jh, psv, ljpeg_native.lut16(table))
            if got is not None:
                self.assertEqual(list(got), vals)

    def test_odd_width_refused_and_header(self):
        with self.assertRaisesRegex(rd.DevelopError, "width 13 is odd"):
            hasselblad.decode_compressed(b"\xff\xd8", 0, 13, 5)
        vals = sensor(w=14, h=5, seed=8)
        raw = hasselblad.parse_3fr(make_3fr(vals, w=14, h=5, compression=7, crop=(0, 0, 14, 5)))
        self.assertEqual(list(raw.values), vals)
        jw, jh, psv, _table, _start = hasselblad.jpeg_header(encode(vals, 14, 5, 11), 0)
        self.assertEqual((jw, jh, psv), (14, 5, 11))

    def test_tags(self):
        raw = hasselblad.parse_3fr(make_3fr(black=256.0, white=65535, crop=(2, 4, 20, 6)))
        self.assertEqual(raw.ifd.get(rd.TAG_CFA_PATTERN), (0, 1, 1, 2))
        self.assertEqual(raw.ifd.get(rd.TAG_BLACK_LEVEL), (256.0,))
        self.assertEqual(raw.ifd.one(rd.TAG_WHITE_LEVEL), 65535)
        self.assertEqual(raw.ifd.get(rd.TAG_CROP_ORIGIN), (2, 4))
        self.assertEqual(raw.ifd.get(rd.TAG_CROP_SIZE), (20, 6))
        self.assertEqual(len(raw.ifd0.get(rd.TAG_COLOR_MATRIX_1)), 9)
        self.assertAlmostEqual(raw.ifd0.get(rd.TAG_AS_SHOT_NEUTRAL)[2], 0.3868, places=4)
        no_black = hasselblad.parse_3fr(make_3fr(black=None))
        self.assertEqual(no_black.ifd.get(rd.TAG_BLACK_LEVEL), (0.0,))

    def test_wrapped_negatives_shifted(self):
        # The H4D-60: black 0, white 32767, noise below zero stored as 65280..65535, nothing above 49151 else.
        rng = random.Random(4)
        vals = [rng.choice((65535, 65533, 65400)) if rng.random() < 0.05 else rng.randrange(0, 20000) for _ in range(W * H)]
        raw = hasselblad.parse_3fr(make_3fr(vals, black=0.0, white=32767, compression=7))
        self.assertEqual(list(raw.values), [(v + 256) & 0xFFFF for v in vals])
        self.assertEqual(raw.ifd.get(rd.TAG_BLACK_LEVEL), (256.0,))
        self.assertEqual(raw.ifd.one(rd.TAG_WHITE_LEVEL), 32767 + 256)
        self.assertTrue(any("dips below zero" in n for n in raw.notes))

    def test_real_highlights_not_shifted(self):
        rng = random.Random(5)
        vals = [rng.choice((65535, 50000)) if rng.random() < 0.05 else rng.randrange(0, 20000) for _ in range(W * H)]
        raw = hasselblad.parse_3fr(make_3fr(vals, black=0.0, white=32767))
        self.assertEqual(list(raw.values), vals)  # values between 49152 and 65279: not a wrap
        x1d = hasselblad.parse_3fr(make_3fr([65535] * (W * H // 2) + [300] * (W * H // 2), black=0.0, white=65535))
        self.assertEqual(x1d.ifd.get(rd.TAG_BLACK_LEVEL), (0.0,))  # white 65535: the top codes are highlights

    def test_shift_wraps_modulo_65536(self):
        vals = array_of([65535, 65280, 0, 300, 32767])
        self.assertEqual(list(hasselblad._shift(vals, 256)), [255, 0, 256, 556, 33023])

    def test_refusals(self):
        with self.assertRaisesRegex(rd.DevelopError, "multi-shot"):
            hasselblad.parse_3fr(make_3fr(spp=2))
        with self.assertRaisesRegex(rd.DevelopError, "compression 5"):
            hasselblad.parse_3fr(make_3fr(compression=5))
        with self.assertRaisesRegex(rd.DevelopError, "runs past the end"):
            hasselblad.parse_3fr(make_3fr()[:-10])
        bad = bytearray(make_3fr(compression=7))
        at = bytes(bad).index(b"\xff\xd8")
        bad[at + 1] = 0
        with self.assertRaisesRegex(rd.DevelopError, "SOI"):
            hasselblad.parse_3fr(bytes(bad))

    def test_detection(self):
        self.assertTrue(hasselblad.is_3fr(make_3fr()))
        self.assertFalse(hasselblad.is_3fr(make_3fr(dng_version=(1, 4, 0, 0))))  # a Phocus DNG is a DNG
        self.assertFalse(hasselblad.is_3fr(b"\0MRM" + bytes(40)))
        self.assertEqual(rd.parse_raw(make_3fr()).source, "3fr")

    def test_names(self):
        self.assertEqual(hasselblad.camera_model(make_3fr()), "Hasselblad X1D")
        self.assertEqual(hasselblad.camera_model(make_3fr(unique="", model="H3D")), "Hasselblad H3D")


def array_of(values):
    from array import array

    return array("H", values)


class DevelopTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)

    def test_paths(self):
        path = self.dir / "B0000079.3FR"
        self.assertTrue(raw_preview.is_developable_path(path))
        self.assertFalse(raw_preview.needs_profile_path(path))  # its own ColorMatrix1

    def test_develops_without_a_profile(self):
        vals = sensor(64, 32, seed=2, lo=300, hi=30000)
        raw = rd.parse_raw(make_3fr(vals, w=64, h=32, crop=(2, 2, 60, 28)))
        w, h, rgb, report = rd.develop(raw, rd.DevelopSettings(engine="python"))
        self.assertEqual((w, h), (60, 28))
        self.assertEqual(report.matrix, "ColorMatrix1")
        self.assertEqual(len(rgb), 60 * 28 * 3)

    def test_cli_and_profile_chooser(self):
        src = self.dir / "B0000079.3FR"
        src.write_bytes(make_3fr(sensor(64, 32, seed=2, lo=300, hi=30000), w=64, h=32, compression=7,
                                 crop=(2, 2, 60, 28)))
        self.assertEqual(camera_profiles.camera_of(src), "Hasselblad X1D")
        out, err = io.StringIO(), io.StringIO()
        code = main(["develop", str(src), "--out", str(self.dir / "m")], stdout=out, stderr=err)
        self.assertEqual(code, 0, err.getvalue())
        tif = rd._Reader((self.dir / "m" / "B0000079.tif").read_bytes())
        ifd, _ = tif.read_ifd(tif.first_ifd_offset())
        self.assertEqual((ifd.one(rd.TAG_WIDTH), ifd.one(rd.TAG_HEIGHT)), (60, 28))

    def test_still_for_review_develops_a_3fr(self):
        src = self.dir / "B0000080.3FR"
        src.write_bytes(make_3fr(sensor(64, 32, seed=6, lo=300, hi=30000), w=64, h=32, crop=(2, 2, 60, 28)))
        got = rd.still_for_review(src, self.dir)
        self.assertIsNotNone(got)
        self.assertTrue(got.exists())


if __name__ == "__main__":
    unittest.main()
