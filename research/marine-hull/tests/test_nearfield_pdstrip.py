"""Milestone 7zs: the near-field (Boese / PDSTRIP ch. 17) added resistance in `marine_hull.nearfield`."""
import math
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from marine_hull import nearfield as nf  # noqa: E402
from marine_hull import strip as st  # noqa: E402

RESULTS = os.path.join(HERE, "..", "experiments", "results_nearfield_pdstrip.txt")
_NF = []
NU_T = st.NU_T[::6]          # a coarse nu T grid keeps the table quick; the run uses the full one


def near():
    if not _NF:
        h = st.ModifiedWigleyStrip(3.0, 0.3, 0.1875, kyy=0.25, rho=1000.0, alpha=1.0, n_stations=12, n_panels=10)
        keys = sorted(set(h.ratio), key=repr)
        _NF.append(nf.NearField(h, field=nf.FieldTable(keys, n_panels=10, nu_t=NU_T, processes=1)))
    return _NF[0]


class NearFieldTests(unittest.TestCase):
    W = math.sqrt(2.0 * math.pi / 3.0 * st.G)        # lambda/L 1 on the 3 m hull

    def test_panel_potential_integrates_to_the_heave_added_mass(self):
        n = near()
        r = n.h.ratio[3]
        tab = st.SectionTable([r], n_panels=10, nu_t=NU_T, processes=1)   # patched the same way
        for k in range(len(NU_T)):
            self.assertAlmostEqual(n.field.a_star(r, k), tab.a[r][k], places=10)

    def test_terms_add_up_and_the_motions_are_gb_s(self):
        n = near()
        o = n.response(self.W, 0.2 * math.sqrt(st.G * 3.0))
        self.assertAlmostEqual(o["nf"], o["wl"] + o["vel"] + o["rot"], places=9)
        z, th, raw, _ = n.h.response(self.W, 0.2 * math.sqrt(st.G * 3.0))
        self.assertEqual((o["z"], o["theta"], o["gb"]), (z, th, raw))

    def test_zero_speed_ignores_the_convection_term(self):
        o = near().response(self.W, 0.0)
        self.assertAlmostEqual(o["nf"], o["nf0"], places=9)

    def test_resistance_is_positive_near_the_peak(self):
        o = near().response(self.W, 0.2 * math.sqrt(st.G * 3.0))
        self.assertGreater(o["nf"], 0.0)
        self.assertGreater(o["wl"], 0.0)

    def test_d_dx_is_exact_on_a_line_through_closed_ends(self):
        xs = [-0.75, -0.25, 0.25, 0.75]
        vals = [1.0 - (x / 1.0) ** 2 for x in xs]        # zero at the ends +-1
        d = nf.d_dx(vals, xs, 1.0)
        for x, v in zip(xs, d):
            self.assertAlmostEqual(v, -2.0 * x, places=9)


class PinnedResults(unittest.TestCase):
    def setUp(self):
        if not os.path.exists(RESULTS):
            self.skipTest("results file not generated")
        with open(RESULTS) as f:
            self.text = f.read()

    def test_code_checks_held(self):
        for tag in ("N0a", "N0b", "N0c"):
            line = next(l for l in self.text.splitlines() if l.startswith(tag))
            self.assertIn("held", line, line)

    def test_gb_reproduces_7zk(self):
        m = re.search(r"undamped ratios: I ([\d.]+) \(7zk 0.753\), III ([\d.]+)", self.text)
        self.assertAlmostEqual(float(m.group(1)), 0.753, places=3)
        self.assertAlmostEqual(float(m.group(2)), 0.807, places=3)


if __name__ == "__main__":
    unittest.main()
