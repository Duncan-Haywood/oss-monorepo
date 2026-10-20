import random
import unittest

import qualhyp as h


class Tests(unittest.TestCase):
    def test_effect_sign_and_zero(self):
        d, z = h.effect(30, 100, 10, 100)
        self.assertAlmostEqual(d, 0.2)
        self.assertGreater(z, 0)
        self.assertEqual(h.effect(0, 10, 0, 10)[1], 0.0)

    def test_p_value(self):
        self.assertAlmostEqual(h.p_two_sided(h.Z95), 0.05, places=6)
        self.assertEqual(h.p_two_sided(0.0), 1.0)

    def test_bh(self):
        self.assertEqual(h.benjamini_hochberg([0.001, 0.2, 0.9, 0.012]), {0, 3})
        self.assertEqual(h.benjamini_hochberg([0.5, 0.9]), set())

    def test_propose_finds_planted_word(self):
        rng = random.Random(1)
        docs, labels = [], []
        for _ in range(400):
            y = rng.random() < 0.5
            f = {"filler", "the"}
            if y and rng.random() < 0.8:
                f.add("planted")
            docs.append(f)
            labels.append(int(y))
        self.assertEqual(h.propose(docs, labels, 1)[0][0], "planted")

    def test_replication_and_null(self):
        rng = random.Random(2)
        def mk(n, signal):
            ys = [rng.random() < 0.5 for _ in range(n)]
            return [({"w"} if (y and signal) or rng.random() < 0.3 else set()) for y in ys], [int(y) for y in ys]

        disc, held = mk(600, True), mk(2000, True)
        res = h.test_hypotheses(h.propose(*disc, 1), *held)
        self.assertTrue(res[0][4])
        disc, held = mk(600, False), mk(2000, False)
        self.assertFalse(h.test_hypotheses(h.propose(*disc, 1), *held)[0][4])

    def test_restates_label(self):
        self.assertTrue(h.restates_label("hate"))
        self.assertTrue(h.restates_label("anger"))
        self.assertFalse(h.restates_label("lol"))

    def test_split_disjoint_sizes(self):
        ex = [(str(i), f"word{i}", i % 2, 1) for i in range(100)]
        d, t = h.split(ex, 30, 50, random.Random(0))
        self.assertEqual((len(d[0]), len(t[0])), (30, 50))


if __name__ == "__main__":
    unittest.main()
