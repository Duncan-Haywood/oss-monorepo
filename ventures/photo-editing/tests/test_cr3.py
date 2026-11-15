"""Canon CR3 read straight into the developer (``shootflow.cr3``).

The CRX band codec is checked by a small encoder written here as the decoder's
mirror (median edge predictor, adaptive Rice code with the 41-zero escape,
JPEG-LS run mode with runs that stop short of and run to the end of a line):
random bands with flat stretches, zero runs on the top line and large jumps
round-trip through the pure-Python decoder and, when a C compiler is present,
the C one. A whole CR3 is then built here (ftyp, a moov with Canon's uuid box
of CMT1 and CMT3 TIFFs, a raw track whose CRAW entry carries CMP1 and
CDI1/IAD1, a CTMD track whose record type 8 holds ColorData11) so every tag
the reader infers can be checked exactly. Real EOS R8 files against LibRaw:
``tools/cr3_libraw_check.py`` and ``eval/canon-cr3-reader-2026-11-15.md``.
"""

from __future__ import annotations

import random
import struct
import sys
import unittest
from array import array
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from shootflow import cr2, cr3, ljpeg_native
from shootflow import raw_develop as rd
from test_raw_develop import _ifd_bytes

BITS = 14
MID = 1 << (BITS - 1)
SENSOR_W, SENSOR_H = 64, 40
OB = (0, 0, 11, 39)  # left optical black, inclusive (IAD1)
CROP = (28, 4, 59, 37)  # left, top, right, bottom, inclusive (SensorInfo and IAD1)
BLACK = 2047


class _Writer:
    def __init__(self):
        self.bits: list[int] = []

    def put(self, value: int, n: int) -> None:
        for i in range(n - 1, -1, -1):
            self.bits.append((value >> i) & 1)

    def data(self) -> bytes:
        bits = self.bits + [0] * (-len(self.bits) % 8)
        out = bytearray()
        for i in range(0, len(bits), 8):
            byte = 0
            for b in bits[i : i + 8]:
                byte = (byte << 1) | b
            out.append(byte)
        return bytes(out) + bytes(8)


def _zig(e: int) -> int:
    return 2 * e if e >= 0 else -2 * e - 1


def _emit_error(w: _Writer, code: int, k: int) -> None:
    q = code >> k
    if q < 41:
        w.put(0, q)
        w.put(1, 1)
        w.put(code & ((1 << k) - 1), k)
    else:
        w.put(0, 41)
        w.put(1, 1)
        w.put(code, 21)


def _emit_run(w: _Writer, state: list[int], r: int, length: int) -> None:
    if r == 0:
        w.put(0, 1)
        return
    w.put(1, 1)
    n = 1
    if r == length:
        while True:
            w.put(1, 1)
            n += cr3.JS[state[0]]
            if n > length:
                break
            state[0] = min(state[0] + 1, 31)
            if n == length:
                break
        return
    while n + cr3.JS[state[0]] <= r:
        w.put(1, 1)
        n += cr3.JS[state[0]]
        state[0] = min(state[0] + 1, 31)
    w.put(0, 1)
    if cr3.J[state[0]]:
        w.put(r - n, cr3.J[state[0]])
    state[0] = max(state[0] - 1, 0)


def _same_run(cur: list[int], i: int, length: int) -> int:
    r = 0
    while r < length and cur[i + 1 + r] == cur[i]:
        r += 1
    return r


def encode_band(lines: list[list[int]]) -> bytes:
    """The decoder's mirror: signed values, line by line, to a CRX band."""

    w = _Writer()
    width = len(lines[0])
    state = [0]
    k = 0
    cur = [0] + list(lines[0]) + [0]
    i, length = 0, width
    while length > 1:
        if cur[i]:
            pred = cur[i]
        else:
            r = _same_run(cur, i, length)
            _emit_run(w, state, r, length)
            if r:
                i += r
                length -= r
                if length <= 0:
                    break
            pred = 0
        code = _zig(cur[i + 1] - pred)
        _emit_error(w, code, k)
        k = cr3._next_k(k, code)
        i += 1
        length -= 1
    if length == 1:
        code = _zig(cur[i + 1] - cur[i])
        _emit_error(w, code, k)
        k = cr3._next_k(k, code)
    cur[width + 1] = cur[width] + 1
    prev = cur
    for values in lines[1:]:
        cur = [prev[1]] + list(values) + [0]
        i = j = 0
        length = width
        while length > 0:
            median = True
            if length > 1 and cur[i] == prev[j + 1] == prev[j + 2]:
                r = _same_run(cur, i, length)
                _emit_run(w, state, r, length)
                if r:
                    length -= r
                    j += r
                    i += r
                    if length <= 0:
                        break
                median = False
            a, b = cur[i], prev[j + 1]
            if median:
                c = prev[j]
                pred = sorted((a, b, a + b - c))[1]
            else:
                pred = b
            code = _zig(cur[i + 1] - pred)
            _emit_error(w, code, k)
            if length > 1:
                code = (code + abs((prev[j + 2] - prev[j + 1]) << 1)) >> 1
                j += 1
            k = cr3._next_k(k, code)
            i += 1
            length -= 1
        cur[width + 1] = cur[width] + 1
        prev = cur
    return w.data()


