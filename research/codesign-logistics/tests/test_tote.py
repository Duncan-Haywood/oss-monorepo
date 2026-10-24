import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from codesign_logistics import tote as T


class ToteTests(unittest.TestCase):
    def test_evaluation_is_deterministic(self):
        self.assertEqual(T.evaluate([19, 2, 80, 60, 0.4]), T.evaluate([19, 2, 80, 60, 0.4]))

    def test_outcome_shares_partition_the_items(self):
        r = T.evaluate([19, 2, 80, 60, 0.4])
        self.assertAlmostEqual(r["good"] + r["slow"] + r["weak"] + r["nofit"], 1.0, places=9)

    def test_big_cups_stop_fitting_small_items(self):
        self.assertLess(T.evaluate([12, 2, 60, 40, 0.5])["nofit"], T.evaluate([45, 2, 60, 40, 0.5])["nofit"])

    def test_more_vacuum_holds_more(self):
        self.assertGreater(T.evaluate([19, 2, 30, 60, 0.4])["weak"], T.evaluate([19, 2, 80, 60, 0.4])["weak"])

    def test_more_flow_pumps_down_faster(self):
        self.assertGreater(T.evaluate([19, 2, 80, 10, 0.4])["pick_time_s"], T.evaluate([19, 2, 80, 60, 0.4])["pick_time_s"])

    def test_cost_cap_marks_infeasible(self):
        r = T.evaluate([50, 4, 80, 60, 1.0])
        self.assertGreater(r["cost"], T.COST_CAP)
        self.assertFalse(r["feasible"])
        self.assertEqual(r["J"], -1.0)

    def test_baselines_respect_budget_and_bounds(self):
        from codesign_logistics import optimisers as O
        for f in (O.random_search, O.cma_es, O.bayes_opt):
            recs = f(12, 0)
            self.assertEqual(len(recs), 12)
            for r in recs:
                self.assertTrue(all(lo - 1e-9 <= v <= hi + 1e-9 for v, lo, hi in zip(r["x"], T.LB, T.UB)))


if __name__ == "__main__":
    unittest.main()
