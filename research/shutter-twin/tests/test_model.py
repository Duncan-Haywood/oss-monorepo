import math
import random
import unittest

from shutter_twin.model import Rect, measure, predict, solve, naive_theta, fit_line

K = 0.030 / 480


class T(unittest.TestCase):
    def test_fit_line(self):
        a, b = fit_line([0, 1, 2, 3], [1, 3, 5, 7])
        self.assertAlmostEqual(a, 1.0)
        self.assertAlmostEqual(b, 2.0)

    def test_global_shutter_is_exact(self):
        r = Rect(theta=0.2, u=900.0, w=-400.0)
        t_v, t_h, dr = measure(r, 0.0)
        self.assertAlmostEqual(t_v, math.tan(0.2), places=6)
        self.assertAlmostEqual(t_h, math.tan(0.2), places=3)
        self.assertAlmostEqual(dr, 120 / math.cos(0.2), places=2)

    def test_static_target_unaffected(self):
        r = Rect(theta=0.1)
        self.assertAlmostEqual(measure(r, K)[0], math.tan(0.1), places=6)

    def test_horizontal_speed_shears_vertical_edges_only(self):
        r = Rect(u=1000.0)
        t_v, t_h, dr = measure(r, K)
        self.assertAlmostEqual(t_v, -1000 * K, places=6)
        self.assertAlmostEqual(t_h, 0.0, places=3)

    def test_formulas_match_simulation(self):
        for th, u, w in ((0.0, 500, 0), (0.15, 700, -300), (-0.2, -900, 800), (0.3, 300, 1000)):
            r = Rect(theta=th, u=u, w=w)
            sim, cf = measure(r, K), predict(r, K)
            self.assertAlmostEqual(sim[0], cf[0], places=5)
            self.assertAlmostEqual(sim[1], cf[1], delta=2e-3 * max(1, abs(cf[1])) / 10 + 5e-4)
            self.assertAlmostEqual(sim[2], cf[2], delta=0.05)

    def test_naive_estimator_biased_by_half_the_shear(self):
        r = Rect(u=1000.0)
        t_v, t_h, _ = measure(r, K)
        self.assertAlmostEqual(naive_theta(t_v, t_h), -0.5 * math.atan(1000 * K), places=4)

    def test_noiseless_recovery(self):
        rng = random.Random(1)
        for _ in range(5):
            th, u, w = rng.uniform(-.3, .3), rng.uniform(-900, 900), rng.uniform(-900, 900)
            r = Rect(theta=th, u=u, w=w)
            eth, eu, ew = solve(*predict(r, K), r.hd, K)
            self.assertAlmostEqual(eth, th, places=9)
            self.assertAlmostEqual(eu, u, places=5)
            self.assertAlmostEqual(ew, w, places=5)

    def test_recovery_from_simulated_frame(self):
        r = Rect(theta=0.12, u=650.0, w=-500.0)
        eth, eu, ew = solve(*measure(r, K), r.hd, K)
        self.assertAlmostEqual(eth, 0.12, places=3)
        self.assertAlmostEqual(eu, 650.0, delta=15)
        self.assertAlmostEqual(ew, -500.0, delta=15)


if __name__ == "__main__":
    unittest.main()
