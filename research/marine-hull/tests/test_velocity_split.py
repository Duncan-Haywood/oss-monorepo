"""Milestone 7zy: the near-field velocity term split by pair and component (strip and 3D), and the pinned results."""
import math
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from marine_hull import nearfield as nf  # noqa: E402
from marine_hull import strip as st  # noqa: E402

RESULTS = os.path.join(HERE, "..", "experiments", "results_velocity_split.txt")

try:
    import capytaine  # noqa: F401
    import scipy  # noqa: F401
    import xarray  # noqa: F401
    HAVE_CPT = True
except ImportError:
    HAVE_CPT = False


def omega(lam, l):
    return math.sqrt(2.0 * math.pi * st.G / (lam * l))


class StripSplitTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        h = st.ModifiedWigleyStrip(3.0, 0.3, 0.1875, kyy=0.25, rho=1000.0, alpha=1.0, n_stations=12, n_panels=10)
        keys = sorted(set(h.ratio), key=repr)
        cls.n = nf.NearField(h, field=nf.FieldTable(keys, n_panels=10, nu_t=st.NU_T[::6], processes=1))

    def test_parts_sum_to_velocity_term_at_speed_and_at_rest(self):
        for u in (0.0, 0.2 * math.sqrt(st.G * 3.0)):
            o = self.n.response(omega(1.0, 3.0), u)
            self.assertAlmostEqual(sum(o["vel_split"].values()), o["vel"], delta=1e-9 * abs(o["vel"]))

    def test_incident_incident_part_nearly_vanishes(self):
        o = self.n.response(omega(1.0, 3.0), 0.0)
        ii = sum(v for k, v in o["vel_split"].items() if k.startswith("II"))
        self.assertLess(abs(ii), 0.05 * abs(o["vel"]))
        self.assertEqual(o["vel_split"]["II_y"], 0.0)


@unittest.skipUnless(HAVE_CPT, "capytaine/scipy/xarray not installed")
class PanelSplitTests(unittest.TestCase):
    def test_parts_sum_to_velocity_term(self):
        from marine_hull import panel_nearfield as pnf
        m = pnf.PanelNearField(4.0, 0.4, 0.274390243902439, nx=24, nz=6)
        w = omega(1.0, 4.0)
        _, res = m.solve_nf(w)
        r, _ = m.near_field(res, w, 0.01 + 0.02j, 0.03j)
        sp = m.velocity_split(res, 0.01 + 0.02j, 0.03j)
        self.assertAlmostEqual(sum(sp.values()), r["vel"], delta=1e-9 * abs(r["vel"]))


class PinnedResultsTests(unittest.TestCase):
    def test_all_expectation_lines_present(self):
        with open(RESULTS) as f:
            text = f.read()
        for tag in ("Q0", "Q1", "Q2", "Q3", "Q4", "Q5", "Q6"):
            self.assertRegex(text, rf"\n{tag} .* -> (held|refuted)")
        self.assertIsNotNone(re.search(r"band areas .* NF-PG [\d.]+, NC [-\d.]+, NX [-\d.]+", text))


if __name__ == "__main__":
    unittest.main()
