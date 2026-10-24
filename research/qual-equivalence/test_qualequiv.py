import random
import unittest

import qualequiv as e


class Tests(unittest.TestCase):
    def test_identical_codes_pass_any_tolerance_with_zero_variance(self):
        # no disagreement: se = 0, so the interval is the single point 0, inside (-delta, delta)
        self.assertTrue(e.equivalent([1, 0] * 10, [1, 0] * 10, 0.01))

    def test_large_bias_never_equivalent(self):
        human = [1] * 50 + [0] * 150
        coder = [1] * 100 + [0] * 100
        self.assertFalse(e.equivalent(coder, human, 0.05))

    def test_small_sample_noisy_audit_does_not_pass_tight_tolerance(self):
        rng = random.Random(1)
        human = [int(rng.random() < 0.3) for _ in range(100)]
        coder = [h if rng.random() > 0.2 else 1 - h for h in human]
        self.assertFalse(e.equivalent(coder, human, 0.01))

    def test_gate_corrects_when_not_equivalent(self):
        rng = random.Random(3)
        n = 4000
        human = [int(rng.random() < 0.3) for _ in range(n)]
        bad = [1 if h else int(rng.random() < 0.5) for h in human]
        gold = rng.sample(range(n), 400)
        est, _, used = e.gated_equiv(bad, [bad[i] for i in gold], [human[i] for i in gold], 0.02)
        self.assertTrue(used)
        self.assertAlmostEqual(est, sum(human) / n, delta=0.08)

    def test_split_gate_uses_half_the_sample_for_correction(self):
        human = [1] * 40 + [0] * 160
        coder = [1] * 100 + [0] * 100
        est, se, used = e.split_gated(coder, coder, human)
        self.assertTrue(used)
        self.assertGreater(se, 0)

    def test_audit_size_formula(self):
        self.assertAlmostEqual(e.tost_audit_size(0.5, 0.05), (e.Z90 * 0.5 / 0.05) ** 2)
        self.assertEqual(e.tost_audit_size(0.5, 0.01, true_bias=0.02), float("inf"))


if __name__ == "__main__":
    unittest.main()
