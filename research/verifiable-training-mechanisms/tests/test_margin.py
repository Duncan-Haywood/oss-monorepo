"""Tests for the real-training drift and margin harness (needs numpy and scikit-learn; skipped without)."""
import unittest

try:
    import numpy as np
    from vtm.margin import bootstrap_ci, grad, init, load_digits_split, loss, train
    HAVE = True
except ImportError:
    HAVE = False


@unittest.skipUnless(HAVE, "numpy or scikit-learn missing")
class MarginTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = load_digits_split()

    def test_gradient_matches_finite_differences(self):
        w = init(np.random.default_rng(1)).astype(np.float64).astype(np.float32)
        x, y = self.data[0][:32], self.data[1][:32]
        g = grad(w, x, y)
        rng = np.random.default_rng(2)
        for i in rng.choice(len(w), 12, replace=False):
            e = np.zeros_like(w)
            e[i] = 1e-2
            fd = (loss(w + e, x, y) - loss(w - e, x, y)) / 2e-2
            self.assertAlmostEqual(float(g[i]), fd, delta=2e-3 + 0.05 * abs(fd))

    def test_zero_tolerance_cheater_is_honest(self):
        w0, _ = train(self.data, 3, steps=60)
        w1, info = train(self.data, 3, steps=60, strategy="skip", tau=0.0)
        self.assertEqual(info["cheated"], 0.0)
        self.assertTrue(np.array_equal(w0, w1))

    def test_huge_tolerance_skip_never_trains(self):
        w, info = train(self.data, 3, steps=40, strategy="skip", tau=1e3)
        self.assertEqual(info["cheated"], 1.0)
        self.assertTrue(np.array_equal(w, init(np.random.default_rng(3))))

    def test_training_reaches_good_heldout_accuracy(self):
        from vtm.margin import accuracy
        w, _ = train(self.data, 0, steps=600)
        self.assertGreater(accuracy(w, self.data[2], self.data[3]), 0.9)

    def test_bootstrap_interval_contains_mean(self):
        v = np.random.default_rng(0).normal(1.0, 0.1, 20)
        lo, hi = bootstrap_ci(v)
        self.assertLess(lo, v.mean())
        self.assertGreater(hi, v.mean())


if __name__ == "__main__":
    unittest.main()
