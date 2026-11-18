"""Canon CRW (CIFF) read straight into the developer (``shootflow.crw``).

An encoder here writes a known sensor through Canon's coding (64-sensel blocks, the first coefficient
through the "first" tree and run-length symbols through the "second", a carried first coefficient,
two running values that restart at 512 every row, 0xFF 0x00 stuffing) into a small CIFF file with the
records the reader uses (raw data, make and model, SensorInfo with a masked area, the decoder table,
ShotInfo, ColorBalance, ImageSpec). The decoded sensels are checked exactly, 10-bit and with the two
stored low bits, for each of the three tree pairs. The 20 real files from 15 bodies against LibRaw
(every sensel equal): ``tools/crw_libraw_check.py`` and ``eval/canon-crw-reader-2026-11-16.md``.
"""

from __future__ import annotations

import random
import struct
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from shootflow import camera_profiles, crw, raw_preview
from shootflow import raw_develop as rd


def _codes(tree) -> dict[int, tuple[int, int]]:
    """symbol -> (code, length), canonical as the decoder builds them."""

    counts, symbols = tree[:16], tree[16:]
    out: dict[int, tuple[int, int]] = {}
    code, k = 0, 0
    for length in range(1, 17):
        for _ in range(counts[length - 1]):
            out.setdefault(symbols[k], (code, length))
            code += 1
            k += 1
        code <<= 1
    return out


class _Bits:
    def __init__(self):
        self.acc, self.n, self.out = 0, 0, bytearray()

    def put(self, value: int, n: int) -> None:
        for i in range(n - 1, -1, -1):
            self.acc = (self.acc << 1) | ((value >> i) & 1)
            self.n += 1
            if self.n == 8:
                self.out.append(self.acc)
                if self.acc == 0xFF:
                    self.out.append(0)
                self.acc, self.n = 0, 0

    def done(self) -> bytes:
        if self.n:
            self.put(0, 8 - self.n)
        return bytes(self.out)


def _magnitude(d: int) -> tuple[int, int]:
    if d == 0:
        return 0, 0
    n = abs(d).bit_length()
    return n, d if d > 0 else d + (1 << n) - 1


def encode(values: list[int], width: int, height: int, table: int) -> bytes:
    """Ten-bit ``values`` (row-major) as Canon's coded stream."""

    first, second = _codes(crw.FIRST_TREES[table]), _codes(crw.SECOND_TREES[table])
    assert width % 64 == 0
    diffs: list[int] = []
    base = [512, 512]
    for p, v in enumerate(values):
        if p % width == 0:
            base = [512, 512]
        diffs.append(v - base[p & 1])
        base[p & 1] = v
    bits = _Bits()
    carry = 0
    for row in range(0, height, 8):
        nblocks = min(8, height - row) * width >> 6
        for block in range(nblocks):
            at = row * width + block * 64
            blk = diffs[at : at + 64]
            dc = blk[0] - carry
            carry = blk[0]
            n, v = _magnitude(dc)
            code, length = first[n]
            bits.put(code, length)
            bits.put(v, n)
            last = max((i for i in range(1, 64) if blk[i]), default=0)
            run = 0
            for i in range(1, last + 1):
                if not blk[i]:
                    run += 1
                    continue
                while run > 15:
                    code, length = second[0xF0]
                    bits.put(code, length)
                    run -= 16
                n, v = _magnitude(blk[i])
                code, length = second[(run << 4) | n]
                bits.put(code, length)
                bits.put(v, n)
                run = 0
            if last < 63:
                code, length = second[0x00]
                bits.put(code, length)
    return bits.done()


def heap(entries: list[tuple[int, bytes]]) -> bytes:
    """A CIFF heap: the records' data, then the table (count, 10-byte records), then the table's offset."""

    data = bytearray()
    recs = []
    for type_, blob in entries:
        recs.append((type_, len(blob), len(data)))
        data += blob
    table = len(data)
    data += struct.pack("<H", len(recs))
    for type_, length, offset in recs:
        data += struct.pack("<HII", type_, length, offset)
    data += struct.pack("<I", table)
    return bytes(data)


