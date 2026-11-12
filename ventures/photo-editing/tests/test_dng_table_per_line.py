"""Tests for ``MapTable`` and the per-row and per-column fixes in ``shootflow.dng_opcodes`` and ``develop``.

All five have closed-form answers, written out here independently of the
module: ``MapTable`` sends a 16-bit value ``v`` to ``table[min(v, n - 1)]``
(on 0..1 floats, ``v = floor(x * 65535 + 0.5)`` and the result is over
65535); ``DeltaPerRow``/``DeltaPerColumn`` add one offset per row (column)
of the area in pitch steps; ``ScalePerRow``/``ScalePerColumn`` multiply by
one. Every result is pinned to 0..1. On a raw file whose sensor was
damaged by the inverse (rows darkened, a fixed offset per column, values
squared), the develop must give the undamaged scene back.

No camera file carrying any of the five is in the evaluation set yet.
"""

from __future__ import annotations

import math
import random
import struct
import unittest
from array import array

from shootflow import dng_opcodes as do
from shootflow import raw_develop as rd
from test_dng_opcodes import HAVE_NUMPY, list_tag
from test_raw_develop import make_dng, patch_sensor

W, H, BLACK, WHITE = 48, 16, 256, 4095
BIG = 1 << 20


def area(top=0, left=0, bottom=BIG, right=BIG, plane=0, planes=1, row_pitch=1, col_pitch=1):
    return struct.pack(">8I", top, left, bottom, right, plane, planes, row_pitch, col_pitch)


def table_params(table, **kw):
    return area(**kw) + struct.pack(f">I{len(table)}H", len(table), *table)


def per_line_params(values, **kw):
    return area(**kw) + struct.pack(f">I{len(values)}f", len(values), *values)


def f32(v):
    return struct.unpack(">f", struct.pack(">f", v))[0]


def spec_table(table, x):
    """The specification's MapTable on a 0..1 value, as the SDK sees 16-bit data."""

    v = math.floor(min(max(x, 0.0), 1.0) * 65535 + 0.5)
    return table[min(v, len(table) - 1)] / 65535


def pin(v):
    return min(1.0, max(0.0, v))


def develop(blob, **settings):
    return rd.develop(rd.parse_raw(blob), rd.DevelopSettings(**settings))


def damaged(sensor, fn):
    """Each sensel's 0..1 value above black passed through ``fn(v, x, y)``, rounded back to a raw value."""

    out = []
    for i, s in enumerate(sensor):
        y, x = divmod(i, W)
        v = (s - BLACK) / (WHITE - BLACK)
        out.append(int(round(BLACK + pin(fn(v, x, y)) * (WHITE - BLACK))))
    return out


