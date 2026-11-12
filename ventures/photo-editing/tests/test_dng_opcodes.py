"""Tests for DNG opcode lists (``shootflow.dng_opcodes``) and GainMap in ``develop``.

The DNGs are written here with the opcode lists built byte by byte from the
DNG specification's layout (big-endian, count then id, version, flags, size and
parameters). The sensor is darkened by a known shading and the GainMap must
give the unshaded scene back; a map that rises linearly across the frame checks
the coordinate convention (relative to the stage-2 image, map points at
``origin + i * spacing``) against a closed form computed in the test.
"""

from __future__ import annotations

import random
import struct
import unittest

from shootflow import dng_opcodes as do
from shootflow import raw_develop as rd
from test_raw_develop import make_dng, patch_sensor

try:
    import numpy  # noqa: F401

    HAVE_NUMPY = True
except ImportError:
    HAVE_NUMPY = False


def gain_map_params(
    gains,
    pv,
    ph,
    *,
    top=0,
    left=0,
    bottom=1 << 20,
    right=1 << 20,
    plane=0,
    planes=1,
    row_pitch=1,
    col_pitch=1,
    spacing=None,
    origin=(0.0, 0.0),
    map_planes=1,
):
    sv, sh = spacing or (1.0 / max(pv - 1, 1), 1.0 / max(ph - 1, 1))
    head = struct.pack(">10I", top, left, bottom, right, plane, planes, row_pitch, col_pitch, pv, ph)
    head += struct.pack(">4d", sv, sh, origin[0], origin[1]) + struct.pack(">I", map_planes)
    return head + struct.pack(f">{len(gains)}f", *gains)


def opcode_list(ops):
    """``ops``: [(id, flags, params)] as an OpcodeList blob."""

    out = struct.pack(">I", len(ops))
    for oid, flags, params in ops:
        out += struct.pack(">IIII", oid, 0x01030000, flags, len(params)) + params
    return out


def list_tag(ops, tag=do.TAG_OPCODE_LIST_2):
    return (tag, 7, tuple(opcode_list(ops)))


def shaded(sensor, width, black, factor):
    """Each sensel's signal above black scaled by ``factor(x, y)``, rounded."""

    out = []
    for i, v in enumerate(sensor):
        y, x = divmod(i, width)
        out.append(int(round(black + (v - black) * factor(x, y))))
    return out


def develop(blob, **settings):
    return rd.develop(rd.parse_raw(blob), rd.DevelopSettings(**settings))


class ParseTests(unittest.TestCase):
    def test_round_trip_and_names(self):
        gm = gain_map_params([1.0, 2.0, 3.0, 4.0], 2, 2, top=1, left=0, row_pitch=2, col_pitch=2)
        ops = do.parse_list(opcode_list([(9, 1, gm), (1, 0, b"\0" * 8), (77, 1, b"")]))
        self.assertEqual([op.name for op in ops], ["GainMap", "WarpRectilinear", "opcode 77"])
        self.assertEqual([op.optional for op in ops], [True, False, True])
        parsed = do.parse_gain_map(ops[0])
        self.assertEqual(
            (parsed.top, parsed.row_pitch, parsed.col_pitch, parsed.points_v, parsed.points_h),
            (1, 2, 2, 2, 2),
        )
        self.assertEqual(parsed.gain(1, 0, 0), 3.0)

    def test_truncated_list_raises(self):
        blob = opcode_list([(9, 1, gain_map_params([1.0] * 4, 2, 2))])
        with self.assertRaises(do.OpcodeError):
            do.parse_list(blob[:-3])
        with self.assertRaises(do.OpcodeError):
            do.parse_gain_map(do.Opcode(9, 0, 1, b"\0" * 40))

    def test_index_clamps_at_both_ends(self):
        self.assertEqual(do._index(-0.5, 5), (0, 0, 0.0))
        self.assertEqual(do._index(4.0, 5), (4, 4, 0.0))
        self.assertEqual(do._index(9.0, 5), (4, 4, 0.0))
        self.assertEqual(do._index(2.25, 5), (2, 3, 0.25))


