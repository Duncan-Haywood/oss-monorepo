import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
import analyse as A  # noqa: E402


class T(unittest.TestCase):
    def test_bound_is_rule_of_three(self):
        self.assertAlmostEqual(A.p_upper(21280), 3 / 21280, delta=1e-5)

    def test_truncation_detected(self):
        self.assertTrue(A.is_truncation({"first": 1990}))
        self.assertTrue(A.is_truncation({"first": 3990}))
        self.assertFalse(A.is_truncation({"first": 1500}))
        self.assertFalse(A.is_truncation({"first": None}))

    def test_log_totals(self):
        rows = A.load()
        self.assertEqual(len(rows), 26)
        self.assertEqual(sum(r["formal"] == "equivalent" for r in rows), 16)
        self.assertTrue(all(r["nvec"] == 20000 for r in rows))

    def test_no_equivalent_mutant_was_caught(self):
        self.assertTrue(all(r["first"] is None for r in A.load() if r["formal"] == "equivalent"))


if __name__ == "__main__":
    unittest.main()
