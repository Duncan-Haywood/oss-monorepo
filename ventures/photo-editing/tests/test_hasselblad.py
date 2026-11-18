"""Hasselblad 3FR read straight into the developer (``shootflow.hasselblad``).

A writer here builds 3FRs the way the bodies lay them out: a little-endian TIFF whose IFD0 is a thumbnail
with Make "Hasselblad", ColorMatrix1, AsShotNeutral and UniqueCameraModel, and whose second IFD is the
16-bit CFA image with BlackLevel, WhiteLevel and DefaultCrop, either uncompressed or in Hasselblad's
lossless JPEG (an SOF3 header, then pairs of size codes and differences read from little-endian 32-bit
words). The encoder below predicts exactly as the decoder does, so the decoded sensels are checked exactly,
through both the C decoder and the pure-Python reference. Ten real files from ten bodies against LibRaw
(every sensel equal): ``tools/hasselblad_libraw_check.py`` and ``eval/hasselblad-3fr-reader-2026-11-18.md``.
Phocus ``.fff`` exports (ColorMatrix2 or none, AnalogBalance-scaled R and B, series-only UniqueCameraModel):
``PhocusFffTests`` and ``eval/hasselblad-fff-reader-2026-11-18.md``.
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
from shootflow.hasselblad import RGGB
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
             cm1=CM1, neutral=(0.6354, 1.0, 0.3868), cm_tag=50721, analog=None) -> bytes:
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
        ifd0.append((cm_tag, 10, cm1))  # 50722 (ColorMatrix2, no illuminant) on a Phocus .fff
    if analog:
        ifd0.append((50727, 5, analog))
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


class PhocusFffTests(unittest.TestCase):
    """What a Phocus .fff export changes (eval/hasselblad-fff-reader-2026-11-18.md)."""

    def test_names_take_the_model_when_unique_is_only_the_series(self):
        for unique, model, want in (
            ("Hasselblad H4D", "Hasselblad H4D-40", "Hasselblad H4D-40"),
            ("Hasselblad", "Hasselblad CFV-50", "Hasselblad CFV-50"),
            ("Hasselblad CFV", "CFV-50c/Flash Sync", "Hasselblad CFV-50c"),
            ("Hasselblad H5D", "Hasselblad H5D-50c", "Hasselblad H5D-50c"),
            ("Hasselblad X1D II 50C", "X1DM2-50c", "Hasselblad X1D II 50C"),  # not an extension
            ("Hasselblad H4D", "Hasselblad H3D", "Hasselblad H4D"),  # a 3FR's own odd pair
            ("Hasselblad X2D 100C", "X2D 100C", "Hasselblad X2D 100C"),
        ):
            with self.subTest(unique=unique, model=model):
                self.assertEqual(hasselblad.camera_model(make_3fr(unique=unique, model=model)), want)

    def test_colour_matrix_2_alone_develops(self):
        raw = rd.parse_raw(make_3fr(sensor(64, 32, seed=4, lo=300, hi=30000), w=64, h=32, crop=(2, 2, 60, 28),
                                    cm_tag=50722))
        self.assertFalse([n for n in raw.notes if "needed" in n])
        _w, _h, _rgb, report = rd.develop(raw, rd.DevelopSettings(engine="python"))
        self.assertNotEqual(report.matrix, "identity")

    def test_own_matrix_when_the_file_has_none(self):
        raw = hasselblad.parse_3fr(make_3fr(model="X2D 100C", unique="Hasselblad X2D 100C", cm1=None))
        self.assertEqual(raw.ifd0.get(rd.TAG_COLOR_MATRIX_1), hasselblad.OWN_MATRICES["Hasselblad X2D 100C"])
        self.assertTrue(any("own, read from one of its 3FRs" in n for n in raw.notes))
        unknown = hasselblad.parse_3fr(make_3fr(model="Hasselblad H6D-100cMS", unique="Hasselblad H6D", cm1=None))
        self.assertIsNone(unknown.ifd0.get(rd.TAG_COLOR_MATRIX_1))
        self.assertTrue(any(".dcp camera profile is needed" in n for n in unknown.notes))

    @staticmethod
    def _frame(w, h, black, gains, seed):
        """A flat-ish frame, each colour spread over 1,024 codes; R and B times ``gains`` above black."""

        rng = random.Random(seed)
        plain, scaled = [], []
        for i in range(w * h):
            row, col = divmod(i, w)
            colour = RGGB[(row % 2) * 2 + col % 2]
            v = black + 4000 + rng.randrange(1024)
            plain.append(v)
            scaled.append(int(round(black + (v - black) * gains[colour])))
        return plain, scaled

    @unittest.skipUnless(hasselblad._numpy(), "the gain test reads histograms with numpy")
    def test_analog_balance_scales_the_neutral_only_when_the_data_carries_it(self):
        w, h, black = 800, 800, 256  # 160,000 sensels a colour: about 150 a code
        neutral, ab = (0.38715, 1.0, 0.71211), (1.0281, 1.0, 1.0139)
        plain, scaled = self._frame(w, h, black, ab, seed=11)
        kw = dict(w=w, h=h, crop=(0, 0, w, h), black=float(black), neutral=neutral, analog=ab)
        raw = hasselblad.parse_3fr(make_3fr(scaled, **kw))
        for g, n, a in zip(raw.ifd0.get(rd.TAG_AS_SHOT_NEUTRAL), neutral, ab):
            self.assertAlmostEqual(g, n * a, places=3)  # the writer stores rationals over 10000
        self.assertTrue(any("applied to the data digitally" in n for n in raw.notes))
        kept = hasselblad.parse_3fr(make_3fr(plain, **kw))  # the tag, but no gain in the data (an older export)
        for g, n in zip(kept.ifd0.get(rd.TAG_AS_SHOT_NEUTRAL), neutral):
            self.assertAlmostEqual(g, n, places=3)
        self.assertTrue(any("not in the data" in n for n in kept.notes))
        small = hasselblad.parse_3fr(make_3fr(neutral=neutral, analog=ab))  # too few sensels to tell
        for g, n in zip(small.ifd0.get(rd.TAG_AS_SHOT_NEUTRAL), neutral):
            self.assertAlmostEqual(g, n, places=3)

    @unittest.skipUnless(hasselblad._numpy(), "the gain test reads histograms with numpy")
    def test_fff_develops_as_its_3fr(self):
        """R and B scaled by AnalogBalance above black, the neutral left alone: Phocus's export of a 3FR."""

        w, h, black, ab = 800, 800, 256, (1.028, 1.0, 1.014)
        plain, scaled = self._frame(w, h, black, ab, seed=9)
        kw = dict(w=w, h=h, crop=(2, 2, w - 4, h - 4), black=float(black), neutral=(0.38, 1.0, 0.63))
        a = rd.develop(rd.parse_raw(make_3fr(plain, **kw)), rd.DevelopSettings())
        f = rd.develop(rd.parse_raw(make_3fr(scaled, analog=ab, cm_tag=50722, **kw)), rd.DevelopSettings())
        import numpy as np

        pa = np.frombuffer(a[2], dtype=np.uint16).astype(np.int64)
        pf = np.frombuffer(f[2], dtype=np.uint16).astype(np.int64)
        means = [abs(pa[c::3].mean() - pf[c::3].mean()) for c in range(3)]
        self.assertLess(max(means), 20)  # 0.03% of full scale; unscaled, red alone is off by about 1,000
        self.assertLess(float(np.abs(pa - pf).mean()), 40)

    def test_fff_path_develops(self):
        self.assertTrue(raw_preview.is_developable_path(Path("Job_0079.fff")))
        self.assertTrue(raw_preview.is_3fr_path(Path("B0000420.FFF")))
        self.assertFalse(raw_preview.needs_profile_path(Path("Job_0079.fff")))


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
