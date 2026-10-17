import math, random, unittest
from noisy_referee import *

RATES = ((0.1, 0.2), (0.3, 0.3), (0.05, 0.4), (0.0, 0.25))


class T(unittest.TestCase):
    def test_surrogate_unbiased_for_true_loss(self):
        for e0, e1 in RATES:
            for rule in ("brier", "log"):
                for r in (0.1, 0.5, 0.83):
                    for y in (0, 1):
                        pt1 = (1 - e1) if y == 1 else e0
                        m = pt1 * surrogate(r, 1, e0, e1, rule) + (1 - pt1) * surrogate(r, 0, e0, e1, rule)
                        self.assertAlmostEqual(m, loss(r, y, rule), 10)

    def test_raw_elicits_noisy_prob(self):
        e0, e1, p = 0.1, 0.2, 0.4
        q = noisy_prob(p, e0, e1)
        for rule in ("brier", "log"):
            grid = [i / 1000 for i in range(1, 1000)]
            best = min(grid, key=lambda r: expected_raw(r, p, e0, e1, rule))
            self.assertAlmostEqual(best, q, 3)

    def test_raw_brier_excess_is_gamma_squared(self):
        e0, e1, p = 0.1, 0.2, 0.4
        g = 1 - e0 - e1
        q = noisy_prob(p, e0, e1)
        for r in (0.2, 0.5, 0.9):
            ex = expected_raw(r, p, e0, e1) - expected_raw(q, p, e0, e1)
            self.assertAlmostEqual(ex, (r - q) ** 2, 12)
            self.assertAlmostEqual((r - q) ** 2, g ** 2 * (((r - e0) / g) - p) ** 2, 12)

    def test_surrogate_proper_with_true_rates(self):
        for e0, e1 in RATES:
            for p in (0.2, 0.6):
                grid = [i / 1000 for i in range(0, 1001)]
                best = min(grid, key=lambda r: expected_surrogate(r, p, e0, e1, e0, e1))
                self.assertAlmostEqual(best, p, 3)

    def test_misspecified_optimum_matches_closed_form(self):
        e0, e1, eh0, eh1, p = 0.1, 0.2, 0.2, 0.1, 0.5
        grid = [i / 2000 for i in range(0, 2001)]
        best = min(grid, key=lambda r: expected_surrogate(r, p, e0, e1, eh0, eh1))
        self.assertAlmostEqual(best, best_report_surrogate(p, e0, e1, eh0, eh1), 3)

    def test_noise_blind_surrogate_is_raw(self):
        self.assertAlmostEqual(best_report_surrogate(0.3, 0.1, 0.2, 0, 0), noisy_prob(0.3, 0.1, 0.2), 12)

    def test_moments_mean_matches_clean(self):
        m0, _ = diff_moments(0.2, 0.6, 0.4, 0.1, 0.2, noisy=False)
        m1, _ = diff_moments(0.2, 0.6, 0.4, 0.1, 0.2, noisy=True)
        self.assertAlmostEqual(m0, m1, 12)

    def test_variance_matches_simulation(self):
        rng = random.Random(1)
        pi, e0, e1, r1, r2 = 0.4, 0.1, 0.2, 0.2, 0.6
        xs = []
        for _ in range(200000):
            y = rng.random() < pi
            yt = (rng.random() > e1) if y else (rng.random() < e0)
            xs.append(surrogate(r1, int(yt), e0, e1) - surrogate(r2, int(yt), e0, e1))
        mu = sum(xs) / len(xs)
        var = sum((x - mu) ** 2 for x in xs) / len(xs)
        self.assertLess(abs(var / diff_moments(r1, r2, pi, e0, e1)[1] - 1), 0.02)

    def test_no_noise_no_inflation(self):
        self.assertAlmostEqual(sample_size_ratio(0.2, 0.6, 0.4, 0, 0), 1.0, 12)
        self.assertGreater(sample_size_ratio(0.2, 0.6, 0.4, 0.2, 0.2), 1.0)

    def test_reversal_exists(self):
        A = [(0.05, 0.5), (0.95, 0.5)]
        B = [(0.3, 0.5), (0.7, 0.5)]
        self.assertLess(raw_truthful_score(A, 0, 0), raw_truthful_score(B, 0, 0))
        t = reversal_eta(A, B)
        self.assertTrue(0 < t < 0.3)
        self.assertGreater(raw_truthful_score(A, 0.3, 0.3), raw_truthful_score(B, 0.3, 0.3))

    def test_misspec_first_order(self):
        got, pred = misspec_excess_mc(0.1, 0.2, 400, 400)
        self.assertLess(abs(got / pred - 1), 0.1)

    def test_payment_range_grows(self):
        lo0, hi0 = payment_range(0, 0)
        lo, hi = payment_range(0.3, 0.3)
        self.assertAlmostEqual(hi0 - lo0, 1.0, 9)
        self.assertGreater(hi - lo, 2.0)


if __name__ == "__main__":
    unittest.main()
