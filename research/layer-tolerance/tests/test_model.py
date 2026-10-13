import random, unittest
from layer_tolerance import *


class T(unittest.TestCase):
    def test_levels(self):
        rng = random.Random(1)
        for L in (4, 16):
            for t in ("sum", "max"):
                self.assertAlmostEqual(power_mc(L, 0.05, [], 40000, rng, t), 0.05, delta=0.008)
            self.assertLessEqual(power_mc(L, 0.05, [], 40000, rng, "combined"), 0.05 + 0.006)

    def test_power_formulas_match_simulation(self):
        rng = random.Random(2)
        L = 8
        for k in (1, 4, 8):
            d = even_split(6.0, k)
            self.assertAlmostEqual(power_mc(L, 0.05, d, 40000, rng, "sum"), power_sum(L, 0.05, d), delta=0.01)
            self.assertAlmostEqual(power_mc(L, 0.05, d, 40000, rng, "max"), power_max(L, 0.05, d), delta=0.01)

    def test_sum_power_ignores_allocation(self):
        L = 16
        vals = [power_sum(L, 0.05, even_split(8, k)) for k in (1, 3, 16)]
        self.assertAlmostEqual(vals[0], vals[2]); self.assertAlmostEqual(vals[0], vals[1])

    def test_even_split_is_prover_best_against_max_test(self):
        # concavity of log Phi: any uneven split of the same total is detected at least as often
        L, tot = 6, 9.0
        even = power_max(L, 0.05, even_split(tot, L))
        for split in ([9, 0, 0, 0, 0, 0], [3, 3, 3, 0, 0, 0], [5, 1, 1, 1, 1, 0], [2, 2, 2, 1, 1, 1]):
            self.assertGreaterEqual(power_max(L, 0.05, split), even - 1e-12)

    def test_half_detect_sum(self):
        L = 16
        self.assertAlmostEqual(half_detect_size(power_sum, L, 0.05, 3), sum_threshold(0.05) * L ** 0.5, places=6)

    def test_max_test_hidden_budget_grows_with_L_faster_than_sum(self):
        b16 = hidden_budget(power_max, 16, 0.05)[0]
        s16 = hidden_budget(power_sum, 16, 0.05)[0]
        self.assertGreater(b16, 2 * s16)

    def test_combined_hidden_budget_at_most_sum_at_half_level(self):
        L = 16
        hb = hidden_budget(power_combined_lb, L, 0.05)[0]
        self.assertLessEqual(hb, sum_threshold(0.025) * L ** 0.5 + 1e-6)

    def test_naive_sum_of_tolerances_is_wider(self):
        for L in (4, 16, 64):
            naive, total = naive_sum_of_tolerances(L, 0.05)
            self.assertGreater(naive, total)


if __name__ == "__main__":
    unittest.main()
