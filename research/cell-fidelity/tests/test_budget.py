import importlib.util
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "budget"
spec = importlib.util.spec_from_file_location("budget_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
sys.modules["budget_run"] = run
spec.loader.exec_module(run)


def _e(fn):
    return {c: fn(*(int(b) for b in c)) for c in run.CELLS}


class Budget(unittest.TestCase):
    def test_shapley_additive_game_returns_each_gain(self):
        e = _e(lambda m, d, q: 0.10 - 0.04 * m - 0.02 * d - 0.01 * q)
        phi = run.shapley(e)
        for g, x in zip(run.FACTORS, (0.04, 0.02, 0.01)):
            self.assertAlmostEqual(phi[g], x)
        self.assertAlmostEqual(run.interaction_md(e), 0.0)

    def test_shapley_is_efficient_and_splits_an_interaction_evenly(self):
        e = _e(lambda m, d, q: 0.10 - 0.06 * m * d)
        phi = run.shapley(e)
        self.assertAlmostEqual(sum(phi.values()), e["000"] - e["111"])
        self.assertAlmostEqual(phi["M"], 0.03)
        self.assertAlmostEqual(phi["D"], 0.03)
        self.assertAlmostEqual(phi["q"], 0.0)
        self.assertAlmostEqual(run.interaction_md(e), -0.06)

    def test_rank_and_verdicts(self):
        good = dict(phi=dict(M=0.03, D=0.02, q=0.001), absI=0.02)
        S = {s: dict(good) for s in run.SETS}
        S["Chen2020"] = dict(phi=dict(M=0.01, D=0.03, q=0.0), absI=0.02)
        V = run.verdicts(S)
        self.assertEqual([V[h] for h in ("H232", "H233", "H234", "H235")], ["supported"] * 4)
        bad = dict(phi=dict(M=0.0, D=-0.01, q=0.05), absI=0.001)
        S = {s: dict(bad) for s in run.SETS}
        S["OKane2022"] = dict(phi=dict(M=-0.02, D=0.01, q=0.05), absI=0.001)
        V = run.verdicts(S)
        self.assertEqual([V[h] for h in ("H232", "H233", "H234", "H235")], ["refuted"] * 4)

    def test_rows_reproduce_5zs_5zt_and_5zp(self):
        p = HERE / "rows.json"
        if not p.exists():
            self.skipTest("rows.json not built")
        a = {(r["cond"], r["j"]): r for r in json.loads(p.read_text())}
        t = {(r["cond"], r["j"]): r for r in json.loads((HERE.parent / "etadrift" / "rows.json").read_text())}
        q = {(r["cond"], r["j"]): r for r in json.loads((HERE.parent / "drift" / "rows.json").read_text())}
        self.assertEqual(set(a), set(t))
        for k in a:
            self.assertAlmostEqual(a[k]["e"]["000"], t[k]["e_NS"], places=12)
            self.assertAlmostEqual(a[k]["e"]["010"], t[k]["e_ND"], places=12)
            self.assertAlmostEqual(a[k]["e_PQ"], q[k]["e_PQ"], places=12)
            self.assertAlmostEqual(a[k]["e"]["111"], a[k]["e_PQ"], places=6)
            self.assertAlmostEqual(sum(a[k]["phi"].values()), a[k]["e"]["000"] - a[k]["e"]["111"], places=12)


if __name__ == "__main__":
    unittest.main()
