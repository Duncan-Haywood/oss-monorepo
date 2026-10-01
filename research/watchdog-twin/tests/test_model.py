import itertools
import math
import random
import unittest

from watchdog_twin.model import (gilbert_params, iid_L, twin_mtt, real_mtt, real_rate_approx, twin_rate_approx, min_m,
                                 m_real_approx, m_twin_approx, no_trip_prob, simulate_first_trip,
                                 simulate_first_trip_iid)


def brute_no_trip(p, L, m, N):
    """Enumerate all 2^N state paths of the Gilbert chain."""
    a, b = gilbert_params(p, L)
    tot = 0.0
    for path in itertools.product((0, 1), repeat=N):
        pr = p if path[0] else 1 - p
        for s, t in zip(path, path[1:]):
            pr *= (1 - b if t else b) if s else (a if t else 1 - a)
        run = best = 0
        for s in path:
            run = run + 1 if s else 0
            best = max(best, run)
        if best < m:
            tot += pr
    return tot


class T(unittest.TestCase):
    def test_params_give_mean_loss_and_burst(self):
        a, b = gilbert_params(0.05, 10.0)
        self.assertAlmostEqual(a / (a + b), 0.05, places=14)
        self.assertAlmostEqual(1 / b, 10.0, places=14)

    def test_infeasible(self):
        with self.assertRaises(ValueError):
            gilbert_params(0.6, 1.0)  # needs a = 1.5 > 1

    def test_iid_special_case_matches_twin_formula(self):
        for p in (0.02, 0.1, 0.3):
            for m in (1, 2, 3, 5, 8):
                self.assertAlmostEqual(real_mtt(p, iid_L(p), m) / twin_mtt(p, m), 1.0, places=6)

    def test_twin_mtt_small_cases(self):
        self.assertAlmostEqual(twin_mtt(0.2, 1), 5.0)
        # m = 2: E = (1 + p)/p^2
        self.assertAlmostEqual(twin_mtt(0.2, 2), 1.2 / 0.04)

    def test_m1_is_one_over_p(self):
        self.assertAlmostEqual(real_mtt(0.05, 7.0, 1), 20.0)

    def test_mtt_matches_dp_survival_sum(self):
        # E[T] = sum_{N>=0} P(T > N) = sum_N P(no trip in N ticks)
        p, L, m = 0.2, 3.0, 3
        tot = 1.0 + sum(no_trip_prob(p, L, m, N) for N in range(1, 4000))
        self.assertAlmostEqual(tot, real_mtt(p, L, m), places=6)

    def test_dp_matches_enumeration(self):
        for (p, L, m, N) in ((0.2, 2.0, 2, 8), (0.3, 4.0, 3, 10), (0.1, 5.0, 4, 11)):
            self.assertAlmostEqual(no_trip_prob(p, L, m, N), brute_no_trip(p, L, m, N), places=12)

    def test_monte_carlo(self):
        rng = random.Random(1)
        p, L, m = 0.2, 4.0, 4
        n = 20000
        mc = sum(simulate_first_trip(p, L, m, rng) for _ in range(n)) / n
        self.assertLess(abs(mc / real_mtt(p, L, m) - 1), 0.04)
        mc = sum(simulate_first_trip_iid(p, m, rng) for _ in range(n)) / n
        self.assertLess(abs(mc / twin_mtt(p, m) - 1), 0.04)

    def test_burstiness_shortens_time_to_trip_until_burst_length_reaches_m(self):
        for m in (5, 8):
            Ls = (iid_L(0.05), 2, 3, m)
            vals = [real_mtt(0.05, L, m) for L in Ls]
            self.assertTrue(all(x > y for x, y in zip(vals, vals[1:])))

    def test_worst_burst_length_is_near_m(self):
        # fixed mean loss: onset rate p/L falls with L while survival (1-1/L)^(m-1) rises, so the trip rate peaks near L = m
        for m in (4, 8, 16):
            grid = [1.0 + 0.25 * i for i in range(0, 4 * m * 3)]
            L_star = min(grid, key=lambda L: real_mtt(0.02, L, m))
            self.assertLess(abs(L_star - m), 0.5 * m)
            self.assertLess(real_mtt(0.02, L_star, m), 1.1 * math.e * m / 0.02)

    def test_rate_approximations_converge(self):
        p, L = 0.05, 10.0
        r1 = 1 / real_mtt(p, L, 40) / real_rate_approx(p, L, 40)
        r2 = 1 / twin_mtt(p, 6) / twin_rate_approx(p, 6)
        self.assertLess(abs(r1 - 1), 0.02)
        self.assertLess(abs(r2 - 1), 1e-4)

    def test_min_m_and_approximation(self):
        p, L, target = 0.05, 10.0, 1e6
        mr = min_m(lambda m: real_mtt(p, L, m), target)
        self.assertLess(abs(mr - m_real_approx(p, L, target)), 1.5)
        mt = min_m(lambda m: twin_mtt(p, m), target)
        self.assertLess(abs(mt - m_twin_approx(p, target)), 1.0)
        self.assertGreater(mr, mt)


if __name__ == "__main__":
    unittest.main()
