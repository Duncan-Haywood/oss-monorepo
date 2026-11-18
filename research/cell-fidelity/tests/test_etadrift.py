import importlib.util
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "etadrift"
spec = importlib.util.spec_from_file_location("etadrift_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
sys.modules["etadrift_run"] = run
spec.loader.exec_module(run)


class EtaDrift(unittest.TestCase):
    def test_eta_tied_recovers_a_proportional_drift(self):
        eS = lambda l: 0.4 - 0.1 * l
        xs = [0.1 * i for i in range(1, 10)]
        k, D = run.eta_tied(eS, 0.1, xs, [0.03 * (eS(0.1) - eS(x)) for x in xs])
        self.assertAlmostEqual(k, 0.03)
        self.assertEqual(D(0.05), 0.0)
        self.assertAlmostEqual(D(2.1), 0.03 * 0.2)

    def test_eta_tied_levels_with_a_levelling_eta(self):
        eS = run.SA.clamp_sat(0.1, 0.05, 1.0, 0.0, 1.0)
        k, D = run.eta_tied(eS, 0.0, [0.1 * i for i in range(10)], [0.01 * i for i in range(10)])
        self.assertAlmostEqual(D(50.0), D(100.0), places=12)

    def test_verdict_thresholds(self):
        good = dict(derrS=1.0, derrL=2.0, e_FS=0.03, e_NS=0.05, e_ND=0.02)
        S = {s: dict(good) for s in run.SETS}
        V = run.verdicts(S, 26, 40)
        self.assertEqual([V[h] for h in ("H228", "H229", "H230", "H231")], ["supported"] * 4)
        bad = dict(derrS=3.0, derrL=2.0, e_FS=0.06, e_NS=0.05, e_ND=0.06)
        V = run.verdicts({s: dict(bad) for s in run.SETS}, 20, 40)
        self.assertEqual([V[h] for h in ("H228", "H229", "H230", "H231")], ["refuted"] * 4)

    def test_rows_reproduce_5zs_and_5zq(self):
        p = HERE / "rows.json"
        if not p.exists():
            self.skipTest("rows.json not built")
        a = {(r["cond"], r["j"]): r for r in json.loads(p.read_text())}
        s = {(r["cond"], r["j"]): r for r in json.loads((HERE.parent / "saturate" / "rows.json").read_text())}
        q = {(r["cond"], r["j"]): r for r in json.loads((HERE.parent / "drift" / "rows.json").read_text())}
        self.assertEqual(set(a), set(s))
        for k in a:
            for v in ("A", "N", "NS"):
                self.assertEqual(a[k][f"e_{v}"], s[k][f"e_{v}"])
            self.assertAlmostEqual(a[k]["DL99"], q[k]["D10_99"], places=9)
            self.assertAlmostEqual(a[k]["D99"], q[k]["D99"], places=9)


if __name__ == "__main__":
    unittest.main()
