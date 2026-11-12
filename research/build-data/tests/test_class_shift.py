import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
try:
    import numpy as np
    import class_shift as cs
except ImportError:  # needs numpy/pandas
    cs = None


@unittest.skipIf(cs is None, "needs numpy and pandas")
class ClassShift(unittest.TestCase):
    def test_target_rows_unchanged_and_source_rows_relabelled(self):
        # held-out rows keep "electrical"; one source "other" row becomes "electrical" under cascade2
        r = cs.shift_table(["electrical", "electrical", "other"], ["electrical", "electrical", "alteration"],
                           ["electrical", "other", "other"], ["electrical", "electrical", "other"], [10, 100, 5])
        e = r["electrical"]
        self.assertEqual(e["n_test"], 2)
        self.assertEqual(e["share_test_same_under_type"], 1.0)
        self.assertEqual((e["n_src_type"], e["n_src_cascade2"]), (1, 2))
        self.assertEqual(e["share_src_cascade2_from_same_type"], 0.5)
        self.assertEqual(e["src_q90_type"], 10.0)
        self.assertAlmostEqual(e["src_q90_cascade2"], 91.0)
        self.assertEqual(r["alteration"]["share_test_same_under_type"], 0.0)
        self.assertIsNone(r["alteration"]["src_q90_type"])
        self.assertIsNone(e["test_q90"])
        r = cs.shift_table(["a", "a"], ["a", "a"], ["a"], ["a"], [1], test_y=[0, 10])
        self.assertAlmostEqual(r["a"]["test_q90"], 9.0)


if __name__ == "__main__":
    unittest.main()
