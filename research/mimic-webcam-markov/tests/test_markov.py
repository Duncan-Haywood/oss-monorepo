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
    def test_parse(self):
        self.assertEqual(M.parse("pooled markov32 member"), ("pooled", 32, "member"))

    def test_chain_rows_are_distributions(self):
        X, _ = toy()
        ch = M.Chain(X[:14], 8, np.random.default_rng(0))
        self.assertTrue(np.allclose(ch.P.sum(1), 1))
        self.assertAlmostEqual(ch.start.sum(), 1)

    def test_centroid_emits_centres_member_emits_real_frames(self):
        X, _ = toy()
        rng = np.random.default_rng(1)
        ch = M.Chain(X[:14], 8, rng)
        c = ch.sample(2, rng, "centroid")
        m = ch.sample(2, rng, "member")
        self.assertEqual(c.shape, (2, 100, 12))
        real = {tuple(f) for f in X[:14].reshape(-1, 12)}
        self.assertTrue(all(tuple(f) in real for f in m.reshape(-1, 12)))
        self.assertFalse(all(tuple(f) in real for f in c.reshape(-1, 12)))

    def test_own_chain_stays_near_own_person_and_pooled_excludes_them(self):
        X, person = toy()
        _, fk = M.build(X, person, 0, generators=("own markov8 centroid", "pooled markov8 centroid"))
        ff, _, of, _ = fk["own markov8 centroid"]
        self.assertTrue(abs(ff[of == "p3"].mean() - 30) < 3)
        pf, _, po, _ = fk["pooled markov8 centroid"]
        self.assertLess(pf[po == "p3"].mean(), 20)

    def test_build_counts_match_split(self):
        X, person = toy()
        real, fk = M.build(X, person, 0, generators=("own markov8 member",))
        ff, fh, of, oh = fk["own markov8 member"]
        self.assertEqual(len(ff), len(real["fit"]))
        self.assertEqual(len(fh), len(real["held"]))


if __name__ == "__main__":
    unittest.main()
