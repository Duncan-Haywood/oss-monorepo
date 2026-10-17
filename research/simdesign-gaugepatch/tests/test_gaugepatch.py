import json, os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_gaugepatch import Params, PROCESSES, evaluate, patch_max

EXP = os.path.join(os.path.dirname(__file__), "..", "experiments")
P = Params(w=14.7, r=9.8, b=2)


class T(unittest.TestCase):
    def test_patch_measure_below_peak(self):
        fe = evaluate(PROCESSES["laser cutting"], P, h=1.5)["fe"]
        self.assertLessEqual(patch_max(fe, 3.0), fe["peak_mpa"] + 1e-9)

    def test_patch_converges_where_peak_does_not(self):
        pk, pt = [], []
        for h in (2.5, 1.0, 0.75):
            fe = evaluate(PROCESSES["laser cutting"], P, h=h)["fe"]
            pk.append(fe["peak_mpa"]); pt.append(patch_max(fe, 3.0))
        self.assertLess(abs(pt[2] / pt[1] - 1), 0.03)   # patch: h = 1.0 vs 0.75 mm
        self.assertGreater(pk[2] / pk[0], 1.05)         # centroid peak: 0.75 vs 2.5 mm

    def test_patch_feasible_on_fine_mesh_peak_not(self):
        proc = PROCESSES["laser cutting"]
        self.assertTrue(evaluate(proc, P, h=1.0, measure="patch")["feasible"])
        self.assertFalse(evaluate(proc, P, h=1.0, measure="peak")["feasible"])

    def test_results_file_consistent(self):
        res = json.load(open(os.path.join(EXP, "results.json")))
        self.assertEqual(len(res), 39)
        for x in res:
            self.assertEqual(len(x["rows"]), 4)
            for r in x["rows"]:
                self.assertLessEqual(r["patch"]["3.0"], r["peak"] + 1e-6)
                self.assertTrue(r["feasible_patch3"])


if __name__ == "__main__":
    unittest.main()
