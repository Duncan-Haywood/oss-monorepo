import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_fresh_years as fy  # noqa: E402
import run_learn_years as ly  # noqa: E402
import run_pair_year_rules as py_  # noqa: E402
import run_single_year_rules as sy  # noqa: E402
import run_subset_years as su  # noqa: E402


class PairYearRulesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fy.prepare()

    def test_ten_pairs_and_rule_names(self):
        self.assertEqual(len(py_.PAIRS), 10)
        self.assertEqual(len(set(py_.PAIRS)), 10)
        self.assertEqual(len(py_.RULES), 1 + 6 * 10)
        self.assertIn("HX_45", py_.RULES)
        self.assertIn("LC_12", py_.RULES)

    def test_pairs_use_two_years_of_the_other_half(self):
        for hn, yrs in fy.HALVES.items():
            for pr in py_.PAIRS:
                learn = su.years_of(hn, pr)
                self.assertEqual(len(learn), 2)
                self.assertFalse(set(learn) & set(yrs))

    def test_lc_matches_subset_milestone(self):
        for key in ((10000.0, "A+60", 2012, 1.0, 0.0, 0), (2500.0, "P-30", 2006) + ly.REAL):
            _, out = py_.score(key)
            _, sub = su.score(key)
            _, one = sy.score(key)
            for pr in py_.PAIRS:
                self.assertAlmostEqual(out[py_.rname("LC", pr)][0], sub[su.name(pr)][0], places=9)
                self.assertAlmostEqual(out[py_.rname("LC", pr)][1], sub[su.name(pr)][1], places=9)
            self.assertAlmostEqual(out["AT_90"][0], one["AT_90"][0], places=9)

    def test_summary_and_lag3_split(self):
        vals = dict(zip(py_.PAIRS, (5, 9, 1, 8, 7, 3, 6, 2, 4, 10)))
        t = {py_.rname("X", pr): v for pr, v in vals.items()}
        m, lo, hi, rk = py_.summary(t, "X")
        self.assertEqual((lo, hi, rk), (1, 10, 6))
        self.assertAlmostEqual(m, 5.5)
        w, wo = py_.lag3_split(t, "X")
        with3 = [v for pr, v in vals.items() if 3 in pr]
        self.assertEqual(len(with3), 4)
        self.assertAlmostEqual(w, sum(with3) / 4)
        self.assertAlmostEqual(wo, (55 - sum(with3)) / 6)


if __name__ == "__main__":
    unittest.main()
