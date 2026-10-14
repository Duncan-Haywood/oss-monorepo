import math, random, unittest
from queue_twin import *


class M(unittest.TestCase):
    def test_pk_matches_mm1(self):
        for rho in (0.3, 0.7, 0.9):
            self.assertAlmostEqual(wait_exp(rho), rho / (1 - rho), places=12)

    def test_admissible_inverts_pk(self):
        for c2 in (0.0, 1.0, 4.0, 25.0):
            for w in (0.5, 2.0, 10.0):
                self.assertAlmostEqual(pk_wait(admissible_rho(w, c2), c2), w, places=10)

    def test_ratio_identity(self):
        for c2 in (0.5, 3.0, 9.0):
            self.assertAlmostEqual(pk_wait(0.6, c2) / pk_wait(0.6, 1.0), twin_wait_ratio(c2), places=12)

    def test_lognormal_moments(self):
        rng = random.Random(1)
        xs = [sample_lognormal(rng, 4.0) for _ in range(400000)]
        self.assertAlmostEqual(sum(xs) / len(xs), 1.0, delta=0.03)
        self.assertAlmostEqual(fit_c2(xs), 4.0, delta=0.6)  # heavy tail: loose

    def test_pareto_mean_one(self):
        rng = random.Random(2)
        xs = [sample_pareto(rng, 3.5) for _ in range(400000)]
        self.assertAlmostEqual(sum(xs) / len(xs), 1.0, delta=0.03)
        self.assertAlmostEqual(pareto_moments(3.0)[1], 1.0 / 3.0)
        self.assertEqual(pareto_moments(1.5)[1], math.inf)

    def test_lindley_mm1_mean_and_tail(self):
        rng = random.Random(3)
        ws = lindley(0.6, sample_exp, 600000, rng, burn=5000)
        self.assertAlmostEqual(sum(ws) / len(ws), wait_exp(0.6), delta=0.05)
        t = 2.0
        emp = sum(w > t for w in ws) / len(ws)
        self.assertAlmostEqual(emp, exp_tail(0.6, t), delta=0.006)

    def test_lindley_lognormal_matches_pk(self):
        rng = random.Random(4)
        c2 = 2.0
        ws = lindley(0.5, lambda r: sample_lognormal(r, c2), 800000, rng, burn=5000)
        self.assertAlmostEqual(sum(ws) / len(ws), pk_wait(0.5, c2), delta=0.08)

    def test_infinite_variance_gives_infinite_wait(self):
        self.assertEqual(pk_wait(0.1, math.inf), math.inf)


if __name__ == "__main__":
    unittest.main()
