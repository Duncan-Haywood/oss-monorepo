import math
import unittest

from buildbot_custom import model as M


class T(unittest.TestCase):
    def test_schedule_is_the_fasten_count(self):
        n = M.schedule()
        self.assertEqual(len(n), 62)
        self.assertEqual(sum(1 for x in n if x[4] == "joint"), 34)
        w, h = M.SHEET
        for y, z, hw, _, _ in n:
            self.assertTrue(0 < y < w and 0 <= z <= h and hw > 0)

    def test_joint_window_is_3p9_mm(self):
        j = [x for x in M.schedule() if x[4] == "joint"][0]
        self.assertAlmostEqual(j[2] * 1000, 3.9, delta=0.1)

    def test_move_time_cases(self):
        # long move reaches v: d/v + v/a; short move is triangular: 2 sqrt(d/a)
        self.assertAlmostEqual(M.move_time(2.0, 1.0, 2.0), 2.0 + 0.5)
        self.assertAlmostEqual(M.move_time(0.1, 1.0, 2.0), 2 * math.sqrt(0.05))
        self.assertEqual(M.move_time(0, 1, 1), 0)

    def test_faster_axes_never_slower(self):
        n = M.schedule()
        a = M.sheet_cycle(n, 0.5, 2.0, 0.5)[0]
        b = M.sheet_cycle(n, 1.5, 6.0, 0.5)[0]
        self.assertLess(b, a)

    def test_fire_time_dominates_when_axes_are_fast(self):
        t, travel, fire = M.sheet_cycle(M.schedule(), 5.0, 50.0, 0.5)
        self.assertAlmostEqual(fire, 31.0)
        self.assertLess(travel, fire)

    def test_serpentine_is_not_worse_than_a_far_greedy_start(self):
        n = M.schedule()
        rows = M.sheet_cycle(n, 1.0, 3.0, 0.3, "rows")[1]
        greedy = M.sheet_cycle(n, 1.0, 3.0, 0.3, "greedy")[1]
        self.assertLess(min(rows, greedy), 1.5 * max(rows, greedy))

    def test_required_sigma_matches_fasten_readme(self):
        s = M.required_sigma(M.schedule(), 0.95) * 1000
        self.assertAlmostEqual(s, 1.24, delta=0.05)   # buildbot-fasten: 1.24 mm for 95% of sheets

    def test_success_monotone(self):
        n = M.schedule()
        self.assertGreater(M.sheet_success(n, 0.0005), M.sheet_success(n, 0.002))
        self.assertEqual(M.sheet_success(n, 0.0), 1.0)

    def test_annual_cost_hand_calc(self):
        self.assertAlmostEqual(M.annual_cost(100000, 10, 0.0, 0.05), 15000)
        self.assertAlmostEqual(M.annual_cost(100000, 10, 0.05, 0.0), 100000 * 0.05 / (1 - 1.05 ** -10))

    def test_breakeven_houses(self):
        self.assertAlmostEqual(M.breakeven_houses(100000, 10, 0.0, 0.0, 10.0, 40.0), 10000 / 400.0)
        self.assertEqual(M.breakeven_houses(1, 1, 0, 0, 1.0, 40.0, operator_h_per_house=1.0), math.inf)

    def test_taskbook_hours(self):
        h = M.nailing_hours(M.load_tasks())
        self.assertAlmostEqual(h["wall"], 3.31, delta=0.02)
        self.assertAlmostEqual(h["roof"], 5.70, delta=0.05)
        self.assertEqual(round(h["wall_sheets"]), 32)

    def test_simulation_deterministic_and_ordered(self):
        a = M.simulate(10.0, n=500)
        self.assertEqual(a, M.simulate(10.0, n=500))
        self.assertLessEqual(a[0], a[1])
        self.assertLessEqual(a[1], a[2])


if __name__ == "__main__":
    unittest.main()
