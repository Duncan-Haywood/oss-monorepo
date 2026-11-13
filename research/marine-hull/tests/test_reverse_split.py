import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_blend_transfer as bt  # noqa: E402
import run_reverse_split as rs  # noqa: E402


class ReverseSplitTests(unittest.TestCase):
    def test_years_are_reversed_and_disjoint(self):
        self.assertEqual(rs.SEL, (2020, 2021, 2022, 2023, 2024))
        self.assertEqual(rs.TEST, (2015, 2016, 2017, 2018, 2019))
        self.assertEqual(rs.SEL, bt.TEST)
        self.assertEqual(rs.TEST, bt.TRAIN)

    def test_test_year_climatology_uses_no_test_year(self):
        # a 2017 climatology from 2020-2024 equals one built from the same years with 2017 listed and excluded
        import run_reserve_curve as rc
        a = rs._clim("A+40", 2017)
        b = tuple(rc.climatology_wh("A+40", 2017, years=rs.SEL + (2017,)))
        self.assertEqual(len(a), len(b))
        for x, y in zip(a, b):
            self.assertAlmostEqual(x, y, places=9)

    def test_rule_is_on_the_grid(self):
        self.assertEqual(set(rs.PS), set(rs.PACKS))
        for g in rs.PS.values():
            self.assertIn(g, rs.GRID)
        self.assertIn(rs.DEFAULT, rs.GRID)

    def test_regions_match_6zt_test_sets(self):
        self.assertEqual(set(rs.REGIONS["AtlC"]), set(bt.SPLITS["S1"][1]))
        self.assertEqual(set(rs.REGIONS["PacC"]), set(bt.SPLITS["S2"][1]))
        self.assertEqual(len(rs.REGIONS["All"]), 30)

    def test_score_shape(self):
        key, out = rs.score((5000.0, 50.0, "A+40", 2016))
        self.assertEqual(key[3], 2016)
        self.assertEqual(set(out), set(rs.GRID) | {rs.BASE})
        for v in out.values():
            self.assertEqual(len(v), 3)
            self.assertGreaterEqual(v[0], 0.0)


if __name__ == "__main__":
    unittest.main()
