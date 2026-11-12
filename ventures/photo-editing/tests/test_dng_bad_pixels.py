"""Tests for ``FixBadPixelsConstant`` and ``FixBadPixelsList`` in ``shootflow.dng_opcodes`` and ``develop``.

Both opcodes have closed-form answers on a plane. A sensel repaired from a
ring of same-colour neighbours placed symmetrically around it gets the exact
value of any surface ``a + b*row + c*col`` back, so on such a synthetic CFA
image an isolated bad point, a bad column and a bad row must come back
exactly. Where the ring is lopsided (a corner, a block), the tests compare
against a brute-force reference written here: every same-colour sensel sorted
by Chebyshev distance, the nearest good ones averaged.

No camera file carrying either opcode is in the evaluation set yet.
"""

from __future__ import annotations

import random
import struct
import unittest
from array import array

from shootflow import dng_opcodes as do
from shootflow import raw_develop as rd
from test_dng_opcodes import HAVE_NUMPY, list_tag
from test_raw_develop import make_dng, patch_sensor

L1 = do.TAG_OPCODE_LIST_1


def constant_params(constant, phase=0):
    return struct.pack(">2I", constant, phase)


def list_params(points=(), rects=(), phase=0):
    out = struct.pack(">3I", phase, len(points), len(rects))
    for r, c in points:
        out += struct.pack(">2I", r, c)
    for t, lf, b, r in rects:
        out += struct.pack(">4I", t, lf, b, r)
    return out


def plane_image(w, h, a=500, b=3, c=5):
    return array("H", (a + b * y + c * x for y in range(h) for x in range(w)))


def is_green(y, x, phase):
    # Phase 0 RGGB, 1 GRBG, 2 GBRG, 3 BGGR (DNG specification).
    pattern = {0: "RGGB", 1: "GRBG", 2: "GBRG", 3: "BGGR"}[phase]
    return pattern[(y % 2) * 2 + (x % 2)] == "G"


def colour(y, x, phase):
    pattern = {0: "RGGB", 1: "GRBG", 2: "GBRG", 3: "BGGR"}[phase]
    return pattern[(y % 2) * 2 + (x % 2)]


def reference(vals, w, h, bad, phase):
    """Brute force: the mean of the nearest good same-colour sensels, rounded half up."""

    bad = set(bad)
    out = array(vals.typecode, vals)
    for i in bad:
        y, x = divmod(i, w)
        want = colour(y, x, phase)
        by_d = {}
        for yy in range(h):
            for xx in range(w):
                j = yy * w + xx
                if j in bad or colour(yy, xx, phase) != want:
                    continue
                d = max(abs(yy - y), abs(xx - x))
                if d <= do.BAD_PIXEL_MAX_DISTANCE:
                    by_d.setdefault(d, []).append(vals[j])
        if by_d:
            got = by_d[min(by_d)]
            out[i] = int(sum(got) / len(got) + 0.5)
    return out


class ParseTests(unittest.TestCase):
    def test_round_trip(self):
        ops = do.parse_list(
            list_tag([(4, 1, constant_params(0, 2)), (5, 0, list_params([(3, 4), (7, 1)], [(0, 5, 10, 6)], 1))], L1)[2]
        )
        self.assertEqual([op.name for op in ops], ["FixBadPixelsConstant", "FixBadPixelsList"])
        self.assertEqual(do.parse_bad_pixels_constant(ops[0]), do.BadPixelsConstant(0, 2))
        bl = do.parse_bad_pixels_list(ops[1])
        self.assertEqual((bl.bayer_phase, bl.points, bl.rects), (1, ((3, 4), (7, 1)), ((0, 5, 10, 6),)))

    def test_bad_parameters_raise(self):
        with self.assertRaises(do.OpcodeError):
            do.parse_bad_pixels_constant(do.Opcode(4, 0, 0, b"\0" * 7))
        with self.assertRaises(do.OpcodeError):
            do.parse_bad_pixels_constant(do.Opcode(4, 0, 0, constant_params(0, 4)))
        with self.assertRaises(do.OpcodeError):
            do.parse_bad_pixels_list(do.Opcode(5, 0, 0, list_params([(1, 1)])[:-1]))
        with self.assertRaises(do.OpcodeError):
            do.parse_bad_pixels_list(do.Opcode(5, 0, 0, list_params(rects=[(4, 4, 4, 9)])))
        with self.assertRaises(do.OpcodeError):
            do.parse_bad_pixels_list(do.Opcode(5, 0, 0, list_params(phase=7)))

    def test_plan_runs_them_in_list1_only_and_only_on_cfa(self):
        tags = [
            list_tag([(4, 1, constant_params(0)), (5, 0, list_params([(2, 2)])), (8, 1, b"")], L1),
            list_tag([(5, 0, list_params([(2, 2)]))]),
        ]
        ifd = {t: v for t, _ty, v in tags}
        plan = do.plan(ifd, {})
        self.assertEqual([type(op).__name__ for op in plan.stage1], ["BadPixelsConstant", "BadPixelsList"])
        self.assertEqual(plan.stage2, [])
        self.assertIn("OpcodeList1: 1 x MapPolynomial not applied", plan.notes)
        self.assertIn("OpcodeList2: 1 x FixBadPixelsList (required) not applied", plan.notes)
        self.assertTrue(plan)
        linear = do.plan(ifd, {}, cfa=False)
        self.assertEqual(linear.stage1, [])
        self.assertIn("OpcodeList1: 1 x FixBadPixelsConstant not applied", linear.notes)


