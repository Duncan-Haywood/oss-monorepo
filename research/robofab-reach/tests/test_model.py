import math, unittest
from robofab_reach.model import reachable, targets, feasible, min_link, GRIPPER


class T(unittest.TestCase):
    def test_full_extension_boundary(self):
        self.assertTrue(reachable(200, 0, 0, 100, 100))
        self.assertFalse(reachable(200.5, 0, 0, 100, 100))

    def test_too_close_needs_fold(self):
        self.assertFalse(reachable(1, 0, 0, 100, 100, elbow=(0, 1.0)))   # needs a ~180 deg fold
        self.assertTrue(reachable(1, 0, 0, 100, 100))

    def test_shoulder_limit(self):
        # solutions have q1 = -90 or 0 deg; excluding both fails
        self.assertTrue(reachable(100, -100, 0, 100, 100))
        self.assertFalse(reachable(100, -100, 0, 100, 100, shoulder=(0.1, 1.5)))

    def test_six_free_parts_three_points_each(self):
        t = targets()
        self.assertEqual(len(t), 6)
        self.assertTrue(all(set(v) == {"place", "lift", "pick"} for v in t.values()))

    def test_lift_above_place(self):
        for v in targets().values():
            self.assertGreater(v["lift"][2], v["place"][2])

    def test_min_link_monotone_in_gap(self):
        a = min_link(100, targets(tray_gap=60), step=10, lo=40, hi=400)
        b = min_link(100, targets(tray_gap=240), step=10, lo=40, hi=400)
        self.assertLessEqual(a, b)

    def test_found_arm_is_feasible_and_shorter_is_not(self):
        pts = targets()
        l = min_link(100, pts, step=10, lo=40, hi=400)
        from robofab_reach.model import best_base
        self.assertIsNotNone(best_base(l, l, 100, pts))
        self.assertIsNone(best_base(l - 10, l - 10, 100, pts))


if __name__ == "__main__":
    unittest.main()
