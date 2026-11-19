"""Phase One IIQ read straight into the developer (``shootflow.iiq``).

A writer here builds IIQ files the way the backs lay them out: a TIFF header and IFD0 (Make, Model), the
``IIII`` container at byte 8 with its directory (sizes, margins, format, data and row offsets, black level,
the split columns and rows with their offset tables, the camera-to-ROMM matrix and as-shot multipliers),
then rows coded as IIQ L: per-lane length prefixes every 8 columns, differences, raw 16-bit values for
length 14 and for the last ``width % 8`` columns, and rows of IIQ S from random block headers. The decoded sensels are checked exactly, through both the
pure-Python reference and the C helper. Ten real files from ten bodies against LibRaw (every sensel equal):
``tools/iiq_libraw_check.py`` and ``eval/phaseone-iiq-reader-2026-11-18.md``.
"""

from __future__ import annotations

import os
import random
import struct
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from shootflow import camera_profiles, iiq, raw_preview
from shootflow import raw_develop as rd

LENGTHS = iiq.LENGTHS


class BitWriter:
    def __init__(self):
        self.bits: list[int] = []

    def put(self, value: int, n: int):
        self.bits.extend((value >> (n - 1 - i)) & 1 for i in range(n))

    def words(self) -> bytes:
        bits = self.bits + [0] * (-len(self.bits) % 32 + 32)  # a spare word, as the reader may look ahead
        out = bytearray()
        for i in range(0, len(bits), 32):
            v = 0
            for b in bits[i : i + 32]:
                v = (v << 1) | b
            out += struct.pack("<I", v)
        return bytes(out)


def fits(d: int, n: int) -> bool:
    return 1 - (1 << (n - 1)) <= d <= (1 << (n - 1))


def encode_row(codes: list[int], rng: random.Random, keep_bias: float = 0.3) -> bytes:
    """One row of IIQ L. ``codes`` are the values the decoder must produce (0..65535)."""

    w = BitWriter()
    width = len(codes)
    whole = width & -8
    pred = [0, 0]
    lens = [0, 0]
    for col in range(width):
        lane = col & 1
        if col >= whole:
            lens[0] = lens[1] = 14
        elif col % 8 == 0:
            for ln in (0, 1):
                group = codes[col + ln : col + 8 : 2]
                prev = pred[ln]
                diffs = []
                for c in group:
                    diffs.append(c - prev)
                    prev = c
                ok = [k for k in range(10) if LENGTHS[k] == 14 or all(fits(d, LENGTHS[k]) for d in diffs)]
                if lens[ln] in [LENGTHS[k] for k in ok] and rng.random() < keep_bias:
                    w.put(1, 1)  # keep the last length
                    continue
                k = rng.choice(ok)
                j = k // 2 + 1
                w.put(0, j)
                if j < 5:
                    w.put(1, 1)
                w.put(k % 2, 1)
                lens[ln] = LENGTHS[k]
        n = lens[lane]
        if n == 14:
            w.put(codes[col], 16)
        else:
            d = codes[col] - pred[lane]
            w.put(d - 1 + (1 << (n - 1)), n)
        pred[lane] = codes[col]
    return w.words()


def smooth_codes(width: int, height: int, seed: int, top: int = 16383) -> list[list[int]]:
    rng = random.Random(seed)
    rows = []
    for r in range(height):
        base = rng.randrange(0, top)
        row = []
        for c in range(width):
            step = rng.choice((0, 1, -1, 3, -7, 40, -200, 1500, -3000, 9000))
            base = min(top, max(0, base + step)) if rng.random() < 0.9 else rng.randrange(0, top + 1)
            row.append(base)
        rows.append(row)
    return rows


