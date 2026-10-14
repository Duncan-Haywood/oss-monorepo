import math
import unittest

from shaper_twin.model import (Tank, shaper, shaped_time, residual, trajectory, bang_bang_residual, V, eps_tolerated, min_time,
                               null_tuned_time, band_design)

D, AMAX = 3.0, 0.5


class T(unittest.TestCase):
    def test_shaper_weights_sum_to_one_and_positive(self):
        for kind in ("zv", "zvd"):
            for z in (0.0, 0.05, 0.2):
                imps = shaper(kind, 3.0, z)
                self.assertAlmostEqual(sum(a for a, _ in imps), 1.0, places=12)
                self.assertTrue(all(a > 0 for a, _ in imps))

    def test_distance_preserved_and_rest_to_rest(self):
        t = Tank()
        T0 = min_time(D, AMAX)
        for kind in ("none", "zv", "zvd"):
            _, _, vc, xc = trajectory(t, D, T0, shaper(kind, t.w))
            self.assertAlmostEqual(vc, 0.0, places=12)
            self.assertAlmostEqual(xc, D, places=10)

    def test_acceleration_cap_respected(self):
        from shaper_twin.model import accel_segments
        T0 = min_time(D, AMAX)
        for kind in ("zv", "zvd"):
            self.assertLessEqual(max(abs(a) for _, a in accel_segments(D, T0, shaper(kind, 3.0))), 4 * D / T0 ** 2 + 1e-12)

    def test_shaped_residual_is_V_times_bang_bang(self):
        T0 = min_time(D, AMAX)
        a0 = 4 * D / T0 ** 2
        for f in (1.0, 0.5, 0.25):
            t = Tank().with_fill(f)
            wm = math.pi
            eps = t.w / wm - 1
            base = bang_bang_residual(t.mu, a0, t.w, T0)
            for kind in ("none", "zv", "zvd"):
                self.assertAlmostEqual(residual(t, D, T0, shaper(kind, wm)), V(kind, eps) * base, places=10)

    def test_perfect_model_zero_residual(self):
        t = Tank()
        T0 = min_time(D, AMAX)
        for kind in ("zv", "zvd"):
            self.assertLess(residual(t, D, T0, shaper(kind, t.w)), 1e-12)

    def test_damped_design_nulls_damped_mode(self):
        t = Tank(zeta=0.05)
        T0 = min_time(D, AMAX)
        for kind in ("zv", "zvd"):
            self.assertLess(residual(t, D, T0, shaper(kind, t.w, 0.05)), 1e-12)
            self.assertGreater(residual(t, D, T0, shaper(kind, t.w, 0.0)), 1e-6)

    def test_eps_tolerated_is_the_boundary(self):
        for kind in ("zv", "zvd"):
            e = eps_tolerated(kind, 0.1)
            self.assertAlmostEqual(V(kind, e), 0.1, places=12)
        self.assertEqual(eps_tolerated("zv", 1.5), math.inf)

    def test_zvd_more_robust_than_zv_but_slower(self):
        t = Tank()
        self.assertLess(V("zvd", 0.05), V("zv", 0.05))
        T0 = min_time(D, AMAX)
        self.assertAlmostEqual(shaped_time(T0, shaper("zvd", math.pi)) - shaped_time(T0, shaper("zv", math.pi)), 1.0, places=12)

    def test_band_design_shaper_beats_null_on_wide_band(self):
        t = Tank()
        grid = [math.pi * (0.88 + 0.004 * i) for i in range(40)]
        fills = (0.1, 0.25, 0.5, 1.0)
        zvd = band_design(t, fills, D, AMAX, 0.01, "zvd", grid)[0]
        nul = band_design(t, fills, D, AMAX, 0.01, "null", grid)[0]
        self.assertLess(zvd, nul)


if __name__ == "__main__":
    unittest.main()
