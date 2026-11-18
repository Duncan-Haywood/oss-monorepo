"""Milestone 6y: deck-solar boat against the Wave Glider at the corridor sites."""
import os
import sys
import unittest

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, '..', 'experiments'))
sys.path.insert(0, os.path.join(HERE, '..', 'src'))
import run_wave_vs_sun_sites as y  # noqa: E402


class WaveVsSunSitesTests(unittest.TestCase):
    def test_sustained_is_zero_below_hotel_and_balances_above(self):
        boat = y.CENTRAL
        threshold = boat[1] / y.harvest_w(boat, 1.0)  # W/m2 at which harvest equals the hotel load
        self.assertAlmostEqual(threshold, 30.0 / (0.6 * 4 * 0.48 * 0.20 * 0.85), places=9)
        self.assertEqual(y.sustained(boat, 0.99 * threshold), 0.0)
        v = y.sustained(boat, 247.0)
        self.assertGreater(v, 0.5)
        self.assertAlmostEqual(y.load_w(v, 4.0, 30.0), y.harvest_w(boat, 247.0), delta=1e-6)

    def test_campaign_at_constant_sun_beats_sustained_only_by_the_pack(self):
        boat = y.CENTRAL
        w = 200.0
        days = [w * 24.0 / 1000.0] * 31
        a = y.sustained(boat, w)
        b = y.campaign(boat, days)
        self.assertGreater(b, a)
        # with no pack the campaign is the sustained speed
        self.assertAlmostEqual(y.campaign(boat, days, battery_wh=0.0), a, places=6)
        # the pack is spent over the month: extra load is 10 kWh / (31 x 24 h)
        extra = y.load_w(b, 4.0, 30.0) - y.harvest_w(boat, w)
        self.assertAlmostEqual(extra, y.BATTERY_WH / (31 * 24.0), delta=0.05)

    def test_worst_week_is_lowest_running_mean(self):
        self.assertAlmostEqual(y.worst_week([5, 5, 5, 1, 1, 1, 1, 1, 1, 1, 5]), 1.0)
        self.assertAlmostEqual(y.worst_week([1, 2, 3, 4, 5, 6, 7, 8]), 4.0)

    def test_committed_insolation_and_wave_plan(self):
        for site in y.CORRIDOR:
            self.assertEqual(len(y.insolation(site, 1)), 31)
            self.assertEqual(len(y.insolation(site, 7)), 31)
        wg = y.wave_plan()
        self.assertEqual(len(wg), 10)
        self.assertAlmostEqual(wg[("North-Sea", 1)][0], 74.5, delta=0.05)
        self.assertAlmostEqual(wg[("Florida-Straits", 7)][0], 43.5, delta=0.05)


if __name__ == '__main__':
    unittest.main()
