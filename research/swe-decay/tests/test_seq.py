import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from swe_decay.seq import *

class T(unittest.TestCase):
    def test_budget_and_exhaustion(self):
        seqs = {"a": [(1, 50.0)] * 3}
        v, runs, ex = run_seq(Uniform, seqs, 10000, 0)
        self.assertEqual((v, runs, ex), (3, 3, 1))  # track runs dry before the budget
    def test_order_is_preserved(self):
        seqs = {"a": [(3, 100.0), (1, 100.0)]}
        self.assertEqual(run_seq(Uniform, seqs, 100, 0)[0], 3)  # first pull is the first project
    def test_best_fixed_arm(self):
        seqs = {"a": [(3, 100.0)] * 2, "b": [(1, 100.0)] * 5}
        self.assertEqual(best_fixed_arm(seqs, 200), ("a", 6))
    def test_hindsight_takes_best_ratio_first(self):
        seqs = {"a": [(3, 100.0), (1, 100.0)], "b": [(2, 100.0)]}
        self.assertEqual(hindsight(seqs, 200), 5)  # a1 (3) then b (2)
    def test_decay_sign(self):
        self.assertLess(fit_decay([(3, 100.0), (2, 100.0), (1, 100.0)]), 0)
        self.assertAlmostEqual(fit_decay([(2, 100.0)] * 4), 0.0)
    def test_greedy_beats_uniform_when_one_arm_is_good(self):
        seqs = {"good": [(3, 100.0)] * 40, "bad": [(1, 100.0)] * 40}
        g = sum(run_seq(Greedy, seqs, 3000, s)[0] for s in range(10))
        u = sum(run_seq(Uniform, seqs, 3000, s)[0] for s in range(10))
        self.assertGreater(g, u)
    def test_greedy_falls_back_when_best_arm_runs_dry(self):
        seqs = {"good": [(3, 100.0)] * 5, "bad": [(1, 100.0)] * 40}
        v, runs, ex = run_seq(Greedy, seqs, 2000, 0)
        self.assertEqual(ex, 1); self.assertEqual(runs, 20)

if __name__ == "__main__": unittest.main()
