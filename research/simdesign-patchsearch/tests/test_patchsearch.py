import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_patchsearch import Params, PROCESSES, evaluate, solve, patch_max, PATCH_RHO


class T(unittest.TestCase):
    def test_patch_measure_never_exceeds_peak(self):
        e = evaluate(PROCESSES["CNC routing"], Params(w=12, r=6, b=6), h=2.5, measure="patch")
        self.assertLessEqual(e["fe"]["patch_mpa"], e["fe"]["peak_mpa"] + 1e-9)
        self.assertAlmostEqual(e["fe"]["max_vm_mpa"], e["fe"]["patch_mpa"])

    def test_peak_measure_reproduces_plain_solve(self):
        proc = PROCESSES["CNC routing"]
        p = Params(w=12, r=6, b=6)
        e = evaluate(proc, p, h=2.5, measure="peak")["fe"]
        s = solve(p, proc.material, h=2.5)
        self.assertAlmostEqual(e["max_vm_mpa"], s["max_vm_mpa"])
        self.assertAlmostEqual(e["tip_deflection_mm"], s["tip_deflection_mm"])

    def test_looser_measure_makes_borderline_design_feasible(self):
        from dataclasses import replace
        proc = PROCESSES["FDM"]
        p = Params(w=24, r=14, b=4.0)
        e = evaluate(proc, p, h=2.5, measure="peak")["fe"]
        # limit between patch and peak value: infeasible under peak, passes the stress rule under patch
        lim = 0.5 * (e["peak_mpa"] + e["patch_mpa"])
        q = replace(proc, material=replace(proc.material, sigma_allow=lim))
        self.assertGreater(evaluate(q, p, 2.5, "peak")["violations"]["stress"], 0)
        self.assertEqual(evaluate(q, p, 2.5, "patch")["violations"]["stress"], 0)

    def test_rho_is_three_mm(self):
        self.assertEqual(PATCH_RHO, 3.0)


if __name__ == "__main__":
    unittest.main()
