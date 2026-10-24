import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from verified_dse.stats import kendall_tau_b, pick_regret, topk_hit  # noqa: E402


class T(unittest.TestCase):
    def test_tau_perfect_and_reversed(self):
        self.assertEqual(kendall_tau_b([1, 2, 3, 4], [10, 20, 30, 40]), 1.0)
        self.assertEqual(kendall_tau_b([1, 2, 3, 4], [4, 3, 2, 1]), -1.0)

    def test_tau_b_matches_hand_value_with_ties(self):
        # pairs: (1,1)(2,1)(3,2): concordant 2, tied-in-y 1 -> (2-0)/sqrt(2*3)... x has no ties: sqrt((2+0+0)*(2+0+1))
        self.assertAlmostEqual(kendall_tau_b([1, 2, 3], [1, 1, 2]), 2 / 6 ** 0.5)

    def test_constant_is_none(self):
        self.assertIsNone(kendall_tau_b([1, 1, 1], [1, 2, 3]))

    def test_regret_and_topk(self):
        cheap, ref = [3, 1, 2, 1], [5.0, 4.0, 2.0, 6.0]
        self.assertAlmostEqual(pick_regret(cheap, ref), (4.0 + 6.0) / 2 / 2.0 - 1)
        self.assertTrue(topk_hit(cheap, ref, 3))   # optimum (index 2, cheap=2) is 3rd best
        self.assertFalse(topk_hit(cheap, ref, 2))


if __name__ == "__main__":
    unittest.main()
