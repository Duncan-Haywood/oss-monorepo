import math, unittest
from radar_clutter_twin import *

N = 16


class T(unittest.TestCase):
    def test_twin_threshold_roundtrip_and_simulation(self):
        a = alpha_twin(1e-2, N)
        self.assertAlmostEqual(pfa_twin(a, N), 1e-2, places=12)
        self.assertAlmostEqual(simulate_pfa(a, N, math.inf, 200000, 2) / 1e-2, 1.0, delta=0.08)

    def test_exact_law_matches_direct_simulation(self):
        a = alpha_twin(1e-2, N)
        for nu in (2.0, 5.0):
            self.assertAlmostEqual(simulate_pfa(a, N, nu, 200000, 1) / pfa_real(a, N, TextureGrid(nu)), 1.0, delta=0.06)

    def test_gaussian_limit_and_monotone_in_nu(self):
        a = alpha_twin(1e-3, N)
        vals = [pfa_real(a, N, TextureGrid(nu)) for nu in (1.5, 5.0, 50.0, 500.0)]
        self.assertTrue(all(x > y for x, y in zip(vals, vals[1:])))
        self.assertAlmostEqual(vals[-1] / 1e-3, 1.0, delta=0.12)

    def test_asymptotic_inflation_constant(self):
        for nu in (5.0, 20.0):
            g = TextureGrid(nu)
            self.assertAlmostEqual(inflation(1e6, N, g) / inflation_limit(nu, N), 1.0, delta=0.02)

    def test_shared_texture_is_cfar(self):
        a = alpha_twin(1e-2, N)
        self.assertAlmostEqual(simulate_pfa(a, N, 2.0, 200000, 4, shared=True) / 1e-2, 1.0, delta=0.08)

    def test_alpha_for_pfa_inverts(self):
        g = TextureGrid(5.0)
        a = alpha_for_pfa(1e-4, N, g)
        self.assertAlmostEqual(pfa_real(a, N, g) / 1e-4, 1.0, places=6)
        self.assertGreater(a, alpha_twin(1e-4, N))

    def test_moment_estimator_consistent(self):
        import random
        for nu in (2.0, 5.0):
            self.assertAlmostEqual(nu_moment_estimate(sample_power(nu, 400000, random.Random(3))) / nu, 1.0, delta=0.12)

    def test_recalibration_with_true_nu_hits_target(self):
        c = GridCache()
        self.assertAlmostEqual(recalibrated_pfa(1e-4, N, 5.0, 5.0, c) / 1e-4, 1.0, places=5)


if __name__ == "__main__":
    unittest.main()
