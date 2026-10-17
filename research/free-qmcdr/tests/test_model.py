import math, random, unittest
from fractions import Fraction
from free_qmcdr import *
from free_qmcdr.model import _cdf, _cdf_integral


class M(unittest.TestCase):
    def test_irwin_hall_known_values(self):
        one = Fraction(1)
        self.assertEqual(_cdf([one], Fraction(1, 4)), Fraction(1, 4))
        self.assertEqual(_cdf([one, one], one), Fraction(1, 2))          # symmetric sum of two uniforms
        self.assertEqual(_cdf([one] * 3, Fraction(3, 2)), Fraction(1, 2))
        self.assertEqual(_cdf([one] * 2, Fraction(2)), Fraction(1))
        self.assertEqual(_cdf_integral([one], Fraction(1)), Fraction(1, 2))  # integral of x on [0,1]

    def test_kink_mean_matches_known_cases(self):
        # d=1, w=1, t=1/2: E[(u-1/2)_+] = 1/8
        self.assertAlmostEqual(kink(1).mean, 0.125, places=12)
        # d=2, t=1: E[(u1+u2-1)_+] = 1/6
        self.assertAlmostEqual(kink(2).mean, 1 / 6, places=12)

    def test_exact_means_match_brute_force(self):
        rng = random.Random(1)
        for g in (smooth(4), kink(4, decay=True), jump(4, decay=True), jump(6)):
            pts = sample("mc", 200000, g.d, rng)
            self.assertAlmostEqual(g.estimate(pts), g.mean, delta=0.012, msg=g.name)

    def test_samplers_in_unit_cube_and_right_shape(self):
        rng = random.Random(2)
        for kind in ("mc", "lhs", "halton", "rd"):
            pts = sample(kind, 64, 5, rng)
            self.assertEqual((len(pts), len(pts[0])), (64, 5))
            self.assertTrue(all(0.0 <= x < 1.0 for p in pts for x in p), kind)

    def test_lhs_one_point_per_stratum_in_every_coordinate(self):
        pts = sample("lhs", 50, 4, random.Random(3))
        for j in range(4):
            self.assertEqual(sorted(int(p[j] * 50) for p in pts), list(range(50)))

    def test_randomised_samplers_are_unbiased(self):
        g = jump(3)
        for kind in ("lhs", "halton", "rd"):
            rng = random.Random(4)
            ests = [g.estimate(sample(kind, 32, 3, rng)) for _ in range(3000)]
            se = math.sqrt(sum((e - g.mean) ** 2 for e in ests) / len(ests) / len(ests))
            self.assertLess(abs(sum(ests) / len(ests) - g.mean), 4 * se + 1e-9, kind)

    def test_low_discrepancy_beats_mc_on_smooth_integrand(self):
        g = smooth(3)
        ns = (64, 256)
        mc = rmse_curve(g, "mc", ns, 60, "t")
        for kind in ("lhs", "halton", "rd"):
            r = rmse_curve(g, kind, ns, 60, "t")
            self.assertLess(r[1], mc[1], kind)
        self.assertLess(slope(ns, rmse_curve(g, "rd", ns, 60, "t")), slope(ns, mc) - 0.3)

    def test_mc_slope_is_minus_half(self):
        g = jump(3)
        ns = (64, 256, 1024)
        self.assertAlmostEqual(slope(ns, rmse_curve(g, "mc", ns, 300, "s")), -0.5, delta=0.1)

    def test_slope_recovers_power_law(self):
        ns = (10, 100, 1000)
        self.assertAlmostEqual(slope(ns, [n ** -0.75 for n in ns]), -0.75, places=9)

    def test_halton_dimension_guard(self):
        with self.assertRaises(ValueError):
            sample("halton", 4, 13, random.Random(0))


if __name__ == "__main__":
    unittest.main()
