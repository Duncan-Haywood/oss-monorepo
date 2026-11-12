"""The profile tone curve (ProfileToneCurve), in a DNG or a .dcp camera profile.

The spline is checked against a second implementation written here (the
natural spline's second-derivative form, solved by Gaussian elimination on a
dense matrix), and against scipy's ``CubicSpline(bc_type="natural")`` when
scipy is installed. The hue-preserving RGB tone is checked for what it
promises: HSV hue unchanged, the largest and smallest channel through the
curve. Renders are checked against the no-curve render pushed through the
same tone by hand, and the numpy engine against the pure-Python one byte for
byte.
"""

from __future__ import annotations

import colorsys
import random
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from shootflow import dng_colour as dc
from shootflow import raw_develop as rd
from test_dng_profile_tables import (
    HSM_ROTATE,
    by_hand,
    dng,
    make_dcp,
    patches,
    profile_tags,
)
from test_raw_develop import CAMERA_MATRIX, PATCHES, patch_sensor

try:
    import numpy  # noqa: F401

    HAVE_NUMPY = True
except ImportError:
    HAVE_NUMPY = False

try:
    from scipy.interpolate import CubicSpline

    HAVE_SCIPY = True
except ImportError:
    HAVE_SCIPY = False

# A typical film-like S curve (the shape of a camera profile's tone curve).
S_CURVE = [(0.0, 0.0), (0.03, 0.02), (0.12, 0.13), (0.25, 0.34), (0.5, 0.68), (0.75, 0.89), (1.0, 1.0)]


def flat(points):
    return tuple(v for p in points for v in p)


def reference_spline(xs, ys):
    """The natural cubic spline in second-derivative form, by dense elimination.

    Returns ``f(x)``. Shares nothing with ``dng_colour.natural_spline_slopes``.
    """

    n = len(xs)
    a = [[0.0] * n for _ in range(n)]
    rhs = [0.0] * n
    a[0][0] = 1.0
    a[n - 1][n - 1] = 1.0
    for i in range(1, n - 1):
        h0, h1 = xs[i] - xs[i - 1], xs[i + 1] - xs[i]
        a[i][i - 1] = h0 / 6.0
        a[i][i] = (h0 + h1) / 3.0
        a[i][i + 1] = h1 / 6.0
        rhs[i] = (ys[i + 1] - ys[i]) / h1 - (ys[i] - ys[i - 1]) / h0
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(a[r][c]))
        a[c], a[p] = a[p], a[c]
        rhs[c], rhs[p] = rhs[p], rhs[c]
        for r in range(n):
            if r != c and a[r][c]:
                f = a[r][c] / a[c][c]
                a[r] = [x - f * y for x, y in zip(a[r], a[c])]
                rhs[r] -= f * rhs[c]
    m = [rhs[i] / a[i][i] for i in range(n)]

    def f(x):
        if x <= xs[0]:
            return ys[0]
        if x >= xs[-1]:
            return ys[-1]
        i = max(k for k in range(n - 1) if xs[k] <= x)
        h = xs[i + 1] - xs[i]
        t0, t1 = xs[i + 1] - x, x - xs[i]
        return (
            m[i] * t0**3 / (6 * h)
            + m[i + 1] * t1**3 / (6 * h)
            + (ys[i] / h - m[i] * h / 6) * t0
            + (ys[i + 1] / h - m[i + 1] * h / 6) * t1
        )

    return f


def random_curve(rng):
    n = rng.randint(2, 40)
    xs = sorted({0.0, 1.0, *(rng.random() for _ in range(n - 2))})
    ys = sorted([0.0, 1.0] + [rng.random() for _ in range(len(xs) - 2)])
    return xs, ys


