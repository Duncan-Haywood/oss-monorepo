import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
import analyse as A  # noqa: E402


class T(unittest.TestCase):
    def test_exposure_counts_trials(self):
        self.assertEqual(A.exposure([0, 3, None], 64), (2, 1 + 4 + 64))

    def test_p_hat_recovers_geometric(self):
        self.assertAlmostEqual(A.p_hat([0] * 20), 1.0)
        self.assertEqual(A.p_hat([None] * 20), 0.0)

    def test_rule_of_three(self):
        self.assertAlmostEqual(A.p_upper(1280), 3 / 1280, delta=1e-4)

    def test_vectors_needed(self):
        self.assertEqual(A.vectors_needed(0.5), 5)
        self.assertEqual(A.vectors_needed(1.0), 1)

    def test_classify(self):
        self.assertEqual(A.classify([0] * 20), "first-vector")
        self.assertEqual(A.classify([54] * 20), "fixed-index")
        self.assertEqual(A.classify([None] * 20), "never")
        self.assertEqual(A.classify([1, 2, None]), "sampled")

    def test_log_totals(self):
        rows = A.load()
        self.assertEqual(len(rows), 91)
        det = [r for r in rows if A.classify(r["random_first"]) != "never"]
        self.assertEqual(len(det), 66)

    def test_model_matches_observed(self):
        rows = [r for r in A.load() if A.classify(r["random_first"]) != "never"]
        obs, pred = A.miss_curve(rows, [1, 8, 64])
        for o, p in zip(obs, pred):
            self.assertLess(abs(o - p), 0.01)


if __name__ == "__main__":
    unittest.main()
