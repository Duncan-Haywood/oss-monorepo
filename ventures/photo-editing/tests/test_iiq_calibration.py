"""Phase One's per-sensor calibration from the IIQ ``0x110`` block (``shootflow.iiq_calibration``).

Synthetic blocks of each entry type are applied to known sensels, through the C passes and the pure-Python
reference (which must agree bit for bit). Ten real backs against LibRaw's render:
``tools/iiq_calibration_check.py`` and ``eval/phaseone-iiq-calibration-2026-11-19.md``.
"""

from __future__ import annotations

import random
import struct
import sys
import unittest
from array import array
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from shootflow import iiq, iiq_calibration as ic
from test_iiq import make_iiq, smooth_codes


def block(items: list[tuple[int, bytes]]) -> bytes:
    """A calibration block: 'IIII', version, directory offset, the payloads, then the directory."""

    body = bytearray()
    placed = []
    for tag, payload in items:
        placed.append((tag, len(payload), 12 + len(body)))
        body += payload
        body += b"\0" * (-len(body) % 4)
    dir_at = 12 + len(body)
    out = bytearray(b"IIII" + struct.pack("<II", 1, dir_at)) + body
    out += struct.pack("<II", len(placed), 0)
    for tag, length, off in placed:
        out += struct.pack("<3I", tag, length, off)
    return bytes(out)


def flat16(head, values) -> bytes:
    return struct.pack("<8H", *head, 0, 0) + struct.pack(f"<{len(values)}H", *values)


def fields_for(width, height, black=64, top=0, left=0, split_col=0, split_row=0):
    return {"width": width, "height": height, "black": black, "top": top, "left": left,
            "split_col": split_col, "split_row": split_row}


def directory_for(meta: bytes, temperature: float | None = None):
    """A data blob holding the block at byte 8 + 4, and the sensor directory entries pointing at it."""

    data = b"\0" * 12 + meta
    d = {ic.TAG_META: (1, len(meta), 4, 0)}
    if temperature is not None:
        d[ic.TAG_TEMPERATURE] = (1, 4, struct.unpack("<I", struct.pack("<f", temperature))[0], 0)
    return data, d


def random_values(width, height, black=64, seed=3):
    rng = random.Random(seed)
    return array("H", (rng.randint(black - 20, 40000) for _ in range(width * height)))


