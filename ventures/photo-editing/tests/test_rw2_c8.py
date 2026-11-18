"""Panasonic RW2 RawFormat 8 (GH6, GH7, G9 II, S5 II, S1 II, S9), read by ``shootflow.rw2``.

Each test builds an RW2 here: IFD0 with Panasonic's size, CFA, levels and balance tags, the
RawFormat 8 tables (a Huffman code per symbol in tag 0x40, per-symbol shifts in 0x41, the four
starting values in 0x3C-0x3F) and a tile layout (0x42-0x48), and tiles coded by an encoder in
this file: 2x2 blocks, each sensel a step from the same position of the block to its left, coded
as a lossless-JPEG style symbol and raw bits, bytes filled from their lowest bit. Every decoded
sensel is checked exactly, on the C decoder and the Python reference. Ten real files from six
bodies against LibRaw (every sensel equal): ``tools/rw2_libraw_check.py`` and
``eval/panasonic-rw2-format8-2026-11-15.md``.
"""

from __future__ import annotations

import random
import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from shootflow import ljpeg_native, rw2
from shootflow import raw_develop as rd
from test_raw_develop import _ifd_bytes

# Code lengths per symbol (symbol = how many raw bits follow). Codes are canonical, then inverted
# so the long ones are small numbers: tag 0x40 holds a code in 12 bits, as the cameras' do.
LENGTHS = [3, 3, 3, 3, 3, 4, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 12]


def codes_for(lengths):
    codes, code, prev = [0] * len(lengths), 0, None
    for sym in sorted(range(len(lengths)), key=lambda s: (lengths[s], s)):
        n = lengths[sym]
        if prev is not None:
            code = (code + 1) << (n - prev)
        prev = n
        codes[sym] = code
    return [(~c) & ((1 << n) - 1) for c, n in zip(codes, lengths)]


CODES = codes_for(LENGTHS)


class _Bits:
    def __init__(self):
        self.bits = []

    def put(self, value, n):
        self.bits += [(value >> (n - 1 - i)) & 1 for i in range(n)]

    def data(self):
        bits = self.bits + [0] * (-len(self.bits) % 8 + 64)
        out = bytearray()
        for i in range(0, len(bits), 8):
            out.append(sum(b << k for k, b in enumerate(bits[i : i + 8])))  # first bit is the lowest
        return bytes(out), len(self.bits)


