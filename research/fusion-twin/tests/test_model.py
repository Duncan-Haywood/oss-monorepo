import math, random, unittest
from fusion_twin import *


class M(unittest.TestCase):
    def test_independent_is_twin(self):
        self.assertAlmostEqual(fused_var(2.0, 0.0, 8), 0.25)
        self.assertAlmostEqual(gate_false_alarm(0.0, 16), math.erfc(3 / math.sqrt(2)), places=12)

    def test_perfect_correlation_is_one_sensor(self):
        self.assertAlmostEqual(fused_var(2.0, 1.0, 50), 2.0)
        self.assertAlmostEqual(n_eff(1.0, 50), 1.0)

    def test_neff_below_inverse_rho_and_limit(self):
        for rho in (0.02, 0.1, 0.5):
            self.assertLess(n_eff(rho, 10 ** 6), 1 / rho)
            self.assertAlmostEqual(n_eff(rho, 10 ** 6) * rho, 1.0, places=3)
        self.assertAlmostEqual(fused_var(1.0, 0.1, 10 ** 7), floor_var(1.0, 0.1), places=6)

    def test_sensors_needed_inverts_variance(self):
        for rho in (0.0, 0.01, 0.03):
            n = sensors_needed(1.0, rho, 0.25)
            self.assertAlmostEqual(fused_var(1.0, rho, n), 0.0625, places=10)
        self.assertEqual(sensors_needed(1.0, 0.0625, 0.25), math.inf)
        self.assertEqual(sensors_needed(1.0, 0.1, 0.25), math.inf)

    def test_honest_gate_restores_nominal(self):
        for rho, n in ((0.05, 16), (0.3, 4)):
            k = inflation(rho, n)
            self.assertAlmostEqual(math.erfc(honest_gate(rho, n) / math.sqrt(2 * k)), math.erfc(3 / math.sqrt(2)), places=12)

    def test_sampler_moments(self):
        rng = random.Random(1)
        n, rho, N = 8, 0.3, 60000
        means = [sum(sample_errors(rng, n, rho)) / n for _ in range(N)]
        v = sum(m * m for m in means) / N
        self.assertAlmostEqual(v, fused_var(1.0, rho, n), delta=0.02)

    def test_gate_false_alarm_matches_simulation(self):
        rng = random.Random(2)
        n, rho, N = 16, 0.05, 200000
        sd = 1 / math.sqrt(n)
        hits = sum(abs(sum(sample_errors(rng, n, rho)) / n) > 3 * sd for _ in range(N))
        self.assertAlmostEqual(hits / N, gate_false_alarm(rho, n), delta=0.002)

    def test_rho_hat_consistent(self):
        rng = random.Random(3)
        st = [epoch_stats(sample_errors(rng, 8, 0.2, 1.5)) for _ in range(40000)]
        r, sq = rho_hat(st, 8)
        self.assertAlmostEqual(r, 0.2, delta=0.02)
        self.assertAlmostEqual(sq, 2.25, delta=0.06)

    def test_bootstrap_bound_above_estimate(self):
        rng = random.Random(4)
        st = [epoch_stats(sample_errors(rng, 8, 0.1)) for _ in range(100)]
        self.assertGreater(boot_rho_upper(st, 8, rng), rho_hat(st, 8)[0])


if __name__ == "__main__":
    unittest.main()
