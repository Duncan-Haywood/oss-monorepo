import math, unittest
from compressed_outer import *

A = [1.0, 0.25, 0.05]


class T(unittest.TestCase):
    def test_no_compression_reduces_to_noisy_local_sgd(self):
        s, Vw, al, M = 0.7, 0.3, 0.9, 5
        self.assertAlmostEqual(floor_multiplicative(s, Vw, al, M, 0.0), al * Vw / (M * s * (2 - al * s)), places=14)
        self.assertAlmostEqual(floor_dither(s, Vw, 0.0, al, M), al * Vw / (M * s * (2 - al * s)), places=14)
        self.assertAlmostEqual(floor_sparse(A, 0.3, 0.8, M, 1.0, 4, 0.7),
                               sum(0.5 * a * 0.7 * worker_noise(0.3, a, 0.8, 4) / (M * curvature(0.3, a, 4) * (2 - 0.7 * curvature(0.3, a, 4)))
                                   for a in A), places=12)

    def test_participation_is_sparsification_of_a_whole_worker(self):
        # partial-participation Rule B: alpha Vw / (N p s (2 - alpha s c)), c = 1 + (1-p)/(N p)
        s, Vw, al, N, p = 0.8, 0.4, 0.6, 12, 0.3
        c = 1 + (1 - p) / (N * p)
        want = al * Vw / (N * p * s * (2 - al * s * c))
        self.assertAlmostEqual(floor_multiplicative(s, Vw, al, N, omega_participation(p)), want, places=13)

    def test_stability_limit_and_best_step(self):
        s, M, om = 0.6, 4, 3.0
        am = alpha_max(s, M, om)
        self.assertLess(am, 2 / s)
        self.assertTrue(math.isfinite(floor_multiplicative(s, 1.0, 0.99 * am, M, om)))
        self.assertTrue(math.isinf(floor_multiplicative(s, 1.0, 1.01 * am, M, om)))
        ab = alpha_best(s, M, om)
        self.assertAlmostEqual(contraction(ab * s, M, om), best_contraction(M, om), places=13)
        for f in (0.5, 0.9, 1.1, 2.0):
            self.assertGreater(contraction(f * ab * s, M, om), best_contraction(M, om) - 1e-15)

    def test_rounds_to(self):
        self.assertAlmostEqual(rounds_to(1e-6, 0.5, 8, 0.0), math.log(1e-6) / math.log(0.25), places=10)
        self.assertTrue(math.isinf(rounds_to(1e-6, 1.9, 4, 3.0)))

    def test_fixed_bandwidth_c_and_floor(self):
        M, Bd = 10, 2.5           # each of 10 workers sends r = 0.25 of coordinates
        r = Bd / M
        self.assertAlmostEqual(c_bandwidth(M, Bd), c_factor(M, omega_sparse(r)), places=13)
        s, Vw, al = 0.9, 0.5, 0.4
        self.assertAlmostEqual(floor_bandwidth_sparse(s, Vw, al, M, Bd), floor_multiplicative(s, Vw, al, M, omega_sparse(r)), places=13)
        # splitting the same bandwidth over more workers: c rises, floor rises to alpha Vw/((B/d) s (2 - alpha s (1 + d/B)))
        f = [floor_bandwidth_sparse(s, Vw, al, m, Bd) for m in (3, 10, 100, 10 ** 6)]
        self.assertTrue(all(f[i] < f[i + 1] for i in range(3)))
        self.assertAlmostEqual(floor_bandwidth_sparse(s, Vw, al, Bd, Bd), al * Vw / (Bd * s * (2 - al * s)), places=13)
        self.assertAlmostEqual(f[-1], al * Vw / (Bd * s * (2 - al * s * (1 + 1 / Bd))), delta=1e-5)

    def test_m_max_stable(self):
        m = m_max_stable(1.9, 2.0)
        self.assertGreater(m, 0)
        self.assertAlmostEqual(1.9 * c_bandwidth(m, 2.0), 2.0, places=12)
        self.assertTrue(math.isinf(m_max_stable(1.0, 2.0)))

    def test_simulation_sparse_and_dither(self):
        s, Vw = 1.0, 0.25
        th = floor_multiplicative(s, Vw, 0.8, 6, omega_sparse(0.4))
        emp = simulate_var("sparse", s, Vw, 0.8, 6, 0.4, 120000, 500, seed=3)
        self.assertAlmostEqual(emp / th, 1.0, delta=0.03)
        th = floor_dither(s, Vw, 1.0, 0.8, 6)
        emp = simulate_var("dither", s, Vw, 0.8, 6, 1.0, 120000, 500, seed=3)
        self.assertAlmostEqual(emp / th, 1.0, delta=0.03)

    def test_dither_entropy_matches_sampling_and_high_resolution(self):
        self.assertAlmostEqual(dither_entropy(0.5, 0.3), empirical_bits(0.5, 0.3, 200000, seed=1), delta=0.02)
        dl = 0.05
        self.assertAlmostEqual(dither_entropy(1.0, dl), gauss_bits(1.0, dl), delta=0.005)
        self.assertGreater(dither_entropy(1.0, 3.5), gauss_bits(1.0, 3.5))   # coarse grids cost more than high-res predicts

    def test_delta_for_rate_and_penalty(self):
        for R in (0.5, 1.0, 3.0):
            self.assertAlmostEqual(dither_entropy(2.0, delta_for_rate(2.0, R)), R, places=6)
        self.assertAlmostEqual(dither_rate_penalty(4) * 1.0, dither_noise(delta_for_rate(1.0, 4)), delta=2e-4)

    def test_bandwidth_factor_has_interior_minimum(self):
        fs = {R: bandwidth_factor(R, 1.0) for R in (0.25, 0.5, 1.0, 1.5, 2.0, 4.0, 8.0)}
        best = min(fs, key=fs.get)
        self.assertIn(best, (1.0, 1.5))
        self.assertLess(fs[best], fs[8.0] / 3.5)


if __name__ == "__main__":
    unittest.main()
