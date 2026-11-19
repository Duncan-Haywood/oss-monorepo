"""Milestone 4c: the energy split and the locking exponent fit."""
import importlib.util
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
    _s = importlib.util.spec_from_file_location("m4c_run", ROOT / "m4c_locking" / "run.py")
    m4c = importlib.util.module_from_spec(_s)
    _s.loader.exec_module(m4c)
finally:
    if _saved is not None:
        sys.modules["run"] = _saved
    else:
        sys.modules.pop("run", None)


class TestM4c(unittest.TestCase):
    def setUp(self):
        self.sp = m4c.m4a.FabricDisc("F1", 150.0, 0.0075, "fast")
        self.X = self.sp.start(0)

    def test_split_sums_to_total_energy(self):
        s = m4c.split(self.sp, self.X)
        E = self.sp.energy_grad(self.X[self.sp.free].ravel(), self.X)[0]
        self.assertAlmostEqual(s["grav"] + s["stretch"] + s["shear"] + s["bend"], E, delta=1e-12 * max(1, abs(E)))

    def test_flat_state_has_no_strain(self):
        s = m4c.split(self.sp, self.sp.X0.copy())
        self.assertLess(s["epsmax"], 1e-12)
        self.assertLess(s["stretch"] + s["shear"] + s["bend"], 1e-18)

    def test_uniform_stretch_strain_and_energy(self):
        # an in-plane dilation by (1 + d): Green strain d + d^2/2 on both axes, no shear, no bending
        d = 0.01
        X = self.sp.X0.copy()
        X[:, :2] *= 1 + d
        s = m4c.split(self.sp, X)
        e = d + d * d / 2
        self.assertAlmostEqual(s["eps99"], e, places=12)
        self.assertAlmostEqual(s["stretch"], self.sp.EA * e * e * self.sp.area.sum(), places=12)
        self.assertLess(s["shear"], 1e-20)

    def test_fit_p_recovers_exponent(self):
        rows = [dict(branch="up", conv=True, folds=8, ea=ea, stretch=3.0 * ea ** -0.7) for ea in (150, 300, 600, 1200)]
        p, n = m4c.fit_p(rows)
        self.assertEqual(n, 4)
        self.assertAlmostEqual(p, -0.7, places=10)
        rows[2]["folds"] = rows[3]["folds"] = 9      # only two stages keep the EA 150 fold count
        self.assertEqual(m4c.fit_p(rows), (None, 2))

    def test_rise_per_doubling_skips_fold_changes(self):
        rows = [dict(branch="up", conv=True, folds=f, ea=ea, dc=dc)
                for f, ea, dc in ((8, 150, 0.30), (8, 300, 0.31), (9, 600, 0.40), (9, 1200, 0.43))]
        m, steps = m4c.rise_per_doubling(rows)
        self.assertEqual(len(steps), 2)
        self.assertAlmostEqual(m, 0.02, places=12)

    def test_log_parser_reads_4a(self):
        rows = m4c.logged_4a()
        self.assertEqual(rows[("F9", "2.5", 150)][:2], (0.7301, 8))
        self.assertTrue(np.isfinite(rows[("F9", "2.5", 4785)][2]))


if __name__ == "__main__":
    unittest.main()
