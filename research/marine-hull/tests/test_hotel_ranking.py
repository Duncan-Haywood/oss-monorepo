import io
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "paper"))

import make_figures  # noqa: E402
import run_hotel_ranking as hr  # noqa: E402
import run_range_speed as rr  # noqa: E402


class HotelRankingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(make_figures.HR_RESULTS) as f:
            cls.text = f.read()
        cls.rows, cls.fn03 = make_figures.parse_hotel_ranking(cls.text)

    def test_crossing_interpolates_in_log_space(self):
        self.assertAlmostEqual(hr.crossing([10.0, 100.0], [0.5, 1.5]), 10 ** 1.5, places=6)
        self.assertIsNone(hr.crossing([1.0, 10.0, 100.0], [0.2, 0.5, 0.9]))
        self.assertEqual(hr.crossing([1.0, 10.0], [1.2, 1.3]), 1.0)

    def test_peak_at_30w_matches_milestone_7t(self):
        mono = rr.michell_r(4.0, 1, 0.0, 0.25, 0.0, rr.DISP)
        km, u = hr.peak_at(rr.DISP, mono, 30.0)
        self.assertAlmostEqual(km, 823.7, delta=0.05)
        self.assertEqual(u, 1.00)

    def test_grid_is_one_to_ten_kilowatt(self):
        self.assertEqual(len(self.rows), 49)
        self.assertAlmostEqual(self.rows[0][0], 1.0)
        self.assertAlmostEqual(self.rows[-1][0], 10000.0)

    def test_monohull_leads_in_the_sourced_band(self):
        for h, _, rat in self.rows:
            if h <= hr.SOURCED_BAND:
                self.assertLess(max(rat.values()), 1.0, h)

    def test_every_crossover_is_past_froude_point_three(self):
        for h, fn, rat in self.rows:
            if max(rat.values()) >= 1.0:
                self.assertGreater(fn, 0.3, h)
        self.assertGreater(self.fn03, hr.SOURCED_BAND)

    def test_displacement_rungs_never_overtake(self):
        for _, _, rat in self.rows:
            self.assertLess(rat["catamaran"], 1.0)
            self.assertLess(rat["SWATH"], 1.0)

    def test_committed_file_is_reproduced(self):
        buf = io.StringIO()
        hr.main(out=buf)
        self.assertEqual(buf.getvalue(), self.text)


if __name__ == "__main__":
    unittest.main()
