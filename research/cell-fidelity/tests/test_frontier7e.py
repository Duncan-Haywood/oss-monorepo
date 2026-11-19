import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "experiments"
spec = importlib.util.spec_from_file_location("frontier7e_run", ROOT / "frontier7e" / "run.py")
run = importlib.util.module_from_spec(spec)
sys.modules["frontier7e_run"] = run
spec.loader.exec_module(run)


class Frontier7e(unittest.TestCase):
    def test_quant_is_7c_rule(self):
        self.assertEqual(run.quant(list(range(24))), 18)

    def test_cost_endpoints(self):
        self.assertEqual(run.cost(50, 0.0), 10)
        self.assertEqual(run.cost(30, 1.0), 30)
        self.assertAlmostEqual(run.cost(30, 0.25), 15)

    def test_cheapest_picks_least_cost_and_reports_unmet(self):
        pols = [(50, ("U", 50), 0.01), (20, ("T", 30, 0.5), 0.02), (10, ("U", 10), 0.05)]
        self.assertEqual(run.cheapest(pols, 0.02), (20, ("T", 30, 0.5)))
        self.assertEqual(run.cheapest(pols, 0.001), (50, None))

    def test_triage_endpoints_are_uniform(self):
        E = {k: [0.1 / k * (i + 1) for i in range(8)] for k in run.KS}
        T = {p[1]: p for p in run.triage_policies(E, lambda K1: list(range(8)))}
        U = {p[1][1]: p for p in run.uniform_policies(E)}
        for K1 in run.K1S:
            self.assertAlmostEqual(T[("T", K1, 1.0)][2], U[K1][2])
            self.assertAlmostEqual(T[("T", K1, 0.0)][2], U[10][2])

    def test_reproduces_7d_at_k50(self):
        """The K1 = 50 slice at t = 1.25 gives 7d's f* for S_C (cost 10 + 40 f*) on every set."""
        rs = run.load()
        d7 = json.loads((ROOT / "triage7d" / "summary.json").read_text())["sets"]
        for st in run.SETS:
            t = [r for r in rs if r["set"] == st]
            E, F = run.families_nr(t)
            c, _ = run.cheapest([p for p in F["S_C"] if p[1][1] == 50], run.T0 * run.quant(E[50]))
            fs = d7[st]["000"]["f_star"]["S_C"]
            self.assertAlmostEqual(c, 10 + 40 * fs if fs is not None else 50)


if __name__ == "__main__":
    unittest.main()
