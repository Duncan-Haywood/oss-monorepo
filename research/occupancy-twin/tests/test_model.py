import math, random, unittest
from occupancy_twin import *

a, b = llr(0.8, 0.05)


class T(unittest.TestCase):
    def test_correct_twin_has_unit_exponent_and_bound(self):
        self.assertAlmostEqual(theta_star(0.05, a, b), 1.0, places=9)
        A = threshold(1e-3)
        lo, hi = error_bounds(0.05, a, b, A)
        self.assertLessEqual(hi, 1.01e-3)
        self.assertLess(exact_error(0.05, a, b, A)[0], 1e-3)

    def test_exponent_solves_its_equation_and_falls_with_mismatch(self):
        ts = []
        for p in (0.05, 0.1, 0.2, 0.3):
            t = theta_star(p, a, b)
            self.assertAlmostEqual(p * math.exp(t * a) + (1 - p) * math.exp(-t * b), 1.0, places=9)
            ts.append(t)
        self.assertTrue(all(x > y for x, y in zip(ts, ts[1:])))
        self.assertEqual(theta_star(0.5, a, b), 0.0)  # positive drift: no exponent

    def test_exact_lies_in_rigorous_sandwich_and_resolves(self):
        for p in (0.05, 0.1, 0.15, 0.25):
            for A in (2.0, 4.0, 6.9):
                w, et, left = exact_error(p, a, b, A)
                lo, hi = error_bounds(p, a, b, A)
                self.assertLess(left, 1e-12)
                self.assertLessEqual(lo - 1e-12, w)
                self.assertLessEqual(w, hi + 1e-12)

    def test_exact_matches_monte_carlo(self):
        rng = random.Random(1)
        w = exact_error(0.15, a, b, 3.0)[0]
        self.assertAlmostEqual(mc_error(0.15, a, b, 3.0, rng, 40000), w, delta=0.01)

    def test_occupied_reflection(self):
        # missed detection with the twin overestimating the hit rate equals the reflected free-cell walk
        p1 = 0.6
        pr, ar, br = reflect(p1, a, b)
        w = exact_error(pr, ar, br, 3.0)[0]
        rng = random.Random(2)
        s_wrong = 0
        for _ in range(30000):
            s = 0.0
            while -3.0 < s < 3.0:
                s += a if rng.random() < p1 else -b
            s_wrong += s <= -3.0
        self.assertAlmostEqual(s_wrong / 30000, w, delta=0.012)

    def test_tempering_restores_target_bound(self):
        eps = 1e-3
        for p in (0.1, 0.15, 0.2):
            A = tempered_threshold(p, a, b, eps)
            self.assertLessEqual(error_bounds(p, a, b, A)[1], eps * math.exp(theta_star(p, a, b) * b) * 1.001)
            self.assertLess(exact_error(p, a, b, A)[0], eps)

    def test_delta_method_sd_matches_resampling(self):
        rng = random.Random(3)
        n, p = 400, 0.15
        ts = [plugin_theta(sum(rng.random() < p for _ in range(n)) / n, a, b) for _ in range(4000)]
        m = sum(ts) / len(ts)
        sd = math.sqrt(sum((x - m) ** 2 for x in ts) / len(ts))
        self.assertAlmostEqual(sd / theta_delta_sd(p, a, b, n), 1.0, delta=0.1)


if __name__ == "__main__":
    unittest.main()
