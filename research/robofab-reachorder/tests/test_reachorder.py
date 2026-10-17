import unittest
from robofab_reachorder.assembly import Model
from robofab_reachorder.reachorder import valid_orders, order_targets, min_link, reachable, feasible


class T(unittest.TestCase):
    def setUp(self):
        self.m = Model(arm="side")
        self.orders = valid_orders(self.m)

    def test_order_count_matches_selfparts(self):
        self.assertEqual(len(self.orders), 384)

    def test_reachable_boundary(self):
        self.assertTrue(reachable(100, 0, 0, 50, 50))
        self.assertFalse(reachable(100.5, 0, 0, 50, 50))

    def test_lift_depends_on_order(self):
        a = order_targets(self.m, self.orders[0], 30)
        sets = {order_targets(self.m, o, 30) for o in self.orders}
        self.assertGreater(len(sets), 1)
        self.assertIn(a, sets)

    def test_min_link_is_tight(self):
        t = order_targets(self.m, self.orders[0], 30)
        l = min_link(t, 100)
        bases = [(i * 20.0, j * 20.0) for i in range(-20, 21) for j in range(-20, 21)]
        self.assertTrue(any(feasible(b, l, 100, t) for b in bases))
        self.assertFalse(any(feasible(b, l - 10, 100, t) for b in bases))

    def test_higher_shoulder_needs_longer_arm(self):
        t = order_targets(self.m, self.orders[0], 30)
        self.assertLessEqual(min_link(t, 100), min_link(t, 200))


if __name__ == "__main__":
    unittest.main()
