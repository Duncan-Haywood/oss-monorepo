import math, random, unittest
from robofab_tolstack.model import (fits, yield_mc, yield_closed, clearance_worst, clearance_rss,
                                    required_clearance, sample_fit)


class T(unittest.TestCase):
    def test_fits_exact_cases(self):
        self.assertTrue(fits((0, 0), (0.3, 0), 0.1, 0.2))      # distance equals r1 + r2
        self.assertFalse(fits((0, 0), (0.31, 0), 0.1, 0.2))
        self.assertFalse(fits((0, 0), (0, 0), -0.1, 0.5))      # an interfering pin never fits

    def test_closed_form_matches_monte_carlo(self):
        for c, sp in ((0.2, 0.05), (0.3, 0.1), (0.5, 0.1)):
            self.assertAlmostEqual(yield_mc(c, sp, 0.0, n=40000, seed=3), yield_closed(c, sp), delta=0.01)

    def test_yield_monotone_in_clearance(self):
        ys = [yield_mc(c, 0.1, 0.05, n=5000) for c in (0.1, 0.3, 0.5, 0.8, 1.2)]
        self.assertEqual(ys, sorted(ys))

    def test_size_error_costs_yield(self):
        self.assertGreater(yield_mc(0.5, 0.1, 0.0, n=20000), yield_mc(0.5, 0.1, 0.15, n=20000))

    def test_negative_bias_costs_yield(self):
        self.assertGreater(yield_mc(0.5, 0.1, 0.05, 0.0, n=20000), yield_mc(0.5, 0.1, 0.05, -0.2, n=20000))

    def test_worst_case_always_fits_within_bounds(self):
        # Corner cases of the +-3 sd box: every centre error and diameter at its extreme.
        sp, sd, k = 0.1, 0.05, 3.0
        c = clearance_worst(sp, sd, k)
        rng = random.Random(1)
        for _ in range(2000):
            def pt():
                a = rng.uniform(0, 2 * math.pi)
                return (k * sp * math.cos(a), k * sp * math.sin(a))  # inside the box bound (disc of radius k*sp)
            d1 = (pt()[0] - pt()[0], pt()[1] - pt()[1])
            d2 = (pt()[0] - pt()[0], pt()[1] - pt()[1])
            r = (c - 2 * k * sd) / 2
            self.assertTrue(fits(d1, d2, r, r))

    def test_rules_ordered(self):
        for sp, sd in ((0.05, 0.05), (0.1, 0.1), (0.2, 0.05)):
            self.assertGreater(clearance_worst(sp, sd), clearance_rss(sp, sd))

    def test_required_clearance_hits_target(self):
        c = required_clearance(0.99, 0.1, 0.05, n=8000)
        self.assertGreaterEqual(yield_mc(c, 0.1, 0.05, n=8000), 0.99)
        self.assertLess(yield_mc(c - 0.01, 0.1, 0.05, n=8000), 0.99 + 0.003)

    def test_required_clearance_matches_closed_form(self):
        # sd=0: c = sp*sqrt(-8 ln(1-target))
        sp, t = 0.1, 0.99
        self.assertAlmostEqual(required_clearance(t, sp, 0.0, n=40000, seed=5), sp * math.sqrt(-8 * math.log(1 - t)), delta=0.03)


if __name__ == "__main__":
    unittest.main()
