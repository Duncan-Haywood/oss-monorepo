"""Tests for ``WarpFisheye`` (DNG opcode 2, OpcodeList3) in ``shootflow.dng_opcodes`` and ``develop``.

The opcode unwraps a fisheye image: each output pixel at normalised radius
``r`` reads from radius ``rd = kr0 t + kr1 t^3 + kr2 t^5 + kr3 t^7`` with
``t = atan(r)``, along the same direction. As for ``WarpRectilinear``
(``test_dng_warp.py``), bilinear sampling of a function linear in x is exact,
so on a horizontal ramp every warped value is the ramp at the source point the
specification's formula names. The formula is written out here a second time,
independently of the module, and both are checked on closed forms: an ideal
equidistant fisheye (``kr0 = 1``) reads radius ``atan(r)``; the centre pixel
reads itself. No camera-written WarpFisheye file has been tried yet.
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
from test_dng_warp import ramp, warp_params
from test_raw_develop import make_dng, patch_sensor


def fisheye_params(terms, cx=0.5, cy=0.5):
    out = struct.pack(">I", len(terms))
    for t in terms:
        out += struct.pack(">4d", *t)
    return out + struct.pack(">2d", cx, cy)


def fisheye_tag(terms, cx=0.5, cy=0.5, flags=0):
    return list_tag([(do.WARP_FISHEYE, flags, fisheye_params(terms, cx, cy))], do.TAG_OPCODE_LIST_3)


def ifd_of(tag):
    return {tag[0]: tag[2]}


def spec_source(terms, cx, cy, x, y, w, h):
    """The specification's source point for output pixel (x, y), written out independently of the module."""

    k0, k1, k2, k3 = terms
    # DNG 1.7.1.0: centre x0 + cx (x1 - x0) between the top-left and bottom-right pixels; m to the farthest pixel.
    ox, oy = cx * (w - 1), cy * (h - 1)
    m = math.sqrt(max(ox, w - 1 - ox) ** 2 + max(oy, h - 1 - oy) ** 2)
    u, v = (x - ox) / m, (y - oy) / m
    r = math.hypot(u, v)
    if r == 0:
        return ox, oy
    t = math.atan(r)
    rdist = k0 * t + k1 * t**3 + k2 * t**5 + k3 * t**7
    return ox + m * rdist * u / r, oy + m * rdist * v / r


class ParseTests(unittest.TestCase):
    def test_round_trip(self):
        terms = [(1.0, 0.0, 0.0, 0.0), (0.98, 0.012, -0.003, 0.0004)]
        op = do.parse_list(bytes(fisheye_tag(terms, 0.47, 0.51)[2]))[0]
        self.assertEqual(op.name, "WarpFisheye")
        wp = do.parse_warp_fisheye(op)
        self.assertEqual(wp.terms, tuple(tuple(t) for t in terms))
        self.assertEqual((wp.cx, wp.cy), (0.47, 0.51))
        self.assertEqual(wp.plane_terms(2), tuple(terms[1]), "a plane past the count uses the last plane's terms")

    def test_bad_parameters_raise(self):
        good = fisheye_params([(1, 0, 0, 0)])
        for params in (b"", struct.pack(">I", 0), good[:-8], fisheye_params([(1, 0, 0, 0)], cy=-0.1), fisheye_params([(float("nan"), 0, 0, 0)])):
            with self.assertRaises(do.OpcodeError):
                do.parse_warp_fisheye(do.Opcode(2, 0, 0, params))

    def test_plan_runs_it_and_names_it(self):
        ifd = ifd_of(fisheye_tag([(1, 0, 0, 0)]))
        pl = do.plan(ifd, {})
        self.assertEqual(len(pl.warps), 1)
        self.assertIsInstance(pl.stage3[0], do.WarpFisheye)
        self.assertIn("OpcodeList3: 1 WarpFisheye applied (fisheye unwrap)", pl.notes)
        self.assertFalse(any("not applied" in n for n in pl.notes))

    def test_unreadable_one_is_skipped_with_a_note(self):
        ifd = ifd_of(list_tag([(do.WARP_FISHEYE, 0, struct.pack(">I", 3))], do.TAG_OPCODE_LIST_3))
        pl = do.plan(ifd, {})
        self.assertEqual(pl.warps, [])
        self.assertTrue(any(n.startswith("OpcodeList3 WarpFisheye unreadable and skipped") for n in pl.notes))

    def test_in_list_order_beside_a_rectilinear_warp(self):
        ops = [
            (do.WARP_RECTILINEAR, 0, warp_params([(1, 0, 0, 0, 0, 0)])),
            (do.WARP_FISHEYE, 0, fisheye_params([(1, 0, 0, 0)])),
        ]
        pl = do.plan(ifd_of(list_tag(ops, do.TAG_OPCODE_LIST_3)), {})
        self.assertEqual([type(o).__name__ for o in pl.stage3], ["WarpRectilinear", "WarpFisheye"])
        self.assertIn("OpcodeList3: 1 WarpRectilinear applied (lens distortion)", pl.notes)
        self.assertIn("OpcodeList3: 1 WarpFisheye applied (fisheye unwrap)", pl.notes)


