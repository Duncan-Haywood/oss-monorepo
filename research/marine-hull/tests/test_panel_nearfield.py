"""Milestone 7zx: Pinkster's near field on Capytaine's panel solution, and the pinned results."""
import math
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

RESULTS = os.path.join(HERE, "..", "experiments", "results_panel_nearfield.txt")

try:
    import capytaine  # noqa: F401
    import scipy  # noqa: F401
    import xarray  # noqa: F401
    HAVE_CPT = True
except ImportError:
    HAVE_CPT = False


def results():
    with open(RESULTS) as f:
        return f.read()


@unittest.skipUnless(HAVE_CPT, "capytaine/scipy/xarray not installed")
class NearFieldCodeTests(unittest.TestCase):
    def test_cylinder_near_field_matches_far_field(self):
        from marine_hull import maruo as mr
        from marine_hull import panel_nearfield as pnf
        nf, ff = pnf.cylinder_near_field(1.0, 4.0, 1.0, n_theta=32, n_z=12, n_r=4)
        self.assertLess(abs(nf / ff - 1.0), 0.03)
        self.assertLess(abs(nf / mr.cylinder_drift_exact(1.0) - 1.0), 0.05)

    def test_wigley_restrained_near_field_matches_maruo(self):
        from marine_hull import panel_nearfield as pnf
        m = pnf.PanelNearField(4.0, 0.4, 0.274390243902439, nx=24, nz=6)
        w = math.sqrt(2.0 * math.pi * 9.81 / 4.0)
        sol, res = m.solve_nf(w)
        nf, resid = m.near_field(res, w)
        self.assertLess(abs(nf["nf"] / m.added_resistance(sol) - 1.0), 0.05)
        self.assertEqual(nf["grad"], 0.0)
        self.assertEqual(nf["rot"], 0.0)
        self.assertLess(max(resid.values()), 1e-6)


class PinnedResultsTests(unittest.TestCase):
    def test_all_expectation_lines_present(self):
        text = results()
        for tag in ("P0a", "P0b", "P1", "P2", "P3", "P4", "P5", "P6"):
            self.assertRegex(text, rf"\n{tag} .* -> (held|refuted)")

    def test_near_field_agrees_with_far_field(self):
        text = results()
        m = re.search(r"P2 free NF3D/Maruo T ([\d.]+), M ([\d.]+)", text)
        self.assertIsNotNone(m)
        for v in m.groups():
            self.assertLess(abs(float(v) - 1.0), 0.15)


if __name__ == "__main__":
    unittest.main()
