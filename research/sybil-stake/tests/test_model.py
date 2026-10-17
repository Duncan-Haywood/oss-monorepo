import os, sys, unittest, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from sybil_stake import *


class T(unittest.TestCase):
    def test_linear_pool_is_split_invariant(self):
        for k in (1, 2, 7, 50):
            self.assertAlmostEqual(share(k, 3.0, 10, 1.0, 1.0), share(1, 3.0, 10, 1.0, 1.0), places=12)

    def test_per_head_optimum_closed_form(self):
        R, c, n = 100.0, 0.5, 20
        k, _ = best_k(R, c, 1.0, n, 1.0, 0.0)
        self.assertLessEqual(abs(k - k_star_per_head(R, c, n)), 1)

    def test_deterrence_fee_is_sharp(self):
        R, n = 10.0, 9
        f = deterrence_fee(R, n)
        self.assertEqual(best_k(R, 1.02 * f, 1.0, n, 1.0, 0.0, 200)[0], 1)
        self.assertGreater(best_k(R, 0.98 * f, 1.0, n, 1.0, 0.0, 200)[0], 1)

    def test_concave_weights_reward_splitting_convex_reward_merging(self):
        self.assertGreater(share(9, 1, 5, 1, 0.5), share(1, 1, 5, 1, 0.5))
        self.assertLess(share(9, 1, 5, 1, 1.5), share(1, 1, 5, 1, 1.5))
        self.assertGreater(merge_gain(4, 1.0, 20.0, 1.5), 0)
        self.assertLess(merge_gain(4, 1.0, 20.0, 0.5), 0)
        self.assertAlmostEqual(merge_gain(4, 1.0, 20.0, 1.0), 0.0, places=12)

    def test_sybil_share_grows_without_bound_for_alpha_below_one(self):
        self.assertGreater(share(10 ** 10, 1, 100, 1, 0.5), 0.99)

    def test_lottery_matches_share(self):
        self.assertAlmostEqual(lottery_share_mc(5, 2.0, 12, 1.0, 0.7), share(5, 2.0, 12, 1.0, 0.7), delta=0.005)

    def test_wswm_splitting_neutral_and_truthful_best(self):
        p, others = 0.7, dict(others_w=[1.0, 2.0], others_q=[0.4, 0.8], others_p=[0.5, 0.75])
        one = wswm_coalition_net(p, [3.0], [p], **others)
        split = wswm_coalition_net(p, [1.0, 1.0, 1.0], [p, p, p], **others)
        self.assertAlmostEqual(one, split, places=12)
        for q1 in (0.2, 0.5, 0.9):
            for q2 in (0.3, 0.7, 0.95):
                self.assertLessEqual(wswm_coalition_net(p, [1.5, 1.5], [q1, q2], **others), one + 1e-12)


if __name__ == "__main__":
    unittest.main()
