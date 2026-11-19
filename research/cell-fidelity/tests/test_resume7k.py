"""Tests for experiments/resume7k/run.py (milestone 7k): picks, cost algebra, saving and verdicts."""
import importlib.util
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("resume7k_run", HERE / "experiments" / "resume7k" / "run.py")
m = importlib.util.module_from_spec(spec)
sys.modules["resume7k_run"] = m
spec.loader.exec_module(m)


class Resume(unittest.TestCase):
    def test_picks_fixed(self):
        rows = m._load(HERE / "experiments" / "fresh7h" / "bench.jsonl")
        p = m.picks(rows)
        self.assertEqual(len(p), 16)
        self.assertEqual(len(set(p)), 16)
        self.assertEqual(p, m.picks(rows))
        for s in m.SETS:
            self.assertEqual(sum(c.startswith(s + "@") for c, _ in p), 4)

    def test_costs_recover_line(self):
        a, b, ar = 3.0, 0.5, 1.0
        k = m.costs(a + 50 * b, a + 10 * b, ar + 40 * b)
        self.assertAlmostEqual(k["b"], b)
        self.assertAlmostEqual(k["a_cyc"], a / b)
        self.assertAlmostEqual(k["a_res_cyc"], ar / b)

    def test_costs_none_on_noise(self):
        self.assertIsNone(m.costs(1.0, 2.0, 1.0))

    def test_saving_matches_7j(self):
        cost = json.loads((HERE / "paper" / "cost.json").read_text())
        self.assertAlmostEqual(m.saving(0.0), cost["pooled_fresh"]["time_saved_continue"], places=9)

    def test_breakeven_zero_saving(self):
        self.assertAlmostEqual(m.saving(m.breakeven()), 0.0, places=12)

    def test_full_refixed_cost_loses(self):
        # paying the whole fixed cost again is the restart column's price minus the 10 cycles redone
        self.assertLess(m.saving(m.C_FIXED), m.saving(0.0))

    def test_verdicts(self):
        def row(lb, a, ar):
            return dict(lost_rel_B=lb, b=1.0, a_cyc=a, a_res_cyc=ar)
        V = m.verdicts([row(0.001, 6, 1), row(0.002, 6, 2)])
        self.assertEqual(V["H290"]["verdict"], "supported")
        self.assertEqual(V["H291"]["verdict"], "supported")
        V = m.verdicts([row(0.001, 6, 7), row(0.2, 6, 8)])
        self.assertEqual(V["H290"]["verdict"], "refuted")
        self.assertEqual(V["H291"]["verdict"], "refuted")
        V = m.verdicts([row(0.001, 6, 4), row(0.001, 6, 4)])
        self.assertEqual(V["H291"]["verdict"], "inconclusive")


if __name__ == "__main__":
    unittest.main()
