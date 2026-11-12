"""Milestone 3a: the FEM tier's energy, its bending calibration, the elastica reference and the
Newton solver."""
import math
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "experiments" / "m3_fem_tier"))
import elastica  # noqa: E402
import fem  # noqa: E402
import newton  # noqa: E402


def small_mesh(B=0.1, W=12.0, EA=800.0, Gs=26.0, fixed=None):
    P, T = fem.lattice(0.01, (0, 0.03), (0, 0.03))
    fx = np.zeros(len(P), bool) if fixed is None else fixed(P)
    return fem.Mesh(P, T, B, W, EA, Gs, fx)


class TestFem(unittest.TestCase):
    def test_gradient_matches_finite_differences(self):
        for args in [(0.1, 0.0, 0.0, 0.0), (0.1, 12.0, 800.0, 26.0)]:
            m = small_mesh(*args)
            X = m.X0 + 0.002 * np.random.default_rng(0).standard_normal(m.X0.shape)
            v = X.ravel()
            _, g = m.energy_grad(v, X)
            fd = np.array([(m.energy_grad(v + e, X)[0] - m.energy_grad(v - e, X)[0]) / 2e-8
                           for e in np.eye(len(v)) * 1e-8])
            self.assertLess(np.abs(g - fd).max() / np.abs(fd).max(), 1e-6)

    def test_rest_state_and_rigid_motion_store_no_elastic_energy(self):
        m = small_mesh(W=0.0)
        c, s = math.cos(0.7), math.sin(0.7)
        Rm = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
        for X in (m.X0, m.X0 @ Rm.T + 0.3):
            E, _ = m.energy_grad(X.ravel(), X)
            self.assertLess(abs(E), 1e-15)

    def test_cylinder_bending_is_isotropic_and_calibrated(self):
        B = 0.0066
        for rows in "xy":
            P, T = fem.lattice(0.005, (0, 0.3), (0, 0.3), rows)
            m = fem.Mesh(P, T, B, 0.0, 0.0, 0.0, np.zeros(len(P), bool))
            c = P.mean(0)
            inner = np.abs(P[m.hu] - c).max(1) < 0.1
            for phi in (0.0, 0.3, math.pi / 4, 1.0):
                k = 3.0
                u = np.array([math.cos(phi), math.sin(phi)])
                Q = P - c
                s, t = Q @ u, Q @ np.array([-u[1], u[0]])
                X = np.column_stack([np.sin(k * s) / k * u[0] - t * u[1], np.sin(k * s) / k * u[1] + t * u[0],
                                     (1 - np.cos(k * s)) / k])
                th, _ = m.theta(X)
                ratio = (m.kb * th * th)[inner].sum() / (B * fem.GF_CM2_PER_CM * k * k / 2 * 0.04)
                self.assertAlmostEqual(ratio, 1.0, delta=0.01)

    def test_uniaxial_stretch_and_shear_energies(self):
        m = small_mesh(B=0.0, W=0.0, EA=800.0, Gs=26.0)
        A = m.area.sum()
        X = m.X0 * np.array([1.01, 1.0, 1.0])
        E, _ = m.energy_grad(X.ravel(), X)
        e11 = 0.5 * (1.01 ** 2 - 1)
        self.assertAlmostEqual(E / A, 0.5 * 800 * e11 ** 2, delta=1e-9)
        X = m.X0.copy()
        X[:, 0] += 0.01 * m.X0[:, 1]          # simple shear gamma = 0.01
        E, _ = m.energy_grad(X.ravel(), X)
        # Green strain of simple shear: E12 = gamma/2, E22 = gamma^2/2
        self.assertAlmostEqual(E / A, 2 * 26 * 0.005 ** 2 + 0.5 * 800 * (0.5e-4) ** 2, delta=1e-9)


class TestElastica(unittest.TestCase):
    def test_astm_chord_at_two_bending_lengths(self):
        self.assertAlmostEqual(elastica.cantilever(2.0)["chord_deg"], 41.5, delta=0.05)
        self.assertAlmostEqual(elastica.overhang_at_chord(41.5), 2.0, delta=0.002)

    def test_small_overhang_matches_linear_beam(self):
        # linear heavy cantilever: tip drop = w l^4 / (8 B), i.e. drop / l = L^3 / 8
        L = 0.4
        self.assertAlmostEqual(elastica.cantilever(L)["drop"], L ** 3 / 8, delta=2e-4)


class TestNewton(unittest.TestCase):
    def test_newton_reaches_tight_gradient_on_a_hanging_flap(self):
        m = small_mesh(B=0.05, W=20.0, EA=500.0, Gs=30.0, fixed=lambda P: P[:, 0] <= 1e-9)
        X = m.X0.copy()
        nw = newton.Newton(m.n, [m.T, np.column_stack([m.hu, m.hv, m.ho1, m.ho2])], m.free)
        w = fem.GRAV * m.mass.max()
        v, info = nw.solve(lambda u: m.energy_grad(u, X), X[m.free].ravel(), gtol=1e-6 * w)
        self.assertLess(info["gmax"], 1e-6 * w)
        X[m.free] = v.reshape(-1, 3)
        self.assertLess(X[:, 2].min(), -1e-3)      # it sags

    def test_colouring_is_distance_two(self):
        m = small_mesh()
        nw = newton.Newton(m.n, [m.T, np.column_stack([m.hu, m.hv, m.ho1, m.ho2])], m.free)
        A2 = (nw.A @ nw.A).tocoo()
        off = A2.row != A2.col
        self.assertFalse((nw.col[A2.row[off]] == nw.col[A2.col[off]]).any())


if __name__ == "__main__":
    unittest.main()
