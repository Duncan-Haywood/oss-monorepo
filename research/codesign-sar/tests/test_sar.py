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

    # Added 2026-11-18 after the quality census (portfolio/quality/audits/2026-11-17-codesign-sar.json): the old
    # evolution-strategies search returned its start policy for 93% of designs and no test noticed.
    def test_training_beats_the_default_policy(self):
        x = [90, 320, 0, 0.6, 5]
        train = range(100, 106)
        p = S.train_policy(x)
        self.assertGreater(S.policy_value(x, p, train), S.policy_value(x, S.DEFAULT_POLICY, train) + 0.05)
        self.assertNotEqual(tuple(p), S.DEFAULT_POLICY)

    def test_trained_policy_is_best_on_a_training_grid(self):
        # no approach speed on a fine grid beats the trained policy on the training terrains
        x = [90, 180, 0, 0.5, 5]
        train = range(100, 106)
        p = S.train_policy(x)
        v = S.policy_value(x, p, train)
        for k in range(5, 151, 5):
            self.assertLessEqual(S.policy_value(x, (1.5, k / 100, 0.4), train), v + 1e-12)

    def test_pinned_objective_values(self):
        # recomputed by the 2026-11-17 audit's independent grid search: 0.862 for this design
        self.assertAlmostEqual(S.evaluate([90, 320, 0, 0.6, 5])["J"], 0.862, places=3)
        self.assertAlmostEqual(S.evaluate([90, 120, 0, 0.5, 5])["J"], 0.792, places=3)

    def test_short_body_must_slow_down_for_drops(self):
        # tip-forward on a 40 mm drop limits approach speed for a 120 mm body without a flipper
        p = S.train_policy([90, 120, 0, 0.5, 5])
        self.assertLess(p[1], 1.0)
        self.assertGreater(S.evaluate([90, 120, 150, 0.5, 5])["J"], S.evaluate([90, 120, 0, 0.5, 5])["J"] + 0.05)

    def test_momentum_cannot_lift_a_wheel_over_a_step_above_its_axle(self):
        segs = [("flat", 0.0, 0.9), ("up", 0.03, 0.9)] + [("flat", 0.0, 0.9)] * 38
        r = S.run([25, 200, 0, 2.0, 20], (1.5, 1.5, 0.4), segs)
        self.assertEqual(r["distance_m"], 0.5)
        self.assertEqual(r["stuck"], 1)


if __name__ == "__main__":
    unittest.main()
