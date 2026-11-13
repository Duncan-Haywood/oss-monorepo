"""Tests for ``WarpRectilinear2`` (opcode 14, DNG 1.6; OpcodeList3) in ``shootflow.dng_opcodes`` and ``develop``.

The parameter layout and the formula are from the DNG specification 1.7.1.0
(September 2023), chapter 7, "WarpRectilinear2": per plane 15 radial terms
``kr0..kr14`` on powers of ``r`` (odd and even), two tangential terms, a valid
radius range that ``r`` is clamped to before the polynomial, then the optical
centre and a ``reciprocalRadial`` LONG that divides by the polynomial instead
of multiplying. The tests write that formula out here, independently of the
module (plain powers, not Horner), and check the module against it; they check
that a WarpRectilinear2 holding only even terms gives WarpRectilinear's source
points; and they check the specification's "skip rule" on its three worked
examples. No camera- or converter-written file carrying this opcode has been
tried.
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

IDENTITY = (1.0,) + (0.0,) * 14 + (0.0, 0.0, 0.0, 1.0)


def plane(kr=(1.0,), kt=(0.0, 0.0), lo=0.0, hi=1.0):
    kr = tuple(kr) + (0.0,) * (15 - len(kr))
    return kr + tuple(kt) + (lo, hi)


def warp2_params(terms, cx=0.5, cy=0.5, reciprocal=0):
    out = struct.pack(">I", len(terms))
    for t in terms:
        out += struct.pack(">19d", *t)
    return out + struct.pack(">2d", cx, cy) + struct.pack(">I", reciprocal)


def warp2_tag(terms, cx=0.5, cy=0.5, reciprocal=0, flags=0):
    return list_tag([(do.WARP_RECTILINEAR_2, flags, warp2_params(terms, cx, cy, reciprocal))], do.TAG_OPCODE_LIST_3)


def spec_source2(t, cx, cy, reciprocal, x, y, w, h):
    """The specification's source point for output pixel (x, y), written out independently of the module."""

    kr, kt0, kt1, lo, hi = t[:15], t[15], t[16], t[17], t[18]
    # DNG 1.7.1.0 (as WarpRectilinear): centre x0 + cx (x1 - x0) between the top-left and bottom-right pixels; m to the farthest pixel.
    ox, oy = cx * (w - 1), cy * (h - 1)
    m = math.sqrt(max(ox, w - 1 - ox) ** 2 + max(oy, h - 1 - oy) ** 2)
    u, v = (x - ox) / m, (y - oy) / m
    r = math.sqrt(u * u + v * v)
    rc = min(hi, max(lo, r))
    f = sum(kr[p] * rc**p for p in range(15))
    ur, vr = (u / f, v / f) if reciprocal else (u * f, v * f)
    r2 = u * u + v * v
    su = ur + kt0 * 2 * u * v + kt1 * (r2 + 2 * u * u)
    sv = vr + kt1 * 2 * u * v + kt0 * (r2 + 2 * v * v)
    return ox + m * su, oy + m * sv


CASES = [
    (plane(), 0.5, 0.5, 0),  # identity
    (plane((0.97, 0.004, 0.025, -0.003, 0.0027, 0.0, 0.0012)), 0.5, 0.5, 0),  # odd terms beside the even ones
    (plane((1.0, 0.0, -0.08, 0.0, 0.01), lo=0.0, hi=0.6), 0.43, 0.58, 0),  # barrel, clamped past r = 0.6
    (plane((1.0, 0.0, 0.05, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, -0.01)), 0.5, 0.5, 0),  # r^14
    (plane((1.0, 0.0, 0.06, 0.0, 0.01), kt=(0.004, -0.003)), 0.5, 0.5, 1),  # division model, tangential terms
    (plane((0.95, 0.02, 0.04), lo=0.1, hi=0.9), 0.52, 0.47, 1),  # division model, both ends clamped
]


