"""Milestone 7ze: strip cross-coupling, the coupling override, the digitised curves and the pinned results."""
import csv
import math
import os
import sys
import unittest
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from marine_hull import strip as st  # noqa: E402

CURVES = os.path.join(HERE, "..", "experiments", "data", "kashiwagi2022_curves_fn020.csv")
RESULTS = os.path.join(HERE, "..", "experiments", "results_kashiwagi_baselines.txt")
U = 0.2 * math.sqrt(st.G * 2.0)


class CouplingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.hull = st.ModifiedWigleyStrip(2.0, 0.3, 0.125, n_stations=12, n_panels=10)

    def test_override_with_own_coupling_is_identity(self):
        h = self.hull
        w = math.sqrt(2 * math.pi / 2.2 * st.G)
        z0, t0, r0, _ = h.response(w, U)
        z1, t1, r1, _ = h.response(w, U, coupling=lambda we: h.cross_coupling(we, U))
        self.assertAlmostEqual(abs(z1 - z0), 0.0, places=10)
        self.assertAlmostEqual(abs(t1 - t0), 0.0, places=10)
        self.assertAlmostEqual(r1, r0, places=6)

    def test_strip_coupling_structure_on_a_symmetric_hull(self):
        """Gerritsma-Beukelman relative-motion form: A53 has no speed term (zero on a fore-aft symmetric hull),
        A35 = -U/we^2 B33, B35 = U A33 and B53 = -U A33 (bow-down convention), up to the end-station differences (about 9% on 12 stations)."""
        h = self.hull
        we = math.sqrt(10.0 * st.G / 2.0)
        a35, b35, a53, b53 = h.cross_coupling(we, U)
        a, b = h.sections(we)
        a33, b33 = sum(a) * h.dx, sum(b) * h.dx
        self.assertLess(abs(a53), 1e-9 * abs(a35))
        self.assertAlmostEqual(a35 / (-U / we ** 2 * b33), 1.0, delta=0.12)
        self.assertAlmostEqual(b35 / (U * a33), 1.0, delta=0.12)
        self.assertAlmostEqual(b53 / (-U * a33), 1.0, delta=0.12)

    def test_zero_speed_coupling_vanishes(self):
        a35, b35, a53, b53 = self.hull.cross_coupling(6.0, 0.0)
        for v in (a35, b35, a53, b53):
            self.assertLess(abs(v), 1e-6)


class DataTests(unittest.TestCase):
    def test_digitised_curves(self):
        cur = defaultdict(list)
        with open(CURVES) as f:
            for r in csv.DictReader(f):
                cur[(r["panel"], r["series"])].append((float(r["x"]), float(r["y"])))
        for panel in ("A35", "A53", "B35", "B53", "heave", "pitch", "raw"):
            for s in ("EUT", "NSM", "modified EUT", "modified NSM"):
                self.assertGreater(len(cur[(panel, s)]), 20, (panel, s))
        for panel in ("A35", "A53", "B35", "B53"):
            self.assertEqual(len(cur[(panel, "experiment")]), 20)
        peak = lambda k: max(cur[k], key=lambda p: p[1])
        self.assertAlmostEqual(peak(("raw", "EUT"))[1], 15.2, delta=0.2)     # Fig. 3's thin solid curve tops the frame
        self.assertAlmostEqual(peak(("heave", "EUT"))[1], 1.58, delta=0.03)
        # signs of the measured coupling at KL >= 3 (Fig. 1): B35 > 0, B53 < 0
        self.assertTrue(all(y > 0 for x, y in cur[("B35", "experiment")] if x >= 3))
        self.assertTrue(all(y < 0 for x, y in cur[("B53", "experiment")] if x >= 3))


class ResultsTests(unittest.TestCase):
    def test_pinned_results(self):
        txt = open(RESULTS).read()
        self.assertIn("E1 (motions within 10% of NSM at 1.0-2.0 and sigma peak within 15%): True", txt)
        self.assertIn("E2 signs False", txt)
        self.assertIn("E4 mean heave error at 1.0-1.3 with measured coupling -14.2% (< +10%): True", txt)
        self.assertIn("A35 = A53 = 0, strip B: heave mean error at 1.0-1.3 -7.3%", txt)
        self.assertIn("strip sigma peak 11.42 at lambda/L 1.05", txt)


if __name__ == "__main__":
    unittest.main()
