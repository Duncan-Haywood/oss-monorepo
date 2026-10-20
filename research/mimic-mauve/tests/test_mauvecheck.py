import os, sys, unittest
import numpy as np

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import mauvecheck as m  # noqa: E402


def toy(rng, n, shift):
    a = ["cat", "dog", "tree", "river", "stone", "light"]
    b = ["moreover", "furthermore", "delve", "tapestry", "realm", "robust"]
    return [" ".join(rng.choice(a + (b * shift)) for _ in range(25)) for _ in range(n)]


class T(unittest.TestCase):
    def test_distinct2_bounds(self):
        self.assertEqual(m.distinct2(["a b a b a b"]), 2 / 5)
        self.assertEqual(m.distinct2([""]), 0.0)

    def test_embed_unit_norm(self):
        rng = np.random.RandomState(0)
        Z = m.embed(toy(rng, 40, 0))
        self.assertTrue(np.allclose(np.linalg.norm(Z, axis=1), 1.0))

    def test_mauve_orders_a_shifted_source_below_the_null(self):
        rng = np.random.RandomState(1)
        h = toy(rng, 100, 0)
        g = toy(rng, 50, 20)
        cell = m.cell(h, g, rng, 50)
        self.assertLess(cell["mauve"], cell["null"])
        self.assertGreater(cell["auroc"], 0.9)

    def test_null_is_high(self):
        rng = np.random.RandomState(2)
        h = toy(rng, 100, 0)
        Z = m.embed(h)
        self.assertGreater(m.mauve_score(Z[:50], Z[50:]), 0.8)


if __name__ == "__main__":
    unittest.main()
