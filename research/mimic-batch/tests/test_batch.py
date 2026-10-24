import os, sys, unittest
import numpy as np

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import batch  # noqa: E402


class T(unittest.TestCase):
    def test_auroc_perfect_and_chance(self):
        self.assertEqual(batch.auroc(np.array([0.0, 1.0]), np.array([2.0, 3.0])), 1.0)
        self.assertAlmostEqual(batch.auroc(np.array([1.0, 1.0]), np.array([1.0, 1.0])), 0.5)

    def test_batch_mean_shrinks_spread_like_sqrt_k(self):
        rng = np.random.default_rng(0)
        pool = rng.normal(0, 1, 5000)
        s1 = batch.batch_means(pool, 1, 20000, rng).std()
        s16 = batch.batch_means(pool, 16, 20000, rng).std()
        self.assertAlmostEqual(s1 / s16, 4.0, delta=0.3)

    def test_mixed_with_p_zero_is_human_batch(self):
        rng = np.random.default_rng(1)
        m = batch.mixed_means(np.zeros(10), np.full(10, 9.0), 4, 0.1, 10, rng)   # round(0.4) = 0 machine texts
        self.assertTrue(np.all(m == 0.0))

    def test_mixed_mean_counts_machine_share(self):
        rng = np.random.default_rng(1)
        m = batch.mixed_means(np.zeros(10), np.full(10, 8.0), 4, 0.5, 10, rng)
        self.assertTrue(np.allclose(m, 4.0))

    def test_fpr_near_target_and_tpr_grows_with_k(self):
        rng = np.random.default_rng(2)
        r = batch.simulate(rng.normal(0, 1, 4000), rng.normal(0.5, 1, 4000), ks=[1, 16], ps=[1.0], nb=3000)
        for k in (1, 16):
            self.assertAlmostEqual(r[k]["fpr"], 0.05, delta=0.025)
        self.assertGreater(r[16][1.0]["tpr"], r[1][1.0]["tpr"] + 0.3)

    def test_diluted_batch_is_harder(self):
        rng = np.random.default_rng(3)
        r = batch.simulate(rng.normal(0, 1, 4000), rng.normal(1, 1, 4000), ks=[16], ps=[1.0, 0.25], nb=3000)[16]
        self.assertGreater(r[1.0]["tpr"], r[0.25]["tpr"])

    def test_p_too_small_for_k_is_skipped(self):
        rng = np.random.default_rng(4)
        r = batch.simulate(rng.normal(0, 1, 400), rng.normal(1, 1, 400), ks=[2], ps=[1.0, 0.1], nb=200)[2]
        self.assertNotIn(0.1, r)


if __name__ == "__main__":
    unittest.main()
