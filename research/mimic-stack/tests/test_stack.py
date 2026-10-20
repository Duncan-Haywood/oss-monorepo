import os, random, sys, unittest
import numpy as np

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import stack  # noqa: E402


class StackTests(unittest.TestCase):
    def test_feature_signs_make_machine_higher(self):
        its = [{"zs": {"logppl": 2.0, "xppl": 4.0}}, {"zs": {"logppl": 3.0, "xppl": 3.0}}]
        X = stack.feats(its, [0.0, 1.0])
        self.assertLess(X[1, 1], X[0, 1])          # higher perplexity -> lower score
        self.assertAlmostEqual(X[0, 2], -0.5)

    def test_zscore(self):
        X = np.array([[1.0, 2.0], [3.0, 6.0]])
        Z = stack.zscore_fit(X)(X)
        self.assertTrue(np.allclose(Z.mean(0), 0, atol=1e-6))

    def test_auc_ci_perfect_and_paired_zero(self):
        y = [0, 0, 1, 1] * 10
        s = [0.1, 0.2, 0.8, 0.9] * 10
        a, ci = stack.auc_ci(y, s, random.Random(0), B=50)
        self.assertEqual(a, 1.0)
        d, ci = stack.paired_diff_ci(y, s, s, random.Random(0), B=50)
        self.assertEqual((d, ci), (0.0, [0.0, 0.0]))

    def test_committed_results_consistent(self):
        import json
        r = json.load(open(os.path.join(HERE, "results.json")))
        self.assertEqual(r["n_held"], 720)
        for d in r["detectors"].values():
            self.assertLessEqual(d["ci95"][0], d["auroc"] + 1e-9)
            self.assertGreaterEqual(d["ci95"][1], d["auroc"] - 1e-9)


if __name__ == "__main__":
    unittest.main()
