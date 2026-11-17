"""Milestone 3d: the element-local Hessian against finite differences and milestone 3a's coloured one."""
import importlib.util
import sys
import unittest
from pathlib import Path

import numpy as np
import scipy.sparse.linalg as spla

EXP = Path(__file__).resolve().parents[1] / "experiments"
sys.path.insert(0, str(EXP / "m3_fem_tier"))
sys.path.insert(0, str(EXP / "m3d_local_hessian"))

_saved = sys.modules.get("run")
_s3 = importlib.util.spec_from_file_location("run", EXP / "m3_fem_tier" / "run.py")
_m3 = importlib.util.module_from_spec(_s3)
sys.modules["run"] = _m3
_s3.loader.exec_module(_m3)
_sc = importlib.util.spec_from_file_location("m3c_run", EXP / "m3c_branches" / "run.py")
m3c = importlib.util.module_from_spec(_sc)
_sc.loader.exec_module(m3c)
if _saved is not None:
    sys.modules["run"] = _saved
else:
    del sys.modules["run"]
import localhess  # noqa: E402


def _state(f="D", ea=800.0, a=0.015, seed=3):
    sp = m3c.m3.Disc(f, ea, a, "kes")
    X = sp.start(seed)
    X[sp.free] += 1e-3 * np.random.default_rng(seed).standard_normal((int(sp.free.sum()), 3))
    return sp, X


class TestM3d(unittest.TestCase):
    def test_membrane_hessian_is_the_derivative_of_the_membrane_force(self):
        sp, X = _state()
        sp.kb = 0.0 * sp.kb          # bending off: the gradient is the membrane plus constant gravity
        K = localhess.membrane_blocks(sp, X)
        self.assertEqual(K.shape, (len(sp.T), 9, 9))
        np.testing.assert_allclose(K[7], K[7].T, atol=1e-9 * np.abs(K[7]).max())
        v = X[sp.free].ravel()
        p = np.random.default_rng(1).standard_normal(len(v))
        g = lambda u: sp.energy_grad(u, X)[1]
        eps = 1e-6
        fd = (g(v + eps * p) - g(v - eps * p)) / (2 * eps)
        H = localhess.hessian(sp, X)
        self.assertLess(np.linalg.norm(H @ p - fd) / np.linalg.norm(fd), 1e-6)

    def test_matches_the_coloured_hessian(self):
        sp, X = _state()
        nw = m3c.newton.Newton(sp.n, [sp.T, np.column_stack([sp.hu, sp.hv, sp.ho1, sp.ho2])], sp.free)
        v = X[sp.free].ravel()
        grad = lambda u: sp.energy_grad(u, X)[1]
        Hf = nw.hessian(grad, v, grad(v), 1e-7)
        Hl = localhess.hessian(sp, X)
        self.assertLess(spla.norm(Hf - Hl) / spla.norm(Hf), 1e-7)

    def test_local_newton_converges_to_a_minimum(self):
        sp = m3c.m3.Disc("D", 800.0, 0.015, "kes")
        X = sp.start(0)
        nw = localhess.LocalNewton(sp, X)
        w = m3c.fem.GRAV * sp.mass.max()
        X, info = m3c.stage(sp, nw, w, X)
        self.assertLess(info["gmax"], 1e-5 * w)
        self.assertGreater(m3c.lam_min(sp, nw, X), 0.0)


if __name__ == "__main__":
    unittest.main()
