"""DNG 1.6 triple-illuminant profiles and IlluminantData.

A DNG 1.6 profile may carry a third ColorMatrix (and CameraCalibration,
ForwardMatrix, ProfileHueSatMapData) for a third calibration illuminant,
typically a fluorescent or LED light that lies off the line between tungsten
and daylight. The tests write DNGs from a known scene, as test_dng_colour does:
a camera whose response under the fluorescent light is its own 3x3 map, which
no blend of the tungsten and daylight matrices reproduces.

The temperature/tint reference values were printed by colour-science 0.4.7
(``uv_to_CCT_Robertson1968``), an implementation independent of this one;
the DNG tint is 3000 times its Duv.
"""

from __future__ import annotations

import math
import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from shootflow import dng_colour as dc  # noqa: E402
from shootflow import raw_develop as rd  # noqa: E402
from test_dng_colour import CM_A, CM_D65, PATCHES, colours, m3, sensor_for, tags, worst  # noqa: E402
from test_raw_develop import make_dng  # noqa: E402

# The camera under a cool white fluorescent lamp (CIE F2): a response with a
# weaker red and a stronger green-blue cross-talk than either A or D65 gives.
CM_F2 = (0.7600, -0.2300, -0.0500, -0.4000, 1.2800, 0.1300, -0.0200, 0.2100, 0.5900)
F2_XY = dc.illuminant_xy(2)
W, H = 8 * len(PATCHES), 8


def triple(**kw):
    base = dict(
        color_matrix_1=m3(CM_A),
        color_matrix_2=m3(CM_D65),
        illuminant_1=17,
        illuminant_2=21,
        color_matrix_3=m3(CM_F2),
        illuminant_3=2,
    )
    base.update(kw)
    return dc.Profile(**base)


def illuminant_data_xy(x, y, end="<"):
    return tuple(struct.pack(end + "H", 0) + struct.pack(end + "II", round(x * 1e6), 1_000_000)
                 + struct.pack(end + "II", round(y * 1e6), 1_000_000))


def illuminant_data_spectrum(first, step, samples, end="<"):
    out = struct.pack(end + "HI", 1, len(samples))
    out += struct.pack(end + "II", int(first * 10), 10) + struct.pack(end + "II", int(step * 10), 10)
    for v in samples:
        out += struct.pack(end + "II", int(round(v * 1e6)), 1_000_000)
    return tuple(out)


def planck(nm, kelvin, c2=1.4388e-2):
    # Illuminant A is the Planckian radiator at 2856 K with c2 = 1.4388e-2 m K.
    lam = nm * 1e-9
    return 1.0 / (lam**5 * (math.exp(c2 / (lam * kelvin)) - 1.0))


class TemperatureTintTests(unittest.TestCase):
    def test_against_colour_science(self):
        # (xy, CCT, Duv) from colour-science 0.4.7's Robertson (1968).
        for xy, cct, duv in (
            ((0.3127, 0.329), 6503.70718, 3.25666337e-03),
            ((0.33, 0.36), 5600.54382, 1.05167328e-02),
            ((0.45, 0.39), 2675.81518, -7.00269902e-03),
            ((0.4476, 0.4074), 2854.88840, -1.89592316e-05),
        ):
            t, tint = dc.temperature_tint(xy)
            self.assertAlmostEqual(t, cct, delta=0.01, msg=xy)
            self.assertAlmostEqual(tint, 3000.0 * duv, delta=1e-4, msg=xy)
            self.assertAlmostEqual(t, dc.xy_to_cct(xy), delta=1e-6)

    def test_round_trip(self):
        for t in (1800.0, 2856.0, 3200.0, 4150.0, 5003.0, 6504.0, 9000.0, 15000.0):
            for tint in (-40.0, -5.0, 0.0, 12.0, 60.0):
                xy = dc.xy_from_temperature_tint(t, tint)
                t2, tint2 = dc.temperature_tint(xy)
                self.assertAlmostEqual(t2, t, delta=t * 1e-5, msg=(t, tint))  # Robertson lines are piecewise
                self.assertAlmostEqual(tint2, tint, delta=1e-5, msg=(t, tint))


