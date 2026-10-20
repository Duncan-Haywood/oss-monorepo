import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_minwall import PROCESSES, Params, rule_violations, dfm
from simdesign_minwall.ltb import governing_factor

LASER = PROCESSES["laser cutting"]


class T(unittest.TestCase):
    def tearDown(self):
        dfm.BUCKLE_RULE, dfm.MIN_BUCKLE, dfm.MIN_WALL_ANY = "slender", 3.0, 1.2

    def test_default_is_old_ceiling(self):
        v = rule_violations(LASER, Params(w=18.0, r=12.0, b=2.0))
        self.assertGreater(v["slenderness w/b"], 0.0)
        self.assertEqual(v["buckling factor"], 0.0)

    def test_buckle_rule_admits_wide_web_at_2mm(self):
        dfm.BUCKLE_RULE = "buckle"
        v = rule_violations(LASER, Params(w=18.0, r=12.0, b=2.0))
        self.assertEqual(v["slenderness w/b"], 0.0)
        self.assertEqual(v["buckling factor"], 0.0)

    def test_buckle_rule_rejects_narrow_web_at_1mm(self):
        dfm.BUCKLE_RULE = "buckle"
        p = Params(w=8.0, r=2.0, b=1.0)   # old rule allows it (w/b = 8); factor is 0.41
        self.assertGreater(rule_violations(LASER, p)["buckling factor"], 0.5)

    def test_factor_matches_webbuckle_table(self):
        self.assertAlmostEqual(float(governing_factor(8.0, 1.0)), 0.41, places=2)
        self.assertAlmostEqual(float(governing_factor(16.0, 2.0)), 6.93, places=2)

    def test_min_wall_rule_rejects_1mm_gauge_until_relaxed(self):
        dfm.BUCKLE_RULE, dfm.MIN_BUCKLE = "buckle", 1.0
        p = Params(w=22.7, r=13.8, b=1.0)
        self.assertAlmostEqual(rule_violations(LASER, p)["min wall (b)"], 0.2 / 1.2, places=6)
        dfm.MIN_WALL_ANY = 1.0
        self.assertEqual(rule_violations(LASER, p)["min wall (b)"], 0.0)
        self.assertEqual(rule_violations(LASER, p)["buckling factor"], 0.0)

    def test_floor_of_3_still_rejects_1mm_at_widest_web(self):
        dfm.BUCKLE_RULE, dfm.MIN_BUCKLE, dfm.MIN_WALL_ANY = "buckle", 3.0, 1.0
        self.assertGreater(rule_violations(LASER, Params(w=25.0, r=0.2, b=1.0))["buckling factor"], 0.5)

    def test_factor_rises_with_width(self):
        self.assertLess(governing_factor(10.0, 2.0), governing_factor(20.0, 2.0))


if __name__ == "__main__":
    unittest.main()
