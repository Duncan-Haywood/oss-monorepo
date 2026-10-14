import json, os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "experiments"))
from simdesign_gaugefine import Params, PROCESSES, evaluate

EXP = os.path.join(os.path.dirname(__file__), "..", "experiments")


class T(unittest.TestCase):
    def test_patch_below_peak_and_one_solve_gives_both(self):
        fe = evaluate(PROCESSES["laser cutting"], Params(w=14.7, r=9.8, b=2), h=2.5)["fe"]
        self.assertLessEqual(fe["patch_mpa"], fe["peak_mpa"] + 1e-9)

    def test_rule_violation_skips_fe(self):
        e = evaluate(PROCESSES["laser cutting"], Params(w=2.0, r=5.0, b=2), h=2.5)
        self.assertIsNone(e["fe"])
        self.assertFalse(e["feasible"])

    def test_results_file_consistent(self):
        import run
        res = json.load(open(os.path.join(EXP, "results.json")))
        self.assertEqual(len(res), 2 * len(run.GAUGES) * run.NG ** 2)
        for c in res:
            if c["rule_ok"]:
                self.assertIn("2.5", c["by_h"])
                for v in c["by_h"].values():
                    self.assertLessEqual(v["patch"], v["peak"] + 1e-9)


if __name__ == "__main__":
    unittest.main()