class WeightTests(unittest.TestCase):
    lights = (dc.illuminant_xy(17), dc.illuminant_xy(21), F2_XY)

    def test_a_white_on_an_illuminant_takes_it_alone(self):
        for i, light in enumerate(self.lights):
            w = dc.triple_weights(light, *self.lights)
            self.assertAlmostEqual(w[i], 1.0, places=9)
            self.assertAlmostEqual(sum(w), 1.0, places=12)

    def test_weights_are_a_partition_and_follow_the_lights(self):
        for xy in ((0.40, 0.39), (0.3457, 0.3585), (0.30, 0.32), (0.38, 0.40), (0.42, 0.38)):
            w = dc.triple_weights(xy, *self.lights)
            self.assertTrue(all(0.0 <= v <= 1.0 for v in w), w)
            self.assertAlmostEqual(sum(w), 1.0, places=12)
            # permuting the lights permutes the weights
            w2 = dc.triple_weights(xy, self.lights[2], self.lights[0], self.lights[1])
            self.assertAlmostEqual(w2[0], w[2], places=9)
            self.assertAlmostEqual(w2[1], w[0], places=9)
        # a D65 white takes D65 alone; one far beyond it still leans on D65
        self.assertGreater(dc.triple_weights((0.3127, 0.3290), *self.lights)[1], 0.999)
        self.assertGreater(dc.triple_weights((0.28, 0.29), *self.lights)[1], 0.95)

    def test_small_weights_are_cut(self):
        # Half-way between A and F2 in the plane, D65 is far: its share is cut to 0.
        t_a, tint_a = dc.temperature_tint(self.lights[0])
        t_f, tint_f = dc.temperature_tint(F2_XY)
        mid_t = 1500.0 / ((1500.0 / t_a + 1500.0 / t_f) / 2)
        xy = dc.xy_from_temperature_tint(mid_t, (tint_a + tint_f) / 2)
        w = dc.triple_weights(xy, *self.lights)
        self.assertEqual(w[1], 0.0)
        self.assertAlmostEqual(w[0], 0.5, delta=0.01)


class IlluminantDataTests(unittest.TestCase):
    def test_xy_both_byte_orders(self):
        for end in "<>":
            xy = dc.parse_illuminant_data(illuminant_data_xy(0.3805, 0.3768, end), end)
            self.assertAlmostEqual(xy[0], 0.3805, places=9)
            self.assertAlmostEqual(xy[1], 0.3768, places=9)

    def test_equal_energy_spectrum_is_e(self):
        xy = dc.parse_illuminant_data(illuminant_data_spectrum(380, 10, [1.0] * 41))
        self.assertAlmostEqual(xy[0], 1 / 3, places=9)
        self.assertAlmostEqual(xy[1], 1 / 3, places=9)

    def test_planckian_2856_is_illuminant_a(self):
        nm = [300 + 5 * i for i in range(107)]
        top = planck(560, 2856)
        xy = dc.parse_illuminant_data(illuminant_data_spectrum(300, 5, [planck(n, 2856) / top for n in nm]), "<")
        self.assertAlmostEqual(xy[0], 0.44757, delta=2e-4)
        self.assertAlmostEqual(xy[1], 0.40745, delta=2e-4)

    def test_bad_data_is_refused(self):
        for bad in ((), (0, 0, 1), tuple(struct.pack("<H", 7) + bytes(16)), illuminant_data_xy(0.0, 0.3)):
            with self.assertRaises(dc.ColourError):
                dc.parse_illuminant_data(bad)

    def test_other_light_needs_its_data(self):
        with self.assertRaises(dc.ColourError):
            dc.illuminant_xy(255)
        self.assertEqual(dc.illuminant_xy(255, (0.38, 0.38)), (0.38, 0.38))
        t, tint = dc.temperature_tint(dc.illuminant_xy(24))
        self.assertAlmostEqual(t, 3200.0, delta=0.01)
        self.assertAlmostEqual(tint, 0.0, delta=1e-6)


