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




class TestDequantised(unittest.TestCase):
    def test_ties_broken_and_qhat_can_narrow(self):
        # 100 same-day permits with a loose interval [0, 10]: plain scores tie at -0... qhat <= 0
        lo, hi, y = [0.0] * 100, [10.0] * 100, [0] * 100
        plain = c.conformal_quantile(c.cqr_scores(lo, hi, y), 0.2)
        dq_scores = c.cqr_scores_dequantised(lo, hi, y, seed=1)
        self.assertEqual(len(set(c.cqr_scores(lo, hi, y))), 1)  # all tied
        self.assertGreater(len(set(dq_scores)), 90)                      # jitter separates them
        self.assertLess(c.conformal_quantile(dq_scores, 0.2), 0)
        self.assertLessEqual(plain, 0)

    def test_deterministic_by_seed(self):
        a = c.cqr_scores_dequantised([0], [5], [3], seed=7)
        b = c.cqr_scores_dequantised([0], [5], [3], seed=7)
        self.assertEqual(a, b)


class TestMondrian(unittest.TestCase):
    def test_bands_hand(self):
        self.assertEqual(c.bands([0.0, 0.2, 0.5, 0.99], [0.3, 0.7]), [0, 0, 1, 2])

    def test_group_qhat_differs_and_fallback(self):
        # group 0: interval [0,10] loose for y=0 rows -> negative qhat; group 1: tight, y far above
        cal = dict(lo=[0.0] * 100 + [0.0] * 100, hi=[10.0] * 100 + [2.0] * 100, y=[0] * 100 + [6] * 100)
        g = [0] * 100 + [1] * 100
        test = dict(lo=[0.0, 0.0, 0.0], hi=[10.0, 2.0, 5.0], y=[0, 6, 1])
        lo, hi, qs, pooled = c.mondrian_cqr(cal, test, g, [0, 1, 9], alpha=0.2)
        self.assertEqual(qs[0], 0.0)         # score = max(0-0, 0-10) = 0 (lower end ties at 0)
        self.assertEqual(qs[1], 4.0)         # 6 - 2
        self.assertEqual(hi[0], 10.0)
        self.assertEqual(hi[1], 6.0)         # widened
        self.assertEqual(hi[2], 5.0 + pooled)  # unseen group falls back to pooled

    def test_small_group_uses_pooled(self):
        cal = dict(lo=[0.0] * 40, hi=[5.0] * 40, y=list(range(40)))
        lo, hi, qs, pooled = c.mondrian_cqr(cal, dict(lo=[0.0], hi=[5.0], y=[1]), [0] * 35 + [1] * 5, [1], min_group=30)
        self.assertNotIn(1, qs)
        self.assertEqual(hi[0], 5.0 + pooled)

    def test_group_coverage_near_nominal_on_zero_inflated_synthetic(self):
        rng = random.Random(3)
        def gen(n):
            rows = []
            for _ in range(n):
                g = rng.random() < 0.5            # group 1: mostly same-day
                y = 0 if (g and rng.random() < 0.9) else int(rng.expovariate(1 / 30))
                rows.append((int(g), y))
            return rows
        def split(rows):
            return [r[0] for r in rows], [r[1] for r in rows]
        gc, yc = split(gen(4000)); gt, yt = split(gen(4000))
        mk = lambda g, y: dict(lo=[0.0] * len(y), hi=[20.0] * len(y), y=[v + rng.random() for v in y])
        lo, hi, qs, _ = c.mondrian_cqr(mk(gc, yc), dict(lo=[0.0] * 4000, hi=[20.0] * 4000, y=yt), gc, gt)
        for grp in (0, 1):
            idx = [i for i in range(4000) if gt[i] == grp]
            # round outward: unrounded negative-qhat intervals miss integer days (LOG.md session 19)
            cov = c.coverage([math.floor(lo[i]) for i in idx], [math.ceil(hi[i]) for i in idx], [yt[i] for i in idx])
            self.assertGreater(cov, 0.77)
            self.assertLess(cov, 0.97)  # outward rounding over-covers; only gross failure is tested
        # the point of grouping: the mostly-same-day group gets a no-wider interval than pooled CQR
        pq = c.conformal_quantile(c.cqr_scores(mk(gc, yc)["lo"], mk(gc, yc)["hi"], mk(gc, yc)["y"]), 0.2)
        g1 = [i for i in range(4000) if gt[i] == 1]
        self.assertLessEqual(sum(hi[i] - lo[i] for i in g1) / len(g1), 20.0 + 2 * max(pq, 0) + 1e-9)


if __name__ == "__main__":
    unittest.main()
