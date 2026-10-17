import math
import random
import unittest

from stereo_twin.model import (Sensor, Phi, p_valid, over_prob, under_prob, twin_over_prob, quantile, gated_mean, gated_var,
                               mean_bias_rel, depth_moment, real_rms_mean, twin_rms_mean, valid_depths, estimators,
                               harmonic_bias_rel_leading, twin_p_beyond_range)

S = Sensor()


class T(unittest.TestCase):
    def test_sensor_constants(self):
        self.assertAlmostEqual(S.k, 84.0)
        self.assertAlmostEqual(S.s(40.0), 0.25 * 40 / 84)
        self.assertAlmostEqual(S.zmax(), 84.0)

    def test_zeroth_moment_is_one(self):
        for Z in (5.0, 20.0, 60.0):
            self.assertAlmostEqual(depth_moment(S, Z, 0), 1.0, places=6)

    def test_p_valid_extremes(self):
        self.assertAlmostEqual(p_valid(S, 5.0), 1.0, places=12)
        # at Z = zmax the true disparity equals the floor, so exactly half the looks are valid
        self.assertAlmostEqual(p_valid(S, 84.0), 0.5, places=12)

    def test_median_is_true_depth_when_gate_is_far(self):
        for Z in (5.0, 10.0, 20.0):
            self.assertAlmostEqual(quantile(S, 0.5, Z), Z, delta=1e-6 * Z)

    def test_over_prob_matches_simulation(self):
        Z, a = 40.0, 0.2
        rng = random.Random(1)
        n = 400000
        c = sum(1 for d in (S.d0(Z) + S.sigma * rng.gauss(0, 1) for _ in range(n)) if d >= S.dmin and S.k / d > Z * (1 + a))
        self.assertAlmostEqual(c / n, over_prob(S, a, Z), delta=0.003)

    def test_under_prob_matches_simulation(self):
        Z, a = 40.0, 0.15
        rng = random.Random(2)
        n = 400000
        c = sum(1 for d in (S.d0(Z) + S.sigma * rng.gauss(0, 1) for _ in range(n)) if S.k / d < Z * (1 - a) and d > 0)
        self.assertAlmostEqual(c / n, under_prob(S, a, Z), delta=0.003)

    def test_over_prob_zero_beyond_range(self):
        self.assertEqual(over_prob(S, 5.0, 40.0), 0.0)

    def test_overs_dominate_unders_and_twin_is_symmetric(self):
        Z, a = 40.0, 0.2
        self.assertGreater(over_prob(S, a, Z), under_prob(S, a, Z))
        self.assertGreater(over_prob(S, a, Z), twin_over_prob(S, a, Z))
        self.assertLess(under_prob(S, a, Z), twin_over_prob(S, a, Z))

    def test_small_noise_bias_is_s_squared(self):
        Z = 10.0
        s = S.s(Z)
        self.assertAlmostEqual(mean_bias_rel(S, Z), s * s, delta=0.15 * s * s)

    def test_gated_var_close_to_linearised_when_small(self):
        Z = 5.0
        self.assertAlmostEqual(gated_var(S, Z) ** 0.5 / Z, S.s(Z), delta=0.05 * S.s(Z))

    def test_moments_match_simulation(self):
        Z = 40.0
        rng = random.Random(3)
        zs = valid_depths(S, Z, 500000, rng)
        m = sum(zs) / len(zs)
        self.assertAlmostEqual(m, gated_mean(S, Z), delta=0.15)

    def test_real_rms_floors_at_bias(self):
        Z = 40.0
        self.assertAlmostEqual(real_rms_mean(S, Z, 10 ** 9), abs(mean_bias_rel(S, Z)), places=4)
        self.assertLess(twin_rms_mean(S, Z, 10 ** 6), 1e-3)

    def test_harmonic_converges(self):
        Z, N = 20.0, 64
        rng = random.Random(4)
        r = [estimators(S, Z, N, rng)[1] for _ in range(3000)]
        bias = sum(r) / len(r) / Z - 1
        self.assertAlmostEqual(bias, harmonic_bias_rel_leading(S, Z, N), delta=0.002)

    def test_twin_range_loss_is_smaller_than_real_near_limit(self):
        self.assertLess(twin_p_beyond_range(S, 60.0), 1 - p_valid(S, 60.0))


if __name__ == "__main__":
    unittest.main()
