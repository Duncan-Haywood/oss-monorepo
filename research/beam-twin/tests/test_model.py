import math, random, unittest
from beam_twin import *


class T(unittest.TestCase):
    def test_binom_miss_special_cases(self):
        self.assertEqual(binom_miss(0, 0.5, 1), 1.0)
        self.assertAlmostEqual(binom_miss(5, 0.3, 1), 0.7 ** 5, places=14)
        self.assertAlmostEqual(binom_miss(4, 0.5, 2), (1 + 4) / 16, places=14)
        self.assertEqual(binom_miss(3, 1.0, 3), 0.0)

    def test_scan_miss_limits(self):
        sc = Scene()
        self.assertAlmostEqual(scan_miss(10.0, 1.0, sc), 0.0)           # many beams, none dropped
        self.assertAlmostEqual(scan_miss(10.0, 0.9, sc, s=0.4), 0.4, places=12)  # fade floor
        self.assertAlmostEqual(scan_miss(1e6, 0.9, sc), 1.0, places=3)  # far: expected beams << 1

    def test_beam_count_mean_is_lambda(self):
        # floor + Bernoulli(frac) has mean lam: one return with q=1 and m=1 misses with prob 1 - lam for lam < 1
        sc = Scene(w=0.5, delta=0.0035)
        r = 200.0
        lam = sc.w / (r * sc.delta)
        self.assertLess(lam, 1)
        self.assertAlmostEqual(scan_miss(r, 1.0, sc), 1 - lam, places=12)

    def test_monotone_in_speed_and_safe_speed(self):
        sc = Scene(R0=30)
        ms = [miss_probability(v, 0.6, sc, 0.3) for v in (4, 6, 8, 10, 12)]
        self.assertEqual(ms, sorted(ms))
        v = safe_speed(1e-3, 0.6, sc, 0.3)
        self.assertLessEqual(miss_probability(v, 0.6, sc, 0.3), 1e-3)
        self.assertGreater(miss_probability(v + 0.05, 0.6, sc, 0.3), 1e-3)

    def test_fade_floor_is_lower_bound(self):
        sc = Scene(R0=30)
        for v in (8, 10, 12):
            self.assertGreaterEqual(miss_probability(v, 0.9, sc, 0.3), fade_floor(v, 0.3, sc) * (1 - 1e-12))

    def test_powerlaw_is_a_rough_guide_when_dropout_is_heavy(self):
        sc = Scene(R0=150)
        for v in (20, 26):
            self.assertAlmostEqual(math.log(powerlaw_miss(v, 0.3, sc)), math.log(miss_probability(v, 0.3, sc)), delta=0.3)

    def test_total_fade_never_detects(self):
        self.assertEqual(miss_probability(0.5, 0.9, Scene(R0=30), 1.0), 1.0)

    def test_closed_form_matches_beam_simulation(self):
        rng = random.Random(3)
        runs = 60000
        for v, q, s, m in ((11, 0.9, 0.3, 1), (11, 0.6, 0.0, 1), (12, 0.9, 0.3, 2)):
            sc = Scene(R0=30, m=m)
            ex = miss_probability(v, q, sc, s)
            sim = simulate_miss(rng, v, q, sc, runs, s)
            self.assertAlmostEqual(sim, ex, delta=4 * math.sqrt(ex * (1 - ex) / runs) + 1e-4)

    def test_twin_matched_on_return_rate_is_optimistic_near_the_limit(self):
        sc = Scene(R0=30)
        q, s = 0.9, 0.5
        vt = safe_speed(1e-3, (1 - s) * q, sc)
        self.assertGreater(miss_probability(vt, q, sc, s), 1e-3)


if __name__ == "__main__":
    unittest.main()