class ParseTests(unittest.TestCase):
    def test_round_trip(self):
        terms = [plane((0.97, 0.01, 0.02), kt=(1e-4, -2e-4), lo=0.05, hi=0.95), plane((1.01,))]
        op = do.parse_list(bytes(warp2_tag(terms, 0.48, 0.52, reciprocal=1)[2]))[0]
        wp = do.parse_warp_rectilinear2(op)
        self.assertEqual(wp.terms, tuple(terms))
        self.assertEqual((wp.cx, wp.cy, wp.reciprocal), (0.48, 0.52, True))
        self.assertEqual(wp.plane_terms(2), terms[1], "a plane past the count uses the last plane's terms")
        self.assertEqual(len(warp2_params(terms)), 4 + 152 * 2 + 16 + 4)

    def test_bad_parameters_raise(self):
        bad = (
            b"",
            struct.pack(">I", 0),
            warp2_params([IDENTITY])[:-4],  # no reciprocal flag
            warp2_params([IDENTITY], cx=1.5),
            warp2_params([plane(lo=0.5, hi=0.5)]),  # min must be below max
            warp2_params([plane(lo=0.0, hi=1.2)]),  # max at most 1
            warp2_params([plane(lo=-0.1, hi=1.0)]),
            warp2_params([plane((1.0, -2.0))], reciprocal=1),  # f = 1 - 2r is zero at r = 0.5: division by zero
            warp2_params([plane((float("nan"),))]),
        )
        for params in bad:
            with self.assertRaises(do.OpcodeError):
                do.parse_warp_rectilinear2(do.Opcode(14, 0, 0, params))

    def test_a_zero_outside_the_valid_range_is_allowed(self):
        # f = 1 - 2r reaches zero only at r = 0.5; clamped to 0..0.4 it never does.
        wp = do.parse_warp_rectilinear2(do.Opcode(14, 0, 0, warp2_params([plane((1.0, -2.0), hi=0.4)], reciprocal=1)))
        self.assertTrue(wp.reciprocal)


