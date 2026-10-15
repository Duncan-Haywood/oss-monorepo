import json, os, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from accel_codesign import codesign as cd

DP = json.load(open(os.path.join(HERE, "..", "experiments", "datapath_area.json")))["cells"]
MODELS = cd.load_models()
SPACE = cd.design_space(MODELS, DP)


class T(unittest.TestCase):
    def test_counts(self):
        self.assertEqual(len(MODELS), 40)
        self.assertEqual(len(SPACE), 40 * len(cd.LANES))

    def test_p1_matches_accel_kws_cycles_and_area(self):
        rows = json.load(open(cd.KWS))["rows"]
        for r, m in zip(rows, MODELS):
            d = cd.design_space([m], DP, lanes=(1,))[0]
            self.assertEqual(d["cyc"], r["cycles"][0])
            self.assertEqual(d["area"], r["cells"])

    def test_cycles_fall_and_area_rises_with_lanes(self):
        m = MODELS[20]
        ds = cd.design_space([m], DP)
        for a, b in zip(ds, ds[1:]):
            self.assertLessEqual(b["cyc"], a["cyc"])
            self.assertGreater(b["area"], a["area"])

    def test_sequential_meets_deadline_and_joint_never_worse(self):
        for D in (2000, 5000, 20000):
            s = cd.sequential(SPACE, D)
            self.assertLessEqual(s["cyc"], D)
            j = cd.joint_min_area(SPACE, D, s["val"] - 1e-12)
            self.assertLessEqual(j["area"], s["area"])
            self.assertLessEqual(j["cyc"], D)

    def test_infeasible_deadline(self):
        self.assertIsNone(cd.sequential(SPACE, 10))

    def test_pareto_nondominated(self):
        pts = [dict(v=.7, a=10, e=1), dict(v=.7, a=12, e=1), dict(v=.8, a=20, e=2)]
        f = cd.pareto(pts, ("v", "a", "e"))
        self.assertEqual(len(f), 2)


if __name__ == "__main__":
    unittest.main()
