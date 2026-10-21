"""Carrying a load while walking: how long a step can a stock humanoid take, and what does that make its carry rate?

A model-based envelope, not a walking policy. Walking is a sequence of single-support
phases, and the hardest instant of one is just before touchdown, when the swing foot is
about to land a step length L ahead of the stance foot (and s higher, for a threshold or a
riser) and the centre of mass (CoM) is L/2 ahead of the stance foot. In the linear inverted
pendulum model with the zero-moment point (ZMP) held at the stance foot's sole point, a
periodic gait of step length L has exactly that peak (CoM L/2 ahead, accelerating forward
at a = g (L/2) / h with h the CoM height over the sole). `stride_check` solves the
whole-body pose for that instant (stance foot planted, swing foot at its landing spot, hands
on the load, CoM where the model says), computes the stance-leg torques with the
acceleration applied as a tilted gravity (d'Alembert), and tests them against the joint
limits. `max_step` is the longest step that passes. `carry_rate` turns a step length and a
step time into a pieces-per-minute figure for trips of a given length.

Left out: swing-leg inertia, angular momentum, joint speed limits, double support, impacts,
grasp slip. No fall or drop is simulated. The pose is also restrictive (flat soles, ZMP
held at the sole point, touchdown with the CoM exactly L/2 ahead), so the envelope is neither
an upper nor a lower bound on what a real walking controller achieves; it is the longest step
this one stated gait supports.
"""
from dataclasses import dataclass
from math import floor

import mujoco
import numpy as np

from buildbot_payload import model as P

G = P.G
MU = 0.6    # rubber on concrete spans about 0.3 to 0.6 (swept in run.py)
GAP = 0.2   # lateral distance between the soles' reference points while walking (m); modelling choice, swept in run.py


@dataclass
class Stride:
    ok: bool
    ik_ok: bool
    mu_need: float        # friction coefficient the stance foot needs: a / g
    ratio: float          # largest |tau| / limit over the actuated joints
    worst: str
    accel: float          # forward CoM acceleration (m/s^2)
    com_height: float     # CoM height over the stance sole point (m)
    zmp: tuple            # ground-moment arm (x, y) about the stance sole point (m)
    qpos: np.ndarray


def _tilted_gravity(model, ax):
    old = model.opt.gravity.copy()
    model.opt.gravity[:] = [-ax, 0.0, -G]
    return old


