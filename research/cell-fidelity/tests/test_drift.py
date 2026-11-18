import importlib.util
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "drift"
spec = importlib.util.spec_from_file_location("drift_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
sys.modules["drift_run"] = run
spec.loader.exec_module(run)


class Drift(unittest.TestCase):
    def test_origin_slope_recovers_a_line_through_zero(self):
        self.assertAlmostEqual(run.origin_slope([1.0, 2.0, 3.0], [2.0, 4.0, 6.0]), 2.0)
        self.assertEqual(run.origin_slope([0.0, 0.0], [1.0, 2.0]), 0.0)

    def test_ramp_is_flat_below_l2_and_linear_above(self):
        f = run.ramp(3.0, 1.0, base=1.0)
        self.assertEqual(f(0.5), 1.0)
        self.assertEqual(f(1.0), 1.0)
        self.assertAlmostEqual(f(2.0), 4.0)

    def test_fit10_reads_only_cycles_two_to_ten(self):
        lost = [0.1 * n for n in range(1, 101)]
        ys = [2.0 * (lost[n - 1] - lost[1]) for n in range(2, 11)] + [1e9] * 89
        self.assertAlmostEqual(run.fit10(lost, ys), 2.0)

    def test_gap_share(self):
        self.assertAlmostEqual(run.gap_share(0.08, 0.05, 0.02), 0.5)
        self.assertIsNone(run.gap_share(0.08, None, 0.02))

    def test_verdict_thresholds(self):
        s = dict(e_F=0.01, e_A=0.02, qerr=0.05, derr=1.0, absM99=10.0)
        S = {k: dict(s) for k in "abcd"}
        V = run.verdicts(S, 26, 40)
        self.assertEqual([V[h] for h in ("H216", "H217", "H218", "H219")], ["supported"] * 4)
        V = run.verdicts(S, 20, 40)
        self.assertEqual(V["H217"], "refuted")

    def test_committed_rows_reproduce_5zn_and_5zp(self):
        a = json.loads((HERE / "rows.json").read_text())
        o = {(r["cond"], r["j"]): r for r in json.loads((HERE.parent / "oracle" / "rows.json").read_text())}
        p = {(r["cond"], r["j"]): r for r in json.loads((HERE.parent / "rate" / "rows.json").read_text())}
        self.assertEqual(len(a), 40)
        for r in a:
            k = (r["cond"], r["j"])
            self.assertAlmostEqual(r["e_A"], o[k]["eA"], places=12)
            self.assertAlmostEqual(r["e_N"], o[k]["eN"], places=12)
            self.assertAlmostEqual(r["e_PQ"], p[k]["e_PQ"], places=12)


if __name__ == "__main__":
    unittest.main()
