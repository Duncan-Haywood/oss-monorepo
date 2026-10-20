import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from swe_allocate.policies import *

POOLS = {"good": [(3, 100.0)] * 5, "bad": [(1, 400.0)] * 5, "mid": [(2, 200.0)] * 5}

class T(unittest.TestCase):
    def test_deterministic_arms_learned(self):
        for cls in (Greedy, Thompson, KnapsackUCB):
            tot, _ = run_once(cls, POOLS, 20000, 1, cmax=400.0)
            floor = 0.7 if cls is KnapsackUCB else 0.9  # UCB keeps exploring
            self.assertGreater(tot, floor * 600, cls.name)  # all-good = 3 per 100 -> 600
    def test_uniform_is_worse(self):
        u = sum(run_once(Uniform, POOLS, 20000, s)[0] for s in range(20))
        g = sum(run_once(Greedy, POOLS, 20000, s)[0] for s in range(20))
        self.assertGreater(g, u)
    def test_budget_respected(self):
        _, runs = run_once(Uniform, {"a": [(1, 50.0)]}, 500, 0)
        self.assertEqual(runs, 10)
    def test_oracle(self):
        self.assertEqual(oracle_ratio(POOLS)[0], "good")
    def test_ci_contains_mean(self):
        m, lo, hi = mean_ci([1, 2, 3, 4])
        self.assertTrue(lo < m < hi)
    def test_seed_reproducible(self):
        self.assertEqual(run_once(Thompson, POOLS, 5000, 3), run_once(Thompson, POOLS, 5000, 3))

if __name__ == "__main__":
    unittest.main()
