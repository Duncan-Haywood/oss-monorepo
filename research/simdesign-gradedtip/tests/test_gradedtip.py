import json, os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_gradedtip import Params, solve, solve_graded
from simdesign_gradedtip.dfm import STEEL_SHEET

EXP = os.path.join(os.path.dirname(__file__), "..", "experiments")
P = Params(w=14.0, r=10.0, b=2.0)


class T(unittest.TestCase):
    def test_graded_mesh_matches_uniform_when_not_refined(self):
        # hmin = h0 = 1.5 mm is a uniform mesh of the same size; stress within 5%, tip within 0.5%
        u = solve(P, STEEL_SHEET, h=1.5)
        g = solve_graded(P, STEEL_SHEET, hmin=1.5)
        self.assertLess(abs(g["peak_mpa"] / u["max_vm_mpa"] - 1), 0.05)
        self.assertLess(abs(g["tip_deflection_mm"] / u["tip_deflection_mm"] - 1), 0.005)

    def test_refinement_adds_few_elements_and_keeps_tip(self):
        a = solve_graded(P, STEEL_SHEET, hmin=1.5)
        b = solve_graded(P, STEEL_SHEET, hmin=0.1)
        self.assertLess(b["n_elements"], 2 * a["n_elements"])
        self.assertLess(abs(b["tip_deflection_mm"] / a["tip_deflection_mm"] - 1), 0.005)

    def test_min_edge_reaches_requested_size(self):
        s = solve_graded(P, STEEL_SHEET, hmin=0.1)
        self.assertLess(s["min_edge"], 0.2)

    def test_results_plateau(self):
        res = json.load(open(os.path.join(EXP, "results.json")))
        self.assertEqual(len(res), 4 * 3 * 2 * 7)
        for d in range(4):
            rr = sorted([x for x in res if x["design"] == d and x["grade"] == 0.3 and x["n_arc"] == 384], key=lambda x: -x["hmin"])
            pk = [x["peak"] for x in rr]
            last = pk[-3:]
            self.assertLess((max(last) - min(last)) / (sum(last) / 3), 0.03)   # flat over the last 4x refinement
            self.assertGreater(pk[-1], 1.05 * pk[0])                           # but above the 1.5 mm value


if __name__ == "__main__":
    unittest.main()
