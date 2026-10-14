import random, unittest
from calibration_hedging import *


class T(unittest.TestCase):
    def test_mixture_is_distribution(self):
        rng = random.Random(1)
        for _ in range(200):
            K = 10
            S = [rng.uniform(-5, 5) for _ in range(K + 1)]
            q = mix(S, K)
            self.assertAlmostEqual(sum(q.values()), 1.0, 12)
            self.assertTrue(all(0 <= w <= 1 for w in q.values()))

    def test_blackwell_condition(self):
        # the minimax mixture pays at most max|S|/(2K) for either outcome, and no single grid point does better
        rng = random.Random(2)
        K = 8
        for _ in range(500):
            S = [rng.uniform(-6, 6) for _ in range(K + 1)]
            S[0], S[K] = abs(S[0]), -abs(S[K])           # the hard, always-present sign pattern
            q = mix(S, K)
            v = game_value(S, K, q)
            self.assertLessEqual(v, max(abs(s) for s in S) / (2 * K) + 1e-12)
            self.assertLessEqual(v, min(game_value(S, K, {i: 1.0}) for i in range(K + 1)) + 1e-12)

    def test_potential_bound(self):
        # E sum S^2 <= T against the adaptive adversary and against an oblivious coin
        T_, K, n = 400, 10, 60
        adv = lambda q, K, t, rng: adaptive_adversary(q, K)
        coin = lambda q, K, t, rng: int(rng.random() < 0.7)
        for a in (adv, coin):
            m = sum(run(T_, K, a, s)[4] for s in range(n)) / n
            self.assertLessEqual(m, T_)

    def test_ece_bound(self):
        T_, K, n = 2000, 10, 40
        adv = lambda q, K, t, rng: adaptive_adversary(q, K)
        m = sum(run(T_, K, adv, s)[0] for s in range(n)) / n
        self.assertLessEqual(m, ece_bound(K, T_))

    def test_hedger_has_no_skill_but_informed_does(self):
        K = 10
        adv = lambda q, K, t, rng: adaptive_adversary(q, K)
        e, b, ps, ys, _ = run(3000, K, adv, 5)
        self.assertLess(e, 0.1)
        self.assertGreater(b, 0.2)          # near the 0.25 of a coin
        self.assertEqual(informed_brier([0] * 5), 0.0)

    def test_min_rounds(self):
        self.assertIsNone(min_rounds(10, 0.1))       # eps below the grid floor sqrt(K+1)/(2K)=0.166
        self.assertLessEqual(ece_bound(50, min_rounds(50, 0.2)), 0.2 + 1e-9)


if __name__ == "__main__":
    unittest.main()


if __name__ == "__main__":
    unittest.main()
