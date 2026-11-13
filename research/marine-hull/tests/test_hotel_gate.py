import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_hotel_gate as hg  # noqa: E402
import run_pack_hotel_tau as pt  # noqa: E402

POINT, YEAR = "P+50", 2022


class HotelGateTests(unittest.TestCase):
    def test_theta1_column_reproduces_6zp(self):
        key = (5000.0, 50.0, POINT, YEAR)
        _, a = hg.score(key)
        _, b = pt.score(key)
        for tau in hg.TAUS:
            self.assertAlmostEqual(a[("K", tau, 1.0)][0], b[("K", tau)][0], places=6)
            self.assertAlmostEqual(a[("K", tau, 1.0)][1], b[("K", tau)][1], places=6)
        self.assertAlmostEqual(a[hg.BASE][0], b[pt.BASE][0], places=6)
        self.assertAlmostEqual(a[hg.BASE][1], b[pt.BASE][1], places=6)

    def test_lower_gate_binds_on_fewer_days(self):
        _, a = hg.score((2500.0, 50.0, POINT, YEAR))
        for tau in hg.TAUS:
            g = [a[("K", tau, th)][2] for th in hg.THETAS]
            self.assertTrue(all(x >= y for x, y in zip(g, g[1:])))
            self.assertEqual(g[-1], 0)

    def test_selection_rule(self):
        tot = {g: (100.0, 50.0, 0) for g in hg.GRID}
        tot[hg.BASE] = (100.0, 10.0, 0)
        tot[("K", 20, 0.5)] = (108.0, 9.0, 0)
        tot[("K", 10, 0.0)] = (115.0, 10.5, 0)
        self.assertEqual(hg.select(tot), ("K", 20, 0.5))


if __name__ == "__main__":
    unittest.main()
