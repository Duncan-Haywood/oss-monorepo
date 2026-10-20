import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_loadbind import PROCESSES, Params, rule_violations, dfm, ltb

LASER = PROCESSES["laser cutting"]


class T(unittest.TestCase):
    def tearDown(self):
        dfm.GUARD, dfm.BUCKLE_MIN = "slender", 3.0
        dfm.LOAD_N, dfm.ARM_MM = 100.0, 80.0

    def test_default_guard_is_old_slenderness_rule(self):
        v = rule_violations(LASER, Params(w=18.7, r=8.0, b=1.5))
        self.assertGreater(v["slenderness w/b"], 0.0)
        self.assertEqual(v["buckling"], 0.0)

    def test_buckling_guard_admits_wide_thin_web_the_old_rule_forbids(self):
        dfm.GUARD = "buckling"
        v = rule_violations(LASER, Params(w=18.7, r=8.0, b=1.5))
        self.assertEqual(v["slenderness w/b"], 0.0)
        self.assertEqual(v["buckling"], 0.0)

    def test_buckling_guard_rejects_narrow_thin_web_the_old_rule_admits(self):
        p = Params(w=6.0, r=3.0, b=1.5)   # w/b = 4: passes w/b <= 8; factor 0.98
        self.assertEqual(rule_violations(LASER, p)["slenderness w/b"], 0.0)
        dfm.GUARD = "buckling"
        self.assertGreater(rule_violations(LASER, p)["buckling"], 0.0)

    def test_none_guard_has_no_out_of_plane_rule(self):
        dfm.GUARD = "none"
        v = rule_violations(LASER, Params(w=6.0, r=3.0, b=1.5))
        self.assertEqual((v["slenderness w/b"], v["buckling"]), (0.0, 0.0))

    def test_meaningless_section_counts_as_violation_not_pass(self):
        self.assertEqual(dfm._factor(1.0, 5.0, LASER), 0.0)   # b > w: J < 0, sqrt is nan

    def test_ltb_factor_matches_webbuckle_table(self):
        # simdesign-webbuckle scan.txt: governing factor 3.14 at w = 8, b = 2 mm (steel)
        self.assertAlmostEqual(float(ltb.governing_factor(8.0, 2.0)), 3.14, places=2)
        self.assertAlmostEqual(float(ltb.governing_factor(8.0, 2.0, 200000.0, 0.30)), 3.14, places=2)

    def test_factor_scales_linearly_with_E(self):
        a = ltb.governing_factor(10.0, 2.0, 100000.0, 0.30)
        b = ltb.governing_factor(10.0, 2.0, 400000.0, 0.30)
        self.assertAlmostEqual(float(b / a), 4.0, places=6)  # sqrt(E * G), G proportional to E


class Sweep(unittest.TestCase):
    def tearDown(self):
        dfm.GUARD, dfm.BUCKLE_MIN = "slender", 3.0
        dfm.LOAD_N, dfm.ARM_MM = 100.0, 80.0

    def test_defaults_match_buckleguard_factor(self):
        self.assertAlmostEqual(dfm._factor(18.7, 1.5, LASER), float(ltb.governing_factor(18.7, 1.5)), places=9)

    def test_factor_inversely_proportional_to_load(self):
        f1 = dfm._factor(18.7, 1.5, LASER)
        dfm.LOAD_N = 200.0
        self.assertAlmostEqual(dfm._factor(18.7, 1.5, LASER), f1 / 2, places=9)

    def test_longer_arms_lower_the_factor(self):
        f1 = dfm._factor(18.7, 1.5, LASER)
        dfm.ARM_MM = 120.0
        self.assertLess(dfm._factor(18.7, 1.5, LASER), f1)

    def test_load_reaches_the_finite_element_model(self):
        from simdesign_loadbind import solve
        from dataclasses import replace
        p = Params(w=18.0, r=8.0, b=2.0)
        a = solve(p, LASER.material, h=3.0)["max_vm_mpa"]
        b = solve(replace(p, F=200.0), LASER.material, h=3.0)["max_vm_mpa"]
        self.assertAlmostEqual(b / a, 2.0, places=6)
