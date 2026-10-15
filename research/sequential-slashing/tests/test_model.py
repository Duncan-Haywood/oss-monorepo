import os, sys, unittest, math, random
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from sequential_slashing import *


class T(unittest.TestCase):
    def test_kl(self):
        self.assertAlmostEqual(kl(0.3, 0.3), 0.0)
        self.assertGreater(kl(0.3, 0.2), 0)

    def test_martingale_mean_one(self):
        p = 0.2
        for q in (0.3, 0.5):
            self.assertAlmostEqual(p * lr_step(1, p, q) + (1 - p) * lr_step(0, p, q), 1.0)
        for lam in mixture_grid(p, 8):
            self.assertAlmostEqual(p * bet_step(1, p, lam) + (1 - p) * bet_step(0, p, lam), 1.0)
            self.assertGreater(bet_step(0, p, lam), 0)

    def test_ville_bound_holds(self):
        r = false_slash_rate("lr", 0.2, 0.1, 500, 800, q=0.3)
        self.assertLessEqual(r, 0.1 + 0.03)

    def test_peeking_inflates(self):
        r = false_slash_rate("z", 0.2, 0.05, 1000, 500)
        self.assertGreater(r, 0.15)

    def test_wald_lower_bound_and_tightness(self):
        ts = detection_times("lr", 0.2, 0.3, 0.05, 3000, 300)
        m = sum(t for t in ts if t) / sum(t is not None for t in ts)
        w = wald_lower(0.05, 0.3, 0.2)
        self.assertGreater(m, 0.9 * w)
        self.assertLess(m, 1.5 * w)

    def test_mixture_detects_slower_than_oracle_but_detects(self):
        a = detection_times("lr", 0.2, 0.3, 0.05, 3000, 60)
        b = detection_times("mixture", 0.2, 0.3, 0.05, 3000, 60, K=16)
        self.assertGreater(sum(t is not None for t in b), 55)
        ma = sum(t for t in a if t) / sum(t is not None for t in a)
        mb = sum(t for t in b if t) / sum(t is not None for t in b)
        self.assertGreater(mb, ma)


if __name__ == "__main__":
    unittest.main()
