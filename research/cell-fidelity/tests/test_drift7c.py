import importlib.util
import json
import math
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "drift7c"
spec = importlib.util.spec_from_file_location("drift7c_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
sys.modules["drift7c_run"] = run
spec.loader.exec_module(run)


class Drift7c(unittest.TestCase):
    def test_ranks_average_ties(self):
        self.assertEqual(run.ranks([3.0, 1.0, 3.0, 2.0]), [3.5, 1.0, 3.5, 2.0])

    def test_spearman_monotone_and_reversed(self):
        x = [1.0, 2.0, 3.0, 4.0, 5.0]
        self.assertAlmostEqual(run.spearman(x, [v ** 3 for v in x]), 1.0)
        self.assertAlmostEqual(run.spearman(x, [-math.exp(v) for v in x]), -1.0)

    def test_perm_p_small_for_perfect_and_large_for_noise(self):
        x = list(range(20))
        self.assertLess(run.perm_p(x, [2 * v for v in x], n=2000), 0.002)
        y = [5, 1, 9, 3, 7, 0, 8, 2, 6, 4, 15, 11, 19, 13, 17, 10, 18, 12, 16, 14][::-1]
        self.assertGreater(run.perm_p(list(range(20)), [(v * 7) % 20 for v in range(20)], n=2000), 0.05)
        self.assertTrue(0 < run.perm_p(x, y, n=500) <= 1)

    def test_holm(self):
        self.assertEqual(run.holm([0.01, 0.04, 0.03]), [0.03, 0.06, 0.06])

    def test_m_is_one_on_a_line_and_recovers_a_drift(self):
        R = [2.0 + 0.5 * n for n in range(2, 100)]
        self.assertAlmostEqual(run.m_of(R), 1.0)
        a, s = run.line10(R)
        self.assertAlmostEqual(run.r_at(a, s, 1.0), R[-1])
        R2 = [2.0 + 0.5 * n for n in range(2, 11)] + [2.0 + 5.0 + 0.6 * (n - 10) for n in range(11, 100)]
        self.assertAlmostEqual(run.m_of(R2), 1.2)
        a, s = run.line10(R2)
        self.assertAlmostEqual(run.r_at(a, s, run.m_of(R2)), R2[-1])

    def test_o3_zero_for_linear_loss(self):
        lost = [0.001 * (n + 1) for n in range(12)]
        self.assertAlmostEqual(run.o3(lost), 0.0)

    def test_loo_fit_picks_the_informative_observable(self):
        obs = [dict(O1=float(i), O2=float((i * 7) % 11), O3=0.0) for i in range(11)]
        ms = [1.0 + 0.01 * i for i in range(11)]
        best, mhat = run.loo_fit(ms, obs, 5)
        self.assertEqual(best, "O1")
        self.assertAlmostEqual(mhat, 1.05)

    def test_committed_rows_consistent(self):
        p = HERE / "rows.json"
        if not p.exists():
            self.skipTest("rows.json not generated")
        rs = json.loads(p.read_text())
        self.assertEqual(len(rs), 104)
        lf = {(r["cond"], r["j"], r["pool"]): r for r in json.loads((HERE.parent / "lawfloor" / "rows.json").read_text())}
        for r in rs:
            for cell in ("000", "111"):
                c = r["cells"][cell]
                self.assertAlmostEqual(c["eL"], lf[(r["cond"], r["j"], r["pool"])]["cells"][cell]["eL"]["10"], places=12)
                self.assertLess(c["e_m"], 0.02)          # the design's own m nearly reproduces cycle 99


if __name__ == "__main__":
    unittest.main()
