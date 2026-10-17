import math, unittest
from compressed_sync import *

A = [1.0, 0.25, 0.05]


class T(unittest.TestCase):
    def test_uncompressed_matches_noisy_local_sgd(self):
        eta, sg, N, H, al = 0.3, 0.8, 6, 5, 0.7
        want = sum(0.5 * a * al * (worker_noise(eta, a, sg, H) / N) / (curvature(eta, a, H) * (2 - al * curvature(eta, a, H))) for a in A)
        self.assertAlmostEqual(floor_coord(A, eta, sg, N, H, al, 0.0), want, places=12)
        self.assertAlmostEqual(floor_norm(A, eta, sg, N, H, al, 0.0), want, places=12)

    def test_coord_floor_inflates_by_one_plus_omega_at_small_step(self):
        f0 = floor_coord(A, 0.1, 1.0, 8, 4, 1e-4, 0.0)
        f1 = floor_coord(A, 0.1, 1.0, 8, 4, 1e-4, 3.0)
        self.assertAlmostEqual(f1 / f0, 4.0, delta=1e-3)

    def test_stability_limit(self):
        s, N, om = 0.8, 4, 6.0
        am = alpha_max_coord(s, N, om)
        self.assertLess(am, 2 / s)
        self.assertTrue(math.isinf(var_coord(s, 1.0, am * 1.001, N, om)))
        self.assertTrue(math.isfinite(var_coord(s, 1.0, am * 0.999, N, om)))

    def test_norm_scaling_reduces_to_coordwise_when_modes_identical(self):
        s, Vw, D = 0.5, 0.2, 5
        v = var_norm([s] * D, [Vw] * D, 0.6, 4, 1.5)   # identical modes: |d|^2/D = d_j^2, so kappa = omega
        self.assertAlmostEqual(v[0], var_coord(s, Vw, 0.6, 4, 1.5), places=12)

    def test_norm_scaling_leaks_stiff_noise_into_flat_modes(self):
        s = [0.9, 0.01]
        Vw = [1.0, 1e-4]
        base = var_norm(s, Vw, 0.5, 4, 0.0)[1]
        comp = var_norm(s, Vw, 0.5, 4, 0.5)[1]
        self.assertGreater(comp / base, 10.0)

    def test_simulation_matches_exact(self):
        eta, sg, H, al, N = 0.4, 1.0, 3, 0.6, 4
        th = floor_coord(A, eta, sg, N, H, al, 3.0)
        emp = sim_floor("randk", 0.25, A, eta, sg, H, al, N, 60000, 500, seed=1)
        self.assertAlmostEqual(emp / th, 1.0, delta=0.06)
        th = floor_norm(A, eta, sg, N, H, al, 1.5)
        emp = sim_floor("dither", 1.5, A, eta, sg, H, al, N, 60000, 500, seed=2)
        self.assertAlmostEqual(emp / th, 1.0, delta=0.06)

    def test_rounding_kappa_is_close(self):
        eta, sg, H, al, N = 0.4, 1.0, 3, 0.6, 4
        th = floor_norm(A, eta, sg, N, H, al, kappa_rounding(3, 2))
        emp = sim_floor("round", 2, A, eta, sg, H, al, N, 60000, 500, seed=3)
        self.assertAlmostEqual(emp / th, 1.0, delta=0.15)

    def test_equal_error_energy_gives_equal_loss_at_h1_but_not_beyond(self):
        a = [1.0, 0.5, 0.25]
        self.assertAlmostEqual(floor_norm(a, 0.2, 1.0, 8, 1, 0.5, 1.0) / floor_coord(a, 0.2, 1.0, 8, 1, 0.5, 1.0), 1.0, delta=1e-4)
        self.assertGreater(floor_norm(a, 0.2, 1.0, 8, 16, 0.5, 1.0) / floor_coord(a, 0.2, 1.0, 8, 16, 0.5, 1.0), 1.05)

    def test_stretching_sync_beats_compression_at_alpha_one(self):
        base = floor_coord(A, 0.2, 1.0, 8, 4, 1.0, 0.0)
        self.assertAlmostEqual(floor_coord(A, 0.2, 1.0, 8, 16, 1.0, 0.0) / base, 1.0, delta=1e-3)
        self.assertGreater(floor_coord(A, 0.2, 1.0, 8, 4, 1.0, 3.0) / base, 4.0)


if __name__ == "__main__":
    unittest.main()
