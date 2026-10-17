import random
import unittest
from gossip_consensus import *


class T(unittest.TestCase):
    def test_mean_conserved(self):
        rng = random.Random(1)
        x = [rng.gauss(0, 1) for _ in range(10)]
        m = sum(x) / 10
        for _ in range(20):
            matching_round(x, rng)
        self.assertAlmostEqual(sum(x) / 10, m, places=12)

    def test_pair_contraction_exact(self):
        # exact expectation over all pairs
        n = 7
        rng = random.Random(2)
        x = [rng.gauss(0, 1) for _ in range(n)]
        tot = 0.0
        pairs = [(i, j) for i in range(n) for j in range(i + 1, n)]
        for i, j in pairs:
            y = list(x)
            pair_step(y, i, j)
            tot += phi(y)
        self.assertAlmostEqual(tot / len(pairs) / phi(x), pair_contraction(n), places=12)

    def test_matching_contraction_mc(self):
        self.assertAlmostEqual(mean_contraction(16, "match", reps=3000), matching_contraction(16), delta=0.02)

    def test_stationary_phi(self):
        n, s2 = 12, 0.5
        self.assertAlmostEqual(steady_phi(n, s2, rounds=1500, burn=100) / stationary_phi(n, s2), 1.0, delta=0.05)

    def test_clip_is_noop_when_close(self):
        x = [0.0, 0.1]
        pair_step(x, 0, 1, tau=1.0)
        self.assertAlmostEqual(x[0], 0.05)

    def test_stubborn_gap_decay(self):
        n, c, t = 8, 5.0, 40
        m, _ = stubborn_run(n, c, t, reps=3000)
        pred = c - (c - 0.0) * stubborn_gap_decay(n) ** t
        self.assertAlmostEqual(m, pred, delta=0.07)

    def test_clip_bounds_drift(self):
        n, c, t, tau = 8, 100.0, 200, 0.5
        m, _ = stubborn_run(n, c, t, tau=tau, reps=400)
        self.assertLessEqual(m, t * clipped_drift_rate(n, tau) + 0.15)


if __name__ == "__main__":
    unittest.main()