class ProfileTests(unittest.TestCase):
    def test_triple_tags_at_each_light(self):
        p = triple()
        self.assertTrue(p.is_triple())
        for light, cm in ((dc.illuminant_xy(17), CM_A), (dc.illuminant_xy(21), CM_D65), (F2_XY, CM_F2)):
            got, _cc, fm = p.tags_for_white(light)
            self.assertIsNone(fm)
            for i in range(3):
                for j in range(3):
                    self.assertAlmostEqual(got[i][j], m3(cm)[i][j], places=6)

    def test_neutral_and_white_round_trip(self):
        p = triple()
        for xy in (F2_XY, (0.3805, 0.3768), (0.40, 0.39), (0.3457, 0.3585), (0.3127, 0.3290), (0.4476, 0.4074)):
            back = p.neutral_to_xy(p.xy_to_neutral(xy))
            self.assertAlmostEqual(back[0], xy[0], places=7, msg=xy)
            self.assertAlmostEqual(back[1], xy[1], places=7, msg=xy)

    def test_why_a_third_matrix_is_not_used(self):
        self.assertIn("CalibrationIlluminant3", triple(illuminant_3=0).triple_problem())
        self.assertIn("distinct", triple(illuminant_3=1, illuminant_2=20).triple_problem())  # daylight == D55
        fm = m3(CM_D65)
        self.assertIn("ForwardMatrix", triple(forward_matrix_1=fm, forward_matrix_2=fm).triple_problem())
        self.assertIn("IlluminantData", triple(illuminant_3=255).triple_problem())
        self.assertIsNone(triple(illuminant_3=255, illuminant_data_3=F2_XY).triple_problem())
        self.assertFalse(triple(illuminant_3=0).is_triple())

    def test_other_light_in_a_dual_profile_blends_by_its_temperature(self):
        p = dc.Profile(m3(CM_A), m3(CM_D65), 255, 21, illuminant_data_1=(0.44757, 0.40745))
        self.assertAlmostEqual(p._pair()[0], dc.xy_to_cct((0.44757, 0.40745)), places=6)
        self.assertEqual(dc.Profile(m3(CM_A), m3(CM_D65), 255, 21)._pair(), None)

    def test_hue_sat_maps_blend_three_ways(self):
        def table(scale):
            return dc.HueSatTable(2, 2, 1, tuple(v for _ in range(4) for v in (0.0, scale, 1.0)))

        p = triple(hue_sat_map_1=table(1.0), hue_sat_map_2=table(2.0), hue_sat_map_3=table(4.0))
        xy = (0.40, 0.39)
        w = p.weights_for_white(xy)
        got = p.hue_sat_map_for_white(xy).data[1]
        self.assertAlmostEqual(got, w[0] * 1.0 + w[1] * 2.0 + w[2] * 4.0, places=12)
        self.assertEqual(p.hue_sat_map_for_white(F2_XY).data[1], 4.0)


class DevelopTests(unittest.TestCase):
    def test_fluorescent_scene_uses_the_third_matrix(self):
        sensor, neutral = sensor_for(CM_F2, F2_XY, W, H)
        three = tags(CM_A, CM_D65, neutral=neutral, extra=[(52531, 10, CM_F2), (52529, 3, (2,))])
        got, report = colours(make_dng(sensor, W, H, colour_tags=three))
        self.assertLess(worst(got, PATCHES), 0.01)
        self.assertTrue(report.matrix.startswith("ColorMatrix3 at 42"), report.matrix)
        # The same file read as a two-illuminant profile misses the patches.
        two, report2 = colours(make_dng(sensor, W, H, colour_tags=tags(CM_A, CM_D65, neutral=neutral)))
        self.assertGreater(worst(two, PATCHES), 0.02)
        self.assertTrue(report2.matrix.startswith("ColorMatrix1+2"), report2.matrix)

    def test_other_light_from_illuminant_data(self):
        sensor, neutral = sensor_for(CM_F2, F2_XY, W, H)
        data = illuminant_data_xy(*F2_XY)
        extra = [(52531, 10, CM_F2), (52529, 3, (255,)), (52535, 7, data)]
        got, report = colours(make_dng(sensor, W, H, colour_tags=tags(CM_A, CM_D65, neutral=neutral, extra=extra)))
        self.assertLess(worst(got, PATCHES), 0.01)
        self.assertTrue(report.matrix.startswith("ColorMatrix3"), report.matrix)

    def test_unusable_third_matrix_is_noted(self):
        sensor, neutral = sensor_for(CM_D65, rd._SRGB_WHITE_XY, W, H)
        extra = [(52531, 10, CM_F2)]  # no CalibrationIlluminant3
        got, report = colours(make_dng(sensor, W, H, colour_tags=tags(CM_A, CM_D65, neutral=neutral, extra=extra)))
        self.assertLess(worst(got, PATCHES), 0.01)
        self.assertTrue(any("ColorMatrix3 ignored" in n for n in report.notes), report.notes)

    def test_between_lights_blends_and_greys_stay_grey(self):
        p = triple()
        xy = (0.40, 0.39)
        neutral = p.xy_to_neutral(xy)
        sensor = [256 + int(round(0.5 * neutral[(0, 1, 1, 2)[(y % 2) * 2 + x % 2]] * 3839)) for y in range(8) for x in range(8)]
        extra = [(52531, 10, CM_F2), (52529, 3, (2,))]
        blob = make_dng(sensor, 8, 8, colour_tags=tags(CM_A, CM_D65, neutral=tuple(round(v, 4) for v in neutral), extra=extra))
        w, h, px, report = rd.develop(rd.parse_raw(blob))
        from test_raw_develop import read_pixel

        r, g, b = read_pixel(w, px, 4, 4)
        self.assertAlmostEqual(r, g, delta=0.003)
        self.assertAlmostEqual(b, g, delta=0.003)
        self.assertIn("weights", report.matrix)


if __name__ == "__main__":
    unittest.main()