class ParseTests(unittest.TestCase):
    def test_round_trip(self):
        ops = do.parse_list(
            list_tag(
                [
                    (7, 1, table_params([0, 100, 65535], plane=1, planes=2)),
                    (10, 1, per_line_params([0.5, -0.25], bottom=4, row_pitch=2)),
                    (11, 1, per_line_params([0.125] * 3, left=1, right=7, col_pitch=2)),
                    (12, 1, per_line_params([2.0], bottom=1)),
                    (13, 1, per_line_params([1.5, 0.5], right=2)),
                ]
            )[2]
        )
        self.assertEqual([op.name for op in ops], ["MapTable", "DeltaPerRow", "DeltaPerColumn", "ScalePerRow", "ScalePerColumn"])
        mt = do.parse_map_table(ops[0])
        self.assertEqual((mt.table, mt.plane, mt.planes), ((0, 100, 65535), 1, 2))
        lines = [do.parse_per_line(op) for op in ops[1:]]
        self.assertEqual([pl.name for pl in lines], ["DeltaPerRow", "DeltaPerColumn", "ScalePerRow", "ScalePerColumn"])
        self.assertEqual(lines[0].values, (0.5, -0.25))
        self.assertEqual((lines[1].left, lines[1].col_pitch, lines[1].values), (1, 2, (0.125,) * 3))

    def test_bad_parameters_raise(self):
        bad = [
            (do.parse_map_table, do.Opcode(7, 0, 0, table_params([]))),  # zero entries
            (do.parse_map_table, do.Opcode(7, 0, 0, table_params([1, 2, 3])[:-2])),  # short
            (do.parse_map_table, do.Opcode(7, 0, 0, table_params([1], row_pitch=0))),
            (do.parse_per_line, do.Opcode(10, 0, 0, per_line_params([0.1] * 3, bottom=4))),  # 3 for 4 rows
            (do.parse_per_line, do.Opcode(11, 0, 0, per_line_params([0.1] * 4, right=7, col_pitch=2))),  # 4 for ceil(7/2)=4: fine
            (do.parse_per_line, do.Opcode(12, 0, 0, per_line_params([0.1] * 2, bottom=2)[:-1])),  # short
            (do.parse_per_line, do.Opcode(13, 0, 0, per_line_params([float("inf")], right=1))),
            (do.parse_per_line, do.Opcode(12, 0, 0, per_line_params([1.0], bottom=1, left=3, right=3))),  # empty
        ]
        for i, (parser, op) in enumerate(bad):
            with self.subTest(i=i):
                if i == 4:
                    self.assertEqual(len(parser(op).values), 4)
                    continue
                with self.assertRaises(do.OpcodeError):
                    parser(op)

    def test_plan_runs_them_in_lists_2_and_3_and_names_them_in_1(self):
        tags = [
            list_tag([(12, 1, per_line_params([1.0], bottom=1)), (7, 1, table_params([0, 65535]))]),
            list_tag([(11, 0, per_line_params([0.0], right=1)), (3, 0, struct.pack(">7d", 0, 0, 0, 0, 0, 0.5, 0.5))], do.TAG_OPCODE_LIST_3),
            list_tag([(7, 0, table_params([0, 65535])), (10, 1, per_line_params([0.0], bottom=1))], do.TAG_OPCODE_LIST_1),
        ]
        plan = do.plan({t: v for t, _ty, v in tags}, {})
        self.assertEqual([type(op).__name__ for op in plan.stage2], ["PerLine", "MapTable"])
        self.assertEqual([type(op).__name__ for op in plan.stage3], ["PerLine", "VignetteRadial"])
        self.assertIn("OpcodeList2: 1 ScalePerRow applied (row gains)", plan.notes)
        self.assertIn("OpcodeList2: 1 MapTable applied (value mapping)", plan.notes)
        self.assertIn("OpcodeList3: 1 DeltaPerColumn applied (column offsets)", plan.notes)
        self.assertIn("OpcodeList1: 1 x MapTable (required) not applied", plan.notes)
        self.assertIn("OpcodeList1: 1 x DeltaPerRow not applied", plan.notes)

    def test_a_wrong_count_is_named_and_skipped(self):
        tag = list_tag([(10, 0, per_line_params([0.1] * 2, bottom=8))])
        plan = do.plan({tag[0]: tag[2]}, {})
        self.assertEqual(plan.stage2, [])
        self.assertTrue(any("DeltaPerRow unreadable and skipped: DeltaPerRow with 2 entries for 8 rows" in n for n in plan.notes), plan.notes)


