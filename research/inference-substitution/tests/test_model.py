import unittest, math, random
from inference_substitution import *

P = zipf(20)
Q = tilt(P, 0.5)
GR = p_grid(12)


class T(unittest.TestCase):
    def test_small_p_kl_is_half_p2_chi2(self):
        p = 0.02
        self.assertAlmostEqual(kl(mix(P, Q, p), P) / (0.5 * p * p * chi2(Q, P)), 1.0, delta=0.03)

    def test_factor_has_mean_one_under_null(self):
        for p in (0.1, 0.7):
            m = sum(x * (1 - p + p * q / x) for x, q in zip(P, Q))
            self.assertAlmostEqual(m, 1.0, places=12)

    def test_false_alarm_below_alpha(self):
        r = false_alarm_rate(P, Q, 1.0, 0.1, 1500, 300, random.Random(1), GR)
        self.assertLessEqual(r, 0.1)

    def test_detects_full_substitution_fast(self):
        rng = random.Random(2)
        ts = [detect_time(P, Q, 1.0, 1.0, 0.05, 5000, rng, GR) for _ in range(20)]
        self.assertTrue(all(t is not None for t in ts))
        self.assertLess(sum(ts) / len(ts), 100)

    def test_delay_matches_theory(self):
        rng = random.Random(3)
        ts = [detect_time(P, Q, 0.4, 1.0, 0.05, 20000, rng, GR) for _ in range(60)]
        ts = [t for t in ts if t is not None]
        th = delay_theory(P, Q, 0.4, 1.0, 0.05, len(GR))
        self.assertLess(abs(sum(ts) / len(ts) / th - 1), 0.5)

    def test_check_rate_scales_delay(self):
        self.assertAlmostEqual(delay_theory(P, Q, 0.3, 0.1, 0.05, 12) / delay_theory(P, Q, 0.3, 1.0, 0.05, 12), 10.0, places=9)

    def test_sqrt_law(self):
        c2 = chi2(Q, P)
        self.assertAlmostEqual(savings_star(c2, 1, .05, 12, 40000) / savings_star(c2, 1, .05, 12, 10000), 2.0, places=9)

    def test_p_star_equates_delay_and_horizon(self):
        c2 = chi2(Q, P)
        ps = p_star(c2, 1.0, 0.05, 12, 10000)
        self.assertAlmostEqual(2 * math.log(12 / .05) / (ps * ps * c2), 10000, delta=1e-6)

    def test_audit_rate_inverts_savings(self):
        c2 = chi2(Q, P)
        f = audit_rate_for_budget(c2, .05, 12, 10000, 1.0, 50.0)
        self.assertAlmostEqual(savings_star(c2, f, .05, 12, 10000), 50.0, places=9)

    def test_f_star_minimises_cost(self):
        c2 = chi2(Q, P)
        args = (c2, .05, 12, 10000, 1.0, 20.0, 0.05)
        fs = f_star(*args)
        grid = [i / 1000 for i in range(1, 1001)]
        best = min(grid, key=lambda f: total_cost(f, *args))
        self.assertAlmostEqual(fs, best, delta=0.002)


if __name__ == "__main__":
    unittest.main()
