import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import tails as T  # noqa: E402


def fake(n=30, seed=0):
    rng = np.random.default_rng(seed)
    W = np.clip(rng.exponential(2, (n, 100, 12)) * (rng.random((n, 100, 12)) < 0.3), 0, 100)
    W[:, :, 7] = 99
    W[:, :, 11] = rng.normal(0, 10, (n, 100))
    return W


class TailTests(unittest.TestCase):
    def setUp(self):
        self.W = fake()
        self.fit = T.TailFit(self.W)

    def test_copula_shape_and_support(self):
        y = T.gen_copula(self.fit, 5, np.random.default_rng(1))
        self.assertEqual(y.shape, (5, 100, 12))
        self.assertTrue((y >= self.W.min((0, 1)) - 1e-9).all() and (y <= self.W.max((0, 1)) + 1e-9).all())

    def test_regime_values_come_from_training_pools(self):
        y = T.gen_regime(self.fit, 3, np.random.default_rng(2))
        for c in range(12):
            self.assertTrue(np.isin(y[:, :, c], self.W[:, :, c]).all())

    def test_hold_repeats_frames(self):
        y = T.gen_copula(self.fit, 4, np.random.default_rng(3), hold=0.9)
        self.assertGreater((np.abs(np.diff(y, axis=1)).max(2) < 1e-9).mean(), 0.7)

    def test_window_variant_clips(self):
        y = T.gen_copula_win(self.fit, 4, np.random.default_rng(4))
        self.assertTrue((y >= -100).all() and (y <= 100).all())



    def test_rank_variant_matches_a_training_window_range(self):
        y = T.gen_copula_rank(self.fit, 6, np.random.default_rng(5))
        for i in range(6):
            # each window's per-channel max and min are some training window's max and min
            for c in range(12):
                self.assertTrue(np.isclose(self.W[:, :, c].max(1), y[i, :, c].max()).any())
                self.assertTrue(np.isclose(self.W[:, :, c].min(1), y[i, :, c].min()).any())


if __name__ == "__main__":
    unittest.main()
