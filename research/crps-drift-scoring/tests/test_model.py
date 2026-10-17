import math, random, unittest
from crps_drift_scoring import *


class T(unittest.TestCase):
    def test_threshold_integral(self):
        for m, s, y in [(0, 1, 0.3), (1, 0.5, -0.4), (0, 2, 3.0), (-1, 0.3, 0.5)]:
            self.assertAlmostEqual(crps_gauss(m, s, y), crps_threshold_integral(m, s, y), 5)

    def test_energy_form(self):
        m, s = 0.5, 1.7
        sample = [m + s * Phi_inv((i + 0.5) / 3000) for i in range(3000)]
        for y in (-2.0, 0.0, 1.3):
            self.assertAlmostEqual(crps_energy(sample, y), crps_gauss(m, s, y), 3)

    def test_expected_crps_matches_quadrature(self):
        for m, s, mu, sg in [(0, 1, 0, 1), (0.4, 0.6, 0, 1), (-1, 2, 0.5, 0.7)]:
            n, a, b = 20000, mu - 12 * sg, mu + 12 * sg
            h = (b - a) / n
            tot = sum(phi((a + (k + .5) * h - mu) / sg) / sg * crps_gauss(m, s, a + (k + .5) * h) for k in range(n)) * h
            self.assertAlmostEqual(exp_crps(m, s, mu, sg), tot, 6)

    def test_log_excess_is_kl_quadrature(self):
        m, s, mu, sg = 0.3, 0.5, 0, 1
        n, a, b = 20000, -12.0, 12.0
        h = (b - a) / n
        tot = sum(phi(a + (k + .5) * h) * (log_score(m, s, a + (k + .5) * h) - log_score(mu, sg, a + (k + .5) * h))
                  for k in range(n)) * h
        self.assertAlmostEqual(excess_log(m, s, mu, sg), tot, 6)

    def test_propriety(self):
        rng = random.Random(0)
        self.assertAlmostEqual(excess_crps(0, 1, 0, 1), 0, 12)
        for _ in range(300):
            m, s = rng.uniform(-2, 2), rng.uniform(0.05, 4)
            self.assertGreater(excess_crps(m, s, 0, 1), 0)

    def test_bounded_overconfidence(self):
        self.assertAlmostEqual(excess_crps(0, 1e-9, 0, 1), crps_scale_floor(1), 6)
        self.assertLess(excess_crps(0, 1e-3, 0, 1), crps_scale_floor(1))
        self.assertGreater(excess_log(0, 1e-3, 0, 1), 1e5)

    def test_local_curvatures(self):
        d = 1e-3
        self.assertAlmostEqual(excess_crps(d, 1, 0, 1) / d ** 2, mean_curvature_crps(1), 3)
        self.assertAlmostEqual(excess_crps(0, 1 + d, 0, 1) / d ** 2, scale_curvature_crps(1), 3)

    def test_slopes(self):
        rng = random.Random(1)
        big = 0
        for _ in range(500):
            m, s, y = rng.uniform(-1, 1), rng.uniform(0.05, 2), rng.uniform(-5, 5)
            self.assertLessEqual(abs(crps_slope(m, s, y)), 1)
            h = 1e-6
            num = (crps_gauss(m, s, y + h) - crps_gauss(m, s, y - h)) / (2 * h)
            self.assertAlmostEqual(num, crps_slope(m, s, y), 5)
            big += abs(log_slope(m, s, y)) > 1
        self.assertGreater(big, 100)

    def test_plugin_law(self):
        n, reps, rng = 20, 6000, random.Random(2)
        tot = 0.0
        for _ in range(reps):
            xs = [rng.gauss(0, 1) for _ in range(n)]
            mh = sum(xs) / n
            sh = math.sqrt(sum((x - mh) ** 2 for x in xs) / n)
            tot += excess_crps(mh, sh, 0, 1)
        self.assertAlmostEqual(tot / reps / plugin_excess_crps(n), 1.0, delta=0.12)


if __name__ == "__main__":
    unittest.main()
