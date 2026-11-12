"""A second, independent check of ``MapTable`` and the per-row/per-column opcodes (10 to 13).

Written by a session that built the same opcodes in parallel with the one that
landed them (PR #15255); its implementation was dropped and these tests kept,
pointed at the landed code, where they cover what ``test_dng_table_per_line.py``
does not: the other two axes end to end (column-amplifier gains through
ScalePerColumn and row banding through DeltaPerRow developed back to the clean
scene; the landed tests use ScalePerRow and DeltaPerColumn), a short random
table and mixed row deltas and column gains in stage 3 against the closed form,
and numpy against pure Python on a different mix of all five.

All five have closed-form answers, written out here independently of the
module: a table maps a sample to ``table[round(v * 65535)] / 65535``; a delta
adds ``values[(y - top) // row_pitch]`` (or the column's) and a scale
multiplies by it, pinned to 0..1. On a raw file whose sensor was given a
per-row offset or a per-column gain, the matching opcode must give the clean
scene back; in stage 3 every output value must equal the formula.

No camera file carrying any of them is in the evaluation set yet.
"""

from __future__ import annotations

import random
import struct
import unittest
from array import array

from shootflow import dng_opcodes as do
from shootflow import raw_develop as rd
from test_dng_opcodes import HAVE_NUMPY, list_tag, shaded
from test_raw_develop import make_dng, patch_sensor

W, H, BLACK, WHITE = 48, 16, 256, 4095
BIG = 1 << 20


def area(top=0, left=0, bottom=BIG, right=BIG, plane=0, planes=1, row_pitch=1, col_pitch=1):
    return struct.pack(">8I", top, left, bottom, right, plane, planes, row_pitch, col_pitch)


def table_params(table, **kw):
    return area(**kw) + struct.pack(f">I{len(table)}H", len(table), *table)


def line_params(values, **kw):
    return area(**kw) + struct.pack(f">I{len(values)}f", len(values), *values)


def f32(v):
    return struct.unpack(">f", struct.pack(">f", v))[0]


def spec_table(table, v):
    i = min(max(int(v * 65535 + 0.5), 0), len(table) - 1) if v > 0 else 0
    return table[i] / 65535


def develop(blob, **settings):
    return rd.develop(rd.parse_raw(blob), rd.DevelopSettings(**settings))


