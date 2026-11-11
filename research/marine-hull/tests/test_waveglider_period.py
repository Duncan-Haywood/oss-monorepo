"""Milestone 6s: the period term at a fixed vehicle state."""
import math
import os
import sys
import unittest
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'experiments'))
import run_waveglider_period as r  # noqa: E402
import run_waveglider_site as rs  # noqa: E402


class WaveGliderPeriodTests(unittest.TestCase):
    def test_fit_recovers_planted_exponents(self):
        rows = []
        for m, s in ((5, 0.4), (6, 0.6)):
            for i in range(40):
                hs, tp = 0.8 + 0.05 * i, 6.0 + (i * 7) % 9
                rows.append({"t": datetime(2015, m, 1 + i % 28), "hs": hs, "tp": tp,
                             "u": s * hs ** 0.3 * tp ** -0.2})
        b2, c = r.fit(rows)
        self.assertAlmostEqual(b2, 0.3, places=9)
        self.assertAlmostEqual(c, -0.2, places=9)

    def test_zero_period_term_reduces_to_6r(self):
        rows = r.load()
        s6, best6, worst6, tab6 = rs.plan(rs.B)
        s, best, worst, tab = r.plan(rows, rs.B, 0.0)
        self.assertEqual(sorted(s), sorted(s6))
        for k in tab6:
            self.assertAlmostEqual(tab[k][0], tab6[k][0], places=9)
            self.assertAlmostEqual(tab[k][1], tab6[k][1], places=9)

    def test_km_day_period_power(self):
        self.assertAlmostEqual(r.km_day(0.5, [(1.0, 8.0)], 0.2, 0.0), 43.2, places=9)
        self.assertAlmostEqual(r.km_day(0.5, [(1.0, 16.0)], 0.2, -0.1) / r.km_day(0.5, [(1.0, 8.0)], 0.2, -0.1),
                               2 ** -0.1, places=9)
        self.assertTrue(math.isfinite(r.fit([x for x in r.load() if x["km"] <= 300])[1]))


if __name__ == '__main__':
    unittest.main()
