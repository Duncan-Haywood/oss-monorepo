import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import numpy as np
from codesign_ceiling import Problem, TEST
from codesign_ceiling.sim import rollout
from codesign_ceiling.analysis import CONDITIONS, oracle_reach, per_design_best, per_design_oracle, reach_by_bins

A, B, C = [dict(v) for v in CONDITIONS.values()]


def toy():
    # two designs, three scenes; design 0 is weak (f_max 10), design 1 strong (f_max 50)
    return [dict(f_max=10.0, ok={"5.0": [True, False, False], "20.0": [True, True, False]}),
            dict(f_max=50.0, ok={"5.0": [False, False, False], "20.0": [True, False, False], "60.0": [True, True, True]})]


class Analysis(unittest.TestCase):
    def test_strength_cap_removes_forces_a_finger_cannot_take(self):
        self.assertEqual(oracle_reach(toy(), A).tolist(), [True, False, False])   # 20 N is above design 0's cap; design 1's 20 N and 60 N are above 30 N
    def test_ignoring_strength_only_adds_scenes(self):
        self.assertTrue((oracle_reach(toy(), B) >= oracle_reach(toy(), A)).all())
        self.assertEqual(oracle_reach(toy(), B).tolist(), [True, True, False])
    def test_higher_force_range_adds_scenes(self):
        self.assertEqual(oracle_reach(toy(), C).tolist(), [True, True, True])
        self.assertTrue((oracle_reach(toy(), C) >= oracle_reach(toy(), B)).all())
    def test_oracle_per_design_is_at_least_a_single_force(self):
        te, _ = per_design_best(toy(), C, 3)
        self.assertTrue((per_design_oracle(toy(), C) >= te - 1e-12).all())
        self.assertAlmostEqual(per_design_oracle(toy(), C)[0], 2 / 3)
    def test_bins_count_every_scene_once(self):
        scenes = [dict(mass_g=m) for m in (200, 400, 800, 1200)]
        out = reach_by_bins(scenes, np.array([True, True, False, False]), "mass_g", [0, 500, 2000])
        self.assertEqual([o[2] for o in out], [2, 2]); self.assertEqual([o[3] for o in out], [1.0, 0.0])


class Physics(unittest.TestCase):
    def test_more_force_holds_a_heavy_slippery_object(self):
        d, _ = Problem().design([16.0, 5.0, 32.0, 0.3, 0.6])
        obj = dict(kind="cyl", size=18.0, mass_g=900.0, mu_obj=0.3, dy_mm=0.0, dz_mm=10.0)
        self.assertFalse(rollout(d, obj, 1.0)["success"]); self.assertTrue(rollout(d, obj, 20.0)["success"])
    def test_scenes_are_the_same_as_the_parent_project(self):
        self.assertEqual(len(TEST), 40)


if __name__ == "__main__":
    unittest.main()
