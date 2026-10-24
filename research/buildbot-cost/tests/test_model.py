import unittest

from buildbot_cost import model as M


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tasks = M.load_tasks()

    def test_taskbook_totals_match_its_readme(self):
        self.assertAlmostEqual(M.total_hours(self.tasks, "A"), 46, delta=1)
        self.assertAlmostEqual(M.total_hours(self.tasks, "B"), 93, delta=1)

    def test_eligible_never_exceeds_total_and_h1_beats_g1(self):
        for sc in "AB":
            self.assertLess(M.eligible_hours(self.tasks, "H1", sc), M.total_hours(self.tasks, sc))
            self.assertGreater(M.eligible_hours(self.tasks, "H1", sc), M.eligible_hours(self.tasks, "G1", sc))

    def test_breakeven_is_where_the_saving_is_zero(self):
        rate, w, f = 10.0, 40.0, 0.3
        s = M.breakeven_slowdown(w, rate, f)
        self.assertAlmostEqual(M.net_per_replaced_hour(w, rate, s, f), 0.0, places=9)
        self.assertGreater(M.net_per_replaced_hour(w, rate, s * 0.9, f), 0)
        self.assertLess(M.net_per_replaced_hour(w, rate, s * 1.1, f), 0)

    def test_free_instant_robot_saves_the_wage(self):
        self.assertEqual(M.net_per_replaced_hour(38.0, 0.0, 0.0, 0.0), 38.0)

    def test_robot_rate_hand_calc(self):
        # $60,000 over 6,000 h = $10/h; 10%/yr of $60,000 over 1,000 h/yr = $6/h
        self.assertAlmostEqual(M.robot_rate(60000, 6000, 0.10, 1000), 16.0)

    def test_cost_implied_framing_hours_hand_calc(self):
        self.assertAlmostEqual(M.cost_implied_framing_hours(40.0), 428215 * 0.166 * 0.55 / 40.0)

    def test_simulation_is_deterministic_and_ordered(self):
        a = M.simulate(30.0, "H1", n=500)
        self.assertEqual(a, M.simulate(30.0, "H1", n=500))
        self.assertLessEqual(a["p5"], a["median"])
        self.assertLessEqual(a["median"], a["p95"])
        self.assertLessEqual(a["p95"], a["max"])

    def test_dearer_robot_is_worse(self):
        self.assertLess(M.simulate(30.0, "H1")["median"], M.simulate(30.0, "G1")["median"])


if __name__ == "__main__":
    unittest.main()
