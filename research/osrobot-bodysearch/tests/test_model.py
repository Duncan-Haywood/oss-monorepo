import math, unittest
from osrobot_bodysearch.model import *


class T(unittest.TestCase):
    def test_fk_straight(self):
        x, z, a, _ = fk((0.2, 0.3), (0.0, 0.0))
        self.assertAlmostEqual(x, 0.5); self.assertAlmostEqual(z, 0.0)

    def test_budget_is_fixed_body_cost(self):
        self.assertAlmostEqual(BUDGET, 3 * COST_JOINT + COST_M * 0.6)

    def test_repair_respects_budget(self):
        d = repair(((0.45, 0.45, 0.45, 0.45), 0.0, (0.05, 1.0)))
        self.assertLessEqual(cost(d[0]), BUDGET + 1e-6)

    def test_two_link_cannot_do_orientation_everywhere(self):
        t = targets("shelf", 20, 1)
        r = evaluate(((0.25, 0.25), 0.0, DEFAULT_CTRL), "shelf", t)
        self.assertLess(r["success"], 0.5)

    def test_far_reachable_vs_out_of_reach(self):
        ok, _ = solve_ik((0.2, 0.2, 0.2), 0.0, (0.4, 0.0), DEFAULT_CTRL, False)
        self.assertTrue(ok)
        ok, _ = solve_ik((0.2, 0.2, 0.2), 0.0, (0.9, 0.0), DEFAULT_CTRL, False)
        self.assertFalse(ok)

    def test_torque_limit_binds_for_long_arm(self):
        self.assertFalse(torques_ok((0.45, 0.45, 0.45, 0.45), (0, 0, 0, 0)))
        self.assertTrue(torques_ok((0.1, 0.1), (0, 0)))

    def test_over_budget_scores_neg_inf(self):
        self.assertEqual(score(dict(cost=BUDGET + 1, success=1.0, iters=1)), -math.inf)

    def test_search_reproducible_and_feasible(self):
        t = targets("far", 6, 5)
        a = search("far", t, 20, 3, "evo"); b = search("far", t, 20, 3, "evo")
        self.assertEqual(a, b)
        self.assertLessEqual(cost(a[0][0]), BUDGET + 1e-6)

    def test_ctrl_only_keeps_body(self):
        d, _ = search("far", targets("far", 4, 1), 5, 0, "ctrl_only")
        self.assertEqual(d[0], FIXED_LINKS)


if __name__ == "__main__":
    unittest.main()
