import math, random, unittest
from private_markets import (TreeCounter, NaiveCounter, tree_levels, nodes_touched,
                             lmsr_cost, lmsr_price, simulate)


class T(unittest.TestCase):
    def test_exact_when_no_noise(self):
        c = TreeCounter(100, float("inf")); s = 0
        rng = random.Random(1)
        for _ in range(100):
            x = rng.uniform(-1, 1); s += x
            self.assertAlmostEqual(c.push(x), s)

    def test_sensitivity_is_L(self):
        # each step touches <= L nodes, hence node-vector L1 sensitivity <= L*delta
        for Tn in (1, 7, 64, 100, 1000):
            L = tree_levels(Tn)
            for t in range(1, Tn + 1):
                self.assertLessEqual(len(nodes_touched(t, Tn)), L)

    def test_noise_is_zero_mean_and_tree_beats_naive(self):
        Tn, eps, R = 256, 1.0, 300
        def mse(cls):
            tot = 0.0
            for r in range(R):
                c = cls(Tn, eps, seed=r); s = 0
                for i in range(Tn):
                    s += 0.5
                    v = c.push(0.5)
                tot += (v - s) ** 2
            return tot / R
        self.assertLess(mse(TreeCounter), mse(NaiveCounter) / 10)

    def test_lmsr(self):
        self.assertAlmostEqual(lmsr_cost(0, 3), 3 * math.log(2))
        self.assertAlmostEqual(lmsr_price(0, 3), 0.5)
        self.assertAlmostEqual(lmsr_cost(-1000, 3), 0, places=6)

    def test_pathwise_loss_bound(self):
        for seed in range(200):
            for eps in (0.3, 2.0, float("inf")):
                r = simulate(120, 4.0, eps, seed)
                self.assertLessEqual(r.mm_loss, r.bound + 1e-9)

    def test_no_privacy_loss_within_b_ln2(self):
        for seed in range(50):
            r = simulate(100, 5.0, float("inf"), seed)
            self.assertLessEqual(r.mm_loss, 5.0 * math.log(2) + 1e-9)


if __name__ == "__main__":
    unittest.main()
