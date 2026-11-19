import importlib.util
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "lawfloor"
spec = importlib.util.spec_from_file_location("lawfloor_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
sys.modules["lawfloor_run"] = run
spec.loader.exec_module(run)


class LawFloor(unittest.TestCase):
    def test_gamma_recovers_a_quadratic(self):
        ns = list(range(2, 100))
        ys = [3.0 + 0.5 * n + 0.002 * n * n for n in ns]
        self.assertAlmostEqual(run.gamma_fit(ns, ys), 0.004, places=9)

    def test_curved_r_exact_on_its_own_form(self):
        g = 0.004
        ns = list(range(2, 11))
        ys = [1.0 + 2.0 * (n + g * n * n) for n in ns]
        self.assertAlmostEqual(run.curved_r(ns, ys, g, 99), 1.0 + 2.0 * (99 + g * 99 * 99), places=8)
        line = run.curved_r(ns, ys, 0.0, 99)            # a line under-reads a convex curve
        self.assertLess(line, run.curved_r(ns, ys, g, 99))

    def test_loo_median_leaves_one_out(self):
        self.assertEqual(run.loo_median([1.0, 2.0, 10.0], 2), 1.5)
        self.assertEqual(run.loo_median([1.0, 2.0, 10.0], 0), 6.0)

    def test_err_of_inverts_the_table(self):
        ls = [0.0, 1.0, 2.0]
        rs = [0.0, 10.0, 20.0]
        self.assertAlmostEqual(run.err_of((ls, rs), 15.0, 1.5), 0.0)
        self.assertGreater(run.err_of((ls, rs), 30.0, 1.5), 0.0)    # beyond the table: extended, not infinite

    def test_verdicts_both_ways(self):
        def S(e111, e000, k50):
            return {s: dict(e={"111": dict(e111), "000": dict(e000)}, eL={"111": {"10": e111["L"], "50": k50}})
                    for s in run.SETS}
        V = run.verdicts(S(dict(L=0.03, Q=0.05, T=0.01, O=0.005), dict(L=0.05, T=0.04), 0.01))
        self.assertEqual([V[h] for h in ("H260", "H261", "H262", "H263", "H264")], ["supported"] * 5)
        V = run.verdicts(S(dict(L=0.03, Q=0.02, T=0.04, O=0.005), dict(L=0.05, T=0.06), 0.03))
        self.assertEqual([V[h] for h in ("H260", "H261", "H262", "H263", "H264")], ["refuted"] * 5)

    def test_rows_reproduce_7a_at_ten_cycles(self):
        p = HERE / "rows.json"
        if not p.exists():
            self.skipTest("rows not built")
        exp = HERE.parent
        old = {(r["cond"], r["j"]): r for f in ("budget", "heldbudget")
               for r in json.loads((exp / f / "rows.json").read_text())}
        rows = json.loads(p.read_text())
        self.assertEqual(len(rows), 104)
        for r in rows:
            for c in ("000", "111"):
                self.assertAlmostEqual(r["cells"][c]["eL"]["10"], old[(r["cond"], r["j"])]["e"][c], places=10)


if __name__ == "__main__":
    unittest.main()
