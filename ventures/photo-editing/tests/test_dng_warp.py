"""Tests for ``WarpRectilinear`` (OpcodeList3 lens distortion) in ``shootflow.dng_opcodes`` and ``develop``.

The opcode maps each corrected output pixel back to a point in the distorted
image. Bilinear sampling of a function that is linear in x is exact, so on a
horizontal ramp the warped value at every pixel is the ramp at the source point
the specification's formula names; the tests compute that point here, from the
formula, and check the module against it (radial, tangential, off-centre and
per-plane terms). The real file this was built for is the Leica T DNG
(``eval/warp-rectilinear-2026-11-12.md``).
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


def warp_params(terms, cx=0.5, cy=0.5):
    out = struct.pack(">I", len(terms))
    for t in terms:
        out += struct.pack(">6d", *t)
    return out + struct.pack(">2d", cx, cy)


def warp_tag(terms, cx=0.5, cy=0.5, flags=0):
    return list_tag([(do.WARP_RECTILINEAR, flags, warp_params(terms, cx, cy))], do.TAG_OPCODE_LIST_3)


def spec_source(terms, cx, cy, x, y, w, h):
    """The specification's source point for output pixel (x, y), written out independently of the module."""

    kr0, kr1, kr2, kr3, kt0, kt1 = terms
    ox, oy = cx * w, cy * h
    m = max(math.sqrt((px - ox) ** 2 + (py - oy) ** 2) for px in (0, w) for py in (0, h))
    u, v = (x + 0.5 - ox) / m, (y + 0.5 - oy) / m
    r2 = u * u + v * v
    f = kr0 + kr1 * r2 + kr2 * r2**2 + kr3 * r2**3
    su = u * f + kt0 * 2 * u * v + kt1 * (r2 + 2 * u * u)
    sv = v * f + kt1 * 2 * u * v + kt0 * (r2 + 2 * v * v)
    return ox + m * su - 0.5, oy + m * sv - 0.5


def ramp(w, h, a=(0.1, 0.2, 0.05), b=(0.004, 0.003, 0.005)):
    rgb = array("d")
    for _y in range(h):
        for x in range(w):
            for p in range(3):
                rgb.append(a[p] + b[p] * x)
    return rgb


class ParseTests(unittest.TestCase):
    def test_round_trip(self):
        terms = [(0.97, 0.025, 0.0027, 0.0012, 0.0, 0.0), (0.971, 0.0256, 0.0023, 0.0011, 1e-4, -2e-4)]
        op = do.parse_list(bytes(warp_tag(terms, 0.48, 0.52)[2]))[0]
        wp = do.parse_warp_rectilinear(op)
        self.assertEqual(wp.terms, tuple(tuple(t) for t in terms))
        self.assertEqual((wp.cx, wp.cy), (0.48, 0.52))
        self.assertEqual(wp.plane_terms(2), tuple(terms[1]), "a plane past the count uses the last plane's terms")

    def test_bad_parameters_raise(self):
        for params in (b"", struct.pack(">I", 0), warp_params([(1, 0, 0, 0, 0, 0)])[:-8], warp_params([(1, 0, 0, 0, 0, 0)], cx=1.5)):
            with self.assertRaises(do.OpcodeError):
                do.parse_warp_rectilinear(do.Opcode(1, 0, 0, params))


