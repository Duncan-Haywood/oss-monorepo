import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import qualstrat as qs  # noqa: E402


class DrawTests(unittest.TestCase):
    def setUp(self):
        self.a, self.b = list(range(100)), list(range(100, 1000))

    def test_equal_design_splits_the_audit_evenly(self):
        ga, gb = qs.draw("equal", 60, self.a, self.b, random.Random(1))
        self.assertEqual((len(ga), len(gb)), (30, 30))
        self.assertTrue(set(ga) <= set(self.a) and set(gb) <= set(self.b))

    def test_random_design_follows_group_sizes(self):
        rng = random.Random(2)
        shares = [len(qs.draw("random", 100, self.a, self.b, rng)[0]) / 100 for _ in range(300)]
        self.assertAlmostEqual(sum(shares) / len(shares), 0.1, delta=0.02)

    def test_no_item_is_drawn_twice(self):
        ga, gb = qs.draw("random", 200, self.a, self.b, random.Random(3))
        self.assertEqual(len(set(ga + gb)), 200)

    def test_group_cannot_exceed_its_size(self):
        ga, gb = qs.draw("equal", 400, self.a, self.b, random.Random(4))
        self.assertEqual(len(ga), 100)
        self.assertEqual(len(gb), 300)  # the unused budget goes to B

    def test_neyman_share_follows_error_spread(self):
        llm = [0] * 1000
        human = [1 if i % 2 == 0 and i < 100 else 0 for i in range(1000)]  # group A errors vary, group B none
        self.assertGreater(qs.allocation(llm, human, self.a, self.b), 0.95)
        human2 = [i % 2 for i in range(1000)]
        self.assertAlmostEqual(qs.allocation(llm, human2, self.a, self.b), 0.5, delta=0.02)

    def test_stratified_gap_interval_is_narrower_for_a_rare_group(self):
        rng = random.Random(5)
        n = 1000
        human = [int(rng.random() < 0.3) for _ in range(n)]
        llm = [h if rng.random() < 0.85 else 1 - h for h in human]
        w = {}
        for d in ("random", "equal"):
            tot = 0
            for _ in range(100):
                ga, gb = qs.draw(d, 100, self.a, self.b, rng)
                tot += qs.qg.ppi_gap(llm, human, self.a, self.b, ga, gb)[1]
            w[d] = tot
        self.assertLess(w["equal"], w["random"])


if __name__ == "__main__":
    unittest.main()
