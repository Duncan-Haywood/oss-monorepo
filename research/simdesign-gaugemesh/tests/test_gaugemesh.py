import json, os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_gaugemesh import Params, PROCESSES, evaluate

EXP = os.path.join(os.path.dirname(__file__), "..", "experiments")


class T(unittest.TestCase):
    def test_tip_deflection_converges_with_mesh(self):
        p = Params(w=14.7, r=9.8, b=2)
        proc = PROCESSES["laser cutting"]
        t = [evaluate(proc, p, h=h)["fe"]["tip_deflection_mm"] for h in (2.5, 1.5)]
        self.assertLess(abs(t[0] - t[1]) / t[1], 0.01)

    def test_coarse_mesh_feasible_fine_mesh_not(self):
        p = Params(w=14.7, r=9.8, b=2)
        proc = PROCESSES["laser cutting"]
        self.assertTrue(evaluate(proc, p, h=2.5)["feasible"])
        self.assertFalse(evaluate(proc, p, h=1.5)["feasible"])

    def test_results_file_consistent(self):
        res = json.load(open(os.path.join(EXP, "results.json")))
        self.assertEqual(len(res), 39)
        for x in res:
            self.assertTrue(x["rows"][0]["feasible"])          # selected because feasible at h=2.5
            self.assertFalse(any(r["feasible"] for r in x["rows"][1:]))

    def test_mass_independent_of_mesh(self):
        p = Params(w=14.7, r=9.8, b=2)
        proc = PROCESSES["laser cutting"]
        self.assertEqual(evaluate(proc, p, h=2.5)["mass_g"], evaluate(proc, p, h=1.5)["mass_g"])


if __name__ == "__main__":
    unittest.main()
