import math, random, unittest
from itertools import combinations
from compute_shirking import *


class T(unittest.TestCase):
    def test_powerlaw_r1_closed_form(self):
        s, b = 0.1, 0.5
        self.assertAlmostEqual(hide_fraction_powerlaw(s, b, 1.0, p_detect=0.5), 1 - math.exp(-z_of(0.05) * s / b), places=12)

    def test_shift_at_hidden_fraction_equals_noise_band(self):
        s, b, r = 0.07, 0.4, 0.3
        f = hide_fraction_powerlaw(s, b, r)
        self.assertAlmostEqual(log_shift_powerlaw(f, b, r), s * z_of(0.05), places=10)
        self.assertAlmostEqual(detect_prob(log_shift_powerlaw(f, b, r), s), 0.5, places=10)

    def test_curve_inversion_matches_closed_form(self):
        b, r, T0 = 0.5, 0.25, 500.0
        A = r / (1 - r)                      # Linf = 1, A T^-b = r/(1-r)*... choose so share is r
        Linf = 1.0
        A = r / (1 - r) * Linf * T0 ** b
        loss = lambda t: Linf + A * t ** (-b)
        self.assertAlmostEqual(A * T0 ** (-b) / loss(T0), r, places=12)
        self.assertAlmostEqual(hide_fraction_curve(loss, T0, 0.06), hide_fraction_powerlaw(0.06, b, r), places=6)

    def test_hidden_fraction_monotone(self):
        self.assertLess(hide_fraction_powerlaw(0.05, 0.5, 1.0), hide_fraction_powerlaw(0.05, 0.5, 0.2))
        self.assertLess(hide_fraction_powerlaw(0.05, 0.5, 0.5), hide_fraction_powerlaw(0.10, 0.5, 0.5))

    def test_small_noise_law(self):
        s, b, r = 0.002, 0.5, 0.5
        self.assertAlmostEqual(hide_fraction_powerlaw(s, b, r) / (z_of(0.05) * s / (b * r)), 1.0, delta=0.01)

    def test_eval_size_hits_cap_and_floor(self):
        m = eval_size_for_cap(0.05, 0.5, 0.5, 0.0, 5)
        sig = sigma_total(m, 0.0, 5)
        self.assertAlmostEqual(hide_fraction_powerlaw(sig, 0.5, 0.5), 0.05, places=9)
        self.assertIsNone(eval_size_for_cap(0.05, 0.5, 0.5, 0.05, 5))          # below the seed floor
        self.assertGreater(seed_floor(0.5, 0.5, 0.05, 5), 0.05)

    def test_sigma_total(self):
        self.assertAlmostEqual(sigma_total(200, 0.1, 4), math.sqrt((0.01 + 0.01) * 1.25))
        self.assertAlmostEqual(sigma_total(math.inf, 0.1), 0.1)

    def test_spot_detect_matches_enumeration(self):
        Tn, s, n = 8, 3, 3
        skipped = set(range(s))
        hit = sum(1 for c in combinations(range(Tn), n) if skipped & set(c)) / len(list(combinations(range(Tn), n)))
        self.assertAlmostEqual(spot_detect(s / Tn, Tn, n), hit, places=12)
        self.assertEqual(spot_detect(0.0, 100, 5), 0.0)

    def test_audit_equivalent_roundtrip(self):
        n = 7
        f = 1 - 0.5 ** (1 / n)
        self.assertAlmostEqual(audit_equivalent(f), n, places=9)

    def test_hybrid_bounds(self):
        sig = 0.05
        h = hybrid_hide(1000, 20, 0.5, 0.3, sig)
        self.assertAlmostEqual(hybrid_detect(h, 1000, 20, 0.5, 0.3, sig), 0.5, delta=0.01)
        self.assertLessEqual(h, hide_fraction_powerlaw(sig, 0.5, 0.3))
        self.assertLessEqual(h, 1 - 0.5 ** (1 / 20) + 0.01)

    def test_quadratic_gd_matches_direct_iteration(self):
        gd = QuadraticGD(6, 1.5, 0.7)
        rng = random.Random(3)
        w0 = gd.sample_w0(rng)
        w = list(w0)
        for _ in range(9):
            w = [wi - gd.eta * l * wi for wi, l in zip(w, gd.lam)]
        self.assertAlmostEqual(gd.run_loss(w0, 9), sum(l * wi * wi for l, wi in zip(gd.lam, w)), places=12)

    def test_seed_sd_matches_monte_carlo(self):
        gd = QuadraticGD(50, 1.5, 1.0)
        rng = random.Random(4)
        xs = [gd.run_loss(gd.sample_w0(rng), 20) for _ in range(20000)]
        mu = sum(xs) / len(xs)
        sd = math.sqrt(sum((x - mu) ** 2 for x in xs) / len(xs))
        self.assertAlmostEqual(mu, gd.mean_loss(20), delta=0.02 * gd.mean_loss(20))
        self.assertAlmostEqual(sd / mu, gd.seed_rel_sd(20), delta=0.03)

    def test_simulation_matches_prediction(self):
        gd = QuadraticGD(400, 1.5)
        rng = random.Random(9)
        Tn, m, k = 300, 2000, 5
        sig = sigma_total(m, gd.seed_rel_sd(Tn), k)
        fh = hide_fraction_curve(gd.mean_loss, Tn, sig)
        self.assertAlmostEqual(simulate_test(gd, Tn, 0.0, m, k, 0.05, 3000, rng), 0.05, delta=0.02)
        sh = math.log(gd.mean_loss((1 - fh) * Tn) / gd.mean_loss(Tn))
        self.assertAlmostEqual(simulate_test(gd, Tn, fh, m, k, 0.05, 3000, rng), detect_prob(sh, sig), delta=0.04)

    def test_best_skip_and_stake(self):
        p = lambda f: detect_prob(log_shift_powerlaw(f, 0.5, 0.2), 0.05)
        f0, v0 = best_skip(1.0, 100.0, p)
        self.assertEqual(f0, 0.0)
        f1, v1 = best_skip(1.0, 0.5, p)
        self.assertGreater(v1, 0.0)


if __name__ == "__main__":
    unittest.main()
