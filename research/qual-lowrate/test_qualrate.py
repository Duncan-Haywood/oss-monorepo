import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import qualrate as qr  # noqa: E402


def corpus(n=3000, prev=0.25, acc=0.8, seed=1):
    rng = random.Random(seed)
    human = [int(rng.random() < prev) for _ in range(n)]
    llm = [h if rng.random() < acc else 1 - h for h in human]
    return llm, human


class LowRateTests(unittest.TestCase):
    def setUp(self):
        self.llm, self.human = corpus()
        self.neg, self.pos = qr.qa.strata(self.llm)
        self.truth = sum(self.human) / len(self.human)

    def test_draw_gives_the_requested_negative_share(self):
        gn, gp = qr.draw(200, 0.1, self.neg, self.pos, random.Random(2))
        self.assertEqual((len(gn), len(gp)), (20, 180))

    def test_zero_share_audits_positives_only(self):
        gn, gp = qr.draw(100, 0.0, self.neg, self.pos, random.Random(3))
        self.assertEqual((len(gn), len(gp)), (0, 100))

    def test_weighted_estimate_equals_stratified(self):
        gn, gp = qr.draw(150, 0.2, self.neg, self.pos, random.Random(4))
        est, _ = qr.qa.stratified(self.human, self.neg, self.pos, gn, gp)
        self.assertAlmostEqual(qr.weighted_prevalence(self.human, self.neg, self.pos, gn, gp), est, places=9)

    def test_low_rate_is_unbiased(self):
        rng = random.Random(5)
        ests = [qr.weighted_prevalence(self.human, self.neg, self.pos, *qr.draw(200, 0.1, self.neg, self.pos, rng))
                for _ in range(800)]
        self.assertAlmostEqual(sum(ests) / len(ests), self.truth, delta=0.006)

    def test_lower_rate_is_wider_when_the_coder_misses(self):
        rng = random.Random(6)
        widths = {}
        for share in (0.05, 0.5):
            se = [qr.qa.stratified(self.human, self.neg, self.pos, *qr.draw(200, share, self.neg, self.pos, rng))[1]
                  for _ in range(300)]
            widths[share] = sum(se) / len(se)
        self.assertGreater(widths[0.05], widths[0.5])

    def test_inclusion_rates_up_weight_the_sparse_stratum(self):
        r_neg, r_pos = qr.sampling_rates(200, 0.1, self.neg, self.pos)
        self.assertLess(r_neg, r_pos)
        self.assertAlmostEqual(r_neg * len(self.neg), 20, places=6)

    def test_recall_is_exact_with_full_audit(self):
        tp = sum(self.human[i] for i in self.pos)
        fn = sum(self.human[i] for i in self.neg)
        self.assertAlmostEqual(qr.recall(self.human, self.neg, self.pos, self.neg, self.pos), tp / (tp + fn), places=9)


if __name__ == "__main__":
    unittest.main()