def encode_s_row(width: int, rng: random.Random) -> tuple[bytes, list[int]]:
    """One random row of IIQ S and the stored values it must decode to (value times four, clamped).

    The writer picks the row's precision, each block's lane scales (by a step or a fresh code) and its
    refinement, then random sample bits; the expected values follow the format's own arithmetic."""

    w = BitWriter()
    q = rng.randrange(0, 8)
    w.put((rng.randrange(0, 1 << 13) << 3) | q, 16)
    fresh = {k: (n, code) for n, code, k in iiq.SCALE_CODES}
    scale, last, out = [0, 0], [0, 0], []
    for _ in range(width >> 3):
        refine = rng.randrange(0, 5)
        for lane in (0, 1):
            allowed = [9] + list(range(refine, min(8, 17 - q) + 1))
            near = [k for k in allowed if abs(k - scale[lane]) <= 1]
            if near and rng.random() < 0.6:
                k = rng.choice(near)
                w.put(k - scale[lane] + 2, 2)
            else:
                k = rng.choice(allowed)
                w.put(0, 2)
                n, code = fresh[k]
                w.put(code, n)
            scale[lane] = k
        if refine:
            w.put(0, 1)
            w.put(refine - 1, 2)
        else:
            w.put(1, 1)
        nb = q + refine
        for i in range(8):
            lane = i & 1
            if scale[lane] == 9:
                v = rng.randrange(0, 1 << 14)
                w.put(v, 14)
            else:
                b = rng.randrange(0, 1 << nb) if nb else 0
                if nb:
                    w.put(b, nb)
                v = last[lane] + (b << (scale[lane] - refine)) - (0xFFFF >> (17 - q - scale[lane]))
            last[lane] = v
            out.append(min(65535, max(0, v << 2)))
    for _ in range(width & 7):
        v = rng.randrange(0, 1 << 14)
        w.put(v, 14)
        out.append(v << 2)
    return w.words(), out


def make_iiq(codes: list[list[int]], fmt: int = 3, black: int | None = 1024, top: int = 2, left: int = 4,
             cblack: list[int] | None = None, rblack: list[int] | None = None, split_col: int = 0,
             split_row: int = 0, orientation: int = 0, model: bytes = b"IQ180",
             romm=(1.6, -0.4, -0.2, -0.15, 1.3, -0.15, 0.0, -0.3, 1.3), mul=(2.0, 1.0, 1.5), seed: int = 1,
             rows: list[bytes] | None = None, extra_blobs: dict | None = None,
             extra_values: dict | None = None) -> bytes:
    rng = random.Random(seed)
    height, width = len(codes), len(codes[0])
    if rows is None:
        rows = [encode_row(r, rng) for r in codes]
    entries: list[tuple[int, int, int, bytes | int]] = []  # tag, type, count, inline value or blob

    def put(tag, value, typ=1):
        entries.append((tag, typ, 4, value))

    put(iiq.TAG_ORIENT, orientation)
    put(iiq.TAG_RAW_W, width)
    put(iiq.TAG_RAW_H, height)
    put(iiq.TAG_LEFT, left)
    put(iiq.TAG_TOP, top)
    put(iiq.TAG_W, max(1, width - left - 2))
    put(iiq.TAG_H, max(1, height - top - 1))
    put(iiq.TAG_FORMAT, fmt)
    if black is not None:
        put(iiq.TAG_BLACK, black)
    if split_col:
        put(iiq.TAG_SPLIT_COL, split_col)
    if split_row:
        put(iiq.TAG_SPLIT_ROW, split_row)
    blobs = {}
    blobs[iiq.TAG_ROMM] = struct.pack("<9f", *romm)
    blobs[iiq.TAG_MUL] = struct.pack("<3f", *mul)
    if cblack is not None:
        blobs[iiq.TAG_BLACK_COL] = struct.pack(f"<{len(cblack)}h", *cblack)
    if rblack is not None:
        blobs[iiq.TAG_BLACK_ROW] = struct.pack(f"<{len(rblack)}h", *rblack)
    sensor = bytearray()
    offsets = []
    for r in rows:
        offsets.append(len(sensor))
        sensor += r
    blobs[iiq.TAG_STRIPS] = struct.pack(f"<{height}I", *offsets)
    blobs.update(extra_blobs or {})
    for tag, value in (extra_values or {}).items():
        put(tag, value)

    # IFD0 (Make, Model) right after the TIFF header's container, built last; offsets below are absolute.
    n_entries = len(entries) + len(blobs) + 1  # + TAG_DATA
    dir_at = 8 + 16
    blob_at = dir_at + 8 + 16 * n_entries
    body = bytearray()
    placed = {}
    for tag, blob in blobs.items():
        placed[tag] = blob_at + len(body)
        body += blob
        body += b"\0" * (-len(body) % 4)
    data_at = blob_at + len(body)
    body += sensor
    table = bytearray(struct.pack("<II", n_entries, 0))
    for tag, typ, count, value in entries:
        table += struct.pack("<4I", tag, typ, count, value)
    for tag, blob in blobs.items():
        table += struct.pack("<4I", tag, 2, len(blob), placed[tag] - 8)
    table += struct.pack("<4I", iiq.TAG_DATA, 1, 4, data_at - 8)
    container = bytearray(b"IIII" + struct.pack("<II", 0x10000, dir_at - 8)) + b"\0" * 4
    container += b"\0" * (dir_at - 8 - len(container))
    out = bytearray(b"II*\0" + struct.pack("<I", 0)) + container + table + body
    # IFD0 at the end: Make and Model as ASCII.
    ifd_at = len(out)
    make, mdl = b"Phase One A/S\0", model + b"\0"
    strings_at = ifd_at + 2 + 12 * 2 + 4
    out += struct.pack("<H", 2)
    out += struct.pack("<HHII", 271, 2, len(make), strings_at)
    out += struct.pack("<HHII", 272, 2, len(mdl), strings_at + len(make))
    out += struct.pack("<I", 0) + make + mdl
    struct.pack_into("<I", out, 4, ifd_at)
    return bytes(out)


