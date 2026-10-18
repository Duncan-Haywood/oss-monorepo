import sys, unittest, random
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from secretary import exact_noiseless, pick, sweep


class SecretaryTests(unittest.TestCase):
    def test_exact_formula_matches_known_values(self):
        # n=3: r=2 gives 1/3 + 1/6 = 1/2 (Gardner's classic 3-candidate case)
        self.assertAlmostEqual(exact_noiseless(3, 2), 0.5)
        self.assertAlmostEqual(exact_noiseless(50, 1), 1 / 50)
        self.assertGreater(exact_noiseless(1000, 368), 0.3678)

    def test_pick_rule(self):
        self.assertEqual(pick([1, 5, 3, 9, 2], 3), 3)   # first later score beating max(1,5)
        self.assertEqual(pick([9, 1, 2, 3, 4], 3), 4)   # none beats 9: take last
        self.assertEqual(pick([1, 2, 3], 1), 0)         # r=1 takes the first

    def test_simulation_matches_exact_without_noise(self):
        res = sweep(20, 0.0, [1, 7, 12], 20000, 3)
        for r, (p, _) in res.items():
            self.assertAlmostEqual(p, exact_noiseless(20, r), delta=0.02)

    def test_noise_hurts(self):
        lo = sweep(20, 0.0, [7], 8000, 5)[7][0]
        hi = sweep(20, 2.0, [7], 8000, 5)[7][0]
        self.assertGreater(lo, hi + 0.1)

    def test_pure_noise_is_a_lottery(self):
        p = sweep(20, 1e6, [7], 20000, 9)[7][0]
        self.assertAlmostEqual(p, 1 / 20, delta=0.015)


if __name__ == "__main__":
    unittest.main()
