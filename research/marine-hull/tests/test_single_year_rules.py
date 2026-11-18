import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_amp_shrink_season as am  # noqa: E402
import run_fresh_years as fy  # noqa: E402
import run_learn_years as ly  # noqa: E402
import run_reml_season as rm  # noqa: E402
import run_single_year_rules as sy  # noqa: E402
import run_subset_years as su  # noqa: E402


class SingleYearRulesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fy.prepare()

    def test_rule_names(self):
        self.assertEqual(len(sy.RULES), 1 + 6 * 5)
        self.assertIn("HX_5", sy.RULES)

    def test_lag_one_reproduces_earlier_milestones(self):
        for key in ((10000.0, "A+60", 2012, 1.0, 0.0, 0), (2500.0, "P-30", 2006) + ly.REAL):
            _, out = sy.score(key)
            _, ref = rm.score(key)
            _, sub = su.score(key)
            for tag in ("HR", "HX"):
                self.assertAlmostEqual(out[f"{tag}_1"][0], ref[f"{tag}_1"][0], places=9)
                self.assertAlmostEqual(out[f"{tag}_1"][1], ref[f"{tag}_1"][1], places=9)
            for g in sy.LAGS:
                self.assertAlmostEqual(out[f"LC_{g}"][0], sub[su.name((g,))][0], places=9)
            self.assertAlmostEqual(out["AT_90"][0], ref["AT_90"][0], places=9)

    def test_factors_use_one_year(self):
        p, shape = "A+60", ly.REAL
        for hn in fy.HALVES:
            for g in sy.LAGS:
                yrs = su.years_of(hn, (g,))
                self.assertEqual(len(yrs), 1)
                fac = sy.factors(p, yrs, shape)
                self.assertEqual(fac["LHF"], am.corrections(p, yrs, shape)["LHF"][0])
                for t in sy.TAGS:
                    self.assertEqual(len(fac[t]), 12)

    def test_summary_rank(self):
        t = {f"X_{g}": v for g, v in zip(sy.LAGS, (10, 30, 20, 10, 5))}
        m, lo, hi, rk = sy.summary(t, "X")
        self.assertEqual((lo, hi, rk), (5, 30, 3))
        self.assertAlmostEqual(m, 15.0)


if __name__ == "__main__":
    unittest.main()
