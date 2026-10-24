import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import qualnegint as qi  # noqa: E402


class IntervalTests(unittest.TestCase):
    def test_wald_collapses_on_a_constant_sample(self):
        lo, hi, _ = qi.wald([(0.7, 0, 5), (0.3, 20, 30)])
        self.assertAlmostEqual(hi - lo, 2 * qi.Z95 * (0.3 ** 2 * (20 / 30) * (10 / 30) / 30) ** 0.5)  # no negative-stratum width

    def test_others_keep_width_on_a_constant_sample(self):
        s = [(0.7, 0, 5), (0.3, 20, 30)]
        for f in (qi.plus_two, qi.wilson):
            lo, hi, _ = f(s)
            self.assertGreater(hi - lo, qi.wald(s)[1] - qi.wald(s)[0])
        lo, hi, _ = qi.jeffreys(s, random.Random(1))
        self.assertGreater(hi - lo, qi.wald(s)[1] - qi.wald(s)[0])

    def test_wilson_matches_single_stratum_formula(self):
        # one stratum, x=3, n=10: Wilson 95% interval is (0.1078, 0.6032) (Brown, Cai, DasGupta 2001 style value)
        lo, hi, _ = qi.wilson([(1.0, 3, 10)])
        self.assertAlmostEqual(lo, 0.1078, places=3)
        self.assertAlmostEqual(hi, 0.6032, places=3)

    def test_jeffreys_single_stratum_close_to_wilson(self):
        lo, hi, _ = qi.jeffreys([(1.0, 3, 10)], random.Random(2), draws=20000)
        self.assertAlmostEqual(lo, 0.0927, delta=0.005)  # exact Beta(3.5, 7.5) 2.5% quantile, scipy.stats.beta.ppf
        self.assertAlmostEqual(hi, 0.6058, delta=0.005)  # and 97.5% quantile


if __name__ == "__main__":
    unittest.main()
