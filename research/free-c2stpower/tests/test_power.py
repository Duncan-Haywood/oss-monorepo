import sys, unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import power


class T(unittest.TestCase):
    def test_undamped_keeps_amplitude(self):
        x = power.simulate(np.array([1.0]), 0.0, 0.0, steps=200)[0]
        self.assertLess(x.max(), 1.0 + 1e-6)
        self.assertGreater(x.max(), 1.0 - 1e-3)

    def test_noise_sd(self):
        r = np.random.default_rng(0)
        for k in ("gauss", "student3"):
            self.assertAlmostEqual(power.noise(r, 400000, 0.05, k).std(), 0.05, delta=0.004)

    def test_unknown_noise(self):
        with self.assertRaises(ValueError):
            power.noise(np.random.default_rng(0), 3, 1, "x")

    def test_threshold_is_quantile(self):
        self.assertAlmostEqual(power.threshold(np.arange(101.0), 0.05), 95.0)

    def test_power_wilson(self):
        p, lo, hi = power.power([1, 1, 1, 0], 0.5)
        self.assertEqual(p, 0.75)
        self.assertLess(lo, p)
        self.assertGreater(hi, p)
        p0, lo0, _ = power.power([0, 0, 0], 0.5)
        self.assertEqual((p0, lo0), (0.0, 0.0))

    def test_paired_stat_exact_twin_is_noise_variance(self):
        r = np.random.default_rng(1)
        th0, _, real = power.dataset(r, 400, **power.REAL)
        v = power.paired_stat(real, th0, power.REAL["visc"], power.REAL["coul"])
        self.assertAlmostEqual(v, power.REAL["sd"] ** 2, delta=0.1 * power.REAL["sd"] ** 2)

    def test_c2st_gross_mismatch(self):
        r = np.random.default_rng(2)
        a = power.dataset(r, 300, 0.1, 0.4, 0.02, "gauss")[2]
        b = power.dataset(r, 300, 0.1, 0.0, 0.02, "gauss")[2]
        self.assertGreater(power.c2st_auc(a, b, "raw"), 0.9)


if __name__ == "__main__":
    unittest.main()
