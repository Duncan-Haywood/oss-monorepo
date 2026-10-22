import unittest
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import qualgap as qg  # noqa: E402

q = qg.q


def corpus(n=4000, seed=1, pa=0.4, pb=0.2, sens=0.8, spec=0.9):
    rng = random.Random(seed)
    group_a = set(range(n // 2))
    human = [int(rng.random() < (pa if i in group_a else pb)) for i in range(n)]
    llm = [int(rng.random() < (sens if h else 1 - spec)) for h in human]
    return human, llm, group_a


class GapTests(unittest.TestCase):
    def test_perfect_coder_gives_exact_gap(self):
        human, _, a = corpus()
        llm = list(human)
        a_all = sorted(a)
        b_all = [i for i in range(len(human)) if i not in a]
        truth = q.mean([human[i] for i in a_all]) - q.mean([human[i] for i in b_all])
        self.assertAlmostEqual(qg.naive_gap(llm, a_all, b_all)[0], truth)
        gold = random.Random(2).sample(range(len(human)), 200)
        ga, gb = qg.split(gold, a)
        est = qg.ppi_gap(llm, human, a_all, b_all, ga, gb)
        self.assertAlmostEqual(est[0], truth)

    def test_ppi_gap_is_unbiased_and_naive_is_not(self):
        human, llm, a = corpus(sens=0.6, spec=0.95)
        a_all = sorted(a)
        b_all = [i for i in range(len(human)) if i not in a]
        truth = q.mean([human[i] for i in a_all]) - q.mean([human[i] for i in b_all])
        rng = random.Random(3)
        ppi_m, hits = [], 0
        for _ in range(200):
            ga, gb = qg.split(rng.sample(range(len(human)), 400), a)
            ppi_m.append(qg.ppi_gap(llm, human, a_all, b_all, ga, gb)[0])
            hits += q.covers(qg.ppi_gap(llm, human, a_all, b_all, ga, gb)[:2], truth)
        self.assertAlmostEqual(q.mean(ppi_m), truth, delta=0.01)
        self.assertGreater(hits / 200, 0.9)
        self.assertGreater(abs(qg.naive_gap(llm, a_all, b_all)[0] - truth), 0.03)

    def test_gap_bias_zero_when_coder_perfect(self):
        human, _, a = corpus()
        ga, gb = qg.split(range(0, 4000, 5), a)
        m, _ = qg.gap_bias(human, human, ga, gb)
        self.assertEqual(m, 0)
        self.assertEqual(qg.gap_z(human, human, ga, gb), 0.0)

    def test_gap_bias_detects_differential_error(self):
        # coder misses half of group A's positives and none of group B's: overall bias is small, gap bias is not
        human, _, a = corpus()
        llm = [h if (i not in a or i % 2) else 0 for i, h in enumerate(human)]
        ga, gb = qg.split(range(len(human)), a)
        m, se = qg.gap_bias(llm, human, ga, gb)
        self.assertGreater(m / se, 5)

    def test_gated_gap_corrects_a_biased_coder(self):
        human, llm, a = corpus(sens=0.5)
        a_all = sorted(a)
        b_all = [i for i in range(len(human)) if i not in a]
        gold = random.Random(4).sample(range(len(human)), 800)
        ga, gb = qg.split(gold, a)
        for rule in ("overall", "gap"):
            self.assertTrue(qg.gated_gap(llm, human, a_all, b_all, ga, gb, rule)[2])
        self.assertTrue(qg.gated_gap(llm, human, a_all, b_all, ga, gb, "tost", 0.01)[2])

    def test_unknown_rule_raises(self):
        human, llm, a = corpus()
        ga, gb = qg.split(range(0, 4000, 5), a)
        with self.assertRaises(ValueError):
            qg.gated_gap(llm, human, [0], [1], ga, gb, "nope")


if __name__ == "__main__":
    unittest.main()
