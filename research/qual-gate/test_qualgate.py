import random
import unittest

import qualgate as g


class Tests(unittest.TestCase):
    def test_bias_z_zero_when_identical(self):
        self.assertEqual(g.bias_z([1, 0, 1, 0], [1, 0, 1, 0]), 0.0)

    def test_bias_z_sign_and_size(self):
        human = [1] * 50 + [0] * 150
        coder = [1] * 100 + [0] * 100  # over-codes
        self.assertLess(g.bias_z(coder, human), -3)
        self.assertGreater(g.bias_z(human, coder), 3)

    def test_gate_trusts_unbiased_and_corrects_biased(self):
        rng = random.Random(3)
        n = 4000
        human = [int(rng.random() < 0.3) for _ in range(n)]
        good = [h if rng.random() > (0.14 if h else 0.06) else 1 - h for h in human]  # 0.3*0.14 = 0.7*0.06: no bias
        bad = [1 if h else int(rng.random() < 0.5) for h in human]       # strong over-coding
        gold = rng.sample(range(n), 400)
        _, _, used_good = g.gated(good, [good[i] for i in gold], [human[i] for i in gold])
        est, _, used_bad = g.gated(bad, [bad[i] for i in gold], [human[i] for i in gold])
        self.assertFalse(used_good)
        self.assertTrue(used_bad)
        self.assertAlmostEqual(est, sum(human) / n, delta=0.08)

    def test_threshold_coder_prevalence(self):
        scores = list(range(100))
        human = [1] * 20 + [0] * 80
        for ratio in (0.5, 1.0, 1.5):
            c = g.threshold_coder(scores, human, ratio)
            self.assertEqual(sum(c), round(ratio * 20))
        self.assertEqual(sum(g.threshold_coder(scores, human, 0)), 0)

    def test_gate_rate_follows_bias(self):
        rng = random.Random(4)
        n = 3000
        human = [int(rng.random() < 0.3) for _ in range(n)]
        scores = [h + rng.random() * 1.5 for h in human]
        def used(ratio):
            c = g.threshold_coder(scores, human, ratio)
            u = 0
            for _ in range(200):
                gold = rng.sample(range(n), 200)
                u += g.gated(c, [c[i] for i in gold], [human[i] for i in gold])[2]
            return u / 200
        self.assertLess(used(1.0), 0.15)
        self.assertGreater(used(1.5), 0.9)


if __name__ == "__main__":
    unittest.main()
