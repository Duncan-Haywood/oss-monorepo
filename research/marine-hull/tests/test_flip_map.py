"""Milestone 6z: twelve-month flip map of deck-solar boat against the Wave Glider."""
import contextlib
import io
import os
import sys
import unittest

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, '..', 'experiments'))
sys.path.insert(0, os.path.join(HERE, '..', 'src'))
import run_flip_map as f  # noqa: E402


def _rows():
    with contextlib.redirect_stdout(io.StringIO()):
        f.load_sun()
        return f.evaluate(*f.vehicle())


class FlipMapTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = _rows()

    def test_committed_data_cover_the_transect(self):
        # 31 points x 12 months, less 7 sea-ice months at A-60
        self.assertEqual(len(self.rows), 31 * 12 - 7)
        for m in range(1, 13):
            self.assertIn(("P+0", m), self.rows)
        self.assertNotIn(("A-60", 7), self.rows)

    def test_km_quant_matches_constant_sea(self):
        a = 0.533
        self.assertAlmostEqual(f.km_quant(1.0, a, [0.25] * 20), 86.4 * 0.25 ** a, places=9)

    def test_flip_takes_smallest_latitude_and_none_when_boat_wins(self):
        rows = {(f.name("P", la), 1): {"A": 50.0, "wg": 40.0} for la in f.LATS}
        self.assertIsNone(f.flip(rows, "P", 1, "N"))
        rows[(f.name("P", 30), 1)]["wg"] = 60.0
        rows[(f.name("P", 50), 1)]["wg"] = 60.0
        self.assertEqual(f.flip(rows, "P", 1, "N"), 30)
        self.assertIsNone(f.flip(rows, "P", 1, "S"))
        # a deflated Wave Glider plan can remove the flip
        self.assertEqual(f.flip(rows, "P", 1, "N", scale=1.6), None)

    def test_headline_results(self):
        r = self.rows
        # boat wins every month on the equator on both meridians; 6y's corridor rows reappear in Jan and Jul
        self.assertTrue(all(r[("P+0", m)]["A"] > r[("P+0", m)]["wg"] for m in range(1, 13)))
        self.assertTrue(all(r[("A+0", m)]["A"] > r[("A+0", m)]["wg"] for m in range(1, 13)))
        self.assertEqual(r[("North-Sea", 1)]["A"], 0.0)
        self.assertEqual([f.flip(r, mer, m, side) for mer in f.MERIDIANS for side, m in (("N", 1), ("S", 7))],
                         [30, 20, 30, 30])


if __name__ == '__main__':
    unittest.main()
