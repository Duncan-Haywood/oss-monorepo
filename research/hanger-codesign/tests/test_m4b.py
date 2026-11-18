"""Milestone 4b: the orthotropic triangle element (stretch EA1/EA2, lattice-calibrated hinge weights)."""
import importlib.util
import math
import sys
import unittest
from pathlib import Path

import numpy as np

EXP = Path(__file__).resolve().parents[1] / "experiments"
_saved = sys.modules.get("run")
try:
    _s = importlib.util.spec_from_file_location("m4b_run", EXP / "m4b_orthotropic" / "run.py")
    m4b = importlib.util.module_from_spec(_s)
    _s.loader.exec_module(m4b)
finally:
    if _saved is not None:
        sys.modules["run"] = _saved
    else:
        sys.modules.pop("run", None)
ortho, fem = m4b.ortho, m4b.fem


class Patch(ortho.OrthoMixin, fem.Mesh):
    pass


def patch(B1=2e-6, B2=0.5e-6, EA1=900.0, EA2=150.0, G=20.0, W=15.0, a=0.01):
    P, T = fem.lattice(a, (0, 0.03), (0, 0.03))
    m = Patch(P, T, 1.0 / fem.GF_CM2_PER_CM, W, 0.0, G, P[:, 0] <= 1e-12)
    m.kb_unit = m.kb.copy()
    m.set_bending(B1, B2)
    m.set_stretch(EA1, EA2)
    return m


class TestOrtho(unittest.TestCase):
    def test_weights_reproduce_warp_and_weft_cylinders(self):
        for B1, B2 in ((4.0, 1.0), (1.0, 2.5), (94.3, 23.4)):
            w = ortho.weights(B1, B2)
            self.assertTrue((w > 0).all())
            b0, b90 = ortho.bending_profile(B1, B2, [0.0, math.pi / 2])
            self.assertAlmostEqual(b0 / B1, 1.0, places=9)
            self.assertAlmostEqual(b90 / B2, 1.0, places=9)

    def test_isotropic_inputs_give_the_isotropic_element(self):
        np.testing.assert_array_equal(ortho.weights(3.0, 3.0), [3.0, 3.0])
        w = ortho.calibrate() @ np.ones(2)
        np.testing.assert_allclose(w, 1.0, atol=1e-5)

    def test_gradient_matches_finite_differences(self):
        m = patch()
        X = m.X0 + 0.002 * np.random.default_rng(1).standard_normal(m.X0.shape)
        v = X[m.free].ravel()
        _, g = m.energy_grad(v, X)
        fd = np.array([(m.energy_grad(v + e, X)[0] - m.energy_grad(v - e, X)[0]) / 2e-8 for e in np.eye(len(v)) * 1e-8])
        self.assertLess(np.abs(g - fd).max() / np.abs(fd).max(), 1e-6)

    def test_hessian_matches_finite_differences_of_gradient(self):
        m = patch()
        X = m.X0 + 0.002 * np.random.default_rng(2).standard_normal(m.X0.shape)
        v = X[m.free].ravel()
        H = ortho.hessian(m, X).toarray()
        fd = np.column_stack([(m.energy_grad(v + e, X)[1] - m.energy_grad(v - e, X)[1]) / 2e-7
                              for e in np.eye(len(v)) * 1e-7])
        self.assertLess(np.abs(H - fd).max() / np.abs(fd).max(), 1e-5)

    def test_equal_stretch_matches_isotropic_energy(self):
        m = patch(EA1=500.0, EA2=500.0, B1=1e-6, B2=1e-6)
        iso = fem.Mesh(m.P, m.T, 1e-6 / fem.GF_CM2_PER_CM, 15.0, 500.0, 20.0, m.fixed)
        X = m.X0 + 0.002 * np.random.default_rng(3).standard_normal(m.X0.shape)
        v = X[m.free].ravel()
        e1, g1 = m.energy_grad(v, X)
        e2, g2 = iso.energy_grad(v, X)
        self.assertAlmostEqual(e1 / e2, 1.0, places=12)
        np.testing.assert_allclose(g1, g2, rtol=1e-9, atol=1e-12 * np.abs(g2).max())

    def test_isotropic_ortho_hessian_equals_3d_hessian(self):
        m = patch(EA1=500.0, EA2=500.0, B1=1e-6, B2=1e-6)
        iso = fem.Mesh(m.P, m.T, 1e-6 / fem.GF_CM2_PER_CM, 15.0, 500.0, 20.0, m.fixed)
        X = m.X0 + 0.002 * np.random.default_rng(4).standard_normal(m.X0.shape)
        H1 = ortho.hessian(m, X).toarray()
        H2 = m4b.m4a.localhess.hessian(iso, X).toarray()
        self.assertLess(np.abs(H1 - H2).max() / np.abs(H2).max(), 1e-12)

    def test_inputs_from_the_paper(self):
        p = m4b.inputs("F2")             # E100 1.6 % warp, 18.0 % weft
        self.assertAlmostEqual(p["EA1"], 98.0665 / 0.016, places=6)
        self.assertAlmostEqual(p["EA1"] / p["EA2"], 18.0 / 1.6, places=9)
        self.assertAlmostEqual(math.sqrt(p["B1"] * p["B2"]), m4b.fabrics.b_fast("F2"), places=15)


if __name__ == "__main__":
    unittest.main()
