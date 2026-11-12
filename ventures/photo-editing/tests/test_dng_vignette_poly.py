"""Tests for ``FixVignetteRadial`` and ``MapPolynomial`` in ``shootflow.dng_opcodes`` and ``develop``.

Both opcodes have closed-form answers. The vignette gain at a pixel is
``1 + k0 r^2 + ... + k4 r^10``, with ``r`` the distance from the optical centre
over the distance to the farthest corner; the polynomial maps a value ``x`` to
``c0 + c1 x + ... + cd x^d`` pinned to 0..1. The tests write both out here,
independently of the module, and check it against them: on a raw file whose
sensor was darkened by the inverse of the vignette (or halved, for the
polynomial ``2x``) the develop must give the undarkened scene back, and in
stage 3 every output value must equal the formula at that pixel.

No camera file carrying either opcode is in the evaluation set yet; that check
is the next item (``eval/vignette-polynomial-2026-11-12.md``).
"""

from __future__ import annotations

import math
import random
import struct
import unittest
from array import array

from shootflow import dng_opcodes as do
from shootflow import raw_develop as rd
from test_dng_opcodes import HAVE_NUMPY, list_tag, shaded
from test_dng_warp import warp_params
from test_raw_develop import make_dng, patch_sensor

W, H, BLACK, WHITE = 48, 16, 256, 4095


def vignette_params(k, cx=0.5, cy=0.5):
    return struct.pack(">7d", *k, cx, cy)


def poly_params(coeffs, *, top=0, left=0, bottom=1 << 20, right=1 << 20, plane=0, planes=1, row_pitch=1, col_pitch=1):
    head = struct.pack(">9I", top, left, bottom, right, plane, planes, row_pitch, col_pitch, len(coeffs) - 1)
    return head + struct.pack(f">{len(coeffs)}d", *coeffs)


def spec_vignette(k, cx, cy, x, y, w, h):
    """The specification's gain at pixel (x, y), written out independently of the module."""

    ox, oy = cx * w, cy * h
    m = max(math.sqrt((px - ox) ** 2 + (py - oy) ** 2) for px in (0, w) for py in (0, h))
    r = math.sqrt((x + 0.5 - ox) ** 2 + (y + 0.5 - oy) ** 2) / m
    return 1 + sum(k[i] * r ** (2 * (i + 1)) for i in range(5))


def spec_poly(coeffs, v):
    return min(1.0, max(0.0, sum(c * v**i for i, c in enumerate(coeffs))))


def develop(blob, **settings):
    return rd.develop(rd.parse_raw(blob), rd.DevelopSettings(**settings))


class ParseTests(unittest.TestCase):
    def test_round_trip(self):
        ops = do.parse_list(
            list_tag([(3, 1, vignette_params((0.1, 0.2, 0.3, 0.4, 0.5), 0.4, 0.6)), (8, 0, poly_params((0.0, 2.0, -1.0), plane=1, planes=2, row_pitch=2))])[2]
        )
        self.assertEqual([op.name for op in ops], ["FixVignetteRadial", "MapPolynomial"])
        vg = do.parse_vignette_radial(ops[0])
        self.assertEqual((vg.k, vg.cx, vg.cy), ((0.1, 0.2, 0.3, 0.4, 0.5), 0.4, 0.6))
        mp = do.parse_map_polynomial(ops[1])
        self.assertEqual((mp.coeffs, mp.plane, mp.planes, mp.row_pitch), ((0.0, 2.0, -1.0), 1, 2, 2))

    def test_bad_parameters_raise(self):
        with self.assertRaises(do.OpcodeError):
            do.parse_vignette_radial(do.Opcode(3, 0, 0, vignette_params((0,) * 5)[:-1]))
        with self.assertRaises(do.OpcodeError):
            do.parse_vignette_radial(do.Opcode(3, 0, 0, vignette_params((0,) * 5, 1.5, 0.5)))
        with self.assertRaises(do.OpcodeError):
            do.parse_map_polynomial(do.Opcode(8, 0, 0, poly_params((0.0,) * 10)))  # degree 9
        with self.assertRaises(do.OpcodeError):
            do.parse_map_polynomial(do.Opcode(8, 0, 0, poly_params((0.0, 1.0))[:-4]))
        with self.assertRaises(do.OpcodeError):
            do.parse_map_polynomial(do.Opcode(8, 0, 0, poly_params((0.0, 1.0), bottom=0)))

    def test_plan_orders_and_names_them(self):
        tags = [
            list_tag([(3, 1, vignette_params((0.2, 0, 0, 0, 0))), (9, 1, b"\0" * 10), (8, 1, poly_params((0.0, 1.0)))]),
            list_tag([(8, 0, poly_params((0.0, 1.0))), (1, 0, warp_params([(1, 0, 0, 0, 0, 0)])), (3, 0, vignette_params((0.1, 0, 0, 0, 0)))], do.TAG_OPCODE_LIST_3),
            list_tag([(8, 0, poly_params((0.0, 1.0)))], do.TAG_OPCODE_LIST_1),
        ]
        ifd = {t: v for t, _ty, v in tags}
        plan = do.plan(ifd, {})
        self.assertEqual([type(op).__name__ for op in plan.stage2], ["VignetteRadial", "MapPolynomial"])
        self.assertEqual([type(op).__name__ for op in plan.stage3], ["MapPolynomial", "WarpRectilinear", "VignetteRadial"])
        self.assertIn("OpcodeList2: 1 FixVignetteRadial applied (lens vignetting)", plan.notes)
        self.assertIn("OpcodeList3: 1 MapPolynomial applied (value mapping)", plan.notes)
        self.assertIn("OpcodeList1: 1 x MapPolynomial (required) not applied", plan.notes)
        self.assertTrue(any("GainMap unreadable" in n for n in plan.notes))


