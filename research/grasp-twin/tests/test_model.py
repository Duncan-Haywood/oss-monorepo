import math, random, unittest
from grasp_twin.model import *

REAL = Params(math.log(0.5), 0.3, math.log(6), 0.15)


class TestGraspTwin(unittest.TestCase):
    def test_quadratic_matches_numeric_optimum(self):
        for p in (REAL, REAL.replace(Lc=3.0), REAL.replace(s=0.15, r=0.3), REAL.replace(s=0.2, r=0.2)):
            self.assertAlmostEqual(x_star(p), x_star_numeric(p), places=5)

    def test_first_order_condition(self):
        x = x_star(REAL)
        e = 1e-6
        self.assertAlmostEqual((loss(REAL, x + e) - loss(REAL, x - e)) / (2 * e), 0.0, places=6)

    def test_monte_carlo_matches_closed_form(self):
        rng = random.Random(3)
        x = x_star(REAL) - 0.2
        sl, cr = simulate_grasps(REAL, x, 200_000, rng)
        self.assertAlmostEqual(sl, slip(REAL, x), delta=0.003)
        self.assertAlmostEqual(cr, crush(REAL, x), delta=0.003)

    def test_correct_twin_has_zero_regret_and_clean_twin_positive(self):
        self.assertAlmostEqual(regret(REAL, REAL), 0.0, places=12)
        self.assertGreater(regret(REAL, REAL.replace(s=0.2)), 0)
        self.assertGreater(regret(REAL, REAL.replace(s=0.1)), regret(REAL, REAL.replace(s=0.2)))
        # a clean twin squeezes less
        self.assertLess(x_star(REAL.replace(s=0.1)), x_star(REAL))

    def test_bias_regret_is_locally_quadratic(self):
        r1, r2 = regret(REAL, REAL.replace(m=REAL.m + 0.05)), regret(REAL, REAL.replace(m=REAL.m + 0.10))
        self.assertAlmostEqual(r2 / r1, 4.0, delta=0.3)

    def test_width_can_absorb_bias_but_not_for_unknown_bias(self):
        tw = REAL.replace(m=REAL.m + 0.3)
        widths = [0.05 + 0.005 * i for i in range(200)]
        w = min(widths, key=lambda v: regret(REAL, dr_params(tw, v)))
        self.assertLess(regret(REAL, dr_params(tw, w)), 1e-5)
        self.assertGreater(regret(REAL, dr_params(REAL.replace(m=REAL.m - 0.3), w)), 0.01)

    def test_delta_method_regret_large_n(self):
        rng = random.Random(5)
        n = 400
        mean = sum(regret(REAL, fit_plugin(REAL, n, rng)) for _ in range(1500)) / 1500
        self.assertAlmostEqual(mean / regret_delta(REAL, n), 1.0, delta=0.12)


if __name__ == "__main__":
    unittest.main()
