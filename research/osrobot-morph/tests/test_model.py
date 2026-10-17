import math, unittest
import osrobot_morph.model as M
from osrobot_morph.model import *


class T(unittest.TestCase):
    def test_ik_fk_roundtrip_and_reach(self):
        q = ik(0.25, 0.25, 0.3, 0.1)
        x, y = fk(0.25, 0.25, *q)
        self.assertAlmostEqual(x, 0.3); self.assertAlmostEqual(y, 0.1)
        self.assertIsNone(ik(0.25, 0.25, 0.51, 0.0))
        self.assertIsNone(ik(0.4, 0.1, 0.1, 0.0))          # inside the inner dead zone

    def test_energy_conserved_without_torque_or_friction(self):
        old = M.B_VISC; M.B_VISC = 0.0
        try:
            l1, l2 = 0.3, 0.2; p = dyn_params(l1, l2)
            q2, w1, w2 = 1.0, 2.0, -1.0
            def ke(q2, w1, w2):
                I1, I2, M2, s2 = p; a = l1 * s2 * math.cos(q2)
                return 0.5 * ((I1 + I2 + M2 * l1 ** 2 + 2 * a) * w1 ** 2 + 2 * (I2 + a) * w1 * w2 + I2 * w2 ** 2)
            e0 = ke(q2, w1, w2); dt = 1e-4
            for _ in range(5000):                           # 0.5 s, shorter step than the model's
                a1, a2 = accel(l1, l2, p, q2, w1, w2, 0.0, 0.0)
                w1 += a1 * dt; w2 += a2 * dt; q2 += w2 * dt
            self.assertLess(abs(ke(q2, w1, w2) - e0) / e0, 0.01)
        finally:
            M.B_VISC = old

    def test_mass_matrix_positive_definite(self):
        for q2 in (0.1, 1.0, 3.0):
            p = dyn_params(0.3, 0.2); I1, I2, M2, s2 = p; a = 0.3 * s2 * math.cos(q2)
            m11 = I1 + I2 + M2 * 0.09 + 2 * a; m12 = I2 + a
            self.assertGreater(m11 * I2 - m12 ** 2, 0)

    def test_zero_move_settles_immediately(self):
        t = move_time(0.25, 0.25, DEFAULT_GAINS, (0.25, 0.0), (0.25, 0.0))
        self.assertLess(t, 0.01)

    def test_unreachable_or_diverging_is_horizon(self):
        self.assertIsNone(move_time(0.25, 0.25, DEFAULT_GAINS, (0.25, 0), (0.9, 0)))
        self.assertEqual(score(0.45, 0.05, DEFAULT_GAINS, sample_moves(3, 1)), HORIZON)   # tray unreachable
        self.assertEqual(move_time(0.25, 0.25, (0.5, 0.0, 0.5, 0.0), (0.2, 0.05), (0.3, -0.05)), HORIZON)  # no damping

    def test_torque_saturation_limits_speed(self):
        # a huge-gain step cannot beat the torque-limited time
        slow = move_time(0.25, 0.25, (60, 3, 60, 3), (0.16, -0.09), (0.34, 0.09))
        self.assertGreater(slow, 0.1)

    def test_tune_deterministic_and_not_worse_than_start(self):
        m = sample_moves(5, 1)
        a = tune(0.25, 0.25, m, 20, 7, start=DEFAULT_GAINS); b = tune(0.25, 0.25, m, 20, 7, start=DEFAULT_GAINS)
        self.assertEqual(a, b)
        self.assertLessEqual(a[1], score(0.25, 0.25, DEFAULT_GAINS, m))

    def test_reachable_split(self):
        self.assertTrue(reachable(*split_to_links(0.5)))
        self.assertFalse(reachable(*split_to_links(0.9)))
        self.assertAlmostEqual(sum(split_to_links(0.3)), TOTAL_REACH)


if __name__ == "__main__":
    unittest.main()
