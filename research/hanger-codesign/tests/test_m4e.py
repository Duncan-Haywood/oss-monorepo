"""Milestone 4e: the triangle tier over a hanger arm."""
import dataclasses
import importlib.util
import sys
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1] / "experiments"
_s = importlib.util.spec_from_file_location("m4e_hangerfem", ROOT / "m4e_hanger_tier" / "hangerfem.py")
hf = importlib.util.module_from_spec(_s)
_s.loader.exec_module(hf)
m2 = hf.m2


def sheet(a=0.01, zh=3.0):
    g = dataclasses.replace(m2.garment("M", "tee"), EA=800.0)
    h = dataclasses.replace(m2.STOCK["wood-shaped"], w=g.half_shoulder + 1.0)
    return hf.HangerSheet(h, zh, g, a, 20.0), g


class TestM4e(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sh, cls.g = sheet()

    def test_mass_is_the_garments(self):
        # body per side plus the modelled sleeve, as hanger_fit hangs them (lump 0 for the tee)
        want = (self.g.body + self.g.sleeve * self.g.sleeve_len) / 1000.0
        self.assertAlmostEqual(self.sh.mass.sum() / want, 1.0, delta=1e-9)

    def test_neck_row_and_pins(self):
        sh = self.sh
        self.assertTrue(np.all(sh.s[sh.fixed] < 1e-9))
        self.assertTrue(np.all(np.abs(sh.u[sh.fixed]) <= sh.zh + 1e-9))
        self.assertTrue(sh.xpin.any() and not (sh.xpin & sh.fixed).any())

    def test_gradient_matches_energy(self):
        sh = self.sh
        rng = np.random.default_rng(0)
        X = sh.start()
        X[sh.free] += 1e-3 * rng.standard_normal((sh.free.sum(), 3))
        v = X[sh.free].ravel()
        _, gv = sh.energy_grad(v, X)
        for _ in range(3):
            dv = 1e-7 * rng.standard_normal(len(v))
            fd = (sh.energy_grad(v + dv, X)[0] - sh.energy_grad(v - dv, X)[0]) / 2
            self.assertAlmostEqual(fd / (gv @ dv), 1.0, delta=1e-4)

    def test_hessian_matches_gradient(self):
        # on a state with every node either clear of the arm or well inside the smoothing band
        sh = self.sh
        rng = np.random.default_rng(1)
        X = sh.start()
        X[sh.free] += 1e-3 * rng.standard_normal((sh.free.sum(), 3))
        v = X[sh.free].ravel()
        H = sh.hessian(X)
        dv = 1e-8 * rng.standard_normal(len(v))
        fd = (sh.energy_grad(v + dv, X)[1] - sh.energy_grad(v - dv, X)[1]) / 2
        # contact enters as Gauss-Newton (curvature term dropped), so compare away from contact nodes
        p, *_ = sh._contact(X)
        far = np.repeat(p[sh.free] < -50 * hf.DELTA, 3)
        err = np.abs(fd - H @ dv)[far].max() / np.abs(fd).max()
        self.assertLess(err, 1e-3)

    def test_soft_penalty_limits(self):
        sp, sig = hf.HangerSheet._soft(np.array([-1e-3, 0.0, 1e-3]))
        self.assertLess(sp[0], 1e-40)
        self.assertAlmostEqual(sp[1], hf.DELTA * np.log(2))
        self.assertAlmostEqual(sp[2] / 1e-3, 1.0, delta=1e-9)
        self.assertAlmostEqual(sig[1], 0.5)

    def test_worn_shape_scores_zero(self):
        sh = self.sh
        T = m2.target(sh.g, sh.s) + sh.x0
        X = np.column_stack([T[:, 0], sh.u, T[:, 1]])
        self.assertAlmostEqual(sh.score(X), 0.0, places=12)

    def test_from_grid_is_exact_on_affine_fields(self):
        sh = self.sh
        s_g = np.linspace(0, sh.L, 30)
        z_g = (np.arange(9) + 0.5) * hf.DEPTH / 9 - hf.DEPTH / 2
        S, Z = np.meshgrid(s_g, z_g, indexing="ij")
        Xg = np.stack([0.1 + 0.5 * S, -0.2 * S + 0.3 * Z, Z], axis=2)     # cloth3d frame (x, y, z)
        X = hf.from_grid(sh, Xg, s_g, z_g)
        free = ~sh.fixed
        np.testing.assert_allclose(X[free, 0], 0.1 + 0.5 * sh.s[free], atol=1e-12)
        np.testing.assert_allclose(X[free, 2], -0.2 * sh.s[free] + 0.3 * sh.u[free], atol=1e-12)
        np.testing.assert_allclose(X[free, 1], sh.u[free], atol=1e-12)


if __name__ == "__main__":
    unittest.main()
