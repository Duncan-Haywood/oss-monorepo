import math, random, unittest
from randomized_twin import *

a, b, q, r = 0.9, 1.0, 1.0, 0.1


class T(unittest.TestCase):
    def test_zero_randomisation_is_riccati(self):
        self.assertAlmostEqual(dr_gain(a, b, 0.0), optimal_gain(a, b), places=12)
        self.assertAlmostEqual(dr_gain(a, b, 1e-4), optimal_gain(a, b), places=6)

    def test_dr_cost_matches_monte_carlo_average(self):
        rng = random.Random(1)
        k, eps = 0.8, 0.4
        mc = sum(cost(a, b * (1 + eps * (2 * rng.random() - 1)), k) for _ in range(200000)) / 200000
        self.assertAlmostEqual(dr_cost(a, b, eps, k) / mc, 1.0, delta=0.005)

    def test_dr_cost_is_infinite_when_any_sampled_plant_is_unstable(self):
        k = 1.5                                                                            # cliff at b(1+eps) = (1+a)/k
        e = cliff_eps(a, b, k)
        self.assertAlmostEqual(e, 1.9 / 1.5 - 1, places=12)
        self.assertTrue(math.isfinite(dr_cost(a, b, e - 0.01, k)))
        self.assertTrue(math.isinf(dr_cost(a, b, e + 0.01, k)))

    def test_randomised_gain_is_more_conservative_and_monotone_in_width(self):
        ks = [dr_gain(a, b, e) for e in (0.0, 0.2, 0.4, 0.6, 0.8, 0.95)]
        self.assertTrue(all(x > y for x, y in zip(ks, ks[1:])))

    def test_small_width_law(self):
        for e in (0.02, 0.05, 0.1):
            self.assertAlmostEqual((dr_gain(a, b, e) - optimal_gain(a, b)) / (dr_gain_local(a, b, e) - optimal_gain(a, b)), 1.0, delta=0.01)

    def test_price_is_quadratic_in_gain_shift(self):
        p1, p2 = price_of_randomization(a, b, 0.1), price_of_randomization(a, b, 0.2)
        self.assertAlmostEqual(p2 / p1, 16.0, delta=1.0)                                  # (eps^2)^2 scaling

    def test_dr_removes_the_cliff_the_nominal_gain_falls_off(self):
        plant = b * 2.6                                                                    # beyond (1+a)/k* = 2.31 b
        self.assertTrue(math.isinf(regret(a, plant, optimal_gain(a, b))))
        self.assertTrue(math.isfinite(dr_regret(a, plant, b, 0.9)))

    def test_dr_wins_at_top_of_range_and_loses_when_twin_is_right(self):
        e = 0.6
        self.assertLess(dr_regret(a, 1.6 * b, b, e), regret(a, 1.6 * b, optimal_gain(a, b)))
        self.assertGreater(dr_regret(a, b, b, e), regret(a, b, optimal_gain(a, b)))

    def test_minimax_beats_both_on_worst_case_and_dr_is_between(self):
        e = 0.5
        km, kd, kn = minimax_gain(a, b, e), dr_gain(a, b, e), optimal_gain(a, b)
        w = lambda k: worst_regret(a, b, e, k)
        self.assertLessEqual(w(km), w(kd) + 1e-9)
        self.assertLessEqual(w(km), w(kn) + 1e-9)
        self.assertLess(kd, km)
        self.assertLess(km, kn)

if __name__ == "__main__":
    unittest.main()
