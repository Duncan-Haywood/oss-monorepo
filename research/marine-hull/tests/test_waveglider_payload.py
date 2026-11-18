"""Milestone 6zzza: the Wave Glider's payload on its own deck-solar budget."""
import os
import sys
import unittest

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, '..', 'experiments'))
sys.path.insert(0, os.path.join(HERE, '..', 'src'))
import run_reserve_curve as rc  # noqa: E402
import run_waveglider_payload as wp  # noqa: E402
import run_year_pack as yp  # noqa: E402


class WaveGliderPayloadTests(unittest.TestCase):
    def test_sv3_deck_is_225_w_nameplate_times_derate(self):
        self.assertAlmostEqual(wp.wg_harvest_wh(1.0), 225.0 * 0.85)
        self.assertAlmostEqual(wp.wg_harvest_wh(24.0) / 24.0, 191.25)

    def test_boat_panel_and_pack_with_no_bus_reproduce_the_6zj_idle_vehicle(self):
        boat_peak = yp.AREA * 0.20 * 1000.0
        for p in ("P-50", "A+30", "North-Sea"):
            sun = rc.year_sun(p, 2020)
            down, dark, bus, _, _ = wp.wg_year(sun, 0.0, 30.0, cap=yp.C, peak=boat_peak)
            idle_down, idle_dark = yp.idle(sun)
            self.assertEqual(down, idle_down)
            self.assertAlmostEqual(dark, idle_dark, places=6)
            self.assertEqual(bus, 0.0)

    def test_bus_is_served_before_the_payload(self):
        # no sun: 6.8 kWh at 5 + 30 W = 840 Wh/day carries 8 full days (6,720 Wh); day 9 has 80 Wh,
        # all of which goes to the bus (8 dark bus hours) and none to the payload
        down, dark, bus, pd, bd = wp.wg_year([0.0] * 10, 5.0)
        self.assertEqual(pd[:8], [0.0] * 8)
        self.assertEqual(pd[8], 24.0)
        self.assertAlmostEqual(bd[8], 8.0)
        self.assertEqual(bd[9], 24.0)
        self.assertEqual(down, 2)

    def test_reserve_holds_30_days_of_bus(self):
        _, _, _, pd, _ = wp.wg_year([0.0] * 10, 5.0, reserve_days=1)
        # reserve 3,600 Wh; the 120 Wh/day bus also draws the pack, so after three full payload days
        # (soc 4,280 Wh) day 4 has 4,160 - 3,600 = 560 Wh for the payload: 160 Wh short, 5.33 dark hours
        self.assertEqual(pd[:3], [0.0] * 3)
        self.assertAlmostEqual(pd[3], 160.0 / 30.0)
        self.assertEqual(pd[4], 24.0)

    def test_dark_free_payload_falls_with_the_bus(self):
        sun = rc.year_sun("P+40", 2018)
        self.assertGreaterEqual(wp.max_dark_free_payload(sun, 0.0), wp.max_dark_free_payload(sun, 5.0))


if __name__ == '__main__':
    unittest.main()