def random_band(width: int, height: int, seed: int) -> list[list[int]]:
    rng = random.Random(seed)
    lines = []
    for y in range(height):
        if y == 0:
            row = [0] * (width // 3) + [rng.randint(-300, 300) for _ in range(width - width // 3)]
        elif y % 5 == 0:
            row = list(lines[-1])  # identical to the line above: runs to the end of the line
        elif y % 7 == 0:
            row = [lines[-1][0]] * width  # flat
        else:
            row = [rng.randint(-200, 200) for _ in range(width)]
            for x in range(rng.randint(0, width - 1), width, 11):
                row[x] = rng.choice((-MID, MID - 1, 5000, -6000))  # jumps past the 41-zero escape
            start = rng.randint(0, width - 1)
            for x in range(start, min(width, start + rng.randint(2, 30))):
                row[x] = row[start]
        lines.append(row)
    return lines


# --- a whole CR3 ---------------------------------------------------------------------------


def _box(kind: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", 8 + len(payload)) + kind + payload


def _tiff(entries) -> bytes:
    return b"II*\0" + struct.pack("<I", 8) + _ifd_bytes(entries, 8)


def sensor(levels=(2048, 1024, 1024, 1536), seed=3) -> list[int]:
    """Masked columns at BLACK with noise, a scene of coloured 4x4 cells behind RGGB, clipped highlights."""

    rng = random.Random(seed)
    mult = (levels[0] / 1024, 1.0, levels[3] / 1024)
    left, top, right, bottom = CROP
    out = []
    for y in range(SENSOR_H):
        for x in range(SENSOR_W):
            if x <= OB[2]:
                out.append(BLACK + rng.choice((-1, 0, 0, 1)))
            elif top <= y <= bottom and left <= x <= right:
                colour = cr2.PHASES["RGGB"][(y % 2) * 2 + (x % 2)]
                cell = random.Random(seed * 1000 + (y // 4) * 100 + x // 4).uniform(0.05, 0.9)
                out.append(min(16383, BLACK + int(cell / mult[colour] * 9000)))
            else:
                out.append(BLACK + 300)  # exposed columns between the optical black and the crop
    return out


def make_cr3(values=None, version=0x100, levels=0, tiles=False, color_len=3778, wb=(2048, 1024, 1024, 1536),
             lens=b"RF24-240mm F4-6.3 IS USM", iad1=True, sample=None, header_size=None) -> bytes:
    """A whole CR3. ``sample`` and ``header_size`` replace the losslessly coded sensor sample (C-RAW tests)."""

    values = sensor(wb) if values is None else values
    if sample is None:
        w2, h2 = SENSOR_W // 2, SENSOR_H // 2
        bands = []
        for plane in range(4):
            oy, ox = plane >> 1, plane & 1
            lines = [[values[(2 * y + oy) * SENSOR_W + 2 * x + ox] - MID for x in range(w2)] for y in range(h2)]
            bands.append(encode_band(lines))
        header = struct.pack(">HHII", 0xFF01, 8, sum(len(b) for b in bands), 0)
        for plane, band in enumerate(bands):
            header += struct.pack(">HHII", 0xFF02, 8, len(band), 0x08000000 | (plane << 28))
            header += struct.pack(">HHII", 0xFF03, 8, len(band), 0)
        header += bytes(4)
        raw_sample = header + b"".join(bands)
        header_size = len(header)
    else:
        raw_sample = sample

    cmp1 = bytearray(60)
    struct.pack_into(">HH", cmp1, 0, 0xFF00, 0x30)
    struct.pack_into(">H", cmp1, 4, version)
    struct.pack_into(">4I", cmp1, 8, SENSOR_W, SENSOR_H, SENSOR_W // (2 if tiles else 1), SENSOR_H)
    cmp1[24] = BITS
    cmp1[25] = 4 << 4
    cmp1[26] = levels
    cmp1[27] = 0x80 if tiles else 0
    struct.pack_into(">I", cmp1, 28, header_size)
    rects = CROP + OB + (OB[2] + 1, 0, SENSOR_W - 1, 2) + (OB[2] + 1, 3, SENSOR_W - 1, SENSOR_H - 1)
    iad = bytes(4) + struct.pack(">22H", SENSOR_W, SENSOR_H, 1, 2, 1, 0, *rects)
    cdi1 = _box(b"CDI1", bytes(4) + _box(b"IAD1", iad))
    craw = _box(b"CRAW", bytes(82) + _box(b"CMP1", bytes(cmp1)) + (cdi1 if iad1 else b""))

    color = [0] * color_len
    if 0x69 + 4 <= color_len:
        color[0x69 : 0x69 + 4] = list(wb)
    note = _tiff([(0x4001, 3, tuple(color))])
    ctmd = struct.pack("<IH", 24, 1) + bytes(18)  # a record of another type, skipped
    entry = struct.pack("<II", 8 + len(note), 0x927C) + note
    ctmd += struct.pack("<IH", 12 + len(entry), 8) + bytes(6) + entry

    cmt1 = _tiff([(271, 2, tuple(b"Canon\0")), (272, 2, tuple(b"Canon EOS R8\0")), (274, 3, (1,))])
    cmt2 = _tiff([(33437, 5, (5.6,))])
    sensor_info = (34, SENSOR_W, SENSOR_H, 1, 1) + CROP + (0,) * 8
    cmt3 = _tiff([(0x00E0, 3, sensor_info), (0x0095, 2, tuple(lens) + (0,))])
    uuid = _box(b"uuid", cr3.CANON_UUID + _box(b"CMT1", cmt1) + _box(b"CMT2", cmt2) + _box(b"CMT3", cmt3))

    def trak(entry_box: bytes, offset: int, size: int) -> bytes:
        stsd = _box(b"stsd", struct.pack(">II", 0, 1) + entry_box)
        stsz = _box(b"stsz", struct.pack(">III", 0, size, 1))
        co64 = _box(b"co64", struct.pack(">IIQ", 0, 1, offset))
        return _box(b"trak", _box(b"mdia", _box(b"minf", _box(b"stbl", stsd + stsz + co64))))

    ftyp = _box(b"ftyp", b"crx " + struct.pack(">I", 1) + b"crx isom")

    def moov(raw_at: int, ctmd_at: int) -> bytes:
        return _box(b"moov", uuid + trak(craw, raw_at, len(raw_sample)) + trak(_box(b"CTMD", bytes(8)), ctmd_at, len(ctmd)))

    size = len(moov(0, 0))
    raw_at = len(ftyp) + size + 8
    ctmd_at = raw_at + len(raw_sample)
    return ftyp + moov(raw_at, ctmd_at) + _box(b"mdat", raw_sample + ctmd)


class CodecTests(unittest.TestCase):
    def test_round_trip_python(self):
        for seed, (w, h) in enumerate(((37, 23), (64, 40), (5, 9), (2, 3))):
            with self.subTest(size=(w, h)):
                lines = random_band(w, h, seed)
                self.assertEqual(cr3.decode_band(encode_band(lines), w, h), lines)

    def test_round_trip_native(self):
        fn = ljpeg_native.crx_function()
        if fn is None:
            self.skipTest("no C compiler")
        for seed, (w, h) in enumerate(((37, 23), (64, 40), (300, 50))):
            with self.subTest(size=(w, h)):
                lines = random_band(w, h, seed + 10)
                data = encode_band(lines)
                out = array("H", bytes(2 * 2 * w * h))
                self.assertEqual(fn(data, len(data), w, h, BITS, out.buffer_info()[0], 2 * w), 0)
                got = [[out[y * 2 * w + 2 * x] - MID for x in range(w)] for y in range(h)]
                self.assertEqual(got, lines)

    def test_run_state_carries_across_lines(self):
        # Long flat lines push the run index up; a noisy line after it must still decode.
        lines = [[0] * 200, [0] * 200, [7] * 200, list(range(200)), [3] * 200]
        self.assertEqual(cr3.decode_band(encode_band(lines), 200, 5), lines)


class ReadTests(unittest.TestCase):
    def test_tags_and_sensor(self):
        values = sensor()
        raw = rd.parse_raw(make_cr3(values))
        self.assertEqual(raw.source, "cr3")
        self.assertEqual((raw.width, raw.height), (SENSOR_W, SENSOR_H))
        self.assertEqual(list(raw.values), values)
        tags = raw.ifd.entries
        left, top, right, bottom = CROP
        self.assertEqual(tags[rd.TAG_ACTIVE_AREA], (top, left, bottom + 1, right + 1))
        self.assertEqual(tags[rd.TAG_BLACK_LEVEL], (2047.0,) * 4)
        self.assertEqual(tags[rd.TAG_CFA_PATTERN], cr2.PHASES["RGGB"])
        self.assertEqual(tags[rd.TAG_WHITE_LEVEL], (16383.0,))
        neutral = tags[rd.TAG_AS_SHOT_NEUTRAL]
        self.assertAlmostEqual(neutral[0], 0.5)
        self.assertAlmostEqual(neutral[2], 1024 / 1536)
        self.assertEqual(bytes(raw.ifd0.entries[rd.TAG_UNIQUE_CAMERA_MODEL]), b"Canon EOS R8\0")
        self.assertEqual(bytes(raw.exif.get(cr2.TAG_EXIF_LENS_MODEL)).rstrip(b"\0"), b"RF24-240mm F4-6.3 IS USM")
        self.assertEqual(cr3.camera_model(make_cr3(values)), "Canon EOS R8")

    def test_engines_agree(self):
        if ljpeg_native.crx_function() is None:
            self.skipTest("no C compiler")
        blob = make_cr3()
        self.assertEqual(cr3.parse_cr3(blob, engine="python").values, cr3.parse_cr3(blob, engine="c").values)

    def test_black_ignores_exposed_columns_left_of_the_crop(self):
        # Without IAD1 the reader falls back to every column left of the crop, which here
        # includes exposed ones at black + 300: the optical-black rectangle is what keeps them out.
        with_iad1 = rd.parse_raw(make_cr3(iad1=True)).ifd.entries[rd.TAG_BLACK_LEVEL]
        without = rd.parse_raw(make_cr3(iad1=False))
        self.assertEqual(with_iad1, (2047.0,) * 4)
        self.assertGreater(min(without.ifd.entries[rd.TAG_BLACK_LEVEL]), 2047.0)
        self.assertTrue(any("no IAD1" in n for n in without.notes))

    def test_unknown_color_data(self):
        raw = rd.parse_raw(make_cr3(color_len=999))
        self.assertNotIn(rd.TAG_AS_SHOT_NEUTRAL, raw.ifd.entries)
        self.assertTrue(any("999 entries is not known" in n for n in raw.notes))

    def test_unknown_codec_version_is_refused_with_the_reason(self):
        # C-RAW (version 0x200) is read since 2026-11-15 (tests/test_cr3_wavelet.py); other versions are not.
        with self.assertRaisesRegex(rd.DevelopError, "codec version 0x300.*DNG Converter"):
            rd.parse_raw(make_cr3(version=0x300, levels=3))

    def test_profile_chooser_refuses_an_unreadable_cr3_before_asking_for_a_profile(self):
        import tempfile

        from shootflow import camera_profiles

        with tempfile.TemporaryDirectory() as tmp:
            good, c_raw = Path(tmp) / "a.CR3", Path(tmp) / "b.CR3"
            good.write_bytes(make_cr3())
            c_raw.write_bytes(make_cr3(tiles=True))
            self.assertEqual(camera_profiles.camera_of(good), "Canon EOS R8")
            with self.assertRaisesRegex(rd.DevelopError, "several tiles"):
                camera_profiles.camera_of(c_raw)

    def test_tiled_sensor_is_refused(self):
        with self.assertRaisesRegex(rd.DevelopError, "several tiles"):
            rd.parse_raw(make_cr3(tiles=True))

    def test_not_a_cr3(self):
        self.assertFalse(cr3.is_cr3(b"II*\0" + bytes(20)))
        with self.assertRaises(rd.DevelopError):
            cr3.Container(b"\0\0\0\x18ftypisom" + bytes(12))

    def test_develops_with_a_profile_and_asks_for_one_without(self):
        from test_cr2 import make_profile

        raw = rd.parse_raw(make_cr3())
        with self.assertRaisesRegex(rd.DevelopError, "CR3 carries no colour matrix"):
            rd.develop(raw, rd.DevelopSettings())
        w, h, px, report = rd.develop(raw, rd.DevelopSettings(dcp=rd.read_dcp(make_profile())))
        self.assertEqual((w, h), (CROP[2] - CROP[0] + 1, CROP[3] - CROP[1] + 1))
        self.assertEqual(report.cfa, "RGGB")
        self.assertEqual(len(px), w * h * 3)


if __name__ == "__main__":
    unittest.main()
