import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import data as D  # noqa: E402
import signals as S  # noqa: E402


def fake_windows(n=40, seed=0):
    rng = np.random.default_rng(seed)
    W = np.clip(rng.normal(0, 3, (n, 100, 12)), 0, 100)
    W[:, :, 7] = 99
    W[:, :, 11] = rng.normal(0, 10, (n, 100))
    return W


class DataTests(unittest.TestCase):
    def test_frames_keep_changes_only(self):
        rows = [(0, (1.0,) * 12), (10, (1.0,) * 12), (20, (2.0,) * 12)]
        t, v = D.frames(rows)
        self.assertEqual(len(t), 2)
        self.assertAlmostEqual(t[1], 0.02)

    def test_windows_drop_long_gaps(self):
        rows = [(i * 80, (float(i % 5),) * 12) for i in range(400)]      # dense: kept
        w, _ = D.windows(rows)
        self.assertTrue(len(w) >= 2)
        sparse = [(i * 5000, (float(i),) * 12) for i in range(100)]      # 5 s gaps: dropped
        w, _ = D.windows(sparse)
        self.assertEqual(len(w), 0)


class SignalTests(unittest.TestCase):
    def setUp(self):
        self.W = fake_windows()
        self.fit = S.Fit(self.W)

    def test_generate_shape_and_range(self):
        g = dict(S.NAIVE, dyn="ar1", cross=True, hold=0.5, spike=0.05, decimals=2)
        X = S.generate(g, self.fit, 5, np.random.default_rng(1))
        self.assertEqual(X.shape, (5, 100, 12))
        self.assertTrue((X >= S.LO).all() and (X <= S.HI).all())

    def test_hold_creates_repeats(self):
        a = S.generate(dict(S.NAIVE, hold=0.0), self.fit, 4, np.random.default_rng(1))
        b = S.generate(dict(S.NAIVE, hold=0.8), self.fit, 4, np.random.default_rng(1))
        rep = lambda X: (np.abs(np.diff(X, axis=1)).max(2) < 1e-9).mean()
        self.assertGreater(rep(b), rep(a) + 0.5)

    def test_features_shapes(self):
        fg = S.feature_groups(self.W)
        self.assertEqual(set(fg), set(S.GROUPS))
        self.assertTrue(all(len(v) == len(self.W) for v in fg.values()))
        self.assertTrue(np.isfinite(S.stack(fg)).all())

    def test_mutate_changes_one_gene(self):
        g = S.mutate(S.NAIVE, "dyn", np.random.default_rng(0))
        self.assertEqual([k for k in g if g[k] != S.NAIVE[k]], ["dyn"])

    def test_split_is_by_person(self):
        person = np.array([f"p{i % 40}" for i in range(400)])
        tr, lo, te = S.split(person, 0)
        self.assertFalse(set(tr) & set(lo) or set(tr) & set(te) or set(lo) & set(te))
        self.assertEqual(len(tr) + len(lo) + len(te), 40)

    def test_replay_copies_windows(self):
        R = S.replay(self.W, 3, np.random.default_rng(0))
        self.assertTrue(any(np.array_equal(R[0], w) for w in self.W))


if __name__ == "__main__":
    unittest.main()