def expected(codes, fmt=3, cblack=None, rblack=None, split_col=0, split_row=0):
    height, width = len(codes), len(codes[0])
    table = iiq.curve()
    split_col = split_col or width
    split_row = split_row or height
    out = []
    for r, row in enumerate(codes):
        for c, code in enumerate(row):
            v = (table[code] if fmt == 5 else code) << (0 if fmt == 8 else 2)
            if cblack is not None:
                v += cblack[2 * r + (c >= split_col)]
            if rblack is not None:
                v += rblack[2 * c + (r >= split_row)]
            out.append(min(65535, max(0, v)))
    return out


class IiqTests(unittest.TestCase):
    def test_decodes_every_sensel_both_paths(self):
        for width in (40, 37, 6):  # a multiple of 8, a tail of 5, and a row shorter than one group
            codes = smooth_codes(width, 7, seed=width)
            data = make_iiq(codes, black=None)
            fields = iiq.info(data)
            want = expected(codes)
            got_py, note_py = iiq.decode_sensor(data, fields, use_native=False)
            self.assertEqual(list(got_py), want, width)
            self.assertNotIn("native", note_py)
            if iiq.native() is not None:
                got_c, note_c = iiq.decode_sensor(data, fields)
                self.assertEqual(list(got_c), want, width)
                self.assertIn("native", note_c)

    def test_format_5_codes_and_black_offsets(self):
        rng = random.Random(9)
        codes = [[rng.choice((rng.randrange(0, 256), rng.randrange(256, 2000))) for _ in range(24)] for _ in range(6)]
        cblack = [rng.randrange(-20, 20) for _ in range(2 * 6)]
        rblack = [rng.randrange(-5, 80) for _ in range(2 * 24)]
        data = make_iiq(codes, fmt=5, cblack=cblack, rblack=rblack, split_col=13, split_row=3)
        want = expected(codes, fmt=5, cblack=cblack, rblack=rblack, split_col=13, split_row=3)
        fields = iiq.info(data)
        self.assertEqual(list(iiq.decode_sensor(data, fields, use_native=False)[0]), want)
        if iiq.native() is not None:
            self.assertEqual(list(iiq.decode_sensor(data, fields)[0]), want)
        self.assertEqual(iiq.curve()[100], 2520)  # 100 * 100 / 3.969, rounded: LibRaw's value on real P65+ files
        self.assertEqual(iiq.curve()[255], 16383)

    def test_format_8_sixteen_bit_codes_stored_as_they_are(self):
        # The IQ4 150MP's "IIQ L 16-bit" and the Trichromatic's IIQ L: the format 3 code with 16-bit values,
        # stored as they are (not times four), with the offsets added as for IIQ L; white is 65535.
        rng = random.Random(8)
        for width in (40, 37, 6):
            codes = smooth_codes(width, 6, seed=20 + width, top=65535)
            codes[0][0], codes[-1][-1] = 65535, 0
            cblack = [rng.randrange(-20, 20) for _ in range(2 * 6)]
            rblack = [rng.randrange(-5, 80) for _ in range(2 * width)]
            split = width // 2 + 1
            data = make_iiq(codes, fmt=8, cblack=cblack, rblack=rblack, split_col=split, split_row=3)
            want = expected(codes, fmt=8, cblack=cblack, rblack=rblack, split_col=split, split_row=3)
            fields = iiq.info(data)
            got_py, note = iiq.decode_sensor(data, fields, use_native=False)
            self.assertEqual(list(got_py), want, width)
            self.assertIn("16-bit", note)
            if iiq.native() is not None:
                self.assertEqual(list(iiq.decode_sensor(data, fields)[0]), want, width)
        raw = iiq.parse_iiq(make_iiq(smooth_codes(24, 9, seed=5, top=65535), fmt=8))
        self.assertEqual(raw.ifd.get(rd.TAG_WHITE_LEVEL), (65535,))
        self.assertEqual(raw.ifd.get(rd.TAG_BLACK_LEVEL), (1024.0,))

    def test_offsets_clamp_at_zero(self):
        codes = [[0] * 16 for _ in range(2)]
        data = make_iiq(codes, cblack=[-30, -30, -30, -30])
        self.assertEqual(set(iiq.decode_sensor(data, iiq.info(data), use_native=False)[0]), {0})

    def test_parse_tags(self):
        codes = smooth_codes(24, 9, seed=4)
        data = make_iiq(codes, top=3, left=5, orientation=1)
        self.assertTrue(iiq.is_iiq(data))
        raw = iiq.parse_iiq(data)
        self.assertEqual(raw.source, "iiq")
        self.assertEqual(raw.ifd.get(rd.TAG_ACTIVE_AREA), (3, 5, 3 + 9 - 3 - 1, 5 + 24 - 5 - 2))
        self.assertEqual(raw.ifd.get(rd.TAG_CFA_PATTERN), (0, 1, 1, 2))
        self.assertEqual(raw.ifd.get(rd.TAG_BLACK_LEVEL), (1024.0,))
        self.assertEqual(raw.ifd.get(rd.TAG_WHITE_LEVEL), (65532,))
        self.assertEqual(raw.ifd.get(rd.TAG_AS_SHOT_NEUTRAL), (0.5, 1.0, 1.0 / 1.5))
        self.assertEqual(raw.ifd0.get(rd.TAG_ORIENTATION), (6,))
        self.assertEqual(iiq.camera_model(data), "Phase One IQ180")
        # Parsed through the developer's entry point too, ahead of the TIFF readers.
        self.assertEqual(rd.parse_raw(data).source, "iiq")

    def test_colour_matrix_maps_the_as_shot_neutral_to_d50(self):
        romm = (1.6, -0.4, -0.2, -0.15, 1.3, -0.15, 0.0, -0.3, 1.3)  # rows sum to one
        mul = (2.0, 1.0, 1.5)
        cm = iiq.colour_matrix(romm, mul)
        m = [cm[0:3], cm[3:6], cm[6:9]]
        d50 = (0.9642, 1.0, 0.8249)
        cam = [sum(m[i][k] * d50[k] for k in range(3)) for i in range(3)]
        neutral = (1 / mul[0], 1 / mul[1], 1 / mul[2])
        for a, b in zip(cam, neutral):
            self.assertAlmostEqual(a / cam[1], b / neutral[1], places=3)
        self.assertIsNone(iiq.colour_matrix(romm, (0.0, 1.0, 1.0)))
        self.assertIsNone(iiq.colour_matrix(None, mul))

    def test_develops_without_a_profile(self):
        codes = smooth_codes(40, 20, seed=7, top=12000)
        data = make_iiq(codes, top=2, left=4)
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "CF000001.IIQ"
            src.write_bytes(data)
            self.assertTrue(raw_preview.is_developable_path(src))
            self.assertFalse(raw_preview.needs_profile_path(src))
            self.assertEqual(camera_profiles.camera_of(src), "Phase One IQ180")
            report = rd.develop_file(src, Path(tmp) / "out.png")
        self.assertEqual((report.width, report.height), (40 - 4 - 2, 20 - 2 - 1))
        self.assertEqual(report.colour, "dng")
        self.assertAlmostEqual(report.white_xy[0], 0.34567, places=3)

    def test_iiq_s_every_sensel_both_paths(self):
        for width, seed in ((48, 1), (45, 2), (5, 3), (64, 4)):
            rng = random.Random(seed)
            rows, want = [], []
            for _ in range(6):
                blob, vals = encode_s_row(width, rng)
                rows.append(blob)
                want += vals
            codes = [[0] * width for _ in range(6)]
            data = make_iiq(codes, fmt=6, rows=rows)
            fields = iiq.info(data)
            got_py, note_py = iiq.decode_sensor(data, fields, use_native=False)
            self.assertEqual(list(got_py), want, width)
            self.assertEqual(note_py, "IIQ: IIQ S")
            if iiq.native_s() is not None:
                got_c, note_c = iiq.decode_sensor(data, fields)
                self.assertEqual(list(got_c), want, width)
                self.assertIn("native", note_c)

    def test_iiq_s_offsets_and_develop(self):
        rng = random.Random(11)
        width, height = 40, 20
        rows, base = [], []
        for _ in range(height):
            blob, vals = encode_s_row(width, rng)
            rows.append(blob)
            base.append(vals)
        cblack = [rng.randrange(-20, 20) for _ in range(2 * height)]
        rblack = [rng.randrange(-5, 80) for _ in range(2 * width)]
        data = make_iiq([[0] * width for _ in range(height)], fmt=6, rows=rows, cblack=cblack, rblack=rblack,
                        split_col=17, split_row=9)
        want = [min(65535, max(0, base[r][c] + cblack[2 * r + (c >= 17)] + rblack[2 * c + (r >= 9)]))
                for r in range(height) for c in range(width)]
        fields = iiq.info(data)
        self.assertEqual(list(iiq.decode_sensor(data, fields, use_native=False)[0]), want)
        if iiq.native_s() is not None:
            self.assertEqual(list(iiq.decode_sensor(data, fields)[0]), want)
        self.assertEqual(rd.parse_raw(data).source, "iiq")

    def test_iiq_s_refinement_above_the_scale(self):
        def block(sample_bits: int) -> bytes:
            w = BitWriter()
            w.put(2, 16)  # q = 2
            for _ in (0, 1):
                w.put(0, 2)
                w.put(0b00010, 5)  # fresh scale 0
            w.put(0, 1)
            w.put(1, 2)  # refinement 2 > scale 0: shift -2
            for _ in range(8):
                w.put(sample_bits, 4)  # q + refinement bits
            return w.words()

        # Zero bits (what real IQ180 files send): the value is last - bias, bias = 0xFFFF >> (17 - 2 - 0) = 1.
        data = make_iiq([[0] * 8], fmt=6, rows=[block(0)])
        want = [0] * 8  # -1, -2, ... clamp to 0
        for use_native in (False, True):
            if use_native and iiq.native_s() is None:
                continue
            self.assertEqual(list(iiq.decode_sensor(data, iiq.info(data), use_native=use_native)[0]), want)
            bad = make_iiq([[0] * 8], fmt=6, rows=[block(5)])
            with self.assertRaisesRegex(rd.DevelopError, "corrupt"):
                iiq.decode_sensor(bad, iiq.info(bad), use_native=use_native)

    def test_iiq_s_refuses_an_out_of_range_scale(self):
        w = BitWriter()
        w.put(7, 16)  # q = 7: a scale above 17 - 7 = 10 cannot be biased
        w.put(0, 2)
        w.put(0b00000, 5)  # lane 0: fresh scale 9 (raw)
        w.put(0, 2)
        w.put(0b00000, 5)  # lane 1: fresh scale 9
        w.put(1, 1)  # refinement 0
        w.put(0, 8 * 14)
        w.put(0b11, 2)  # next block: lane 0 9 -> 10
        w.put(0b10, 2)  # lane 1 stays raw
        w.put(1, 1)
        w.put(0, 4 * 7 + 4 * 14)
        w.put(0b11, 2)  # lane 0 10 -> 11: out of range
        w.put(0b10, 2)
        w.put(1, 1)
        w.put(0, 4 * 7 + 4 * 14)
        data = make_iiq([[0] * 24], fmt=6, rows=[w.words()])
        for use_native in (False, True):
            if use_native and iiq.native_s() is None:
                continue
            with self.assertRaisesRegex(rd.DevelopError, "corrupt"):
                iiq.decode_sensor(data, iiq.info(data), use_native=use_native)

    def test_refuses_formats_it_does_not_read(self):
        codes = smooth_codes(16, 2, seed=1)
        for fmt in (1, 2, 7):
            data = make_iiq(codes, fmt=fmt)
            with self.assertRaisesRegex(rd.DevelopError, f"format {fmt}"):
                iiq.parse_iiq(data)

    def test_not_an_iiq(self):
        self.assertFalse(iiq.is_iiq(b"II*\0" + b"\0" * 64))
        self.assertFalse(iiq.is_iiq(b"MM\0*" + b"IIII" + b"\0" * 64))
        broken = bytearray(make_iiq(smooth_codes(16, 2, seed=1)))
        struct.pack_into("<I", broken, 16, 10**9)  # directory offset past the end
        self.assertFalse(iiq.is_iiq(bytes(broken)))


@unittest.skipUnless(os.environ.get("SHOOTFLOW_IIQ_SAMPLES"), "set SHOOTFLOW_IIQ_SAMPLES to a folder of real IIQ files")
class RealIiqTests(unittest.TestCase):
    def test_python_and_native_agree_on_real_rows(self):
        for path in sorted(Path(os.environ["SHOOTFLOW_IIQ_SAMPLES"]).iterdir()):
            data = path.read_bytes()
            if not iiq.is_iiq(data):
                continue
            fields = iiq.info(data)
            if fields["format"] not in iiq.FORMATS or iiq.native() is None:
                continue
            # The first 24 rows through both decoders (the pure-Python path is slow on a whole frame).
            few = dict(fields, height=24)
            self.assertEqual(list(iiq.decode_sensor(data, few, use_native=False)[0]),
                             list(iiq.decode_sensor(data, few)[0]), path.name)


if __name__ == "__main__":
    unittest.main()
