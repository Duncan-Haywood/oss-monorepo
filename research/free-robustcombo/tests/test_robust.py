import sys, unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import robust as R


class T(unittest.TestCase):
    def test_stats_on_known_residuals(self):
        r = np.array([[0.0, 1.0], [1.0, 3.0]])
        self.assertAlmostEqual(R.residual_stat(r, "median_sq"), 1.0)
        # per-run mean squares are 0.5 and 5; median of two is 2.75
        self.assertAlmostEqual(R.residual_stat(r, "run_median"), 2.75)
        # per-run median squares: 0.5 and 5 (two cells, median = mean); outer median 2.75
        self.assertAlmostEqual(R.residual_stat(r, "run_med_med"), 2.75)

    def test_two_level_resists_bad_run_and_heavy_cell(self):
        good = np.full((9, 10), 0.1)
        res = np.vstack([good, np.full((1, 10), 100.0)])
        res[0, 0] = 1e6  # one wild cell in a good run
        for s in ("run_med_med", "run_med_trim", "run_trim_med", "run_trim_trim"):
            self.assertAlmostEqual(R.residual_stat(res, s), 0.01, delta=1e-9, msg=s)
        self.assertGreater(R.residual_stat(res, "run_median"), 0.0099)

    def test_trim_drops_top_fifth(self):
        r = np.array([[1.0, 1.0, 1.0, 1.0, 100.0]])
        self.assertAlmostEqual(R.residual_stat(r, "run_trim_trim"), 1.0)

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

    def test_both_noise_has_bad_runs_and_heavy_cells(self):
        b = R.noise(np.random.default_rng(2), (3000, 30), 0.02, "both")
        rowmed = np.median(np.abs(b), axis=1)
        self.assertAlmostEqual((rowmed > 0.05).mean(), 0.1, delta=0.03)
        self.assertGreater(np.abs(b).max(), 5.0)  # t(2) tails

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
