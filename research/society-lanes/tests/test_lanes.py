import os
import random
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import lanes as L  # noqa: E402


class TestLanes(unittest.TestCase):
    def test_lane_order_mixed_bin(self):
        # Quality audit 2026-11-22: two walkers one way and one the other in a
        # single bin give ((2 - 1) / 3)^2 = 1/9; an |.| instead of a square gives 1/3.
        self.assertAlmostEqual(L.lane_order_frame([(10, 1), (20, 1), (25, -1)]), 1 / 9)

    def test_right_offset_sign(self):
        # heading +y, right is +x; heading -y, right is -x (z-up right-handed frame)
        self.assertAlmostEqual(L.right_offset(270, 1, 360), 0.5)
        self.assertAlmostEqual(L.right_offset(90, -1, 360), 0.5)
        self.assertAlmostEqual(L.right_offset(90, 1, 360), -0.5)

    def test_walkers_direction_and_filters(self):
        rows = [(1, f, 270.0, -390.0 + 30 * f) for f in range(20)]       # up, 570 cm
        rows += [(2, f, 90.0, 390.0 - 30 * f) for f in range(20)]        # down
        rows += [(3, f, 100.0, 0.0 + f) for f in range(20)]              # barely moves
        rows += [(4, f, 100.0, -300.0 + 50 * f) for f in range(5)]       # too few frames
        ws = L.walkers(rows, 360.0)
        self.assertEqual(sorted(ws), [1, 2])
        self.assertEqual(ws[1][0], 1)
        self.assertEqual(ws[2][0], -1)
        self.assertGreater(L.mean_right_offset(*ws[1], 360.0), 0)
        self.assertGreater(L.mean_right_offset(*ws[2], 360.0), 0)

    def test_lane_order_extremes(self):
        segregated = [(10, 1), (20, 1), (100, -1), (110, -1)]
        self.assertAlmostEqual(L.lane_order_frame(segregated), 1.0)
        mixed = [(10, 1), (12, -1), (100, 1), (105, -1)]
        self.assertAlmostEqual(L.lane_order_frame(mixed), 0.0)

    def test_null_below_segregated(self):
        rng = random.Random(1)
        frames = {f: [(x, 1) for x in range(0, 150, 15)] + [(x, -1) for x in range(180, 330, 15)]
                  for f in range(5)}
        self.assertAlmostEqual(L.lane_order(frames), 1.0)
        null = L.lane_order_null(frames, 20, rng)
        self.assertLess(max(null), 0.9)

    def test_spearman_and_bootstrap(self):
        self.assertAlmostEqual(L.spearman([1, 2, 3], [3, 2, 1]), -1.0)
        lo, hi = L.bootstrap_share([1] * 9 + [0], 500, random.Random(2))
        self.assertTrue(0.5 < lo <= 0.9 <= hi <= 1.0)


    def test_rotate_x_corridor_keeps_handedness(self):
        # heading +x near y = 50 (low y): right-handed z-up, right of +x is -y, so on own right
        rows = [(1, f, -390.0 + 30 * f, 50.0) for f in range(20)]
        rows += [(2, f, 390.0 - 30 * f, 50.0) for f in range(20)]   # heading -x at low y: on own left
        ws = L.walkers(L.rotate_x_corridor(rows, 400.0), 400.0)
        self.assertEqual(ws[1][0], 1)
        self.assertEqual(ws[2][0], -1)
        self.assertGreater(L.mean_right_offset(*ws[1], 400.0), 0)
        self.assertLess(L.mean_right_offset(*ws[2], 400.0), 0)

    def test_bootstrap_diff_clustered(self):
        rng = random.Random(1)
        a = [[1] * 18 + [0] * 2] * 4
        b = [[1] * 10 + [0] * 10] * 4
        lo, hi = L.bootstrap_diff_clustered(a, b, 400, rng)
        self.assertLess(lo, 0.4)
        self.assertGreater(hi, 0.4)
        self.assertGreater(lo, 0.1)

if __name__ == "__main__":
    unittest.main()
