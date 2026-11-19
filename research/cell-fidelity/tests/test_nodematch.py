import importlib.util
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "nodematch"
spec = importlib.util.spec_from_file_location("nodematch_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
sys.modules["nodematch_run"] = run
spec.loader.exec_module(run)


class NodeMatch(unittest.TestCase):
    def test_scale_maps_bounds_to_unit_cube(self):
        for a, b in zip(run.scale([50.0, 0.4, 0.3, 1.1]), [0.0, 1.0, 0.5, 0.5]):
            self.assertAlmostEqual(a, b, places=12)

    def test_nearest_orders_by_distance_then_index(self):
        others = [(0, [0.0, 0.0]), (1, [1.0, 0.0]), (2, [0.0, 1.0]), (3, [0.1, 0.0])]
        idx, dk = run.nearest([0.0, 0.0], others, k=3)
        self.assertEqual(idx, [0, 3, 1])
        self.assertAlmostEqual(dk, 1.0)

    def test_line_fit_at(self):
        self.assertAlmostEqual(run.line_fit_at([1, 2, 3], [2.0, 4.0, 6.0], 5), 10.0)
        self.assertAlmostEqual(run.line_fit_at([2, 2], [1.0, 3.0], 9), 2.0)
        self.assertEqual(run.clip(3.7), 3.0)
        self.assertEqual(run.clip(-0.2), 0.0)

    def test_profiles_leave_the_design_out_and_stay_in_set(self):
        rows = [dict(set="A", h=[1.0]), dict(set="A", h=[2.0]), dict(set="A", h=[3.0]), dict(set="A", h=[9.0]),
                dict(set="B", h=[100.0])]
        xs = [[0.0], [0.1], [0.2], [0.3], [0.0]]
        t, _ = run.knn_profile(0, rows, xs)
        self.assertEqual(t, [3.0])  # median of 2, 3, 9: the design itself and set B are excluded
        ln = [1.0, 2.0, 3.0, 4.0, 1.0]
        rows[3]["h"] = [4.0]
        self.assertAlmostEqual(run.line_profile(0, rows, ln)[0], 1.0)

    def test_verdicts(self):
        good = dict(e=dict(NS=0.067, NT=0.07, NK=0.04, C=0.035))
        V = run.verdicts({s: good for s in run.SETS}, 30, 40)
        self.assertEqual([V[h] for h in ("H244", "H245", "H246", "H247")], ["supported"] * 4)
        bad = dict(e=dict(NS=0.067, NT=0.03, NK=0.08, C=0.035))
        V = run.verdicts({s: bad for s in run.SETS}, 10, 40)
        self.assertEqual([V[h] for h in ("H244", "H245", "H246", "H247")], ["refuted"] * 4)

    def test_rows_reproduce_5zw(self):
        p = HERE / "rows.json"
        if not p.exists():
            self.skipTest("rows.json not built")
        rs = json.loads(p.read_text())
        self.assertEqual(len(rs), 40)
        for r in rs:
            self.assertAlmostEqual(r["e"]["NT_re"], r["e"]["NT"], places=12)
            self.assertTrue(all(0.0 <= g <= 3.0 for g in r["tK"] + r["tL"]))


if __name__ == "__main__":
    unittest.main()
