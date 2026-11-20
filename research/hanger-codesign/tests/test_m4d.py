"""Milestone 4d: the nonconforming (edge-midpoint) element."""
import importlib.util
import math
import sys
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1] / "experiments"
_saved = sys.modules.get("run")
_s3 = importlib.util.spec_from_file_location("run", ROOT / "m3_fem_tier" / "run.py")
_m3 = importlib.util.module_from_spec(_s3)
sys.modules["run"] = _m3
_s3.loader.exec_module(_m3)
try:
    _s = importlib.util.spec_from_file_location("m4d_cr", ROOT / "m4d_nonconforming" / "cr.py")
    cr = importlib.util.module_from_spec(_s)
    _s.loader.exec_module(cr)
finally:
    if _saved is not None:
        sys.modules["run"] = _saved
    else:
        sys.modules.pop("run", None)


class TestM4d(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sp = cr.CRDisc("F1", 150.0, 0.015)

    def perturbed(self, seed=1, amp=1e-3):
        rng = np.random.default_rng(seed)
        X = self.sp.start(0)
        X[self.sp.free] += amp * rng.standard_normal((self.sp.free.sum(), 3))
        return X, rng

    def test_cylinder_calibration_is_isotropic(self):
        # kappa makes a cylinder store B k^2 / 2 per unit area; the ratio stays within 2% over axis angles (1.8% measured: warp 0.982, weft 1.014)
        k = cr.calibrate_kappa()
        r = [k * cr._cyl_ratio(math.radians(p)) for p in (0, 30, 60, 90)]
        self.assertLess(max(abs(x - 1) for x in r), 0.02)

    def test_gradient_matches_energy(self):
        X, rng = self.perturbed()
        v = X[self.sp.free].ravel()
        E, g = self.sp.energy_grad(v, X)
        d = rng.standard_normal(v.size)
        h = 1e-6
        fd = (self.sp.energy_grad(v + h * d, X)[0] - self.sp.energy_grad(v - h * d, X)[0]) / (2 * h)
        self.assertAlmostEqual(fd, g @ d, delta=1e-5 * abs(g @ d))

    def test_hessian_matches_gradient(self):
        X, rng = self.perturbed(2)
        v = X[self.sp.free].ravel()
        H = self.sp.hessian(X)
        d = rng.standard_normal(v.size)
        h = 1e-6
        fd = (self.sp.energy_grad(v + h * d, X)[1] - self.sp.energy_grad(v - h * d, X)[1]) / (2 * h)
        self.assertLess(np.abs(fd - H @ d).max(), 1e-3 * np.abs(fd).max())

    def test_affine_field_is_exact(self):
        # an affine in-plane map: no jump, vertices rebuilt exactly, uniform strain energy
        A = np.array([[1.01, 0.002], [0.0, 0.995]])
        X = self.sp.X0.copy()
        X[:, :2] = self.sp.P @ A.T
        P5 = [X[self.sp.H5[:, i]] for i in range(5)]
        j2, _ = cr._jump_grad(*P5)
        self.assertLess(j2.max(), 1e-28)
        V = self.sp.vertices(X)
        self.assertLess(np.abs(V[:, :2] - self.sp.Pv @ A.T).max(), 1e-15)
        self.assertLess(np.abs(self.sp.theta(X)).max(), 1e-12)

    def test_mass_is_the_specimen_mass(self):
        W = cr.fabrics.weight("F1") / 1000.0               # g/m^2 -> kg/m^2
        self.assertAlmostEqual(self.sp.mass.sum(), self.sp.area.sum() * W, delta=1e-12)

    def test_penalty_removes_in_plane_zero_modes(self):
        # without the jump penalty the midpoint field has in-plane zero modes at the free rim
        out = []
        for gamma in (0.0, 0.1):
            sp = cr.CRDisc("F1", 150.0, 0.015, gamma=gamma)
            H = sp.hessian(sp.X0.copy()).toarray()
            nf = int(sp.free.sum())
            idx = np.array([3 * i + k for i in range(nf) for k in (0, 1)])
            w = np.linalg.eigvalsh(H[np.ix_(idx, idx)])
            s = np.median(np.abs(np.diag(H)[idx]))
            out.append(int((np.abs(w) < 1e-9 * s).sum()))
        self.assertGreater(out[0], 10)
        self.assertEqual(out[1], 0)

    def test_flat_specimen_dc_is_one(self):
        self.assertAlmostEqual(self.sp.dc(self.sp.X0.copy()), 1.0, delta=1e-3)


if __name__ == "__main__":
    unittest.main()
