import math
import random
import unittest

from robofab_mujocotorque.model import Arm
from robofab_mujocotorque.mj import MjArm, replay

ARM = Arm(0.12, 0.15, 0.12, 0.15, 0.2)


class T(unittest.TestCase):
    def test_inverse_dynamics_match_hand_model(self):
        rnd, mj = random.Random(1), MjArm(ARM)
        for _ in range(300):
            q = [rnd.uniform(-2, 2) for _ in range(2)]
            qd = [rnd.uniform(-8, 8) for _ in range(2)]
            qdd = [rnd.uniform(-80, 80) for _ in range(2)]
            for a, b in zip(ARM.torque(q, qd, qdd), mj.torque(q, qd, qdd)):
                self.assertAlmostEqual(a, b, delta=1e-5)

    def test_wrist_matches_forward_kinematics(self):
        mj = MjArm(ARM)
        for q in ((0.3, 0.8), (-1.0, 1.5), (1.2, -0.4)):
            for a, b in zip(ARM.fk(*q), mj.wrist(q)):
                self.assertAlmostEqual(a, b, places=9)

    def test_static_hold_torque_is_gravity(self):
        # at rest the joint torques are the gravity torques; at q1 = 90 deg, q2 = 0 the arm is vertical and they vanish
        t = MjArm(ARM).torque((math.pi / 2, 0.0), (0, 0), (0, 0))
        self.assertAlmostEqual(t[0], 0.0, places=9)
        self.assertAlmostEqual(t[1], 0.0, places=9)

    def test_replay_of_a_static_plan_holds_still(self):
        q = (0.4, 0.6)
        ts = [0.0, 0.05, 0.1]
        dev, end = replay(MjArm(ARM), ts, [q] * 3, [(0, 0)] * 3, [(0, 0)] * 3, ARM)
        self.assertLess(dev, 1e-6)
        self.assertLess(end, 1e-6)

    def test_a_wrong_torque_is_detected(self):
        # replay with the payload mass left out of the planned torque must drift: the check can fail
        q = (0.4, 0.6)
        light = Arm(0.12, 0.15, 0.12, 0.15, 0.0)
        mj = MjArm(ARM)
        ts = [0.0, 0.05, 0.1]
        dev, _ = replay(mj, ts, [q] * 3, [(0, 0)] * 3, [(0, 0)] * 3, light)
        self.assertGreater(dev, 1e-2)


if __name__ == "__main__":
    unittest.main()
