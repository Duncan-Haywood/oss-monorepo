import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from codesign_sar import sar as S


class SarTests(unittest.TestCase):
    def test_climb_height_grows_with_radius(self):
        W = 9.0
        def hmax(R):
            return max((h for h in [i / 1000 for i in range(1, 100)] if S._climb_ok(R, h, W, min(5.0 / R, 0.7 * W), 5.0, 0.7)), default=0)
        self.assertLess(hmax(0.03), hmax(0.06))
        self.assertLess(hmax(0.06), hmax(0.09))

    def test_step_taller_than_wheel_never_climbs(self):
        self.assertFalse(S._climb_ok(0.05, 0.05, 5.0, 100.0, 100.0, 5.0))

    def test_weak_motor_cannot_climb(self):
        self.assertFalse(S._climb_ok(0.08, 0.03, 9.0, 0.1 / 0.08, 0.1, 0.7))

    def test_cost_cap_marks_infeasible(self):
        r = S.evaluate([90, 320, 150, 2.0, 40])
        self.assertGreater(r["cost"], S.COST_CAP)
        self.assertFalse(r["feasible"])
        self.assertEqual(r["J"], -1.0)

    def test_deterministic_and_terrain_reproducible(self):
        x = [80, 200, 50, 1.0, 20]
        self.assertEqual(S.evaluate(x)["J"], S.evaluate(x)["J"])
        self.assertEqual(S.make_terrain(3), S.make_terrain(3))

    def test_larger_wheels_go_further_on_the_test_set(self):
        self.assertLess(S.evaluate([40, 200, 50, 1.0, 20])["distance_m"], S.evaluate([90, 200, 50, 1.0, 20])["distance_m"])

    def test_battery_limits_range(self):
        segs = [("flat", 0.0, 0.9)] * 40
        r = S.run([90, 200, 0, 1.0, 0.001], (0.5, 0.5, 0.4), segs)
        self.assertLess(r["distance_m"], 20.0)
        self.assertEqual(r["stuck"], 0)

    def test_proposals_files_are_five_wide(self):
        import glob, json
        for p in glob.glob(os.path.join(os.path.dirname(__file__), "..", "proposals", "round*.json")):
            for x in json.load(open(p))["designs"]:
                self.assertEqual(len(x), 5)


if __name__ == "__main__":
    unittest.main()
