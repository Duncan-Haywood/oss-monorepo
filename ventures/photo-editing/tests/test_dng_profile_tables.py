"""Profile hue/saturation maps and look tables, in a DNG or a .dcp camera profile.

The table arithmetic is checked against a second implementation written here
from the stdlib's ``colorsys`` HSV conversion and explicit corner weights, so
the two share no code. Renders are checked against the no-table render pushed
through the same edit by hand, and the numpy engine against the pure-Python
one byte for byte.
"""

from __future__ import annotations

import colorsys
import random
import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from shootflow import dng_colour as dc
from shootflow import raw_develop as rd
from test_raw_develop import (
    CAMERA_MATRIX,
    PATCHES,
    _ifd_bytes,
    as_shot_neutral,
    make_dng,
    patch_sensor,
    read_pixel,
)

try:
    import numpy  # noqa: F401

    HAVE_NUMPY = True
except ImportError:
    HAVE_NUMPY = False

W, H = 8 * len(PATCHES), 8


def table(hd, sd, vd, cell):
    """Table data from ``cell(h_index, s_index, v_index) -> (shift, sat, val)``, value outermost."""

    data = []
    for v in range(vd):
        for h in range(hd):
            for s in range(sd):
                data.extend(cell(h, s, v))
    return data


def reference_apply(dims, data, srgb, rgb):
    """An independent HueSatMap: colorsys HSV and explicit trilinear weights."""

    hd, sd, vd = dims
    hh, s, v = colorsys.rgb_to_hsv(*rgb)  # hue in [0, 1)
    ve = dc.srgb_encode(v) if srgb else v
    hpos = hh * hd if hd > 1 else 0.0
    spos = s * (sd - 1)
    vpos = ve * (vd - 1) if vd > 1 else 0.0
    h0 = int(hpos) % hd
    s0 = min(int(spos), sd - 2)
    v0 = min(int(vpos), vd - 2) if vd > 1 else 0
    fh, fs, fv = hpos - int(hpos), spos - s0, vpos - v0
    if int(hpos) >= hd:  # hue exactly at the wrap
        fh = hpos - (hd - 1)
        h0 = hd - 1
    acc = [0.0, 0.0, 0.0]
    for dh, wh in ((0, 1 - fh), (1, fh)):
        for ds, ws in ((0, 1 - fs), (1, fs)):
            for dv, wv in (((0, 1 - fv), (1, fv)) if vd > 1 else ((0, 1.0),)):
                hi, si, vi = (h0 + dh) % hd, s0 + ds, v0 + dv
                base = ((vi * hd + hi) * sd + si) * 3
                for k in range(3):
                    acc[k] += wh * ws * wv * data[base + k]
    shift, sat, val = acc
    hh = (hh + shift / 360.0) % 1.0
    s = min(max(s * sat, 0.0), 1.0)
    if srgb:
        v = dc.srgb_decode(min(max(ve * val, 0.0), 1.0))
    else:
        v = min(max(v * val, 0.0), 1.0)
    return colorsys.hsv_to_rgb(hh, s, v)


