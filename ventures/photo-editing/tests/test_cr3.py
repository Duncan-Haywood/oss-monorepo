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


def sensor(levels=(2048, 1024, 1024, 1536), seed=3, width=SENSOR_W, height=SENSOR_H) -> list[int]:
    """Masked columns at BLACK with noise, a scene of coloured 4x4 cells behind RGGB, clipped highlights."""

    rng = random.Random(seed)
    mult = (levels[0] / 1024, 1.0, levels[3] / 1024)
    left, top, right, bottom = CROP
    out = []
    for y in range(height):
        for x in range(width):
            if x <= OB[2]:
                out.append(BLACK + rng.choice((-1, 0, 0, 1)))
            elif top <= y <= bottom and left <= x <= right:
                colour = cr2.PHASES["RGGB"][(y % 2) * 2 + (x % 2)]
                cell = random.Random(seed * 1000 + (y // 4) * 100 + x // 4).uniform(0.05, 0.9)
                out.append(min(16383, BLACK + int(cell / mult[colour] * 9000)))
            else:
                out.append(BLACK + 300)  # exposed columns between the optical black and the crop
    return out


def tiled_sample(values: list[int], width: int, height: int, tile: tuple[int, int], tile_size_pad: int = 0) -> tuple[bytes, int]:
    """A lossless CRX sample of a ``width`` x ``height`` sensor cut into tiles of ``tile`` (sensor units), laid
    out as LibRaw reads it: per tile a 0xFF01 header with its index, per plane 0xFF02 (plane number in the top
    four flag bits) and 0xFF03, then the data tile after tile, plane after plane. Returns (sample, header size)."""

    pw, ph = width // 2, height // 2
    tw, th = tile[0] // 2, tile[1] // 2
    cols, rows = -(-pw // tw), -(-ph // th)
    header = b""
    data = b""
    index = 0
    for r in range(rows):
        for c in range(cols):
            x0, y0 = c * tw, r * th
            w_, h_ = min(tw, pw - x0), min(th, ph - y0)
            bands = []
            for plane in range(4):
                oy, ox = plane >> 1, plane & 1
                lines = [[values[(2 * (y0 + y) + oy) * width + 2 * (x0 + x) + ox] - MID for x in range(w_)] for y in range(h_)]
                bands.append(encode_band(lines))
            header += struct.pack(">HHIHH", 0xFF01, 8, sum(len(b) for b in bands) + tile_size_pad, index, 0)
            for plane, band in enumerate(bands):
                header += struct.pack(">HHII", 0xFF02, 8, len(band), 0x08000000 | (plane << 28))
                header += struct.pack(">HHII", 0xFF03, 8, len(band), 0)
            data += b"".join(bands) + b"\xa5" * tile_size_pad  # not zeros: a band read from a zero pad can decode the same
            index += 1
    header += bytes(4)
    return header + data, len(header)


def make_cr3(values=None, version=0x100, levels=0, tiles=False, color_len=3778, wb=(2048, 1024, 1024, 1536),
             lens=b"RF24-240mm F4-6.3 IS USM", iad1=True, sample=None, header_size=None, size=None, tile=None,
             stated_black=None) -> bytes:
    """A whole CR3. ``sample`` and ``header_size`` replace the losslessly coded sensor sample (C-RAW tests).

    ``size`` is the sensor's (width, height) (default 64 x 40); ``tile`` a tile size in sensor units, coded as
    real tiles. ``tiles=True`` alone only sets CMP1's several-tiles fields (half-width tiles) over a one-tile
    sample, for the refusal tests."""

    width, height = size or (SENSOR_W, SENSOR_H)
    values = sensor(wb, width=width, height=height) if values is None else values
    tile_w, tile_h = tile or ((width // 2, height) if tiles else (width, height))
    if sample is None:
        raw_sample, header_size = tiled_sample(values, width, height, tile or (width, height))
    else:
        raw_sample = sample

    cmp1 = bytearray(60)
    struct.pack_into(">HH", cmp1, 0, 0xFF00, 0x30)
    struct.pack_into(">H", cmp1, 4, version)
    struct.pack_into(">4I", cmp1, 8, width, height, tile_w, tile_h)
    cmp1[24] = BITS
    cmp1[25] = 4 << 4
    cmp1[26] = levels
    cmp1[27] = (0x80 if tile_w < width else 0) | (0x40 if tile_h < height else 0)
    struct.pack_into(">I", cmp1, 28, header_size)
    rects = CROP + OB + (OB[2] + 1, 0, width - 1, 2) + (OB[2] + 1, 3, width - 1, height - 1)
    iad = bytes(4) + struct.pack(">22H", width, height, 1, 2, 1, 0, *rects)
    cdi1 = _box(b"CDI1", bytes(4) + _box(b"IAD1", iad))
    craw = _box(b"CRAW", bytes(82) + _box(b"CMP1", bytes(cmp1)) + (cdi1 if iad1 else b""))

    color = [0] * color_len
    if 0x69 + 4 <= color_len:
        color[0x69 : 0x69 + 4] = list(wb)
    if stated_black is not None:
        at = cr3._BLACK_INDEX[color_len]
        color[at : at + 4] = list(stated_black)
    note = _tiff([(0x4001, 3, tuple(color))])
    ctmd = struct.pack("<IH", 24, 1) + bytes(18)  # a record of another type, skipped
    entry = struct.pack("<II", 8 + len(note), 0x927C) + note
    ctmd += struct.pack("<IH", 12 + len(entry), 8) + bytes(6) + entry

    cmt1 = _tiff([(271, 2, tuple(b"Canon\0")), (272, 2, tuple(b"Canon EOS R8\0")), (274, 3, (1,))])
    cmt2 = _tiff([(33437, 5, (5.6,))])
    sensor_info = (34, width, height, 1, 1) + CROP + (0,) * 8
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


TILED_SIZE = (120, 100)  # planes 60 x 50: a 64 x 52 tile gives plane tiles of 32 + 28 across, 26 + 24 down


def busy_sensor(width: int, height: int, seed: int = 5) -> list[int]:
    """Detail in every tile: noise over a gradient, with flat patches so the run mode is used too.

    (``sensor()`` is flat right of its crop, and a flat tile codes to a few bytes, too little to show a
    tile read from the wrong place.)"""

    rng = random.Random(seed)
    out = []
    for y in range(height):
        for x in range(width):
            if (x // 8 + y // 8) % 5 == 0:
                out.append(BLACK + 500)
            else:
                out.append(min(16383, BLACK + 40 * x + 25 * y + rng.randrange(0, 400)))
    return out


def differing(got, want) -> int:
    return sum(1 for a, b in zip(got, want) if a != b) + abs(len(got) - len(want))


class TiledTests(unittest.TestCase):
    """A full-quality CR3 whose sensor is stored in several tiles (wide sensors: the R5 class)."""

    def _check(self, tile, engine, size=TILED_SIZE):
        values = busy_sensor(*size)
        data = make_cr3(values=values, size=size, tile=tile)
        box = cr3.Container(data)
        _head, out = cr3.decode_sensor(data, box, engine=engine)
        self.assertEqual(differing(out, values), 0)

    def test_grids_both_engines(self):
        engines = ["python"] + (["c"] if ljpeg_native.crx_function() else [])
        # 2 x 2 uneven, 2 across, 2 down, 2 x 2 even across, and 3 across (plane tiles of 24, 24, 22).
        for size, tile in ((TILED_SIZE, (64, 52)), (TILED_SIZE, (76, 100)), (TILED_SIZE, (120, 52)),
                           (TILED_SIZE, (60, 52)), ((140, 60), (48, 60))):
            for engine in engines:
                with self.subTest(size=size, tile=tile, engine=engine):
                    self._check(tile, engine, size)

    def test_grid_matches_libraw_layout(self):
        head = cr3.Container(make_cr3(size=TILED_SIZE, tile=(64, 52))).head
        got = [(t.index, t.row, t.col, t.width, t.height) for t in cr3.tile_grid(head)]
        self.assertEqual(got, [(0, 0, 0, 32, 26), (1, 0, 32, 28, 26), (2, 26, 0, 32, 24), (3, 26, 32, 28, 24)])

    def test_tile_byte_count_places_the_next_tile(self):
        # A tile whose byte count runs past its planes (padding): the next tile starts where the count says.
        values = busy_sensor(*TILED_SIZE)
        sample, header_size = tiled_sample(values, *TILED_SIZE, (64, 100), tile_size_pad=7)
        data = make_cr3(values=values, size=TILED_SIZE, tile=(64, 100), sample=sample, header_size=header_size)
        for engine in ["python"] + (["c"] if ljpeg_native.crx_function() else []):
            with self.subTest(engine=engine):
                _head, out = cr3.decode_sensor(data, cr3.Container(data), engine=engine)
                self.assertEqual(differing(out, values), 0)

    def test_parse_raw_develops_a_tiled_frame(self):
        values = sensor(width=TILED_SIZE[0], height=TILED_SIZE[1])
        raw = rd.parse_raw(make_cr3(values=values, size=TILED_SIZE, tile=(64, 52)))
        self.assertEqual((raw.width, raw.height), TILED_SIZE)
        self.assertEqual(differing(raw.values, values), 0)

    def test_refusals(self):
        values = sensor(width=TILED_SIZE[0], height=TILED_SIZE[1])
        good, header_size = tiled_sample(values, *TILED_SIZE, (64, 52))
        bad_index = bytearray(good)
        struct.pack_into(">H", bad_index, 8, 5)
        with self.assertRaisesRegex(rd.DevelopError, "tile header 0 names tile 5"):
            rd.parse_raw(make_cr3(values=values, size=TILED_SIZE, tile=(64, 52), sample=bytes(bad_index), header_size=header_size))
        bad_plane = bytearray(good)
        bad_plane[12 + 8] = 0x18  # plane 0's header naming plane 1
        with self.assertRaisesRegex(rd.DevelopError, "names plane 1"):
            rd.parse_raw(make_cr3(values=values, size=TILED_SIZE, tile=(64, 52), sample=bytes(bad_plane), header_size=header_size))
        with self.assertRaisesRegex(rd.DevelopError, "edge tile under 22"):
            rd.parse_raw(make_cr3(values=values, size=TILED_SIZE, tile=(96, 100)))  # 48 + 12 plane sensels
        with self.assertRaisesRegex(rd.DevelopError, "tile size .* not valid"):
            rd.parse_raw(make_cr3(values=values, size=TILED_SIZE, tile=(40, 100)))  # 20-sensel plane tiles

    def test_several_tiles_flags_are_not_needed(self):
        # The real EOS M200, M50, RP, 250D and 90D RAWs store two tiles side by side with both of CMP1's
        # several-tiles flags 0; LibRaw reads the grid from the sizes, and so does this reader
        # (eval/canon-cr3-every-body-2026-11-18.md).
        values = sensor(width=TILED_SIZE[0], height=TILED_SIZE[1])
        sample, header_size = tiled_sample(values, *TILED_SIZE, (64, 52))
        flags = bytearray(make_cr3(values=values, size=TILED_SIZE, tile=(64, 52), sample=sample, header_size=header_size))
        at = flags.index(b"CMP1") + 4 + 27
        flags[at] = 0x00
        self.assertEqual(list(rd.parse_raw(bytes(flags)).values), values)


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

    def test_color_data12_white_balance_and_stated_black(self):
        # The R5 Mark II's ColorData12 (4,528 entries): as-shot balance at 0x69, PerChannelBlackLevel at 0x17F.
        raw = rd.parse_raw(make_cr3(color_len=4528, stated_black=(2047, 2047, 2047, 2047)))
        tags = raw.ifd.entries
        self.assertAlmostEqual(tags[rd.TAG_AS_SHOT_NEUTRAL][0], 0.5)
        self.assertEqual(tags[rd.TAG_BLACK_LEVEL], (2047.0,) * 4)
        self.assertFalse(any("ColorData states" in n for n in raw.notes))

    def test_stated_black_wins_over_a_measured_one_and_the_gap_is_noted(self):
        # As on the R5 Mark II, where IAD1's optical black takes in a darker strip: the stated level is used.
        raw = rd.parse_raw(make_cr3(color_len=4528, stated_black=(2039, 2040, 2041, 2042)))
        self.assertEqual(raw.ifd.entries[rd.TAG_BLACK_LEVEL], (2039.0, 2040.0, 2041.0, 2042.0))
        self.assertTrue(any("2039/2040/2041/2042 as ColorData states it" in n and "measure 2047" in n for n in raw.notes))

    def test_stated_black_follows_the_crop_phase(self):
        # R, G on red's rows, G on blue's, B, laid on the CFA at the crop's origin (here GBRG: crop starts on a G row).
        self.assertEqual(cr3._stated_black(self._cd(1, 2, 3, 4), 14, "GBRG"), [3.0, 4.0, 1.0, 2.0])
        self.assertEqual(cr3._stated_black(self._cd(1, 2, 3, 4), 14, "BGGR"), [4.0, 3.0, 2.0, 1.0])
        self.assertEqual(cr3._stated_black(self._cd(1, 2, 3, 4), 14, "RGGB"), [1.0, 2.0, 3.0, 4.0])
        self.assertIsNone(cr3._stated_black(self._cd(0, 0, 0, 0), 14, "RGGB"))  # not stated: measure instead
        self.assertIsNone(cr3._stated_black((0,) * 3778, 14, "RGGB"))  # version 0 of 3,778 entries: place not known

    def test_stated_black_place_follows_the_colordata_version(self):
        # One length, two layouts (eval/canon-cr3-every-body-2026-11-18.md): 3,778 entries is version 48 on the
        # R7/R10/R50 (black at 0x16B) and 66 on the R6 Mark III (at 0x17F); 1,816 entries version 19 at 0x149.
        def cd(length, version, at, value):
            out = [0] * length
            out[0] = version
            out[at : at + 4] = [value] * 4
            return tuple(out)

        self.assertEqual(cr3._stated_black(cd(3778, 48, 0x16B, 2048), 14, "RGGB"), [2048.0] * 4)
        self.assertEqual(cr3._stated_black(cd(3778, 66, 0x17F, 512), 14, "RGGB"), [512.0] * 4)
        self.assertIsNone(cr3._stated_black(cd(3778, 66, 0x16B, 512), 14, "RGGB"))  # v66 does not look at 0x16B
        self.assertEqual(cr3._stated_black(cd(1816, 19, 0x149, 511), 14, "RGGB"), [511.0] * 4)
        self.assertIsNone(cr3._stated_black(cd(3778, 50, 0x16B, 512), 14, "RGGB"))  # an unseen version: measure

    @staticmethod
    def _cd(*black):
        cd = [0] * 4528
        cd[0x17F : 0x17F + 4] = black
        return tuple(cd)

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
            c_raw.write_bytes(make_cr3(version=0x300, levels=3))
            self.assertEqual(camera_profiles.camera_of(good), "Canon EOS R8")
            with self.assertRaisesRegex(rd.DevelopError, "codec version 0x300"):
                camera_profiles.camera_of(c_raw)

    def test_c_raw_with_fewer_tiles_than_cmp1_names_is_refused(self):
        # C-RAW tiles are read since 2026-11-16 (test_cr3_wavelet.TiledCrawTests); a lossless one-tile sample
        # under a CMP1 that names C-RAW in two tiles is refused, not read as something else.
        with self.assertRaisesRegex(rd.DevelopError, "C-RAW"):
            rd.parse_raw(make_cr3(version=0x200, levels=3, tiles=True, size=TILED_SIZE))

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
