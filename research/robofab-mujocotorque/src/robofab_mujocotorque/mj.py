"""The robofab two-link arm (model.Arm) rebuilt in MuJoCo, to check its hand-written torques with inverse dynamics.

Vertical x-z plane, hinges about -y so that a positive angle lifts the link towards +z. Links are uniform rods (mass at
mid-length, inertia m l^2 / 12 about the hinge axis); the gripper and part are a point mass at the wrist. MuJoCo needs a
positive-definite inertia, so the axial inertia is set to a small value that does not enter a planar motion.
"""
import mujoco
import numpy as np

from .model import G


def mjcf(arm):
    def body(name, pos, m, l, joint):
        i = m * l * l / 12.0
        return (f"<body name='{name}' pos='{pos[0]} 0 0'><joint name='{joint}' type='hinge' axis='0 -1 0'/>"
                f"<inertial pos='{l / 2} 0 0' mass='{m}' diaginertia='1e-9 {i} {i}'/>")
    return ("<mujoco><option gravity='0 0 -%g' integrator='RK4'/><worldbody>" % G
            + body("l1", (0,), arm.m1, arm.l1, "q1")
            + body("l2", (arm.l1,), arm.m2, arm.l2, "q2")
            + f"<body name='pay' pos='{arm.l2} 0 0'><inertial pos='0 0 0' mass='{arm.mp}' diaginertia='1e-9 1e-9 1e-9'/></body>"
            + "</body></body></worldbody></mujoco>")


class MjArm:
    def __init__(self, arm):
        self.arm = arm
        self.m = mujoco.MjModel.from_xml_string(mjcf(arm))
        self.d = mujoco.MjData(self.m)

    def torque(self, q, qd, qdd):
        """Joint torques (N m) MuJoCo's inverse dynamics needs for this state."""
        d = self.d
        d.qpos[:] = q
        d.qvel[:] = qd
        d.qacc[:] = qdd
        mujoco.mj_inverse(self.m, d)
        return tuple(float(x) for x in d.qfrc_inverse)

    def wrist(self, q):
        d = self.d
        d.qpos[:] = q
        mujoco.mj_kinematics(self.m, d)
        p = d.body("pay").xpos
        return float(p[0]), float(p[2])


def replay(mjarm, ts, qs, qds, qdds, arm, dt=1e-4):
    """Open-loop forward replay in MuJoCo. The planned torque (hand-written model, from the planned q, qd, qdd at time t)
    is applied as a joint force from the planned start state; the plan is a list of samples at times ts (increasing,
    ts[0] = 0), looked up by nearest earlier sample. Returns the largest joint-angle deviation (rad) over the run and the
    wrist position error (m) at the end."""
    m, d = mjarm.m, mjarm.d
    m.opt.timestep = dt
    mujoco.mj_resetData(m, d)
    d.qpos[:] = qs[0]
    d.qvel[:] = qds[0]
    k, dev, T = 0, 0.0, ts[-1]
    n = int(round(T / dt))
    for i in range(n):
        t = i * dt
        while k + 1 < len(ts) and ts[k + 1] <= t:
            k += 1
        d.qfrc_applied[:] = arm.torque(qs[k], qds[k], qdds[k])
        mujoco.mj_step(m, d)
        dev = max(dev, float(np.max(np.abs(d.qpos - np.array(qs[k])))))
    x = mjarm.wrist(tuple(d.qpos))
    xe = arm.fk(*qs[-1])
    return dev, float(np.hypot(x[0] - xe[0], x[1] - xe[1]))
