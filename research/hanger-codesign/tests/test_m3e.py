"""Milestone 3e: the cross-lattice state transfer and the distinct-state filter behind the pooled rule."""
import importlib.util
import sys
import unittest
from pathlib import Path

import numpy as np

EXP = Path(__file__).resolve().parents[1] / "experiments"
_saved = sys.modules.get("run")
_s = importlib.util.spec_from_file_location("m3e_run", EXP / "m3e_pooled" / "run.py")
m3e = importlib.util.module_from_spec(_s)
_s.loader.exec_module(m3e)
if _saved is not None:
    sys.modules["run"] = _saved
else:
    sys.modules.pop("run", None)


class TestM3e(unittest.TestCase):
    def test_transfer_onto_the_same_lattice_is_the_identity(self):
        sp = m3e.m3.Disc("D", 800.0, 0.015, "kes")
        X = sp.start(2)
        Y, nout = m3e.transfer(sp, X, m3e.m3.Disc("D", 800.0, 0.015, "kes"))
        self.assertEqual(nout, 0)
        np.testing.assert_allclose(Y, X, atol=1e-12)

    def test_transfer_carries_a_smooth_drape_between_lattices(self):
        a, b = m3e.m3.Disc("D", 800.0, 0.015, "kes"), m3e.m3.Disc("D", 800.0, 0.01, "kes")
        # a smooth axisymmetric droop, linear interpolation error is second order
        r = lambda P: np.hypot(P[:, 0], P[:, 1])
        X = a.X0.copy()
        X[:, 2] = -0.5 * r(a.P) ** 2
        Y, _ = m3e.transfer(a, X, b)
        err = np.abs(Y[:, 2] + 0.5 * r(b.P) ** 2)
        inner = b.free & (r(b.P) < 0.9 * r(a.P).max())       # inside the coarse hull: second order
        self.assertLess(err[inner].max(), 1e-4)
        self.assertLess(err[b.free].max(), 2e-3)                 # rim: nearest-node fallback
        np.testing.assert_array_equal(Y[b.fixed], b.X0[b.fixed])

    def test_distinct_keeps_one_per_state_and_drops_unconverged(self):
        rows = [dict(seed=0, folds=8, energy=-1.0, conv=True), dict(seed=1, folds=8, energy=-1.0 - 1e-12, conv=True),
                dict(seed=2, folds=9, energy=-1.0, conv=True), dict(seed=3, folds=8, energy=-0.9, conv=True),
                dict(seed=4, folds=7, energy=-2.0, conv=False)]
        self.assertEqual(sorted(r["seed"] for r in m3e.distinct(rows)), [1, 2, 3])


if __name__ == "__main__":
    unittest.main()
