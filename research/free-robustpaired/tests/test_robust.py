import sys, unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import robust as R


class T(unittest.TestCase):
    def test_stats_on_known_residuals(self):
        r = np.array([[0.0, 1.0], [1.0, 3.0]])
        self.assertAlmostEqual(R.residual_stat(r, "mean_sq"), 11 / 4)
        self.assertAlmostEqual(R.residual_stat(r, "median_sq"), 1.0)
        self.assertAlmostEqual(R.residual_stat(r, "mean_abs"), 5 / 4)
        self.assertAlmostEqual(R.residual_stat(r, "trim20_sq"), 2 / 3 * 0 + (0 + 1 + 1) / 3)

    def test_huber_small_is_quadratic_large_is_linear(self):
        self.assertAlmostEqual(R.residual_stat(np.array([0.01]), "huber"), 0.5 * 0.01 ** 2)
        self.assertAlmostEqual(R.residual_stat(np.array([1.0]), "huber"), 0.02 * (1 - 0.01))

    def test_unknown_stat(self):
        with self.assertRaises(ValueError):
            R.residual_stat(np.zeros(3), "x")

    def test_exact_twin_mean_sq_is_noise_variance(self):
        v = R.replicate(np.random.default_rng(0), 300, dict(visc=0.1, coul=0.3), "gauss")
        self.assertAlmostEqual(v["mean_sq"], 0.02 ** 2, delta=0.1 * 0.02 ** 2)

    def test_wrong_twin_raises_mean_sq(self):
        a = R.replicate(np.random.default_rng(0), 100, dict(visc=0.1, coul=0.3), "gauss")["mean_sq"]
        b = R.replicate(np.random.default_rng(0), 100, dict(visc=0.1, coul=0.2), "gauss")["mean_sq"]
        self.assertGreater(b, a)

    def test_threshold_and_power(self):
        self.assertAlmostEqual(R.threshold(np.arange(101.0)), 95.0)
        p, lo, hi = R.power([1, 1, 1, 0], 0.5)
        self.assertEqual(p, 0.75)
        self.assertTrue(lo < p < hi)
