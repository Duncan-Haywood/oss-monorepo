"""Milestone 7zo: the double-body m-terms in `doublebody.py` and the pinned results of `run_panel_doublebody.py`."""
import math
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

RESULTS = os.path.join(HERE, "..", "experiments", "results_panel_doublebody.txt")

try:
    import numpy as np
    HAVE_NP = True
except ImportError:
    HAVE_NP = False
try:
    import capytaine  # noqa: F401
    HAVE_CPT = True
except ImportError:
    HAVE_CPT = False


def sphere_grid(nu, nv):
    """Face-centre-like points and outward normals on the y >= 0 half of a unit hemisphere, u-major."""
    pts = []
    for i in range(nu):
        for k in range(nv):
            u, v = (i + 0.5) / nu, (k + 0.5) / nv
            th, ph = math.pi * (1 - u), 0.5 * math.pi * (1 - v)
            pts.append((math.cos(th), math.sin(th) * math.cos(ph), -math.sin(th) * math.sin(ph)))
    c = np.array(pts)
    return c, c.copy()          # unit sphere: normal = position


def w_exact(p):
    x, y, z = p.T
    r2 = (p ** 2).sum(1)
    r3, r5 = r2 ** 1.5, r2 ** 2.5
    return np.stack([-(1 + 1 / (2 * r3)) + 1.5 * x * x / r5, 1.5 * x * y / r5, 1.5 * x * z / r5], 1)


@unittest.skipUnless(HAVE_NP, "numpy not installed")
class MTermTests(unittest.TestCase):
    def test_uniform_stream_gives_capytaine_m_terms(self):
        from marine_hull import doublebody as db
        c, n = sphere_grid(10, 4)
        w = np.zeros_like(c)
        w[:, 0] = -0.7
        m3, m5 = db.m_terms(c, n, w, np.zeros_like(c))
        self.assertTrue(np.allclose(m3, 0.0))
        self.assertTrue(np.allclose(m5, 0.7 * n[:, 2]))

    def test_surface_formula_on_exact_sphere_flow(self):
        from marine_hull import doublebody as db
        errs = []
        for nu, nv in ((20, 6), (60, 16)):
            c, n = sphere_grid(nu, nv)
            w = w_exact(c)
            dn = db.normal_derivative(c, n, w, nu, nv)
            dne = (w_exact(c + 1e-6 * n) - w_exact(c - 1e-6 * n)) / 2e-6
            errs.append(float(np.sqrt(np.mean((dn[:, 2] - dne[:, 2]) ** 2) / np.mean(dne[:, 2] ** 2))))
        self.assertLess(errs[1], 0.02)
        self.assertLess(errs[1], errs[0])

    def test_surface_gradient_of_linear_field(self):
        from marine_hull import doublebody as db
        # on a plane central differences are exact for a linear field
        uu, vv = np.meshgrid(np.linspace(0, 1, 12) ** 1.3, np.linspace(0, 1, 7), indexing="ij")
        c = np.stack([uu.ravel(), 0.2 * uu.ravel() + 0.5 * vv.ravel(), vv.ravel()], 1)
        n = np.cross([1.0, 0.2, 0.0], [0.0, 0.5, 1.0])
        n = np.tile(n / np.linalg.norm(n), (len(c), 1))
        a = np.array([[0.3, -0.2, 0.5], [0.1, 0.4, -0.6], [0.7, 0.0, 0.2]])
        gm = db.surface_gradient(c, c @ a, 12, 7)
        p = np.eye(3)[None] - n[:, :, None] * n[:, None, :]
        self.assertTrue(np.allclose(gm, p @ a, atol=1e-9))


@unittest.skipUnless(HAVE_CPT, "capytaine not installed")
class CapytaineTests(unittest.TestCase):
    def test_uniform_mode_reproduces_capytaine_forward_speed(self):
        from marine_hull import doublebody as db
        h = db.PanelHullDoubleBody(2.0, 0.3, 0.125, nx=16, nz=4, modified=True, mode="uniform")
        w, u = 6.0, 0.5
        q, q0 = h.at_speed(w, u), h.speed_twin.at_speed(w, u)
        for key in ("A", "B"):
            for i in range(2):
                for j in range(2):
                    self.assertAlmostEqual(q[key][i][j], q0[key][i][j], delta=1e-8 * (1 + abs(q0[key][i][j])))
        self.assertLess(abs(q["F3"] - q0["F3"]) / abs(q0["F3"]), 1e-9)


@unittest.skipUnless(os.path.exists(RESULTS), "results not generated")
class PinnedResults(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(RESULTS) as f:
            cls.text = f.read()

    def test_code_checks_held(self):
        for tag in ("C1", "C2"):
            self.assertRegex(self.text, rf"\n{tag} .*-> held")

    def test_headline_numbers(self):
        self.assertIn("heave: rms on 0.8-2.0 strip 0.127, panel 0.181; mean error on 1.0-1.3 strip +3.1%, panel -10.0%", self.text)
        self.assertIn("panel motions 0.999", self.text)
        self.assertIn("H5 Journee ratios I 0.615, III 0.662", self.text)
        self.assertIn("30 W loss 3.43%", self.text)
        self.assertIn("B35: n 15 (KL >= 3); measured median +0.1003, panel median +0.1245; rms error panel 0.1086", self.text)
