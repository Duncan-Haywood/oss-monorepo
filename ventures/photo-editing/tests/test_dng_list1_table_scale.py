"""Tests for ``MapTable``, ``ScalePerRow`` and ``ScalePerColumn`` in ``OpcodeList1`` (stored raw values).

The DNG 1.7.1.0 text (chapter 6) clips ``OpcodeList1`` values to the integer
range ``0 .. 2^16 - 1`` (``2^32 - 1`` above 16 bits). On that reading the two
answers below need no unit and are written out here independently of the module:

* MapTable: stored value ``v`` becomes ``table[min(v, n - 1)]``;
* ScalePerRow/Column: ``v`` becomes ``floor(v * scale + 0.5)``, clipped to the range.

Delta and MapPolynomial would need a unit the text does not give, so they stay
named in ``OpcodeList1``. On a raw file whose stored values were bent by a
known curve, or whose rows and columns were darkened by known readout gains
(black level included, as a readout gain would), the develop must give the
clean develop back. No camera file carrying these in ``OpcodeList1`` is in the
evaluation set yet.
"""

from __future__ import annotations

import math
import random
import struct
import sys
import unittest
from array import array
from contextlib import contextmanager

from shootflow import dng_opcodes as do
from shootflow import raw_develop as rd
from test_dng_opcodes import HAVE_NUMPY, list_tag
from test_dng_table_per_line import BIG, f32, per_line_params, table_params
from test_raw_develop import make_dng, patch_sensor

L1 = do.TAG_OPCODE_LIST_1


@contextmanager
def no_numpy():
    saved = sys.modules.get("numpy")
    sys.modules["numpy"] = None  # ``import numpy`` now raises ImportError
    try:
        yield
    finally:
        if saved is None:
            del sys.modules["numpy"]
        else:
            sys.modules["numpy"] = saved


def engines():
    yield "pure", no_numpy
    if HAVE_NUMPY:
        yield "numpy", contextmanager(lambda: (yield))


def run(ops, vals, w, h):
    notes: list[str] = []
    out = do.run_stage1(ops, vals, w, h, notes)
    return out, notes


def in_area(y, x, top=0, left=0, bottom=BIG, right=BIG, rp=1, cp=1):
    return top <= y < bottom and left <= x < right and (y - top) % rp == 0 and (x - left) % cp == 0


class PlanTests(unittest.TestCase):
    def test_table_and_scales_run_in_list1_delta_and_poly_stay_named(self):
        tag = list_tag(
            [
                (7, 0, table_params([0, 65535])),
                (12, 1, per_line_params([1.0], bottom=1)),
                (13, 0, per_line_params([1.0, 2.0], right=2)),
                (10, 1, per_line_params([0.0], bottom=1)),
                (11, 0, per_line_params([0.0], right=1)),
                (8, 1, struct.pack(">9I", 0, 0, BIG, BIG, 0, 1, 1, 1, 0) + struct.pack(">d", 0.0)),
            ],
            L1,
        )
        plan = do.plan({tag[0]: tag[2]}, {})
        self.assertEqual([getattr(op, "name", type(op).__name__) for op in plan.stage1], ["MapTable", "ScalePerRow", "ScalePerColumn"])
        self.assertEqual(plan.stage2, [])
        self.assertIn("OpcodeList1: 1 x DeltaPerRow not applied", plan.notes)
        self.assertIn("OpcodeList1: 1 x DeltaPerColumn (required) not applied", plan.notes)
        self.assertIn("OpcodeList1: 1 x MapPolynomial not applied", plan.notes)
        self.assertFalse(any("MapTable" in n or "Scale" in n for n in plan.notes), plan.notes)
        linear = do.plan({tag[0]: tag[2]}, {}, cfa=False)
        self.assertEqual(linear.stage1, [])
        self.assertIn("OpcodeList1: 1 x MapTable (required) not applied", linear.notes)

    def test_an_unreadable_one_is_named(self):
        tag = list_tag([(12, 0, per_line_params([1.0] * 2, bottom=8))], L1)
        plan = do.plan({tag[0]: tag[2]}, {})
        self.assertEqual(plan.stage1, [])
        self.assertTrue(any("OpcodeList1 ScalePerRow unreadable and skipped" in n for n in plan.notes), plan.notes)


