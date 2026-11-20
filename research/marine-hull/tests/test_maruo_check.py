"""Milestone 7zm: Maruo's far-field added resistance (Capytaine) against Gerritsma-Beukelman, and the pinned results."""
import math
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from marine_hull import maruo as mr  # noqa: E402

RESULTS = os.path.join(HERE, "..", "experiments", "results_maruo_check.txt")

try:
    import capytaine  # noqa: F401
    import scipy  # noqa: F401
    HAVE_CPT = True
except ImportError:
    HAVE_CPT = False


def results():
    with open(RESULTS) as f:
        return f.read()


@unittest.skipUnless(HAVE_CPT, "capytaine/scipy not installed")
class ExactCylinderTests(unittest.TestCase):
    def test_short_wave_limit_is_two_thirds(self):
        self.assertAlmostEqual(mr.cylinder_drift_exact(60.0), 2.0 / 3.0, delta=0.005)

    def test_long_wave_drift_vanishes(self):
        # long-wave drift on the infinite-draft cylinder falls like (ka)^3: halving ka divides it by about 8
        self.assertLess(mr.cylinder_drift_exact(0.1), 0.005)
        self.assertAlmostEqual(mr.cylinder_drift_exact(0.1) / mr.cylinder_drift_exact(0.05), 8.0, delta=0.5)

    def test_panel_matches_exact_at_ka_1(self):
        self.assertAlmostEqual(mr.cylinder_drift_panel(1.0, 4.0, 1.0, n_theta=48, n_z=16) /
                               mr.cylinder_drift_exact(1.0), 1.0, delta=0.03)


@unittest.skipUnless(HAVE_CPT, "capytaine not installed")
class HullTests(unittest.TestCase):
    def test_energy_identity_and_free_long_wave(self):
        from marine_hull import panel as pn
        from marine_hull import strip as st
        h = st.ModifiedWigleyStrip(2.0, 0.3, 0.125, kyy=0.248, rho=1000.0)
        c33, c55 = h.restoring()
        mh = mr.MaruoHull(2.0, 0.3, 0.125, rho=1000.0, nx=24, nz=6, modified=True, n_theta=361)
        w = math.sqrt(2 * math.pi * 9.81 / (2.5 * 2.0))
        sol = mh.solve(w)
        x3 = pn.rao(None, h.mass, c33, w, sol["F3"], sol["A33"], sol["B33"])
        x5 = pn.rao(None, h.iyy, c55, w, sol["F5"], sol["A55"], sol["B55"])
        self.assertAlmostEqual(mh.energy_identity(sol), 1.0, delta=0.03)
        self.assertAlmostEqual(mh.energy_identity(sol, x3, x5), 1.0, delta=0.03)
        self.assertLess(mh.added_resistance(sol, x3, x5), 0.05 * mh.added_resistance(sol))


class PinnedResultTests(unittest.TestCase):
    def test_expectation_verdicts(self):
        txt = results()
        verdicts = dict(re.findall(r"^(Q\d) .*-> (held|refuted)", txt, re.M))
        self.assertEqual(sorted(verdicts), ["Q0", "Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7"])

    def test_headline_ratio_pinned(self):
        txt = results()
        m = re.search(r"Q4 GB strip / Maruo free on 0.5-2.0: T ([\d.]+), M ([\d.]+)", txt)
        self.assertIsNotNone(m)
        self.assertGreater(float(m.group(1)), 1.0)
        self.assertGreater(float(m.group(2)), 1.0)


if __name__ == "__main__":
    unittest.main()
