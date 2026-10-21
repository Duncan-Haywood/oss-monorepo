import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import markov as M  # noqa: E402


def toy(n_people=4, per=14, seed=0):
    rng = np.random.default_rng(seed)
    X, person = [], []
    for k in range(n_people):
        X.append(rng.normal(10 * k, 1.0, (per, 100, 12)).clip(0, 100))
        person += [f"p{k}"] * per
    return np.vstack(X), np.array(person)


class T(unittest.TestCase):
    def test_transition_rows_are_distributions(self):
        X, _ = toy()
        c = M.Chain(X[:14], k=6)
        self.assertTrue(np.allclose(c.trans.sum(1), 1))
        self.assertAlmostEqual(c.start.sum(), 1)

    def test_learns_a_deterministic_cycle(self):
        # two well-separated levels alternating every frame: the chain must alternate too
        W = np.zeros((10, 100, 3))
        W[:, 1::2] = 50
        c = M.Chain(W, k=2, smooth=1e-6)
        out = M.Chain.sample(c, 3, np.random.default_rng(0), "gauss")
        for w in out:
            hi = w[:, 0] > 25
            self.assertTrue((hi[1:] != hi[:-1]).all())

    def test_shapes_and_range(self):
        X, person = toy()
        _, fakes = M.build(X, person, 0, k=6, generators=("own markov frame", "own markov gauss"))
        for ff, fh, of, oh in fakes.values():
            self.assertEqual(ff.shape[1:], (100, 12))
            self.assertEqual(len(ff), len(of))
            self.assertTrue((ff >= 0).all() and (ff <= 100).all())

    def test_pooled_excludes_person(self):
        X, person = toy()
        _, fakes = M.build(X, person, 0, k=6, generators=("pooled markov frame",))
        ff, _, of, _ = fakes["pooled markov frame"]
        self.assertLess(ff[of == "p3"].mean(), 20)


if __name__ == "__main__":
    unittest.main()
