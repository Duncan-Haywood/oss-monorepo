import math, os, random, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import conformal as c


class T(unittest.TestCase):
    def test_quantile_hand(self):
        # n=9, alpha=.2: rank ceil(10*.8)=8 -> 8th smallest
        self.assertEqual(c.conformal_quantile([9, 1, 2, 3, 4, 5, 6, 7, 8], .2), 8)
        # n=4: rank ceil(5*.8)=4 -> max; n=3: rank ceil(4*.8)=4 > 3 -> infinite
        self.assertEqual(c.conformal_quantile([1, 2, 3, 4], .2), 4)
        self.assertTrue(math.isinf(c.conformal_quantile([1, 2, 3], .2)))
        self.assertTrue(math.isinf(c.conformal_quantile([], .2)))

    def test_scores_hand(self):
        # inside [2,6] -> max(2-4, 4-6) = -2 ; below: y=0 -> 2 ; above: y=9 -> 3
        self.assertEqual(c.cqr_scores([2, 2, 2], [6, 6, 6], [4, 0, 9]), [-2, 2, 3])

    def test_interval_floor(self):
        lo, hi = c.cqr_interval([1, 5], [3, 8], 2)
        self.assertEqual((lo, hi), ([0, 3], [5, 10]))

    def test_ks_hand(self):
        self.assertEqual(c.ks_statistic([1, 2, 3], [1, 2, 3]), 0)
        self.assertEqual(c.ks_statistic([1, 2], [10, 11]), 1)
        self.assertAlmostEqual(c.ks_statistic([1, 2, 3, 4], [3, 4, 5, 6]), 0.5)

    def test_marginal_coverage_exchangeable(self):
        # iid data, a deliberately too-narrow raw interval: conformal coverage is >= 1-alpha on average
        rng = random.Random(0)
        covs = []
        for _ in range(200):
            y = [abs(rng.gauss(0, 1)) for _ in range(120)]  # lags are non-negative (the interval floor is 0)
            cal = dict(lo=[0] * 59, hi=[.3] * 59, y=y[:59])
            te = dict(lo=[0] * 61, hi=[.3] * 61, y=y[59:])
            covs.append(c.evaluate(cal, te)["coverage_conformal"])
        self.assertGreaterEqual(sum(covs) / len(covs), 0.8 - 0.01)
        self.assertLess(sum(covs) / len(covs), 0.8 + 0.06)

    def test_drift_breaks_coverage(self):
        rng = random.Random(1)
        cal = dict(lo=[0] * 400, hi=[1] * 400, y=[abs(rng.gauss(0, 1)) for _ in range(400)])
        te = dict(lo=[0] * 400, hi=[1] * 400, y=[abs(rng.gauss(0, 3)) for _ in range(400)])
        r = c.evaluate(cal, te, months=["a"] * 200 + ["b"] * 200)
        self.assertLess(r["coverage_conformal"], 0.7)
        self.assertGreater(r["ks_scores_cal_vs_test"], 0.2)
        self.assertEqual(set(r["coverage_by_month"]), {"a", "b"})


if __name__ == "__main__":
    unittest.main()
