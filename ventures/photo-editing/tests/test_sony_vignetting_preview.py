"""``tools/sony_vignetting_preview_check.py``: the gain estimator on a preview with a planted gain and tone curve,
and the four readings of Sony's vignetting table written out from the formula."""

from __future__ import annotations

import importlib.util
import math
import os
import sys
import unittest

from shootflow import sony_corrections as sc

try:
    import numpy as np

    HAVE_NUMPY = True
except ImportError:  # pragma: no cover - the stdlib-only CI leg
    HAVE_NUMPY = False

TOOL = os.path.join(os.path.dirname(__file__), "..", "tools", "sony_vignetting_preview_check.py")


def load_tool():
    spec = importlib.util.spec_from_file_location("sony_vignetting_preview_check", TOOL)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


def tone(x):
    """A camera-like tone curve: filmic shoulder, then sRGB-like lift, monotone on [0, inf)."""

    y = x / (x + 0.18)
    return np.clip(y ** 0.8, 0.0, 1.0)


@unittest.skipUnless(HAVE_NUMPY, "needs numpy (and Pillow for the tool's import)")
class EstimatorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            cls.tool = load_tool()
        except ImportError as exc:  # Pillow missing
            raise unittest.SkipTest(str(exc))

    def scene(self, h=300, w=450, seed=1):
        rng = np.random.default_rng(seed)
        # A textured scene in raw units with a wide range, three channels with different colour casts.
        base = np.exp(rng.normal(np.log(800.0), 0.9, size=(h, w)))
        rgb = np.stack([base * 0.6, base, base * 0.45], axis=-1) * np.exp(rng.normal(0, 0.15, size=(h, w, 3)))
        vv, uu = np.mgrid[0:h, 0:w].astype(np.float64)
        rho = np.hypot(uu + 0.5 - w / 2, vv + 0.5 - h / 2) / math.hypot(w / 2, h / 2)
        return rgb, rho

    def run_planted(self, stops_at_corner, exponent=2.0):
        raw, rho = self.scene()
        white = 16000.0
        gain = 2.0 ** (stops_at_corner * rho ** exponent)
        # The preview: the camera's linear values (gain times raw, exposure folded in), through the tone curve.
        plin = tone(raw * gain[..., None] / 4000.0)
        out = self.tool.estimate_bands(raw, raw.max(axis=-1), plin, rho, white, centre=0.2, bands=8)
        return out, gain

    def test_recovers_a_planted_gain(self):
        out, _ = self.run_planted(1.0)
        for name in "RGB":
            rows = [r for r in out[name] if r]
            self.assertGreaterEqual(len(rows), 6)
            for r in rows:
                want = 1.0 * r["rho"] ** 2 - 1.0 * 0.1 ** 2  # relative to the centre disk (median rho ~ 0.14)
                self.assertAlmostEqual(r["stops"], want, delta=0.04, msg=(name, r))

    def test_no_gain_reads_flat(self):
        out, _ = self.run_planted(0.0)
        for r in out["G"]:
            if r:
                self.assertLess(abs(r["stops"]), 0.01)

    def test_tells_one_reading_from_its_square(self):
        # A planted 0.8-stop corner must not be read as 1.6: the outer band lands within 0.1 of 0.8 x rho^2.
        out, _ = self.run_planted(0.8)
        outer = [r for r in out["G"] if r][-1]
        self.assertAlmostEqual(outer["stops"], 0.8 * outer["rho"] ** 2, delta=0.1)
        self.assertGreater(abs(outer["stops"] - 1.6 * outer["rho"] ** 2), 0.3)


class ReadingTests(unittest.TestCase):
    corr = sc.SonyCorrections(None, None, None, (0, 64, 128, 256, 448, 704, 1024, 1344, 1792, 2496, 3520, 4992,
                                                   6784, 8832, 11008, 13184))

    @unittest.skipUnless(HAVE_NUMPY, "needs numpy")
    def test_ship_reading_is_the_library_gain(self):
        tool = load_tool()
        for rho in (0.0, 0.13, 0.5, 0.77, 1.0):
            g = float(tool.table_gain(self.corr, np.array([rho]), False, False)[0])
            self.assertAlmostEqual(g, self.corr.vignetting_gain(rho), places=12)
            g2 = float(tool.table_gain(self.corr, np.array([rho]), True, False)[0])
            self.assertAlmostEqual(g2, g * g, places=12)

    @unittest.skipUnless(HAVE_NUMPY, "needs numpy")
    def test_darktable_knots_sit_half_a_step_out(self):
        tool = load_tool()
        n = len(self.corr.vignetting)
        # darktable's knot i is at (i + 0.5) / (n - 1): at rho = 2.5 / (n - 1) it reads knot 2 exactly.
        rho = 2.5 / (n - 1)
        v = self.corr.vignetting[2] * sc.VIGNETTING_SCALE
        want = 2.0 ** (2.0 ** (v - 1.0) - 0.5)
        self.assertAlmostEqual(float(tool.table_gain(self.corr, np.array([rho]), False, True)[0]), want, places=12)
        # and holds knot 0 flat inside half a step.
        v0 = self.corr.vignetting[0] * sc.VIGNETTING_SCALE
        self.assertAlmostEqual(float(tool.table_gain(self.corr, np.array([0.01]), False, True)[0]),
                               2.0 ** (2.0 ** (v0 - 1.0) - 0.5), places=12)

    def test_maker_note_codes_follow_exiftool(self):
        try:
            tool = load_tool()
        except ImportError:
            self.skipTest("needs numpy and Pillow")
        self.assertEqual(tool._CORRECTION[0], "Off")
        self.assertEqual(tool._CORRECTION[2], "Auto")
        self.assertEqual(tool._DRO[0], "Off")


if __name__ == "__main__":
    unittest.main()
