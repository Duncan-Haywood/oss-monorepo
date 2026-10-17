import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from effort_contracts import *


class T(unittest.TestCase):
    def test_threshold_matches_local_prediction(self):
        for sc in ("brier", "log"):
            self.assertAlmostEqual(shirk_threshold(0.2, sc) / local_threshold(0.2, sc), 1.0, delta=0.01)

    def test_log_threshold_is_half_of_brier(self):
        self.assertAlmostEqual(shirk_threshold(0.1, "log") / shirk_threshold(0.1, "brier"), 0.5, delta=0.01)

    def test_no_effort_below_threshold(self):
        a0 = local_threshold(0.2)
        self.assertEqual(best_effort(0.95 * a0, 0.2)[0], 0.0)
        self.assertGreater(best_effort(1.05 * a0, 0.2)[0], 0.0)

    def test_alpha_equals_value_scale_is_first_best(self):
        for c in (0.05, 0.2):
            self.assertAlmostEqual(best_effort(1.0, c)[0], first_best(c)[0], delta=0.01)

    def test_limited_liability_underprovides_effort(self):
        for c in (0.05, 0.2):
            s, a, e = principal_optimum(c)
            e0, s0 = first_best(c)
            self.assertLess(a, 1.0)
            self.assertLess(e, e0)
            self.assertLess(s, 0.7 * s0)

    def test_induced_effort_is_first_order_optimal(self):
        a, _, _ = induced_payment(0.8, 0.1, "log")
        self.assertAlmostEqual(best_effort(a, 0.1, "log")[0], 0.8, delta=0.01)


if __name__ == "__main__":
    unittest.main()
