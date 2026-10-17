import math, unittest
from position_rent import *


class T(unittest.TestCase):
    def test_iid_matches_enumeration(self):
        for a in (0.6, 0.75):
            x, y = rents_iid(a, 6), rents([a] * 6)
            for u, v in zip(x, y):
                self.assertAlmostEqual(u, v, 12)

    def test_total_is_mutual_information_below_bln2(self):
        for a in (0.55, 0.7, 0.9):
            for b in (0.5, 2.0):
                self.assertLess(sum(rents_iid(a, 40, b)), b * math.log(2))
        self.assertAlmostEqual(sum(rents_iid(0.7, 1)), math.log(2) - (-0.7 * math.log(0.7) - 0.3 * math.log(0.3)), 12)

    def test_rents_decrease_and_ratio_below_chernoff(self):
        for a in (0.6, 0.7, 0.8, 0.9):
            r = rents_iid(a, 30)
            self.assertTrue(all(x > y > 0 for x, y in zip(r, r[1:])))
            self.assertLess(r[-1] / r[-2], math.exp(-chern(a)))

    def test_explicit_lmsr_matches(self):
        p, mm = simulate_lmsr([0.7] * 4, 1.0, 60000, seed=3)
        for s, e in zip(p, rents_iid(0.7, 4)):
            self.assertAlmostEqual(s, e, delta=0.006)
        self.assertAlmostEqual(-mm, sum(p), delta=0.01)

    def test_order_invariant_total(self):
        accs = [0.9, 0.7, 0.6, 0.55]
        self.assertAlmostEqual(sum(rents(accs)), sum(rents(accs[::-1])), 12)
        self.assertGreater(rents(accs)[0], rents(accs[::-1])[0])

    def test_first_mover_premium(self):
        f, s = pair_premium(0.8, 0.7)
        self.assertGreater(f, s)

    def test_entry_and_liquidity(self):
        n = entry_count(0.7, 1.0, 0.005)
        self.assertGreaterEqual(rents_iid(0.7, n, 1.0)[-1], 0.005)
        self.assertLess(rents_iid(0.7, n + 1, 1.0)[-1], 0.005)
        b = b_for_size(0.7, 11, 0.005)
        self.assertGreaterEqual(entry_count(0.7, b * 1.0001, 0.005), 11)
        self.assertLess(entry_count(0.7, b * 0.999, 0.005), 11)

    def test_accuracy(self):
        self.assertAlmostEqual(accuracy(0.7, 1), 0.7)
        self.assertAlmostEqual(accuracy(0.7, 2), 0.49 + 0.5 * 0.42, 12)


if __name__ == "__main__":
    unittest.main()
