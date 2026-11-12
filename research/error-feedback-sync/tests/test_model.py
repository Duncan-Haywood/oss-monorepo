import math, unittest
from error_feedback_sync import *

s, V = 0.5, 0.2


class T(unittest.TestCase):
    def test_full_rate_is_uncompressed(self):
        for N, al in ((1, 0.7), (5, 1.3)):
            self.assertAlmostEqual(ef_var(s, V, al, N, 1.0), uncompressed_var(s, V, al, N), places=12)

    def test_closed_form_matches_moment_system(self):
        for N in (1, 2, 5, 16):
            for r in (0.5, 0.25, 0.1):
                for al in (0.01, 0.1, 0.3, 0.6):
                    if al * s < 0.95 * zmax_closed(N, r):
                        self.assertAlmostEqual(ef_var_closed(s, V, al, N, r) / ef_var(s, V, al, N, r), 1.0, places=9)

    def test_stability_limit_matches_spectral_radius(self):
        for N, r in ((1, 0.5), (4, 0.25), (16, 0.1), (64, 0.05)):
            z = zmax_closed(N, r)
            self.assertAlmostEqual(alpha_max_ef(s, N, r, hi=40 / s) * s, z, places=5)
            self.assertTrue(math.isinf(ef_var_closed(s, V, 1.001 * z / s, N, r)))
            self.assertTrue(math.isinf(ef_var(s, V, 1.001 * z / s, N, r)))

    def test_limit_special_cases(self):
        self.assertAlmostEqual(zmax_closed(1, 0.25), 2 * 0.25 / 1.75)
        self.assertGreater(zmax_closed(10 ** 6, 0.25), 2.0)          # large cohorts beat the uncompressed limit
        self.assertLess(zmax_closed(1, 0.25), 2 * 0.25)              # N=1 is worse than unbiased rand-k (2 rho)

    def test_small_step_floor_is_uncompressed_not_one_over_rho(self):
        r = ef_var(s, V, 1e-4, 8, 0.1) / uncompressed_var(s, V, 1e-4, 8)
        self.assertAlmostEqual(r, 1.0, delta=0.01)
        self.assertAlmostEqual(unbiased_var(s, V, 1e-4, 8, 0.1) / uncompressed_var(s, V, 1e-4, 8), 10.0, delta=0.01)

    def test_matches_simulation(self):
        sx, se = simulate_ef(s, V, 0.6, 8, 0.5, 200000, 2000, seed=4)
        self.assertAlmostEqual(sx / ef_var(s, V, 0.6, 8, 0.5), 1.0, delta=0.03)
        self.assertAlmostEqual(se / residual_var(s, V, 0.6, 8, 0.5), 1.0, delta=0.03)

    def test_baselines_at_finite_step_match_hand_closed_forms(self):
        # By hand (quality audit round 49), s=0.5, V=0.2, alpha=0.5, N=4, rho=0.1:
        # unbiased: w=9, d=2-0.25-0.25*9/4=1.1875, 0.5*0.2*10/(4*0.5*1.1875)=0.42105263...
        # dropped: K~Bin(4,0.1), EK=0.4, EK2=0.52, mult=1-0.05+(0.0625**2)*0.52, var=0.125**2*0.4*0.2/(1-mult)
        self.assertAlmostEqual(unbiased_var(0.5, 0.2, 0.5, 4, 0.1), 0.1 / 0.2375, places=10)
        mult = 1 - 0.05 + 0.0625 ** 2 * 0.52
        self.assertAlmostEqual(dropped_var(0.5, 0.2, 0.5, 4, 0.1), 0.125 ** 2 * 0.4 * 0.2 / (1 - mult), places=10)
        self.assertAlmostEqual(dropped_var(0.5, 0.2, 0.5, 4, 0.1), 0.0260586319218, places=10)

    def test_dropped_matches_simulation(self):
        sim = simulate_dense("dropped", s, V, 0.6, 8, 0.25, 200000, 2000, seed=5)
        self.assertAlmostEqual(sim / dropped_var(s, V, 0.6, 8, 0.25), 1.0, delta=0.03)

    def test_bias_of_dropping_and_its_removal(self):
        b, rho = [1.0, 0.0, -1.0, 2.0], [0.9, 0.5, 0.1, 0.05]
        md, _ = simulate_hetero(False, 0.5, 0.05, 0.05, b, rho, 300000, 5000, seed=6)
        me, _ = simulate_hetero(True, 0.5, 0.05, 0.05, b, rho, 300000, 5000, seed=6)
        self.assertAlmostEqual(md, fixed_point_dropped(b, rho), delta=0.02)
        self.assertAlmostEqual(me, fixed_point_ef(b, rho), delta=0.03)
        self.assertGreater(abs(fixed_point_dropped(b, rho) - fixed_point_ef(b, rho)), 0.05)

    def test_unbiased_floor_is_one_plus_omega(self):
        self.assertAlmostEqual(unbiased_var(s, V, 1e-6, 4, 0.2) / uncompressed_var(s, V, 1e-6, 4), 5.0, places=4)


if __name__ == "__main__":
    unittest.main()
