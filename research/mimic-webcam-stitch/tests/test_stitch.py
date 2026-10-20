import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import stitch as T  # noqa: E402


def fake(n=24, seed=0):
    rng = np.random.default_rng(seed)
    W = np.clip(rng.exponential(2, (n, 100, 12)), 0, 100)
    person = np.repeat(np.arange(n // 4), 4)
    return W, person


class StitchTests(unittest.TestCase):
    def test_shape_and_values_are_real_frames(self):
        W, p = fake()
        for mode in T.MODES:
            y = T.stitch(W, p, 5, np.random.default_rng(1), seg=25, mode=mode)
            self.assertEqual(y.shape, (5, 100, 12))
            for c in range(12):
                self.assertTrue(np.isin(y[:, :, c], W[:, :, c]).all())

    def test_person_mode_uses_one_person(self):
        W, p = fake()
        W = W + p[:, None, None] * 1000.0          # person id readable from the level
        y = T.stitch(W, p, 6, np.random.default_rng(2), seg=10, mode="person")
        self.assertTrue(all(len(set(np.round(w[:, 0] / 1000).astype(int))) == 1 for w in y))

    def test_match_lowers_join_jump(self):
        W, p = fake()
        sc = T._scale(W)

        def jump(y, seg):
            j = np.arange(seg, 100, seg)
            return float((np.abs(y[:, j] - y[:, j - 1]) / sc).mean())
        a = T.stitch(W, p, 40, np.random.default_rng(3), seg=25, mode="random")
        b = T.stitch(W, p, 40, np.random.default_rng(3), seg=25, mode="match")
        self.assertLess(jump(b, 25), jump(a, 25))

    def test_odd_block_length(self):
        W, p = fake()
        self.assertEqual(T.stitch(W, p, 2, np.random.default_rng(4), seg=30, mode="match").shape, (2, 100, 12))


if __name__ == "__main__":
    unittest.main()
