"""The default tone curve for profiles that carry no ProfileToneCurve.

``dng_colour.DEFAULT_TONE_KNOTS`` is shootflow's own 20-knot fit to Adobe's
"ACR3 default" curve. The curve itself is not in the tree, so the shape is
checked here by its published landmarks (eval/tone-curve-2026-11-12.md) and,
when ``SHOOTFLOW_DEFAULT_TONE_DCP`` names a profile that embeds the curve
(68 of RawTherapee's profiles do), against that profile point by point.
"""

from __future__ import annotations

import os
import random
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from shootflow import dng_colour as dc
from shootflow import raw_develop as rd
from test_dng_profile_tables import HSM_ROTATE, by_hand, dng, make_dcp, patches, profile_tags
from test_dng_tone_curve import S_CURVE, TONE_TAG, flat
from test_raw_develop import CAMERA_MATRIX, PATCHES, patch_sensor

try:
    import numpy  # noqa: F401

    HAVE_NUMPY = True
except ImportError:
    HAVE_NUMPY = False

ADOBE = (50942, 2, tuple(b"Copyright 2012 Adobe Systems, Inc.\0"))
OTHER = (50942, 2, tuple(b"public domain\0"))


def name(text=b"No-curve profile\0"):
    return (50936, 2, tuple(text))


class DefaultCurveShapeTests(unittest.TestCase):
    def test_knots_are_a_valid_profile_curve(self):
        xs, ys = zip(*dc.DEFAULT_TONE_KNOTS)
        curve = dc.ToneCurve.from_tags(flat(dc.DEFAULT_TONE_KNOTS))  # passes the tag checks
        self.assertEqual(curve.points, 20)
        self.assertEqual((xs[0], ys[0], xs[-1], ys[-1]), (0.0, 0.0, 1.0, 1.0))
        t = curve.table
        self.assertTrue(all(b >= a for a, b in zip(t, t[1:])), "table falls somewhere")
        self.assertIs(dc.default_tone_curve(), dc.default_tone_curve())

    def test_landmarks_of_the_acr3_curve(self):
        # Samples of the shared 8,192-point curve, eval/tone-curve-2026-11-12.md.
        c = dc.default_tone_curve()
        for x, want in ((0.01, 0.0083), (0.05, 0.0771), (0.18, 0.388), (0.5, 0.805), (0.9, 0.983)):
            self.assertAlmostEqual(c(x), want, delta=6e-4, msg=f"x={x}")
        # a toe (below the identity) in the deep shadows, a lift through the mid-tones
        self.assertLess(c(0.005), 0.005)
        self.assertGreater(c(0.18), 2.0 * 0.18)

    @unittest.skipUnless(os.environ.get("SHOOTFLOW_DEFAULT_TONE_DCP"), "SHOOTFLOW_DEFAULT_TONE_DCP not set")
    def test_against_a_profile_that_embeds_the_curve(self):
        ref = dc.ToneCurve.from_tags(rd.read_dcp(os.environ["SHOOTFLOW_DEFAULT_TONE_DCP"]).get(TONE_TAG))
        c = dc.default_tone_curve()
        worst_lin = worst_8 = 0.0
        for k in range(4097):
            x = k / 4096
            a, b = c.evaluate(x), ref.evaluate(x)
            worst_lin = max(worst_lin, abs(a - b))
            worst_8 = max(worst_8, 255 * abs(dc.srgb_encode(min(max(a, 0.0), 1.0)) - dc.srgb_encode(b)))
        self.assertLess(worst_lin, 6e-4)
        self.assertLess(worst_8, 0.1)


