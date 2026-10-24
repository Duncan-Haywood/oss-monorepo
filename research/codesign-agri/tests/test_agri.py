import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from codesign_agri import agri as A


class AgriTests(unittest.TestCase):
    def test_evaluation_is_deterministic(self):
        self.assertEqual(A.evaluate([20, 25, 0.5, 5, 3]), A.evaluate([20, 25, 0.5, 5, 3]))

    def test_outcome_shares_partition_the_fruit(self):
        r = A.evaluate([20, 25, 0.5, 5, 3])
        self.assertAlmostEqual(r["good"] + r["bruised"] + r["slipped"] + r["missed"], 1.0, places=9)

    def test_stiff_narrow_pad_bruises_more_than_soft_wide_pad(self):
        stiff = A.evaluate([5, 25, 8.0, 5, 3])
        soft = A.evaluate([25, 25, 0.3, 5, 3])
        self.assertGreater(stiff["median_pressure_kpa"], 3 * soft["median_pressure_kpa"])
        self.assertGreater(stiff["bruised"], soft["bruised"])

    def test_more_grip_force_slips_less(self):
        self.assertGreater(A.evaluate([25, 25, 0.5, 2, 3])["slipped"], A.evaluate([25, 25, 0.5, 6, 3])["slipped"])

    def test_more_fingers_collide_more(self):
        self.assertLess(A.evaluate([20, 25, 0.5, 5, 2])["collided"], A.evaluate([20, 25, 0.5, 5, 4])["collided"])

    def test_cost_cap_marks_infeasible(self):
        r = A.evaluate([25, 40, 10.0, 8, 4])
        self.assertGreater(r["cost"], A.COST_CAP)
        self.assertFalse(r["feasible"])
        self.assertEqual(r["J"], -1.0)

    def test_baselines_respect_budget_and_bounds(self):
        from codesign_agri import optimisers as O
        for f in (O.random_search, O.cma_es, O.bayes_opt):
            recs = f(12, 0)
            self.assertEqual(len(recs), 12)
            for r in recs:
                self.assertTrue(all(lo - 1e-9 <= v <= hi + 1e-9 for v, lo, hi in zip(r["x"], A.LB, A.UB)))


if __name__ == "__main__":
    unittest.main()
