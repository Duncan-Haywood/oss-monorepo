"""Milestone 7zl: the panel-code (Capytaine) check of the strip theory, its conventions, and the pinned results."""
import cmath
import math
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from marine_hull import panel as pn  # noqa: E402
from marine_hull import strip as st  # noqa: E402

RESULTS = os.path.join(HERE, "..", "experiments", "results_panel_check.txt")

try:
    import capytaine  # noqa: F401
    HAVE_CPT = True
except ImportError:
    HAVE_CPT = False


def small_hull():
    l, b, t, n = 2.0, 0.3, 0.125, 8
    dx = l / n
    xs = [-l / 2 + dx * (i + 0.5) for i in range(n)]
    ratios = sorted(set(round(0.5 * b * (1 - (2 * x / l) ** 2) / t, 12) for x in xs))
    table = st.SectionTable(ratios, n_panels=8, processes=1, nu_t=[0.05 * 1.25 ** i for i in range(30)])
    return st.WigleyStrip(l, b, t, n_stations=n, table=table)


class ConventionTests(unittest.TestCase):
    def test_halfbreadth_matches_strip_sections(self):
        y = pn.wigley_halfbreadth(2.0, 0.3, 0.125, modified=True)
        for xi in (0.0, 0.4, 0.8):
            for (yy, z) in st.modified_wigley_section(xi, 0.15, 0.125, n=6):
                self.assertAlmostEqual(y(xi * 1.0, z), yy, places=12)
        y0 = pn.wigley_halfbreadth(4.0, 0.4, 0.27)
        self.assertAlmostEqual(y0(0.0, 0.0), 0.2)
        self.assertEqual(y0(2.0, -0.1), 0.0)

    def test_to_strip_conjugates_and_turns_pitch(self):
        z, t = pn.to_strip(1 + 2j, 3 - 1j)
        self.assertEqual(z, 1 - 2j)
        self.assertEqual(t, -(3 + 1j))

    def test_rao_static_limit(self):
        self.assertAlmostEqual(abs(pn.rao(None, 10.0, 100.0, 1e-6, 100.0, 1.0, 1.0)), 1.0, places=9)

    def test_zero_speed_decoupled_heave_matches_strip_response(self):
        # fore-aft symmetric hull at U 0: strip.py's coupled heave equals F3 / (C33 - w^2 (M + A33) + i w B33)
        h = small_hull()
        c33, _ = h.restoring()
        for w in (4.0, 6.0):
            s = pn.strip_zero_speed(h, w)
            z = s["F3"] / (c33 - w * w * (h.mass + s["A33"]) + 1j * w * s["B33"])
            zr, th, raw, _ = h.response(w, 0.0)
            self.assertAlmostEqual(abs(z - zr) / abs(zr), 0.0, places=6)
            self.assertAlmostEqual(pn.gb_added_resistance(h, w, zr, th) / raw, 1.0, places=9)

    def test_long_wave_heave_force_is_hydrostatic(self):
        h = small_hull()
        c33, _ = h.restoring()
        s = pn.strip_zero_speed(h, 0.3)
        self.assertAlmostEqual(abs(s["F3"]) / c33, 1.0, places=2)
        self.assertLess(abs(cmath.phase(s["F3"])), 0.01)


@unittest.skipUnless(HAVE_CPT, "capytaine not installed")
class PanelMeshTests(unittest.TestCase):
    def test_mesh_volume_and_outward_normals(self):
        p = pn.PanelHull(4.0, 0.4, 0.27, nx=30, nz=6, lid=False)
        exact = 4.0 / 9.0 * 4.0 * 0.4 * 0.27
        self.assertAlmostEqual(p.body.mesh.volume / exact, 1.0, delta=0.02)


class PinnedResults(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(RESULTS) as f:
            cls.text = f.read()

    def test_code_check_held(self):
        self.assertRegex(self.text, r"P0: .* -> held")

    def test_mesh_converged(self):
        self.assertRegex(self.text, r"P1 largest mesh change [0-9.]+% -> held")

    def test_gb_ratios_pinned(self):
        m = re.search(r"P6 GB area panel/strip motions T ([0-9.]+), M ([0-9.]+)", self.text)
        self.assertIsNotNone(m)
        t, mono = float(m.group(1)), float(m.group(2))
        self.assertTrue(0.3 < t < 3.0 and 0.3 < mono < 3.0)


if __name__ == "__main__":
    unittest.main()
