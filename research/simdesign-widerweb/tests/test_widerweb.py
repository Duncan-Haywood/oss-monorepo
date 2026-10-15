import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "experiments"))
from simdesign_widerweb import PROCESSES, Params, rule_violations


class T(unittest.TestCase):
    def test_default_slenderness_rule_forbids_wide_web(self):
        v = rule_violations(PROCESSES["laser cutting"], Params(w=18.0, r=12.0, b=2.0))
        self.assertGreater(v["slenderness w/b"], 0.0)

    def test_scan_point_relaxes_rule_and_solves(self):
        from widerweb import one
        h, r, w, ok, vm, m, tip = one((1.5, 12.0, 18.0))
        self.assertTrue(ok)
        self.assertLess(vm, 100.0)

    def test_wider_web_has_lower_peak_stress(self):
        from widerweb import one
        self.assertLess(one((1.0, 12.0, 20.0))[4], one((1.0, 12.0, 16.0))[4])

    def test_wider_web_is_heavier(self):
        from widerweb import one
        self.assertGreater(one((2.5, 12.0, 20.0))[5], one((2.5, 12.0, 16.0))[5])

    def test_fine_mesh_raises_peak_stress(self):
        from widerweb import one
        self.assertGreater(one((0.75, 12.0, 17.0))[4], one((1.5, 12.0, 17.0))[4])


if __name__ == "__main__":
    unittest.main()
