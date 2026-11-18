import importlib.util
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "rate"
spec = importlib.util.spec_from_file_location("rate_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
sys.modules["rate_run"] = run
spec.loader.exec_module(run)


class Rate(unittest.TestCase):
    def test_series_fn_below_inside_and_tail(self):
        f = run.series_fn([1.0, 2.0, 3.0, 4.0], [1.0, 2.0, 3.0, 4.0], below=7.0, tail=2)
        self.assertEqual(f(0.5), 7.0)
        self.assertAlmostEqual(f(2.5), 2.5)
        self.assertAlmostEqual(f(6.0), 6.0)

    def test_q_measured_is_one_at_cycle_two_and_rises_as_charge_falls(self):
        lost = [0.1 * n for n in range(1, 101)]
        q = [2.0 - 0.01 * n for n in range(1, 101)]
        f = run.q_measured(lost, q)
        self.assertAlmostEqual(f(lost[1]), 1.0)
        self.assertAlmostEqual(f(0.0), 1.0)
        self.assertAlmostEqual(f(lost[49]), q[1] / q[49])
        self.assertGreater(f(lost[98]), f(lost[49]))

    def test_table_replaces_only_what_is_given(self):
        t = ([0.0, 1.0], [5.0, 6.0], [1.0, 2.0])
        self.assertEqual(run.table(t, du=lambda l: 2 * l), ([0.0, 1.0], [0.0, 2.0], [1.0, 2.0]))
        self.assertEqual(run.table(t, qr=lambda l: 3.0), ([0.0, 1.0], [5.0, 6.0], [3.0, 3.0]))

    def test_verdicts(self):
        d = lambda c, e, cq, cf: dict(absc_O=0.1, absc_P=c, e_O=0.04, e_P=e, absc_OQ=cq, absc_Of=cf)
        S = {"a": d(0.05, 0.02, 0.2, 0.1), "b": d(0.05, 0.05, 0.2, 0.11), "c": d(0.05, 0.05, 0.2, 0.1),
             "e": d(0.2, 0.02, 0.05, 0.1)}
        V = run.verdicts(S)
        self.assertEqual(V["H212"], "supported")
        self.assertEqual(V["H213"], "inconclusive")
        self.assertEqual(V["H214"], "refuted")
        self.assertEqual(V["H215"], "supported")

    def test_committed_rows_reproduce_5zo(self):
        a = json.loads((HERE / "rows.json").read_text())
        b = json.loads((HERE.parent / "oracle" / "rows.json").read_text())
        self.assertEqual(len(a), 40)
        for x, y in zip(a, b):
            self.assertEqual((x["cond"], x["j"]), (y["cond"], y["j"]))
            self.assertAlmostEqual(x["e_O"], y["eO10"], places=12)
            self.assertAlmostEqual(x["c_O"], y["c"], places=12)


if __name__ == "__main__":
    unittest.main()