class CalibrationTests(unittest.TestCase):
    def test_entries_and_plan_order(self):
        meta = block([
            (ic.POLY_RIGHT, struct.pack("<I8f", 0, 0, 0, 0, -0.02, 0, 0, 0, 0)),
            (ic.DEFECTS, struct.pack("<4H", 5, 3, 129, 0) + struct.pack("<4H", 9, 0, 131, 0)),
            (ic.FLAT, flat16((0, 0, 16, 12, 8, 6), [32768] * 6)),
            (ic.FLAT_RB, flat16((0, 0, 16, 12, 8, 6), [32768] * 12)),
            (0x40F, b"\0" * 16),  # undocumented: skipped
        ])
        data, d = directory_for(meta, temperature=20.0)
        self.assertEqual([e[0] for e in ic.entries(data, d)], [ic.POLY_RIGHT, ic.DEFECTS, ic.FLAT, ic.FLAT_RB, 0x40F])
        steps = ic.plan(data, d, fields_for(20, 14, split_col=10))
        self.assertEqual([s[0] for s in steps], ["table", "pixels", "flat", "flat", "columns"])
        self.assertEqual(steps[1][1], [(3, 5)])
        self.assertEqual(steps[-1][1], [9])
        self.assertEqual(steps[0][4:6], (10, 20))  # the right half only

    def test_no_block_no_steps(self):
        self.assertEqual(ic.plan(b"\0" * 64, {}, fields_for(8, 8)), [])
        values = random_values(8, 8)
        before = values.tobytes()
        self.assertEqual(ic.apply(values, b"\0" * 64, {}, fields_for(8, 8)), [])
        self.assertEqual(values.tobytes(), before)

    def test_uniform_flat_field_and_its_bounds(self):
        # A gain of 1.5 everywhere on a grid from column 2, row 1, 16 wide, 12 high, steps of 4 and 3.
        head = (2, 1, 16, 12, 4, 3)
        meta = block([(ic.FLAT, flat16(head, [49152] * (4 * 4)))])
        data, d = directory_for(meta)
        width, height, black = 24, 16, 64
        values = random_values(width, height, black)
        orig = array("H", values)
        ic.apply(values, data, d, fields_for(width, height, black), use_native=False)
        for row in range(height):
            for col in range(width):
                x = orig[row * width + col] - black
                inside = 1 <= row < 1 + 12 - 3 and 2 <= col < 2 + 16 - 4
                want = black + int(x * 1.5) if inside and x > 0 else orig[row * width + col]
                self.assertEqual(values[row * width + col], want, (row, col))

    def test_flat_field_native_matches_python(self):
        if ic.native() is None:
            self.skipTest("no C compiler")
        rng = random.Random(11)
        width, height, black = 61, 47, 256
        for redblue, k in ((False, 1), (True, 2)):
            head = (3, 2, 50, 40, 8, 6)
            wide, high = -(-50 // 8), -(-40 // 6)
            grid = [rng.randint(26000, 40000) for _ in range(wide * high * k)]
            meta = block([(ic.FLAT_RB if redblue else ic.FLAT_2, flat16(head, grid))])
            data, d = directory_for(meta)
            a = random_values(width, height, black, seed=5)
            b = array("H", a)
            f = fields_for(width, height, black, top=1, left=2)
            ic.apply(a, data, d, f, use_native=True)
            ic.apply(b, data, d, f, use_native=False)
            self.assertEqual(a.tobytes(), b.tobytes(), redblue)
            if redblue:  # greens untouched
                orig = random_values(width, height, black, seed=5)
                for row in range(height):
                    for col in range(width):
                        if ((row - 1) & 1) != ((col - 2) & 1):
                            self.assertEqual(a[row * width + col], orig[row * width + col])

    def test_float_flat_field_interpolates_between_grid_points(self):
        # Gains 1.0 then 2.0 across one cell of 4 columns: columns 0-3 get 1.0, 1.25, 1.5, 1.75; columns 4-7
        # lie past the grid's last whole step and are left.
        head = (0, 0, 8, 4, 4, 2)
        grid = [1.0, 2.0] * 2
        meta = block([(ic.FLAT_FLOAT, struct.pack("<8H", *head, 0, 0) + struct.pack("<4f", *grid))])
        data, d = directory_for(meta)
        values = array("H", [64 + 1000] * (8 * 4))
        ic.apply(values, data, d, fields_for(8, 4, 64), use_native=False)
        self.assertEqual(list(values[0:4]), [1064, 1314, 1564, 1814])
        self.assertEqual(list(values[4:8]), [1064, 1064, 1064, 1064])
        native = array("H", [64 + 1000] * (8 * 4))
        if ic.native() is not None:
            ic.apply(native, data, d, fields_for(8, 4, 64), use_native=True)
            self.assertEqual(native.tobytes(), values.tobytes())

    def test_right_half_polynomial_with_temperature(self):
        # p3 = -0.05, shifted by (t - p7) * p6 + 1 = (30 - 20) * 0.001 + 1: gain 0.96 on the right half.
        p = (0.0, 0.0, 0.0, -0.05, 0.0, 0.0, 0.001, 20.0)
        meta = block([(ic.POLY_RIGHT, struct.pack("<I8f", 0, *p))])
        data, d = directory_for(meta, temperature=30.0)
        values = array("H", [64 + 10000] * (8 * 2))
        ic.apply(values, data, d, fields_for(8, 2, 64, split_col=4))
        self.assertEqual(values[0], 10064)
        self.assertIn(values[5], (64 + 9599, 64 + 9600))

    def test_whole_frame_polynomial(self):
        meta = block([(ic.POLY_ALL, struct.pack("<4f", 0.0, 0.01, 0.0, 0.0))])
        data, d = directory_for(meta)
        values = array("H", [64, 64 + 1000, 40])
        ic.apply(values, data, d, fields_for(3, 1, 64))
        self.assertEqual(list(values), [64, 64 + 1010, 40])  # at or below black: left as it is

    def test_quadrant_gains(self):
        words = [0] * 21
        words[14] = struct.unpack("<I", struct.pack("<f", 0.1))[0]  # bottom-left 1.1
        meta = block([(ic.QUAD_GAIN, struct.pack("<21I", *words))])
        data, d = directory_for(meta)
        values = array("H", [64 + 1000] * 16)
        ic.apply(values, data, d, fields_for(4, 4, 64, split_col=2, split_row=2))
        grid = [[values[r * 4 + c] for c in range(4)] for r in range(4)]
        self.assertEqual(grid[0], [1064] * 4)
        self.assertEqual(grid[3][:2], [64 + 1100] * 2)
        self.assertEqual(grid[3][2:], [1064] * 2)

    def test_spline_through_its_points(self):
        identity = ic.spline_table([0, 20000, 40000, 65535], [0, 20000, 40000, 65535])
        self.assertTrue(all(abs(identity[i] - i) <= 1 for i in range(0, 65536, 97)))
        bent = ic.spline_table([0, 10000, 30000, 65535], [0, 11000, 31500, 65535])
        self.assertEqual(bent[10000], 11000)
        self.assertEqual(bent[30000], 31500)
        self.assertTrue(all(bent[i] <= bent[i + 1] for i in range(65535)))

    def test_combined_quadrant_curve(self):
        ref = [3000, 6000, 12000, 20000, 28000, 36000, 43000]
        flat = [10000] * 7
        lift = [10100] * 7  # 1% up in the top-right quadrant
        words = ref + flat + lift + flat + flat + [1]
        meta = block([(ic.QUAD_COMBINED, struct.pack("<36I", *words))])
        data, d = directory_for(meta)
        steps = ic.plan(data, d, fields_for(4, 4, 0, split_col=2, split_row=2))
        self.assertEqual(len(steps), 1)
        self.assertEqual(steps[0][2:6], (0, 2, 2, 4))
        self.assertEqual(steps[0][1][12000], 12120)

    def test_defective_sensel_and_column(self):
        width, height, black = 12, 10, 64
        values = array("H", [black + 1000] * (width * height))
        for row in range(height):
            for col in range(width):
                values[row * width + col] += 10 * col
        values[4 * width + 6] = 60000  # a hot sensel (red: row 4 and column 6 both even from the origin)
        for row in range(height):
            values[row * width + 5] = black  # a dead column
        meta = block([(ic.DEFECTS, struct.pack("<4H", 6, 4, 129, 0) + struct.pack("<4H", 5, 0, 131, 0))])
        data, d = directory_for(meta)
        ic.apply(values, data, d, fields_for(width, height, black))
        self.assertEqual(values[4 * width + 6], black + 1060)  # the mean of a smooth ramp
        for row in range(2, height - 2):
            self.assertEqual(values[row * width + 5], black + 1050, row)

    def test_parse_iiq_applies_it_by_default(self):
        codes = smooth_codes(40, 12, seed=4, top=8000)
        head = (0, 0, 40, 12, 8, 4)
        meta = block([(ic.FLAT, flat16(head, [36045] * (5 * 3)))])  # a gain of 1.1
        data = make_iiq(codes, extra_blobs={ic.TAG_META: meta})
        on = iiq.parse_iiq(data)
        off = iiq.parse_iiq(data, calibrate=False)
        self.assertTrue(any("sensor calibration applied" in n for n in on.notes))
        self.assertFalse(any("calibration" in n for n in off.notes))
        self.assertNotEqual(on.values.tobytes(), off.values.tobytes())
        x = off.values[3 * 40 + 5] - 1024
        if x > 0:
            self.assertEqual(on.values[3 * 40 + 5] - 1024, int(x * (36045 / 32768)))


if __name__ == "__main__":
    unittest.main()
