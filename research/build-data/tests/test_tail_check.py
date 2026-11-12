import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
try:
    import numpy as np, pandas as pd, tail_check
except ImportError:  # needs pandas/lightgbm via transfer.py
    tail_check = None


@unittest.skipIf(tail_check is None, "needs pandas and lightgbm")
class TailCheck(unittest.TestCase):
    def test_ratio_of_scaled_samples(self):
        rng = np.random.default_rng(1)
        held = rng.exponential(10, 2000)
        r = tail_check.quantile_ratio(3 * held, held)
        self.assertAlmostEqual(r["ratio"], 3.0)
        self.assertLess(r["lo"], 3.0)
        self.assertGreater(r["hi"], 3.0)
        self.assertGreater(r["lo"], 2.5)

    def test_zero_held_quantile_gives_no_ratio(self):
        self.assertIsNone(tail_check.quantile_ratio([1, 2, 3], [0, 0, 0])["ratio"])

    def test_check_splits_by_class_and_year(self):
        def f(city, scale):
            n = 600
            return pd.DataFrame(dict(year=[2020 + i % 5 for i in range(n)],
                                     cls=["new_construction" if i % 2 else "alteration" for i in range(n)],
                                     y=[scale * (1 + i % 2) * (1 + i % 7) for i in range(n)]))
        res = tail_check.check({"sf": f("sf", 4.0), "seattle": f("seattle", 1.0)}, "seattle", 2024)
        nc = res["classes"]["new_construction"]
        self.assertEqual(nc["n_held"], 60)
        self.assertAlmostEqual(nc["q90"]["ratio"], 4.0)
        self.assertEqual(res["classes"]["demolition"]["n_source"], 0)


if __name__ == "__main__":
    unittest.main()
