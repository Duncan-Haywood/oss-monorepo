import math
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from marine_hull import strip as st  # noqa: E402

RESULTS = os.path.join(HERE, "..", "experiments", "results_strip_viscous.txt")


class StripViscousTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.hull = st.WigleyStrip(4.0, 0.4, 0.274, n_stations=12, n_panels=10)

    def test_zero_damping_is_unchanged(self):
        h0 = self.hull
        h1 = st.WigleyStrip(4.0, 0.4, 0.274, n_stations=12, table=h0.table, zeta_v=0.0)
        self.assertEqual(h1.bv33, 0.0)
        w = math.sqrt(2 * math.pi / 3.4 * st.G)
        self.assertEqual(h0.response(w, 1.0), h1.response(w, 1.0))

    def test_natural_frequency_and_stiffness(self):
        h = self.hull
        c33, c55 = h.restoring()
        # waterplane area of a Wigley: 2/3 L B (midpoint sum over 12 stations is within 1%)
        self.assertAlmostEqual(c33 / (st.RHO * st.G * 2.0 / 3.0 * 4.0 * 0.4), 1.0, delta=0.01)
        (w3, a33, b33), (w5, a55, b55) = h.natural()
        self.assertAlmostEqual(w3, math.sqrt(c33 / (h.mass + a33)), places=6)
        self.assertAlmostEqual(w5, math.sqrt(c55 / (h.iyy + a55)), places=6)
        self.assertGreater(a33, 0.0)
        self.assertGreater(b33, 0.0)

    def test_damping_lowers_motion_and_added_resistance_near_resonance(self):
        h0 = self.hull
        (w3, _, _), _ = h0.natural()
        u = 1.0
        # find the wave frequency whose encounter frequency is the heave natural frequency
        w = (-1 + math.sqrt(1 + 4 * u * w3 / st.G)) / (2 * u / st.G)
        prev_z, prev_r = None, None
        for zeta in (0.0, 0.05, 0.1, 0.2):
            h = st.WigleyStrip(4.0, 0.4, 0.274, n_stations=12, table=h0.table, zeta_v=zeta)
            z, th, r, we = h.response(w, u)
            self.assertAlmostEqual(we, w3, places=6)
            if prev_z is not None:
                self.assertLess(abs(z), prev_z)
                self.assertLess(r, prev_r)
            prev_z, prev_r = abs(z), r

    def test_long_waves_unaffected(self):
        h0 = self.hull
        h = st.WigleyStrip(4.0, 0.4, 0.274, n_stations=12, table=h0.table, zeta_v=0.2)
        k = 2 * math.pi / 80.0
        z, th, r, _ = h.response(math.sqrt(k * st.G), 1.0)
        self.assertAlmostEqual(abs(z), 1.0, delta=0.02)

    def test_results_file(self):
        with open(RESULTS) as f:
            text = f.read()
        rows = [ln.split() for ln in text.splitlines() if ln.startswith("row ")]
        self.assertEqual(len(rows), 6)
        self.assertEqual(rows[0][1], "0.000")
        loss = [float(r[6]) for r in rows]
        self.assertTrue(all(a >= b for a, b in zip(loss, loss[1:])) or all(a <= b for a, b in zip(loss, loss[1:])))
        self.assertTrue(all(r[8] == "True" for r in rows))
        self.assertRegex(text, re.compile(r"monohull: heave w_n [\d.]+ rad/s"))


if __name__ == "__main__":
    unittest.main()