def make_crw(
    values12: list[int] | None = None,
    values10: list[int] | None = None,
    width: int = 128,
    height: int = 64,
    table: int = 0,
    model: str = "Canon EOS 10D",
    wbi: int = 0,
    rotation: int = 0,
    picture: tuple[int, int, int, int] = (16, 4, 127, 63),
    mask: tuple[int, int, int, int] = (2, 4, 9, 63),
    balance: bool = True,
) -> bytes:
    if values12 is not None:
        low = bytearray(width * height // 4)
        for i, v in enumerate(values12):
            low[i >> 2] |= (v & 3) << ((i & 3) * 2)
        stream = encode([v >> 2 for v in values12], width, height, table)
        raw = bytes(low) + bytes(514) + stream
    else:
        stream = encode(values10, width, height, table)
        raw = bytes(514) + stream
    shot = struct.pack("<33H", 66, 0, 192, 212, 159, 208, 32, wbi, *([0] * 25))
    sensor = struct.pack("<17H", 34, width, height, 1, 1, *picture, *mask, 0, 0, 0, 0)
    groups = [(1742, 832, 832, 1241), (1797, 832, 832, 1002), (2140, 832, 832, 854), (1972, 832, 832, 921),
              (1382, 970, 970, 1779), (1587, 841, 841, 1371), (1999, 832, 832, 920), (1797, 832, 832, 1002),
              (1801, 832, 832, 1001)]
    color_balance = struct.pack("<H", 82) + b"".join(struct.pack("<4H", *g) for g in groups) + struct.pack("<4H", 128, 128, 128, 128)
    spec = struct.pack("<IIII", picture[2] - picture[0] + 1, picture[3] - picture[1] + 1, 0x3F800000, rotation)
    inner = [
        (crw.REC_MAKE_MODEL, b"Canon\0" + model.encode() + b"\0"),
        (crw.REC_IMAGE_SPEC, spec),
        (crw.REC_SHOT_INFO, shot),
        (crw.REC_SENSOR_INFO, sensor),
        (crw.REC_DECODER_TABLE, struct.pack("<I", table)),
    ]
    if balance:
        inner.append((crw.REC_COLOR_BALANCE, color_balance))
    root = heap([(crw.REC_RAW, raw), (0x300A, heap(inner))])
    return b"II" + struct.pack("<I", 26) + b"HEAPCCDR" + struct.pack("<I", 0x00010002) + bytes(8) + root


def sensor(width: int, height: int, seed: int, full: int, black: int, picture_left: int = 16) -> list[int]:
    """A smooth picture with noise right of ``picture_left`` and black plus noise left of it."""

    rnd = random.Random(seed)
    out = []
    for y in range(height):
        for x in range(width):
            if x < picture_left:
                out.append(black + rnd.randint(-2, 2))
            else:
                level = black + (full - black) * (0.15 + 0.6 * ((x * 7 + y * 3) % 97) / 97)
                out.append(max(0, min(full, int(level) + rnd.randint(-6, 6) + (40 if (x // 3 + y) % 7 == 0 else 0))))
    return out


class DecoderTest(unittest.TestCase):
    def test_trees_build(self):
        for t in range(3):
            for tree in (crw.FIRST_TREES[t], crw.SECOND_TREES[t]):
                longest, lut = crw.huffman_lut(tree)
                self.assertEqual(len(lut), 1 << longest)
                # Canon's second trees leave a sliver of the code space unused; valid streams never reach it.
                self.assertGreater(sum(1 for e in lut if e) / len(lut), 0.99)

    def test_ten_bit_every_table(self):
        w, h = 128, 64
        values = sensor(w, h, 1, 1023, 32)
        for table in range(3):
            data = make_crw(values10=values, width=w, height=h, table=table)
            self.assertFalse(crw.has_low_bits(data))
            raw = crw.parse_crw(data)
            self.assertEqual(list(raw.values), values, f"table {table}")
            self.assertEqual(raw.ifd.one(rd.TAG_BITS), 10)
            self.assertEqual(raw.ifd.one(rd.TAG_WHITE_LEVEL), 1023)

    def test_low_bits_every_table(self):
        # 256 x 260: the low-bits block (16,640 bytes) covers the window dcraw's test reads (540 to 16,383).
        w, h = 256, 260
        values = sensor(w, h, 2, 4095, 128)
        values[1000:1008] = [3, 3, 3, 3, 1, 0, 0, 0]  # a 0xFF low-bits byte followed by a nonzero one
        for table in range(3):
            data = make_crw(values12=values, width=w, height=h, table=table, picture=(16, 4, 255, 259), mask=(2, 4, 9, 259))
            self.assertTrue(crw.has_low_bits(data))
            raw = crw.parse_crw(data)
            self.assertEqual(list(raw.values), values, f"table {table}")
            self.assertEqual(raw.ifd.one(rd.TAG_BITS), 12)

    def test_partial_last_group_of_rows(self):
        # 68 rows: the last group is 4 rows high, as on the 10D's 2,068.
        w, h = 128, 68
        values = sensor(w, h, 3, 1023, 32)
        raw = crw.parse_crw(make_crw(values10=values, width=w, height=h, picture=(16, 4, 127, 67), mask=(2, 4, 9, 67)))
        self.assertEqual(list(raw.values), values)

    def test_stuffing_and_marker(self):
        self.assertEqual(crw.destuff(b"\x01\xff\x00\x02\xff\xd9\x05"), b"\x01\xff\x02")

    def test_corrupt_stream_never_reads_as_the_picture(self):
        w, h = 128, 64
        values = sensor(w, h, 4, 1023, 32)
        data = bytearray(make_crw(values10=values, width=w, height=h))
        raw_rec = crw._find(crw.records(bytes(data)), crw.REC_RAW, bytes(data))
        data[raw_rec.offset + 520 : raw_rec.offset + 560] = bytes(40)
        try:
            raw = crw.parse_crw(bytes(data))
        except rd.DevelopError:
            return  # refused: an unassigned code, a value out of range or a stream that ends early
        self.assertNotEqual(list(raw.values), values)


class MetadataTest(unittest.TestCase):
    def setUp(self):
        self.w, self.h = 128, 64
        self.values = sensor(self.w, self.h, 5, 1023, 32)

    def test_tags(self):
        raw = crw.parse_crw(make_crw(values10=self.values, width=self.w, height=self.h))
        e = raw.ifd.entries
        self.assertEqual(raw.source, "crw")
        self.assertEqual(e[rd.TAG_ACTIVE_AREA], (4, 16, 64, 128))
        self.assertEqual(e[rd.TAG_CFA_PATTERN], (0, 1, 1, 2))
        for b in e[rd.TAG_BLACK_LEVEL]:
            self.assertAlmostEqual(b, 32, delta=1)
        neutral = e[rd.TAG_AS_SHOT_NEUTRAL]
        self.assertAlmostEqual(1 / neutral[0], 1742 / 832)
        self.assertAlmostEqual(1 / neutral[2], 1241 / 832)
        self.assertEqual(crw.camera_model(make_crw(values10=self.values, width=self.w, height=self.h)), "Canon EOS 10D")
        self.assertNotIn(rd.TAG_ORIENTATION, raw.ifd0.entries)

    def test_odd_corner_restates_pattern(self):
        raw = crw.parse_crw(make_crw(values10=self.values, width=self.w, height=self.h, picture=(17, 5, 127, 63)))
        self.assertEqual(raw.ifd.entries[rd.TAG_CFA_PATTERN], (2, 1, 1, 0))

    def test_preset_balance_by_index(self):
        raw = crw.parse_crw(make_crw(values10=self.values, width=self.w, height=self.h, wbi=3))  # tungsten
        neutral = raw.ifd.entries[rd.TAG_AS_SHOT_NEUTRAL]
        self.assertAlmostEqual(1 / neutral[0], 1382 / 970)
        self.assertIn("tungsten", " ".join(raw.notes))

    def test_no_balance_record(self):
        raw = crw.parse_crw(make_crw(values10=self.values, width=self.w, height=self.h, balance=False))
        self.assertNotIn(rd.TAG_AS_SHOT_NEUTRAL, raw.ifd.entries)
        self.assertIn("no as-shot white balance", " ".join(raw.notes))

    def test_rotation(self):
        raw = crw.parse_crw(make_crw(values10=self.values, width=self.w, height=self.h, rotation=270))
        self.assertEqual(raw.ifd0.one(rd.TAG_ORIENTATION), 8)

    def test_cmyg_refused(self):
        with self.assertRaisesRegex(rd.DevelopError, "cyan-magenta-yellow-green"):
            crw.parse_crw(make_crw(values10=self.values, width=self.w, height=self.h, model="Canon PowerShot G1"))

    def test_not_a_crw(self):
        self.assertFalse(crw.is_crw(b"II*\0" + bytes(40)))
        with self.assertRaises(rd.DevelopError):
            crw.records(b"II*\0" + bytes(40))


class IntegrationTest(unittest.TestCase):
    def test_parse_raw_and_profile_chooser(self):
        w, h = 128, 64
        data = make_crw(values10=sensor(w, h, 6, 1023, 32), width=w, height=h)
        raw = rd.parse_raw(data)
        self.assertEqual(raw.source, "crw")
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "CRW_0001.CRW"
            path.write_bytes(data)
            self.assertEqual(camera_profiles.camera_of(path), "Canon EOS 10D")
            self.assertTrue(raw_preview.is_developable_path(path))
            self.assertTrue(raw_preview.needs_profile_path(path))

    def test_develop_without_profile_asks_for_one(self):
        w, h = 128, 64
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "CRW_0001.CRW"
            path.write_bytes(make_crw(values10=sensor(w, h, 7, 1023, 32), width=w, height=h))
            with self.assertRaisesRegex(rd.DevelopError, "CRW carries no colour matrix"):
                rd.develop_file(path, Path(tmp) / "out.tif")


if __name__ == "__main__":
    unittest.main()
