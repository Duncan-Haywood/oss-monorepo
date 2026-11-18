import importlib.util
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "nodegain"
spec = importlib.util.spec_from_file_location("nodegain_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
sys.modules["nodegain_run"] = run
spec.loader.exec_module(run)


class NodeGain(unittest.TestCase):
    def test_fit_gain_recovers_a_known_gain(self):
        un = lambda x: 0.1 + (0.5 - x) ** 2
        ss = [-0.01 * k for k in range(1, 9)]
        rises = [un(0.6 + 0.7 * s) - un(0.6) for s in ss]
        self.assertAlmostEqual(run.fit_gain(un, 0.6, ss, rises), 0.7)

    def test_flat_ocp_ties_go_to_one(self):
        self.assertEqual(run.fit_gain(lambda x: 0.08, 0.5, [-0.01, -0.02], [0.0, 0.0]), 1.0)

    def test_gain_lever_is_zero_at_zero_and_scales_the_shift(self):
        un = lambda x: -x
        shift = lambda l: 0.1 - l
        du = run.gain_lever(un, [0.3, 0.6], [0.5, 0.5], [1.0, 3.0], shift)
        self.assertAlmostEqual(du(0.0), 0.0)
        self.assertAlmostEqual(du(0.2), 0.5 * 0.2 + 0.5 * 3 * 0.2)

    def test_verdicts(self):
        good = dict(lev=dict(N=2.0, G=1.0), e=dict(NS=0.067, NG=0.04, C=0.035))
        V = run.verdicts({s: good for s in run.SETS}, 30, 40)
        self.assertEqual([V[h] for h in ("H236", "H237", "H238", "H239")], ["supported"] * 4)
        bad = dict(lev=dict(N=1.0, G=2.0), e=dict(NS=0.067, NG=0.08, C=0.035))
        V = run.verdicts({s: bad for s in run.SETS}, 10, 40)
        self.assertEqual([V[h] for h in ("H236", "H237", "H238", "H239")], ["refuted"] * 4)

    def test_rows_reproduce_5zu(self):
        p = HERE / "rows.json"
        if not p.exists():
            self.skipTest("rows.json not built")
        a = {(r["cond"], r["j"]): r for r in json.loads(p.read_text())}
        b = {(r["cond"], r["j"]): r for r in json.loads((HERE.parent / "budget" / "rows.json").read_text())}
        self.assertEqual(set(a), set(b))
        for k in a:
            self.assertAlmostEqual(a[k]["e"]["NS"], b[k]["e"]["000"], places=12)
            self.assertAlmostEqual(a[k]["e"]["C"], b[k]["e"]["100"], places=12)
            self.assertLess(a[k]["n_check"], 1e-12)
            self.assertTrue(all(0.0 <= g <= 3.0 for g in a[k]["gains"]))


if __name__ == "__main__":
    unittest.main()
