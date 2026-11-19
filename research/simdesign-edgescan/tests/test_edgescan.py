import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "experiments"))
from simdesign_edgescan import PROCESSES, Params, rule_violations


class T(unittest.TestCase):
    def test_default_slenderness_rule_forbids_wide_web(self):
        v = rule_violations(PROCESSES["laser cutting"], Params(w=18.0, r=12.0, b=2.0))
        self.assertGreater(v["slenderness w/b"], 0.0)

    def test_scan_point_relaxes_rule_and_solves(self):
        from edgescan import one
        h, r, w, ok, vm, m = one((1.5, 12.0, 18.0))
        self.assertTrue(ok)
        self.assertLess(vm, 100.0)

    def test_wider_web_has_lower_peak_stress(self):
        from edgescan import one
        self.assertLess(one((1.0, 12.0, 20.0))[4], one((1.0, 12.0, 16.0))[4])

    def test_wider_web_is_heavier(self):
        from edgescan import one
        self.assertGreater(one((2.5, 12.0, 20.0))[5], one((2.5, 12.0, 16.0))[5])

    def test_fine_mesh_raises_peak_stress(self):
        from edgescan import one
        self.assertGreater(one((0.75, 12.0, 17.0))[4], one((1.5, 12.0, 17.0))[4])

    def test_edge_takes_top_run_of_feasible_widths(self):
        from edgescan import edge, WS
        row = {f"{w}": [w >= 16.0 or w == 15.6, 0.0, 0.0] for w in WS}   # 15.6 is an isolated feasible point
        self.assertEqual(edge(row), 16.0)

    def test_edge_none_when_top_infeasible(self):
        from edgescan import edge, WS
        self.assertIsNone(edge({f"{w}": [False, 0.0, 0.0] for w in WS}))

    def test_fine_mesh_builds(self):
        # quality round 76: the boundary-distance step was skipped past a memory cap and crashed below h ~ 0.35 mm
        from simdesign_edgescan.model import make_mesh
        m = make_mesh(Params(w=17.0, r=8.0, b=2.0), h=0.3)
        self.assertGreater(m.t.shape[1], 0)


if __name__ == "__main__":
    unittest.main()
