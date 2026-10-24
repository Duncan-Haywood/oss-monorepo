"""Whole-body static payload of a standing humanoid holding a load in both hands.

For a hand position (height above the floor, reach forward of the feet) and a
load mass, `pose` solves the inverse kinematics of the floating-base robot with
both feet flat where they stood and the combined centre of mass (robot plus
load) over the middle of the feet, so the robot leans back to balance the load.
`torques` then finds the static joint torques: gravity on the links, the load
at the hands, and ground wrenches at the soles that balance the floating base
(minimum-norm split between the feet). `max_payload` bisects for the heaviest
load whose torques all stay inside the model's joint torque limits.

Static only: no walking, no dynamics, no friction or grip limits.
"""
from dataclasses import dataclass, field

import mujoco
import numpy as np

from . import fetch

G = 9.81


@dataclass
class Robot:
    name: str
    feet: tuple            # (body, sole point in body frame) for left, right
    hands: dict            # grip -> ((body, point), (body, point)) left, right
    half_width: float      # hands this far either side of the midline (m)
    model: object = field(default=None, repr=False)


def g1():
    sole = (0.035, 0.0, -0.05)
    return Robot("g1",
                 feet=(("left_ankle_roll_link", sole), ("right_ankle_roll_link", sole)),
                 hands={"palm": (("left_wrist_yaw_link", (0.08, 0, 0)),
                                 ("right_wrist_yaw_link", (0.08, 0, 0))),
                        "cradle": (("left_wrist_roll_link", (0, 0, 0)),
                                   ("right_wrist_roll_link", (0, 0, 0)))},
                 half_width=0.18)


def h1():
    sole = (0.04, 0.0, -0.07)
    end = (0.28, 0.0, -0.015)  # centre of the forearm-end sphere; H1 has no hand
    hand = (("left_elbow_link", end), ("right_elbow_link", end))
    return Robot("h1",
                 feet=(("left_ankle_link", sole), ("right_ankle_link", sole)),
                 hands={"palm": hand, "cradle": hand},
                 half_width=0.22)


ROBOTS = {"g1": g1, "h1": h1}


def load(name):
    r = ROBOTS[name]()
    r.model = mujoco.MjModel.from_xml_path(str(fetch.model_path(name)))
    return r


def torque_limits(model):
    """Per-dof torque limit: the joint's actuatorfrcrange, else its motor's ctrlrange x gear."""
    lim = np.full(model.nv, np.inf)
    for j in range(model.njnt):
        if model.jnt_type[j] != mujoco.mjtJoint.mjJNT_HINGE:
            continue
        d = model.jnt_dofadr[j]
        if model.jnt_actfrclimited[j]:
            lim[d] = model.jnt_actfrcrange[j, 1]
    for a in range(model.nu):
        j = model.actuator_trnid[a, 0]
        d = model.jnt_dofadr[j]
        if np.isinf(lim[d]) and model.actuator_ctrllimited[a]:
            lim[d] = model.actuator_ctrlrange[a, 1] * abs(model.actuator_gear[a, 0])
    return lim


def _bid(model, name):
    return mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY, name)


def _point(data, bid, local):
    return data.xpos[bid] + data.xmat[bid].reshape(3, 3) @ np.asarray(local, float)


def _jac(model, data, bid, local):
    jp, jr = np.zeros((3, model.nv)), np.zeros((3, model.nv))
    mujoco.mj_jac(model, data, jp, jr, _point(data, bid, local), bid)
    return jp, jr


def standing(robot):
    """Home pose: the keyframe if there is one, else qpos0, standing on z = 0."""
    m = robot.model
    d = mujoco.MjData(m)
    if m.nkey:
        d.qpos[:] = m.key_qpos[0]
    mujoco.mj_kinematics(m, d)
    soles = [_point(d, _bid(m, b), p)[2] for b, p in robot.feet]
    d.qpos[2] -= min(soles)
    mujoco.mj_forward(m, d)
    return d


@dataclass
class Pose:
    qpos: np.ndarray
    ok: bool
    residual: float