class GainMapDevelopTests(unittest.TestCase):
    W, H, BLACK, WHITE = 48, 16, 256, 4095

    def scene(self):
        return patch_sensor(self.W, self.H, black=self.BLACK, white=self.WHITE)

    def test_per_bayer_position_gains_restore_the_scene(self):
        # Android writes one GainMap per Bayer position (pitch 2): here red is
        # at half signal, blue at two thirds, greens untouched.
        sensor = self.scene()
        cut = {(0, 0): 0.5, (1, 1): 2 / 3}
        dark = shaded(sensor, self.W, self.BLACK, lambda x, y: cut.get((y % 2, x % 2), 1.0))
        ops = [
            (9, 1, gain_map_params([2.0] * 4, 2, 2, top=0, left=0, row_pitch=2, col_pitch=2)),
            (9, 1, gain_map_params([1.5] * 4, 2, 2, top=1, left=1, row_pitch=2, col_pitch=2)),
        ]
        want = develop(make_dng(sensor, self.W, self.H), engine="python")
        got = develop(make_dng(dark, self.W, self.H, extra_raw_tags=[list_tag(ops)]), engine="python")
        off = develop(
            make_dng(dark, self.W, self.H, extra_raw_tags=[list_tag(ops)]), engine="python", opcodes=False
        )
        self.assertIn("OpcodeList2: 2 GainMap applied (lens shading)", got[3].notes)
        self.assertIn("opcode lists not run (opcodes off)", off[3].notes)
        worst = max(abs(a - b) for a, b in zip(got[2], want[2]))
        # Only the darkened sensels' rounding differs (half a step of 3,839 at
        # most, doubled by the gain): up to 3 8-bit steps on the dark patches,
        # where the sRGB curve is steepest.
        self.assertLessEqual(worst, 3 * 257)
        worst_off = max(abs(a - b) for a, b in zip(off[2], want[2]))
        self.assertGreater(worst_off, 40 * 257)

    def test_map_position_follows_relative_image_coordinates(self):
        # Five points across with spacing 1/4: gain 1 + k * (point / 4). Bilinear
        # interpolation of a linear function is exact, so the gain at column x
        # is 1 + k * x / w in closed form (x / w < 1 stays inside the map).
        k, w, h = 1.5, self.W, self.H
        gains = [1.0 + k * j / 4 for _ in range(2) for j in range(5)]
        ops = [(9, 1, gain_map_params(gains, 2, 5))]
        flat = [self.BLACK + 1500] * (w * h)
        dark = shaded(flat, w, self.BLACK, lambda x, y: 1.0 / (1.0 + k * x / w))
        raw = rd.parse_raw(make_dng(dark, w, h, extra_raw_tags=[list_tag(ops)]))
        plan = do.plan(raw.ifd, raw.ifd0)
        span = self.WHITE - self.BLACK
        for y in (0, 7, 15):
            row = [(v - self.BLACK) / span for v in dark[y * w : (y + 1) * w]]
            do.apply_row(plan.gain_maps, y, row, h, w, 1)
            for x, v in enumerate(row):
                self.assertAlmostEqual(v, 1500 / span, delta=0.6 / span * (1 + k), msg=(x, y))

    def test_area_and_pitch_limit_where_it_applies(self):
        ops = [
            (
                9,
                1,
                gain_map_params([3.0] * 4, 2, 2, top=2, left=4, bottom=6, right=12, row_pitch=2, col_pitch=4),
            )
        ]
        raw = rd.parse_raw(make_dng([self.BLACK + 100] * (16 * 8), 16, 8, extra_raw_tags=[list_tag(ops)]))
        plan = do.plan(raw.ifd, raw.ifd0)
        for y in range(8):
            row = [0.1] * 16
            do.apply_row(plan.gain_maps, y, row, 8, 16, 1)
            hit = {x for x, v in enumerate(row) if v != 0.1}
            self.assertEqual(hit, {4, 8} if y in (2, 4) else set(), msg=y)

    def test_gain_never_pushes_past_white(self):
        sensor = [self.WHITE] * (8 * 4)
        ops = [(9, 1, gain_map_params([0.5] * 4, 2, 2))]
        raw = rd.parse_raw(make_dng(sensor, 8, 4, extra_raw_tags=[list_tag(ops)]))
        plan = do.plan(raw.ifd, raw.ifd0)
        row = [1.3] * 8  # over white before the stage-2 clip
        row = [min(v, 1.0) for v in row]
        do.apply_row(plan.gain_maps, 0, row, 4, 8, 1)
        self.assertEqual(row, [0.5] * 8)
        row = [0.8] * 8
        do.apply_row(
            [do.GainMap(0, 0, 4, 8, 0, 1, 1, 1, 1, 1, 1.0, 1.0, 0.0, 0.0, 1, (2.0,))], 0, row, 4, 8, 1
        )
        self.assertEqual(row, [1.0] * 8)

    def test_other_opcodes_are_named_not_run(self):
        sensor = self.scene()
        tags = [
            list_tag([(2, 0, b"\0" * 8), (1, 0, b"\0" * 8)], do.TAG_OPCODE_LIST_3),
            list_tag([(7, 1, b"\0" * 8)], do.TAG_OPCODE_LIST_1),
        ]
        plain = develop(make_dng(sensor, self.W, self.H), engine="python")
        got = develop(make_dng(sensor, self.W, self.H, extra_raw_tags=tags), engine="python")
        self.assertEqual(got[2].tobytes(), plain[2].tobytes())
        self.assertIn("OpcodeList1: 1 x MapTable not applied", got[3].notes)
        self.assertIn("OpcodeList3: 1 x WarpFisheye (required) not applied", got[3].notes)
        # A WarpRectilinear too short for its terms is noted and skipped, not run on garbage.
        self.assertTrue(any(n.startswith("OpcodeList3 WarpRectilinear unreadable") for n in got[3].notes), got[3].notes)

    def test_unreadable_list_is_noted_and_skipped(self):
        sensor = self.scene()
        bad = (do.TAG_OPCODE_LIST_2, 7, tuple(opcode_list([(9, 1, gain_map_params([2.0] * 4, 2, 2))])[:30]))
        got = develop(make_dng(sensor, self.W, self.H, extra_raw_tags=[bad]), engine="python")
        self.assertTrue(any(n.startswith("OpcodeList2 unreadable") for n in got[3].notes), got[3].notes)


