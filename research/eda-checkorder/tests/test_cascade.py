import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from eda_checkorder import cascade as C


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = C.load()

    def test_log_counts(self):
        self.assertEqual(len(self.rows), 91)
        self.assertEqual(len(C.killable(self.rows)), 66)
        self.assertEqual(sum(r["formal"] == "equivalent" for r in self.rows), 16)

    def test_formal_only_matches_log(self):
        r = C.run_cascade(self.rows, [("formal",)], 0)
        self.assertEqual((r["killed"], r["equivalent"], r["unresolved"]), (47, 16, 28))
        self.assertAlmostEqual(r["cpu_s"], sum(x["formal_seconds"] for x in self.rows))

    def test_cheap_first_saves_cpu(self):
        a = C.run_cascade(self.rows, [("formal",)], 0)["cpu_s"]
        b = C.run_cascade(self.rows, [("random", 64), ("formal",)], 0)["cpu_s"]
        self.assertLess(b, 0.6 * a)

    def test_random_cost_linear(self):
        r = self.rows[0]
        self.assertAlmostEqual(C.random_cost(r, 16), r["random_seconds"] / 4)

    def test_cascade_never_loses_a_kill_formal_made(self):
        for s in range(20):
            c = C.run_cascade(self.rows, [("random", 64), ("directed",), ("formal",)], s)
            self.assertGreaterEqual(c["killed"], 47)


if __name__ == "__main__":
    unittest.main()
