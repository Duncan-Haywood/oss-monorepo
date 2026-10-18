import sys, unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import twinnoiserand as tn

R = tn.REAL


class T(unittest.TestCase):
    def test_only_sd_changes(self):
        rng = np.random.default_rng(0)
        for _ in range(100):
            p = tn.draw_twin_noise(R, 2.0, rng)
            self.assertEqual({k: v for k, v in p.items() if k != "sd"}, {k: v for k, v in R.items() if k != "sd"})
            self.assertGreaterEqual(p["sd"], 0.0)

    def test_zero_width_is_nominal(self):
        self.assertEqual(tn.draw_twin_noise(R, 0.0, np.random.default_rng(1)), R)

    def test_sd_range(self):
        rng = np.random.default_rng(2)
        sds = [tn.draw_twin_noise(dict(R, sd=0.0), 1.0, rng)["sd"] for _ in range(300)]
        self.assertLessEqual(max(sds), 0.02 + 1e-12)

    def test_tune_deterministic_valid(self):
        a, g = tn.tune_noise_dr(R, 1.0, np.random.default_rng(3), n=16, k=4)
        b, _ = tn.tune_noise_dr(R, 1.0, np.random.default_rng(3), n=16, k=4)
        self.assertEqual(a, b)
        self.assertTrue(0 <= a < len(g))


if __name__ == "__main__":
    unittest.main()
