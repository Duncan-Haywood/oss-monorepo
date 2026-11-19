import importlib.util
import math
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("paper_tables", HERE / "paper" / "tables.py")
t = importlib.util.module_from_spec(spec)
sys.modules["paper_tables"] = t
spec.loader.exec_module(t)


class PaperTables(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.L = t.looks()
        cls.tab = {(r["look"], r["rule"]): r for r in t.summarise(cls.L)}

    def test_wilson_known_value(self):
        lo, hi = t.wilson(9, 12)
        self.assertAlmostEqual(lo, 0.4677, places=3)
        self.assertAlmostEqual(hi, 0.9111, places=3)
        self.assertAlmostEqual(t.wilson(4, 4)[1], 1.0, places=12)

    def test_sign_test_exact(self):
        self.assertEqual(t.sign_test([1, -1, 0]), (1, 1, 1.0))
        pos, neg, p = t.sign_test([-1] * 14 + [1] * 4 + [0, 0])
        self.assertEqual((pos, neg), (4, 14))
        self.assertAlmostEqual(p, 2 * sum(math.comb(18, i) for i in range(5)) / 2 ** 18)

    def test_reproduces_logged_counts(self):
        # the numbers 7f, 7g and 7h reported in LOG.md and their results.txt
        want = {("7f nested (pools reused)", "theta"): (9, 12, 40.0),
                ("7f nested (pools reused)", "F"): (10, 12, 40.0),
                ("7g frozen 7f policies", "theta"): (9, 12, 41.7),
                ("7g frozen 7f policies", "F"): (9, 12, 40.5),
                ("7h frozen 7f policies", "theta"): (9, 12, 39.3),
                ("7h frozen 7g refits", "theta"): (4, 4, 37.8),
                ("7h lopo5 (5 pools)", "theta"): (19, 20, 43.5),
                ("7h lopo5 (5 pools)", "U"): (19, 20, 48.0),
                ("7h lopo5 (5 pools)", "R50"): (18, 20, 42.1),
                ("7h lopo5 (5 pools)", "F"): (16, 20, 43.2)}
        for k, (m, n, c) in want.items():
            r = self.tab[k]
            self.assertEqual((r["met"], r["n"]), (m, n), k)
            self.assertAlmostEqual(r["cycles"], c, places=1, msg=k)

    def test_worst_misses_match_log(self):
        self.assertAlmostEqual(self.tab[("7g frozen 7f policies", "theta")]["worst_miss"], 1.15, places=2)
        self.assertAlmostEqual(self.tab[("7f nested (pools reused)", "theta")]["worst_miss"], 1.16, places=2)

    def test_pooled_fresh_is_two_looks_of_twelve(self):
        p = t.pooled_fresh(self.L)
        self.assertEqual((p["met"], p["n"], p["clusters"]), (18, 24, 8))
        self.assertLessEqual(p["boot_rate"][0], p["rate"])
        self.assertGreaterEqual(p["boot_rate"][1], p["rate"])

    def test_paired_lopo5_covers_every_fold_once(self):
        q = t.paired_lopo5(self.L)
        self.assertEqual(q["n"], 20)
        self.assertEqual(q["a_cheaper"] + q["a_dearer"] + q["ties"], 20)
        self.assertEqual(q["both_met"] + q["only_a_met"] + q["only_b_met"] <= 20, True)
        # mean difference equals the difference of the two rules' mean cycles
        d = self.tab[("7h lopo5 (5 pools)", "theta")]["cycles"] - self.tab[("7h lopo5 (5 pools)", "U")]["cycles"]
        self.assertAlmostEqual(q["mean_diff"], d, places=9)

    def test_in_sample_matches_7d_7e(self):
        ins = {r["set"]: r for r in t.in_sample()}
        self.assertAlmostEqual(ins["Chen2020"]["saved7e"]["S_C"], 0.611, places=3)
        self.assertEqual([ins[s]["strict7e"] for s in t.SETS], [14, 18, 21, 21])


if __name__ == "__main__":
    unittest.main()
