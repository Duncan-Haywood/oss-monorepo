import math
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "paper"))

import make_figures  # noqa: E402
import run_range_speed as rr  # noqa: E402


class RangeSpeedTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(make_figures.RS_RESULTS) as f:
            cls.curves = make_figures.parse_curves(f.read())

    def test_monohull_curve_matches_the_committed_file(self):
        c = rr.curve(rr.DISP, rr.michell_r(4.0, 1, 0.0, 0.25, 0.0, rr.DISP))
        km, u = rr.peak(c)
        self.assertAlmostEqual(km, 823.7, delta=0.05)
        self.assertEqual(u, 1.00)

    def test_peaks_follow_table_one(self):
        peak = {n: max(k for _, k in self.curves[n]) for n in make_figures.RUNGS}
        order = sorted(peak, key=lambda n: -peak[n])
        self.assertEqual(order, ["monohull", "catamaran", "SWATH", "hydrofoil", "planing"])

    def test_best_speed_scales_near_cube_root_of_hotel(self):
        best = {}
        for h in (5, 120):
            pts = self.curves[f"hotel{h}"]
            best[h] = max(pts, key=lambda p: p[1])[0]
        slope = math.log(best[120] / best[5]) / math.log(120 / 5)
        self.assertGreater(slope, 0.25)
        self.assertLess(slope, 0.40)

    def test_range_equals_battery_over_hotel_at_zero_drag(self):
        # with zero resistance the range is battery energy over hotel power times speed
        self.assertAlmostEqual(rr.range_km(10000.0, 1.0, 0.0, p_hotel=30.0), 10000.0 / 30.0 * 3.6, places=6)

    def test_tikz_draws_ten_curves_with_peaks(self):
        t = make_figures.tikz_range_speed(self.curves)
        self.assertEqual(t.count("circle (1.4pt)"), 10)
        self.assertTrue(t.rstrip().endswith(r"\end{tikzpicture}"))


if __name__ == "__main__":
    unittest.main()
