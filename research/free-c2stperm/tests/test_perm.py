import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
import sys, unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import perm


class T(unittest.TestCase):
    def test_p_is_on_grid_and_in_range(self):
        r = np.random.default_rng(0)
        X, y = r.normal(size=(60, 3)), np.r_[np.ones(30), np.zeros(30)].astype(int)
        p, obs, null = perm.perm_pvalue(X, y, 9)
        self.assertEqual(len(null), 9)
        self.assertTrue(any(abs(p - k / 10) < 1e-12 for k in range(1, 11)))
        self.assertTrue(0 <= obs <= 1)

    def test_signal_gives_smallest_p(self):
        r = np.random.default_rng(1)
        y = np.r_[np.ones(50), np.zeros(50)].astype(int)
        X = r.normal(size=(100, 2)) + 3 * y[:, None]
        p, obs, _ = perm.perm_pvalue(X, y, 9)
        self.assertAlmostEqual(p, 0.1)
        self.assertGreater(obs, 0.95)

    def test_null_p_roughly_uniform(self):
        r = np.random.default_rng(2)
        y = np.r_[np.ones(30), np.zeros(30)].astype(int)
        ps = [perm.perm_pvalue(r.normal(size=(60, 2)), y, 9, seed=s)[0] for s in range(30)]
        self.assertTrue(0.25 < np.mean(ps) < 0.75)

    def test_replicate_deterministic(self):
        a = perm.replicate(4, 40, perm.REAL, "raw", 5)
        self.assertEqual(a, perm.replicate(4, 40, perm.REAL, "raw", 5))

    def test_gross_mismatch_rejected(self):
        p = perm.replicate(3, 80, dict(visc=0.1, coul=0.0, sd=0.02, kind="student3"), "raw", 9)
        self.assertAlmostEqual(p["cv_perm"], 0.1)


if __name__ == "__main__":
    unittest.main()
