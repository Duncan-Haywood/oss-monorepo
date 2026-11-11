"""Milestone 6r: the site-vs-vehicle-state planner for the Wave Glider."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'experiments'))
import run_waveglider_site as r  # noqa: E402


class WaveGliderSiteTests(unittest.TestCase):
    def test_km_day_is_linear_in_state_and_hs_power(self):
        self.assertAlmostEqual(r.km_day(0.5, [1.0, 1.0], 0.2), 43.2, places=9)
        self.assertAlmostEqual(r.km_day(0.5, [2.0], 0.2) / r.km_day(0.5, [1.0], 0.2), 2 ** 0.2, places=9)
        self.assertAlmostEqual(r.km_day(1.0, [1.7], 0.2) / r.km_day(0.5, [1.7], 0.2), 2.0, places=9)

    def test_state_ratio_is_the_same_at_every_buoy(self):
        _, best, worst, tab = r.plan(r.B)
        for kb, kw, _ in tab.values():
            self.assertAlmostEqual(kb / kw, best / worst, places=9)

    def test_mission_months_and_buoys(self):
        s = r.mission_states(r.B)
        self.assertEqual(sorted(s), ['2015-05', '2015-06', '2015-07', '2015-08', '2015-09', '2015-10'])
        hs = r.buoy_hs()
        self.assertEqual(sum(1 for k in hs if k[1] == 1), 9)
        self.assertEqual(sum(1 for k in hs if k[1] == 7), 11)


if __name__ == '__main__':
    unittest.main()
