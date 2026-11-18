"""Milestone 6zj: a year-long deck-solar mission with one pack and no port call."""
import contextlib
import io
import os
import sys
import unittest

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, '..', 'experiments'))
sys.path.insert(0, os.path.join(HERE, '..', 'src'))
import run_flip_map as z  # noqa: E402
import run_year_pack as yp  # noqa: E402


class YearPackTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with contextlib.redirect_stdout(io.StringIO()):
            z.load_sun()

    def test_harvest_matches_hotel_at_the_6y_threshold(self):
        # 6y: the central boat's harvest equals its 30 W hotel load at 153 W/m2 daily mean
        self.assertAlmostEqual(yp.harvest_wh(0.153 * 24) / 24.0, 30.0, delta=0.1)

    def test_constant_dark_sun_goes_down_every_day_once_the_pack_is_empty(self):
        down, dark = yp.idle([0.0] * 30)
        # 10 kWh at 30 W carries 13.9 days; day 14 is the first short one
        self.assertEqual(down, 30 - 13)
        self.assertAlmostEqual(dark, 30 * 24 - 10000.0 / 30.0, places=6)

    def test_policies_are_feasible_and_foresight_dominates_idle(self):
        sun = [2.0 + 3.0 * ((d // 20) % 2) for d in range(120)]
        km_y, down_y, dark_y, vs = yp.causal(sun)
        km_f, down_f, dark_f = yp.foresight(sun)
        down_i, dark_i = yp.idle(sun)
        self.assertGreaterEqual(min(vs), 0.0)
        # (F) puts dark hours first: never more than the idle vehicle, which never moves
        self.assertLessEqual(dark_f, dark_i + 1e-6)
        self.assertLessEqual(dark_f, dark_y + 1e-6)
        self.assertGreater(km_f, 0.0)
        # with no penalty the plan covers at least the causal policy's distance
        self.assertGreaterEqual(yp.foresight(sun, penalty=0.0)[0], km_y - 1e-6)

    def test_year_sun_has_366_days_and_wraps(self):
        jan = yp.year_sun("P+0")
        jul = yp.year_sun("P+0", 7)
        self.assertEqual(len(jan), 366)
        self.assertEqual(sorted(jan), sorted(jul))
        self.assertEqual(jul[0], z.daily_sun("P+0", 7)[0])

    def test_headline_points(self):
        eq, n50 = yp.year_sun("P+0"), yp.year_sun("North-Sea")
        self.assertEqual(yp.idle(eq)[0], 0)
        self.assertEqual(yp.causal(eq)[1], 0)
        self.assertEqual(yp.idle(n50)[0], 153)
        self.assertEqual(yp.max_dark_free_hotel(eq), 54)
        self.assertEqual(yp.max_dark_free_hotel(n50), 10)


if __name__ == '__main__':
    unittest.main()
