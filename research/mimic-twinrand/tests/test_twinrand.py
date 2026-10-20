import sys, unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import twinrand

R = twinrand.REAL


class T(unittest.TestCase):
    def test_zero_width_is_nominal(self):
        self.assertEqual(twinrand.draw_twin(R, 0.0, np.random.default_rng(0)), R)

    def test_draw_within_range_and_nonnegative(self):
        rng = np.random.default_rng(1)
        nom = dict(R, sd=0.0)
        for _ in range(200):
            p = twinrand.draw_twin(nom, 1.0, rng)
            self.assertGreaterEqual(p["sd"], 0.0)
            self.assertLessEqual(p["sd"], 0.02 + 1e-12)
            self.assertAlmostEqual(abs(p["coul"] - 0.3) <= 0.3 + 1e-12, True)
            self.assertGreaterEqual(p["glo"], 0.1)
            self.assertEqual(p["kind"], R["kind"])

    def test_spread_grows_with_width(self):
        rng = np.random.default_rng(2)
        sds = lambda w: np.std([twinrand.draw_twin(R, w, rng)["coul"] for _ in range(500)])
        self.assertLess(sds(0.25), sds(1.0))

    def test_tune_returns_valid_index_and_is_deterministic(self):
        a, g = twinrand.tune_dr(R, 0.5, np.random.default_rng(3), n=16, k=4)
        b, _ = twinrand.tune_dr(R, 0.5, np.random.default_rng(3), n=16, k=4)
        self.assertEqual(a, b)
        self.assertTrue(0 <= a < len(g))

    def test_width_zero_matches_exact_twin_picks_a_grid_gain(self):
        i, g = twinrand.tune_dr(R, 0.0, np.random.default_rng(4), n=16, k=4)
        self.assertIn(g[i], twin_grid())


def twin_grid():
    return twinrand.twin.gain_grid()


if __name__ == "__main__":
    unittest.main()
