"""Milestone 7zb: the method figure's energy split (experiments/run_energy_split.py)."""
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "paper"))

import make_figures  # noqa: E402
import run_energy_split as es  # noqa: E402


class EnergySplitTests(unittest.TestCase):
    def test_minimum_reproduces_fig2_monohull_peak(self):
        # Fig. 2a: monohull peak 823.7 km at 1.00 m/s on the same basis
        best = min(es.SPEEDS, key=lambda u: sum(es.split(u).values()))
        self.assertAlmostEqual(best, 1.00)
        self.assertAlmostEqual(es.WH / sum(es.split(best).values()), 823.7, delta=0.05)

    def test_form_part_is_k_over_one_plus_k_of_viscous(self):
        for u in (0.4, 1.0, 2.2):
            d = es.split(u)
            self.assertAlmostEqual(d["form"] / (d["friction"] + d["form"]), es.K / (1 + es.K), places=12)

    def test_hotel_term_is_hotel_power_over_speed(self):
        # 30 W at 1 m/s for 1 km = 1000 s -> 30000 J = 8.333 Wh
        self.assertAlmostEqual(es.split(1.0)["hotel"], 30.0 / 3.6, places=9)

    def test_results_rows_sum_and_figure_builds(self):
        with open(make_figures.ES_RESULTS) as f:
            rows = make_figures.parse_energy_split(f.read())
        self.assertEqual(len(rows), len(es.SPEEDS))
        for r in rows:
            self.assertAlmostEqual(sum(r[1:5]), r[5], delta=0.005)
        tex = make_figures.tikz_energy_split(rows)
        self.assertEqual(tex.count(r"\fill[gray!"), 6)   # three bands, three legend swatches
        self.assertIn("best range 1.00", tex)


if __name__ == "__main__":
    unittest.main()