class FormulaTests(unittest.TestCase):
    def test_stage3_table_hits_the_closed_form(self):
        rng = random.Random(3)
        w, h = 13, 7
        scale = (2.0, 1.0, 1.5)
        table = [rng.randrange(65536) for _ in range(40000)]  # short: samples above step 39999 take the last entry
        src = array("d", (rng.random() * scale[i % 3] for i in range(w * h * 3)))
        got = do.run_stage3_rgb([do.MapTable(0, 0, BIG, BIG, 0, 3, 1, 1, tuple(table))], array("d", src), w, h, scale)
        for i, v in enumerate(src):
            s = scale[i % 3]
            self.assertAlmostEqual(got[i], spec_table(table, v / s) * s, places=12)

    def test_per_row_and_column_hit_the_closed_form(self):
        rng = random.Random(8)
        w, h = 11, 9
        src = array("d", (rng.random() for _ in range(w * h * 3)))
        top, bottom, rp = 1, 8, 3  # rows 1, 4, 7
        left, right, cp = 2, 11, 2  # cols 2, 4, 6, 8, 10
        rows = tuple(f32(rng.uniform(-0.3, 0.3)) for _ in range(3))
        cols = tuple(f32(rng.uniform(0.5, 1.6)) for _ in range(5))
        ops = [
            do.PerLine(top, 0, bottom, BIG, 0, 2, rp, 1, "delta", "row", rows),  # red and green, every column
            do.PerLine(0, left, BIG, right, 1, 2, 1, cp, "scale", "column", cols),  # green and blue, every row
        ]
        got = do.run_stage3_rgb(ops, array("d", src), w, h, (1.0, 1.0, 1.0))
        for y in range(h):
            for x in range(w):
                for p in range(3):
                    v = src[(y * w + x) * 3 + p]
                    if p < 2 and y in (1, 4, 7):
                        v = min(1.0, max(0.0, v + rows[(y - top) // rp]))
                    if p > 0 and x % 2 == 0 and x >= 2:
                        v = min(1.0, max(0.0, v * cols[(x - left) // cp]))
                    self.assertAlmostEqual(got[(y * w + x) * 3 + p], v, places=12, msg=(x, y, p))


class DevelopTests(unittest.TestCase):
    def scene(self):
        return patch_sensor(W, H, black=BLACK, white=WHITE)

    def test_scale_per_column_undoes_column_gain(self):
        # Every column read out through its own amplifier, off by up to 15%: the
        # ScalePerColumn the maker measured puts each column back.
        sensor = self.scene()
        gains = [1.0 + 0.15 * ((x * 7) % 5 - 2) / 2 for x in range(W)]
        bent = shaded(sensor, W, BLACK, lambda x, y: gains[x])
        tag = list_tag([(13, 1, line_params([1.0 / g for g in gains], right=W))])
        want = develop(make_dng(sensor, W, H), engine="python")
        got = develop(make_dng(bent, W, H, extra_raw_tags=[tag]), engine="python")
        off = develop(make_dng(bent, W, H, extra_raw_tags=[tag]), engine="python", opcodes=False)
        self.assertIn("OpcodeList2: 1 ScalePerColumn applied (column gains)", got[3].notes)
        self.assertLessEqual(max(abs(a - b) for a, b in zip(got[2], want[2])), 3 * 257)
        self.assertGreater(max(abs(a - b) for a, b in zip(off[2], want[2])), 10 * 257)

    def test_delta_per_row_undoes_row_banding(self):
        # Odd rows read 60 raw steps high (horizontal banding); a DeltaPerRow
        # of -60 / (white - black) on them takes it out.
        sensor = self.scene()
        banded = [min(WHITE, v + 60) if (i // W) % 2 else v for i, v in enumerate(sensor)]
        d = -60 / (WHITE - BLACK)
        tag = list_tag([(10, 1, line_params([d] * (H // 2), top=1, bottom=H, row_pitch=2))])
        want = develop(make_dng(sensor, W, H), engine="python")
        got = develop(make_dng(banded, W, H, extra_raw_tags=[tag]), engine="python")
        self.assertIn("OpcodeList2: 1 DeltaPerRow applied (row offsets)", got[3].notes)
        self.assertLessEqual(max(abs(a - b) for a, b in zip(got[2], want[2])), 3 * 257)


@unittest.skipUnless(HAVE_NUMPY, "numpy not installed")
class EngineTests(unittest.TestCase):
    def test_numpy_gives_the_pure_bytes(self):
        rng = random.Random(21)
        table = [round(65535 * (i / 4095) ** 1.1) if i < 4096 else 65535 for i in range(4096)]
        list2 = list_tag(
            [
                (7, 1, table_params(table, row_pitch=2, col_pitch=2)),
                (10, 1, line_params([0.01 * (i % 3 - 1) for i in range(8)], top=1, bottom=16, row_pitch=2)),
                (13, 1, line_params([1.0 + 0.02 * (i % 4) for i in range(24)], left=0, right=48, col_pitch=2)),
            ]
        )
        list3 = list_tag(
            [
                (12, 1, line_params([0.9 + 0.01 * i for i in range(5)], top=2, bottom=12, row_pitch=2, plane=1, planes=2)),
                (11, 1, line_params([0.003 * i for i in range(10)], left=3, right=13)),
            ],
            do.TAG_OPCODE_LIST_3,
        )
        for w, h in ((48, 16), (37, 11)):
            sensor = [max(0, min(4095, v + rng.randint(-400, 400))) for v in patch_sensor(w, h, gain=1.3)]
            raw = rd.parse_raw(make_dng(sensor, w, h, extra_raw_tags=[list2, list3]))
            for half in (False, True):
                with self.subTest(size=(w, h), half=half):
                    py = rd.develop(raw, rd.DevelopSettings(engine="python", half=half))
                    npy = rd.develop(raw, rd.DevelopSettings(engine="numpy", half=half))
                    self.assertEqual(py[3].notes, npy[3].notes)
                    self.assertEqual(py[2].tobytes(), npy[2].tobytes())

    def test_run_stage3_planes_matches_rgb(self):
        import numpy as np

        rng = random.Random(6)
        w, h = 23, 13
        scale = (1.9, 1.0, 1.4)
        src = array("d", (rng.random() * 2 for _ in range(w * h * 3)))
        ops = [
            do.MapTable(1, 0, 12, 23, 0, 3, 1, 2, tuple(rng.randrange(65536) for _ in range(30000))),
            do.PerLine(0, 0, 13, 23, 0, 2, 3, 1, "scale", "row", tuple(f32(rng.uniform(0.7, 1.3)) for _ in range(5))),
            do.PerLine(0, 4, 13, 20, 1, 2, 1, 4, "delta", "column", tuple(f32(rng.uniform(-0.1, 0.1)) for _ in range(4))),
        ]
        pure = do.run_stage3_rgb(ops, array("d", src), w, h, scale)
        npy = do.run_stage3_planes(ops, np.frombuffer(src.tobytes(), dtype=np.float64).reshape(h, w, 3).copy(), scale)
        self.assertEqual(npy.tobytes(), pure.tobytes())


if __name__ == "__main__":
    unittest.main()
