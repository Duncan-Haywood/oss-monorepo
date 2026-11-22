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


class CorrectedTable(unittest.TestCase):
    """Table 3: rebuilt from gate7x's and gate7y's fold rows, it must reproduce what 7w to 7y logged."""

    @classmethod
    def setUpClass(cls):
        cls.C = t.corrected()
        cls.F = t.corrected_folds()

    def test_every_rule_covers_the_same_folds(self):
        for c, _ in t.CONDS:
            keys = {(f["set"], f["pool"]) for f in self.F[c]["theta"]}
            self.assertEqual(len(keys), 20 if c == "four" else 10)
            for r, _ in t.CRULES:
                self.assertEqual({(f["set"], f["pool"]) for f in self.F[c][r]}, keys, (c, r))
                self.assertEqual(len(self.F[c][r]), len(keys), (c, r))

    def test_totals_match_logged(self):
        T = self.C["total"]
        want = {("four", "theta"): (19, 43.5), ("four", "thetaC"): (16, None), ("four", "thetaH"): (17, 46.75),
                ("four", "thetaN"): (17, 45.375), ("four", "thetaD"): (17, 46.75), ("four", "oracle"): (19, 43.5),
                ("f30", "thetaN"): (10, 10.0), ("f30", "oracle"): (10, 10.0), ("f10", "oracle"): (7, 32.1)}
        for (c, r), (m, cyc) in want.items():
            self.assertEqual(T[c][r]["met"], m, (c, r))
            if cyc is not None:
                self.assertAlmostEqual(T[c][r]["cycles"], cyc, places=1, msg=(c, r))

    def test_six_set_pairs_match_stored_summaries(self):
        # same folds, same bootstrap (B = 20000, seed 7101) as sets7p's set_boot, so the stored values recur exactly
        y, x = t.load("gate7y")["six"]["pair"], t.load("gate7x")["six"]["pair"]
        for rule, ref in (("thetaD", y["thetaD-theta"]), ("thetaP", y["thetaP-theta"]),
                          ("thetaN", x["thetaN-theta"]), ("thetaH", x["thetaH-theta"])):
            q = self.C["pair_six"][rule]
            self.assertAlmostEqual(q["mean"], ref["mean"], places=9, msg=rule)
            self.assertAlmostEqual(q["boot"][0], ref["boot"][0], places=9, msg=rule)
            self.assertAlmostEqual(q["boot"][1], ref["boot"][1], places=9, msg=rule)
            self.assertEqual((q["cheaper"], q["dearer"]), (ref["cheaper"], ref["dearer"]), rule)
            self.assertAlmostEqual(q["sign_p"], ref["sign_p"], places=12, msg=rule)

    def test_committed_pair_matches_7w(self):
        ref = t.load("rule7w")["pair"]["thetaC-theta"]
        q = self.C["pair_four"]["thetaC"]
        self.assertAlmostEqual(q["mean"], ref["mean"], places=9)
        self.assertEqual((q["cheaper"], q["dearer"]), (ref["cheaper"], ref["dearer"]))

    def test_mean_difference_is_difference_of_means(self):
        T = self.C["total"]["six"]
        for r, q in self.C["pair_six"].items():
            self.assertAlmostEqual(q["mean"], T[r]["cycles"] - T["theta"]["cycles"], places=9, msg=r)

    def test_gates_collapse_to_two_decisions(self):
        same = self.C["same"]
        self.assertEqual((same["thetaP=thetaN"]["four"], same["thetaP=thetaN"]["f30"]), (20, 10))
        self.assertEqual((same["thetaD=thetaH"]["four"], same["thetaD=thetaH"]["f30"]), (20, 10))


if __name__ == "__main__":
    unittest.main()