def pose(robot, data0, hand_xz, mass, grip="palm", q_init=None, iters=600, com_dx=0.0, dy=0.0):
    """IK: feet fixed, hands at (x, +-half_width, z) relative to the feet centre, CoM balanced.

    `com_dx` shifts the balanced CoM that far forward of the feet centre (m); a robot that
    pushes on a wall leans into it (buildbot-fasten). `dy` shifts both hand targets sideways
    (m, +y to the left) without moving the feet (buildbot-stance).
    """
    m = robot.model
    d = mujoco.MjData(m)
    d.qpos[:] = data0.qpos if q_init is None else q_init
    feet = [(_bid(m, b), p) for b, p in robot.feet]
    hands = [(_bid(m, b), p) for b, p in robot.hands[grip]]
    foot_pos = [_point(data0, b, p) for b, p in feet]
    foot_quat = []
    for b, _ in feet:
        q = np.zeros(4)
        mujoco.mju_mat2Quat(q, data0.xmat[b])
        foot_quat.append(q)
    centre = (foot_pos[0] + foot_pos[1]) / 2
    x, z = hand_xz
    hand_tgt = [centre + np.array([x, robot.half_width + dy, 0]), centre + np.array([x, -robot.half_width + dy, 0])]
    for t in hand_tgt:
        t[2] = z
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
        for (b, p), tp, tq in zip(feet, foot_pos, foot_quat):
            jp, jr = _jac(m, d, b, p)
            cq = np.zeros(4)
            mujoco.mju_mat2Quat(cq, d.xmat[b])
            eo = np.zeros(3)
            mujoco.mju_subQuat(eo, tq, cq)
            rows += [10 * jp, 10 * jr]
            errs += [10 * (tp - _point(d, b, p)), 10 * d.xmat[b].reshape(3, 3) @ eo]
        jh = []
        for (b, p), t in zip(hands, hand_tgt):
            jp, _ = _jac(m, d, b, p)
            jh.append(jp)
            rows.append(jp)
            errs.append(t - _point(d, b, p))
        jc = np.zeros((3, m.nv))
        mujoco.mj_jacSubtreeCom(m, d, jc, 1)
        hp = [_point(d, b, p) for b, p in hands]
        com = (M * d.subtree_com[1] + mass / 2 * (hp[0] + hp[1])) / (M + mass)
        jcom = (M * jc + mass / 2 * (jh[0] + jh[1])) / (M + mass)
        rows.append(5 * jcom[:2])
        errs.append(5 * (centre[:2] + [com_dx, 0.0] - com[:2]))
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
    # Levenberg-Marquardt with a posture regulariser (per rad) annealed towards zero,
    # so the pose stays near the home pose where the tasks leave freedom
    for w in (0.1, 0.01, 0.001):
        q = _lm(q, w, iters // 3, residual, cost, clip, m)
    J, e = residual(q)
    res = float(np.linalg.norm(e))
    return Pose(q.copy(), res < 5e-3, res)


def _pushing(m, q, dq):
    """Dofs of limited hinges sitting on a stop with dq pointing further out."""
    out = np.zeros(m.nv, bool)
    for j in np.flatnonzero((m.jnt_type == mujoco.mjtJoint.mjJNT_HINGE) & m.jnt_limited.astype(bool)):
        a, k = m.jnt_qposadr[j], m.jnt_dofadr[j]
        lo, hi = m.jnt_range[j]
        out[k] = (q[a] <= lo + 1e-9 and dq[k] < 0) or (q[a] >= hi - 1e-9 and dq[k] > 0)
    return out


def _lm(q, w, iters, residual, cost, clip, m):
    J, e = residual(q)
    c, post = cost(q, e, w)
    lam = 1e-2
    for _ in range(iters):
        if float(np.linalg.norm(e)) < 1e-6 or lam > 1e6:
            break
        free = np.ones(m.nv, bool)
        for _ in range(4):  # active set: freeze joints pushed against a stop
            Jf = J * free
            A = Jf.T @ Jf + (w ** 2 + lam) * np.eye(m.nv)
            dq = np.linalg.solve(A, Jf.T @ e + w ** 2 * post * free) * free
            push = _pushing(m, q, dq) & free
            if not push.any():
                break
            free &= ~push
        dq *= min(1.0, 0.2 / max(np.abs(dq).max(), 1e-12))
        qn = q.copy()
        mujoco.mj_integratePos(m, qn, dq, 1.0)
        qn = clip(qn)
        Jn, en = residual(qn)
        cn, postn = cost(qn, en, w)
        if cn < c:
            q, J, e, c, post, lam = qn, Jn, en, cn, postn, max(lam / 3, 1e-6)
        else:
            lam *= 4
    return q


@dataclass
class Static:
    tau: np.ndarray        # per dof (base rows are zero)
    ratio: np.ndarray      # |tau| / limit
    worst: str             # joint with the largest ratio
    foot_fz: tuple         # vertical ground force on each foot (N)
    sole: np.ndarray       # ground wrench (force, moment) at the left then right sole point


def torques(robot, qpos, mass, grip="palm"):
    m = robot.model
    d = mujoco.MjData(m)
    d.qpos[:] = qpos
    mujoco.mj_forward(m, d)
    bias = d.qfrc_bias.copy()  # gravity only: qvel = 0
    load = np.zeros(m.nv)
    for b, p in robot.hands[grip]:
        jp, _ = _jac(m, d, _bid(m, b), p)
        load += jp.T @ np.array([0, 0, -mass * G / 2])
    Jc = np.vstack([np.vstack(_jac(m, d, _bid(m, b), p)) for b, p in robot.feet])  # 12 x nv
    f, *_ = np.linalg.lstsq(Jc[:, :6].T, bias[:6] - load[:6], rcond=None)
    tau = bias - load - Jc.T @ f
    tau[:6] = 0.0
    lim = torque_limits(m)
    ratio = np.where(np.isfinite(lim), np.abs(tau) / lim, 0.0)
    k = int(np.argmax(ratio))
    jid = int(np.flatnonzero(m.jnt_dofadr == k)[0])
    return Static(tau, ratio, mujoco.mj_id2name(m, mujoco.mjtObj.mjOBJ_JOINT, jid),
                  (float(f[2]), float(f[8])), f)


def check(robot, data0, hand_xz, mass, grip="palm", q_init=None):
    """(feasible, Pose, Static) for one load at one hand position."""
    p = pose(robot, data0, hand_xz, mass, grip, q_init)
    s = torques(robot, p.qpos, mass, grip)
    ok = p.ok and float(s.ratio.max()) <= 1.0 and min(s.foot_fz) > 0
    return ok, p, s


def max_payload(robot, data0, hand_xz, grip="palm", hi=60.0, tol=0.1):
    """Heaviest two-handed load (kg) at hand_xz inside the torque limits; None if unreachable."""
    ok, p, s = check(robot, data0, hand_xz, 0.0, grip)
    if not ok:
        return None, s.worst if p.ok else "reach"
    lo, q, worst = 0.0, p.qpos, s.worst
    while hi - lo > tol:
        mid = (lo + hi) / 2
        ok, p2, s2 = check(robot, data0, hand_xz, mid, grip, q)
        if ok:
            lo, q = mid, p2.qpos
        else:
            hi, worst = mid, (s2.worst if p2.ok else "reach")
    return lo, worst
