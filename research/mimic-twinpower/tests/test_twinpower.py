import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import twinpower as tp


class T(unittest.TestCase):
    def test_threshold_is_null_quantile(self):
        self.assertAlmostEqual(tp.null_threshold(list(range(101)), 0.05), 95.0)

    def test_power_counts_strictly_above(self):
        self.assertEqual(tp.power([0.5, 0.6, 0.7, 0.8], 0.6), 0.5)

    def test_n_needed(self):
        self.assertEqual(tp.n_needed((10, 20, 40), [0.1, 0.8, 1.0]), 20)
        self.assertIsNone(tp.n_needed((10, 20), [0.1, 0.5]))

    def test_exact_twin_is_near_chance_and_noise_free_twin_is_separable(self):
        a = tp.auroc_once(dict(tp.R), 60, 1)
        b = tp.auroc_once(dict(tp.R, sd=0.0), 60, 1)
        self.assertLess(a, 0.75)
        self.assertGreater(b, 0.95)

    def test_replicate_is_deterministic(self):
        self.assertEqual(tp.auroc_once(dict(tp.R, coul=0.0), 30, 3), tp.auroc_once(dict(tp.R, coul=0.0), 30, 3))


if __name__ == "__main__":
    unittest.main()