class FormulaTests(unittest.TestCase):
    CASES = [
        ((1.0, 0.0, 0.0, 0.0), 0.5, 0.5),  # ideal equidistant fisheye
        ((0.8, 0.0, 0.0, 0.0), 0.5, 0.5),  # scaled
        ((0.98, 0.012, -0.003, 0.0004), 0.5, 0.5),  # all four terms
        ((1.02, -0.05, 0.01, 0.0), 0.44, 0.57),  # off-centre
    ]

    def test_source_point_matches_the_specification(self):
        for terms, cx, cy in self.CASES:
            wp = do.WarpFisheye((terms,), cx, cy)
            for w, h in ((40, 30), (31, 17)):
                for x, y in ((0, 0), (w - 1, h - 1), (w // 2, h // 3), (3, h - 2)):
                    got = do.warp_source(wp, 0, x, y, w, h)
                    want = spec_source(terms, cx, cy, x, y, w, h)
                    self.assertAlmostEqual(got[0], want[0], places=9)
                    self.assertAlmostEqual(got[1], want[1], places=9)

    def test_equidistant_reads_radius_atan_r(self):
        # kr0 = 1: a pixel at normalised radius r reads from radius atan(r), along the same ray (closed form).
        w, h = 4000, 3000
        wp = do.WarpFisheye(((1.0, 0.0, 0.0, 0.0),), 0.5, 0.5)
        ox, oy = (w - 1) / 2, (h - 1) / 2  # the middle pixel, as the specification places (0.5, 0.5)
        m = math.hypot(ox, oy)
        for x, y in ((3999, 2999), (2999, 1499), (0, 0), (2000, 100)):
            sx, sy = do.warp_source(wp, 0, x, y, w, h)
            u, v = (x - ox) / m, (y - oy) / m
            su, sv = (sx - ox) / m, (sy - oy) / m
            self.assertAlmostEqual(math.hypot(su, sv), math.atan(math.hypot(u, v)), places=12)
            self.assertAlmostEqual(u * sv - v * su, 0.0, places=12)  # same direction
            self.assertGreater(u * su + v * sv, 0.0)
        # The corner pixel (r = 1) reads from radius pi/4 of m: the unwrap pulls the rim inwards.
        sx, _ = do.warp_source(wp, 0, w - 1, h - 1, w, h)
        self.assertAlmostEqual(sx - ox, ox * math.pi / 4, places=6)

    def test_centre_pixel_reads_itself(self):
        w, h = 41, 21  # odd: pixel (20, 10) is exactly on the centre, r = 0
        for terms, _cx, _cy in self.CASES:
            sx, sy = do.warp_source(do.WarpFisheye((terms,), 0.5, 0.5), 0, 20, 10, w, h)
            self.assertEqual((sx, sy), (20.0, 10.0))

    def test_ramp_gives_the_ramp_at_the_source_point(self):
        w, h = 40, 30
        a, b = (0.1, 0.2, 0.05), (0.004, 0.003, 0.005)
        for terms, cx, cy in self.CASES:
            wp = do.WarpFisheye((terms,), cx, cy)
            out = do.warp_rgb([wp], ramp(w, h, a, b), w, h)
            checked = 0
            for y in range(h):
                for x in range(w):
                    sx, sy = spec_source(terms, cx, cy, x, y, w, h)
                    if not (0 <= sx <= w - 1 and 0 <= sy <= h - 1):
                        continue
                    for p in range(3):
                        self.assertAlmostEqual(out[(y * w + x) * 3 + p], a[p] + b[p] * sx, places=9)
                    checked += 1
            self.assertGreater(checked, w * h // 2)

    def test_planes_use_their_own_terms(self):
        w, h = 40, 30
        terms = ((0.95, 0, 0, 0), (1.0, 0, 0, 0), (1.05, 0, 0, 0))
        src = ramp(w, h)
        out = do.warp_rgb([do.WarpFisheye(terms, 0.5, 0.5)], src, w, h)
        same = do.warp_rgb([do.WarpFisheye(((1.0, 0, 0, 0),), 0.5, 0.5)], src, w, h)
        x, y = 30, 15
        k = (y * w + x) * 3
        self.assertEqual(out[k + 1], same[k + 1])
        self.assertLess(out[k], same[k])  # red reads nearer the centre: lower on a rising ramp
        self.assertGreater(out[k + 2], same[k + 2])
        self.assertLess(same[k + 1], src[k + 1])  # atan(r) < r: the unwrap reads from nearer the centre


class DevelopTests(unittest.TestCase):
    W, H = 48, 24

    def test_fisheye_moves_the_stripes_is_reported_and_opcodes_off_skips_it(self):
        sensor = patch_sensor(self.W, self.H)
        blob = make_dng(sensor, self.W, self.H, extra_raw_tags=[fisheye_tag([(1, 0, 0, 0)])])
        plain = rd.develop(rd.parse_raw(make_dng(sensor, self.W, self.H)), rd.DevelopSettings(engine="python"))
        warped = rd.develop(rd.parse_raw(blob), rd.DevelopSettings(engine="python"))
        off = rd.develop(rd.parse_raw(blob), rd.DevelopSettings(engine="python", opcodes=False))
        self.assertNotEqual(warped[2].tobytes(), plain[2].tobytes())
        self.assertIn("OpcodeList3: 1 WarpFisheye applied (fisheye unwrap)", warped[3].notes)
        self.assertEqual(off[2].tobytes(), plain[2].tobytes())


@unittest.skipUnless(HAVE_NUMPY, "numpy not installed")
class EngineTests(unittest.TestCase):
    def test_numpy_gives_the_pure_bytes(self):
        rng = random.Random(5)
        for w, h in ((48, 12), (37, 11)):
            sensor = [max(0, min(4095, v + rng.randint(-500, 500))) for v in patch_sensor(w, h, gain=1.4)]
            terms = [(0.9 + 0.2 * rng.random(), 0.05 * rng.random(), -0.01 * rng.random(), 0.001) for _ in range(3)]
            raw = rd.parse_raw(make_dng(sensor, w, h, extra_raw_tags=[fisheye_tag(terms, 0.45, 0.55)]))
            for half in (False, True):
                with self.subTest(size=(w, h), half=half):
                    py = rd.develop(raw, rd.DevelopSettings(engine="python", half=half))
                    npy = rd.develop(raw, rd.DevelopSettings(engine="numpy", half=half))
                    self.assertEqual(py[3].notes, npy[3].notes)
                    self.assertEqual(py[2].tobytes(), npy[2].tobytes())

    def test_warp_planes_matches_warp_rgb(self):
        import numpy as np

        rng = random.Random(9)
        w, h = 33, 21  # odd: one pixel sits on the centre (r = 0)
        src = array("d", (rng.random() for _ in range(w * h * 3)))
        wp = do.WarpFisheye(((1.0, 0.0, 0.0, 0.0), (0.97, 0.02, -0.004, 0.0003)), 0.5, 0.5)
        pure = do.warp_rgb([wp], src, w, h)
        npy = do.warp_planes([wp], np.frombuffer(src.tobytes(), dtype=np.float64).reshape(h, w, 3).copy(), band=5)
        self.assertEqual(npy.tobytes(), pure.tobytes())


if __name__ == "__main__":
    unittest.main()
