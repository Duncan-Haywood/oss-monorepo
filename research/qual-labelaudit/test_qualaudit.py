import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import qualaudit as qa  # noqa: E402


def corpus(n=2000, prev=0.2, acc=0.85, seed=1):
    rng = random.Random(seed)
    human = [int(rng.random() < prev) for _ in range(n)]
    llm = [h if rng.random() < acc else 1 - h for h in human]
    return llm, human


class DrawTests(unittest.TestCase):
    def setUp(self):
        self.llm, self.human = corpus()
        self.neg, self.pos = qa.strata(self.llm)

    def test_strata_partition_the_corpus(self):
        self.assertEqual(sorted(self.neg + self.pos), list(range(len(self.llm))))
        self.assertTrue(all(self.llm[i] for i in self.pos))

    def test_equal_design_splits_by_coder_label(self):
        gn, gp = qa.draw("equal", 100, self.neg, self.pos, random.Random(2))
        self.assertEqual((len(gn), len(gp)), (50, 50))

    def test_positives_design_audits_only_positives(self):
        gn, gp = qa.draw("positives", 100, self.neg, self.pos, random.Random(3))
        self.assertEqual((len(gn), len(gp)), (0, 100))

    def test_random_design_has_no_repeats(self):
        gn, gp = qa.draw("random", 300, self.neg, self.pos, random.Random(4))
        self.assertEqual(len(set(gn + gp)), 300)

    def test_perfect_audit_recovers_truth(self):
        est, se = qa.stratified(self.human, self.neg, self.pos, self.neg, self.pos)
        self.assertAlmostEqual(est, sum(self.human) / len(self.human), places=9)

    def test_stratified_is_unbiased(self):
        rng = random.Random(5)
        truth = sum(self.human) / len(self.human)
        ests = [qa.stratified(self.human, self.neg, self.pos, *qa.draw("equal", 100, self.neg, self.pos, rng))[0]
                for _ in range(600)]
        self.assertAlmostEqual(sum(ests) / len(ests), truth, delta=0.004)

    def test_positives_only_is_biased_by_the_miss_rate(self):
        rng = random.Random(6)
        truth = sum(self.human) / len(self.human)
        miss = sum(self.human[i] for i in self.neg) / len(self.human)  # positives the coder labelled negative
        ests = [qa.stratified(self.human, self.neg, self.pos, *qa.draw("positives", 100, self.neg, self.pos, rng),
                              assume_zero_negatives=True)[0] for _ in range(300)]
        self.assertAlmostEqual(truth - sum(ests) / len(ests), miss, delta=0.006)
        self.assertGreater(miss, 0.02)

    def test_empty_stratum_raises_unless_assumed(self):
        with self.assertRaises(ValueError):
            qa.stratified(self.human, self.neg, self.pos, [], self.pos[:10])

    def test_neyman_share_follows_stratum_spread(self):
        human = [0] * 1000
        neg, pos = list(range(900)), list(range(900, 1000))
        for i in pos[::2]:
            human[i] = 1  # all the variance is among coder-positives
        self.assertGreater(qa.allocation(human, neg, pos), 0.99)


if __name__ == "__main__":
    unittest.main()
