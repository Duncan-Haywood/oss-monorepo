import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from robofab_slipcrit.crit import min_grid_force, rate_hold, tol_hold  # noqa: E402

TS = [0.05 * k for k in range(1, 21)]


class CritTest(unittest.TestCase):
    def test_min_grid_force_needs_all_larger_to_pass(self):
        self.assertEqual(min_grid_force([False, True, False, True, True], [1, 2, 3, 4, 5]), 4)
        self.assertIsNone(min_grid_force([True, True, False], [1, 2, 3]))

    def test_tolerance_vs_rate_on_a_synthetic_creep(self):
        ang = [-2.0 * t for t in TS]  # 2 deg/s creep: 1 deg at 0.5 s
        drop = [0.0] * len(TS)
        self.assertFalse(tol_hold(TS, ang, drop, 1.0))
        self.assertTrue(tol_hold(TS, ang, drop, 5.0))
        # 2 deg/s * 3 s = 0.105 rad * 35 mm = 3.7 mm > 2 mm
        self.assertFalse(rate_hold(TS, ang, drop, 40))
        slow = [-0.2 * t for t in TS]
        self.assertTrue(rate_hold(TS, slow, drop, 40))

    def test_free_fall_fails_rate(self):
        drop = [100.0 * t * t for t in TS]
        self.assertFalse(rate_hold(TS, [0.0] * len(TS), drop, 40))

    def test_committed_results_are_consistent(self):
        p = os.path.join(os.path.dirname(__file__), "..", "experiments", "results.json")
        d = json.load(open(p))
        self.assertEqual(len(d["rows"]), 32)
        for s in d["spread"]:
            self.assertGreaterEqual(s["ratio"], 1.0)


if __name__ == "__main__":
    unittest.main()
