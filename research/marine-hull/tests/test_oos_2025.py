import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_oos_2025 as O  # noqa: E402


class OutOfSample2025Tests(unittest.TestCase):
    def test_data_is_a_full_clean_year_at_every_point(self):
        d = json.load(open(O.DATA_2025))
        self.assertEqual(len(d), 30)
        for p, v in d.items():
            self.assertEqual(v["start"], "20250101")
            self.assertEqual(len(v["values"]), 365, p)
            self.assertTrue(all(x >= 0 for x in v["values"]), p)

    def test_learning_years_are_the_seasons_just_before(self):
        self.assertEqual(O.learn_years(2025, (1, 2, 3)), (2022, 2023, 2024))
        self.assertEqual(O.learn_years(2012, (1, 5)), (2007, 2011))
        self.assertTrue(all(y < 2025 for s in O.SETS[5] for y in O.learn_years(2025, s)))

    def test_half_widths(self):
        r = [1.1] * 6 + [0.9] * 6  # spread 0.1
        self.assertAlmostEqual(O.half_width("AP", r, 4), 0.1)
        self.assertAlmostEqual(O.half_width("AK", r, 4), 0.2)
        self.assertAlmostEqual(O.half_width("A1", r, 4), 0.4)
        self.assertAlmostEqual(O.half_width("A1", r, 5), 0.4)  # clamped
        self.assertEqual(O.half_width("C03", r, 3), 0.03)
        self.assertAlmostEqual(O.half_width("AP", [1.0] * 12, 1), 0.02)  # floor

    def test_rule_count(self):
        self.assertEqual(len(O.RULES), 1 + 5 * 3 + 26 * 6)

    def test_2025_loads_and_no_2025_enters_a_plan(self):
        O.load_2025()
        s = O.rc.series("North-Sea")
        self.assertIn("20251231", s)
        self.assertNotIn(2025, O.fy.CLIM_YEARS)


if __name__ == "__main__":
    unittest.main()
