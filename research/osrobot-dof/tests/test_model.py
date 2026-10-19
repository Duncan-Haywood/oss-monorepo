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
        global RHO_LINK
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