class StoredValueTests(unittest.TestCase):
    W, H = 23, 13

    def values(self, seed, top=65535, typecode="H"):
        rng = random.Random(seed)
        return array(typecode, (rng.randrange(top + 1) for _ in range(self.W * self.H)))

    def test_map_table_is_the_stored_value_lookup(self):
        rng = random.Random(7)
        for n in (1, 2, 300, 4096, 65536):
            table = [rng.randrange(65536) for _ in range(n)]
            for kw in ({}, {"top": 2, "left": 3, "bottom": 11, "right": 20, "row_pitch": 2, "col_pitch": 3}):
                op = do.parse_map_table(do.Opcode(7, 0, 0, table_params(table, **kw)))
                vals = self.values(n)
                area = dict(top=kw.get("top", 0), left=kw.get("left", 0), bottom=kw.get("bottom", BIG),
                            right=kw.get("right", BIG), rp=kw.get("row_pitch", 1), cp=kw.get("col_pitch", 1))
                want = [
                    table[min(v, n - 1)] if in_area(*divmod(i, self.W), **area) else v
                    for i, v in enumerate(vals)
                ]
                for name, ctx in engines():
                    with self.subTest(n=n, area=bool(kw), engine=name), ctx():
                        out, notes = run([op], vals, self.W, self.H)
                        self.assertEqual(list(out), want)
                        self.assertEqual(out.typecode, "H")
                        changed = sum(a != b for a, b in zip(vals, want))
                        self.assertEqual(notes, [f"OpcodeList1: MapTable applied ({changed} stored values changed)"])
                self.assertEqual(vals, self.values(n), "the input is left alone")

    def test_scales_round_half_up_and_clip(self):
        rng = random.Random(11)
        for axis, oid in (("row", 12), ("column", 13)):
            for kw in ({}, {"top": 1, "left": 2, "bottom": 12, "right": 21, "row_pitch": 3, "col_pitch": 2}):
                top, left = kw.get("top", 0), kw.get("left", 0)
                bottom, right = kw.get("bottom", self.H), kw.get("right", self.W)
                rp, cp = kw.get("row_pitch", 1), kw.get("col_pitch", 1)
                count = -(-(bottom - top) // rp) if axis == "row" else -(-(right - left) // cp)
                gains = [rng.choice([0.0, 0.5, 1.0, 1.5, 3.0, rng.uniform(0.2, 2.5)]) for _ in range(count)]
                full = {"top": top, "left": left, "bottom": bottom, "right": right, "row_pitch": rp, "col_pitch": cp}
                op = do.parse_per_line(do.Opcode(oid, 0, 0, per_line_params(gains, **full)))
                vals = self.values(oid)
                want = []
                for i, v in enumerate(vals):
                    y, x = divmod(i, self.W)
                    if not in_area(y, x, top, left, bottom, right, rp, cp):
                        want.append(v)
                        continue
                    g = f32(gains[(y - top) // rp] if axis == "row" else gains[(x - left) // cp])
                    want.append(min(65535, max(0, math.floor(v * g + 0.5))))
                for name, ctx in engines():
                    with self.subTest(axis=axis, area=bool(kw), engine=name), ctx():
                        out, notes = run([op], vals, self.W, self.H)
                        self.assertEqual(list(out), want)
                        self.assertTrue(notes[0].startswith(f"OpcodeList1: {op.name} applied ("), notes)

    def test_exact_half_rounds_up(self):
        op = do.parse_per_line(do.Opcode(12, 0, 0, per_line_params([0.5], bottom=1)))
        for name, ctx in engines():
            with self.subTest(engine=name), ctx():
                out, _ = run([op], array("H", [3, 5, 65535, 1]), 4, 1)
                self.assertEqual(list(out), [2, 3, 32768, 1])

    def test_list_order_composes(self):
        table = [min(65535, 2 * v) for v in range(65536)]
        ops = [
            do.parse_map_table(do.Opcode(7, 0, 0, table_params(table))),
            do.parse_per_line(do.Opcode(13, 0, 0, per_line_params([0.25] * self.W, right=self.W))),
        ]
        vals = self.values(3, top=40000)
        for name, ctx in engines():
            with self.subTest(engine=name), ctx():
                out, notes = run(ops, vals, self.W, self.H)
                self.assertEqual(list(out), [math.floor(min(65535, 2 * v) * 0.25 + 0.5) for v in vals])
                self.assertEqual(len(notes), 2)
                out2, _ = run(ops[::-1], vals, self.W, self.H)
                self.assertNotEqual(list(out2), list(out))

    def test_32_bit_stored_values(self):
        vals = array("I", [0, 1, 70000, 0xFFFFFFFF, 0x80000000, 5])
        mt = do.parse_map_table(do.Opcode(7, 0, 0, table_params([9, 9])))
        sc = do.parse_per_line(do.Opcode(12, 0, 0, per_line_params([1.5, 2.0], bottom=2)))
        for name, ctx in engines():
            with self.subTest(engine=name), ctx():
                out, notes = run([mt, sc], vals, 3, 2)
                self.assertEqual(out.typecode, "I")
                self.assertEqual(list(out), [0, 2, 105000, 0xFFFFFFFF, 0xFFFFFFFF, 10])
                self.assertIn("OpcodeList1: MapTable not applied (a 16-bit table on 32-bit stored values has no stated index)", notes)

    def test_a_plane_range_missing_plane_0_is_not_run(self):
        op = do.parse_map_table(do.Opcode(7, 0, 0, table_params([0], plane=1, planes=2)))
        vals = self.values(5)
        for name, ctx in engines():
            with self.subTest(engine=name), ctx():
                out, notes = run([op], vals, self.W, self.H)
                self.assertEqual(out, vals)
                self.assertEqual(notes, ["OpcodeList1: MapTable names planes 1..2 of a one-plane CFA image; not run"])

    def test_an_area_outside_the_frame_changes_nothing(self):
        op = do.parse_map_table(do.Opcode(7, 0, 0, table_params([0], top=self.H, bottom=self.H + 4)))
        vals = self.values(6)
        out, notes = run([op], vals, self.W, self.H)
        self.assertEqual(out, vals)
        self.assertEqual(notes, ["OpcodeList1: MapTable applied (0 stored values changed)"])


def develop(blob, **settings):
    return rd.develop(rd.parse_raw(blob), rd.DevelopSettings(**settings))


class DevelopTests(unittest.TestCase):
    W, H = 48, 16

    def test_a_curve_on_the_stored_values_is_undone_by_a_table(self):
        # The sensor stored sqrt-companded values (16-bit range); the table expands them back.
        sensor = patch_sensor(self.W, self.H)
        stored = [int(math.floor(math.sqrt(v / 4095) * 65535 + 0.5)) for v in sensor]
        table = [int(math.floor((c / 65535) ** 2 * 4095 + 0.5)) for c in range(65536)]
        want = develop(make_dng(sensor, self.W, self.H), engine="python")
        tag = list_tag([(7, 0, table_params(table))], L1)
        got = develop(make_dng(stored, self.W, self.H, extra_raw_tags=[tag]), engine="python")
        self.assertEqual(list(got[2]), list(want[2]))  # sqrt then square on 16 bits gives every 12-bit value back
        self.assertTrue(any(n.startswith("OpcodeList1: MapTable applied (") for n in got[3].notes), got[3].notes)
        off = develop(make_dng(stored, self.W, self.H, extra_raw_tags=[tag]), engine="python", opcodes=False)
        self.assertGreater(max(abs(a - b) for a, b in zip(off[2], want[2])), 100 * 257)

    def test_readout_gains_are_undone_by_row_and_column_scales(self):
        sensor = patch_sensor(self.W, self.H)
        rows = [1.0 - 0.03 * (y % 5) for y in range(self.H)]
        cols = [1.0 + 0.02 * ((x * 7) % 3) for x in range(self.W)]
        # Darkened at readout (black included); stored 16 bits wide so rounding stays below a 12-bit step.
        stored = [int(round(16 * s * rows[i // self.W] / cols[i % self.W])) for i, s in enumerate(sensor)]
        want = develop(make_dng(sensor, self.W, self.H), engine="python")
        tag = list_tag(
            [
                (12, 0, per_line_params([1 / (16 * r) for r in rows], bottom=self.H)),
                (13, 0, per_line_params(cols, right=self.W)),
            ],
            L1,
        )
        blob = make_dng(stored, self.W, self.H, extra_raw_tags=[tag])
        got = develop(blob, engine="python")
        self.assertLessEqual(max(abs(a - b) for a, b in zip(got[2], want[2])), 3 * 257)
        off = develop(blob, engine="python", opcodes=False)
        self.assertGreater(max(abs(a - b) for a, b in zip(off[2], want[2])), 20 * 257)
        self.assertIn("OpcodeList1: ScalePerRow applied", " ".join(got[3].notes))
        self.assertIn("OpcodeList1: ScalePerColumn applied", " ".join(got[3].notes))

    @unittest.skipUnless(HAVE_NUMPY, "numpy not installed")
    def test_numpy_gives_the_pure_bytes(self):
        sensor = patch_sensor(self.W, self.H)
        rng = random.Random(2)
        table = sorted(rng.randrange(4096) for _ in range(4096))
        tag = list_tag(
            [
                (7, 0, table_params(table, left=4, right=40, col_pitch=2)),
                (12, 0, per_line_params([rng.uniform(0.8, 1.2) for _ in range(8)], top=1, bottom=16, row_pitch=2)),
            ],
            L1,
        )
        blob = make_dng(sensor, self.W, self.H, extra_raw_tags=[tag])
        for half in (False, True):
            with self.subTest(half=half):
                a = develop(blob, engine="python", half=half)
                b = develop(blob, engine="numpy", half=half)
                self.assertEqual(list(a[2]), list(b[2]))


if __name__ == "__main__":
    unittest.main()
