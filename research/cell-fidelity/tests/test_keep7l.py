"""Tests for experiments/keep7l/run.py (milestone 7l): cost algebra, stage order, saving and verdicts."""
import importlib.util
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("keep7l_run", HERE / "experiments" / "keep7l" / "run.py")
m = importlib.util.module_from_spec(spec)
sys.modules["keep7l_run"] = m
spec.loader.exec_module(m)


def _stage(t, lost, t10=None):
    s = {"seconds": t, "proc_s": t + 2, "lost_mol": [lost] * 50, "cap_Ah": [1.0] * 50}
    if t10 is not None:
        s["t10"] = t10
    return s


class Keep(unittest.TestCase):
    def test_costs_recover_line(self):
        a, b, x = 3.0, 0.5, 0.25
        k = m.costs(a + 50 * b, a + 10 * b, a + 50 * b + x)
        self.assertAlmostEqual(k["b"], b)
        self.assertAlmostEqual(k["a_cyc"], a / b)
        self.assertAlmostEqual(k["x_cyc"], x / b)

    def test_costs_none_on_noise(self):
        self.assertIsNone(m.costs(1.0, 2.0, 1.0))

    def test_order_rotates_and_covers(self):
        seen = {tuple(m.order(i)) for i in range(3)}
        self.assertEqual(len(seen), 3)
        for i in range(6):
            self.assertEqual(sorted(m.order(i)), ["A", "D", "E"])
        self.assertEqual({m.order(i)[0] for i in range(3)}, {"A", "D", "E"})

    def test_own_saving_ceiling(self):
        # zero extension cost: the saving is the cycle saving diluted by the fixed cost c
        a = 11.79
        self.assertAlmostEqual(m.own_saving(0.0, a), 1 - (a + m.R7K.CYCLES_POOLED) / (a + 50))
        self.assertLess(m.own_saving(5.0, a), m.own_saving(0.0, a))

    def test_design_row_and_verdicts(self):
        r = {"cond": "Chen2020@x", "j": 1, "stages": {
            "A": _stage(10.0, 0.05), "D": _stage(10.2, 0.05, t10=4.0), "E": _stage(12.0, 0.0500001, t10=4.1)}}
        row = m.design_row(r)
        self.assertAlmostEqual(row["b"], 6.0 / 40)
        self.assertAlmostEqual(row["a_cyc"], (4.0 - 1.5) / 0.15)
        self.assertAlmostEqual(row["xD_cyc"], 0.2 / 0.15)
        self.assertAlmostEqual(row["xE_cyc"], 2.0 / 0.15)
        V = m.verdicts([row])
        self.assertEqual(V["H293"]["verdict"], "supported")
        self.assertEqual(V["H294"]["verdict"], "supported")
        self.assertEqual(V["H296"]["verdict"], "supported")

    def test_h294_refuted_when_extension_costs_a_restart(self):
        r = {"cond": "Chen2020@x", "j": 1, "stages": {
            "A": _stage(10.0, 0.05), "D": _stage(13.0, 0.05, t10=4.0), "E": _stage(14.0, 0.05, t10=4.0)}}
        V = m.verdicts([m.design_row(r)])
        self.assertEqual(V["H294"]["verdict"], "refuted")
        self.assertEqual(V["H295"]["verdict"], "refuted")
        self.assertEqual(V["H296"]["verdict"], "refuted")

    def test_same_designs_as_7k(self):
        self.assertEqual(len(m.R7K.jobs()), 16)


if __name__ == "__main__":
    unittest.main()
