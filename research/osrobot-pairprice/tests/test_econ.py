import unittest
from osrobot_pairprice import econ as E


class T(unittest.TestCase):
    def test_swaps(self):
        self.assertEqual(E.swaps(0.0), 0)
        self.assertEqual(E.swaps(20.0), 0)
        self.assertEqual(E.swaps(20.1), 1)
        self.assertEqual(E.swaps(60.0), 2)

    def test_inline_cost_hand_value(self):
        # 60 min: 5000*0.3*1/500 = 3.0 capital; 3 min at 20 USD/h = 1.0; 100 Wh at 0.15 = 0.015
        self.assertAlmostEqual(E.inline_cost(60.0, 100.0), 4.015)

    def test_pair_cost_hand_value(self):
        # 30 min fly (1 swap), 30 min ground: scout 33 min -> 2500*.3*.55/500 = 0.825; treater 3500*.3*.5/500 = 1.05
        # people: (8+3+3)/60*20 = 4.6667; energy 0
        self.assertAlmostEqual(E.pair_cost(30.0, 30.0, 0.0), 0.825 + 1.05 + 14 / 3)

    def test_held_costs_at_least_unheld(self):
        a = E.pair_cost(10.0, 15.0, 100.0)
        b = E.pair_cost(10.0, 15.0, 100.0, held=True)
        self.assertGreater(b, a)

    def test_interp_no_extrapolation(self):
        self.assertAlmostEqual(E.interp([0, 1, 2], [0, 10, 40], 1.5), 25.0)
        self.assertIsNone(E.interp([0, 1, 2], [0, 10, 40], 3.0))

    def test_fit_line_exact(self):
        c, m, r2 = E.fit_line([1, 2, 3], [3, 5, 7])
        self.assertAlmostEqual(c, 1.0); self.assertAlmostEqual(m, 2.0); self.assertAlmostEqual(r2, 1.0)

    def test_bisect(self):
        self.assertAlmostEqual(E.bisect(lambda x: x - 2.5, 0, 10), 2.5)
        self.assertIsNone(E.bisect(lambda x: x + 1, 0, 10))
