import importlib.util
import json
import math
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "horizon10"
spec = importlib.util.spec_from_file_location("horizon10_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
sys.modules["horizon10_run"] = run
spec.loader.exec_module(run)


class Horizon(unittest.TestCase):
    def test_cut_keeps_cycles_3_to_k(self):
        s = list(range(3, 100))          # value = cycle number
        self.assertEqual(run.cut(s, 10), list(range(3, 11)))
        self.assertEqual(run.cut(s, 99), s)

    def test_kappa_at_constant_ratio(self):
        d = [0.001 * n for n in range(1, 98)]
        mw = [2.0 * x for x in d]
        k, fb = run.kappa_at(mw, d, 30)
        self.assertFalse(fb)
        self.assertAlmostEqual(k, 2.0 * run.KAPPA)

    def test_kappa_at_falls_back_and_clamps(self):
        self.assertEqual(run.kappa_at([1.0] * 97, [0.0] * 97, 10), (run.KAPPA, True))
        self.assertEqual(run.kappa_at([1.0] * 97, [1e-3] * 97, 10)[0], 100.0)
        self.assertEqual(run.kappa_at([-1.0] * 97, [1e-3] * 97, 10)[0], 0.0)

    def test_lmiss(self):
        self.assertAlmostEqual(run.lmiss(2.0, 1.0), math.log(2.0))
        self.assertIsNone(run.lmiss(0.0, 1.0))

    def test_verdict_thresholds(self):
        def S(eA, eB, settle, sp):
            return {k: dict(eA=eA, eB=eB, settle=settle, sp=sp) for k in run.BUDGETS}
        good = {s: S(0.1, 0.05, 0.1, 0.5) for s in "abcd"}
        V = run.verdicts(good)
        self.assertEqual([V[h] for h in ("H200", "H201", "H202", "H203")], ["supported"] * 4)
        bad = {s: S(0.05, 0.1, 0.4, 0.1) for s in "abcd"}
        V = run.verdicts(bad)
        self.assertEqual([V[h] for h in ("H200", "H201", "H202", "H203")], ["refuted"] * 4)

    def test_committed_rows_reproduce_5zl(self):
        """kappa_w at 99 cycles and the 25.3 error with a ten-cycle line equal 5zl's committed values."""
        a = json.loads((HERE / "rows.json").read_text())
        b = {(r["cond"], r["j"]): r for r in json.loads((HERE.parent / "wlever" / "rows.json").read_text())}
        self.assertEqual(len(a), 40)
        for r in a:
            w = b[(r["cond"], r["j"])]
            self.assertAlmostEqual(r["k_w99"], w["k_w"], places=9)
            self.assertAlmostEqual(r["by"]["10"]["eA"], w["err_phys"], places=9)


if __name__ == "__main__":
    unittest.main()
