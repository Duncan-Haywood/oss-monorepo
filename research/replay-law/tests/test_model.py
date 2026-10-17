import random, unittest
from forgetting_law import forget, total_forget, peak_lag
from replay_law import *


class T(unittest.TestCase):
    def test_no_replay_recovers_forgetting_law(self):
        for d, r in [(12, 3), (32, 4), (8, 1)]:
            c = curve(d, r, lambda t: False, 30)
            for k in range(1, 31):
                self.assertAlmostEqual(c[k - 1], forget(d, r, k), places=12)
            self.assertAlmostEqual(total_none(d, r), total_forget(d, r), places=10)

    def test_replay_zeroes_loss_and_full_replay_is_zero(self):
        c = curve(12, 3, lambda t: t == 3, 8)
        self.assertEqual(c[2], 0.0)
        self.assertAlmostEqual(total_bernoulli(12, 3, 1.0), 0.0, places=12)
        self.assertAlmostEqual(total_periodic(12, 3, 1), 0.0, places=12)

    def test_totals_match_curve_sums(self):
        d, r = 12, 3
        self.assertAlmostEqual(sum(curve(d, r, lambda t: t % 4 == 0, 3000)), total_periodic(d, r, 4), places=9)
        self.assertAlmostEqual(sum(curve(d, r, lambda t: t == 5, 3000)), total_one_shot(d, r, 5), places=9)

    def test_bernoulli_is_monotone_in_rate(self):
        v = [total_bernoulli(32, 4, q / 20) for q in range(21)]
        self.assertTrue(all(x > y for x, y in zip(v, v[1:])))

    def test_best_one_shot_sits_at_the_forgetting_peak(self):
        for d, r in [(32, 4), (128, 8), (32, 1)]:
            t, ratio = best_one_shot(d, r)
            self.assertLess(abs(t - peak_lag(d, r)), 1.5)
            self.assertLess(ratio, 0.75)

    def test_big_tasks_replay_is_full_recovery(self):
        self.assertEqual(replay(6, 3)[1][1], 0.0)

    def test_simulation_matches_exact_curve(self):
        rng = random.Random(4)
        d, r = 10, 2
        sim = simulate_curve(d, r, lambda t, g: t % 3 == 0, 9, 6000, rng)
        ex = curve(d, r, lambda t: t % 3 == 0, 9)
        for s, e in zip(sim, ex):
            self.assertAlmostEqual(s, e, delta=0.004)

    def test_simulation_matches_bernoulli_total(self):
        rng = random.Random(6)
        d, r, q = 10, 2, 0.25
        sim = simulate_bernoulli_total(d, r, q, 120, 2500, rng)
        self.assertAlmostEqual(sim, total_bernoulli(d, r, q), delta=0.03)


if __name__ == "__main__":
    unittest.main()