class DefaultCurveRenderTests(unittest.TestCase):
    def assertClose(self, got, want, tol):
        for g, w in zip(got, want):
            for a, b in zip(g, w):
                self.assertAlmostEqual(a, b, delta=tol, msg=f"got {g}, want {w}")

    def toned_by_hand(self, plain):
        curve = dc.default_tone_curve()
        want = [by_hand(p, lambda pp: dc.rgb_tone(curve, *pp)) for p in plain]
        return [tuple(min(max(c, 0.0), 1.0) for c in p) for p in want]

    def test_auto_applies_only_to_adobe_profiles(self):
        plain, _ = patches(dng())
        got, report = patches(dng([name(), OTHER]))
        self.assertEqual(got, plain)
        got, report = patches(dng([name(), ADOBE]))
        self.assertClose(got, self.toned_by_hand(plain), 0.004)
        self.assertEqual(report.profile, "No-curve profile: default ToneCurve (ACR3 fit)")
        self.assertGreater(got[0][1], plain[0][1] + 0.02)

    def test_always_and_never(self):
        plain, _ = patches(dng())
        got, report = patches(dng(), default_tone="always")
        self.assertClose(got, self.toned_by_hand(plain), 0.004)
        self.assertIn("default ToneCurve (ACR3 fit)", report.profile)
        got, _ = patches(dng([name(), OTHER]), default_tone="always")
        self.assertClose(got, self.toned_by_hand(plain), 0.004)
        got, report = patches(dng([name(), ADOBE]), default_tone="never")
        self.assertEqual(got, plain)

    def test_a_profile_curve_wins_over_the_default(self):
        own, rep_own = patches(dng([name(), (TONE_TAG, 11, flat(S_CURVE))]))
        for mode in ("auto", "always"):
            got, report = patches(dng([name(), ADOBE, (TONE_TAG, 11, flat(S_CURVE))]), default_tone=mode)
            self.assertEqual(got, own)
            self.assertNotIn("default", report.profile)
        # a straight-line curve is the profile's choice: no default replaces it
        plain, _ = patches(dng())
        got, _ = patches(dng([name(), (TONE_TAG, 11, (0.0, 0.0, 1.0, 1.0))]), default_tone="always")
        self.assertEqual(got, plain)

    def test_after_the_tables_and_off_switches(self):
        tables_only, _ = patches(dng(profile_tags(hsm=HSM_ROTATE)))
        got, report = patches(dng(profile_tags(hsm=HSM_ROTATE)), default_tone="always")
        self.assertClose(got, self.toned_by_hand(tables_only), 0.004)
        self.assertEqual(report.profile, "Test profile: HueSatMap 6x2x1, default ToneCurve (ACR3 fit)")
        got, report = patches(dng(profile_tags(hsm=HSM_ROTATE)), default_tone="always", tone_curve=False)
        self.assertEqual(got, tables_only)
        self.assertTrue(any("default tone curve not applied" in n for n in report.notes), report.notes)
        plain, _ = patches(dng())
        got, report = patches(dng(), default_tone="always", profile_tables=False)
        self.assertEqual(got, plain)

    def test_dcp_with_adobe_copyright_and_no_curve(self):
        blob = make_dcp([(50708, 2, tuple(b"Test Camera\0")), (50721, 10, CAMERA_MATRIX), (50778, 3, (21,)), name(), ADOBE])
        plain, _ = patches(dng())
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "Test Camera.dcp"
            path.write_bytes(blob)
            got, report = patches(dng(), dcp=rd.read_dcp(path))
        self.assertClose(got, self.toned_by_hand(plain), 0.004)
        self.assertIn("default ToneCurve", report.profile)

    def test_bad_mode(self):
        with self.assertRaises(rd.DevelopError):
            patches(dng(), default_tone="sometimes")


@unittest.skipUnless(HAVE_NUMPY, "numpy not installed")
class DefaultCurveEngineTests(unittest.TestCase):
    def test_numpy_engine_same_bytes(self):
        rng = random.Random(12)
        w, h = 8 * len(PATCHES), 8
        sensor = [max(0, min(4095, v + rng.randint(-300, 300))) for v in patch_sensor(w, h)]
        for extra in ([name(), ADOBE], profile_tags(hsm=HSM_ROTATE) + [ADOBE]):
            for settings in ({}, {"half": True}, {"exposure_ev": 1.3}, {"default_tone": "always", "exposure_ev": -0.7}):
                raw = rd.parse_raw(dng(extra, sensor))
                py = rd.develop(raw, rd.DevelopSettings(engine="python", **settings))
                npy = rd.develop(raw, rd.DevelopSettings(engine="numpy", **settings))
                self.assertEqual(py[2].tobytes(), npy[2].tobytes(), msg=str(settings))
                self.assertEqual(py[3].profile, npy[3].profile)
                self.assertIn("default ToneCurve", py[3].profile)


if __name__ == "__main__":
    unittest.main()
