import os, sys, unittest
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_patchstress import Params, Material, solve, patch_max, nominal_bending_mpa

MAT = Material(E=69000.0, nu=0.33, density=2.70e-3, sigma_allow=100.0)


def toy_field(vm):
    n = len(vm)
    cen = np.c_[np.linspace(0, 10, n), np.zeros(n)]
    return {"vm": np.asarray(vm, float), "cen": cen, "area": np.ones(n), "free": np.ones(n, bool)}


class T(unittest.TestCase):
    def test_patch_of_uniform_field_is_the_value(self):
        self.assertAlmostEqual(patch_max(toy_field(np.full(50, 7.0)), 2.0), 7.0)

    def test_patch_smooths_a_single_spike(self):
        vm = np.ones(101); vm[50] = 100.0
        f = toy_field(vm)
        self.assertLess(patch_max(f, 1.0), 100.0)
        self.assertGreater(patch_max(f, 1.0), 1.0)

    def test_patch_never_exceeds_peak(self):
        f = solve(Params(w=12, r=6, b=5), MAT, h=2.0, return_field=True)
        for rho in (1.0, 3.0):
            self.assertLessEqual(patch_max(f, rho), f["max_vm_mpa"] + 1e-9)

    def test_field_peak_matches_default_solve(self):
        p = Params(w=12, r=6, b=5)
        self.assertAlmostEqual(solve(p, MAT, h=2.5)["max_vm_mpa"], solve(p, MAT, h=2.5, return_field=True)["max_vm_mpa"])

    def test_nominal_bending_formula(self):
        # F = 100 N, arm 80 - 6 = 74 mm, w = 12, b = 5: 6*100*74/(5*144)
        self.assertAlmostEqual(nominal_bending_mpa(100, 80, 12, 5), 61.6667, places=3)


if __name__ == "__main__":
    unittest.main()
