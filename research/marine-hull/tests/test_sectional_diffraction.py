"""Milestone 7zz: `strip.section_solve`, the sectional-diffraction variants of `NearField.response`, and the results."""
import math
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from marine_hull import nearfield as nf  # noqa: E402
from marine_hull import strip as st  # noqa: E402

RESULTS = os.path.join(HERE, "..", "experiments", "results_sectional_diffraction.txt")


def omega(lam, l):
    return math.sqrt(2.0 * math.pi * st.G / (lam * l))


class SectionSolveTests(unittest.TestCase):
    def test_unit_heave_condition_reproduces_section_heave(self):
        nodes = st.wigley_section(0.8, 1.0, 10)
        keep = []
        st.section_heave(nodes, 0.7, keep)
        _, (phi,) = st.section_solve(nodes, 0.7, [[p[4] for p in keep[0]]])
        self.assertLess(max(abs(a - b) for a, b in zip(phi, keep[1])), 1e-12)

    def test_solutions_are_linear_in_the_condition(self):
        nodes = st.wigley_section(0.6, 1.0, 8)
        pan, (a, b, c) = st.section_solve(nodes, 1.3, [[p[4] for p in st.section_solve(nodes, 1.3, [])[0]],
                                                       [p[3] for p in st.section_solve(nodes, 1.3, [])[0]],
                                                       [2.0 * p[4] - 1j * p[3]
                                                        for p in st.section_solve(nodes, 1.3, [])[0]]])
        self.assertLess(max(abs(2.0 * x - 1j * y - z) for x, y, z in zip(a, b, c)), 1e-12)


class VariantTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        h = st.ModifiedWigleyStrip(3.0, 0.3, 0.1875, kyy=0.25, rho=1000.0, alpha=1.0, n_stations=12, n_panels=10)
        keys = sorted(set(h.ratio), key=repr)
        cls.n = nf.NearField(h, field=nf.FieldTable(keys, n_panels=10, nu_t=st.NU_T[::3], processes=1))

    def test_direct_relative_velocity_matches_the_table_flow(self):
        w = omega(1.0, 3.0)
        a = self.n.response(w, 0.0)
        b = self.n.response(w, 0.0, diffraction="rv")
        for key in ("nf_pg", "vel", "wl"):
            self.assertAlmostEqual(b[key], a[key], delta=0.03 * abs(a[key]))

    def test_restrained_hull_has_no_motion_terms(self):
        o = self.n.response(omega(1.0, 3.0), 0.0, diffraction="sdx", motions=(0j, 0j))
        self.assertEqual(o["rot_newton"], 0.0)
        self.assertEqual(o["grad"], 0.0)
        self.assertAlmostEqual(o["nf_pg"], o["wl"] + o["vel"], delta=1e-9 * abs(o["nf_pg"]))

    def test_depth_decay_changes_the_flow_only_slightly_in_long_waves(self):
        w = omega(8.0, 3.0)
        a = self.n.response(w, 0.0, diffraction="rv")["vel"]
        b = self.n.response(w, 0.0, diffraction="sd")["vel"]
        self.assertAlmostEqual(b, a, delta=0.1 * abs(a))

    def test_unknown_variant_raises(self):
        with self.assertRaises(ValueError):
            self.n.response(omega(1.0, 3.0), 0.0, diffraction="nope")


class PinnedResultsTests(unittest.TestCase):
    def test_all_expectation_lines_present(self):
        with open(RESULTS) as f:
            text = f.read()
        for tag in ("D0", "D1", "D2", "D3", "D4", "D5", "D6"):
            self.assertRegex(text, rf"\n{tag} .* -> (held|refuted)")
        self.assertIsNotNone(re.search(r"band areas .* sdx [-\d.]+; over 3D: def", text))


if __name__ == "__main__":
    unittest.main()