class FormulaTests(unittest.TestCase):
    def test_vignette_gain_is_the_spec_formula(self):
        rng = random.Random(5)
        for _ in range(20):
            k = tuple(rng.uniform(-0.5, 1.0) for _ in range(5))
            cx, cy, w, h = rng.random(), rng.random(), rng.randint(3, 60), rng.randint(3, 60)
            vg = do.VignetteRadial(k, cx, cy)
            for _ in range(10):
                x, y = rng.randrange(w), rng.randrange(h)
                self.assertAlmostEqual(do.vignette_gain(vg, x, y, w, h), spec_vignette(k, cx, cy, x, y, w, h), places=12)

    def test_corner_gain_is_one_plus_the_terms(self):
        # A centre at a corner puts the farthest corner at r = 1; pixel centres
        # stop half a pixel short, so take a large image.
        k = (0.3, 0.2, 0.1, 0.05, 0.01)
        vg = do.VignetteRadial(k, 0.0, 0.0)
        self.assertAlmostEqual(do.vignette_gain(vg, 9999, 9999, 10000, 10000), 1 + sum(k), places=3)

    def test_stage3_vignette_and_polynomial_hit_the_closed_form(self):
        rng = random.Random(9)
        w, h = 17, 9
        scale = (2.1, 1.0, 1.6)
        src = array("d", (rng.random() * scale[i % 3] for i in range(w * h * 3)))
        k, cx, cy = (0.4, -0.1, 0.05, 0.0, 0.0), 0.3, 0.7
        coeffs = (0.02, 1.3, -0.4, 0.1)
        ops = [do.VignetteRadial(k, cx, cy), do.MapPolynomial(0, 0, 1 << 20, 1 << 20, 0, 3, 1, 1, coeffs)]
        got = do.run_stage3_rgb(ops, array("d", src), w, h, scale)
        for y in range(h):
            for x in range(w):
                g = spec_vignette(k, cx, cy, x, y, w, h)
                for p in range(3):
                    v = min(src[(y * w + x) * 3 + p] * g, scale[p])
                    want = spec_poly(coeffs, v / scale[p]) * scale[p]
                    self.assertAlmostEqual(got[(y * w + x) * 3 + p], want, places=12)

    def test_polynomial_area_plane_and_pitch(self):
        w, h = 6, 5
        src = array("d", [0.25] * (w * h * 3))
        mp = do.MapPolynomial(1, 2, 4, 6, 1, 1, 2, 3, (0.0, 2.0))  # rows 1, 3; cols 2, 5; green only
        got = do.run_stage3_rgb([mp], array("d", src), w, h)
        for y in range(h):
            for x in range(w):
                for p in range(3):
                    hit = p == 1 and y in (1, 3) and x in (2, 5)
                    self.assertEqual(got[(y * w + x) * 3 + p], 0.5 if hit else 0.25, (x, y, p))

    def test_polynomial_pins_to_zero_and_one(self):
        self.assertEqual(do._poly((-0.5, 1.0), 0.2), 0.0)
        self.assertEqual(do._poly((0.0, 3.0), 0.5), 1.0)
        self.assertEqual(do._poly((0.75,), 0.1), 0.75)


