import os, sys, unittest, random, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from robust_aggregation import *


class T(unittest.TestCase):
    def test_mean_unbounded(self):
        self.assertGreater(mean_bias(0.01, 1e9), 1e6)

    def test_median_closed_form_matches_simulation(self):
        for beta in (0.1, 0.25, 0.4):
            s = simulate(4001, beta, "median", reps=40)
            self.assertAlmostEqual(s, median_bias(beta), delta=0.05)

    def test_median_bias_independent_of_B(self):
        self.assertAlmostEqual(simulate(2001, 0.2, "median", B=10, reps=20), simulate(2001, 0.2, "median", B=1e9, reps=20), delta=1e-9)

    def test_median_breaks_at_half(self):
        self.assertEqual(median_bias(0.5), math.inf)
        self.assertLess(median_bias(0.49), math.inf)

    def test_trimmed_closed_form_matches_simulation(self):
        for beta, tau in ((0.1, 0.1), (0.1, 0.2), (0.2, 0.3)):
            s = simulate(6000, beta, "trimmed", tau=tau, reps=30)
            self.assertAlmostEqual(s, trimmed_mean_bias(beta, tau), delta=0.03)

    def test_trimmed_limits(self):
        self.assertAlmostEqual(trimmed_mean_bias(0.0, 0.0), 0.0, places=9)
        self.assertEqual(trimmed_mean_bias(0.2, 0.1), math.inf)
        # tau -> 1/2 approaches median bias
        self.assertAlmostEqual(trimmed_mean_bias(0.2, 0.4999), median_bias(0.2), delta=1e-3)

    def test_rank_bracket_deterministic(self):
        rng = random.Random(3)
        for _ in range(500):
            h = rng.randint(3, 25); f = rng.randint(1, h)
            if (h + f) % 2 == 0 or f >= (h + f + 1) // 2: continue
            honest = [rng.gauss(0, 1) for _ in range(h)]
            adv = [rng.choice([-1e9, 1e9, rng.gauss(0, 5)]) for _ in range(f)]
            self.assertTrue(median_rank_bracket(honest, f, adv))


if __name__ == "__main__":
    unittest.main()
