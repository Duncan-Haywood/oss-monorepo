import math, random, unittest
from terrain_twin import *


class T(unittest.TestCase):
    def test_gammainc_special_cases(self):
        for x in (0.3, 1.0, 4.0):
            self.assertAlmostEqual(gammainc_lower(1, x), 1 - math.exp(-x), places=12)
            self.assertAlmostEqual(gammainc_lower(0.5, x), math.erf(math.sqrt(x)), places=12)
        for n in (3, 8):
            for x in (0.5, 5.0, 20.0):
                pois = 1 - math.exp(-x) * sum(x ** i / math.factorial(i) for i in range(n))
                self.assertAlmostEqual(gammainc_lower(n, x), pois, places=11)

    def test_quantile_inverts_cdf(self):
        for j in (1, 5, 100):
            for d in (1e-3, 0.05):
                self.assertAlmostEqual(mean_cdf(mean_quantile(d, j, 4), j, 4), d, places=9)

    def test_many_patches_converge_to_mean(self):
        self.assertLess(abs(certified_factor(1e-3, 10 ** 5, 4) - 1), 0.02)
        self.assertGreater(certified_factor(1e-3, 1, 4), 5)

    def test_single_patch_mean_distance(self):
        # L >> d0 and D = W0/mu exactly: E[D]/d0 = k/(k-1)
        rng = random.Random(1)
        n = 100000
        est = sum(stop_distance(rng, 1e9, 4, 1.0, phase=False) for _ in range(n)) / n
        self.assertAlmostEqual(est, 4 / 3, delta=0.02)

    def test_exceedance_matches_braking_simulation(self):
        # aligned start, s = j*L: P(D > s) equals the closed form
        rng = random.Random(7)
        n = 40000
        for j, s in ((1, 2.0), (4, 1.4), (10, 1.2)):
            L = s / j
            sim = sum(stop_distance(rng, L, 4, 1.0, phase=False) > s for _ in range(n)) / n
            ex = real_exceedance(s, j, 4)
            self.assertAlmostEqual(sim, ex, delta=4 * math.sqrt(ex * (1 - ex) / n) + 1e-4)


if __name__ == "__main__":
    unittest.main()