class FormulaTests(unittest.TestCase):
    def test_table_is_the_spec_lookup(self):
        rng = random.Random(3)
        for n in (1, 2, 17, 4096, 65536):
            table = tuple(rng.randrange(65536) for _ in range(n))
            op = do.MapTable(0, 0, BIG, BIG, 0, 1, 1, 1, table)
            xs = [0.0, 1.0, 0.5 / 65535, 1.5 / 65535, 1e-9] + [rng.random() for _ in range(200)]
            row = list(xs)
            do.apply_row([op], 0, row, 1, len(row), 1)
            for x, got in zip(xs, row):
                self.assertEqual(got, spec_table(table, x), (n, x))

    def test_identity_table_rounds_to_16_bits(self):
        op = do.MapTable(0, 0, BIG, BIG, 0, 1, 1, 1, tuple(range(65536)))
        row = [0.123456789, 0.5, 1.0]
        do.apply_row([op], 0, row, 1, 3, 1)
        self.assertEqual(row, [round(0.123456789 * 65535) / 65535, 32768 / 65535, 1.0])

    def test_per_row_and_column_area_plane_and_pitch(self):
        # Rows 1, 4 of area rows 1..5 (pitch 3) on plane 1 of 2: entry 0 for row 1, entry 1 for row 4.
        w, h, spp = 7, 6, 2
        cases = [
            (do.PerLine(1, 2, 6, 7, 1, 1, 3, 2, "delta", "row", (0.25, -0.0625)), lambda v, x, y: v + (0.25 if y == 1 else -0.0625)),
            (do.PerLine(1, 2, 6, 7, 1, 1, 3, 2, "scale", "row", (2.0, 0.5)), lambda v, x, y: v * (2.0 if y == 1 else 0.5)),
            (do.PerLine(1, 2, 6, 7, 1, 1, 3, 2, "delta", "column", (0.5, 0.125, -1.0)), lambda v, x, y: v + (0.5, 0.125, -1.0)[(x - 2) // 2]),
            (do.PerLine(1, 2, 6, 7, 1, 1, 3, 2, "scale", "column", (3.0, 1.25, 0.0)), lambda v, x, y: v * (3.0, 1.25, 0.0)[(x - 2) // 2]),
        ]
        for op, fn in cases:
            with self.subTest(op=op.name):
                for y in range(h):
                    row = [0.375] * (w * spp)
                    do.apply_row([op], y, row, h, w, spp)
                    for x in range(w):
                        for p in range(spp):
                            hit = p == 1 and y in (1, 4) and x in (2, 4, 6)
                            want = pin(fn(0.375, x, y)) if hit else 0.375
                            self.assertEqual(row[x * spp + p], want, (x, y, p))

    def test_results_pin_to_zero_and_one(self):
        row = [0.9, 0.1]
        do.apply_row([do.PerLine(0, 0, 1, 2, 0, 1, 1, 1, "delta", "column", (0.5, -0.5))], 0, row, 1, 2, 1)
        self.assertEqual(row, [1.0, 0.0])
        row = [0.9, 0.1]
        do.apply_row([do.PerLine(0, 0, 1, 2, 0, 1, 1, 1, "scale", "column", (2.0, -1.0))], 0, row, 1, 2, 1)
        self.assertEqual(row, [1.0, 0.0])

    def test_stage3_takes_off_and_puts_back_white_balance(self):
        rng = random.Random(11)
        w, h = 13, 9
        scale = (2.2, 1.0, 1.5)
        src = array("d", (rng.random() * scale[i % 3] for i in range(w * h * 3)))
        table = tuple(int(65535 * (i / 255) ** 0.5) for i in range(256))
        deltas = tuple(f32(rng.uniform(-0.05, 0.05)) for _ in range(w))
        gains = tuple(f32(rng.uniform(0.8, 1.2)) for _ in range(h))
        ops = [
            do.PerLine(0, 0, h, w, 0, 3, 1, 1, "delta", "column", deltas),
            do.MapTable(0, 0, h, w, 0, 3, 1, 1, table),
            do.PerLine(0, 0, h, w, 0, 3, 1, 1, "scale", "row", gains),
        ]
        got = do.run_stage3_rgb(ops, array("d", src), w, h, scale)
        for y in range(h):
            for x in range(w):
                for p in range(3):
                    v = pin(src[(y * w + x) * 3 + p] / scale[p] + deltas[x])
                    v = spec_table(table, v)
                    v = pin(v * gains[y])
                    self.assertAlmostEqual(got[(y * w + x) * 3 + p], v * scale[p], places=12)


class DevelopTests(unittest.TestCase):
    def scene(self):
        return patch_sensor(W, H, black=BLACK, white=WHITE)

    def check(self, dark, ops, note, tol=3 * 257):
        sensor = self.scene()
        tag = list_tag(ops)
        want = develop(make_dng(sensor, W, H), engine="python")
        got = develop(make_dng(dark, W, H, extra_raw_tags=[tag]), engine="python")
        off = develop(make_dng(dark, W, H, extra_raw_tags=[tag]), engine="python", opcodes=False)
        self.assertIn(note, got[3].notes)
        self.assertLessEqual(max(abs(a - b) for a, b in zip(got[2], want[2])), tol)
        self.assertGreater(max(abs(a - b) for a, b in zip(off[2], want[2])), 10 * 257)

    def test_scale_per_row_restores_darkened_rows(self):
        gains = [f32(1.0 + 0.04 * y) for y in range(H)]
        dark = damaged(self.scene(), lambda v, x, y: v / gains[y])
        self.check(dark, [(12, 1, per_line_params(gains, bottom=H))], "OpcodeList2: 1 ScalePerRow applied (row gains)")

    def test_delta_per_column_removes_column_banding(self):
        rng = random.Random(2)
        offs = [f32(rng.choice((-1, 1)) * rng.uniform(0.01, 0.025)) for _ in range(W)]
        # Banding added on top of the scene; the opcode subtracts it.
        dark = damaged(self.scene(), lambda v, x, y: v + offs[x])
        neg = [-o for o in offs]
        # Sensels the banding pinned at 0 or 1 cannot come back; the darkest sensel here is 0.029 above black.
        self.check(dark, [(11, 1, per_line_params(neg, right=W))], "OpcodeList2: 1 DeltaPerColumn applied (column offsets)")

    def test_map_table_undoes_a_square_law(self):
        # Stored values squared (a sensor's non-linear response); the table holds the square root.
        dark = damaged(self.scene(), lambda v, x, y: v * v)
        table = [round(65535 * math.sqrt(i / 65535)) for i in range(65536)]
        # The square root is steep near black: a rounding step of the stored square at value v moves
        # the root by about 1 / (2 v 3839), most on the darkest patches.
        self.check(dark, [(7, 1, table_params(table))], "OpcodeList2: 1 MapTable applied (value mapping)", tol=8 * 257)

    def test_short_table_takes_its_last_entry(self):
        sensor = self.scene()
        tag = list_tag([(7, 1, table_params([0, 65535 // 2]))])  # value 0 -> 0, everything else -> half
        got = develop(make_dng(sensor, W, H, extra_raw_tags=[tag]), engine="python")
        flat = develop(make_dng(damaged(sensor, lambda v, x, y: 0.5 if v > 0 else 0.0), W, H), engine="python")
        self.assertLessEqual(max(abs(a - b) for a, b in zip(got[2], flat[2])), 257)


@unittest.skipUnless(HAVE_NUMPY, "numpy not installed")
class EngineTests(unittest.TestCase):
    def test_numpy_gives_the_pure_bytes(self):
        rng = random.Random(23)
        for w, h in ((48, 12), (37, 11)):
            list2 = list_tag(
                [
                    (11, 1, per_line_params([f32(rng.uniform(-0.03, 0.03)) for _ in range((w - 1 + 1) // 2)], left=1, right=w, col_pitch=2)),
                    (7, 1, table_params([min(65535, int(70000 * (i / 1023) ** 0.8)) for i in range(1024)], row_pitch=2)),
                    (12, 1, per_line_params([f32(rng.uniform(0.9, 1.1)) for _ in range(h)], bottom=h)),
                ]
            )
            list3 = list_tag(
                [
                    (13, 1, per_line_params([f32(rng.uniform(0.9, 1.2)) for _ in range(w)], right=w, planes=3)),
                    (10, 1, per_line_params([f32(rng.uniform(-0.02, 0.02)) for _ in range((h + 2) // 3)], bottom=h, row_pitch=3, plane=1, planes=2)),
                    (7, 1, table_params([int(65535 * (i / 255) ** 1.1) for i in range(256)], planes=3)),
                ],
                do.TAG_OPCODE_LIST_3,
            )
            sensor = [max(0, min(4095, v + rng.randint(-400, 400))) for v in patch_sensor(w, h, gain=1.3)]
            raw = rd.parse_raw(make_dng(sensor, w, h, extra_raw_tags=[list2, list3]))
            for half in (False, True):
                with self.subTest(size=(w, h), half=half):
                    py = rd.develop(raw, rd.DevelopSettings(engine="python", half=half))
                    npy = rd.develop(raw, rd.DevelopSettings(engine="numpy", half=half))
                    self.assertIn("OpcodeList3: 1 ScalePerColumn applied (column gains)", py[3].notes)
                    self.assertEqual(py[3].notes, npy[3].notes)
                    self.assertEqual(py[2].tobytes(), npy[2].tobytes())

    def test_run_stage3_planes_matches_rgb(self):
        import numpy as np

        rng = random.Random(8)
        w, h = 23, 13
        scale = (1.9, 1.0, 1.4)
        src = array("d", (rng.random() * 2 for _ in range(w * h * 3)))
        ops = [
            do.PerLine(1, 2, 12, 20, 0, 2, 2, 3, "scale", "row", tuple(f32(rng.uniform(0.5, 1.5)) for _ in range(6))),
            do.MapTable(0, 0, h, w, 0, 3, 1, 1, tuple(rng.randrange(65536) for _ in range(300))),
            do.PerLine(0, 1, h, w, 1, 2, 1, 2, "delta", "column", tuple(f32(rng.uniform(-0.1, 0.1)) for _ in range(11))),
        ]
        pure = do.run_stage3_rgb(ops, array("d", src), w, h, scale)
        npy = do.run_stage3_planes(ops, np.frombuffer(src.tobytes(), dtype=np.float64).reshape(h, w, 3).copy(), scale)
        self.assertEqual(npy.tobytes(), pure.tobytes())

    def test_apply_plane_matches_apply_row(self):
        import numpy as np

        rng = random.Random(5)
        w, h, spp = 19, 10, 1
        ops = [
            do.PerLine(0, 0, h, w, 0, 1, 1, 1, "delta", "row", tuple(f32(rng.uniform(-0.2, 0.2)) for _ in range(h))),
            do.MapTable(1, 0, h, w, 0, 1, 2, 1, tuple(rng.randrange(65536) for _ in range(5000))),
            do.PerLine(0, 3, h, w, 0, 1, 1, 4, "scale", "column", tuple(f32(rng.uniform(0.0, 3.0)) for _ in range(4))),
        ]
        plane = np.array([[rng.random() for _ in range(w * spp)] for _ in range(h)], dtype=np.float64)
        rows = [list(r) for r in plane]
        do.apply_plane(ops, plane, h, w, spp)
        for y, row in enumerate(rows):
            do.apply_row(ops, y, row, h, w, spp)
        self.assertEqual(plane.tobytes(), np.array(rows, dtype=np.float64).tobytes())


if __name__ == "__main__":
    unittest.main()