class FormulaTests(unittest.TestCase):
    CASES = [
        ((1.0, 0.0, 0.0, 0.0, 0.0, 0.0), 0.5, 0.5),  # identity
        ((0.9, 0.0, 0.0, 0.0, 0.0, 0.0), 0.5, 0.5),  # pure magnification
        ((0.97, 0.025, 0.0027, 0.0012, 0.0, 0.0), 0.5, 0.5),  # the Leica T's red plane
        ((1.0, -0.08, 0.01, 0.0, 0.0, 0.0), 0.43, 0.58),  # barrel, off-centre
        ((0.98, 0.01, 0.0, 0.0, 0.004, -0.003), 0.5, 0.5),  # tangential terms
    ]

    def test_source_point_matches_the_specification(self):
        for terms, cx, cy in self.CASES:
            wp = do.WarpRectilinear((terms,), cx, cy)
            for w, h in ((40, 30), (31, 17)):
                for x, y in ((0, 0), (w - 1, h - 1), (w // 2, h // 3), (3, h - 2)):
                    got = do.warp_source(wp, 0, x, y, w, h)
                    want = spec_source(terms, cx, cy, x, y, w, h)
                    self.assertAlmostEqual(got[0], want[0], places=9)
                    self.assertAlmostEqual(got[1], want[1], places=9)

    def test_corners_are_fixed_when_f_of_one_is_one(self):
        # The Leica's terms sum to 1 at the corner (r = 1): the corner pixels' centres move by under a pixel.
        terms = (0.970578283208733, 0.025468202539451, 0.002716151848736, 0.001237362403081, 0.0, 0.0)
        wp = do.WarpRectilinear((terms,), 0.5, 0.5)
        sx, sy = do.warp_source(wp, 0, 0, 0, 4944, 3278)
        self.assertLess(abs(sx), 0.5)
        self.assertLess(abs(sy), 0.5)
        cx, cy = do.warp_source(wp, 0, 2472, 1639, 4944, 3278)
        self.assertAlmostEqual(cx, 2472.0 - 0.5 * (1 - terms[0]), places=6)

    def test_ramp_gives_the_ramp_at_the_source_point(self):
        w, h = 40, 30
        a, b = (0.1, 0.2, 0.05), (0.004, 0.003, 0.005)
        for terms, cx, cy in self.CASES:
            wp = do.WarpRectilinear((terms,), cx, cy)
            out = do.warp_rgb([wp], ramp(w, h, a, b), w, h)
            checked = 0
            for y in range(h):
                for x in range(w):
                    sx, sy = spec_source(terms, cx, cy, x, y, w, h)
                    if not (0 <= sx <= w - 1 and 0 <= sy <= h - 1):
                        continue  # clamped to the edge: the ramp is not extended
                    for p in range(3):
                        self.assertAlmostEqual(out[(y * w + x) * 3 + p], a[p] + b[p] * sx, places=9)
                    checked += 1
            self.assertGreater(checked, w * h // 2)

    def test_planes_use_their_own_terms(self):
        # Lateral colour: red magnified, blue shrunk, green untouched.
        w, h = 40, 30
        terms = ((0.95, 0, 0, 0, 0, 0), (1.0, 0, 0, 0, 0, 0), (1.05, 0, 0, 0, 0, 0))
        src = ramp(w, h)
        out = do.warp_rgb([do.WarpRectilinear(terms, 0.5, 0.5)], src, w, h)
        x, y = 30, 15
        k = (y * w + x) * 3
        self.assertEqual(out[k + 1], src[k + 1])
        self.assertLess(out[k], src[k])  # right of centre, red reads from nearer the centre: lower on a rising ramp
        self.assertGreater(out[k + 2], src[k + 2])

    def test_outside_the_image_takes_the_edge(self):
        w, h = 20, 10
        out = do.warp_rgb([do.WarpRectilinear(((1.5, 0, 0, 0, 0, 0),), 0.5, 0.5)], ramp(w, h), w, h)
        self.assertEqual(out[0], ramp(w, h)[0])  # far left reads past the edge: the edge pixel
        self.assertEqual(out[(w - 1) * 3], ramp(w, h)[(w - 1) * 3])


class DevelopTests(unittest.TestCase):
    W, H = 48, 24

    def test_identity_warp_changes_nothing_and_is_reported(self):
        sensor = patch_sensor(self.W, self.H)
        plain = rd.develop(rd.parse_raw(make_dng(sensor, self.W, self.H)), rd.DevelopSettings(engine="python"))
        got = rd.develop(
            rd.parse_raw(make_dng(sensor, self.W, self.H, extra_raw_tags=[warp_tag([(1, 0, 0, 0, 0, 0)])])),
            rd.DevelopSettings(engine="python"),
        )
        self.assertEqual(got[2].tobytes(), plain[2].tobytes())
        self.assertIn("OpcodeList3: 1 WarpRectilinear applied (lens distortion)", got[3].notes)

    def test_warp_moves_the_stripes_and_opcodes_off_skips_it(self):
        sensor = patch_sensor(self.W, self.H)
        blob = make_dng(sensor, self.W, self.H, extra_raw_tags=[warp_tag([(0.8, 0, 0, 0, 0, 0)])])
        plain = rd.develop(rd.parse_raw(make_dng(sensor, self.W, self.H)), rd.DevelopSettings(engine="python"))
        warped = rd.develop(rd.parse_raw(blob), rd.DevelopSettings(engine="python"))
        off = rd.develop(rd.parse_raw(blob), rd.DevelopSettings(engine="python", opcodes=False))
        self.assertNotEqual(warped[2].tobytes(), plain[2].tobytes())
        self.assertEqual(off[2].tobytes(), plain[2].tobytes())
        self.assertIn("opcode lists not run (opcodes off)", off[3].notes)
        # Where each pixel reads from is checked exactly on the ramp above (FormulaTests).


@unittest.skipUnless(HAVE_NUMPY, "numpy not installed")
class EngineTests(unittest.TestCase):
    def test_numpy_gives_the_pure_bytes(self):
        rng = random.Random(11)
        for w, h in ((48, 12), (37, 11)):
            sensor = [max(0, min(4095, v + rng.randint(-500, 500))) for v in patch_sensor(w, h, gain=1.4)]
            terms = [
                (0.9 + 0.1 * rng.random(), 0.05 * rng.random(), 0.01 * rng.random(), 0.001, 0.002 * rng.random(), -0.001)
                for _ in range(3)
            ]
            blob = make_dng(sensor, w, h, extra_raw_tags=[warp_tag(terms, 0.45, 0.55)])
            raw = rd.parse_raw(blob)
            for half in (False, True):
                with self.subTest(size=(w, h), half=half):
                    py = rd.develop(raw, rd.DevelopSettings(engine="python", half=half))
                    npy = rd.develop(raw, rd.DevelopSettings(engine="numpy", half=half))
                    self.assertEqual(py[3].notes, npy[3].notes)
                    self.assertEqual(py[2].tobytes(), npy[2].tobytes())

    def test_warp_planes_matches_warp_rgb(self):
        import numpy as np

        rng = random.Random(3)
        w, h = 33, 21
        src = array("d", (rng.random() for _ in range(w * h * 3)))
        wp = do.WarpRectilinear(((0.97, 0.02, 0.003, 0.001, 0.001, -0.002), (1.01, -0.03, 0, 0, 0, 0)), 0.4, 0.6)
        pure = do.warp_rgb([wp], src, w, h)
        npy = do.warp_planes([wp], np.frombuffer(src.tobytes(), dtype=np.float64).reshape(h, w, 3).copy(), band=5)
        self.assertEqual(npy.tobytes(), pure.tobytes())


if __name__ == "__main__":
    unittest.main()
