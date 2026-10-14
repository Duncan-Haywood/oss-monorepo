import math, random, unittest
from interval_elicitation import *

N = ("normal", 0.0, 1.0)


class T(unittest.TestCase):
    def test_regret_vs_closed_form_normal(self):
        a = 0.1
        for l, u in [(-2.0, 1.5), (-1.0, 2.5), (-1.645, 1.645)]:
            exact = expected_is_normal(l, u, a) - expected_is_normal(-z_upper(a), z_upper(a), a)
            self.assertAlmostEqual(interval_regret(l, u, a, N), exact, 8)
        self.assertAlmostEqual(interval_regret(-z_upper(a), z_upper(a), a, N), 0, 10)

    def test_regret_vs_simulation(self):
        rng = random.Random(3)
        d = ("lognormal", 0.0, 0.8)
        a = 0.2
        l0, u0 = quantile(a / 2, d), quantile(1 - a / 2, d)
        l, u = 0.5, 3.0
        ys = [math.exp(rng.gauss(0, 0.8)) for _ in range(400000)]
        mc = sum(interval_score(l, u, y, a) - interval_score(l0, u0, y, a) for y in ys) / len(ys)
        self.assertAlmostEqual(mc / interval_regret(l, u, a, d), 1, 1)
        self.assertGreater(interval_regret(l, u, a, d), 0)

    def test_scale_regret(self):
        a = 0.05
        for lam in (0.5, 0.9, 1.1, 2.0):
            z = z_upper(a)
            self.assertAlmostEqual(interval_regret(-lam * z, lam * z, a, N), normal_scale_regret(lam, a), 7)
            self.assertGreater(normal_scale_regret(lam, a), 0)

    def test_cauchy_regret_finite_and_positive(self):
        d = ("cauchy", 0.0, 1.0)
        a = 0.1
        l0, u0 = quantile(a / 2, d), quantile(1 - a / 2, d)
        self.assertAlmostEqual(u0, 1 / math.tan(math.pi * a / 2), 6)
        r = interval_regret(l0 * 0.5, u0 * 0.5, a, d)
        self.assertTrue(0 < r < 1e3)

    def test_hpd_is_level_set_and_optimal(self):
        for d in (N, ("lognormal", 0.0, 1.0)):
            lam = 1 / (0.5 * pdf(quantile(0.5, d), d)) if d == N else 12.0
            l, u = hpd_interval(lam, d)
            self.assertAlmostEqual(pdf(l, d) * lam, 1, 6)
            self.assertAlmostEqual(pdf(u, d) * lam, 1, 6)
            for dl, du in [(0.05, 0), (-0.05, 0), (0, 0.05), (0, -0.05)]:
                self.assertGreater(hpd_expected(l + dl, u + du, lam, d), hpd_expected(l, u, lam, d))

    def test_hpd_shorter_than_equal_tailed_on_skewed(self):
        d = ("lognormal", 0.0, 1.0)
        lam = 1 / pdf(quantile(0.975, d), d) * 3.0
        l, u = hpd_interval(lam, d)
        c = coverage(l, u, d)
        a = 1 - c
        et = quantile(a / 2, d), quantile(1 - a / 2, d)
        self.assertLess(u - l, et[1] - et[0] - 0.05)
        self.assertGreater(hpd_regret(et[0], et[1], lam, d), 0)

    def test_hpd_symmetric_equals_quantile_interval(self):
        a = 0.05
        z = z_upper(a)
        lam = 1 / pdf(z, N)
        l, u = hpd_interval(lam, N)
        self.assertAlmostEqual(u, z, 6)
        self.assertAlmostEqual(l, -z, 6)

    def test_hpd_diff_moments_vs_simulation(self):
        rng = random.Random(5)
        lam = 6.0
        a, b = (-1.0, 1.5), (-0.5, 1.0)
        m, v = hpd_diff_moments(*b, *a, lam, N)
        xs = [hpd_loss(*b, y, lam) - hpd_loss(*a, y, lam) for y in (rng.gauss(0, 1) for _ in range(300000))]
        mm = sum(xs) / len(xs)
        vv = sum((x - mm) ** 2 for x in xs) / len(xs)
        self.assertAlmostEqual(mm, m, 1)
        self.assertAlmostEqual(vv / v, 1, 1)

    def test_bounded_payment(self):
        # H is bounded by width+lam for every y; S grows linearly in the miss distance
        lam = 10.0
        self.assertLessEqual(max(hpd_loss(-1, 1, y, lam) for y in (-1e9, 0, 1e9)), 2 + lam)
        self.assertGreater(interval_score(-1, 1, 1e6, 0.05), 1e6)


if __name__ == "__main__":
    unittest.main()