class DevelopTests(unittest.TestCase):
    def scene(self):
        return patch_sensor(W, H, black=BLACK, white=WHITE)

    def test_vignette_in_list2_restores_a_darkened_scene(self):
        k, cx, cy = (0.6, 0.3, 0.0, 0.0, 0.0), 0.45, 0.55
        sensor = self.scene()
        dark = shaded(sensor, W, BLACK, lambda x, y: 1.0 / spec_vignette(k, cx, cy, x, y, W, H))
        tag = list_tag([(3, 1, vignette_params(k, cx, cy))])
        want = develop(make_dng(sensor, W, H), engine="python")
        got = develop(make_dng(dark, W, H, extra_raw_tags=[tag]), engine="python")
        off = develop(make_dng(dark, W, H, extra_raw_tags=[tag]), engine="python", opcodes=False)
        self.assertIn("OpcodeList2: 1 FixVignetteRadial applied (lens vignetting)", got[3].notes)
        worst = max(abs(a - b) for a, b in zip(got[2], want[2]))
        # Rounding of the darkened sensels, scaled by the gain (at most 1.9
        # here), on the steep dark end of the sRGB curve.
        self.assertLessEqual(worst, 3 * 257)
        self.assertGreater(max(abs(a - b) for a, b in zip(off[2], want[2])), 20 * 257)

    def test_polynomial_in_list2_on_one_bayer_position(self):
        # Red sensels at half signal; a MapPolynomial 2x on plane 0, pitch 2,
        # starting at (0, 0) restores them and leaves the others alone.
        sensor = self.scene()
        dark = shaded(sensor, W, BLACK, lambda x, y: 0.5 if (y % 2, x % 2) == (0, 0) else 1.0)
        tag = list_tag([(8, 1, poly_params((0.0, 2.0), row_pitch=2, col_pitch=2))])
        want = develop(make_dng(sensor, W, H), engine="python")
        got = develop(make_dng(dark, W, H, extra_raw_tags=[tag]), engine="python")
        self.assertIn("OpcodeList2: 1 MapPolynomial applied (value mapping)", got[3].notes)
        self.assertLessEqual(max(abs(a - b) for a, b in zip(got[2], want[2])), 3 * 257)

    def test_identity_list3_ops_change_nothing(self):
        sensor = self.scene()
        plain = develop(make_dng(sensor, W, H), engine="python")
        tag = list_tag([(3, 1, vignette_params((0,) * 5)), (8, 1, poly_params((0.0, 1.0)))], do.TAG_OPCODE_LIST_3)
        got = develop(make_dng(sensor, W, H, extra_raw_tags=[tag]), engine="python")
        # Dividing by the white-balance scale and multiplying back can move a
        # value by an ulp; the encoded bytes stay within one 16-bit step.
        self.assertLessEqual(max(abs(a - b) for a, b in zip(got[2], plain[2])), 1)


@unittest.skipUnless(HAVE_NUMPY, "numpy not installed")
class EngineTests(unittest.TestCase):
    def test_numpy_gives_the_pure_bytes(self):
        rng = random.Random(17)
        list2 = list_tag(
            [
                (3, 1, vignette_params((0.5, 0.2, 0.0, 0.0, 0.0), 0.4, 0.6)),
                (8, 1, poly_params((0.01, 1.4, -0.3), plane=0, planes=1, row_pitch=2, col_pitch=2)),
            ]
        )
        list3 = list_tag(
            [
                (8, 1, poly_params((0.0, 1.1, -0.1), plane=1, planes=2)),
                (1, 0, warp_params([(0.98, 0.02, 0, 0, 0, 0)], 0.5, 0.5)),
                (3, 1, vignette_params((0.2, 0.0, 0.0, 0.0, 0.1), 0.55, 0.45)),
            ],
            do.TAG_OPCODE_LIST_3,
        )
        for w, h in ((48, 12), (37, 11)):
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

        rng = random.Random(4)
        w, h = 23, 13
        scale = (1.9, 1.0, 1.4)
        src = array("d", (rng.random() * 2 for _ in range(w * h * 3)))
        ops = [
            do.VignetteRadial((0.3, 0.1, 0.0, 0.02, 0.0), 0.6, 0.4),
            do.MapPolynomial(1, 2, 12, 20, 0, 2, 2, 3, (0.0, 1.5, -0.5)),
            do.WarpRectilinear(((1.01, -0.02, 0, 0, 0, 0),), 0.5, 0.5),
        ]
        pure = do.run_stage3_rgb(ops, array("d", src), w, h, scale)
        npy = do.run_stage3_planes(ops, np.frombuffer(src.tobytes(), dtype=np.float64).reshape(h, w, 3).copy(), scale)
        self.assertEqual(npy.tobytes(), pure.tobytes())


if __name__ == "__main__":
    unittest.main()
