import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "experiments"
spec = importlib.util.spec_from_file_location("margin7f_run", ROOT / "margin7f" / "run.py")
run = importlib.util.module_from_spec(spec)
sys.modules["margin7f_run"] = run
spec.loader.exec_module(run)


def rows(es, scs, pool="p"):
    """Synthetic designs: e at every k = es[i] * (60 - k) / 50, S_C = scs[i]."""
    return [dict(set="s", pool=pool, mC=1 + c, E={k: e * (60 - k) / 50 for k in run.KS}) for e, c in zip(es, scs)]


class Margin7f(unittest.TestCase):
    def test_zero_margin_reproduces_7e_transfer(self):
        rs = run.F7.load()
        d7 = json.loads((ROOT / "frontier7e" / "summary.json").read_text())["folds"]
        for f7 in d7:
            for rule, key in (("U", "uniform"), ("F", "S_C")):
                f = run.fold(rs, f7["set"], f7["pool"], rule, nested=False)
                self.assertEqual(f["met"], f7[key]["met"])
                self.assertAlmostEqual(f["q75"], f7[key]["q75"])

    def test_theta_endpoints(self):
        tr = rows([1, 2, 3, 4], [0.125, 0.25, 0.375, 0.5])
        P = {p[1]: p for p in run.theta_policies(tr)}
        self.assertAlmostEqual(P[("TH", 50, float("inf"))][0], 10)
        self.assertAlmostEqual(P[("TH", 50, 0.125)][0], 50)
        self.assertAlmostEqual(P[("TH", 30, 0.375)][0], 10 + 20 * 0.5)

    def test_apply_theta_is_absolute(self):
        te = rows([1, 1, 1, 1], [0.0, 0.0, 0.5, 0.5])
        q, c = run.apply(te, ("TH", 50, 0.4))
        self.assertAlmostEqual(c, 30)
        q2, c2 = run.apply(te, ("TH", 50, 0.9))
        self.assertAlmostEqual(c2, 10)

    def test_apply_none_is_u50(self):
        te = rows([1, 2, 3], [0, 0, 0])
        self.assertEqual(run.apply(te, None), (run.quant([r["E"][50] for r in te]), 50.0))

    def test_choose_margin_falls_back_to_most_conservative(self):
        A = rows([1, 1, 1, 1], [0, 0, 0, 0], "a")
        B = rows([5, 5, 5, 5], [0, 0, 0, 0], "b")
        # every design in B errs five times A's: picking on A never meets B at U(k < 50), U50 always meets
        m, ok = run.choose_margin(A, B, "U")
        self.assertTrue(ok)
        self.assertIn(m, run.TT)


if __name__ == "__main__":
    unittest.main()
