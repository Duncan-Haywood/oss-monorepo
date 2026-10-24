import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import semimarkov as S  # noqa: E402


def toy(n_people=4, per=14, seed=0):
    rng = np.random.default_rng(seed)
    X, person = [], []
    for k in range(n_people):
        X.append(rng.normal(10 * k, 1.0, (per, 100, 12)).clip(0, 100))
        person += [f"p{k}"] * per
    return np.vstack(X), np.array(person)


class T(unittest.TestCase):
    def test_parse(self):
        self.assertEqual(S.parse("pooled semi32 member"), ("pooled", "semi", 32, "member"))
        self.assertEqual(S.parse("own order28 centroid"), ("own", "order2", 8, "centroid"))

    def test_jump_chain_has_no_self_transitions(self):
        X, _ = toy()
        ch = S.Chain(X[:14], 8, np.random.default_rng(0))
        self.assertTrue(np.allclose(np.diag(ch.J), 0))
        self.assertTrue(np.allclose(ch.J.sum(1), 1))
        self.assertTrue(all(d >= 1 for ds in ch.dwell for d in ds))

    def test_shapes_and_centroid_emission(self):
        X, _ = toy()
        ch = S.Chain(X[:14], 8, np.random.default_rng(0))
        for kind in S.KINDS:
            out = ch.sample_kind(5, np.random.default_rng(1), kind, "centroid")
            self.assertEqual(out.shape, (5, 100, 12))
            for row in out.reshape(-1, 12)[:50]:
                self.assertTrue(any(np.allclose(row, c) for c in ch.centers))

    def test_semi_holds_longer_than_first_order(self):
        # a slowly drifting signal: dwell > 1 must show up as fewer state changes
        rng = np.random.default_rng(0)
        W = np.cumsum(rng.normal(0, 0.05, (30, 100, 3)), axis=1) + rng.normal(0, 5, (30, 1, 3))
        ch = S.Chain(W, 8, np.random.default_rng(0))
        def changes(x):
            return np.mean([np.sum(np.any(np.diff(w, axis=0) != 0, axis=1)) for w in x])
        a = ch.sample_kind(20, np.random.default_rng(2), "semi", "centroid")
        b = ch.sample(20, np.random.default_rng(2), "centroid")
        self.assertLess(changes(a), changes(b))

    def test_build_contract(self):
        X, person = toy()
        real, fakes = S.build(X, person, 0, generators=("own semi8 centroid", "pooled order28 member"))
        self.assertEqual(set(fakes), {"own semi8 centroid", "pooled order28 member"})
        ff, fh, of, oh = fakes["own semi8 centroid"]
        self.assertEqual(len(ff), len(of))
        self.assertEqual(len(fh), len(oh))


if __name__ == "__main__":
    unittest.main()
