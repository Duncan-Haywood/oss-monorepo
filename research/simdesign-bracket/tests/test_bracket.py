import os, sys, tempfile, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import numpy as np
from simdesign_bracket import Params, solve, mass_g, build_polygon, check_printability, write_extruded_stl
from simdesign_bracket.model import make_mesh


def beam_tip(p, mat_E=3000.0, nu=0.36):
    """Euler-Bernoulli + shear estimate on centre lines (horizontal arm + rotation of the vertical arm)."""
    I = p.b * p.w ** 3 / 12
    Lh = p.L - p.w / 2
    d_arm = p.F * Lh ** 3 / (3 * mat_E * I)
    d_rot = (p.F * Lh) * (p.H - p.w / 2) / (mat_E * I) * Lh
    G = mat_E / (2 * (1 + nu))
    d_shear = p.F * Lh / (5 / 6 * p.w * p.b * G)
    return d_arm + d_rot + d_shear


class T(unittest.TestCase):
    def test_polygon_area_and_mass(self):
        p = Params(w=10, r=0, b=10)
        area = 80 * 10 + 70 * 10
        self.assertAlmostEqual(mass_g(p) / (10 * 1.24e-3), area, places=3)

    def test_fillet_removes_area_correction(self):
        a0 = mass_g(Params(r=0)); a1 = mass_g(Params(r=8))
        self.assertGreater(a1, a0)  # a fillet adds material
        self.assertAlmostEqual((a1 - a0) / (15 * 1.24e-3), 8 ** 2 * (1 - np.pi / 4), places=1)

    def test_fe_matches_beam_theory(self):
        p = Params(w=10, r=4, b=15)
        fe = solve(p)["tip_deflection_mm"]
        self.assertLess(abs(fe / beam_tip(p) - 1), 0.15)

    def test_stiffer_with_wider_arm(self):
        self.assertLess(solve(Params(w=16))["tip_deflection_mm"], solve(Params(w=10))["tip_deflection_mm"])

    def test_fillet_lowers_peak_stress(self):
        self.assertLess(solve(Params(w=12, r=8))["max_vm_mpa"], solve(Params(w=12, r=0.5))["max_vm_mpa"])

    def test_load_scaling_is_linear(self):
        a = solve(Params(F=50)); b = solve(Params(F=100))
        self.assertAlmostEqual(b["max_vm_mpa"] / a["max_vm_mpa"], 2.0, places=6)

    def test_printability_flags(self):
        self.assertFalse(check_printability(Params(w=1.0))["min_wall_ok"])
        c = check_printability(Params(w=12, b=15))
        self.assertTrue(c["min_wall_ok"]); self.assertAlmostEqual(c["overhang_mm_profile_upright"], 80.0)

    def test_stl_volume_matches_mass(self):
        p = Params(w=12, r=6, b=15)
        with tempfile.TemporaryDirectory() as d:
            info = write_extruded_stl(os.path.join(d, "x.stl"), build_polygon(p, 200), p.b)
        self.assertAlmostEqual(info["volume_mm3"] * 1.24e-3, mass_g(p), delta=0.01 * mass_g(p))

if __name__ == "__main__":
    unittest.main()
