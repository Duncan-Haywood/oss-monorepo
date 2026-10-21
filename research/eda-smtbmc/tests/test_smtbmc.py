import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
import analyse as A  # noqa: E402


class T(unittest.TestCase):
    def test_last_pass(self):
        rows = [{"id": "a", "depth": 2, "verdict": "pass", "seconds": 0.1},
                {"id": "a", "depth": 4, "verdict": "pass", "seconds": 0.3},
                {"id": "a", "depth": 6, "verdict": "timeout", "seconds": 240.0}]
        self.assertEqual(A.last_pass(rows, "a"), ((4, 0.3), 6))
        self.assertEqual(A.last_pass(rows, "b"), ((0, 0.0), None))

    def test_log_totals(self):
        smt = A.load("smt.jsonl")
        self.assertEqual(len(smt), 10)
        self.assertTrue(all(r["depth"] == 24 for r in smt))
        self.assertTrue(all(r["induct"] == "skipped" for r in smt if r["bmc"] != "pass"))

    def test_sweep_times_grow(self):
        sw = A.load("sweep.jsonl")
        for mid in {r["id"] for r in sw}:
            d = [r for r in sw if r["id"] == mid and r["verdict"] == "pass"]
            self.assertTrue(all(a["seconds"] <= b["seconds"] + 0.5 for a, b in zip(d, d[1:])))