class FormulaTests(unittest.TestCase):
    def test_source_point_matches_the_specification(self):
        for terms, cx, cy, recip in CASES:
            wp = do.WarpRectilinear2((terms,), cx, cy, bool(recip))
            for w, h in ((40, 30), (31, 17)):
                for x, y in ((0, 0), (w - 1, h - 1), (w // 2, h // 3), (3, h - 2), (w // 2, h // 2)):
                    got = do.warp_source(wp, 0, x, y, w, h)
                    want = spec_source2(terms, cx, cy, recip, x, y, w, h)
                    self.assertAlmostEqual(got[0], want[0], places=9)
                    self.assertAlmostEqual(got[1], want[1], places=9)

    def test_even_terms_only_is_warp_rectilinear(self):
        # WarpRectilinear's kr1..kr3 multiply r^2, r^4, r^6: here they are kr2, kr4, kr6.
        rng = random.Random(5)
        for _ in range(20):
            k = (0.9 + 0.1 * rng.random(), 0.05 * rng.random(), 0.01 * rng.random(), 0.002 * rng.random())
            kt = (0.002 * rng.random(), -0.002 * rng.random())
            cx, cy = 0.4 + 0.2 * rng.random(), 0.4 + 0.2 * rng.random()
            old = do.WarpRectilinear((k + kt,), cx, cy)
            new = do.WarpRectilinear2((plane((k[0], 0, k[1], 0, k[2], 0, k[3]), kt),), cx, cy, False)
            for x, y in ((0, 0), (39, 29), (17, 4), (20, 15)):
                a, b = do.warp_source(old, 0, x, y, 40, 30), do.warp_source(new, 0, x, y, 40, 30)
                self.assertAlmostEqual(a[0], b[0], places=10)
                self.assertAlmostEqual(a[1], b[1], places=10)

    def test_reciprocal_divides(self):
        # f = 2 everywhere: multiplying reads from twice the radius, dividing from half; dividing by 2 is WarpRectilinear kr0 = 0.5.
        half = do.WarpRectilinear(((0.5, 0, 0, 0, 0, 0),), 0.5, 0.5)
        div = do.WarpRectilinear2((plane((2.0,)),), 0.5, 0.5, True)
        for x, y in ((0, 0), (39, 29), (7, 22)):
            self.assertEqual(do.warp_source(div, 0, x, y, 40, 30), do.warp_source(half, 0, x, y, 40, 30))

    def test_valid_radius_clamps_the_polynomial_only(self):
        # Past max_valid_radius the radial factor is f(max): the source radius grows linearly from there.
        t = plane((1.0, 0.0, 0.3), hi=0.5)
        wp = do.WarpRectilinear2((t,), 0.5, 0.5, False)
        w, h = 201, 201  # centre on pixel 100, m to the farthest pixel's centre
        m = math.hypot(100, 100)
        for x in (150, 180, 200):
            r = (x - 100) / m
            sx, _ = do.warp_source(wp, 0, x, 100, w, h)
            fr = 1.0 + 0.3 * min(r, 0.5) ** 2
            self.assertAlmostEqual((sx - 100) / m, r * fr, places=12)

    def test_ramp_gives_the_ramp_at_the_source_point(self):
        w, h = 40, 30
        a, b = (0.1, 0.2, 0.05), (0.004, 0.003, 0.005)
        for terms, cx, cy, recip in CASES:
            wp = do.WarpRectilinear2((terms,), cx, cy, bool(recip))
            out = do.warp_rgb([wp], ramp(w, h, a, b), w, h)
            checked = 0
            for y in range(h):
                for x in range(w):
                    sx, sy = spec_source2(terms, cx, cy, recip, x, y, w, h)
                    if not (0 <= sx <= w - 1 and 0 <= sy <= h - 1):
                        continue
                    for p in range(3):
                        self.assertAlmostEqual(out[(y * w + x) * 3 + p], a[p] + b[p] * sx, places=9)
                    checked += 1
            self.assertGreater(checked, w * h // 2)

    def test_planes_use_their_own_terms(self):
        w, h = 40, 30
        terms = (plane((0.95,)), plane(), plane((1.05,)))
        src = ramp(w, h)
        out = do.warp_rgb([do.WarpRectilinear2(terms, 0.5, 0.5, False)], src, w, h)
        k = (15 * w + 30) * 3
        self.assertEqual(out[k + 1], src[k + 1])
        self.assertLess(out[k], src[k])
        self.assertGreater(out[k + 2], src[k + 2])


def _plan(ops):
    """``plan`` on an OpcodeList3 of ``ops`` ([(id, flags, params)])."""

    return do.plan({do.TAG_OPCODE_LIST_3: bytes(list_tag(ops, do.TAG_OPCODE_LIST_3)[2])}, {})


WR2 = (do.WARP_RECTILINEAR_2, 0, warp2_params([plane((1.01,))]))
WR2_OPT = (do.WARP_RECTILINEAR_2, 1, warp2_params([plane((1.01,))]))
WR = (do.WARP_RECTILINEAR, 0, warp_params([(0.99, 0, 0, 0, 0, 0)]))
FISH = (do.WARP_FISHEYE, 0, struct.pack(">I4d2d", 1, 1.0, 0, 0, 0, 0.5, 0.5))
VIG = (do.FIX_VIGNETTE_RADIAL, 0, struct.pack(">7d", 0.1, 0, 0, 0, 0, 0.5, 0.5))


class SkipRuleTests(unittest.TestCase):
    """The specification's three examples (with FixVignetteRadial standing in for its GainMap) and the edges."""

    def kinds(self, ops):
        return [type(op).__name__ for op in _plan(ops).stage3]

    def test_example_1_not_a_warp_after_it(self):
        self.assertEqual(self.kinds([WR2, VIG]), ["WarpRectilinear2", "VignetteRadial"])

    def test_example_2_optional_then_fisheye_skips_the_fisheye(self):
        p = _plan([WR2_OPT, FISH, VIG])
        self.assertEqual([type(op).__name__ for op in p.stage3], ["WarpRectilinear2", "VignetteRadial"])
        self.assertIn("OpcodeList3: 1 fallback warp skipped after an optional WarpRectilinear2 (DNG skip rule)", p.notes)
        self.assertIn("OpcodeList3: 1 WarpRectilinear2 applied (lens distortion, higher order)", p.notes)

    def test_example_3_only_the_next_opcode(self):
        self.assertEqual(self.kinds([WR2_OPT, VIG, WR]), ["WarpRectilinear2", "VignetteRadial", "WarpRectilinear"])

    def test_required_wr2_does_not_skip(self):
        self.assertEqual(self.kinds([WR2, WR]), ["WarpRectilinear2", "WarpRectilinear"])

    def test_optional_then_rectilinear_skips_it(self):
        self.assertEqual(self.kinds([WR2_OPT, WR]), ["WarpRectilinear2"])

    def test_unreadable_wr2_keeps_the_fallback(self):
        broken = (do.WARP_RECTILINEAR_2, 1, warp2_params([plane(lo=0.9, hi=0.2)]))
        p = _plan([broken, WR])
        self.assertEqual([type(op).__name__ for op in p.stage3], ["WarpRectilinear"])
        self.assertTrue(any("WarpRectilinear2 unreadable and skipped" in n for n in p.notes))

    def test_full_quality_only_wr2_skipped_at_preview_keeps_the_fallback(self):
        # Optional and flagged full-quality-only (flag bit 1): a preview-quality render skips it, so the
        # fallback runs; a full-quality render applies it and the skip rule drops the fallback.
        flagged = (do.WARP_RECTILINEAR_2, 3, WR2_OPT[2])
        tag = {do.TAG_OPCODE_LIST_3: bytes(list_tag([flagged, WR], do.TAG_OPCODE_LIST_3)[2])}
        self.assertEqual([type(op).__name__ for op in do.plan(tag, {}, preview=True).stage3], ["WarpRectilinear"])
        self.assertEqual(self.kinds([flagged, WR]), ["WarpRectilinear2"])


class DevelopTests(unittest.TestCase):
    W, H = 48, 24

    def test_identity_warp_changes_nothing_and_is_reported(self):
        sensor = patch_sensor(self.W, self.H)
        plain = rd.develop(rd.parse_raw(make_dng(sensor, self.W, self.H)), rd.DevelopSettings(engine="python"))
        got = rd.develop(
            rd.parse_raw(make_dng(sensor, self.W, self.H, extra_raw_tags=[warp2_tag([IDENTITY])])),
            rd.DevelopSettings(engine="python"),
        )
        self.assertEqual(got[2].tobytes(), plain[2].tobytes())
        self.assertIn("OpcodeList3: 1 WarpRectilinear2 applied (lens distortion, higher order)", got[3].notes)

    def test_same_image_as_the_equivalent_warp_rectilinear(self):
        sensor = patch_sensor(self.W, self.H)
        k = (0.93, 0.04, 0.01, 0.002)
        old = make_dng(sensor, self.W, self.H, extra_raw_tags=[list_tag([(do.WARP_RECTILINEAR, 0, warp_params([k + (0, 0)]))], do.TAG_OPCODE_LIST_3)])
        new = make_dng(sensor, self.W, self.H, extra_raw_tags=[warp2_tag([plane((k[0], 0, k[1], 0, k[2], 0, k[3]))])])
        a = rd.develop(rd.parse_raw(old), rd.DevelopSettings(engine="python"))
        b = rd.develop(rd.parse_raw(new), rd.DevelopSettings(engine="python"))
        diff = max(abs(x - y) for x, y in zip(a[2].tobytes(), b[2].tobytes()))
        self.assertLessEqual(diff, 1)  # Horner on r vs on r^2: the last bit of a source point, at most one 8-bit step


@unittest.skipUnless(HAVE_NUMPY, "numpy not installed")
class EngineTests(unittest.TestCase):
    def test_numpy_gives_the_pure_bytes(self):
        rng = random.Random(17)
        for w, h in ((48, 12), (37, 11)):
            sensor = [max(0, min(4095, v + rng.randint(-500, 500))) for v in patch_sensor(w, h, gain=1.4)]
            for recip in (0, 1):
                terms = [
                    plane((0.95 + 0.05 * rng.random(), 0.01 * rng.random(), 0.03 * rng.random(), -0.004, 0.002), (0.001, -0.001), 0.05, 0.95)
                    for _ in range(3)
                ]
                blob = make_dng(sensor, w, h, extra_raw_tags=[warp2_tag(terms, 0.45, 0.55, recip)])
                raw = rd.parse_raw(blob)
                for half in (False, True):
                    with self.subTest(size=(w, h), half=half, reciprocal=recip):
                        py = rd.develop(raw, rd.DevelopSettings(engine="python", half=half))
                        npy = rd.develop(raw, rd.DevelopSettings(engine="numpy", half=half))
                        self.assertEqual(py[3].notes, npy[3].notes)
                        self.assertEqual(py[2].tobytes(), npy[2].tobytes())

    def test_warp_planes_matches_warp_rgb(self):
        import numpy as np

        rng = random.Random(4)
        w, h = 33, 21
        src = array("d", (rng.random() for _ in range(w * h * 3)))
        for terms, cx, cy, recip in CASES:
            wp = do.WarpRectilinear2((terms, plane((1.01, -0.02))), cx, cy, bool(recip))
            pure = do.warp_rgb([wp], src, w, h)
            npy = do.warp_planes([wp], np.frombuffer(src.tobytes(), dtype=np.float64).reshape(h, w, 3).copy(), band=5)
            self.assertEqual(npy.tobytes(), pure.tobytes())


if __name__ == "__main__":
    unittest.main()
