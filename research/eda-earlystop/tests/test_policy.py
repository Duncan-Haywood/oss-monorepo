import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from eda_earlystop import policy as P


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = P.load()

    def test_uncapped_matches_checkorder(self):
        from eda_checkorder import cascade as C
        for s in range(3):
            a = P.run(self.rows, 16, None, s)
            b = C.run_cascade(self.rows, [("random", 16), ("directed",), ("formal",)], s)
            self.assertAlmostEqual(a["cpu_s"], b["cpu_s"])
            self.assertEqual((a["killed"], a["equivalent"]), (b["killed"], b["equivalent"]))

    def test_cap_never_costs_more(self):
        for cap in (0, 30, 170, 300):
            self.assertLessEqual(P.run(self.rows, 16, cap, 0)["cpu_s"], P.run(self.rows, 16, None, 0)["cpu_s"])

    def test_large_cap_equals_uncapped(self):
        self.assertEqual(P.run(self.rows, 16, 1e9, 1), P.run(self.rows, 16, None, 1))

    def test_cap_keeps_all_kills_above_longest_formal_kill(self):
        longest = max(r["formal_seconds"] for r in self.rows if r["formal"] == "killed")
        self.assertLess(longest, 170)
        self.assertEqual(P.mean(self.rows, 4, 170)["killed"], 66.0)

    def test_cap_below_proof_time_loses_all_proofs(self):
        self.assertEqual(P.mean(self.rows, 16, 200)["equivalent"], 0.0)
        self.assertGreaterEqual(P.mean(self.rows, 16, 230)["equivalent"], 15.0)

    def test_zero_cap_charges_only_cheap_stages(self):
        m = P.run(self.rows, 16, 0, 0)
        self.assertLess(m["cpu_s"], 300)

    def test_counts_conserved(self):
        m = P.run(self.rows, 16, 60, 2)
        self.assertEqual(m["killed"] + m["equivalent"] + m["unresolved"], len(self.rows))


if __name__ == "__main__":
    unittest.main()
