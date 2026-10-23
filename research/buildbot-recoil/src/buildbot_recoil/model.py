"""Nailer recoil against a joint-PD arm: a closed-loop transient on the Menagerie G1.

`buildbot_fasten` asks how hard the robot can push and how exactly a nail must land, both
static. This adds time: the robot holds a nailer against a wall with joint PD control plus
the static feed-forward torque; the nailer fires (a half-sine impulse J along -x on the tip)
and the tip is followed until it settles.

The pelvis is fixed in space (a large armature on its six dofs), so the legs and balance are
not modelled: this isolates the waist-and-arm chain. The wall is a one-sided spring.
"""
from dataclasses import dataclass

import mujoco
import numpy as np

from buildbot_fasten import model as F
from buildbot_payload import model as P

TOOL_KG = 3.4


@dataclass
class Setup:
    model: object
    q: np.ndarray        # hold pose
    tau_ff: np.ndarray   # feed-forward joint torque (gravity + tool + wall force)
    mass: np.ndarray     # joint-space inertia matrix at the pose (arm and trunk joints)
    tip0: np.ndarray     # tip position at hold
    force: float         # wall preload (N)
    lim: np.ndarray


def _hand_pts(robot, d):
    m = robot.model
    return [P._point(d, P._bid(m, b), p) for b, p in robot.hands["palm"]]


def setup(robot, hand_xz=(0.35, 1.0), force=30.0, mu=0.6):
    """Hold pose pressing `force` N into a wall, tool mass added to the two wrists."""
    m = robot.model
    d0 = P.standing(robot)
    ok, q, why = F.check_push(robot, d0, hand_xz, TOOL_KG, force, mu)
    if not ok:
        raise ValueError(f"hold pose infeasible: {why}")
    m = mujoco.MjModel.from_xml_path(str(P.fetch.model_path(robot.name)))
    for b, _ in robot.hands["palm"]:
        m.body_mass[P._bid(m, b)] += TOOL_KG / 2
    m.opt.disableflags |= mujoco.mjtDisableBit.mjDSBL_ACTUATION   # torques are applied directly
    m.dof_frictionloss[:] = 0                     # Menagerie's 0.3 N m joint friction is a soft constraint that distorts a hold
    m.dof_armature[:6] = 1e6                      # pelvis fixed in space
    r2 = P.Robot(robot.name, robot.feet, robot.hands, robot.half_width, m)
    d = mujoco.MjData(m)
    d.qpos[:] = q
    mujoco.mj_forward(m, d)
    bias = d.qfrc_bias.copy()
    load = np.zeros(m.nv)
    for b, p in robot.hands["palm"]:
        jp, _ = P._jac(m, d, P._bid(m, b), p)
        load += jp.T @ np.array([-force / 2, 0, 0])
    tau = bias - load
    tau[:6] = 0
    M = np.zeros((m.nv, m.nv))
    mujoco.mj_fullM(m, d, M)
    tip0 = np.mean(_hand_pts(r2, d), axis=0)
    return Setup(m, q, tau, M[6:, 6:].copy(), tip0, force, P.torque_limits(m))


def fire(s, robot, impulse, f_hz, pulse=0.004, k_wall=1e5, c_wall=350.0, zeta=0.7, t_end=1.5, dt=5e-4, delay=0.0):
    """Simulate one shot. Joint control: feed-forward plus the hold-pose inertia matrix times a critically-damped-ish
    (zeta) second-order law of natural frequency f_hz, so every mode has that bandwidth.
    Returns rows of t, tip dx, dy, dz from hold (m) and the wall force (N). The wall is a spring
    `k_wall` and a damper `c_wall` (zeta about 0.3 on a 3.4 kg tool at 1e5 N/m; assumed)."""
    m = s.model
    m.opt.timestep = dt
    d = mujoco.MjData(m)
    d.qpos[:] = s.q
    mujoco.mj_forward(m, d)
    n = m.nv - 6
    w = 2 * np.pi * f_hz
    lim = s.lim[6:]
    bodies = [(P._bid(m, b), p) for b, p in robot.hands["palm"]]
    steps = int(t_end / dt)
    nd = int(round(delay / dt))
    buf = [s.tau_ff[6:].copy()] * (nd + 1)     # the loop starts in steady hold
    out = np.zeros((steps, 5))                      # t, dx, dy, dz, wall force
    for i in range(steps):
        t = i * dt
        tip = np.mean([P._point(d, b, p) for b, p in bodies], axis=0)
        dx = tip[0] - s.tip0[0]                     # +x is into the wall
        vx = np.mean([P._jac(m, d, b, p)[0][0] @ d.qvel for b, p in bodies])
        fw = max(0.0, s.force + k_wall * dx + c_wall * vx)   # = force at hold, 0 once contact is lost
        # recoil: half-sine impulse along -x
        fr = impulse * np.pi / (2 * pulse) * np.sin(np.pi * t / pulse) if t < pulse else 0.0
        d.qfrc_applied[:] = 0
        for b, p in bodies:
            jp, _ = P._jac(m, d, b, p)
            d.qfrc_applied += jp.T @ np.array([(-fw - fr) / 2, 0, 0])
        dq = d.qvel[6:]
        qerr = d.qpos[7:] - s.q[7:]
        tau = s.tau_ff[6:] - s.mass @ (w * w * qerr + 2 * zeta * w * dq)
        buf.append(tau)
        tau = np.clip(buf.pop(0), -lim, lim)
        d.qfrc_applied[6:] += tau
        mujoco.mj_step(m, d)
        out[i] = [t, *(tip - s.tip0), fw]
    return out


def summarize(out, base, window=3.9e-3, settle=1.0e-3):
    """Numbers for one shot, relative to the same run with no shot (`base`), so the PD's own
    sag does not count. `lost_s` is how long the nosepiece is off the wall (a contact-trip
    tool can fire again when it touches down); `settle_s` is the last time the tip is more
    than `settle` from where it would have been."""
    t = out[:, 0]
    dt = t[1] - t[0]
    dx, dy, dz = (out[:, 1:4] - base[:, 1:4]).T
    off = np.hypot(dy, dz)
    bad = np.flatnonzero(np.maximum(off, np.abs(dx)) > settle)
    return {"peak_yz_mm": float(off.max() * 1e3), "peak_back_mm": float(-dx.min() * 1e3),
            "lost_s": float((out[:, 4] < 1e-9).sum() * dt),
            "settle_s": float(t[bad[-1]] + dt) if len(bad) else 0.0,
            "in_window": bool(off.max() <= window)}
