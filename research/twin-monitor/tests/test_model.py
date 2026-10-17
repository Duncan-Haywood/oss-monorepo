import math, unittest
from twin_monitor import *

A, B = 0.9, 1.0


class TestModel(unittest.TestCase):
    def test_rate_matches_moment_formula(self):
        k, v, da, db = 0.61, 0.3, 0.1, 0.4
        exx, euu, exu = moments(A, B, k, v)
        direct = (da * da * exx + 2 * da * db * exu + db * db * euu) / 2
        self.assertAlmostEqual(kl_rate(A, B, k, da, db, v), direct, places=12)

    def test_rate_affine_in_dither(self):
        k, da, db = 0.61, 0.1, 0.4
        a0, b0 = rate_coeffs(A, B, k, da, db)
        for v in (0.0, 0.2, 3.0):
            self.assertAlmostEqual(kl_rate(A, B, k, da, db, v), a0 + b0 * v, places=12)

    def test_blind_line_has_zero_rate_without_dither(self):
        for ah in (0.7, 1.0, 0.5):
            bh, k = blind_twin(A, B, ah)
            self.assertAlmostEqual(ah - A, k * (bh - B), places=8)
            self.assertAlmostEqual(kl_rate(A, B, k, ah - A, bh - B, 0.0), 0.0, places=8)
            self.assertAlmostEqual(kl_rate(A, B, k, ah - A, bh - B, 0.4), (bh - B) ** 2 * 0.4 / 2, places=8)

    def test_dither_cost_is_linear_and_exact(self):
        k = optimal_gain(A, B)
        for v in (0.1, 1.0):
            self.assertAlmostEqual(cost(A, B, k, v=v) - cost(A, B, k), dither_cost(A, B, k, v), places=10)

    def test_dither_cost_matches_simulation(self):
        import random
        k, v, rng, x, tot, T = 0.8, 0.5, random.Random(3), 0.0, 0.0, 300000
        for t in range(T):
            u = -k * x + rng.gauss(0, math.sqrt(v))
            tot += x * x + 0.1 * u * u
            x = A * x + B * u + rng.gauss(0, 1)
        self.assertLess(abs(tot / T / cost(A, B, k, v=v) - 1), 0.02)

    def test_e_value_starts_at_one(self):
        self.assertAlmostEqual(log_e((0, 0, 0), (0, 0), 1.0, 1.0), 0.0, places=12)

    def test_null_expected_log_e_nonpositive(self):
        k = optimal_gain(A, B)
        for n in (10, 100, 1000):
            self.assertLessEqual(expected_log_e(n, A, B, k, 0.0, 0.0, 0.2, 1.0, 1.0), 1e-12)

    def test_e_process_false_alarm_below_alpha(self):
        k = optimal_gain(A, B)
        n = 300
        fa = sum(run_monitor(A, B, A, B, k, 0.2, 0.1, 800, 1.0, 1.0, s) is not None for s in range(n))
        self.assertLessEqual(fa / n, 0.1)

    def test_peeking_inflates_false_alarms(self):
        k = optimal_gain(A, B)
        n = 200
        fa = sum(run_peeking(A, B, A, B, k, 0.2, 800, 1.0, s) is not None for s in range(n))
        self.assertGreater(fa / n, 0.25)

    def test_delay_prediction_close_to_simulation(self):
        bh = 1.4
        k = optimal_gain(A, bh)
        ds = sorted(run_monitor(A, B, A, bh, k, 0.2, 0.05, 3000, 1.0, 1.0, s) for s in range(80))
        pred = predicted_delay(0.05, A, B, k, 0.0, bh - B, 0.2)
        self.assertLess(abs(ds[40] / pred - 1), 0.3)
        self.assertLess(simple_delay(0.05, A, B, k, 0.0, bh - B, 0.2), ds[40])

    def test_blind_twin_is_invisible_without_dither(self):
        bh, k = blind_twin(A, B, 0.5)
        alarms = sum(run_monitor(A, B, 0.5, bh, k, 0.0, 0.05, 3000, 1.0, 1.0, s) is not None for s in range(40))
        self.assertLessEqual(alarms, 6)
        seen = [run_monitor(A, B, 0.5, bh, k, 0.2, 0.05, 3000, 1.0, 1.0, s) for s in range(20)]
        self.assertTrue(all(d is not None for d in seen))

    def test_optimal_dither_matches_closed_form_when_interior(self):
        bh, k = blind_twin(A, B, 0.5)
        v, _ = optimal_dither(A, B, k, 0.5 - A, bh - B, 0.5, 10 ** 5, 0.05)
        vs = optimal_dither_blind(A, B, k, bh - B, 0.5, 10 ** 5, 0.05)
        self.assertLess(abs(v / vs - 1), 0.01)

    def test_small_regret_blind_twin_is_not_worth_dithering(self):
        bh, k = blind_twin(A, B, 0.7)
        v, c = optimal_dither(A, B, k, 0.7 - A, bh - B, 0.1, 10 ** 4, 0.05)
        self.assertEqual(v, 0.0)


if __name__ == "__main__":
    unittest.main()
