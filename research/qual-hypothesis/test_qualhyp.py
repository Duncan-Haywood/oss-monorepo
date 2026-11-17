import math
import random
import unittest

import qualhyp as h


class Tests(unittest.TestCase):
    def test_effect_sign_and_zero(self):
        d, z = h.effect(30, 100, 10, 100)
        self.assertAlmostEqual(d, 0.2)
        self.assertGreater(z, 0)
        self.assertEqual(h.effect(0, 10, 0, 10)[1], 0.0)

    def test_p_value(self):
        self.assertAlmostEqual(h.p_two_sided(h.Z95), 0.05, places=6)
        self.assertEqual(h.p_two_sided(0.0), 1.0)

    def test_bh(self):
        self.assertEqual(h.benjamini_hochberg([0.001, 0.2, 0.9, 0.012]), {0, 3})
        self.assertEqual(h.benjamini_hochberg([0.5, 0.9]), set())

    def test_propose_finds_planted_word(self):
        rng = random.Random(1)
        docs, labels = [], []
        for _ in range(400):
            y = rng.random() < 0.5
            f = {"filler", "the"}
            if y and rng.random() < 0.8:
                f.add("planted")
            docs.append(f)
            labels.append(int(y))
        self.assertEqual(h.propose(docs, labels, 1)[0][0], "planted")

    def test_replication_and_null(self):
        rng = random.Random(2)
        def mk(n, signal):
            ys = [rng.random() < 0.5 for _ in range(n)]
            return [({"w"} if (y and signal) or rng.random() < 0.3 else set()) for y in ys], [int(y) for y in ys]

        disc, held = mk(600, True), mk(2000, True)
        res = h.test_hypotheses(h.propose(*disc, 1), *held)
        self.assertTrue(res[0][4])
        disc, held = mk(600, False), mk(2000, False)
        self.assertFalse(h.test_hypotheses(h.propose(*disc, 1), *held)[0][4])

    def test_restates_label(self):
        self.assertTrue(h.restates_label("hate"))
        self.assertTrue(h.restates_label("anger"))
        self.assertFalse(h.restates_label("lol"))

    def test_split_disjoint_sizes(self):
        ex = [(str(i), f"word{i}", i % 2, 1) for i in range(100)]
        d, t = h.split(ex, 30, 50, random.Random(0))
        self.assertEqual((len(d[0]), len(t[0])), (30, 50))


    # Added by quality audit round 53 (portfolio/quality/audits/2026-11-12-qual-hypothesis.json): five seeded
    # bugs (Bonferroni for BH, sign check removed, min_count off, pooled p corrupted, |d| ranking) left tests green.
    def test_bh_is_not_bonferroni(self):
        # BH step-up rejects all four (0.04 <= 0.05); Bonferroni (0.0125) would reject only the first
        self.assertEqual(h.benjamini_hochberg([0.01, 0.02, 0.03, 0.04]), {0, 1, 2, 3})

    def test_pooled_z_by_hand(self):
        # 30/100 vs 10/100: pooled p 0.2, se sqrt(0.16 * 0.02) = 0.056569, z = 0.2 / se = 3.535534
        self.assertAlmostEqual(h.effect(30, 100, 10, 100)[1], 0.2 / math.sqrt(0.16 * 0.02), places=9)

    def test_replication_needs_same_sign(self):
        docs = [{"w"}] * 300 + [set()] * 700 + [{"w"}] * 100 + [set()] * 900
        labels = [1] * 1000 + [0] * 1000
        (row,) = h.test_hypotheses([("w", -0.1)], docs, labels)
        self.assertLess(row[3], 1e-6)   # held-out effect +0.2 is significant
        self.assertFalse(row[4])        # but discovery said negative, so it does not replicate
        (row,) = h.test_hypotheses([("w", 0.1)], docs, labels)
        self.assertTrue(row[4])

    def test_min_count_filter(self):
        docs = [{"rare"}] * 4 + [set()] * 96 + [set()] * 100
        labels = [1] * 100 + [0] * 100
        self.assertEqual(h.propose(docs, labels, 5), [])
        self.assertEqual(h.propose(docs, labels, 5, min_count=4)[0][0], "rare")

    def test_proposer_ranks_by_z_not_raw_difference(self):
        # A: 6/100 vs 0/100, d 0.06, z 2.49; B: 50/100 vs 40/100, d 0.10, z 1.42
        docs = [{"A", "B"}] * 6 + [{"B"}] * 44 + [set()] * 50 + [{"B"}] * 40 + [set()] * 60
        labels = [1] * 100 + [0] * 100
        self.assertEqual(h.propose(docs, labels, 1)[0][0], "A")


if __name__ == "__main__":
    unittest.main()
