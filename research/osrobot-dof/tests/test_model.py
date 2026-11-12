import math, unittest
from osrobot_dof.model import *
from osrobot_dof.model import _fk


class T(unittest.TestCase):
    def test_pose_reaches_target_for_every_joint_count(self):
        for n in range(2, 7):
            q, L = solve_pose(n)
            tip = _fk(q, L)[-1]
            self.assertAlmostEqual(math.hypot(tip[0] - TIP_FROM_SHOULDER[0], tip[1] - TIP_FROM_SHOULDER[1]), 0.0, places=3)
            self.assertTrue(all(abs(v) < math.pi for v in q))

    def test_single_point_mass_on_one_link_matches_hand_value(self):
        # 1 joint is outside the model (needs n>=2 for a planar point), so check the mass of a 2-joint chain with
        # no rotor inertia and no servo/link mass: only the spoon is left, so the tip mass is the spoon mass.
        import osrobot_dof.model as m
        old = m.RHO_LINK
        m.RHO_LINK = 0.0
        try:
            self.assertAlmostEqual(m.tip_mass(2, m_servo=0.0, i_rotor=0.0), M_SPOON, places=6)
        finally:
            m.RHO_LINK = old

    def test_rotor_inertia_adds_mass(self):
        for n in (2, 6):
            self.assertGreater(tip_mass(n, i_rotor=1e-7), tip_mass(n, i_rotor=0.0))

    def test_heavier_servo_adds_mass(self):
        self.assertGreater(tip_mass(4, m_servo=0.12), tip_mass(4, m_servo=0.03))

    def test_deterministic_given_seed(self):
        d = Design("camera", 0.2)
        self.assertEqual(run_trial(d, 0.03, 7, 0.6), run_trial(d, 0.03, 7, 0.6))

    def test_heavier_tip_hits_harder_when_fast(self):
        light = summarise(Design("none", 0.3), 0.04, range(40), 0.2)["peak_max"]
        heavy = summarise(Design("none", 0.3), 0.04, range(40), 1.5)["peak_max"]
        self.assertGreater(heavy, light)

    def test_default_mass_reproduces_osrobot_assist_stall_push(self):
        r = summarise(Design("none", 0.1), 0.05, range(30))
        self.assertAlmostEqual(r["peak_max"], KP * LEAD * 0.1, delta=0.5)


if __name__ == "__main__":
    unittest.main()


class Pinned(unittest.TestCase):
    """Quality audit 2026-11-12: four seeded bugs in tip_mass and the gain survived the tests above.
    These pin values from an independent closed-form 2R calculation (planar 2-link arm, L = 0.25 m each,
    tip at (0.35, 0.05), elbow-down; point masses; gear^2 * I_rotor on each joint diagonal)."""
    def test_two_joint_tip_mass_matches_closed_form(self):
        self.assertAlmostEqual(tip_mass(2), 0.6280, places=3)
        self.assertAlmostEqual(tip_mass(2, i_rotor=0.0), 0.1329, places=3)
        self.assertAlmostEqual(tip_mass(2, i_rotor=3e-7), 1.618, places=2)
        self.assertAlmostEqual(tip_mass(6), 0.502, places=3)       # experiments/results.txt

    def test_damping_gain_scales_with_tip_mass(self):
        # Constant damping ratio: kd = 1.28 * 2 * sqrt(KP m), so the free approach speed KP*LEAD*v/kd falls as 1/sqrt(m)
        # and a heavier tip enters later on the same seed.
        d = Design("none", 0.2)
        light, heavy = run_trial(d, 0.0, 1, 0.3), run_trial(d, 0.0, 1, 1.2)
        # 4x the mass halves the free approach speed: entry time 0.71 s -> 1.42 s (a fixed gain would give about 0.74 s)
        self.assertAlmostEqual(light["t"], 0.71, places=2)
        self.assertAlmostEqual(heavy["t"], 1.42, places=2)