def stride_pose(robot, data0, hand_xz, mass, L, s=0.0, grip="palm", q_init=None, iters=600, gap=GAP):
    """IK for the instant before touchdown. Returns (qpos, converged, residual).

    Stance foot = robot.feet[0] planted where it stood. Swing foot = robot.feet[1] flat at
    (L ahead, s higher). The feet are `gap` apart laterally (the home pose of the Menagerie models
    stands wider than a walker). CoM (robot + load) L/2 ahead of the stance
    sole point and over it laterally. Hands at (x, +-half_width, z) from the point under the CoM.
    """
    m = robot.model
    d = mujoco.MjData(m)
    d.qpos[:] = data0.qpos if q_init is None else q_init
    feet = [(P._bid(m, b), p) for b, p in robot.feet]
    hands = [(P._bid(m, b), p) for b, p in robot.hands[grip]]
    foot_pos = [P._point(data0, b, p) for b, p in feet]
    foot_quat = []
    for b, _ in feet:
        q = np.zeros(4)
        mujoco.mju_mat2Quat(q, data0.xmat[b])
        foot_quat.append(q)
    mid = (foot_pos[0] + foot_pos[1]) / 2
    foot_tgt = [mid + np.array([0.0, gap / 2, 0.0]), mid + np.array([L, -gap / 2, s])]
    under = foot_tgt[0].copy()
    under[0] += L / 2
    x, z = hand_xz
    hand_tgt = [under + np.array([x, robot.half_width, 0.0]), under + np.array([x, -robot.half_width, 0.0])]
    for t in hand_tgt:
        t[2] = z
    free_roll = not any("ankle_roll" in (mujoco.mj_id2name(m, mujoco.mjtObj.mjOBJ_JOINT, j) or "")
                        for j in range(m.njnt))
    M = float(m.body_subtreemass[1])
    q0 = data0.qpos.copy()
    hinge = m.jnt_type == mujoco.mjtJoint.mjJNT_HINGE
    lo, hi = m.jnt_range[:, 0], m.jnt_range[:, 1]
    adr = m.jnt_qposadr

    def residual(q):
        d.qpos[:] = q
        mujoco.mj_kinematics(m, d)
        mujoco.mj_comPos(m, d)
        rows, errs = [], []
        for (b, p), tp, tq in zip(feet, foot_tgt, foot_quat):
            jp, jr = P._jac(m, d, b, p)
            cq = np.zeros(4)
            mujoco.mju_mat2Quat(cq, d.xmat[b])
            eo = np.zeros(3)
            mujoco.mju_subQuat(eo, tq, cq)
            eo = d.xmat[b].reshape(3, 3) @ eo
            if free_roll:  # no ankle roll joint: the sole may tilt about its own forward axis
                a = d.xmat[b].reshape(3, 3)[:, 0]
                jr = jr - np.outer(a, a @ jr)
                eo = eo - a * (a @ eo)
            rows += [10 * jp, 10 * jr]
            errs += [10 * (tp - P._point(d, b, p)), 10 * eo]
        jh = []
        for (b, p), t in zip(hands, hand_tgt):
            jp, _ = P._jac(m, d, b, p)
            jh.append(jp)
            rows.append(jp)
            errs.append(t - P._point(d, b, p))
        jc = np.zeros((3, m.nv))
        mujoco.mj_jacSubtreeCom(m, d, jc, 1)
        hp = [P._point(d, b, p) for b, p in hands]
        com = (M * d.subtree_com[1] + mass / 2 * (hp[0] + hp[1])) / (M + mass)
        jcom = (M * jc + mass / 2 * (jh[0] + jh[1])) / (M + mass)
        rows.append(5 * jcom[:2])
        errs.append(5 * (under[:2] - com[:2]))
        return np.vstack(rows), np.concatenate(errs)

    def cost(q, e, w):
        post = np.zeros(m.nv)
        mujoco.mj_differentiatePos(m, post, 1.0, q, q0)
        return float(e @ e + w ** 2 * post @ post), post

    def clip(q):
        for j in np.flatnonzero(hinge & m.jnt_limited.astype(bool)):
            q[adr[j]] = np.clip(q[adr[j]], lo[j], hi[j])
        return q

    q = clip(d.qpos.copy())
    for w in (0.1, 0.01, 0.001):
        q = P._lm(q, w, iters // 3, residual, cost, clip, m)
    J, e = residual(q)
    res = float(np.linalg.norm(e))
    return q.copy(), res < 5e-3, res


def stride_torques(robot, qpos, mass, L, grip="palm"):
    """Joint torques at the touchdown instant, with the LIPM acceleration as a tilted gravity.

    Returns (Stride-like tuple): ratio array, worst joint, accel, CoM height, ground-moment arms.
    """
    m = robot.model
    d = mujoco.MjData(m)
    d.qpos[:] = qpos
    mujoco.mj_forward(m, d)
    b0, p0 = robot.feet[0]
    sole = P._point(d, P._bid(m, b0), p0)
    M = float(m.body_subtreemass[1])
    hp = [P._point(d, P._bid(m, b), p) for b, p in robot.hands[grip]]
    com = (M * d.subtree_com[1] + mass / 2 * (hp[0] + hp[1])) / (M + mass)
    h = float(com[2] - sole[2])
    ax = G * (L / 2) / h
    old = _tilted_gravity(m, ax)
    try:
        mujoco.mj_forward(m, d)
        bias = d.qfrc_bias.copy()
    finally:
        m.opt.gravity[:] = old
    load = np.zeros(m.nv)
    for b, p in robot.hands[grip]:
        jp, _ = P._jac(m, d, P._bid(m, b), p)
        load += jp.T @ np.array([-mass * ax / 2, 0.0, -mass * G / 2])
    Jc = np.vstack(P._jac(m, d, P._bid(m, b0), p0))            # 6 x nv, stance sole only
    f = np.linalg.solve(Jc[:, :6].T, bias[:6] - load[:6])
    tau = bias - load - Jc.T @ f
    tau[:6] = 0.0
    lim = P.torque_limits(m)
    ratio = np.where(np.isfinite(lim), np.abs(tau) / lim, 0.0)
    k = int(np.argmax(ratio))
    jid = int(np.flatnonzero(m.jnt_dofadr == k)[0])
    worst = mujoco.mj_id2name(m, mujoco.mjtObj.mjOBJ_JOINT, jid)
    fz = float(f[2])
    # f[3:6] is the moment at the sole point; its arm about the vertical force is the ZMP offset
    zmp = (float(-f[4] / fz), float(f[3] / fz))
    return ratio, worst, ax, h, zmp, fz


def stride_check(robot, data0, hand_xz, mass, L, s=0.0, grip="palm", q_init=None, mu=MU, gap=GAP):
    q, ik_ok, _ = stride_pose(robot, data0, hand_xz, mass, L, s, grip, q_init, gap=gap)
    if not ik_ok:
        return Stride(False, False, 0.0, float("inf"), "reach", 0.0, 0.0, (0.0, 0.0), q)
    ratio, worst, ax, h, zmp, fz = stride_torques(robot, q, mass, L, grip)
    need = ax / G
    if need > mu:
        worst = "friction"
    return Stride(float(ratio.max()) <= 1.0 and fz > 0 and need <= mu, True, need, float(ratio.max()), worst, ax, h, zmp, q)


def max_step(robot, data0, hand_xz, mass, s=0.0, grip="palm", lengths=None, mu=MU, gap=GAP):
    """Longest step (m) from a grid that passes.

    Walks up the grid from the shortest step, warm-starting the IK from the last solved step
    (a long step fails from the home pose). A failing length is retried from the home pose,
    and the search stops after two failing lengths in a row. Returns (L or None, the binding
    joint (or 'reach' / 'friction') at the first failure, Stride at L).
    """
    lengths = lengths if lengths is not None else [round(0.05 * i, 2) for i in range(1, 17)]
    best, q, why, last, misses = None, None, "none", None, 0
    for L in lengths:
        r = stride_check(robot, data0, hand_xz, mass, L, s, grip, q, mu, gap)
        if not r.ok and q is not None:
            r = stride_check(robot, data0, hand_xz, mass, L, s, grip, None, mu, gap)
        if r.ok:
            best, q, last, misses = L, r.qpos, r, 0
        else:
            if misses == 0:
                why = r.worst
            misses += 1
            if misses >= 2 and best is not None:
                break
    return best, why, last


def lipm_speed(L, T):
    """Mean forward speed of the periodic LIPM gait with step length L and step time T: L / T."""
    return L / T


def carry_rate(n, v, dist, handling):
    """Pieces per minute when n pieces are carried per trip of `dist` metres each way at v m/s,
    plus `handling` seconds a trip to pick up and set down."""
    trip = 2 * dist / v + handling
    return 60.0 * n / trip


def best_pieces(v_by_n, dist, handling, nmax=8):
    """Choose how many pieces to carry per trip. `v_by_n(n)` is the walking speed with n pieces
    (None if the load cannot be walked with). Returns (rate, n, v); (0, 0, 0) if none can."""
    best = (0.0, 0, 0.0)
    for n in range(1, nmax + 1):
        v = v_by_n(n)
        if v is None:
            continue
        r = carry_rate(n, v, dist, handling)
        if r > best[0]:
            best = (r, n, v)
    return best
