import importlib.util
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "heldbudget"
spec = importlib.util.spec_from_file_location("heldbudget_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
sys.modules["heldbudget_run"] = run
spec.loader.exec_module(run)


def _row(st, fn, top="M"):
    e = {c: fn(*(int(b) for b in c)) for c in run.CELLS}
    return dict(set=st, e=e, phi=run.BU.shapley(e), top=top)


class HeldBudget(unittest.TestCase):
    def test_set_summary_floor_and_gap(self):
        t = [_row("OKane2022", lambda m, d, q: 0.10 - 0.04 * m - 0.02 * d) for _ in range(3)]
        s = run.set_summary(t)
        self.assertAlmostEqual(s["gap"], 0.06)
        self.assertAlmostEqual(s["floor_share"], 0.4)
        self.assertAlmostEqual(s["phi"]["M"], 0.04)
        self.assertEqual(s["top"]["M"], 3)
        self.assertEqual(s["neg"]["M"], 0)

    def test_verdicts_both_ways(self):
        good = dict(phi=dict(M=0.03, D=0.02, q=0.001), gap=0.01)
        S = {s: dict(good) for s in run.SETS}
        S["Ai2020"] = dict(phi=dict(M=-0.01, D=-0.02, q=0.0), gap=-0.03)
        S["Chen2020"] = dict(phi=dict(M=0.01, D=0.03, q=0.0), gap=0.04)
        V = run.verdicts(S)
        self.assertEqual([V[h] for h in ("H256", "H257", "H258", "H259")], ["supported"] * 4)
        bad = dict(phi=dict(M=-0.02, D=0.01, q=0.05), gap=0.02)
        S = {s: dict(bad) for s in run.SETS}
        V = run.verdicts(S)
        self.assertEqual(V["H256"], "refuted")
        self.assertEqual(V["H257"], "refuted")
        self.assertEqual(V["H258"], "refuted")
        S["Chen2020"] = dict(phi=dict(M=0.03, D=-0.01, q=0.0), gap=0.02)
        self.assertEqual(run.verdicts(S)["H259"], "refuted")

    def test_rows_are_the_fresh_designs_and_efficient(self):
        p = HERE / "rows.json"
        if not p.exists():
            self.skipTest("rows.json not built")
        rs = json.loads(p.read_text())
        old = {(r["cond"], r["j"]) for r in json.loads((HERE.parent / "budget" / "rows.json").read_text())}
        keys = [(r["pool"], r["cond"], r["j"]) for r in rs]
        self.assertEqual(len(keys), len(set(keys)))
        self.assertEqual(len(rs), 64)
        self.assertFalse({(c, j) for _, c, j in keys} & old)
        for r in rs:
            self.assertAlmostEqual(sum(r["phi"].values()), r["e"]["000"] - r["e"]["111"], places=12)
            self.assertAlmostEqual(r["e"]["111"], r["e_PQ"], places=6)

    def test_cell_000_and_100_reproduce_5zy_and_5zz_ns_and_c(self):
        p = HERE / "rows.json"
        if not p.exists():
            self.skipTest("rows.json not built")
        rs = json.loads(p.read_text())
        for pool, d in run.POOLS:
            ref = {(r["cond"], r["j"]): r for r in json.loads((HERE.parent / d / "rows.json").read_text())["rows"]}
            for r in rs:
                if r["pool"] != pool:
                    continue
                q = ref[(r["cond"], r["j"])]
                self.assertAlmostEqual(r["e"]["000"], q["e"]["NS"], places=12)
                self.assertAlmostEqual(r["e"]["100"], q["e"]["C"], places=12)


if __name__ == "__main__":
    unittest.main()