class HueSatTableTests(unittest.TestCase):
    def test_hue_rotation_moves_red_to_yellow(self):
        t = dc.HueSatTable.from_tags((6, 2, 1), table(6, 2, 1, lambda h, s, v: (60.0, 1.0, 1.0)))
        r, g, b = t.apply(0.5, 0.1, 0.1)
        self.assertAlmostEqual(r, 0.5, places=12)
        self.assertAlmostEqual(g, 0.5, places=12)
        self.assertAlmostEqual(b, 0.1, places=12)

    def test_saturation_and_value_scales(self):
        t = dc.HueSatTable.from_tags((1, 2), table(1, 2, 1, lambda h, s, v: (0.0, 0.5, 1.5)))
        h0, s0, v0 = dc.rgb_to_hsv(0.4, 0.2, 0.1)
        h1, s1, v1 = dc.rgb_to_hsv(*t.apply(0.4, 0.2, 0.1))
        self.assertAlmostEqual(h1, h0, places=12)
        self.assertAlmostEqual(s1, s0 * 0.5, places=12)
        self.assertAlmostEqual(v1, min(1.0, v0 * 1.5), places=12)
        # value is pinned at 1
        self.assertAlmostEqual(max(t.apply(0.9, 0.5, 0.4)), 1.0, places=12)

    def test_greys_stay_grey_whatever_the_hue_shift(self):
        t = dc.HueSatTable.from_tags((90, 30, 1), table(90, 30, 1, lambda h, s, v: (h * 3.0 - 100, 1.3, 1.0)))
        for v in (0.0, 0.01, 0.5, 1.0):
            self.assertEqual(t.apply(v, v, v), (v, v, v))

    def test_hue_interpolates_across_the_wrap(self):
        # shift 0 at the last hue division, 30 at division 0: halfway between is 15.
        t = dc.HueSatTable.from_tags((6, 2), table(6, 2, 1, lambda h, s, v: (30.0 if h == 0 else 0.0, 1.0, 1.0)))
        h = 5.5  # halfway between division 5 (5.0) and the wrap to division 0 (6.0)
        shift, _, _ = t.lookup(h, 0.5, 0.5)
        self.assertAlmostEqual(shift, 15.0, places=12)
        shift, _, _ = t.lookup(0.5, 0.5, 0.5)
        self.assertAlmostEqual(shift, 15.0, places=12)

    def test_srgb_encoded_value_axis(self):
        # 3D table, two value divisions: shift 0 at encoded value 0, 40 at 1.
        t = dc.HueSatTable.from_tags((1, 2, 2), table(1, 2, 2, lambda h, s, v: (40.0 * v, 1.0, 1.0)), 1)
        lin = dc.srgb_decode(0.25)
        self.assertAlmostEqual(t.lookup(0.0, 0.5, dc.srgb_encode(lin))[0], 10.0, places=9)
        linear = dc.HueSatTable.from_tags((1, 2, 2), t.data, 0)
        self.assertAlmostEqual(linear.lookup(0.0, 0.5, lin)[0], 40.0 * lin, places=12)

    def test_matches_an_independent_implementation(self):
        rng = random.Random(7)
        for dims, srgb in (((90, 30, 1), False), ((6, 6, 3), False), ((36, 8, 16), True), ((1, 2, 1), False)):
            hd, sd, vd = dims
            data = table(hd, sd, vd, lambda h, s, v: (rng.uniform(-25, 25), rng.uniform(0.6, 1.4), rng.uniform(0.8, 1.2)))
            t = dc.HueSatTable.from_tags(dims if vd > 1 else dims[:2], data, 1 if srgb else 0)
            worst = 0.0
            for _ in range(3000):
                rgb = (rng.random(), rng.random(), rng.random())
                got = t.apply(*rgb)
                want = reference_apply(dims, data, srgb, rgb)
                worst = max(worst, max(abs(a - b) for a, b in zip(got, want)))
            self.assertLess(worst, 1e-9, msg=f"{dims} srgb={srgb}")

    def test_blend_and_bad_tables(self):
        a = dc.HueSatTable.from_tags((2, 2), table(2, 2, 1, lambda h, s, v: (10.0, 1.0, 1.0)))
        b = dc.HueSatTable.from_tags((2, 2), table(2, 2, 1, lambda h, s, v: (30.0, 2.0, 1.0)))
        mid = a.blend(b, 0.25)
        self.assertAlmostEqual(mid.data[0], 25.0)
        self.assertAlmostEqual(mid.data[1], 1.75)
        self.assertIs(a.blend(b, 1.0), a)
        self.assertIs(a.blend(b, 0.0), b)
        other = dc.HueSatTable.from_tags((3, 2), table(3, 2, 1, lambda h, s, v: (0.0, 1.0, 1.0)))
        self.assertIs(a.blend(other, 0.5), a)
        with self.assertRaises(dc.ColourError):
            dc.HueSatTable.from_tags((2, 1), [0.0, 1.0, 1.0] * 2)
        with self.assertRaises(dc.ColourError):
            dc.HueSatTable.from_tags((2, 2), [0.0, 1.0, 1.0] * 3)
        with self.assertRaises(dc.ColourError):
            dc.HueSatTable.from_tags((1, 2), [float("nan"), 1.0, 1.0, 0.0, 1.0, 1.0])


# ------------------------------------------------------------ renders