def encode_tile(values, width, height, initial):
    """``values`` row-major for one tile; shifts all 0, as every checked body writes."""

    w = _Bits()
    first = list(initial)
    for pair in range(height // 2):
        base = list(first)
        for col in range(0, width, 2):
            r0, r1 = 2 * pair * width + col, (2 * pair + 1) * width + col
            block = [values[r0], values[r0 + 1], values[r1], values[r1 + 1]]
            for slot in (0, 2, 1, 3):
                d = block[slot] - base[slot]
                k = abs(d).bit_length()
                w.put(CODES[k], LENGTHS[k])
                if k:
                    w.put(d if d > 0 else d + (1 << k) - 1, k)
            base = block
            if col == 0:
                first = list(block)
    return w.data()


def _counted(fmt, values, count):
    """Panasonic's counted arrays: a 16-bit count of ``fmt`` items, then ``count`` items' room."""

    n = len(values) // len(fmt)
    values = list(values) + [0] * (len(fmt) * count - len(values))
    return tuple(struct.pack("<H" + fmt * count, n, *values))


def make_c8(*, tiles=((24, 8), (16, 8)), tile_rows=1, bits=14, seed=1, initial=(500, 510, 520, 530),
            shifts=None, curve=False, payloads=None, black=512, spread=None, pack_top=True):
    """An RW2 with RawFormat 8: (file bytes, expected sensels, width, height). ``tiles`` lists
    (width, height) per tile, row-major, ``tile_rows`` rows of them. ``pack_top`` writes each tile's
    top row into tag 0x45's high 16 bits, as the S1R II's 4 x 2 grid does; False leaves it 0."""

    rng = random.Random(seed)
    cols = len(tiles) // tile_rows
    width = sum(w for w, _ in tiles[:cols])
    height = sum(tiles[r * cols][1] for r in range(tile_rows))
    top = (1 << bits) - 1
    spread = spread or top // 8
    expected = [0] * (width * height)
    lefts, tops, coded = [], [], []
    for t, (w, h) in enumerate(tiles):
        r, c = divmod(t, cols)
        left = sum(tiles[r * cols + k][0] for k in range(c))
        y0 = sum(tiles[k * cols + c][1] for k in range(r))
        vals = []
        level = rng.randrange(top // 4, top // 2)
        for i in range(w * h):
            level = min(top, max(0, level + rng.randint(-spread, spread)))
            vals.append(level if rng.random() > 0.02 else rng.choice((0, top)))
        for y in range(h):
            expected[(y0 + y) * width + left : (y0 + y) * width + left + w] = vals[y * w : (y + 1) * w]
        lefts.append(((y0 << 16) if pack_top else 0) | left)
        tops.append(y0)
        coded.append(encode_tile(vals, w, h, initial) if payloads is None else payloads[t])

    def ifd0(data_at):
        offsets, at = [], data_at
        for blob, _ in coded:
            offsets.append(at)
            at += len(blob)
        e = [
            (0x02, 3, (width,)), (0x03, 3, (height,)),
            (0x04, 3, (0,)), (0x05, 3, (0,)), (0x06, 3, (height,)), (0x07, 3, (width,)),
            (0x09, 3, (1,)), (0x0A, 3, (bits,)), (0x0B, 3, (34316,)),
            (0x0E, 3, (top,)), (0x0F, 3, (top,)), (0x10, 3, (top,)),
            (0x1C, 3, (black,)), (0x1D, 3, (black,)), (0x1E, 3, (black,)),
            (0x24, 3, (520,)), (0x25, 3, (256,)), (0x26, 3, (420,)),
            (0x2D, 3, (8,)),
            (0x39, 7, _counted("I", [65536 | (3 if curve else 0)] * 6, 6)),
            (0x3A, 7, _counted("HH", [0, 0] * 6, 6)),
            (0x3B, 3, (top,)),
            (0x3C, 3, (initial[0],)), (0x3D, 3, (initial[1],)), (0x3E, 3, (initial[2],)), (0x3F, 3, (initial[3],)),
            (0x40, 7, _counted("HH", [v for pair in zip(LENGTHS, CODES) for v in pair], 17)),
            (0x41, 7, _counted("H", shifts or [0] * 17, 17)),
            (0x42, 3, (cols,)), (0x43, 3, (tile_rows,)),
            (0x44, 7, _counted("I", offsets, 12)),
            (0x45, 7, _counted("I", lefts, 12)),
            (0x46, 7, _counted("I", [n for _, n in coded], 12)),
            (0x47, 7, _counted("H", [w for w, _ in tiles], 12)),
            (0x48, 7, _counted("H", [h for _, h in tiles], 12)),
            (271, 2, tuple(b"Panasonic\0")), (272, 2, tuple(b"DC-GH6\0")),
            (0x118, 4, (data_at,)),
        ]
        return sorted(e)

    head_len = 8 + len(_ifd_bytes(ifd0(0), 8))
    blob = b"IIU\0" + struct.pack("<I", 8) + _ifd_bytes(ifd0(head_len), 8) + b"".join(b for b, _ in coded)
    return blob, expected, width, height


def engines():
    return ["python", "native"] if ljpeg_native.available() else ["python"]


class Format8Tests(unittest.TestCase):
    def test_tiles_decode_exactly_on_both_engines(self):
        data, expected, w, h = make_c8()
        for engine in engines():
            raw = rw2.parse_rw2(data, engine=engine)
            self.assertEqual(list(raw.values), expected, engine)
        self.assertIn("RawFormat 8, 14-bit, 2 tiles", raw.notes[0])
        self.assertEqual((raw.width, raw.height), (w, h))

    def test_a_grid_of_tiles_and_every_symbol(self):
        # 2 x 2 tiles (a second row of tiles starts below the first); steps from 0 to the full range use
        # every symbol up to 16 at 16 bits.
        data, expected, _, _ = make_c8(tiles=((12, 6), (20, 6), (12, 4), (20, 4)), tile_rows=2, bits=16,
                                       spread=40000, seed=4)
        for engine in engines():
            self.assertEqual(list(rw2.parse_rw2(data, engine=engine).values), expected, engine)

    def test_a_4_by_2_grid_like_the_s1r_ii_high_resolution_mode(self):
        # The S1R II's 177 MP mode: four tiles of unequal widths (4656, 3792, 3632, 4216) in two rows of
        # unequal heights (5632, 5224), scaled down here; tag 0x45 carries (top << 16) | left.
        tiles = ((10, 8), (8, 8), (6, 8), (12, 8), (10, 6), (8, 6), (6, 6), (12, 6))
        data, expected, w, h = make_c8(tiles=tiles, tile_rows=2, seed=9)
        for engine in engines():
            raw = rw2.parse_rw2(data, engine=engine)
            self.assertEqual(list(raw.values), expected, engine)
        self.assertEqual((w, h), (36, 14))
        self.assertIn("8 tiles", raw.notes[0])

    def test_a_tile_whose_stored_top_disagrees_is_refused(self):
        # A second row of tiles that says it starts at row 0 would overwrite the first row.
        data, _, _, _ = make_c8(tiles=((12, 6), (20, 6), (12, 4), (20, 4)), tile_rows=2, pack_top=False)
        with self.assertRaisesRegex(rd.DevelopError, "says it starts at row 0, the tiles above it end at 6"):
            rw2.parse_rw2(data, engine="python")

    def test_levels_white_and_balance(self):
        for bits, white in ((12, 4079), (14, 16319), (16, 65535)):
            raw = rw2.parse_rw2(make_c8(bits=bits, black=128)[0], engine="python")
            e = raw.ifd.entries
            self.assertEqual(e[rd.TAG_WHITE_LEVEL], (white,), bits)
            self.assertEqual(e[rd.TAG_BLACK_LEVEL], (128.0,) * 4)
            self.assertEqual(e[rd.TAG_BITS], (bits,))
        self.assertEqual(e[rd.TAG_CFA_PATTERN], (0, 1, 1, 2))

    def test_shift_semantics_worked_by_hand(self):
        # Symbol 3 with shift 1 reads 2 raw bits r: r = 0b11 steps +(3 << 1) + 1 = 7; r = 0b01 (top bit
        # clear) steps (1 << 1) - 8 + 1 = -5. Symbol 1 with shift 1 reads no raw bits and takes its sign
        # from the next bit without using it: next bit 0 steps -2 + 1 = -1, next bit 1 steps +1.
        shifts = [0] * 17
        shifts[3] = shifts[1] = 1
        w = _Bits()
        for sym, raw in ((3, (0b11, 2)), (3, (0b01, 2)), (1, None), (0, None),
                         (1, None), (10, (0b1000000000, 10)), (0, None), (0, None)):
            w.put(CODES[sym], LENGTHS[sym])
            if raw:
                w.put(*raw)
        blob, nbits = w.data()
        # Sensel order in a block is TL, BL, TR, BR. First block: TL +7, BL -5, TR +1 (the next code,
        # symbol 0's, starts with a 1 bit), BR 0. Second block: TL -1 (symbol 10's code starts with a 0
        # bit), BL +512, TR and BR unchanged.
        self.assertEqual(CODES[0] >> (LENGTHS[0] - 1), 1)
        self.assertEqual(CODES[10] >> (LENGTHS[10] - 1), 0)
        data, _, _, _ = make_c8(tiles=((4, 2),), shifts=shifts, payloads=[(blob, nbits)], initial=(100, 200, 300, 400))
        for engine in engines():
            got = list(rw2.parse_rw2(data, engine=engine).values)
            self.assertEqual(got, [107, 201, 106, 201, 295, 400, 807, 400], engine)

    def test_random_streams_agree_between_engines(self):
        if not ljpeg_native.available():
            self.skipTest("no C compiler")
        rng = random.Random(9)
        for seed in range(4):
            shifts = [rng.choice((0, 0, 1, 2, 3)) for _ in range(17)]
            w = _Bits()
            for _ in range(40 * 6):  # 4 sensels a block, 10 blocks a row pair, 6 pairs
                sym = rng.choice(range(12))
                w.put(CODES[sym], LENGTHS[sym])
                extra = sym - shifts[sym]
                if extra > 0:
                    w.put(rng.getrandbits(extra), extra)
            data, _, _, _ = make_c8(tiles=((20, 12),), shifts=shifts, payloads=[w.data()], bits=12, seed=seed)
            ours = [list(rw2.parse_rw2(data, engine=e).values) for e in ("python", "native")]
            self.assertEqual(ours[0], ours[1], seed)
            self.assertLessEqual(max(ours[0]), 4095)

    def test_part_of_each_tile(self):
        data, expected, w, h = make_c8()
        reader, ifds = rw2._ifds(data)
        p = rw2.C8Params(ifds[0], w, h, len(data))
        for engine in engines():
            got = list(rw2.decode_c8(data, p, w, h, engine, pairs=1))
            self.assertEqual(got[: 2 * w], expected[: 2 * w], engine)
            self.assertEqual(set(got[2 * w :]), {0}, engine)

    def test_refusals(self):
        with self.assertRaisesRegex(rd.DevelopError, "tone curve"):
            rw2.parse_rw2(make_c8(curve=True)[0])
        with self.assertRaisesRegex(rd.DevelopError, "not supported"):
            rw2.parse_rw2(make_c8(bits=10)[0])
        # A tile stream cut short past the end of the file.
        data, _, _, _ = make_c8()
        with self.assertRaisesRegex(rd.DevelopError, "past the end"):
            rw2.parse_rw2(data[:-80])
        # A stream of zero bytes: the inverted canonical codes leave 16 zero bits matching no code.
        blob = bytes(64)
        data, _, w, h = make_c8(tiles=((4, 2),), payloads=[(blob, 8 * len(blob))])
        self.assertEqual(rw2.C8Params(rw2._ifds(data)[1][0], w, h, len(data)).lookup[0], 17)
        for engine in engines():
            with self.assertRaisesRegex(rd.DevelopError, "matches no symbol"):
                rw2.parse_rw2(data, engine=engine)


if __name__ == "__main__":
    unittest.main()
