import importlib.util
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "window"
spec = importlib.util.spec_from_file_location("window_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
sys.modules["window_run"] = run
spec.loader.exec_module(run)


class Window(unittest.TestCase):
    def test_line_fit_recovers_a_line(self):
        a, s = run.line_fit([1.0, 2.0, 3.0], [3.0, 5.0, 7.0])
        self.assertAlmostEqual(a, 1.0)
        self.assertAlmostEqual(s, 2.0)

    def test_clamp_line(self):
        f = run.clamp_line(0.01, -1.0, 0.5)
        self.assertEqual(f(1.0), 0.0)
        self.assertAlmostEqual(f(0.005), 0.005)
        self.assertEqual(run.clamp_line(1.0, 0.0, 0.5)(0.0), 0.5)

    def test_window_factor_is_one_below_l2_and_rises_as_capacity_falls(self):
        cap = lambda n, e: max(0.0, n - 10.0 * e)          # capacity falls with lithium lost and with eta
        q = run.window_factor(cap, 100.0, 2.0, lambda l: 0.1 * l)
        self.assertEqual(q(1.0), 1.0)
        self.assertAlmostEqual(q(2.0), 1.0)
        self.assertAlmostEqual(q(10.0), (98.0 - 2.0) / (90.0 - 10.0))
        self.assertEqual(run.window_factor(cap, 1.0, 0.0, lambda l: 1.0)(0.5), 1e9)

    def test_verdict_thresholds(self):
        s = dict(qerrE=0.05, qerr10=0.2, e_NE=0.01, e_A=0.02)
        V = run.verdicts({k: dict(s) for k in "abcd"}, 26, 40)
        self.assertEqual([V[h] for h in ("H220", "H221", "H222", "H223")], ["supported"] * 4)
        s = dict(qerrE=0.3, qerr10=0.2, e_NE=0.03, e_A=0.02)
        V = run.verdicts({k: dict(s) for k in "abcd"}, 20, 40)
        self.assertEqual([V[h] for h in ("H220", "H221", "H222", "H223")], ["refuted"] * 4)

    def test_rows_reproduce_5zq(self):
        p, q = HERE / "rows.json", HERE.parent / "drift" / "rows.json"
        if not p.exists():
            self.skipTest("rows.json not built")
        a = {(r["cond"], r["j"]): r for r in json.loads(p.read_text())}
        b = {(r["cond"], r["j"]): r for r in json.loads(q.read_text())}
        self.assertEqual(set(a), set(b))
        for k in a:
            for v in ("A", "N", "NQ", "PQ"):
                self.assertEqual(a[k][f"e_{v}"], b[k][f"e_{v}"])


if __name__ == "__main__":
    unittest.main()
