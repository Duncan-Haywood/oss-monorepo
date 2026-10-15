import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from robofab_slipmu.crit import min_grid_force, rate_hold, tol_hold  # noqa: E402
from robofab_slipmu.model import torque_bounds  # noqa: E402
from robofab_slipmu.sim import mjcf  # noqa: E402

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
        p = os.path.join(os.path.dirname(__file__), '..', 'experiments', 'results.json')
        d = json.load(open(p))
        self.assertEqual(len(d['summary']), 6 * 16)
        self.assertEqual({(r['mu'], r['az']) for r in d['summary']}, {(m, a) for m in (0.3, 0.5, 0.8) for a in (0.0, 5.0)})
        for s in d['summary']:
            self.assertEqual(len(s['min_forces']), 32)
            self.assertEqual(s['worst_spread'], max(s['spread_by_L'].values()))

    def test_reproduces_slipthresh_baseline_row(self):
        # mu 0.5, az 0, T 3 s, tip 2 mm: the spreads robofab-slipthresh reported for 20, 30, 40, 60 mm bars
        p = os.path.join(os.path.dirname(__file__), '..', 'experiments', 'results.json')
        r = next(s for s in json.load(open(p))['summary'] if (s['mu'], s['az'], s['task_s'], s['tip_mm']) == (0.5, 0.0, 3.0, 2.0))
        self.assertEqual([round(r['spread_by_L'][k], 1) for k in ('20', '30', '40', '60')], [32.9, 400.0, 242.7, 89.4])

    def test_lift_acceleration_enters_gravity_and_bound(self):
        self.assertIn('gravity="0 0 -14.81"', mjcf(40, 0.5, 3, 0.005, az=5.0))
        self.assertIn('gravity="0 0 -9.81"', mjcf(40, 0.5, 3, 0.005))
        a, b = torque_bounds(40, 0.5), torque_bounds(40, 0.5, az=5.0)
        self.assertAlmostEqual(b['lower'] / a['lower'], 14.81 / 9.81)
        self.assertAlmostEqual(torque_bounds(40, 0.25)['upper'] / a['upper'], 2.0)

    def test_looser_thresholds_pass_more(self):
        drop = [0.0] * len(TS)
        ang = [-2.0 * t for t in TS]  # 2 deg/s: 3.7 mm over 3 s, 0.6 mm over 0.5 s
        self.assertFalse(rate_hold(TS, ang, drop, 40, task_s=3.0, tip_mm=2.0))
        self.assertTrue(rate_hold(TS, ang, drop, 40, task_s=3.0, tip_mm=10.0))
        self.assertTrue(rate_hold(TS, ang, drop, 40, task_s=0.5, tip_mm=2.0))


if __name__ == "__main__":
    unittest.main()
