import csv
import math
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from marine_hull import strip as st  # noqa: E402

DATA = os.path.join(HERE, "..", "experiments", "data", "kashiwagi2022_slender_wigley_fn020.csv")
RESULTS = os.path.join(HERE, "..", "experiments", "results_wigley_seakeeping_tank.txt")


class ModifiedWigleyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.hull = st.ModifiedWigleyStrip(2.0, 0.3, 0.125, n_stations=12, n_panels=10)

    def test_form_matches_kashiwagi_table_1(self):
        h = self.hull
        self.assertAlmostEqual(h.section_area(0.0) / (0.3 * 0.125), 0.9091, places=4)   # Cm
        fine = st.ModifiedWigleyStrip.__new__(st.ModifiedWigleyStrip)
        fine.bm, fine.t = 0.3, 0.125
        n = 400
        vol = sum(fine.section_area(-1 + (i + 0.5) * 2 / n) for i in range(n)) * 2.0 / n
        self.assertAlmostEqual(vol / (2.0 * 0.3 * 0.125), 0.5607, places=4)               # CB
        self.assertAlmostEqual(vol, 0.04205, places=5)
        self.assertAlmostEqual(h.area_wp, 0.4160, delta=0.004)                             # 12 stations, midpoint sum

    def test_section_nodes_span_keel_to_waterline(self):
        pts = st.modified_wigley_section(0.0, 1.2, 1.0, 16)
        self.assertAlmostEqual(pts[0][0], 0.0, places=12)
        self.assertAlmostEqual(pts[0][1], -1.0, places=12)
        self.assertAlmostEqual(pts[-1][0], 1.2, places=12)
        self.assertAlmostEqual(pts[-1][1], 0.0, places=12)

    def test_long_wave_limits(self):
        h = self.hull
        u = 0.2 * math.sqrt(st.G * 2.0)
        k = 2 * math.pi / (20 * 2.0)
        z, th, raw, _ = h.response(math.sqrt(k * st.G), u)
        self.assertAlmostEqual(abs(z), 1.0, delta=0.03)
        self.assertAlmostEqual(abs(th) / k, 1.0, delta=0.05)
        self.assertLess(raw / (1000 * st.G * 0.3 ** 2 / 2.0), 0.2)


class DataTests(unittest.TestCase):
    def test_digitised_counts_and_ranges(self):
        rows = list(csv.DictReader(open(DATA)))
        n = {}
        for r in rows:
            n[r["series"]] = n.get(r["series"], 0) + 1
            x, v = float(r["lambda_over_L"]), float(r["value"])
            self.assertTrue(0.25 < x < 3.05)
            self.assertTrue(0.0 <= v < 15.0)
        self.assertEqual(n, {"heave": 21, "pitch": 20, "dyn_2p5cm": 16, "dyn_1p0cm": 19,
                             "measured_wave_1p0cm": 19, "superposed_wave_1p0cm": 10})
        # markers sit on the 0.1 lambda/L test grid (drawing precision)
        for r in rows:
            if r["figure"] == "fig3":
                x = float(r["lambda_over_L"])
                self.assertLess(abs(x * 20 - round(x * 20)), 0.04)


class ResultsTests(unittest.TestCase):
    """The committed results file carries the numbers LOG.md and the paper quote."""

    @classmethod
    def setUpClass(cls):
        cls.text = open(RESULTS).read()

    def test_headline_numbers(self):
        for s in ("strip peak 11.42 at lambda/L 1.05", "STAWAVE-2 peak 5.42 at lambda/L 1.09",
                  "measured mean 5.773; strip 5.540 (0.96); strip+refl 6.862 (1.19); STAWAVE-2 5.438 (0.94)",
                  "fitted zeta (mean): 0.025", "row 0.025 2.41 1.74 0.72 -3.69 -13.29 True",
                  "reflection scale f_r 0.402", "row_scaled 0.006 2.80 2.02 0.29 -3.65 -13.14 True"):
            self.assertIn(s, self.text)

    def test_every_monohull_row_keeps_the_200_w_scope(self):
        rows = [ln for ln in self.text.split("## C.")[1].splitlines() if ln.startswith("row")]
        self.assertGreaterEqual(len(rows), 6)
        self.assertTrue(all(ln.split()[-1] == "True" for ln in rows))
