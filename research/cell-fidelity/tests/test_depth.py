import importlib.util
import math
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "depth"
spec = importlib.util.spec_from_file_location("depth_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
sys.modules["depth_run"] = run
spec.loader.exec_module(run)


def record(j=0, n=100, nodes=4):
    """A synthetic run: plating doubles at the separator node and halves elsewhere between cycles 2 and 99."""
    pl = [[1.0] * nodes for _ in range(n)]
    pl[98] = [0.5] * (nodes - 1) + [2.0]
    u = [[0.10] * nodes for _ in range(n)]
    u[98] = [0.11] * (nodes - 1) + [0.14]
    cum = [0.001 * (k + 1) for k in range(n)]
    return dict(j=j, pl_node=pl, u_node=u, x_n=[(i + 0.5) / nodes for i in range(nodes)], L_n=1.0, pl_mol=cum)


class Depth(unittest.TestCase):
    def test_weights_sum_to_one(self):
        w = run.weights([1.0, 3.0])
        self.assertEqual(w, [0.25, 0.75])
        self.assertTrue(all(math.isnan(v) for v in run.weights([0.0, 0.0])))

    def test_centroid(self):
        self.assertAlmostEqual(run.centroid([0.5, 0.5], [0.25, 0.75], 1.0), 0.5)
        self.assertAlmostEqual(run.centroid([0.0, 1.0], [0.25, 0.75], 1.0), 0.75)

    def test_weighted_rise_uses_early_weights(self):
        self.assertAlmostEqual(run.weighted_rise([0.25, 0.75], [0.0, 0.0], [0.04, 0.0]), 0.01)

    def test_design_row(self):
        r = run.design_row(record())
        self.assertAlmostEqual(r["s_lo"], 0.25)
        self.assertAlmostEqual(r["s_hi"], 2.0 / 3.5)
        self.assertAlmostEqual(r["d_sep"], math.log(2.0))
        self.assertAlmostEqual(r["d_tot"], math.log(3.5 / 4.0))
        self.assertAlmostEqual(r["m_sep"], 0.04)
        self.assertAlmostEqual(r["m_w"], 0.25 * (0.01 * 3 + 0.04))
        self.assertAlmostEqual(r["d_booked"], 0.0, places=12)

    def test_verdicts(self):
        C = {c: dict(s_lo=0.3, gap=0.05, ratio=1.0) for c in run.SETS.values()}
        C[run.NCA]["gap"] = 0.3
        C[run.AI]["ratio"] = 0.28
        C["Chen2020@1.5x"]["ratio"] = 1.5
        V, N = run.verdicts(C, [(0.0, 0.0, 0.0)])
        self.assertEqual(V, dict(H191="supported", H192="supported", H193="supported", H194="supported"))
        C[run.AI]["ratio"] = 0.6
        C[run.NCA]["gap"] = 0.05
        C["Chen2020@1.5x"]["s_lo"] = 0.9
        V, _ = run.verdicts(C, [(0.0, 0.0, 0.5)])
        self.assertEqual(V, dict(H191="refuted", H192="refuted", H193="refuted", H194="refuted"))


if __name__ == "__main__":
    unittest.main()
