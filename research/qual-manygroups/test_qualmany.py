import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import qualmany as qm  # noqa: E402


class GroupTests(unittest.TestCase):
    def test_bins_follow_edges(self):
        self.assertEqual(qm.bin_groups([1, 3, 4, 10, 11, 99], [3, 10]), [0, 0, 1, 1, 2, 2])

    def test_bonferroni_is_wider_and_matches_known_value(self):
        self.assertAlmostEqual(qm.z_for(1, "none"), 1.96, places=2)
        self.assertAlmostEqual(qm.z_for(5, "bonferroni"), 2.5758, places=3)  # alpha/10 = 0.005 per tail
        self.assertGreater(qm.z_for(8, "bonferroni"), qm.z_for(8, "none"))

    def test_equal_counts_spend_the_budget_and_cap_small_groups(self):
        self.assertEqual(qm.equal_counts([100, 100, 100], 60), [20, 20, 20])
        c = qm.equal_counts([5, 100, 100], 90)
        self.assertEqual(c[0], 5)
        self.assertEqual(sum(c), 90)
        self.assertEqual(qm.equal_counts([3, 4], 50), [3, 4])

    def test_random_draw_follows_group_sizes_and_has_no_repeats(self):
        members = [list(range(0, 50)), list(range(50, 1000))]
        rng = random.Random(1)
        shares = []
        for _ in range(200):
            d = qm.draw("random", 100, members, rng)
            self.assertEqual(len(set(d[0] + d[1])), 100)
            shares.append(len(d[0]) / 100)
        self.assertAlmostEqual(sum(shares) / len(shares), 50 / 1000, delta=0.015)

    def test_equal_draw_stays_in_group(self):
        members = [list(range(0, 50)), list(range(50, 1000))]
        d = qm.draw("equal", 40, members, random.Random(2))
        self.assertEqual([len(x) for x in d], [20, 20])
        self.assertTrue(set(d[0]) <= set(members[0]) and set(d[1]) <= set(members[1]))

    def test_group_ppi_needs_enough_audited_items_and_is_exact_for_a_perfect_coder(self):
        human = [i % 2 for i in range(40)]
        members = [list(range(0, 20)), list(range(20, 40))]
        self.assertIsNone(qm.group_ppi(human, human, members, [[0, 1], list(range(20, 30))]))
        est = qm.group_ppi(human, human, members, [list(range(0, 10)), list(range(20, 30))])
        self.assertAlmostEqual(est[0][0], 0.5)
        self.assertAlmostEqual(est[1][0], 0.5)


if __name__ == "__main__":
    unittest.main()
