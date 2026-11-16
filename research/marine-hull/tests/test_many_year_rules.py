import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_fresh_years as fy  # noqa: E402
import run_learn_years as ly  # noqa: E402
import run_many_year_rules as my  # noqa: E402
import run_subset_years as su  # noqa: E402


class ManyYearRulesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fy.prepare()

    def test_sets_and_rule_names(self):
        self.assertEqual([len(my.SETS[k]) for k in my.KS], [10, 5, 1])
        self.assertEqual(len(set(my.ALL_SETS)), 16)
        self.assertEqual(len(my.RULES), 1 + 6 * 16)
        self.assertIn("HR_345", my.RULES)
        self.assertIn("HX_1234", my.RULES)
        self.assertIn("LC_12345", my.RULES)

    def test_sets_use_k_years_of_the_other_half(self):
        for hn, yrs in fy.HALVES.items():
            for s in my.ALL_SETS:
                learn = su.years_of(hn, s)
                self.assertEqual(len(learn), len(s))
                self.assertFalse(set(learn) & set(yrs))

    def test_lc_matches_subset_milestone(self):
        for key in ((10000.0, "A+60", 2012, 1.0, 0.0, 0), (2500.0, "P-30", 2006) + ly.REAL):
            _, out = my.score(key)
            _, sub = su.score(key)
            for s in my.ALL_SETS:
                self.assertAlmostEqual(out[my.rname("LC", s)][0], sub[su.name(s)][0], places=9)
                self.assertAlmostEqual(out[my.rname("LC", s)][1], sub[su.name(s)][1], places=9)

    def test_summary_crosses_and_lag3_split(self):
        vals = dict(zip(my.SETS[3], (150, 141, 139, 160, 145, 152, 147, 148, 155, 143)))
        t = {my.rname("X", s): v for s, v in vals.items()}
        m, lo, hi = my.summary(t, "X", 3)
        self.assertEqual((lo, hi), (139, 160))
        self.assertAlmostEqual(m, sum(vals.values()) / 10)
        w, wo = my.lag3_split(t, "X")
        with3 = [v for s, v in vals.items() if 3 in s]
        self.assertEqual(len(with3), 6)
        self.assertAlmostEqual(w, sum(with3) / 6)
        hi_ok = {my.rname("X", s): 25 for s in my.SETS[3]}
        hi_bad = dict(hi_ok, **{my.rname("X", my.SETS[3][0]): 24})
        self.assertTrue(my.crosses(t, hi_ok, "X", 3))
        self.assertFalse(my.crosses(t, hi_bad, "X", 3))


if __name__ == "__main__":
    unittest.main()
