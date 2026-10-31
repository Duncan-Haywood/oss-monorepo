import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
try:
    import numpy as np
    import boosted
except ImportError:  # numpy/pandas/lightgbm absent: skip
    boosted = None


@unittest.skipIf(boosted is None, "needs numpy, pandas, lightgbm")
class T(unittest.TestCase):
    def test_pin_hand(self):
        # y=10, q=4, tau=.9 -> .9*6 = 5.4 ; y=2, q=4 -> (.9-1)*(-2) = .2
        self.assertAlmostEqual(float(boosted.pin(np.array([10.0]), 4.0, .9)[0]), 5.4)
        self.assertAlmostEqual(float(boosted.pin(np.array([2.0]), 4.0, .9)[0]), 0.2)

    def test_block_boot_constant(self):
        d = np.full(20, -1.5)
        w = np.array(["a"] * 10 + ["b"] * 10)
        m, lo, hi = boosted.block_boot(d, w, n_boot=200)
        self.assertEqual((m, lo, hi), (-1.5, -1.5, -1.5))

    def test_block_boot_mean_in_interval(self):
        rng = np.random.default_rng(1)
        d = rng.normal(-1, 2, 600)
        w = np.array([str(i // 20) for i in range(600)])
        m, lo, hi = boosted.block_boot(d, w, n_boot=500)
        self.assertLess(lo, m); self.assertLess(m, hi)


if __name__ == "__main__":
    unittest.main()
