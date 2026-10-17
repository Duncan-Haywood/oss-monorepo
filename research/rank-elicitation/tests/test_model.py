import math
import random
import unittest
from rank_elicitation import *


def rsimplex(K, rng):
    x = [rng.expovariate(1) for _ in range(K)]
    s = sum(x)
    return [a / s for a in x]


class T(unittest.TestCase):
    def test_true_ranking_is_unique_argmin(self):
        rng = random.Random(1)
        for K in (3, 4, 5):
            for w in (equal_weights(K), geometric_weights(K, 0.5)):
                for _ in range(30):
                    p = rsimplex(K, rng)
                    t = true_ranking(p)
                    for s in all_rankings(K):
                        if s != t:
                            self.assertGreater(rank_regret(s, p, w), 0)

    def test_adjacent_swap_closed_form(self):
        rng = random.Random(2)
        K = 5
        for w in (equal_weights(K), geometric_weights(K, 0.6)):
            for _ in range(50):
                p = rsimplex(K, rng)
                t = true_ranking(p)
                for r in range(K - 1):
                    i, j = t.index(r), t.index(r + 1)
                    s = list(t)
                    s[i], s[j] = s[j], s[i]
                    self.assertAlmostEqual(rank_regret(s, p, w), swap_regret(p[i], p[j], w, r), 12)

    def test_max_regret_is_reversal(self):
        rng = random.Random(3)
        for K in (3, 5, 6):
            for w in (equal_weights(K), geometric_weights(K, 0.5), topk_weights(K, 2)):
                for _ in range(10):
                    p = rsimplex(K, rng)
                    self.assertAlmostEqual(max_rank_regret(p, w), brute_max_regret(p, w), 12)

    def test_topk_set_elicited(self):
        rng = random.Random(4)
        K, k = 6, 2
        w = topk_weights(K, k)
        for _ in range(50):
            p = rsimplex(K, rng)
            t = true_ranking(p)
            # any ranking with the same top-k set has zero regret; a different set is penalised
            for s in all_rankings(K):
                same = {y for y in range(K) if s[y] < k} == {y for y in range(K) if t[y] < k}
                r = rank_regret(s, p, w)
                self.assertTrue(abs(r) < 1e-12 if same else r > 0)

    def test_equal_spacing_maximises_min_swap_incentive(self):
        K = 6
        for q in (0.3, 0.6, 0.9):
            w = geometric_weights(K, q)
            self.assertLess(min(w[r] - w[r + 1] for r in range(K - 1)), 1 / (K - 1) - 1e-9)
        w = equal_weights(K)
        self.assertAlmostEqual(min(w[r] - w[r + 1] for r in range(K - 1)), 1 / (K - 1), 12)

    def test_diff_stats_exact_and_detection_equal(self):
        pi, pj, K = 0.3, 0.2, 4
        p = [pi, pj, 0.3, 0.2]
        dw = 1 / (K - 1)
        vals = [dw, -dw, 0, 0]
        m = sum(a * b for a, b in zip(p, vals))
        v = sum(a * b * b for a, b in zip(p, vals)) - m * m
        m2, v2 = swap_diff_stats(pi, pj, dw)
        self.assertAlmostEqual(m, m2, 12)
        self.assertAlmostEqual(v, v2, 12)
        # detection sample size is the same as for the Brier-scored swap
        self.assertAlmostEqual(detection_n(*swap_diff_stats(pi, pj, dw), 1.645),
                               detection_n(*swap_diff_stats_brier(pi, pj), 1.645), 9)

    def test_crossover(self):
        K = 5
        g = crossover_gap(K)
        self.assertAlmostEqual(swap_regret(g, 0, equal_weights(K), 0), swap_regret_brier(g, 0) / 2, 12)


if __name__ == "__main__":
    unittest.main()
