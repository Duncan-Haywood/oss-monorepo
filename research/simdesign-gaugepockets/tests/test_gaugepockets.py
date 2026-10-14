import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "experiments"))
from simdesign_gaugepockets import Params, PROCESSES, evaluate, rule_violations


class T(unittest.TestCase):
    def test_laser_floor_default(self):
        self.assertEqual(PROCESSES["laser cutting"].r_min, 0.2)

    def test_thick_gauge_web_rule_binds(self):
        v = rule_violations(PROCESSES["laser cutting"], Params(w=6.0, r=4.0, b=10.0))
        self.assertGreater(sum(v.values()), 0.0)

    def test_split_runs_separates_pockets(self):
        from pockets import split_runs
        runs, top = split_runs([14.6, 14.7, 15.5, 15.6, 16.0])
        self.assertEqual(runs, [[14.6, 14.7], [15.5, 15.6], [16.0]])
        self.assertEqual(top, [16.0])
        self.assertEqual(split_runs([]), ([], []))

    def test_far_design_infeasible_and_mid_design_feasible(self):
        from pockets import job
        self.assertFalse(job((2.5, 6.0, 13.5))[3])
        self.assertTrue(job((2.5, 14.0, 16.0))[3])

    def test_fine_mesh_removes_low_w_pocket(self):
        from pockets import job
        self.assertTrue(job((2.5, 14.0, 14.4))[3])
        self.assertFalse(job((1.5, 14.0, 14.4))[3])


if __name__ == "__main__":
    unittest.main()
