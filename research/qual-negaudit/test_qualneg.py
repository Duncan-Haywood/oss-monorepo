import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import qualneg as qn  # noqa: E402


def corpus(n=3000, prev=0.25, recall=0.6, fp=0.05, seed=1):
    rng = random.Random(seed)
    human = [int(rng.random() < prev) for _ in range(n)]
    llm = [int(rng.random() < (recall if h else fp)) for h in human]
    return llm, human


class NegAuditTests(unittest.TestCase):
    def setUp(self):
        self.llm, self.human = corpus()
        self.neg, self.pos = qn.qa.strata(self.llm)
        self.truth = sum(self.human) / len(self.human)

    def test_weighted_estimate_is_unbiased_with_negatives(self):
        rng = random.Random(3)
        est = [qn.estimate(self.human, self.neg, self.pos, 200, 0.5, rng)[0] for _ in range(400)]
        self.assertAlmostEqual(sum(est) / len(est), self.truth, delta=0.01)

    def test_positives_only_is_biased_by_the_miss_rate(self):
        rng = random.Random(4)
        miss = sum(self.human[i] for i in self.neg) / len(self.human)
        est = []
        for _ in range(200):
            gp = rng.sample(self.pos, 100)
            est.append(qn.qa.stratified(self.human, self.neg, self.pos, [], gp, assume_zero_negatives=True)[0])
        self.assertAlmostEqual(self.truth - sum(est) / len(est), miss, delta=0.01)

    def test_inclusion_probabilities_are_stratum_rates(self):
        p_neg, p_pos = qn.inclusion_probabilities(self.neg, self.pos, 100, 0.9)
        self.assertAlmostEqual(p_neg, 10 / len(self.neg))
        self.assertAlmostEqual(p_pos, 90 / len(self.pos))

    def test_at_least_two_negatives(self):
        self.assertEqual(qn.negatives_needed(100, 1.0), 2)


if __name__ == "__main__":
    unittest.main()