HSM_ROTATE = table(6, 2, 1, lambda h, s, v: (20.0, 1.0, 1.0))
LOOK_DESAT = table(4, 3, 4, lambda h, s, v: (0.0, 0.7, 1.0))
_SRGB_TO_PP = dc.inverse(rd._PROPHOTO_TO_SRGB)


def profile_tags(hsm=None, look=None, look_encoding=None, name=b"Test profile\0"):
    out = [(50936, 2, tuple(name))]
    if hsm is not None:
        out += [(50937, 4, (6, 2, 1)), (50938, 11, tuple(hsm))]
    if look is not None:
        out += [(50981, 4, (4, 3, 4)), (50982, 11, tuple(look))]
        if look_encoding is not None:
            out.append((51108, 4, (look_encoding,)))
    return out


def base_colour_tags():
    return [(50721, 10, CAMERA_MATRIX), (50778, 3, (21,)), (50728, 5, as_shot_neutral())]


def dng(extra=(), sensor=None):
    sensor = sensor or patch_sensor(W, H)
    return make_dng(sensor, W, H, colour_tags=base_colour_tags() + list(extra))


def make_dcp(entries) -> bytes:
    blob = bytearray(b"IIRC") + struct.pack("<I", 8)
    blob += _ifd_bytes(list(entries), 8)
    return bytes(blob)


def patches(blob, **settings):
    w, _h, px, report = rd.develop(rd.parse_raw(blob), rd.DevelopSettings(engine="python", **settings))
    return [read_pixel(w, px, i * 8 + 4, 4) for i in range(len(PATCHES))], report


def by_hand(rgb_srgb, edit):
    """sRGB -> ProPhoto -> ``edit`` -> sRGB, all linear."""

    pp = dc.apply(_SRGB_TO_PP, rgb_srgb)
    pp = tuple(min(max(c, 0.0), 1.0) for c in pp)
    return dc.apply(rd._PROPHOTO_TO_SRGB, edit(pp))


