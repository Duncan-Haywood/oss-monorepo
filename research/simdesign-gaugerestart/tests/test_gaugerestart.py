import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "experiments"))
from simdesign_gaugerestart import Params, PROCESSES, evaluate, rule_violations


class T(unittest.TestCase):
    def test_laser_floor_default(self):
        self.assertEqual(PROCESSES["laser cutting"].r_min, 0.2)

    def test_thick_gauge_web_rule_binds(self):
        v = rule_violations(PROCESSES["laser cutting"], Params(w=6.0, r=4.0, b=10.0))
        self.assertGreater(sum(v.values()), 0.0)

    def test_gauge2_subsearch_feasible_for_seed1(self):
        from restarts import one
        m, n = one("rules", 1, 4)
        self.assertIsNotNone(m)
        self.assertLess(m, 40.0)
        self.assertGreater(n, 0)

    def test_restart_never_worse_than_its_first_run(self):
        from restarts import task
        base = task(("free", "base", 3))["mass_g"]
        rest = task(("free", "restart2", 3))["mass_g"]
        self.assertIsNotNone(base)
        self.assertLessEqual(rest, base + 1e-12)

    def test_restart_counts_both_runs(self):
        from restarts import task
        self.assertGreater(task(("free", "restart2", 3))["n_fe"], task(("free", "base", 3))["n_fe"])

if __name__ == "__main__":
    unittest.main()
