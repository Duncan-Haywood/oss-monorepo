import math, random, unittest
from twin_distillation import *

a, b = 0.9, 1.0


class T(unittest.TestCase):
    def test_bc_gain_matches_monte_carlo_least_squares(self):
        g = lqr_gain(a, 1.0)
        P = stationary_var(a, 1.0, g, 0.0, 0.25)
        k = bc_fit(a, 1.0, g, 0.5, 0.25, 300000, random.Random(1))
        self.assertAlmostEqual(k, bc_gain(g, P, 0.5), delta=0.01)

    def test_cost_matches_simulation(self):
        c = simulate_cost(a, b, 0.5, 1.0, 1.0, 300000, random.Random(2))
        self.assertAlmostEqual(c, cost(a, b, 0.5, 1.0), delta=0.05)

    def test_noiseless_sensor_recovers_teacher_everywhere(self):
        g = lqr_gain(a, 0.7)
        for s2h in (0.1, 1.0, 5.0):
            P = stationary_var(a, 0.7, g, 0.0, s2h)
            self.assertAlmostEqual(bc_gain(g, P, 0.0), g, places=12)
        self.assertAlmostEqual(dagger_fixed_point(g, a, 0.7, 0.0), g, places=6)

    def test_bc_gain_depends_on_twin_noise_only_through_ratio_to_sensor_noise(self):
        g = lqr_gain(a, b)
        k1 = bc_gain(g, stationary_var(a, b, g, 0.0, 0.25), 0.5)
        k2 = bc_gain(g, stationary_var(a, b, g, 0.0, 1.0), 2.0)
        self.assertAlmostEqual(k1, k2, places=12)

    def test_clean_twin_undershoots_and_regret_is_worse_than_on_policy(self):
        g = lqr_gain(a, b)
        s = 0.5
        kb = bc_gain(g, stationary_var(a, b, g, 0.0, 0.25), s)
        kd = dagger_fixed_point(g, a, b, s, 0.25)
        self.assertLess(kb, kd)
        self.assertLess(kd, dagger_fixed_point(g, a, b, s))
        self.assertGreater(regret(a, b, kb, s), 2 * regret(a, b, kd, s))

    def test_dagger_fixed_point_is_fixed_and_near_optimal_without_twin_error(self):
        g = lqr_gain(a, b)
        for s in (0.1, 0.5, 2.0):
            k = dagger_fixed_point(g, a, b, s)
            self.assertAlmostEqual(k, bc_gain(g, stationary_var(a, b, k, s), s), places=9)
            self.assertLess(regret(a, b, k, s), 0.001)

    def test_dagger_path_increases_toward_fixed_point(self):
        g = lqr_gain(a, b)
        ks = dagger_path(g, a, b, 0.5, 0.25, 8)
        self.assertTrue(all(x < y for x, y in zip(ks, ks[1:])))
        self.assertLess(ks[-1], dagger_fixed_point(g, a, b, 0.5, 0.25))

    def test_dart_noise_hits_target_variance_and_clips_at_zero(self):
        g = lqr_gain(a, b)
        nu = dart_noise(g, a, b, 0.25, 1.3)
        self.assertAlmostEqual(stationary_var(a, b, g, 0.0, 0.25, nu), 1.3, places=12)
        self.assertEqual(dart_noise(g, a, b, 5.0, 0.1), 0.0)

    def test_dart_from_real_variance_recovers_on_policy_gain(self):
        g = lqr_gain(a, b)
        s, s2h = 0.5, 0.25
        k = bc_gain(g, stationary_var(a, b, g, 0.0, s2h), s)
        for _ in range(8):
            nu = dart_noise(g, a, b, s2h, stationary_var(a, b, k, s))
            k = bc_gain(g, stationary_var(a, b, g, 0.0, s2h, nu), s)
        self.assertAlmostEqual(k, dagger_fixed_point(g, a, b, s), places=6)


if __name__ == "__main__":
    unittest.main()
