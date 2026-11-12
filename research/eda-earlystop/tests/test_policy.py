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

    # Added by quality audit round 49: these pin train_cap and the cap boundary, which no test reached.
    def test_unresolved_matches_checkorder(self):
        from eda_checkorder import cascade as C
        a = P.run(self.rows, 16, None, 0)
        b = C.run_cascade(self.rows, [("random", 16), ("directed",), ("formal",)], 0)
        self.assertEqual(a["unresolved"], len(self.rows) - b["killed"] - b["equivalent"])
        self.assertEqual(a["unresolved"], 9)

    def test_train_cap_is_margin_times_longest_kill_that_reaches_formal(self):
        from eda_checkorder import cascade as C
        longest = max(r["formal_seconds"] for r in self.rows for s in range(20)
                      if r["formal"] == "killed" and r["directed_first"] is None and not C.random_kills(r, 16, s))
        self.assertAlmostEqual(P.train_cap(self.rows, 16), 1.1 * longest)
        self.assertAlmostEqual(P.train_cap(self.rows, 16), 57.77, places=2)  # the 52.52 s kill, from the log
        self.assertIsNone(P.train_cap([r for r in self.rows if r["formal"] != "killed"], 16))

    def test_a_run_exactly_at_the_cap_keeps_its_outcome(self):
        from eda_checkorder import cascade as C
        r = dict(self.rows[0], random_first=[None] * 20, directed_first=None, formal="equivalent", formal_seconds=100.0)
        self.assertFalse(any(C.random_kills(r, 16, s) for s in range(20)))
        self.assertEqual(P.run([r], 16, 100.0, 0)["equivalent"], 1)
        self.assertEqual(P.run([r], 16, 99.9, 0)["unresolved"], 1)


if __name__ == "__main__":
    unittest.main()
