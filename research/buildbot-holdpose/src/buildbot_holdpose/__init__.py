"""Posture search for the static hold of buildbot-payload.

The hands are fixed (reach, height), the feet are flat where they stood and the combined
centre of mass sits `com_dx` ahead of the sole point; the arms, waist and shoulders are
redundant, so the same hold can be reached in many postures with different joint torques.
`search` looks for the posture with the lowest peak joint fraction u_max = max |tau|/peak.
"""
import mujoco
import numpy as np

from buildbot_payload import model as M

UPPER = ("waist_pitch", "waist_roll", "shoulder", "elbow", "wrist")
TOE_EDGE = 0.09   # m ahead of the sole point: foot contact spheres reach x = 0.12 + 0.005 from the ankle, sole point at 0.035


def upper_joints(m):
    return [j for j in range(1, m.njnt)
            if any(k in mujoco.mj_id2name(m, mujoco.mjtObj.mjOBJ_JOINT, j) for k in UPPER)]


def cop_x(static):
    """Centre of pressure of each foot along x, in the sole frame (feet flat): -My / Fz."""
    f = static.sole
    return (-f[4] / f[2], -f[10] / f[8])


def self_contacts(robot, qpos):
    """Number of geom pairs in contact at this posture (the model has no floor, so any contact is the body on itself)."""
    m = robot.model
    d = mujoco.MjData(m)
    d.qpos[:] = qpos
    mujoco.mj_forward(m, d)
    return int(d.ncon)


def perturbed(robot, data0, rng, sigma):
    """A copy of data0 with the upper joints moved by N(0, sigma) rad, clipped to range. Legs and base are untouched, so the feet stay put."""
    m = robot.model
    d = mujoco.MjData(m)
    d.qpos[:] = data0.qpos
    for j in upper_joints(m):
        a = m.jnt_qposadr[j]
        lo, hi = m.jnt_range[j]
        d.qpos[a] = np.clip(d.qpos[a] + rng.normal(0, sigma), lo, hi)
    mujoco.mj_kinematics(m, d)
    return d


def evaluate(robot, anchor, hand_xz, mass, com_dx, grip="palm"):
    """(u_max, worst joint, Pose, Static, contacts) of the pose reached from this anchor; u_max is inf if the pose or its contact state is invalid."""
    p = M.pose(robot, anchor, hand_xz, mass, grip, com_dx=com_dx)
    s = M.torques(robot, p.qpos, mass, grip)
    n = self_contacts(robot, p.qpos)
    u = float(s.ratio.max()) if p.ok and n == 0 and min(s.foot_fz) > 0 else float("inf")
    return u, s.worst, p, s, n


def search(robot, data0, hand_xz, mass, com_dx, seed=0, n_random=60, n_refine=160, sigma=0.4):
    """Random restarts of the posture anchor, then a (1+1) evolution strategy on the best.

    The step size doubles-ish on a success and shrinks on a failure (the 1/5 rule), so the
    refinement does not stall at a fixed step. Returns a dict with the best u found, its
    joint, the posture, the anchor that reached it, and `u_default`, the u_max of the default
    balanced pose (data0 as the anchor). A search gives an upper bound on the true minimum.
    Deterministic given `seed`."""
    rng = np.random.default_rng(seed)
    u0, w0, p0, s0, n0 = evaluate(robot, data0, hand_xz, mass, com_dx)
    best = (u0, w0, p0.qpos, data0)
    tried = 1
    for _ in range(n_random):
        a = perturbed(robot, data0, rng, sigma)
        u, w, p, s, n = evaluate(robot, a, hand_xz, mass, com_dx)
        tried += 1
        if u < best[0]:
            best = (u, w, p.qpos, a)
    step = sigma * 0.5
    for _ in range(n_refine):
        a = perturbed(robot, best[3], rng, step)
        u, w, p, s, n = evaluate(robot, a, hand_xz, mass, com_dx)
        tried += 1
        if u < best[0]:
            best = (u, w, p.qpos, a)
            step *= 1.5
        else:
            step = max(step * 0.9, 0.01)
    return {"u": best[0], "joint": best[1], "qpos": best[2], "anchor": best[3], "u_default": u0,
            "joint_default": w0, "evals": tried}
