import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_band_failure as F  # noqa: E402


class BandFailureTests(unittest.TestCase):
    def test_only_k3_rules(self):
        rs = F.rules()
        self.assertEqual(len(rs), 1 + 4 * 10)
        self.assertEqual(F.K, 3)

    def test_modes(self):
        t = {F.BASE: [100.0, 10.0], "a": [100.0, 10.0], "b": [99.0, 5.0], "c": [120.0, 11.0], "d": [90.0, 20.0]}
        self.assertEqual(F.mode(t, "a"), "won")  # a tie counts as a win, as in sb.dominates
        self.assertEqual(F.mode(t, "b"), "km")
        self.assertEqual(F.mode(t, "c"), "dark")
        self.assertEqual(F.mode(t, "d"), "both")
        self.assertEqual(F.mode(t, "b", km_tol=0.01), "won")
        self.assertEqual(F.mode(t, "c", dark_tol=1.0), "won")

    def test_zero_km_tie_is_a_win(self):
        t = {F.BASE: [0.0, 0.0], "a": [0.0, 0.0]}
        self.assertEqual(F.mode(t, "a"), "won")

    def test_pool_sums_points(self):
        pp = {"x": {"a": [1.0, 2.0]}, "y": {"a": [3.0, 4.0]}}
        self.assertEqual(F.pool(pp), {"a": [4.0, 6.0]})


if __name__ == "__main__":
    unittest.main()
