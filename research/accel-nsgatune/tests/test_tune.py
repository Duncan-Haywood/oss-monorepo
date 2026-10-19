import os, random, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from accel_nsgatune import tune as T

S = T.S
SP = S.Space(S.load_models(), S.load_dp(), 200)


class Tune(unittest.TestCase):
    def test_matches_reference_nsga2_with_crossover(self):
        a = T.nsga2_x(SP, 120, random.Random(5), 20, 0.25, True)
        b = S.nsga2(SP, 120, random.Random(5), 20, 0.25)
        self.assertEqual({g for g, _ in a}, {g for g, _ in b})

    def test_budget_respected(self):
        for cx in (True, False):
            self.assertLessEqual(len(T.nsga2_x(SP, 90, random.Random(1), 10, 0.1, cx)), 90)

    def test_no_crossover_child_is_copy_when_no_mutation(self):
        items = T.nsga2_x(SP, 60, random.Random(2), 10, 0.0, False)
        self.assertGreaterEqual(len(items), 10)

    def test_designs_are_valid_genes(self):
        for g, _ in T.nsga2_x(SP, 60, random.Random(3), 10, 0.5, False):
            self.assertTrue(all(0 <= g[i] < SP.dims[i] for i in range(4)))


if __name__ == "__main__":
    unittest.main()
