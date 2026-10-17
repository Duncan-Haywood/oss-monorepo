import math, random, unittest
from safety_twin import *

A, T, S = 0.8, 200, 0.1


class M(unittest.TestCase):
    def test_t_cdf_matches_numeric_integral(self):
        for nu in (1, 2, 3, 4, 5, 8):
            c = math.gamma((nu + 1) / 2) / (math.sqrt(nu * math.pi) * math.gamma(nu / 2))
            f = lambda u: c * (1 + u * u / nu) ** (-(nu + 1) / 2)
            for x in (0.5, 2.0):
                n = 20000
                h = x / n
                integ = h * (f(0) / 2 + sum(f(i * h) for i in range(1, n)) + f(x) / 2)
                self.assertAlmostEqual(t_cdf(x, nu), 0.5 + integ, places=6)
            self.assertAlmostEqual(t_cdf(-x, nu) + t_cdf(x, nu), 1.0, places=12)

    def test_noise_variance_matches_across_kinds(self):
        rng = random.Random(0)
        for kind, nu in (("gauss", 0), ("t", 5)):
            ws = [sample_w(kind, S, rng, nu) for _ in range(200000)]
            self.assertLess(abs(sum(w * w for w in ws) / len(ws) / S ** 2 - 1), 0.05)

    def test_twin_certificate_is_a_bound_on_twin_failure(self):
        rng = random.Random(1)
        g = max_sample(6000, A, T, S, "gauss", rng)
        for d in (0.05, 0.01):
            self.assertLessEqual(fail_frac(g, twin_margin(A, T, S, d)), d * 1.25)

    def test_heavy_tail_breaks_the_certificate(self):
        rng = random.Random(2)
        r = max_sample(3000, A, T, S, "t", rng, 3)
        self.assertGreater(fail_frac(r, twin_margin(A, T, S, 0.01)), 0.15)

    def test_bigjump_tail_matches_stationary_simulation(self):
        rng = random.Random(3)
        nu, L = 3, 1.0
        n, hits = 150000, 0
        for _ in range(n):
            x = 0.0
            for _ in range(40):
                x = A * x + sample_w("t", S, rng, nu)
            hits += abs(x) > L
        self.assertAlmostEqual(hits / n, bigjump_tail(L, A, S, nu), delta=0.25 * bigjump_tail(L, A, S, nu))

    def test_real_margin_inverts_the_tail(self):
        L = real_margin(A, T, S, 4, 0.01)
        self.assertAlmostEqual(T * bigjump_tail(L, A, S, 4), 0.01, places=6)
        self.assertGreater(L, twin_margin(A, T, S, 0.01))

    def test_conformal_margin_is_order_statistic_and_needs_enough_data(self):
        xs = sorted(range(1, 100))
        self.assertEqual(conformal_margin(xs, 0.05), 95)
        self.assertEqual(conformal_margin(xs, 0.01), 99)
        self.assertEqual(conformal_margin(xs, 0.005), float("inf"))

    def test_conformal_coverage(self):
        rng = random.Random(4)
        n, d, miss, reps = 99, 0.05, 0, 400
        for _ in range(reps):
            m = conformal_margin(sorted(rng.random() for _ in range(n)), d)
            miss += rng.random() > m
        self.assertLess(miss / reps, d + 0.03)

    def test_hill_recovers_pareto_index(self):
        rng = random.Random(5)
        ws = [rng.random() ** (-1 / 2.5) for _ in range(20000)]
        al, _ = hill_alpha(ws, 500)
        self.assertAlmostEqual(al, 2.5, delta=0.25)
