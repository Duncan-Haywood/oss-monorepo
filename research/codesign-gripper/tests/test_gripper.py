import os, sys, tempfile, unittest, json, glob
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from codesign_gripper import gripper as G, optimisers as O, stl


class GripperTests(unittest.TestCase):
    def test_force_cap_is_stress_limited_for_thin_fingers(self):
        cap, limited = G.force_cap([60, 1.5, 8, 0])
        self.assertTrue(limited)
        self.assertAlmostEqual(cap, 20e6 * 0.008 * (0.0015) ** 2 / (6 * 0.06), places=6)
        cap2, limited2 = G.force_cap([20, 3, 30, 0])
        self.assertEqual(cap2, G.SERVO_FMAX)
        self.assertFalse(limited2)

    def test_plastic_and_print_time(self):
        x = [20, 2.5, 30, 30]
        self.assertAlmostEqual(G.plastic_g(x), 2 * 20 * 2.5 * 30 * 1.24e-3, places=6)
        self.assertAlmostEqual(G.print_min(x), 2 * 20 * 2.5 * 30 / 10 / 60, places=6)

    def test_known_design_holds_every_object(self):
        r = G.evaluate([20, 2.5, 30, 30])
        self.assertEqual(r["success"], 1.0)
        self.assertAlmostEqual(r["J"], 1.0 - 0.01 * r["plastic_g"], places=9)

    def test_deterministic(self):
        x = [30, 3, 20, 0]
        self.assertEqual(G.evaluate(x)["J"], G.evaluate(x)["J"])

    def test_zero_force_drops_everything(self):
        res = [G.simulate([20, 2.5, 30, 30], o, 0.0) for o in G.OBJECTS]
        self.assertFalse(any(r["ok"] for r in res))

    def test_clip(self):
        self.assertTrue(np.all(G.clip([0, 0, 0, 99]) == [15, 1.5, 8, 50]))

    def test_stl_has_two_plates(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "f.stl")
            stl.write_stl([20, 2.5, 30, 30], p)
            s = open(p).read()
        self.assertEqual(s.count("facet normal"), 24)
        self.assertTrue(s.startswith("solid") and s.rstrip().endswith("endsolid finger"))

    def test_proposals_are_in_bounds_and_forty(self):
        ds = []
        for p in sorted(glob.glob(os.path.join(os.path.dirname(__file__), "..", "proposals", "round*.json"))):
            ds += json.load(open(p))["designs"]
        self.assertEqual(len(ds), 40)
        for x in ds:
            self.assertTrue(np.all(np.array(x) >= G.LB) and np.all(np.array(x) <= G.UB))

    def test_best_curve_is_monotone(self):
        recs = [{"J": v} for v in (0.1, 0.3, 0.2, 0.5)]
        c = O.best_curve(recs, (1, 2, 3, 4))
        self.assertEqual(c, [0.1, 0.3, 0.3, 0.5])


if __name__ == "__main__":
    unittest.main()
