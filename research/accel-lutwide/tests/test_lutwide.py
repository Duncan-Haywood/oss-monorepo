import os, sys, unittest
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'experiments'))
from accel_lutwide import lut as L
import run as R


class T(unittest.TestCase):
    def test_codebook_size_and_zeros(self):
        rng = np.random.default_rng(0)
        w = rng.normal(size=(30, 20)); m = (rng.random(w.shape) > 0.5).astype(float)
        q, _ = L.share_weights(w, m, 8)
        self.assertLessEqual(len(np.unique(q[m > 0])), 8)
        self.assertTrue(np.all(q[m == 0] == 0))

    def test_product_table_is_exact(self):
        rng = np.random.default_rng(2)
        a = rng.integers(0, 256, 50); c = rng.normal(size=8); idx = rng.integers(0, 8, (50, 12))
        direct = (a[:, None] * c[idx]).sum(0)
        via = (a[:, None] * c[None])[np.arange(50)[:, None], idx].sum(0)
        np.testing.assert_allclose(direct, via)

    def test_int8_baseline_matches_accel_lut(self):
        # accel-lut reports 3.56 nJ for the 64-32-10 int8 net with the activation read once per input
        self.assertAlmostEqual(R.energy_nj(32, 'int8', 0.04), 3.56, places=2)

    def test_hybrid_cheaper_than_full_table(self):
        for n in R.WIDTHS:
            for k in R.KS:
                self.assertLess(R.energy_nj(n, 'hybrid%d' % k, 0.04), R.energy_nj(n, 'share%d' % k, 0.04))

    def test_table_gain_grows_with_width(self):
        r = [R.energy_nj(n, 'hybrid8', 0.04) / R.energy_nj(n, 'int8', 0.04) for n in R.WIDTHS]
        self.assertTrue(r[0] > r[1] > r[2])

    def test_costly_table_read_never_wins(self):
        for n in R.WIDTHS:
            for k in R.KS:
                self.assertGreater(R.energy_nj(n, 'hybrid%d' % k, 0.16), R.energy_nj(n, 'int8', 0.16))


if __name__ == '__main__':
    unittest.main()
