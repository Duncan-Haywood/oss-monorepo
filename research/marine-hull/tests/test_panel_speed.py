"""Milestone 7zn: forward-speed helpers in `panel.py` and the pinned results of `run_panel_speed.py`."""
import math
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))

from marine_hull import panel as pn  # noqa: E402
from marine_hull import strip as st  # noqa: E402

RESULTS = os.path.join(HERE, "..", "experiments", "results_panel_speed.txt")

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


class HelperTests(unittest.TestCase):
    def test_gb_speed_reproduces_strip_response(self):
        h = small_hull()
        for u in (0.0, 0.5, 0.9):
            for w in (4.0, 6.0):
                z, th, raw, _ = h.response(w, u)
                self.assertAlmostEqual(pn.gb_added_resistance_speed(h, w, u, z, th) / raw, 1.0, places=9)

    def test_gb_speed_zero_matches_zero_speed_form(self):
        h = small_hull()
        z, th, _, _ = h.response(5.0, 0.0)
        self.assertAlmostEqual(pn.gb_added_resistance_speed(h, 5.0, 0.0, z, th) / pn.gb_added_resistance(h, 5.0, z, th),
                               1.0, places=9)

    def test_motions_speed_static_and_decoupled(self):
        # zero coupling: heave = F3 / (C33 - we^2 (M + A33) - i we B33), as pn.rao
        q = {"we": 3.0, "A": [[2.0, 0.0], [0.0, 1.0]], "B": [[5.0, 0.0], [0.0, 0.5]], "F3": 10 + 2j, "F5": 1 - 1j}
        z, t = pn.motions_speed(q, 10.0, 4.0, 300.0, 80.0)
        self.assertAlmostEqual(abs(z - pn.rao(None, 10.0, 300.0, 3.0, 10 + 2j, 2.0, 5.0)), 0.0, places=12)
        self.assertAlmostEqual(abs(t - pn.rao(None, 4.0, 80.0, 3.0, 1 - 1j, 1.0, 0.5)), 0.0, places=12)

    def test_symmetric_waterline_has_no_restoring_coupling(self):
        h = small_hull()
        self.assertLess(abs(pn.strip_coupling_restoring(h)), 1e-9 * h.restoring()[0])

    def test_omega_from_encounter(self):
        import run_panel_speed as rp
        for u in (0.0, 0.886, 1.4):
            w = 3.7
            we = w + w * w / st.G * u
            self.assertAlmostEqual(rp.omega_from_we(we, u), w, places=12)

    def test_alpha_zero_drops_bilge_term(self):
        y1 = pn.wigley_halfbreadth(3.0, 0.3, 0.1875, modified=True, alpha=1.0)
        y0 = pn.wigley_halfbreadth(3.0, 0.3, 0.1875, modified=True, alpha=0.0)
        self.assertAlmostEqual(y0(0.0, -0.1), 0.15 * (1 - (0.1 / 0.1875) ** 2))
        self.assertGreater(y1(0.0, -0.1), y0(0.0, -0.1))


@unittest.skipUnless(HAVE_CPT, "capytaine not installed")
class CapytaineTests(unittest.TestCase):
    def test_low_speed_limit_is_zero_speed(self):
        p = pn.PanelHullSpeed(2.0, 0.3, 0.125, rho=1000.0, nx=16, nz=4, modified=True)
        w = 5.0
        q0, q1 = p.at(w), p.at_speed(w, 1e-6)
        self.assertAlmostEqual(q1["A"][0][0] / q0["A33"], 1.0, places=4)
        self.assertAlmostEqual(abs(q1["F3"] / q0["F3"]), 1.0, places=4)


class PinnedResults(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(RESULTS) as f:
            cls.text = f.read()

    def line(self, tag):
        tail = self.text.split("== expectations ==")[1]
        return next(l for l in tail.splitlines() if l.startswith(tag))

    def test_code_checks_and_mesh_held(self):
        self.assertIn("-> held", self.line("S0 "))
        # S1 failed only at the heave cancellation (lambda/L 0.6, 0.8); from 1.0 up the mesh moves heave < 2.3%
        for lam in ("1.00", "1.10", "1.20", "1.40", "1.70", "2.00"):
            m = re.search(r"lambda/L " + lam + r": heave [0-9.]+ / [0-9.]+ \(([-+0-9.]+)%\)", self.text)
            self.assertLess(abs(float(m.group(1))), 2.3)

    def test_expectation_lines_present(self):
        for s in ("S0", "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"):
            self.assertRegex(self.line(s + " "), r"-> (held|refuted)\s*$")

    def test_strip_reproduces_7zh_area(self):
        m = re.search(r"S5 area strip ([0-9.]+)", self.text)
        self.assertAlmostEqual(float(m.group(1)), 0.929, delta=0.005)


if __name__ == "__main__":
    unittest.main()
