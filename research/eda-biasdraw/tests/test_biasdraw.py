import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
import analyse as A  # noqa: E402


class T(unittest.TestCase):
    def test_truncation_detected(self):
        self.assertTrue(A.is_truncation(990))
        self.assertTrue(A.is_truncation(4990))
        self.assertFalse(A.is_truncation(500))
        self.assertFalse(A.is_truncation(None))

    def test_bound(self):
        self.assertAlmostEqual(A.p_upper(5000), 3 / 5000, delta=1e-4)

    def test_log_totals(self):
        rows = A.load()
        self.assertEqual(len(rows), 26)
        self.assertEqual(sum(r["formal"] == "equivalent" for r in rows), 16)
        self.assertTrue(all(set(r["first"]) == {"extreme", "sparse", "onehot", "mixed"} for r in rows))

    def test_only_truncation_flags(self):
        for r in A.load():
            for v in r["first"].values():
                self.assertTrue(v is None or A.is_truncation(v))

    def test_del122_loses_ten_rows(self):
        import json
        rc = json.load(open(os.path.join(HERE, "..", "experiments", "rows.json")))
        self.assertEqual(rc["vectors"] - rc["rows"], A.STALL_LOSS)


if __name__ == "__main__":
    unittest.main()