class RingTests(unittest.TestCase):
    def test_nearest_rings(self):
        self.assertEqual(sorted(do._RINGS[True][0]), [(-1, -1), (-1, 1), (1, -1), (1, 1)])
        self.assertEqual(do._RINGS[False][0], [])
        self.assertEqual(
            sorted(do._RINGS[False][1]), [(-2, -2), (-2, 0), (-2, 2), (0, -2), (0, 2), (2, -2), (2, 0), (2, 2)]
        )

    def test_green_parity_matches_each_phase(self):
        for phase in range(4):
            gp = do._green_parity(phase)
            for y in range(4):
                for x in range(4):
                    self.assertEqual((y + x) % 2 == gp, is_green(y, x, phase), (phase, y, x))


class PlaneTests(unittest.TestCase):
    W, H = 24, 20

    def run_list(self, img, points=(), rects=(), phase=0):
        notes = []
        op = do.BadPixelsList(phase, tuple(points), tuple(rects))
        return do.run_stage1([op], img, self.W, self.H, notes), notes

    def test_isolated_points_come_back_exactly(self):
        clean = plane_image(self.W, self.H)
        rng = random.Random(3)
        pts = [(rng.randrange(3, self.H - 3), rng.randrange(3, self.W - 3)) for _ in range(6)]
        # Keep them apart, so every ring stays whole.
        pts = [p for i, p in enumerate(pts) if all(max(abs(p[0] - q[0]), abs(p[1] - q[1])) > 4 for q in pts[:i])]
        for phase in range(4):
            dirty = array("H", clean)
            for r, c in pts:
                dirty[r * self.W + c] = 4000
            got, notes = self.run_list(dirty, pts, phase=phase)
            self.assertEqual(list(got), list(clean), phase)
            self.assertEqual(notes, [f"OpcodeList1: FixBadPixelsList applied ({len(pts)} bad sensels repaired)"])
            self.assertEqual(dirty[pts[0][0] * self.W + pts[0][1]], 4000)  # the input is not touched

    def test_a_dead_column_or_row_comes_back_exactly(self):
        clean = plane_image(self.W, self.H)
        col, row = 9, 13
        cases = [
            ([y * self.W + col for y in range(self.H)], [(0, col, self.H, col + 1)]),
            ([row * self.W + x for x in range(self.W)], [(row, 0, row + 1, 1 << 20)]),
        ]
        for idx, rects in cases:
            dirty = array("H", clean)
            for i in idx:
                dirty[i] = 0
            for phase in range(4):
                got, _ = self.run_list(dirty, rects=rects, phase=phase)
                # Away from the frame edge, the line is exact on a plane.
                for y in range(2, self.H - 2):
                    for x in range(2, self.W - 2):
                        self.assertEqual(got[y * self.W + x], clean[y * self.W + x], (rects, phase, y, x))

    def test_lopsided_rings_match_the_brute_force_reference(self):
        rng = random.Random(11)
        img = array("H", (rng.randrange(256, 4096) for _ in range(self.W * self.H)))
        pts = [(0, 0), (0, self.W - 1), (self.H - 1, 5), (7, 7), (7, 8), (8, 7)]
        rects = [(3, 15, 6, 19), (12, 2, 16, 3)]
        bad = [r * self.W + c for r, c in pts]
        for t, lf, b, r in rects:
            bad += [y * self.W + x for y in range(t, b) for x in range(lf, r)]
        for phase in range(4):
            got, _ = self.run_list(img, pts, rects, phase)
            self.assertEqual(list(got), list(reference(img, self.W, self.H, bad, phase)), phase)

    def test_a_wide_hole_leaves_its_centre(self):
        w = h = 40
        img = plane_image(w, h)
        notes = []
        side = 2 * do.BAD_PIXEL_MAX_DISTANCE + 4
        op = do.BadPixelsList(0, (), ((10, 10, 10 + side, 10 + side),))
        got = do.run_stage1([op], img, w, h, notes)
        centre = (10 + side // 2) * w + 10 + side // 2
        self.assertEqual(got[centre], img[centre])
        self.assertIn("with no good neighbour left as is", notes[0])

    def test_points_outside_the_frame_are_ignored(self):
        img = plane_image(self.W, self.H)
        got, notes = self.run_list(img, [(self.H, 0), (0, self.W + 5)], [(self.H + 1, 0, self.H + 4, 4)])
        self.assertEqual(list(got), list(img))
        self.assertEqual(notes, ["OpcodeList1: FixBadPixelsList applied (0 bad sensels repaired)"])


class ConstantTests(unittest.TestCase):
    W, H = 30, 22

    def test_marked_sensels_come_back_exactly(self):
        clean = plane_image(self.W, self.H)
        dirty = array("H", clean)
        pts = [(4, 4), (4, 15), (10, 21), (16, 6), (17, 17)]
        for r, c in pts:
            dirty[r * self.W + c] = 0
        notes = []
        got = do.run_stage1([do.BadPixelsConstant(0, 0)], dirty, self.W, self.H, notes)
        self.assertEqual(list(got), list(clean))
        self.assertEqual(notes, ["OpcodeList1: FixBadPixelsConstant applied (5 bad sensels repaired)"])

    def test_marked_neighbours_are_not_averaged_in(self):
        img = plane_image(self.W, self.H)
        # A green at (5, 6) with one diagonal also marked: the three others are used.
        for r, c in ((5, 6), (6, 7)):
            img[r * self.W + c] = 0
        got = do.run_stage1([do.BadPixelsConstant(0, 0)], img, self.W, self.H, [])
        want = reference(img, self.W, self.H, [5 * self.W + 6, 6 * self.W + 7], 0)
        self.assertEqual(list(got), list(want))
        self.assertNotEqual(got[5 * self.W + 6], 0)

    def test_a_frame_full_of_the_constant_is_not_touched(self):
        img = plane_image(self.W, self.H)
        for i in range(0, len(img), 50):  # 2% of the frame
            img[i] = 7
        notes = []
        got = do.run_stage1([do.BadPixelsConstant(7, 0)], img, self.W, self.H, notes)
        self.assertEqual(list(got), list(img))
        self.assertIn("FixBadPixelsConstant not run", notes[0])


def develop(blob, **settings):
    return rd.develop(rd.parse_raw(blob), rd.DevelopSettings(**settings))


class DevelopTests(unittest.TestCase):
    W, H = 48, 16

    def dirty(self):
        sensor = patch_sensor(self.W, self.H)
        dirty = list(sensor)
        # Inside the 8-wide patches, two sensels from their edges, so each ring sees one patch.
        pts = [(4, 4), (5, 11), (8, 19), (9, 28), (12, 35), (6, 43)]
        for r, c in pts:
            dirty[r * self.W + c] = 0
        return sensor, dirty, pts

    def test_list_and_constant_restore_the_clean_develop(self):
        sensor, dirty, pts = self.dirty()
        want = develop(make_dng(sensor, self.W, self.H), engine="python")
        for tag in (list_tag([(5, 0, list_params(pts))], L1), list_tag([(4, 0, constant_params(0))], L1)):
            got = develop(make_dng(dirty, self.W, self.H, extra_raw_tags=[tag]), engine="python")
            self.assertEqual(list(got[2]), list(want[2]))
            self.assertTrue(any("bad sensels repaired" in n for n in got[3].notes), got[3].notes)
            off = develop(make_dng(dirty, self.W, self.H, extra_raw_tags=[tag]), engine="python", opcodes=False)
            self.assertGreater(max(abs(a - b) for a, b in zip(off[2], want[2])), 20 * 257)

    @unittest.skipUnless(HAVE_NUMPY, "numpy not installed")
    def test_numpy_gives_the_pure_bytes(self):
        _sensor, dirty, pts = self.dirty()
        tag = list_tag([(5, 0, list_params(pts[:3], [(0, 30, self.H, 31)])), (4, 0, constant_params(0))], L1)
        blob = make_dng(dirty, self.W, self.H, extra_raw_tags=[tag])
        a = develop(blob, engine="python")
        b = develop(blob, engine="numpy")
        self.assertEqual(list(a[2]), list(b[2]))


if __name__ == "__main__":
    unittest.main()
