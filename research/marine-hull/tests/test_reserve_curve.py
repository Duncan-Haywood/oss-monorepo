"""Milestone 6zk: a climatology reserve curve for the deck-solar pack."""
import os
import sys
import unittest

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, '..', 'experiments'))
sys.path.insert(0, os.path.join(HERE, '..', 'src'))
import run_reserve_curve as rc  # noqa: E402
import run_year_pack as yp  # noqa: E402


class ReserveCurveTests(unittest.TestCase):
    def test_constant_half_target_reproduces_6zj_causal_policy(self):
        sun = rc.year_sun("P+40", 2024)
        self.assertEqual(rc.causal_target(sun, [0.5 * rc.C] * len(sun)), yp.causal(sun)[:3])

    def test_reserve_is_zero_when_harvest_always_covers_hotel(self):
        self.assertEqual(max(rc.reserve([rc.HOTEL * 24.0 + 1.0] * 365)), 0.0)

    def test_reserve_counts_a_dark_spell_backwards(self):
        # 10 days 240 Wh short each, then surplus: 2,400 Wh needed at the spell's start, 0 after it
        hc = [rc.HOTEL * 24.0 + 500.0] * 100 + [rc.HOTEL * 24.0 - 240.0] * 10 + [rc.HOTEL * 24.0 + 500.0] * 255
        R = rc.reserve(hc)
        self.assertAlmostEqual(R[100], 2400.0)
        self.assertAlmostEqual(R[109], 240.0)
        self.assertEqual(R[110], 0.0)
        self.assertEqual(max(rc.target_from_reserve(R)), 2400.0 if 2400.0 > 0.5 * rc.C else 0.5 * rc.C)

    def test_equinox_targets_cover_the_right_season(self):
        n = rc.target_equinox(40, 2023)
        s = rc.target_equinox(-40, 2023)
        self.assertEqual(n[0], rc.C)           # 1 January, northern winter
        self.assertEqual(s[0], 0.5 * rc.C)
        self.assertEqual(n[180], 0.5 * rc.C)   # 30 June
        self.assertEqual(s[180], rc.C)
        self.assertEqual(set(rc.target_equinox(0, 2024)), {0.5 * rc.C})

    def test_climatology_leaves_its_own_year_out(self):
        # each year's 2024 sun must not enter the 2024 curve; the curve changes when 2024 is the only change
        a = rc.climatology_wh("P+40", 2024)
        b = rc.climatology_wh("P+40", 2024, years=tuple(range(2015, 2024)))
        self.assertEqual(len(a), 366)
        self.assertEqual(a, b)

    def test_ten_years_have_full_data(self):
        for yr in rc.YEARS:
            self.assertEqual(len(rc.year_sun("A+50", yr)), 366 if yr % 4 == 0 else 365)
            self.assertEqual(len(rc.year_sun("Gulf-of-Alaska", yr)), 366 if yr % 4 == 0 else 365)


if __name__ == "__main__":
    unittest.main()
