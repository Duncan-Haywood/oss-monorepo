import math, unittest
from demo_twin import *

A, B, S2, U = 1.05, 1.0, 1.0, 1.0


class T(unittest.TestCase):
    def test_no_saturation_recovers_lq_cost(self):
        k = lq_gain(A, B)
        c = A - B * k
        exact = S2 * (1 + 0.1 * k * k) / (1 - c * c)
        self.assertAlmostEqual(stationary_cost(A, B, S2, 50.0, k) / exact, 1.0, delta=0.005)  # cell-mass grid adds ~h^2/12 noise variance

    def test_grid_cost_matches_monte_carlo(self):
        k = lq_gain(A, B)
        mc = simulate_cost(A, B, S2, U, k, 400000, 1)
        self.assertAlmostEqual(stationary_cost(A, B, S2, U, k) / mc, 1.0, delta=0.02)

    def test_grid_refinement(self):
        k = 0.6
        c1 = stationary_cost(A, B, S2, U, k, grid=Grid(12, 0.2))
        c2 = stationary_cost(A, B, S2, U, k, grid=Grid(12, 0.1))
        self.assertAlmostEqual(c1 / c2, 1.0, delta=0.005)

    def test_stein_gain_matches_quadrature_on_gaussian_states(self):
        g = Grid(12, 0.05)
        k0 = lq_gain(A, B)
        for v in (0.3, 1.0, 2.5):
            self.assertAlmostEqual(bc_gain(g, gaussian_masses(g, v), U, k0), bc_gain_gaussian(k0, v, U), places=3)

    def test_no_saturation_no_bias(self):
        k0 = lq_gain(A, B)
        self.assertAlmostEqual(twin_bc_gain((A, B, S2, 50.0), k0), k0, places=4)

    def test_quieter_twin_gives_better_clone(self):
        k0 = lq_gain(A, B)
        ks = [twin_bc_gain((A, B, S2 * m, U), k0) for m in (0.5, 1.0, 2.0)]
        self.assertGreater(ks[0], ks[1]); self.assertGreater(ks[1], ks[2]); self.assertLess(ks[1], k0)

    def test_dagger_fixed_point(self):
        k0 = lq_gain(A, B)
        kd, _ = dagger_gain((A, B, S2), U, k0)
        g, p = stationary(A, B, S2, U, kd)
        self.assertAlmostEqual(bc_gain(g, p, U, k0), kd, places=8)
