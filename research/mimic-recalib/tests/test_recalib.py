import os, sys, unittest
import numpy as np

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import recalib  # noqa: E402


class T(unittest.TestCase):
    def test_plain_threshold(self):
        self.assertAlmostEqual(recalib.plain_threshold(np.arange(101.0)), 95.0)

    def test_conformal_picks_order_statistic(self):
        self.assertEqual(recalib.conformal_threshold(np.arange(1.0, 20.0)), 19.0)  # k=19: rank ceil(20*.95)=19

    def test_conformal_infinite_when_k_too_small(self):
        self.assertEqual(recalib.conformal_threshold(np.arange(10.0)), float("inf"))

    def test_conformal_fpr_not_above_target_on_exchangeable_scores(self):
        rng = np.random.default_rng(1)
        sh, sm = rng.normal(0, 1, 3000), rng.normal(2, 1, 100)
        r = recalib.simulate(sh, sm, ks=[40], reps=300)[40]
        self.assertLess(r["conformal"]["fpr_mean"], 0.058)
        self.assertGreater(r["conformal"]["fpr_mean"], 0.035)

    def test_larger_k_narrows_spread(self):
        rng = np.random.default_rng(2)
        r = recalib.simulate(rng.normal(0, 1, 3000), rng.normal(2, 1, 50), ks=[10, 160], reps=300)
        w = lambda k: r[k]["plain"]["fpr_p90"] - r[k]["plain"]["fpr_p10"]
        self.assertGreater(w(10), w(160))


if __name__ == "__main__":
    unittest.main()
