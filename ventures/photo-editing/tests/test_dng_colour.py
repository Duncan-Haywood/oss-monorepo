"""The DNG colour model: white from the neutral, matrix blending, ForwardMatrix.

Every DNG here is written by the test from a known scene: a camera whose true
response is a 3x3 map of XYZ that changes with the light (one matrix under
Standard Illuminant A, another under D65), photographing sRGB patches lit by
that light. A reader that follows the DNG model should give the patches back
as they would look adapted to the sRGB white.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from shootflow import dng_colour as dc  # noqa: E402
from shootflow import raw_develop as rd  # noqa: E402
from test_raw_develop import CAMERA_MATRIX, PATCHES, SRGB_TO_XYZ, make_dng, read_pixel  # noqa: E402

# Camera under D65 is the suite's usual matrix; under A it answers differently
# (both written with four decimals, as the test DNG writer stores them).
CM_D65 = CAMERA_MATRIX
CM_A = (0.6461, -0.0907, -0.0882, -0.8300, 1.5640, 0.2933, -0.1150, 0.1478, 0.7310)
A_XY = (0.44757, 0.40745)
SRGB_WHITE = rd._SRGB_WHITE_XY


def m3(values):
    return dc.as_matrix(values)


def scene_camera(cm, light_xy, rgb):
    """Camera response to sRGB colour ``rgb`` (D65-referred) seen under ``light_xy``."""

    xyz_d65 = dc.apply(SRGB_TO_XYZ, rgb)
    xyz = dc.apply(dc.bradford(SRGB_WHITE, light_xy), xyz_d65)
    return dc.apply(m3(cm), xyz)


def sensor_for(cm, light_xy, width, height, black=256, white=4095, gain=1.0, balance=(1.0, 1.0, 1.0)):
    white_cam = scene_camera(cm, light_xy, (1.0, 1.0, 1.0))
    # A white that just reaches the white level in its strongest channel.
    top = max(white_cam[i] * balance[i] for i in range(3))
    span = white - black
    out = []
    for y in range(height):
        for x in range(width):
            rgb = PATCHES[(x // 8) % len(PATCHES)]
            cam = scene_camera(cm, light_xy, tuple(v * gain for v in rgb))
            c = (0, 1, 1, 2)[(y % 2) * 2 + (x % 2)]
            v = cam[c] * balance[c] / top
            out.append(max(0, min(white, int(round(black + v * span)))))
    n = tuple(white_cam[i] * balance[i] for i in range(3))
    return out, tuple(v / max(n) for v in n)


def tags(cm1, cm2, ill1=17, ill2=21, neutral=None, white_xy=None, extra=()):
    out = [(50721, 10, cm1), (50778, 3, (ill1,))]
    if cm2 is not None:
        out += [(50722, 10, cm2), (50779, 3, (ill2,))]
    if neutral is not None:
        out.append((50728, 5, neutral))
    if white_xy is not None:
        out.append((50729, 5, white_xy))
    return out + list(extra)


def colours(blob, **settings):
    w, h, px, report = rd.develop(rd.parse_raw(blob), rd.DevelopSettings(**settings))
    return [read_pixel(w, px, i * 8 + 4, 4) for i in range(len(PATCHES))], report


def worst(got, want):
    return max(abs(g - v) for gs, ws in zip(got, want) for g, v in zip(gs, ws))


def forward_matrix(cm, light_xy):
    """The ForwardMatrix a profile maker would fit for camera ``cm`` under ``light_xy``."""

    n = scene_camera(cm, light_xy, (1.0, 1.0, 1.0))
    cam_to_xyz = dc.matmul(dc.bradford(light_xy, dc.D50_XY), dc.inverse(m3(cm)))
    fm = dc.matmul(cam_to_xyz, dc.diag(n))
    y = sum(fm[1])
    return tuple(round(v / y, 4) for row in fm for v in row)


W, H = 8 * len(PATCHES), 8


class TemperatureTests(unittest.TestCase):
    def test_cct_of_standard_whites(self):
        for xy, want in (((0.31271, 0.32902), 6504), ((0.44757, 0.40745), 2856), ((0.34567, 0.35850), 5003)):
            self.assertAlmostEqual(dc.xy_to_cct(xy), want, delta=6, msg=xy)

    def test_cct_is_monotone_along_the_locus(self):
        # warmer (larger x) whites have lower temperatures
        temps = [dc.xy_to_cct((x, 0.4 if x > 0.4 else x * 0.9 + 0.04)) for x in (0.30, 0.33, 0.36, 0.40, 0.45)]
        self.assertEqual(temps, sorted(temps, reverse=True))

    def test_weights_interpolate_in_mired_and_clamp(self):
        p = dc.Profile(m3(CM_A), m3(CM_D65), 17, 21)
        self.assertEqual(p.weight(2000), 1.0)
        self.assertEqual(p.weight(2856), 1.0)
        self.assertEqual(p.weight(6504), 0.0)
        self.assertEqual(p.weight(9000), 0.0)
        mid = 2.0 / (1 / 2856 + 1 / 6504)
        self.assertAlmostEqual(p.weight(mid), 0.5, places=9)
        # the illuminants may come in either order
        q = dc.Profile(m3(CM_D65), m3(CM_A), 21, 17)
        self.assertAlmostEqual(q.weight(4000), 1 - p.weight(4000), places=12)

    def test_neutral_and_white_round_trip(self):
        p = dc.Profile(m3(CM_A), m3(CM_D65), 17, 21)
        for xy in (A_XY, (0.3805, 0.3768), (0.3457, 0.3585), SRGB_WHITE, (0.2990, 0.3149)):
            n = p.xy_to_neutral(xy)
            back = p.neutral_to_xy(n)
            self.assertAlmostEqual(back[0], xy[0], places=7)
            self.assertAlmostEqual(back[1], xy[1], places=7)


class DevelopTests(unittest.TestCase):
    def test_tungsten_scene_uses_the_tungsten_matrix(self):
        sensor, neutral = sensor_for(CM_A, A_XY, W, H)
        blob = make_dng(sensor, W, H, colour_tags=tags(CM_A, CM_D65, neutral=neutral))
        got, report = colours(blob)
        self.assertLess(worst(got, PATCHES), 0.01)
        self.assertTrue(report.matrix.startswith("ColorMatrix1"), report.matrix)
        self.assertAlmostEqual(report.cct, 2856, delta=15)
        # The one-matrix camera-space method misses the same patches by more.
        old, old_report = colours(blob, colour="dcraw")
        self.assertEqual(old_report.matrix, "ColorMatrix2")
        self.assertGreater(worst(old, PATCHES), 0.03)

    def test_daylight_scene_uses_the_daylight_matrix(self):
        sensor, neutral = sensor_for(CM_D65, SRGB_WHITE, W, H)
        blob = make_dng(sensor, W, H, colour_tags=tags(CM_A, CM_D65, neutral=neutral))
        got, report = colours(blob)
        self.assertLess(worst(got, PATCHES), 0.01)
        self.assertTrue(report.matrix.startswith("ColorMatrix2"), report.matrix)

    def test_greys_stay_grey_at_any_white(self):
        p = dc.Profile(m3(CM_A), m3(CM_D65), 17, 21)
        for xy in ((0.4100, 0.3950), (0.3700, 0.3700), (0.3200, 0.3350)):
            neutral = p.xy_to_neutral(xy)
            sensor = [256 + int(round(0.5 * neutral[(0, 1, 1, 2)[(y % 2) * 2 + x % 2]] * 3839)) for y in range(8) for x in range(8)]
            blob = make_dng(sensor, 8, 8, colour_tags=tags(CM_A, CM_D65, neutral=tuple(round(v, 4) for v in neutral)))
            w, h, px, report = rd.develop(rd.parse_raw(blob))
            r, g, b = read_pixel(w, px, 4, 4)
            self.assertAlmostEqual(r, g, delta=0.003)
            self.assertAlmostEqual(b, g, delta=0.003)
            self.assertIn(" at ", report.matrix)

    def test_forward_matrix_is_used_when_present(self):
        # The colour matrices here are a crude single daylight fit; the
        # forward matrix carries the camera's real response under tungsten.
        sensor, neutral = sensor_for(CM_A, A_XY, W, H)
        fm = forward_matrix(CM_A, A_XY)
        crude = tags(CM_D65, CM_D65, neutral=neutral)
        with_fm = make_dng(sensor, W, H, colour_tags=crude + [(50964, 10, fm), (50965, 10, fm)])
        got, report = colours(with_fm)
        self.assertTrue(report.matrix.startswith("ForwardMatrix"), report.matrix)
        self.assertLess(worst(got, PATCHES), 0.01)
        without, _ = colours(make_dng(sensor, W, H, colour_tags=crude))
        self.assertGreater(worst(without, PATCHES), 0.015)

    def test_as_shot_white_xy_matches_the_neutral(self):
        sensor, neutral = sensor_for(CM_A, A_XY, W, H)
        by_neutral, _ = colours(make_dng(sensor, W, H, colour_tags=tags(CM_A, CM_D65, neutral=neutral)))
        by_xy, report = colours(make_dng(sensor, W, H, colour_tags=tags(CM_A, CM_D65, white_xy=(0.4476, 0.4075))))
        self.assertLess(worst(by_xy, by_neutral), 0.003)
        self.assertEqual(report.white_xy, (0.4476, 0.4075))
        # dcraw mode has no use for an xy white and says so
        _, old = colours(make_dng(sensor, W, H, colour_tags=tags(CM_A, CM_D65, white_xy=A_XY)), colour="dcraw")
        self.assertTrue(any("AsShotWhiteXY" in n for n in old.notes))

    def test_analog_balance_is_taken_out(self):
        ab = (1.25, 1.0, 0.8)
        sensor, neutral = sensor_for(CM_A, A_XY, W, H, balance=ab)
        blob = make_dng(sensor, W, H, colour_tags=tags(CM_A, CM_D65, neutral=neutral, extra=[(50727, 5, ab)]))
        got, _ = colours(blob)
        self.assertLess(worst(got, PATCHES), 0.01)

    def test_camera_calibration_only_with_matching_signature(self):
        cc = (1.1, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.9)
        # This unit's sensor reads red 10% high and blue 10% low: CC * CM.
        unit = tuple(v for row in dc.matmul(m3(cc), m3(CM_A)) for v in row)
        sensor, neutral = sensor_for(unit, A_XY, W, H)
        cc_tags = [(50723, 10, cc), (50724, 10, cc)]
        right, _ = colours(make_dng(sensor, W, H, colour_tags=tags(CM_A, CM_D65, neutral=neutral, extra=cc_tags)))
        self.assertLess(worst(right, PATCHES), 0.01)
        mismatch = cc_tags + [(50931, 2, tuple(b"unit 1\0")), (50932, 2, tuple(b"unit 2\0"))]
        ignored, report = colours(make_dng(sensor, W, H, colour_tags=tags(CM_A, CM_D65, neutral=neutral, extra=mismatch)))
        plain, _ = colours(make_dng(sensor, W, H, colour_tags=tags(CM_A, CM_D65, neutral=neutral)))
        self.assertEqual(ignored, plain)
        self.assertTrue(any("CameraCalibration ignored" in n for n in report.notes))

    def test_single_matrix_and_unknown_illuminants(self):
        sensor, neutral = sensor_for(CM_D65, SRGB_WHITE, W, H)
        got, report = colours(make_dng(sensor, W, H, colour_tags=tags(CM_D65, None, ill1=21, neutral=neutral)))
        self.assertEqual(report.matrix, "ColorMatrix1 (D65)")
        self.assertLess(worst(got, PATCHES), 0.01)
        _, report = colours(make_dng(sensor, W, H, colour_tags=tags(CM_A, CM_D65, ill1=0, ill2=0, neutral=neutral)))
        self.assertEqual(report.matrix, "ColorMatrix1")
        self.assertTrue(any("illuminants unknown" in n for n in report.notes))

    def test_user_white_balance_sets_the_white(self):
        sensor, neutral = sensor_for(CM_A, A_XY, W, H)
        blob = make_dng(sensor, W, H, colour_tags=tags(CM_A, CM_D65, neutral=(1.0, 1.0, 1.0)))
        wb = tuple(1.0 / v for v in neutral)
        got, report = colours(blob, white_balance=wb)
        self.assertLess(worst(got, PATCHES), 0.01)
        self.assertAlmostEqual(report.cct, 2856, delta=15)

    def test_unknown_colour_model_is_refused(self):
        sensor, neutral = sensor_for(CM_A, A_XY, 8, 8)
        with self.assertRaises(rd.DevelopError):
            colours(make_dng(sensor, 8, 8, colour_tags=tags(CM_A, CM_D65, neutral=neutral)), colour="lightroom")


if __name__ == "__main__":
    unittest.main()
