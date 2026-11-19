import math
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))

import figure_wind_air_drag as fw  # noqa: E402
import run_air_drag as ad  # noqa: E402
import run_hotel_ranking as hr  # noqa: E402
import run_range_speed as rr  # noqa: E402
import run_wind_air_drag as wd  # noqa: E402

RESULTS = os.path.join(HERE, "..", "experiments", "results_wind_air_drag.txt")


class WindAirDragTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(RESULTS) as f:
            cls.text = f.read()
        cls.curves = fw.parse_curves(cls.text)

    def test_zero_wind_is_still_air(self):
        for u in (0.5, 3.0, 15.0):
            self.assertAlmostEqual(wd.head_avg(u, 0.0), u * u)

    def test_strong_wind_force_is_about_one_and_a_half_u_w(self):
        u, w = 0.5, 20.0
        self.assertAlmostEqual(wd.head_avg(u, w) / (1.5 * u * w), 1.0, delta=0.02)

    def test_still_air_scenario_reproduces_milestone_7w(self):
        mono0, rungs0 = ad.base_rungs()
        units = {id(g): wd.mean_force_unit(g, {0.0: 1.0}) for g in (rr.DISP, rr.FAST)}
        ours = wd.central_ratios(mono0, rungs0, units, 0.4)[0]["hydrofoil"]
        theirs = ad.central(0.4, mono0, rungs0)[0]["hydrofoil"]
        for a, b in zip(ours, theirs):
            self.assertAlmostEqual(a, b, places=9)

    def test_wind_raises_foil_break_even_but_keeps_200_w_scope(self):
        still = hr.crossing([r[0] for r in self.curves[("still_air", 0.4)]], [r[1] for r in self.curves[("still_air", 0.4)]])
        wind = hr.crossing([r[0] for r in self.curves[("pooled_wind", 0.4)]], [r[1] for r in self.curves[("pooled_wind", 0.4)]])
        self.assertGreater(wind, still)
        self.assertLess(wind / still, 1.10)
        self.assertNotIn("leads to 200 W: False", self.text)
        self.assertEqual(self.text.count("at or below 200 W: 0"), 12)

    def test_histogram_is_a_distribution(self):
        h = wd.hist([1.04, 1.06, 2.0, 2.0])
        self.assertAlmostEqual(sum(h.values()), 1.0)
        self.assertTrue(math.isclose(h[2.0], 0.5))


if __name__ == "__main__":
    unittest.main()
