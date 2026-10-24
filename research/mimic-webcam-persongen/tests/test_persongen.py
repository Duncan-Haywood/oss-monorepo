import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import persongen as P  # noqa: E402


def toy(n_people=4, per=14, seed=0):
    rng = np.random.default_rng(seed)
    X, person = [], []
    for k in range(n_people):
        X.append(rng.normal(10 * k, 1.0, (per, 100, 12)).clip(0, 100))
        person += [f"p{k}"] * per
    return np.vstack(X), np.array(person)


class T(unittest.TestCase):
    def test_split_is_chronological_halves(self):
        X, person = toy()
        sp = P.split_people(person)
        self.assertEqual(len(sp), 4)
        fit, held = sp["p1"]
        self.assertEqual(len(fit), 7)
        self.assertLess(fit.max(), held.min())
        self.assertTrue(set(np.flatnonzero(person == "p1")) == set(fit) | set(held))

    def test_small_people_are_dropped(self):
        X, person = toy(per=5)
        self.assertEqual(P.split_people(person), {})

    def test_own_generators_use_only_own_fit_windows(self):
        X, person = toy()
        real, fakes = P.build(X, person, 0, generators=("own replay", "own stitch50"))
        for g, (ff, fh, of, oh) in fakes.items():
            for p in ("p0", "p3"):
                lo = 10 * int(p[1]) - 6
                hi = 10 * int(p[1]) + 6
                self.assertTrue(((ff[of == p] > lo) & (ff[of == p] < hi) | (ff[of == p] == 0)).all(), g)

    def test_pooled_generators_exclude_the_person(self):
        X, person = toy()
        _, fakes = P.build(X, person, 0, generators=("pooled replay",))
        ff, _, of, _ = fakes["pooled replay"]
        # p3's windows are centred near 30: a pooled fake for p3 must come from others (< 20)
        self.assertLess(ff[of == "p3"].mean(), 20)

    def test_param_shapes_and_range(self):
        X, person = toy()
        _, fakes = P.build(X, person, 0, generators=("own param",))
        ff, fh, of, oh = fakes["own param"]
        self.assertEqual(ff.shape[1:], (100, 12))
        self.assertEqual(len(ff), len(of))
        self.assertTrue((ff >= -100).all() and (ff <= 100).all())


if __name__ == "__main__":
    unittest.main()
