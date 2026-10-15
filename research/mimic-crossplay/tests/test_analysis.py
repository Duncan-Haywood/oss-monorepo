import os, sys, unittest
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import analysis  # noqa: E402


class NashTests(unittest.TestCase):
    def test_matching_pennies(self):
        # detector wins (1) when it matches, loses (0) otherwise: value 0.5, both mix evenly
        A = [[1, 0], [0, 1]]
        x, w, v = analysis.solve_zero_sum(A)
        self.assertAlmostEqual(v, 0.5, places=6)
        np.testing.assert_allclose(x, [0.5, 0.5], atol=1e-6)
        np.testing.assert_allclose(w, [0.5, 0.5], atol=1e-6)

    def test_dominated_rows_and_columns_get_no_weight(self):
        # row 1 is worse for the imitator than row 0 everywhere; column 1 is worse for the detector
        A = [[0.2, 0.1], [0.9, 0.8]]
        x, w, v = analysis.solve_zero_sum(A)
        self.assertAlmostEqual(v, 0.2, places=6)
        np.testing.assert_allclose(x, [1, 0], atol=1e-6)
        np.testing.assert_allclose(w, [1, 0], atol=1e-6)

    def test_exploitability_zero_at_equilibrium(self):
        A = np.array([[0.7, 0.2, 0.5], [0.3, 0.6, 0.4], [0.9, 0.9, 0.55]])
        x, w, v = analysis.solve_zero_sum(A)
        e = analysis.exploitability(A, x, w)
        self.assertLess(abs(e["imitator_gain"]), 1e-6)
        self.assertLess(abs(e["detector_gain"]), 1e-6)
        self.assertAlmostEqual(x @ A @ w, v, places=6)

    def test_pure_values_bracket_the_mixed_value(self):
        A = np.array([[1, 0], [0, 1]], float)
        p = analysis.pure_value(A)
        self.assertLessEqual(p["detector_maxmin"], 0.5)
        self.assertGreaterEqual(p["imitator_minmax"], 0.5)

    def test_negative_payoffs_ok(self):
        x, w, v = analysis.solve_zero_sum([[-1, 1], [1, -1]])
        self.assertAlmostEqual(v, 0.0, places=6)


class ReversalTests(unittest.TestCase):
    def test_rock_paper_scissors_like_reversal(self):
        # imitator 2 beats detector 2 more than imitator 1 did, but loses to detector 1 where imitator 1 won
        A = [[0.1, 0.8],
             [0.8, 0.1]]
        found, total = analysis.reversals(A, eps=0.1)
        self.assertEqual(total, 1)
        self.assertEqual(found, [(0, 1, 0, 1)])

    def test_monotone_progress_has_none(self):
        A = [[0.9, 0.9], [0.5, 0.5], [0.1, 0.1]]
        self.assertEqual(analysis.reversals(A, eps=0.05)[0], [])

    def test_noise_margin_suppresses_small_flips(self):
        A = [[0.50, 0.52], [0.52, 0.50]]
        self.assertEqual(analysis.reversals(A, eps=0.1)[0], [])
        self.assertEqual(len(analysis.reversals(A, eps=0.0)[0]), 1)


class ResponseTests(unittest.TestCase):
    def test_best_responses(self):
        A = [[0.1, 0.9], [0.8, 0.2]]
        r = analysis.best_responses(A)
        self.assertEqual(r["det_best_vs_imit"], [1, 0])
        self.assertEqual(r["imit_best_vs_det"], [0, 1])


if __name__ == "__main__":
    unittest.main()
