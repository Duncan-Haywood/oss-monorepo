"""Milestone 6v: the Wave Glider km/day plan with the on-board heave-velocity law."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'experiments'))
import run_waveglider_site_period as r  # noqa: E402


class WaveGliderSitePeriodTests(unittest.TestCase):
    def test_ratio_law_scales_with_heave_velocity(self):
        one = r.km_day(1.0, [(1.0, 5.0)], r.ratio_g)
        self.assertAlmostEqual(one, 86.4 * 0.2 ** r.A, places=9)
        # doubling both height and period leaves Hs/T and so the plan unchanged
        self.assertAlmostEqual(r.km_day(1.0, [(2.0, 10.0)], r.ratio_g), one, places=9)
        self.assertAlmostEqual(r.km_day(1.0, [(1.0, 5.0)], r.ratio_g, kt=2.0) / one, 0.5 ** r.A, places=9)

    def test_states_cover_june_to_october(self):
        rows = r.s2_rows()
        self.assertEqual(len(rows), 3281)
        s = r.states(rows, r.ratio_g)
        self.assertEqual(sorted(s), ['2015-06', '2015-07', '2015-08', '2015-09', '2015-10'])
        self.assertEqual(max(s, key=s.get), '2015-06')

    def test_state_ratio_is_the_same_at_every_buoy(self):
        _, best, worst, tab = r.plan(r.s2_rows(), r.ratio_g)
        self.assertEqual(sum(1 for k in tab if k[1] == 1), 9)
        self.assertEqual(sum(1 for k in tab if k[1] == 7), 11)
        for kb, kw in tab.values():
            self.assertAlmostEqual(kb / kw, best / worst, places=9)

    def test_percentile_and_edge_check(self):
        self.assertAlmostEqual(r.pct([0, 1, 2, 3, 4], 0.5), 2.0)
        self.assertAlmostEqual(r.pct([0, 10], 0.05), 0.5)
        rows = r.s2_rows()
        s = r.states(rows, r.ratio_g)
        bins = r.edge_check(rows, r.ratio_g, s)
        # every hour in a month with a state index (November has 8 hours, below the 100-hour rule) lands in one bin
        self.assertEqual(sum(n for _, _, n, _ in bins), sum(1 for x in rows if x['month'] in s))


if __name__ == '__main__':
    unittest.main()
