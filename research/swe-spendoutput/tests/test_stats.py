import math, os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from swe_spendoutput.stats import rank, pearson, spearman, slope, elasticity, boot, terciles


class T(unittest.TestCase):
    def test_rank_ties(self):
        self.assertEqual(rank([3, 1, 1, 2]), [4.0, 1.5, 1.5, 3.0])

    def test_pearson_perfect(self):
        self.assertAlmostEqual(pearson([1, 2, 3], [2, 4, 6]), 1.0)
        self.assertAlmostEqual(pearson([1, 2, 3], [6, 4, 2]), -1.0)
        self.assertTrue(math.isnan(pearson([1, 1, 1], [1, 2, 3])))

    def test_spearman_monotone_nonlinear(self):
        self.assertAlmostEqual(spearman([1, 2, 3, 4], [1, 8, 27, 1000]), 1.0)

    def test_slope(self):
        self.assertAlmostEqual(slope([0, 1, 2], [1, 3, 5]), 2.0)

    def test_elasticity_recovers_power(self):
        c = [1, 2, 4, 8, 16]
        self.assertAlmostEqual(elasticity(c, [x ** 0.5 * 3 for x in c]), 0.5)

    def test_boot_brackets_point(self):
        c = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
        o = [2, 1, 4, 3, 6, 5, 8, 7, 10, 9]
        p, lo, hi = boot(spearman, c, o, reps=300)
        self.assertLessEqual(lo, p); self.assertGreaterEqual(hi, p)

    def test_boot_deterministic(self):
        c = list(range(1, 21)); o = [x % 5 + 1 for x in c]
        self.assertEqual(boot(spearman, c, o, reps=100), boot(spearman, c, o, reps=100))

    def test_terciles_partition(self):
        c = [1, 2, 3, 4, 5, 6]
        o = [1, 1, 2, 2, 3, 3]
        t = terciles(c, o)
        self.assertEqual([x[0] for x in t], [2, 2, 2])
        self.assertEqual(sum(x[4] for x in t), sum(o))
        self.assertAlmostEqual(t[0][5], 2 / 3)


if __name__ == "__main__":
    unittest.main()
