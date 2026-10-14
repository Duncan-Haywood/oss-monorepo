import math, random, unittest
from verifier_cascades import *


class T(unittest.TestCase):
    def test_wrong_cascade_closed_form(self):
        for a in (0.55, 0.7, 0.9):
            L = sequential_law(a, 300)
            self.assertAlmostEqual(L["p_wrong_cascade"], cascade_wrong_prob(a), 12)
            self.assertAlmostEqual(L["p_right_cascade"] + L["p_wrong_cascade"], 1, 12)

    def test_expected_agents(self):
        a = 0.7
        # E[# revealed signals] = sum_n P(still live before agent n); live prob after 2k steps is (2a(1-a))^k
        r = 2 * a * (1 - a)                                          # live after each pair of revealed signals
        e = sum(2 * r ** k for k in range(400))
        self.assertAlmostEqual(e, expected_agents_to_cascade(a), 10)
        self.assertAlmostEqual(agents_used(a) - 0, expected_agents_to_cascade(a), 8)

    def test_dp_matches_bayes_simulation(self):
        rng = random.Random(1)
        a, n, N = 0.7, 6, 40000
        right = [0] * n
        for _ in range(N):
            v, s = bayes_run(a, n, rng)
            for i in range(n):
                right[i] += (v[i] == s)
        for i in range(n):
            self.assertAlmostEqual(right[i] / N, sequential_law(a, i + 1)["p_last_right"], delta=0.012)

    def test_dp_with_batch_matches_bayes(self):
        rng = random.Random(2)
        a, n, m, N = 0.65, 5, 3, 40000
        right = 0
        for _ in range(N):
            v, s = bayes_run(a, n, rng, m)
            right += (v[-1] == s)
        self.assertAlmostEqual(right / N, sequential_law(a, n, m)["p_last_right"], delta=0.012)

    def test_first_two_agents(self):
        a = 0.8
        self.assertAlmostEqual(sequential_law(a, 1)["p_last_right"], a, 12)
        # agent 2 copies agent 1 unless their signal disagrees, then follows own signal: right w.p. a either way
        self.assertAlmostEqual(sequential_law(a, 2)["p_last_right"], a, 12)

    def test_herd_ceiling_below_majority(self):
        for a in (0.6, 0.7, 0.8):
            ceil = herd_accuracy(a)
            self.assertAlmostEqual(ceil, 1 - cascade_wrong_prob(a), 10)
            self.assertLess(ceil, majority_accuracy(a, 101))
            self.assertGreater(majority_accuracy(a, 5), majority_accuracy(a, 1))

    def test_batch_two_equals_pure_sequential(self):
        a = 0.7
        self.assertAlmostEqual(herd_accuracy(a, 2), herd_accuracy(a, 0), 12)

    def test_batch_improves_and_converges_to_one(self):
        a = 0.65
        accs = [herd_accuracy(a, m) for m in (0, 3, 5, 9, 21, 61)]
        self.assertTrue(all(x < y for x, y in zip(accs, accs[1:])))
        self.assertGreater(accs[-1], 0.97)

    def test_majority_ties(self):
        self.assertAlmostEqual(majority_accuracy(0.7, 2), 0.7 * 0.7 + 0.5 * 2 * 0.7 * 0.3, 12)


if __name__ == "__main__":
    unittest.main()
