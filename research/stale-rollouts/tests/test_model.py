import math, random, unittest
from stale_rollouts import *


class T(unittest.TestCase):
    def test_second_moment_and_ess(self):
        r = random.Random(0)
        m, m2, *_ = simulate(0.5, 1e9, 400000, r)
        self.assertAlmostEqual(m, 1.0, delta=0.01)
        self.assertAlmostEqual(m2, second_moment(0.5), delta=0.02)
        self.assertAlmostEqual(ess_fraction(1.0), math.exp(-1))

    def test_trunc_mass_matches_simulation(self):
        r = random.Random(1)
        _, _, _, _, mc, _ = simulate(1.0, 3.0, 400000, r)
        self.assertAlmostEqual(mc, trunc_mean_weight(1.0, 3.0), delta=0.005)

    def test_trunc_moments_match_simulation(self):
        r = random.Random(2)
        n = 600000
        d, c = 1.0, 3.0
        m1 = m2 = 0.0
        for _ in range(n):
            z = r.gauss(0, 1); w = min(math.exp(d * z - 0.5 * d * d), c)
            m1 += w * z; m2 += (w * z) ** 2
        cm, cs = trunc_moments(d, c)
        self.assertAlmostEqual(m1 / n, cm, delta=0.01)
        self.assertAlmostEqual(m2 / n, cs, delta=0.05)

    def test_no_truncation_recovers_plain(self):
        m, s2 = trunc_moments(0.8, 1e12)
        pm, ps = plain_moments(0.8)
        self.assertAlmostEqual(m, pm, places=8)
        self.assertAlmostEqual(s2, ps, places=6)

    def test_truncation_biases_down_and_reduces_variance(self):
        d = 1.5
        m, s2 = trunc_moments(d, 4.0)
        self.assertLess(m, d)
        self.assertLess(s2 - m * m, plain_moments(d)[1] - d * d)
        self.assertGreater(trunc_mass_lost(d, 4.0), 0.0)

    def test_best_cap_beats_plain_when_stale(self):
        c, e = best_cap(2.0, 50)
        self.assertLess(e, mse_plain(2.0, 50))

    def test_window(self):
        self.assertEqual(window(0.5, 0.25), int(math.sqrt(math.log(2)) / 0.25))
        self.assertAlmostEqual(ess_fraction(max_shift(0.3)), 0.3)


if __name__ == "__main__":
    unittest.main()
