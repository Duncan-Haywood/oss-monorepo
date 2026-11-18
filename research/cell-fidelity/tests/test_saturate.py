import importlib.util
import json
import math
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "saturate"
spec = importlib.util.spec_from_file_location("saturate_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
sys.modules["saturate_run"] = run
spec.loader.exec_module(run)


class Saturate(unittest.TestCase):
    def test_lam_grid_ends(self):
        g = run.lam_grid(2.0)
        self.assertEqual(len(g), run.LAM_N)
        self.assertAlmostEqual(g[0], 0.5)
        self.assertAlmostEqual(g[-1], 40.0)

    def test_sat_fit_recovers_an_exponential_on_the_grid(self):
        lams = run.lam_grid(1.0)
        lam = lams[20]
        xs = [0.1 * i for i in range(10)]
        ys = [0.2 - 0.05 * math.exp(-x / lam) for x in xs]
        c, d, l, sse = run.sat_fit(xs, ys, 0.0, lams)
        self.assertAlmostEqual(l, lam)
        self.assertAlmostEqual(c, 0.2, places=9)
        self.assertAlmostEqual(d, -0.05, places=9)
        self.assertLess(sse, 1e-20)

    def test_sat_fit_on_a_line_goes_to_the_long_end(self):
        xs = [0.1 * i for i in range(10)]
        c, d, l, _ = run.sat_fit(xs, [1.0 - 0.3 * x for x in xs], 0.0, run.lam_grid(0.9))
        self.assertAlmostEqual(l, run.lam_grid(0.9)[-1])

    def test_clamp_and_hold(self):
        f = run.clamp_sat(0.1, 1.0, 1.0, 0.0, 0.5)
        self.assertEqual(f(0.0), 0.5)
        self.assertAlmostEqual(f(100.0), 0.1)
        h = run.hold_after(lambda l: 2.0 * l, 3.0)
        self.assertEqual(h(1.0), 2.0)
        self.assertEqual(h(10.0), 6.0)

    def test_verdict_thresholds(self):
        s = dict(qerrS=0.04, qerrE=0.07, e_NM=0.05, e_N=0.055)
        V = run.verdicts({k: dict(s) for k in "abcd"}, 26, 40)
        self.assertEqual([V[h] for h in ("H224", "H225", "H226", "H227")], ["supported"] * 4)
        s = dict(qerrS=0.2, qerrE=0.07, e_NM=0.02, e_N=0.06)
        V = run.verdicts({k: dict(s) for k in "abcd"}, 20, 40)
        self.assertEqual([V[h] for h in ("H224", "H225", "H226", "H227")], ["refuted"] * 4)

    def test_rows_reproduce_5zr(self):
        p, q = HERE / "rows.json", HERE.parent / "window" / "rows.json"
        if not p.exists():
            self.skipTest("rows.json not built")
        a = {(r["cond"], r["j"]): r for r in json.loads(p.read_text())}
        b = {(r["cond"], r["j"]): r for r in json.loads(q.read_text())}
        self.assertEqual(set(a), set(b))
        for k in a:
            for v in ("A", "N", "NE"):
                self.assertEqual(a[k][f"e_{v}"], b[k][f"e_{v}"])
            self.assertEqual(a[k]["qerrE"], b[k]["qerrE"])


if __name__ == "__main__":
    unittest.main()
