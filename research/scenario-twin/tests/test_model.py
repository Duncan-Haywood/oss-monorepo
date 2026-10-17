import math, random, unittest
from scenario_twin import *


class M(unittest.TestCase):
    def test_q_and_inverse(self):
        self.assertAlmostEqual(Q(1.959964), 0.025, places=6)
        self.assertAlmostEqual(Q_inv(1e-3), 3.0902323, places=5)

    def test_matched_width_is_plain_monte_carlo(self):
        for a in (1.0, 2.5, 3.09):
            P = Q(a)
            self.assertAlmostEqual(rel_var(a, 1.0), (1 - P) / P, places=8)

    def test_naive_claim_and_miss(self):
        self.assertAlmostEqual(naive_claim(3.09, 1.0), Q(3.09))
        self.assertLess(naive_claim(3.09, 0.6), 1e-6 * Q(3.09) * 1e3)   # 1e-7 claimed vs 1e-3 real
        self.assertGreater(naive_claim(3.09, 2.0), Q(3.09))              # wide twin over-claims

    def test_variance_infinite_at_or_below_cliff(self):
        self.assertEqual(second_moment(2.0, 0.7), math.inf)
        self.assertEqual(rel_var(2.0, 0.6), math.inf)
        self.assertTrue(math.isfinite(rel_var(2.0, 0.72)))

    def test_second_moment_matches_simulation(self):
        rng = random.Random(1)
        a, s = 1.5, 1.6
        v = sample_is(400000, a, s, rng)
        m2 = sum(x * x for x in v) / len(v)
        self.assertLess(abs(m2 / second_moment(a, s) - 1), 0.03)
        self.assertLess(abs(sum(v) / len(v) / Q(a) - 1), 0.02)

    def test_optimal_width_wider_than_real_and_beats_it(self):
        for a in (2.0, 3.09, 4.0):
            s = optimal_width(a)
            self.assertGreater(s, 1.0)
            self.assertLess(rel_var(a, s), rel_var(a, 1.0))
            self.assertLess(rel_var(a, s), rel_var(a, s * 0.97) + 1e-9)
            self.assertLess(rel_var(a, s), rel_var(a, s * 1.03) + 1e-9)

    def test_mixture_bounded_by_prior_over_lambda(self):
        a, lam = 3.09, 0.2
        for s in (0.5, 0.6):
            m2 = mixture_second_moment(a, s, lam)
            self.assertLessEqual(m2, Q(a) / lam * 1.0001)
            self.assertTrue(math.isfinite(m2))

    def test_mixture_limits(self):
        a = 2.0
        self.assertAlmostEqual(mixture_second_moment(a, 1.3, 0.0), second_moment(a, 1.3), places=4)
        self.assertAlmostEqual(mixture_rel_var(a, 1.3, 1.0), (1 - Q(a)) / Q(a), places=4)

    def test_weights_bounded_in_mixture_sample(self):
        rng = random.Random(3)
        self.assertLessEqual(max(sample_is(20000, 1.0, 0.6, rng, lam=0.25)), 4.0 + 1e-9)

    def test_braking_threshold_matches_stepped_twin(self):
        v, gap, mu0, sig = 15.0, 35.0, 0.7, 0.25
        a = braking_threshold(v, gap, mu0, sig)
        mu_c = mu0 * math.exp(-sig * a)
        dt = 1e-3
        d = simulate_stopping_distance(v, mu_c, dt)
        self.assertLess(abs(d - gap), v * dt)      # explicit Euler overshoots by ~v*dt/2


if __name__ == "__main__":
    unittest.main()
