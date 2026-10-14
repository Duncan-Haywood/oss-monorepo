import math, unittest
from radar_detection_twin import *

N, K = 16, 12


class T(unittest.TestCase):
    def test_twin_roundtrips(self):
        self.assertAlmostEqual(pfa_ca_twin(alpha_ca_twin(1e-4, N), N), 1e-4, places=12)
        self.assertAlmostEqual(pfa_os_twin(alpha_os_twin(1e-4, N, K), N, K), 1e-4, places=12)

    def test_os_twin_matches_simulation(self):
        a = alpha_os_twin(1e-2, N, K)
        self.assertAlmostEqual(simulate(a, N, math.inf, 200000, 1, "os", K) / 1e-2, 1.0, delta=0.08)

    def test_os_real_law_matches_simulation(self):
        g = TextureGrid(3.0)
        a = alpha_os_twin(1e-2, N, K)
        self.assertAlmostEqual(simulate(a, N, 3.0, 200000, 2, "os", K) / pfa_os_real(a, N, K, g), 1.0, delta=0.06)

    def test_ca_real_law_with_target_matches_simulation(self):
        g = TextureGrid(3.0)
        a, s = alpha_ca_twin(1e-2, N), 6.0
        self.assertAlmostEqual(simulate(a, N, 3.0, 200000, 3, "ca", snr=s) / pd_fn("ca", N, grid=g)(a, s), 1.0, delta=0.04)

    def test_os_real_law_with_target_matches_simulation(self):
        g = TextureGrid(3.0)
        a, s = alpha_os_twin(1e-2, N, K), 6.0
        self.assertAlmostEqual(simulate(a, N, 3.0, 200000, 4, "os", K, snr=s) / pd_fn("os", N, K, g)(a, s), 1.0, delta=0.04)

    def test_large_nu_recovers_twin(self):
        g = TextureGrid(2000.0)
        a = alpha_os_twin(1e-3, N, K)
        self.assertAlmostEqual(pfa_os_real(a, N, K, g) / 1e-3, 1.0, delta=0.05)
        self.assertAlmostEqual(pfa_ca_real(alpha_ca_twin(1e-3, N), N, g) / 1e-3, 1.0, delta=0.05)

    def test_shared_texture_is_cfar_for_both(self):
        for kind, a in (("ca", alpha_ca_twin(1e-2, N)), ("os", alpha_os_twin(1e-2, N, K))):
            self.assertAlmostEqual(simulate(a, N, 2.0, 200000, 5, kind, K, shared=True) / 1e-2, 1.0, delta=0.08)

    def test_snr_inverts_and_repair_raises_threshold(self):
        g = TextureGrid(5.0)
        f = pd_fn("os", N, K, g)
        a = alpha_for_pfa(1e-4, f)
        self.assertAlmostEqual(f(a, 0.0) / 1e-4, 1.0, places=5)
        self.assertGreater(a, alpha_os_twin(1e-4, N, K))
        s = snr_for_pd(f, a, 0.9)
        self.assertAlmostEqual(f(a, s), 0.9, places=6)
        self.assertGreater(s, snr_for_pd(pd_fn("os", N, K), alpha_os_twin(1e-4, N, K), 0.9))


if __name__ == "__main__":
    unittest.main()