class SplineTests(unittest.TestCase):
    def test_matches_an_independent_natural_spline(self):
        rng = random.Random(11)
        worst = 0.0
        for _ in range(200):
            xs, ys = random_curve(rng)
            curve = dc.ToneCurve.from_points(xs, ys)
            ref = reference_spline(xs, ys)
            for _ in range(50):
                x = rng.random()
                worst = max(worst, abs(curve.evaluate(x) - ref(x)))
        self.assertLess(worst, 1e-9)

    @unittest.skipUnless(HAVE_SCIPY, "scipy not installed")
    def test_matches_scipy_natural_cubic_spline(self):
        rng = random.Random(12)
        worst = 0.0
        for _ in range(200):
            xs, ys = random_curve(rng)
            curve = dc.ToneCurve.from_points(xs, ys)
            sp = CubicSpline(xs, ys, bc_type="natural")
            for _ in range(50):
                x = rng.random()
                worst = max(worst, abs(curve.evaluate(x) - float(sp(x))))
        self.assertLess(worst, 1e-9)

    def test_passes_through_the_points_and_two_points_is_a_line(self):
        curve = dc.ToneCurve.from_tags(flat(S_CURVE))
        for x, y in S_CURVE:
            self.assertAlmostEqual(curve.evaluate(x), y, places=12)
        line = dc.ToneCurve.from_tags((0.0, 0.0, 1.0, 1.0))
        self.assertTrue(line.is_identity())
        for x in (0.0, 0.1, 0.37, 0.99, 1.0):
            self.assertAlmostEqual(line(x), x, places=12)

    def test_table_reads_the_spline_within_a_hair(self):
        curve = dc.ToneCurve.from_tags(flat(S_CURVE))
        self.assertEqual(len(curve.table), dc.TONE_TABLE_STEPS + 2)
        rng = random.Random(5)
        worst = max(abs(curve(x) - curve.evaluate(x)) for x in (rng.random() for _ in range(5000)))
        self.assertLess(worst, 1e-6)
        self.assertEqual(curve(-0.5), 0.0)
        self.assertEqual(curve(1.5), 1.0)
        self.assertEqual(curve(1.0), curve.table[dc.TONE_TABLE_STEPS])

    def test_bad_curves(self):
        for values in (
            (0.0, 0.0),
            (0.0, 0.0, 1.0),
            (0.1, 0.0, 1.0, 1.0),
            (0.0, 0.0, 1.0, 0.9),
            (0.0, 0.0, 0.5, 0.5, 0.5, 0.6, 1.0, 1.0),
            (0.0, 0.0, 0.5, 1.4, 1.0, 1.0),
            (0.0, 0.0, 0.5, float("nan"), 1.0, 1.0),
        ):
            with self.assertRaises(dc.ColourError, msg=str(values)):
                dc.ToneCurve.from_tags(values)


class RgbToneTests(unittest.TestCase):
    def test_hue_kept_and_extremes_through_the_curve(self):
        curve = dc.ToneCurve.from_tags(flat(S_CURVE))
        rng = random.Random(9)
        for _ in range(5000):
            rgb = [rng.random() for _ in range(3)]
            if rng.random() < 0.2:  # ties
                i, j = rng.sample(range(3), 2)
                rgb[i] = rgb[j]
            out = dc.rgb_tone(curve, *rgb)
            self.assertAlmostEqual(max(out), curve(max(rgb)), places=12)
            self.assertAlmostEqual(min(out), curve(min(rgb)), places=12)
            h0, s0, _ = colorsys.rgb_to_hsv(*rgb)
            h1, s1, _ = colorsys.rgb_to_hsv(*out)
            if s0 > 1e-6 and s1 > 1e-6:
                d = abs(h0 - h1)
                self.assertLess(min(d, 1 - d), 1e-9, msg=f"{rgb} -> {out}")

    def test_greys_go_through_the_curve(self):
        curve = dc.ToneCurve.from_tags(flat(S_CURVE))
        for v in (0.0, 0.18, 0.5, 1.0):
            self.assertEqual(dc.rgb_tone(curve, v, v, v), (curve(v),) * 3)


# ------------------------------------------------------------ renders

TONE_TAG = 50940


def tone_tags(points=S_CURVE, name=b"Tone profile\0"):
    return [(50936, 2, tuple(name)), (TONE_TAG, 11, flat(points))]


