import importlib.util
import json
import math
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "nodetransfer"
spec = importlib.util.spec_from_file_location("nodetransfer_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
sys.modules["nodetransfer_run"] = run
spec.loader.exec_module(run)


class NodeTransfer(unittest.TestCase):
    def test_line_at_extrapolates_a_line(self):
        self.assertAlmostEqual(run.line_at([2, 3, 4, 5], [1.0, 1.5, 2.0, 2.5], 99), 1.0 + 0.5 * 97)

    def test_relax_gain_limits(self):
        self.assertEqual(run.relax_gain(0.3, 5.0, run.INF), 0.3)
        self.assertAlmostEqual(run.relax_gain(0.3, -1.0, 0.1), 0.3)
        self.assertAlmostEqual(run.relax_gain(0.3, 1.0, 1.0), 1 - 0.7 * math.exp(-1))
        self.assertAlmostEqual(run.relax_gain(0.3, 50.0, 0.05), 1.0)

    def test_relax_lever_at_inf_is_the_gain_lever(self):
        un = lambda x: 0.1 + (0.5 - x) ** 2
        shift = lambda l: -l
        g = run.NG.gain_lever(un, [0.3, 0.6], [0.4, 0.6], [0.5, 2.0], shift)
        r = run.relax_lever(un, [0.3, 0.6], [0.4, 0.6], [0.5, 2.0], shift, -0.01, -0.1, run.INF)
        for l in (0.0, 0.02, 0.1, 0.3):
            self.assertAlmostEqual(g(l), r(l), places=14)

    def test_relax_lever_fast_rate_becomes_the_unit_gain_lever_late(self):
        un = lambda x: -x
        shift = lambda l: -l
        r = run.relax_lever(un, [0.3], [1.0], [0.5], shift, -0.01, -0.1, 1e-6)
        self.assertAlmostEqual(r(0.0), 0.0)
        self.assertAlmostEqual(r(0.11), 0.11, places=9)

    def test_median_profile_and_pick_rho(self):
        self.assertEqual(run.median_profile([[1, 2], [3, 4], [5, 0]]), [3, 2])
        n = len(run.RHOS)
        others = [[0.05] * n for _ in range(3)]
        for o in others:
            o[2] = 0.01
        self.assertEqual(run.pick_rho(others), run.RHOS[2])
        self.assertEqual(run.pick_rho([[0.02] * n]), run.INF)

    def test_verdicts(self):
        good = dict(lev=dict(N=2.0, T=1.0), e=dict(NS=0.067, NG=0.07, NT=0.04, NR=0.05, C=0.035))
        V = run.verdicts({s: good for s in run.SETS}, 30, 40)
        self.assertEqual([V[h] for h in ("H240", "H241", "H242", "H243")], ["supported"] * 4)
        bad = dict(lev=dict(N=1.0, T=2.0), e=dict(NS=0.067, NG=0.07, NT=0.08, NR=0.09, C=0.035))
        V = run.verdicts({s: bad for s in run.SETS}, 10, 40)
        self.assertEqual([V[h] for h in ("H240", "H241", "H242", "H243")], ["refuted"] * 4)

    def test_rows_reproduce_5zv(self):
        p = HERE / "rows.json"
        if not p.exists():
            self.skipTest("rows.json not built")
        a = {(r["cond"], r["j"]): r for r in json.loads(p.read_text())}
        b = {(r["cond"], r["j"]): r for r in json.loads((HERE.parent / "nodegain" / "rows.json").read_text())}
        self.assertEqual(set(a), set(b))
        for k in a:
            for e in ("NS", "NG", "C"):
                self.assertAlmostEqual(a[k]["e"][e], b[k]["e"][e], places=12)
            self.assertEqual(a[k]["gains"], b[k]["gains"])
            self.assertLess(a[k]["g_check"], 1e-12)
            self.assertAlmostEqual(a[k]["e_rho"][-1], b[k]["e"]["NG"], places=12)
            self.assertTrue(all(0.0 <= g <= 3.0 for g in a[k]["h"] + a[k]["t"]))


if __name__ == "__main__":
    unittest.main()
