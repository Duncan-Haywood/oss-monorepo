"""Milestone 6zm: held-out check of the led capacity-aware pack-target curve."""
import os
import sys
import unittest

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, '..', 'experiments'))
sys.path.insert(0, os.path.join(HERE, '..', 'src'))
import run_led_curve_holdout as lh  # noqa: E402
import run_reserve_curve as rc  # noqa: E402
import run_two_sided_curve as ts  # noqa: E402


class LedCurveHoldoutTests(unittest.TestCase):
    def test_grid_is_the_registered_one(self):
        self.assertEqual(len(lh.GRID), 18)
        for g in lh.INSAMPLE:
            self.assertIn(g, lh.GRID)
        self.assertEqual(lh.TRAIN, (2015, 2016, 2017, 2018, 2019))
        self.assertEqual(lh.TEST, (2020, 2021, 2022, 2023, 2024))

    def test_splits_partition_the_points(self):
        pts = set(lh.PACIFIC) | set(lh.ATLANTIC) | set(lh.CORRIDOR)
        self.assertEqual(len(pts), 30)
        self.assertEqual((len(lh.PACIFIC), len(lh.ATLANTIC), len(lh.CORRIDOR)), (13, 12, 5))

    def test_variant_with_no_lead_and_no_haircut_is_6zl_C(self):
        hc = [rc.HOTEL * 24.0 + 300.0] * 180 + [rc.HOTEL * 24.0 - 400.0] * 185
        self.assertEqual(lh.variant_target(hc, 1.0, 0), ts.target_capped(ts.reserve_capped(hc)))

    def test_strict_climatology_uses_only_the_pool(self):
        # a test year's climatology from 2015-2019 cannot change when the test year's own sun changes
        a = lh.clim('P+40', 2022, lh.TRAIN)
        b = lh.clim('P+40', 2023, lh.TRAIN)
        self.assertEqual(a, b)  # same calendar (neither is a leap year), same pool

    def test_selection_rule(self):
        tot = {"R": (100.0, 10.0, 50.0)}
        for g in lh.GRID:
            tot[g] = (90.0, 9.0, 40.0)
        tot[(0.9, 20)] = (120.0, 12.0, 50.0)   # qualifies (ties R's dark hours), most km
        tot[(1.0, 60)] = (200.0, 20.0, 51.0)   # more km but over R's dark hours
        self.assertEqual(lh.select(tot), (0.9, 20))
        for g in lh.GRID:
            tot[g] = (90.0, 9.0, 60.0 + g[1])
        self.assertEqual(lh.select(tot), (1.0, 0))  # none qualifies: fewest dark hours


if __name__ == '__main__':
    unittest.main()
