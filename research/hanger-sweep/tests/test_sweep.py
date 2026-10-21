import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "hanger-sweep" / "src"), str(ROOT / "hanger-fit" / "src")]
from hanger_fit import model as hf  # noqa: E402
from hanger_sweep.sweep import OFFSETS, make_garment, summarise, width_curve  # noqa: E402


class TestSweep(unittest.TestCase):
    def test_baseline_matches_hanger_fit(self):
        """At the assumed constants the sweep's score is hanger-fit's own score (no drift)."""
        f = hf.FABRICS["tee"]
        g = make_garment("M", "tee", f["B"], 1.0, f["EA"])
        self.assertEqual(g, hf.garment("M", "tee"))
        w0 = hf.STOCK["wood-shaped"].w
        direct = hf.score(hf.STOCK["wood-shaped"], hf.garment("M", "tee"))["err"]
        hf.DEPTH = 0.20
        self.assertAlmostEqual(width_curve(g, 0.20, offsets=[w0 - g.half_shoulder])[0], direct, places=9)

    def test_mass_scales_every_weight(self):
        g = make_garment("M", "sweater", 0.3, 2.0, 40.0)
        b = hf.garment("M", "sweater")
        self.assertAlmostEqual(g.body, 2 * b.body)
        self.assertAlmostEqual(g.lump, 2 * b.lump)

    def test_summarise(self):
        errs = [3.0, 2.0, 1.0, 0.2, 0.5, 1.0, 2.0]
        s = summarise(errs)
        self.assertEqual((s["best_offset"], s["best_err"], s["err_at_1"]), (1.0, 0.2, 0.2))
        self.assertEqual(len(errs), len(OFFSETS))

    def test_width_curve_has_interior_minimum_for_tee(self):
        g = make_garment("M", "tee", 0.03, 1.0, 150.0)
        e = width_curve(g, 0.20)
        self.assertEqual(summarise(e)["best_offset"], 1.0)


if __name__ == "__main__":
    unittest.main()
