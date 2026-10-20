import os, sys, unittest
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
from accel_lut import lut as L, model as M


class T(unittest.TestCase):
    def test_codebook_size_and_zeros(self):
        rng = np.random.default_rng(0)
        w = rng.normal(size=(30, 20)); m = (rng.random(w.shape) > 0.5).astype(float)
        q, c = L.share_weights(w, m, 8)
        self.assertLessEqual(len(np.unique(q[m > 0])), 8)
        self.assertTrue(np.all(q[m == 0] == 0))

    def test_error_falls_with_k(self):
        w = np.random.default_rng(1).normal(size=(40, 40)); m = np.ones_like(w)
        e = [np.mean((L.share_weights(w, m, k)[0] - w) ** 2) for k in (2, 4, 8, 16)]
        self.assertTrue(all(a > b for a, b in zip(e, e[1:])))

    def test_product_table_is_exact(self):
        # y = sum_i a_i * c[idx_i] computed through the K-entry product table equals the direct MAC
        rng = np.random.default_rng(2)
        a = rng.integers(0, 256, 50); c = rng.normal(size=8); idx = rng.integers(0, 8, (50, 12))
        direct = (a[:, None] * c[idx]).sum(0)
        table = a[:, None] * c[None]           # K products per input
        via = table[np.arange(50)[:, None], idx].sum(0)
        np.testing.assert_allclose(direct, via)

    def test_energy_monotone(self):
        e = [L.energy_lut_pj(64, 32, 2048, k, 4, False, 0.04) for k in (4, 16, 64)]
        self.assertTrue(e[0] < e[1] < e[2])
        self.assertLess(L.energy_lut_pj(64, 32, 500, 8, 4, True, 0.04), L.energy_lut_pj(64, 32, 2048, 8, 4, True, 0.04))

    def test_mac_act_once_cheaper(self):
        self.assertLess(L.energy_mac_pj(64, 32, 2048, 8, 4, False, True), L.energy_mac_pj(64, 32, 2048, 8, 4, False, False))

    def test_zero_table_cost_makes_lut_cheaper_for_big_fanout(self):
        self.assertLess(L.energy_lut_pj(64, 512, 64 * 512, 8, 4, False, 0.0), L.energy_mac_pj(64, 512, 64 * 512, 8, 4, False, True))


if __name__ == '__main__':
    unittest.main()