class GainMapCliTests(unittest.TestCase):
    def test_develop_runs_the_gain_map_and_no_opcodes_skips_it(self):
        import io
        import json
        import tempfile
        from pathlib import Path

        from shootflow.cli import main

        ops = [(9, 1, gain_map_params([2.0] * 4, 2, 2))]
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "phone.dng"
            src.write_bytes(make_dng(patch_sensor(24, 8), 24, 8, extra_raw_tags=[list_tag(ops)]))
            notes = []
            for i, extra in enumerate(([], ["--no-opcodes"])):
                out = io.StringIO()
                code = main(
                    ["develop", str(src), "--out", str(Path(tmp) / f"m{i}"), "--half", *extra],
                    stdout=out,
                    stderr=io.StringIO(),
                )
                self.assertEqual(code, 0)
                notes.append(json.loads(out.getvalue())["developed"][0]["notes"])
        self.assertIn("OpcodeList2: 1 GainMap applied (lens shading)", notes[0])
        self.assertIn("opcode lists not run (opcodes off)", notes[1])


@unittest.skipUnless(HAVE_NUMPY, "numpy not installed")
class GainMapEngineTests(unittest.TestCase):
    def test_numpy_gives_the_pure_bytes(self):
        rng = random.Random(7)
        for w, h in ((48, 12), (37, 11)):
            sensor = [max(0, min(4095, v + rng.randint(-500, 500))) for v in patch_sensor(w, h, gain=1.4)]
            gains = [0.8 + rng.random() * 2.5 for _ in range(4 * 5)]
            ops = [
                (
                    9,
                    1,
                    gain_map_params(
                        gains,
                        4,
                        5,
                        top=t,
                        left=c,
                        row_pitch=2,
                        col_pitch=2,
                        spacing=(0.3, 0.2),
                        origin=(0.05, -0.1),
                    ),
                )
                for t in (0, 1)
                for c in (0, 1)
            ]
            blob = make_dng(sensor, w, h, extra_raw_tags=[list_tag(ops)])
            raw = rd.parse_raw(blob)
            for half in (False, True):
                with self.subTest(size=(w, h), half=half):
                    py = rd.develop(raw, rd.DevelopSettings(engine="python", half=half))
                    npy = rd.develop(raw, rd.DevelopSettings(engine="numpy", half=half))
                    self.assertEqual(py[3].clipped_fraction, npy[3].clipped_fraction)
                    self.assertEqual(py[3].notes, npy[3].notes)
                    self.assertEqual(py[2].tobytes(), npy[2].tobytes())


if __name__ == "__main__":
    unittest.main()
