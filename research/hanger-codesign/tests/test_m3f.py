"""Milestone 3f: the affine (rim-aware) transfer between Cusick lattices."""
import importlib.util
import sys
import unittest
from pathlib import Path

import numpy as np

EXP = Path(__file__).resolve().parents[1] / "experiments"
_saved = sys.modules.get("run")
sys.path.insert(0, str(EXP / "m3_fem_tier"))
_s3 = importlib.util.spec_from_file_location("run", EXP / "m3_fem_tier" / "run.py")
_m3 = importlib.util.module_from_spec(_s3)
sys.modules["run"] = _m3
_s3.loader.exec_module(_m3)
_s = importlib.util.spec_from_file_location("m3f_run", EXP / "m3f_transfer" / "run.py")
m3f = importlib.util.module_from_spec(_s)
_s.loader.exec_module(m3f)
if _saved is not None:
    sys.modules["run"] = _saved
else:
    sys.modules.pop("run", None)
Disc = m3f.m3.Disc


class TestM3f(unittest.TestCase):
    def test_same_lattice_is_the_identity(self):
        sp = Disc("A", 369.0, 0.015, "kes")
        X = sp.start(3)
        Y, nout = m3f.affine_transfer(sp, X, Disc("A", 369.0, 0.015, "kes"))
        self.assertEqual(nout, 0)
        np.testing.assert_allclose(Y, X, atol=1e-12)

    def test_inside_the_hull_it_matches_3e(self):
        a, b = Disc("A", 369.0, 0.015, "kes"), Disc("A", 369.0, 0.01, "kes")
        X = a.start(1)
        Y0, n0 = m3f.m3e.transfer(a, X, b)
        Y1, n1 = m3f.affine_transfer(a, X, b)
        self.assertGreaterEqual(n1, n0)
        self.assertGreater(n0, 0)
        # nodes at least one lattice side inside the source's cut radius sit in a source element
        inside = b.rho0 < 0.15 - 0.015
        np.testing.assert_allclose(Y1[inside], Y0[inside], atol=1e-12)
        self.assertGreater(np.abs(Y1 - Y0).max(), 1e-6)

    def test_an_affine_drape_is_carried_exactly_past_the_rim(self):
        # a planar deformation (rotation down about y plus a stretch) is affine, so the extension is exact
        # outside the hull, where 3e's nearest-node fill is off by up to about a/2
        a, b = Disc("A", 369.0, 0.015, "kes"), Disc("A", 369.0, 0.01, "kes")
        M = np.array([[0.8, 0.1], [0.0, 1.05], [-0.6, 0.2]])
        f = lambda sp: sp.P @ M.T + np.array([0.0, 0.0, 0.01])
        Y, nout = m3f.affine_transfer(a, f(a), b)
        free = ~b.fixed
        np.testing.assert_allclose(Y[free], f(b)[free], atol=1e-12)
        Y0, _ = m3f.m3e.transfer(a, f(a), b)
        self.assertGreater(np.abs(Y0[free] - f(b)[free]).max(), 1e-3)


if __name__ == "__main__":
    unittest.main()
