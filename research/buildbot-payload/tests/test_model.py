import unittest

import mujoco
import numpy as np

from buildbot_payload import fetch
from buildbot_payload import model as M

HAVE = {r: fetch.available(r) for r in fetch.ROBOTS}


def applied_forces(robot, qpos, st, mass, grip):
    """Generalised force of joint torques + sole wrenches + hand loads, rebuilt independently."""
    m = robot.model
    d = mujoco.MjData(m)
    d.qpos[:] = qpos
    mujoco.mj_forward(m, d)
    f = np.zeros(m.nv)
    for b, p in robot.hands[grip]:
        bid = M._bid(m, b)
        mujoco.mj_applyFT(m, d, np.array([0, 0, -mass * M.G / 2]), np.zeros(3),
                          M._point(d, bid, p), bid, f)
    return d, f


@unittest.skipUnless(all(HAVE.values()), "Menagerie models not fetched (needs git and network)")
class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.r = {n: M.load(n) for n in fetch.ROBOTS}
        cls.d0 = {n: M.standing(r) for n, r in cls.r.items()}

    def test_ik_hits_targets_and_balances(self):
        r, d0 = self.r["g1"], self.d0["g1"]
        p = M.pose(r, d0, (0.3, 0.8), 5.0)
        self.assertTrue(p.ok, p.residual)
        d = mujoco.MjData(r.model)
        d.qpos[:] = p.qpos
        mujoco.mj_forward(r.model, d)
        hp = [M._point(d, M._bid(r.model, b), q) for b, q in r.hands["palm"]]
        fp = [M._point(d0, M._bid(r.model, b), q) for b, q in r.feet]
        c = (fp[0] + fp[1]) / 2
        for h, s in zip(hp, (1, -1)):
            np.testing.assert_allclose(h, [c[0] + 0.3, s * r.half_width, 0.8], atol=2e-3)
        mtot = r.model.body_subtreemass[1]
        com = (mtot * d.subtree_com[1] + 2.5 * (hp[0] + hp[1])) / (mtot + 5)
        np.testing.assert_allclose(com[:2], c[:2], atol=1e-3)

    def test_static_solution_has_zero_acceleration(self):
        # forward dynamics with the solved torques, sole wrenches and load applied must not move
        for n in fetch.ROBOTS:
            r, d0 = self.r[n], self.d0[n]
            p = M.pose(r, d0, (0.35, 0.9), 4.0)
            st = M.torques(r, p.qpos, 4.0)
            d, f = applied_forces(r, p.qpos, st, 4.0, "palm")
            for (b, q), k in zip(r.feet, (0, 6)):
                bid = M._bid(r.model, b)
                mujoco.mj_applyFT(r.model, d, st.sole[k:k + 3], st.sole[k + 3:k + 6],
                                  M._point(d, bid, q), bid, f)
            d.qfrc_applied[:] = f + st.tau
            d.qvel[:] = 0
            # no joint stops, self-contact or the model's own (position) actuators
            off = int(mujoco.mjtDisableBit.mjDSBL_CONSTRAINT) | int(mujoco.mjtDisableBit.mjDSBL_ACTUATION)
            r.model.opt.disableflags |= off
            try:
                mujoco.mj_forward(r.model, d)
            finally:
                r.model.opt.disableflags &= ~off
            self.assertLess(np.abs(d.qacc).max(), 1e-6, n)

    def test_feet_carry_robot_and_load(self):
        r, d0 = self.r["h1"], self.d0["h1"]
        p = M.pose(r, d0, (0.3, 1.0), 6.0)
        st = M.torques(r, p.qpos, 6.0)
        self.assertAlmostEqual(sum(st.foot_fz), (r.model.body_subtreemass[1] + 6.0) * M.G, places=6)

    def test_torque_grows_with_load_at_fixed_pose(self):
        r, d0 = self.r["g1"], self.d0["g1"]
        p = M.pose(r, d0, (0.4, 0.9), 0.0)
        a, b = M.torques(r, p.qpos, 1.0), M.torques(r, p.qpos, 5.0)
        self.assertGreater(b.ratio.max(), a.ratio.max())

    def test_cradle_unloads_the_wrist(self):
        r, d0 = self.r["g1"], self.d0["g1"]
        # at a fixed pose the load adds nothing at the wrist when it hangs on the forearm end
        p = M.pose(r, d0, (0.3, 0.8), 3.0, grip="cradle")
        k = r.model.jnt_dofadr[mujoco.mj_name2id(r.model, mujoco.mjtObj.mjOBJ_JOINT, "left_wrist_pitch_joint")]
        cradle = [M.torques(r, p.qpos, kg, grip="cradle").tau[k] for kg in (0.0, 3.0)]
        palm = [M.torques(r, p.qpos, kg, grip="palm").tau[k] for kg in (0.0, 3.0)]
        self.assertAlmostEqual(cradle[1] - cradle[0], 0.0, places=9)
        self.assertGreater(abs(palm[1] - palm[0]), 0.1)

    def test_limits_read_from_model(self):
        lim = M.torque_limits(self.r["g1"].model)
        self.assertEqual(sorted(set(lim[6:])), [5.0, 25.0, 50.0, 88.0, 139.0])
        lim = M.torque_limits(self.r["h1"].model)
        self.assertEqual(sorted(set(lim[6:])), [18.0, 40.0, 200.0, 300.0])

    def test_unreachable_is_reported(self):
        r, d0 = self.r["g1"], self.d0["g1"]
        kg, why = M.max_payload(r, d0, (0.3, 2.4))
        self.assertIsNone(kg)
        self.assertEqual(why, "reach")


if __name__ == "__main__":
    unittest.main()
