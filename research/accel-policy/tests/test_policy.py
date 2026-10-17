import os, sys, unittest
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from accel_policy import arm, policy, hw


class T(unittest.TestCase):
    def test_dynamics_roundtrip(self):
        rng = np.random.default_rng(0)
        for _ in range(20):
            q, qd, qdd = rng.uniform(-1, 2, 2), rng.uniform(-3, 3, 2), rng.uniform(-30, 30, 2)
            tau = arm.inverse_dynamics(q, qd, qdd)
            np.testing.assert_allclose(arm.forward_dynamics(q, qd, tau), qdd, atol=1e-8)

    def test_energy_balance(self):
        # no torque: kinetic + potential energy is conserved (small dt, semi-implicit Euler)
        def energy(q, qd):
            M = arm.mass_matrix(q[1]); ke = 0.5 * qd @ M @ qd
            pe = (arm.M1 * arm.L1 / 2 + arm.M2 * arm.L1 + arm.MP * arm.L1) * arm.G * np.sin(q[0]) \
                + (arm.M2 * arm.L2 / 2 + arm.MP * arm.L2) * arm.G * np.sin(q[0] + q[1])
            return ke + pe
        q, qd = np.array([0.8, 1.0]), np.array([0.5, -0.3])
        e0 = energy(q, qd)
        for _ in range(2000):
            q, qd = arm.step(q, qd, np.zeros(2), 1e-5)
        self.assertLess(abs(energy(q, qd) - e0), 1e-3 * (abs(e0) + 0.1))

    def test_teacher_tracks(self):
        rng = np.random.default_rng(1)
        qa, qb, T = arm.random_move(rng)
        rms, peak = arm.rollout(arm.teacher, qa, qb, T, 0.001, 0.0)
        self.assertLess(peak, 0.05)

    def test_quantised_close_to_float(self):
        X, Y = policy.make_dataset(6, 0)
        net = policy.MLP([16, 16], 0).fit(X, Y, epochs=15)
        q = policy.QMLP(net, X, bits=8)
        d = [np.abs(q.forward_int(x) - net.forward(x[None])[0]).max() for x in X[:100]]
        self.assertLess(np.median(d), 0.05)

    def test_hw_models(self):
        self.assertEqual(hw.accel_cycles([8, 16, 2], 1), 8 * 16 + 3 + 16 * 2 + 3)
        self.assertEqual(hw.accel_cycles([8, 16, 2], 16), 8 + 3 + 16 + 3)
        self.assertGreater(hw.mcu_cycles([8, 16, 2], 2.5), hw.accel_cycles([8, 16, 2], 4))

    def test_latency_delays_response(self):
        rng = np.random.default_rng(2)
        qa, qb, T = arm.random_move(rng)
        a = arm.rollout(arm.teacher, qa, qb, T, 0.004, 0.0)[0]
        b = arm.rollout(arm.teacher, qa, qb, T, 0.004, 0.004)[0]
        self.assertGreaterEqual(b, a * 0.99)


if __name__ == "__main__":
    unittest.main()
