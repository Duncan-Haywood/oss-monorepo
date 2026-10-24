import unittest

from buildbot_nailpay import model as M


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mb, cls.tb = M.load(M.MOBILEBASE), M.load(M.TASKBOOK)
        cls.wage = M.C.WAGE_CARPENTER * 1.3

    def test_hand_time_is_62_nails_at_taskbook_rate(self):
        self.assertAlmostEqual(M.hand_sheet_seconds(self.tb), 372.0)

    def test_wall_sheets(self):
        self.assertAlmostEqual(M.sheets(self.tb), 1984 / 62)

    def test_breakeven_is_zero_saving(self):
        rate = M.hourly_rate(16000, 20000, 6000, 0.1, 1000)
        be = M.breakeven_hand_seconds(90.0, self.wage, rate, 0.3)
        self.assertAlmostEqual(M.saving_per_sheet(be, 90.0, self.wage, rate, 0.3), 0.0, places=9)
        self.assertGreater(M.saving_per_sheet(be + 10, 90.0, self.wage, rate, 0.3), 0)

    def test_free_robot_with_one_supervisor_breaks_even_at_its_own_time(self):
        self.assertAlmostEqual(M.breakeven_hand_seconds(80.0, self.wage, 0.0, 1.0), 80.0)

    def test_free_unsupervised_robot_always_saves(self):
        self.assertEqual(M.breakeven_hand_seconds(80.0, self.wage, 0.0, 0.0), 0.0)

    def test_matches_cost_model_slowdown(self):
        # hand time / robot time is the slowdown of buildbot-cost; the break-even must agree with its closed form
        rate = M.hourly_rate(16000, 0, 6000, 0.1, 1000)
        s = M.C.breakeven_slowdown(self.wage, rate, 0.3)
        self.assertAlmostEqual(M.breakeven_hand_seconds(100.0, self.wage, rate, 0.3), 100.0 / s)

    def test_more_supervision_needs_slower_person(self):
        r = M.hourly_rate(16000, 0, 6000, 0.1, 1000)
        self.assertLess(M.breakeven_hand_seconds(85, self.wage, r, 0.1), M.breakeven_hand_seconds(85, self.wage, r, 0.5))

    def test_robot_times_ordered(self):
        t = M.robot_sheet_times(self.mb)
        self.assertLess(t["base, fastest tried"], t["base, median"])
        self.assertLess(t["base, median"], t["base, slowest tried"])
        self.assertAlmostEqual(t["base, fastest tried"], 54.1, places=1)

    def test_p_saves_deterministic_and_monotone(self):
        self.assertEqual(M.p_saves(60.0), M.p_saves(60.0))
        self.assertGreater(M.p_saves(60.0), M.p_saves(265.0))


if __name__ == "__main__":
    unittest.main()