class ToneRenderTests(unittest.TestCase):
    def assertClose(self, got, want, tol):
        for g, w in zip(got, want):
            for a, b in zip(g, w):
                self.assertAlmostEqual(a, b, delta=tol, msg=f"got {g}, want {w}")

    def test_embedded_tone_curve_by_hand(self):
        plain, rep_plain = patches(dng())
        got, report = patches(dng(tone_tags()))
        curve = dc.ToneCurve.from_tags(flat(S_CURVE))
        want = [by_hand(p, lambda pp: dc.rgb_tone(curve, *pp)) for p in plain]
        self.assertClose(got, want, 0.004)
        self.assertEqual(report.profile, "Tone profile: ToneCurve 7 points")
        self.assertFalse(any("ToneCurve not applied" in n for n in report.notes))
        # the S curve lifts the mid-grey patch
        self.assertGreater(got[0][1], plain[0][1] + 0.02)

    def test_after_the_tables(self):
        both, report = patches(dng(profile_tags(hsm=HSM_ROTATE) + [(TONE_TAG, 11, flat(S_CURVE))]))
        tables_only, _ = patches(dng(profile_tags(hsm=HSM_ROTATE)))
        curve = dc.ToneCurve.from_tags(flat(S_CURVE))
        want = [by_hand(p, lambda pp: dc.rgb_tone(curve, *pp)) for p in tables_only]
        # the encoder clips out-of-gamut sRGB to [0, 1]
        want = [tuple(min(max(c, 0.0), 1.0) for c in p) for p in want]
        self.assertClose(both, want, 0.004)
        self.assertEqual(report.profile, "Test profile: HueSatMap 6x2x1, ToneCurve 7 points")

    def test_off_switches(self):
        plain, _ = patches(dng())
        got, report = patches(dng(tone_tags()), tone_curve=False)
        self.assertEqual(got, plain)
        self.assertIn("ToneCurve 7 points off", report.profile)
        self.assertTrue(any("tone_curve off" in n for n in report.notes))
        got, report = patches(dng(tone_tags()), profile_tables=False)
        self.assertEqual(got, plain)
        self.assertIn("tables off", report.profile)
        # tables still apply with the curve off
        tables_only, _ = patches(dng(profile_tags(hsm=HSM_ROTATE)))
        got, _ = patches(dng(profile_tags(hsm=HSM_ROTATE) + [(TONE_TAG, 11, flat(S_CURVE))]), tone_curve=False)
        self.assertEqual(got, tables_only)

    def test_identity_and_broken_curves(self):
        plain, _ = patches(dng())
        got, report = patches(dng(tone_tags([(0.0, 0.0), (0.5, 0.5), (1.0, 1.0)])))
        self.assertEqual(got, plain)
        self.assertTrue(report.profile.endswith("(identity)"), report.profile)
        got, report = patches(dng(tone_tags([(0.0, 0.0), (0.6, 0.5), (0.4, 0.7), (1.0, 1.0)])))
        self.assertEqual(got, plain)
        self.assertTrue(any("ProfileToneCurve ignored" in n for n in report.notes), report.notes)

    def test_dcp_tone_curve_equals_embedded(self):
        embedded, rep_e = patches(dng(tone_tags()))
        blob = make_dcp(
            [(50708, 2, tuple(b"Test Camera\0")), (50721, 10, CAMERA_MATRIX), (50778, 3, (21,))] + tone_tags()
        )
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "Test Camera.dcp"
            path.write_bytes(blob)
            got, rep_d = patches(dng(), dcp=rd.read_dcp(path))
        self.assertEqual(got, embedded)
        self.assertEqual(rep_d.profile, rep_e.profile)


@unittest.skipUnless(HAVE_NUMPY, "numpy not installed")
class ToneEngineTests(unittest.TestCase):
    def test_numpy_rgb_tone_same_floats(self):
        from shootflow import raw_develop_np as rnp
        import numpy as np

        curve = dc.ToneCurve.from_tags(flat(S_CURVE))
        rng = random.Random(4)
        vals = [0.0, 0.25, 0.5, 1.0]
        rows = [[rng.random() for _ in range(3)] for _ in range(4000)]
        rows += [[a, b, c] for a in vals for b in vals for c in vals]  # every tie pattern
        arr = np.array(rows)
        got = np.stack(rnp.rgb_tone(curve, arr[:, 0], arr[:, 1], arr[:, 2]), axis=1)
        want = np.array([dc.rgb_tone(curve, *r) for r in rows])
        self.assertTrue(np.array_equal(got, want), float(np.max(np.abs(got - want))))

    def test_numpy_engine_same_bytes(self):
        rng = random.Random(8)
        w, h = 8 * len(PATCHES), 8
        sensor = [max(0, min(4095, v + rng.randint(-300, 300))) for v in patch_sensor(w, h)]
        for extra in (tone_tags(), profile_tags(hsm=HSM_ROTATE) + [(TONE_TAG, 11, flat(S_CURVE))]):
            for settings in ({}, {"half": True}, {"exposure_ev": 1.3}, {"exposure_ev": -0.7}):
                raw = rd.parse_raw(dng(extra, sensor))
                py = rd.develop(raw, rd.DevelopSettings(engine="python", **settings))
                npy = rd.develop(raw, rd.DevelopSettings(engine="numpy", **settings))
                self.assertEqual(py[2].tobytes(), npy[2].tobytes(), msg=str(settings))
                self.assertEqual(py[3].profile, npy[3].profile)


if __name__ == "__main__":
    unittest.main()
