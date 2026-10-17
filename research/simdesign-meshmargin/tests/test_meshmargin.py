import os, sys, unittest
from dataclasses import replace
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "experiments"))
from simdesign_meshmargin import Params, PROCESSES, FREE, evaluate, solve
from run import with_margin


class T(unittest.TestCase):
    def test_margin_scales_only_the_stress_limit(self):
        p = PROCESSES["CNC routing"]
        q = with_margin(p, 1.3)
        self.assertAlmostEqual(q.material.sigma_allow, p.material.sigma_allow / 1.3)
        self.assertEqual(q.material.density, p.material.density)
        self.assertEqual(q.r_min, p.r_min)

    def test_margin_one_is_identity(self):
        p = PROCESSES["casting"]
        self.assertEqual(with_margin(p, 1.0), p)

    def test_stress_rises_with_refinement_and_deflection_converges(self):
        p = Params(w=12, r=6, b=5)
        m = FREE["aluminium plate"].material
        a, b = solve(p, m, h=2.5), solve(p, m, h=1.0)
        self.assertGreater(b["max_vm_mpa"], a["max_vm_mpa"])
        self.assertLess(abs(b["tip_deflection_mm"] - a["tip_deflection_mm"]) / a["tip_deflection_mm"], 0.02)

    def test_tighter_limit_makes_a_borderline_design_infeasible(self):
        proc = PROCESSES["FDM"]
        p = Params(w=24, r=14, b=4.0)
        s = evaluate(proc, p, h=2.5)["fe"]["max_vm_mpa"]
        loose = replace(proc, material=replace(proc.material, sigma_allow=s * 1.05))
        tight = with_margin(loose, 1.3)
        self.assertTrue(evaluate(loose, p, h=2.5)["feasible"] or evaluate(loose, p, h=2.5)["violations"]["tip deflection"] > 0)
        self.assertFalse(evaluate(tight, p, h=2.5)["feasible"])


if __name__ == "__main__":
    unittest.main()
