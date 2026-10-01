import math, random, unittest
from speed_race import *


class T(unittest.TestCase):
    def test_pi_at_one_is_k_over_n(self):
        for n, k in [(5, 2), (12, 7), (30, 30)]:
            self.assertAlmostEqual(pi(n, k, 1.0), k / n, places=10)

    def test_pi_matches_independent_integral(self):
        for n, k, r in [(4, 1, 2.0), (6, 3, 0.5), (8, 5, 1.7)]:
            self.assertAlmostEqual(pi(n, k, r), pi_numeric(n, k, r, steps=20000), places=3)

    def test_tullock_at_k1(self):
        for n, r in [(3, 2.0), (7, 0.4)]:
            self.assertAlmostEqual(pi(n, 1, r), r / (r + n - 1), places=10)
            self.assertAlmostEqual(dpi(n, 1), (n - 1) / n ** 2, places=12)

    def test_dpi_closed_form_matches_finite_difference(self):
        for n, k in [(6, 1), (6, 3), (20, 9), (20, 19)]:
            self.assertAlmostEqual(dpi(n, k), dpi_numeric(n, k), places=6)

    def test_paying_everyone_gives_no_speed_incentive(self):
        self.assertAlmostEqual(dpi(15, 15), 0.0, places=12)
        self.assertEqual(round_time(15, 15, eq_speed(15, 15, 1.0, 1.0)), math.inf)

    def test_symmetric_profile_is_global_best_response(self):
        for n, k in [(6, 1), (6, 3), (10, 4), (10, 8)]:
            R, c = 3.0, 1.0
            m = eq_speed(n, k, R, c)
            rate, u = best_response(n, k, R, c, m)
            payoff = R * k / n - c * m
            self.assertLessEqual(u, payoff + 1e-9)          # nothing beats staying at m
            self.assertGreaterEqual(payoff, 0.0)

    def test_dissipation_k1_is_tullock(self):
        self.assertAlmostEqual(dissipation(10, 1), 0.9, places=12)

    def test_simulated_payout_and_round_time(self):
        rng = random.Random(3)
        n, k = 8, 3
        m = eq_speed(n, k, 2.0, 1.0)
        rates = [m] * n
        rates[0] = 1.5 * m
        paid, t = simulate_race(n, k, rates, rng, 60000)
        self.assertAlmostEqual(paid[0], pi(n, k, 1.5), delta=0.008)
        _, t0 = simulate_race(n, k, [m] * n, rng, 60000)
        self.assertAlmostEqual(t0, round_time(n, k, m), delta=0.02 * round_time(n, k, m))

    def test_dpi_telescopes_to_closed_form(self):
        for n in (2, 5, 17, 60):
            for k in range(1, n + 1):
                self.assertAlmostEqual(dpi(n, k), dpi_closed(n, k), places=11)

    def test_round_time_is_harmonic_free(self):
        n, k, R, c = 25, 9, 4.0, 1.5
        self.assertAlmostEqual(round_time(n, k, eq_speed(n, k, R, c)), n * c / ((n - k) * R), places=10)

    def test_speed_alone_is_winner_take_all(self):
        n, B, c = 30, 10.0, 1.0
        for k in (1, 5, 12, 29):
            self.assertAlmostEqual(time_given_budget(n, k, B, c), n * c * k / ((n - k) * B), places=10)
        self.assertEqual(best_k_budget(n, B, c)[0], 1)

    def test_accuracy_floor_makes_k_interior(self):
        ks, t = best_k_accuracy(30, 10.0, 1.0, 1.0, 0.2, 2.0, 1.0, 0.05)
        self.assertEqual(ks, 5)                              # k_min = 4.44, so k=5 is the first feasible
        self.assertEqual(total_time(30, 3, 10.0, 1.0, 1.0, 0.2, 2.0, 1.0, 0.05), math.inf)
        self.assertLess(t, total_time(30, 12, 10.0, 1.0, 1.0, 0.2, 2.0, 1.0, 0.05))


if __name__ == "__main__":
    unittest.main()
