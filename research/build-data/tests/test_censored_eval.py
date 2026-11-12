import datetime, os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
try:
    import numpy as np
    import censored_eval as ce
except ImportError:  # needs numpy/pandas
    ce = None


@unittest.skipIf(ce is None, "needs numpy and pandas")
class IPCW(unittest.TestCase):
    """Session 78: inverse-probability-of-censoring weights for right-truncated i2c test years."""

    def test_windows_count_days_to_the_pull(self):
        w = ce.windows(["2024-01-01", "2024-12-31"], datetime.date(2026, 11, 12))
        self.assertEqual(list(w), [1046.0, 681.0])

    def test_survival_is_share_of_windows_at_least_t(self):
        g = ce.survival([10, 20, 30, 40])
        self.assertEqual(list(g([5, 10, 25, 40, 41])), [1.0, 1.0, 0.5, 0.25, 0.0])

    def test_unseen_rows_get_zero_weight_and_short_rows_weight_one(self):
        y = np.array([1, 5, 15, 25])
        c = np.array([10, 20, 10, 30])
        w = ce.ipcw_weights(y, c)
        self.assertEqual(w[0], 1.0)   # y below every window
        self.assertEqual(w[2], 0.0)   # 15 > 10: not seen
        self.assertEqual(w[1], 1.0)   # G(5) = 1
        # windows of rows with y <= min window 10 are {10, 20}, so G(25) = 0: floored at 0.05
        self.assertAlmostEqual(w[3], 1 / 0.05)

    def test_ipcw_recovers_the_mean_under_independent_truncation(self):
        # Analytic case: y ~ U(0, 100), window ~ U(50, 150) independent; full mean of y is 50,
        # the complete-case mean is biased low, IPCW is unbiased.
        rng = np.random.default_rng(1)
        y, c = rng.uniform(0, 100, 200_000), rng.uniform(50, 150, 200_000)
        w = ce.ipcw_weights(y, c, floor=1e-9)
        seen = y <= c
        self.assertLess(y[seen].mean(), 47)
        self.assertAlmostEqual(ce.wmean(y[seen], w[seen]), 50.0, delta=0.5)
        self.assertAlmostEqual(ce.weighted_quantile(y[seen], w[seen], .9), 90.0, delta=1.0)

    def test_weighted_block_boot_with_unit_weights_matches_plain_mean(self):
        d = np.array([1.0, 2.0, 3.0, 4.0])
        m, lo, hi = ce.wblock_boot(d, np.ones(4), np.array(["a", "a", "b", "b"]), n_boot=200)
        self.assertAlmostEqual(m, 2.5)
        self.assertLessEqual(lo, m)
        self.assertGreaterEqual(hi, m)

    def test_contrasts_name_every_pair(self):
        L = lambda v: {"loss": {m: {t: np.full(2, v + i) for t in ce.TAUS}
                                for i, m in enumerate(("own_baseline", "transfer", "own_boosted"))}}
        d = ce.contrasts({"a": L(0.0), "b": L(10.0)}, ["a", "b"])
        self.assertEqual(float(d["transfer:b-a"][0.9][0]), 10.0)
        self.assertEqual(float(d["a:transfer-own_baseline"][0.5][0]), 1.0)

    def test_out_name_keeps_session_78_names_and_tags_other_class_lists(self):
        pp = datetime.date(2023, 11, 12)
        self.assertEqual(ce.out_name("validate", "seattle", 2021, pp, ["cascade2", "cascade2_nodemo"]),
                         "censored_eval_validate_seattle_i2c_2021_pp2023.json")
        self.assertEqual(ce.out_name("validate", "sf", 2021, pp, ["cascade2", "type", "cascade2_nodemo"]),
                         "censored_eval_validate_sf_i2c_2021_pp2023_cascade2-type-cascade2_nodemo.json")
        self.assertEqual(ce.out_name("rescore", "seattle", 2024, None, ["cascade2", "type"]),
                         "censored_eval_rescore_seattle_i2c_2024_cascade2-type.json")

    def test_bins_compare_seen_share_with_g(self):
        y = np.array([100.0, 700.0, 700.0, 950.0])
        c = np.array([681.0, 1000.0, 690.0, 1000.0])
        b = ce.bins(y, c, y <= c)
        self.assertEqual([x["n"] for x in b], [1, 2, 1])
        self.assertEqual(b[1]["share_seen"], 0.5)


if __name__ == "__main__":
    unittest.main()
