import math, random, unittest
from aliasing_twin import *


class M(unittest.TestCase):
    def test_wrap_range_and_identity(self):
        self.assertAlmostEqual(wrap(3.0, 10.0), 3.0)
        self.assertAlmostEqual(wrap(12.0, 10.0), -8.0)
        self.assertAlmostEqual(wrap(-31.0, 10.0), 9.0)

    def test_no_aliasing_limit_is_twin(self):
        self.assertAlmostEqual(bias(2.0, 1.0, 1000.0), 0.0, places=12)
        self.assertAlmostEqual(mse1(2.0, 1.0, 1000.0), 1.0, places=9)
        self.assertAlmostEqual(mse_ratio(10, 2.0, 1.0, 1000.0), 1.0, places=9)

    def test_bias_and_mse_match_monte_carlo(self):
        rng = random.Random(1)
        for mu in (8.0, 10.0, 12.0):
            ys = [wrap(mu + rng.gauss(0, 1.0), 10.0) - mu for _ in range(200000)]
            m = sum(ys) / len(ys)
            se = math.sqrt(sum((y - m) ** 2 for y in ys) / len(ys) / len(ys))
            self.assertLess(abs(m - bias(mu, 1.0, 10.0)), 4 * se)
            q = sum(y * y for y in ys) / len(ys)
            self.assertLess(abs(q - mse1(mu, 1.0, 10.0)), 0.05 * q + 0.02)

    def test_mean_mse_matches_monte_carlo(self):
        m, se = mc_mean_mse(10, 8.5, 1.0, 10.0, 40000, random.Random(2))
        self.assertLess(abs(m - mse_mean(10, 8.5, 1.0, 10.0)), 4 * se)

    def test_bias_at_the_edge_is_minus_V_and_symmetric(self):
        self.assertAlmostEqual(bias(10.0, 0.5, 10.0), -10.0, delta=0.01)
        self.assertAlmostEqual(bias(-7.0, 1.0, 10.0), -bias(7.0, 1.0, 10.0), places=12)

    def test_averaging_cannot_beat_bias_floor(self):
        b2 = bias(9.0, 1.0, 10.0) ** 2
        self.assertGreater(mse_mean(10 ** 6, 9.0, 1.0, 10.0), b2)
        self.assertAlmostEqual(mse_mean(10 ** 9, 9.0, 1.0, 10.0), b2, delta=1e-6)

    def test_safe_speed(self):
        for tol in (0.01, 0.1, 1.0):
            m = safe_speed(tol, 1.0, 10.0)
            self.assertAlmostEqual(abs(bias(m, 1.0, 10.0)), tol, delta=1e-6)
        # leading-term closed form V + s*Phi^-1(tol/2V) agrees to a few percent of s
        self.assertAlmostEqual(safe_speed(0.1, 1.0, 10.0), 10.0 - 2.5758 + 0.0, delta=0.15)

    def test_unwrap_fail_prob_matches_monte_carlo(self):
        rng = random.Random(4)
        s, sp, V = 1.0, 6.0, 10.0
        n = 200000
        bad = 0
        for _ in range(n):
            e, ep = rng.gauss(0, s), rng.gauss(0, sp)
            bad += abs(e - ep) > V
        p = unwrap_fail_prob(s, sp, V)
        self.assertLess(abs(bad / n - p), 4 * math.sqrt(p * (1 - p) / n))

    def test_unwrapped_mse_matches_monte_carlo_and_limits(self):
        for sp in (3.0, 6.0, 9.0):
            m, se = mc_unwrapped_mse(3.0, 1.0, sp, 10.0, 150000, random.Random(5))
            self.assertLess(abs(m - mse_unwrapped(1.0, sp, 10.0)), 4 * se)
        self.assertAlmostEqual(mse_unwrapped(1.0, 0.5, 10.0), 1.0, places=6)


if __name__ == "__main__":
    unittest.main()
