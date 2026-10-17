import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "experiments"))
from simdesign_pocketmesh import Params, PROCESSES, evaluate, rule_violations


class T(unittest.TestCase):
    def test_laser_floor_default(self):
        self.assertEqual(PROCESSES["laser cutting"].r_min, 0.2)

    def test_thick_gauge_web_rule_binds(self):
        v = rule_violations(PROCESSES["laser cutting"], Params(w=6.0, r=4.0, b=10.0))
        self.assertGreater(sum(v.values()), 0.0)

    def test_scan_point_returns_flag_and_stress(self):
        from meshscan import one
        h, r, w, ok, vm = one((2.5, 12.0, 15.8))
        self.assertIsInstance(ok, bool)
        self.assertGreater(vm, 0.0)

    def test_far_from_feasible_is_infeasible_at_every_mesh(self):
        from meshscan import one
        for h in (2.5, 1.5):
            self.assertFalse(one((h, 10.0, 13.5))[3])

    def test_finer_mesh_stays_within_a_factor_of_two_of_coarse(self):
        from meshscan import one
        coarse = one((2.5, 12.0, 15.0))[4]
        fine = one((1.5, 12.0, 15.0))[4]
        self.assertTrue(0.5 * coarse < fine < 2.0 * coarse)


if __name__ == "__main__":
    unittest.main()
