import os, random, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from swe_bootstrap.boot import *

class T(unittest.TestCase):
    def test_length_and_membership(self):
        s = [(i, 10.0) for i in range(7)]
        r = block_resample(s, 3, random.Random(1))
        self.assertEqual(len(r), 7); self.assertTrue(all(x in s for x in r))
    def test_blocks_are_contiguous(self):
        s = [(i, 10.0) for i in range(20)]
        r = block_resample(s, 4, random.Random(2))
        steps = sum((r[i + 1][0] - r[i][0]) % 20 == 1 for i in range(19))
        self.assertGreaterEqual(steps, 19 - 4)  # at most the block joins break contiguity
    def test_block_one_is_iid(self):
        s = [(i, 1.0) for i in range(50)]
        self.assertNotEqual(block_resample(s, 1, random.Random(3)), s)
    def test_percentile_ci(self):
        lo, hi = percentile_ci(list(range(101)))
        self.assertEqual((lo, hi), (2, 98))
    def test_deterministic(self):
        seqs = {"a": [(2, 50.0)] * 6, "b": [(1, 50.0)] * 6}
        a = paired_diffs([Uniform, Greedy], seqs, 200, 5, 2, 2)
        b = paired_diffs([Uniform, Greedy], seqs, 200, 5, 2, 2)
        self.assertEqual(a, b)
    def test_greedy_beats_uniform_on_separated_arms(self):
        seqs = {"a": [(3, 50.0)] * 30, "b": [(1, 50.0)] * 30}
        d, _ = paired_diffs([Uniform, Greedy], seqs, 1000, 5, 3, 3)
        self.assertTrue(all(x > 0 for x in d["greedy"]))