class ProfileRenderTests(unittest.TestCase):
    def assertClose(self, got, want, tol):
        for g, w in zip(got, want):
            for a, b in zip(g, w):
                self.assertAlmostEqual(a, b, delta=tol, msg=f"got {g}, want {w}")

    def test_embedded_hue_sat_map_rotates_hues(self):
        plain, _ = patches(dng())
        got, report = patches(dng(profile_tags(hsm=HSM_ROTATE)))

        def rotate(pp):
            h, s, v = colorsys.rgb_to_hsv(*pp)
            return colorsys.hsv_to_rgb((h + 20.0 / 360.0) % 1.0, s, v)

        want = [by_hand(p, rotate) for p in plain]
        self.assertClose(got, want, 0.004)
        self.assertEqual(report.profile, "Test profile: HueSatMap 6x2x1")
        self.assertGreater(max(abs(a - b) for g, p in zip(got, plain) for a, b in zip(g, p)), 0.02)
        # the grey patch stays grey
        self.assertClose([got[0]], [plain[0]], 0.002)

    def test_look_table_after_exposure(self):
        plain, _ = patches(dng())
        got, report = patches(dng(profile_tags(look=LOOK_DESAT, look_encoding=1)))

        def desat(pp):
            h, s, v = colorsys.rgb_to_hsv(*pp)
            return colorsys.hsv_to_rgb(h, s * 0.7, v)

        self.assertClose(got, [by_hand(p, desat) for p in plain], 0.004)
        self.assertIn("LookTable 4x3x4", report.profile)

    def test_identity_tables_change_nothing(self):
        plain, _ = patches(dng())
        ident = table(6, 2, 1, lambda h, s, v: (0.0, 1.0, 1.0))
        got, report = patches(dng(profile_tags(hsm=ident)))
        self.assertEqual(got, plain)
        self.assertTrue(report.profile.endswith("(identity)"))

    def test_tables_off(self):
        plain, _ = patches(dng())
        got, report = patches(dng(profile_tags(hsm=HSM_ROTATE)), profile_tables=False)
        self.assertEqual(got, plain)
        self.assertIn("tables off", report.profile)

    def test_dcp_equals_the_same_tags_embedded(self):
        embedded, rep_e = patches(dng(profile_tags(hsm=HSM_ROTATE, look=LOOK_DESAT)))
        dcp_blob = make_dcp(
            [(50708, 2, tuple(b"Test Camera\0")), (50721, 10, CAMERA_MATRIX), (50778, 3, (21,))]
            + profile_tags(hsm=HSM_ROTATE, look=LOOK_DESAT)
        )
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "Test Camera.dcp"
            path.write_bytes(dcp_blob)
            prof = rd.read_dcp(path)
            # the DNG's own profile has no tables; the DCP brings them
            got, rep_d = patches(dng(), dcp=prof)
            self.assertEqual(got, embedded)
            self.assertEqual(rep_d.profile, rep_e.profile)
            # a DCP for another camera still renders, with a note
            other = dng([(50708, 2, tuple(b"Other Camera\0"))])
            _, rep_o = patches(other, dcp=prof)
            self.assertTrue(any("is for 'Test Camera'" in n for n in rep_o.notes), rep_o.notes)
            with self.assertRaises(rd.DevelopError):
                rd.develop(rd.parse_raw(dng()), rd.DevelopSettings(colour="dcraw", dcp=prof))
            bad = Path(tmp) / "x.dcp"
            bad.write_bytes(make_dng(patch_sensor(4, 4), 4, 4))
            with self.assertRaises(rd.DevelopError):
                rd.read_dcp(bad)

    def test_bad_table_is_skipped_with_a_note(self):
        tags = [(50936, 2, tuple(b"Broken\0")), (50937, 4, (6, 2, 1)), (50938, 11, (0.0, 1.0, 1.0) * 5)]
        plain, _ = patches(dng())
        got, report = patches(dng(tags))
        self.assertEqual(got, plain)
        self.assertTrue(any("ProfileHueSatMapData1 ignored" in n for n in report.notes), report.notes)

    def test_two_maps_blend_for_the_as_shot_light(self):
        # Map 1 (Standard A) shifts hue by 40, map 2 (D65) by 0; a D65 shot uses map 2 alone.
        m1 = table(6, 2, 1, lambda h, s, v: (40.0, 1.0, 1.0))
        m2 = table(6, 2, 1, lambda h, s, v: (0.0, 1.0, 1.0))
        tags = [
            (50722, 10, CAMERA_MATRIX), (50779, 3, (21,)),
            (50937, 4, (6, 2, 1)), (50938, 11, tuple(m1)), (50939, 11, tuple(m2)),
        ]
        colour = [(50721, 10, CAMERA_MATRIX), (50778, 3, (17,)), (50728, 5, as_shot_neutral())]
        blob = make_dng(patch_sensor(W, H), W, H, colour_tags=colour + tags)
        _w, _h, _px, report = rd.develop(rd.parse_raw(blob), rd.DevelopSettings(engine="python"))
        raw = rd.parse_raw(blob)
        prof = rd._profile(raw.ifd0, raw.ifd)
        hsm = prof.hue_sat_map_at(report.cct)
        g = prof.weight(report.cct)
        self.assertAlmostEqual(hsm.data[0], 40.0 * g, places=9)


@unittest.skipUnless(HAVE_NUMPY, "numpy not installed")
class ProfileEngineTests(unittest.TestCase):
    def test_numpy_engine_same_bytes(self):
        rng = random.Random(3)
        sensor = [max(0, min(4095, v + rng.randint(-300, 300))) for v in patch_sensor(W, H)]
        cases = [
            {"extra": profile_tags(hsm=HSM_ROTATE)},
            {"extra": profile_tags(look=LOOK_DESAT, look_encoding=1)},
            {"extra": profile_tags(hsm=table(6, 2, 1, lambda h, s, v: (rng.uniform(-30, 30), 1.2, 0.9)), look=LOOK_DESAT)},
        ]
        for case in cases:
            for settings in ({}, {"half": True}, {"exposure_ev": 1.3}, {"exposure_ev": -0.7}):
                raw = rd.parse_raw(dng(case["extra"], sensor))
                py = rd.develop(raw, rd.DevelopSettings(engine="python", **settings))
                npy = rd.develop(raw, rd.DevelopSettings(engine="numpy", **settings))
                self.assertEqual(py[:2], npy[:2])
                self.assertEqual(py[2].tobytes(), npy[2].tobytes(), msg=str(settings))
                self.assertEqual(py[3].profile, npy[3].profile)


if __name__ == "__main__":
    unittest.main()
