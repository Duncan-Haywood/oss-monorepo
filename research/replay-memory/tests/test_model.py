import random, unittest
import replay_law
from forgetting_law import forget
from replay_memory import *


class T(unittest.TestCase):
    def test_endpoints_are_plain_and_full_replay(self):
        for d, r in [(12, 3), (32, 4), (8, 2), (6, 3), (128, 8)]:
            for A, B in [(partial(d, r, 0), replay_law.plain(d, r)), (partial(d, r, r), replay_law.replay(d, r))]:
                for i in range(2):
                    for j in range(2):
                        self.assertAlmostEqual(A[i][j], B[i][j], places=12)

    def test_no_replay_recovers_forgetting_law(self):
        c = curve(32, 4, lambda t: 0, 25)
        for k in range(1, 26):
            self.assertAlmostEqual(c[k - 1], forget(32, 4, k), places=12)

    def test_full_memory_totals_match_replay_law(self):
        d, r = 32, 4
        self.assertAlmostEqual(total_bernoulli(d, r, 0.25, r), replay_law.total_bernoulli(d, r, 0.25), places=12)
        self.assertAlmostEqual(total_periodic(d, r, 5, r), replay_law.total_periodic(d, r, 5), places=10)
        self.assertAlmostEqual(total_one_shot(d, r, 5, r), replay_law.total_one_shot(d, r, 5), places=10)

    def test_totals_match_curve_sums(self):
        d, r, m = 16, 4, 2
        self.assertAlmostEqual(sum(curve(d, r, lambda t: m if t % 4 == 0 else 0, 3000)), total_periodic(d, r, 4, m), places=9)
        self.assertAlmostEqual(sum(curve(d, r, lambda t: m if t == 3 else 0, 3000)), total_one_shot(d, r, 3, m), places=9)

    def test_more_memory_is_never_worse(self):
        for d, r in [(12, 4), (32, 8)]:
            v = [total_bernoulli(d, r, 0.3, m) for m in range(0, r + 1)]
            self.assertTrue(all(x > y for x, y in zip(v, v[1:])))

    def test_one_shot_benefit_is_close_to_linear_in_memory(self):
        for d, r in [(32, 4), (128, 8)]:
            for m in range(1, r + 1):
                self.assertLess(abs(one_shot_benefit(d, r, m) - m / r), 0.04)

    def test_full_memory_wins_at_a_fixed_budget(self):
        for d, r in [(12, 4), (32, 8)]:
            m, _, tot = best_split(d, r, 1.0)
            self.assertEqual(m, r)

    def test_simulation_matches_exact_curve(self):
        rng = random.Random(4)
        d, r, m = 9, 3, 2
        sim = simulate_curve(d, r, lambda t, g: m if t % 3 == 0 else 0, 6, 5000, rng)
        ex = curve(d, r, lambda t: m if t % 3 == 0 else 0, 6)
        for s, e in zip(sim, ex):
            self.assertAlmostEqual(s, e, delta=0.005)


if __name__ == "__main__":
    unittest.main()
