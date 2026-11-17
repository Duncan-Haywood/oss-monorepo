import importlib.util
import math
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "wlever"
spec = importlib.util.spec_from_file_location("wlever_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
sys.modules["wlever_run"] = run
spec.loader.exec_module(run)


class WLever(unittest.TestCase):
    def test_q_ch_is_constant_current_ah(self):
        self.assertEqual(run.q_ch(3.6, [1000.0, 3600.0]), [1.0, 3.6])

    def test_weighted_series_fixed_weights(self):
        U = [[0.1, 0.1], [0.1, 0.2], [0.2, 0.2], [0.3, 0.6]]
        self.assertEqual(len(run.weighted_series([0.5, 0.5], U, lo=2, hi=4)), 2)
        a, b = run.weighted_series([0.25, 0.75], U, lo=2, hi=4)
        self.assertAlmostEqual(a, 0.25 * 0.1 + 0.75 * 0.0)
        self.assertAlmostEqual(b, 0.25 * 0.2 + 0.75 * 0.4)

    def test_sep_series_is_last_node(self):
        U = [[0.0, 0.0], [0.1, 0.2], [0.5, 0.7]]
        self.assertAlmostEqual(run.sep_series(U, lo=2, hi=3)[0], 0.5)

    def test_law_series(self):
        self.assertEqual(run.law_series(lambda l: 2 * l, [0.0, 1.0, 2.0, 4.0], lo=2, hi=4), [2.0, 6.0])

    def test_ratio_recovers_a_scaled_lever(self):
        ds = [0.001 * n for n in range(1, 50)]
        self.assertAlmostEqual(run.ratio([1.5 * d for d in ds], ds), 1.5)
        self.assertIsNone(run.ratio([0.0], [0.0]))

    def test_logmiss(self):
        self.assertAlmostEqual(run.logmiss(2.0, 1.0), math.log(2.0))
        self.assertIsNone(run.logmiss(0.0, 1.0))

    def test_sign_p(self):
        self.assertAlmostEqual(run.sign_p(8, 8), 1 / 256)
        self.assertAlmostEqual(run.sign_p(0, 5), 1.0)

    def test_verdicts_thresholds(self):
        base = dict(k_sep=None, k_star=None, k_w=None, miss_w=0.1, miss_sep=0.5, sp_w=0.9, err_w=0.01, err_phys=0.05)
        S = {}
        for st in run.SETS:
            S[st] = dict(base, k_sep=run.K_PATH[st], k_star=run.K_STAR[st], k_w=run.K_STAR[st])
        V = run.verdicts(S)
        for h in ("H195", "H196", "H197", "H198", "H199"):
            self.assertEqual(V[h], "supported")
        S["Ai2020"]["k_w"] = 2 * run.K_STAR["Ai2020"]
        self.assertEqual(run.verdicts(S)["H197"], "inconclusive")
        for st in S:
            S[st]["err_w"] = 1.0
        self.assertEqual(run.verdicts(S)["H199"], "refuted")


if __name__ == "__main__":
    unittest.main()
