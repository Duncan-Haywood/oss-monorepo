import importlib.util
import json
import math
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "oracle"
spec = importlib.util.spec_from_file_location("oracle_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
sys.modules["oracle_run"] = run
spec.loader.exec_module(run)


class Oracle(unittest.TestCase):
    def test_oracle_du_interpolates_and_extends(self):
        du = run.oracle_du([1.0, 2.0, 3.0, 4.0], [0.0, 1.0, 2.0, 3.0], tail=2)
        self.assertEqual(du(0.5), 0.0)
        self.assertAlmostEqual(du(2.5), 1.5)
        self.assertAlmostEqual(du(6.0), 5.0)

    def test_slope(self):
        self.assertAlmostEqual(run.slope([0, 1, 2], [1, 3, 5]), 2.0)

    def test_curvature_zero_for_a_straight_law(self):
        # du = 0 and qr = 1 give R = L; with L linear in n, R is linear in n and c = 0
        ls = [i / 10 for i in range(201)]
        t = (ls, [0.0] * len(ls), [1.0] * len(ls))
        lost = [0.1 * n for n in range(1, 101)]
        self.assertAlmostEqual(run.curvature(t, lost), 0.0, places=9)

    def test_curvature_positive_for_accelerating_rate(self):
        ls = [i / 10 for i in range(201)]
        t = (ls, [0.0] * len(ls), [1.0] * len(ls))
        lost = [0.001 * n * n for n in range(1, 101)]
        self.assertGreater(run.curvature(t, lost), 1.0)

    def test_col_share(self):
        self.assertAlmostEqual(run.col_share([1.0, 3.0], ncol=1), 0.25)
        self.assertIsNone(run.col_share([1.0, -3.0], ncol=1))

    def test_spearman(self):
        self.assertAlmostEqual(run.spearman([1, 2, 3], [3, 2, 1]), -1.0)
        self.assertAlmostEqual(run.spearman([1, 2, 3, 4], [1, 3, 2, 4]), 0.8)

    def test_verdicts(self):
        S = {s: dict(eO=0.01, eA=0.05, eN=0.04, absc=0.05) for s in ("Ai2020", "Chen2020", "OKane2022", "NCA_Kim2011")}
        V = run.verdicts(S, [0.9, 0.8, 0.7])
        self.assertEqual([V[h] for h in ("H209", "H210", "H211")], ["supported"] * 3)
        S = {s: dict(eO=0.1, eA=0.05, eN=0.04, absc=0.5) for s in S}
        V = run.verdicts(S, [0.1, 0.2, 0.9])
        self.assertEqual([V[h] for h in ("H209", "H210", "H211")], ["refuted"] * 3)

    def test_committed_a_and_n_match_5zn(self):
        # the oracle rows recompute 5zn's A and N forecasts on the same designs
        a = {(r["cond"], r["j"]): r for r in json.loads((HERE / "rows.json").read_text())}
        b = json.loads((HERE.parent / "plateau" / "rows.json").read_text())
        self.assertEqual(len(a), len(b))
        for r in b:
            o = a[(r["cond"], r["j"])]
            for q in ("eA", "eN", "eW"):
                self.assertTrue(math.isclose(o[q], r[q], rel_tol=1e-9, abs_tol=1e-12), q)


if __name__ == "__main__":
    unittest.main()
