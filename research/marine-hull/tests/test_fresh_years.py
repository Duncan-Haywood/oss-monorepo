import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_blend_transfer as bt  # noqa: E402
import run_fresh_years as fy  # noqa: E402
import run_reserve_curve as rc  # noqa: E402
import run_self_bias as sb  # noqa: E402


class FreshYearsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fy.prepare()

    def test_data_covers_every_point_and_day_without_fill(self):
        d = json.load(open(fy.DATA_FILE))
        self.assertEqual(sorted(d), sorted(bt.PTS))
        for p in bt.PTS:
            self.assertEqual(d[p]["start"], "20050101")
            self.assertEqual(len(d[p]["values"]), 3652)
            self.assertTrue(all(v >= 0 for v in d[p]["values"]))

    def test_test_years_are_disjoint_from_climatology_and_load_keeps_old_years(self):
        self.assertFalse(set(fy.YEARS) & set(fy.CLIM_YEARS))
        s = rc.series("P+10")
        self.assertIn("20050101", s)
        self.assertIn("20141231", s)
        self.assertIn("20240101", s)
        n = len(s)
        fy.load()  # idempotent
        self.assertEqual(len(rc.series("P+10")), n)

    def test_climatology_ignores_test_year_data(self):
        a = fy._clim("A+20", 2007)
        b = fy._clim("A+20", 2011)
        self.assertEqual(len(a), 365)
        self.assertEqual(len(b), 365)
        self.assertEqual(a, b)  # same ten 2015-2024 years, same calendar

    def test_frozen_rules_and_oracle(self):
        _, o, (_, n) = fy.score((5000.0, "A+40", 2008, 1.01))
        self.assertEqual(n, 366)
        tau = sb.tau_of(1.01 / fy.REALISED["E"])
        self.assertEqual(o["OR"][2][tau], n)
        self.assertEqual(o["PS"][2][fy.PS[5000.0][1]], n)
        self.assertEqual(o["PSS"][2][fy.PSS[5000.0][1]], n)
        for g in fy.RULES:
            self.assertGreaterEqual(o[g][0], 0.0)
            self.assertEqual(sum(o[g][2].values()), n)

    def test_realised_ratio_is_near_one(self):
        for hn, r in fy.REALISED.items():
            self.assertTrue(0.9 < r < 1.1, (hn, r))


if __name__ == "__main__":
    unittest.main()
