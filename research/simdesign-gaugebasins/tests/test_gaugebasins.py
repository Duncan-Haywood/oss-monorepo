import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "experiments"))
from simdesign_gaugebasins import Params, PROCESSES, evaluate, rule_violations


class T(unittest.TestCase):
    def test_laser_floor_default(self):
        self.assertEqual(PROCESSES["laser cutting"].r_min, 0.2)

    def test_thick_gauge_web_rule_binds(self):
        v = rule_violations(PROCESSES["laser cutting"], Params(w=6.0, r=4.0, b=10.0))
        self.assertGreater(sum(v.values()), 0.0)

    def test_run_records_design_and_mass(self):
        from basins import run
        x = run(("rules", "base", 1))
        self.assertIsNotNone(x["mass_g"])
        self.assertTrue(2.0 <= x["w"] <= 25.0 and 0.0 <= x["r"] <= 15.0)
        self.assertGreater(x["n_fe"], 0)

    def test_grid_point_far_from_feasible_is_infeasible(self):
        from basins import grid_pt
        self.assertFalse(grid_pt(("rules", 0, 0))["feasible"])

    def test_summary_reports_groups(self):
        from basins import summarise
        res = [{"kind": "rules", "variant": "base", "seed": 0, "w": 14.5, "r": 12.0, "mass_g": 33.5, "n_fe": 1},
               {"kind": "rules", "variant": "base", "seed": 1, "w": 15.4, "r": 12.0, "mass_g": 35.4, "n_fe": 1}]
        out = "\n".join(summarise(res, []))
        self.assertIn("lower: n= 1", out)
        self.assertIn("upper: n= 1", out)


if __name__ == "__main__":
    unittest.main()
