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
        self.assertAlmostEqual(R.residual_stat(r, "trim20_sq"), 2 / 3)
        # per-run mean squares are 0.5 and 5; median of two is 2.75
        self.assertAlmostEqual(R.residual_stat(r, "run_median"), 2.75)

    def test_huber_known_is_quadratic_then_linear(self):
        self.assertAlmostEqual(R.residual_stat(np.array([0.01]), "huber_known"), 0.5 * 0.01 ** 2)
        self.assertAlmostEqual(R.residual_stat(np.array([1.0]), "huber_known"), 0.02 * (1 - 0.01))

    def test_huber_est_uses_mad_scale(self):
        rng = np.random.default_rng(0)
        x = rng.normal(0, 0.05, (200, 50))
        d = 1.345 * 0.05
        a = np.abs(x)
        want = np.where(a <= d, 0.5 * a ** 2, d * (a - 0.5 * d)).mean()
        self.assertAlmostEqual(R.residual_stat(x, "huber_est"), want, delta=0.05 * want)

    def test_unknown_stat(self):
        with self.assertRaises(ValueError):
            R.residual_stat(np.zeros(3), "x")

    def test_noise_kinds(self):
        rng = np.random.default_rng(1)
        self.assertAlmostEqual(R.noise(rng, (400, 400), 0.02, "gauss").std(), 0.02, delta=0.001)
        b = R.noise(rng, (2000, 20), 0.02, "badruns")
        rowsd = b.std(axis=1)
        frac = (rowsd > 0.08).mean()  # bad rows have sd 0.2
        self.assertAlmostEqual(frac, 0.1, delta=0.03)
        t2 = R.noise(rng, (100, 100), 0.02, "student2")
        self.assertEqual(t2.shape, (100, 100))
        with self.assertRaises(ValueError):
            R.noise(rng, (2, 2), 0.02, "nope")

    def test_exact_twin_mean_sq_is_noise_variance(self):
        v = R.replicate(np.random.default_rng(0), 300, dict(visc=0.1, coul=0.3), "gauss")
        self.assertAlmostEqual(v["mean_sq"], 0.02 ** 2, delta=0.1 * 0.02 ** 2)

    def test_wrong_twin_raises_stats(self):
        for s in R.STATS:
            a = R.replicate(np.random.default_rng(0), 100, dict(visc=0.1, coul=0.3), "gauss")[s]
            b = R.replicate(np.random.default_rng(0), 100, dict(visc=0.1, coul=0.2), "gauss")[s]
            self.assertGreater(b, a, s)

    def test_threshold_and_power(self):
        self.assertAlmostEqual(R.threshold(np.arange(101.0)), 95.0)
        p, lo, hi = R.power([1, 1, 1, 0], 0.5)
        self.assertEqual(p, 0.75)
        self.assertTrue(lo < p < hi)


if __name__ == "__main__":
    unittest.main()
