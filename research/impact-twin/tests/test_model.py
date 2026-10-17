import math
import unittest

from impact_twin.model import (G, zeno_time, impact_time, last_time_above, settle_error_factor, simulate, e_eff,
                               last_above, v1)


def exact_height(t, e, h0=1.0, g=G):
    """Event-driven truth by stepping through bounces."""
    tt = math.sqrt(2 * h0 / g)
    if t <= tt:
        return h0 - 0.5 * g * t * t
    if t >= zeno_time(e, h0, g):
        return 0.0
    v = v1(h0, g) * e
    t -= tt
    while True:
        fl = 2 * v / g
        if t <= fl:
            return v * t - 0.5 * g * t * t
        t -= fl
        v *= e


class T(unittest.TestCase):
    def test_zeno_time_is_sum_of_flights(self):
        e, h0 = 0.8, 1.3
        tot = math.sqrt(2 * h0 / G) + sum(2 * v1(h0) * e ** k / G for k in range(1, 400))
        self.assertAlmostEqual(tot, zeno_time(e, h0), places=9)

    def test_impact_time_limit_is_zeno(self):
        self.assertAlmostEqual(impact_time(1, 0.7), math.sqrt(2 / G), places=12)
        self.assertAlmostEqual(impact_time(2000, 0.7), zeno_time(0.7), places=9)

    def test_last_time_above_matches_height(self):
        for e in (0.5, 0.9):
            t = last_time_above(0.01, e)
            self.assertAlmostEqual(exact_height(t, e), 0.01, places=9)
            self.assertLess(max(exact_height(t + k * 1e-3, e) for k in range(1, 500)), 0.01 + 1e-12)

    def test_last_time_above_before_first_rebound_matters(self):
        self.assertAlmostEqual(last_time_above(0.5, 0.5), math.sqrt(2 * 0.5 / G), places=12)

    def test_amplification_factor_is_log_derivative(self):
        e, h = 0.9, 1e-6
        d = (math.log(zeno_time(e + h)) - math.log(zeno_time(e - h))) / (2 * h)
        self.assertAlmostEqual(d, settle_error_factor(e), places=5)

    def test_twin_converges_to_truth_as_dt_shrinks(self):
        errs = [abs(e_eff(0.9, dt, "clamp") - 0.9) for dt in (1e-2, 1e-3, 1e-4)]
        self.assertGreater(errs[0], 5 * errs[1])
        self.assertGreater(errs[1], 0.0)

    def test_clamp_twin_is_too_dissipative_at_coarse_step(self):
        self.assertLess(e_eff(0.9, 1e-2, "clamp"), 0.89)

    def test_fixed_step_twin_settles_early_or_late_by_scheme(self):
        e, d = 0.9, 0.01
        ex = last_time_above(d, e)
        Tm = ex * 1.3 + 1
        clamp = last_above(simulate(e, 1e-2, "clamp", T=Tm)[0], 1e-2, d)
        mirror = last_above(simulate(e, 1e-2, "mirror", T=Tm)[0], 1e-2, d)
        self.assertLess(clamp, 0.9 * ex)
        self.assertGreater(mirror, ex)

    def test_impact_count_is_resolution_artifact(self):
        a = simulate(0.9, 1e-2, "clamp", T=20.0)[1]
        b = simulate(0.9, 1e-3, "clamp", T=20.0)[1]
        self.assertGreater(b, 3 * a)

    def test_unknown_scheme_raises(self):
        with self.assertRaises(ValueError):
            simulate(0.5, 1e-2, "bogus", T=5.0)


if __name__ == "__main__":
    unittest.main()
