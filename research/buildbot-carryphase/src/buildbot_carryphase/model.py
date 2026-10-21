"""A stock humanoid carrying a load through one single-support phase of a walking step.

The gait is prescribed, not learned. For a step length L and step time T the
combined centre of mass (robot plus load) follows the linear inverted pendulum
orbit (Kajita et al. 2001) over a stance foot, the swing foot travels from one
footprint behind to one ahead, and the hands hold the load at a fixed offset
ahead of the centre of mass. Whole-body inverse kinematics (the solver of
`buildbot_payload`) turns that into joint angles at 13 instants, a polynomial
in time smooths them, and MuJoCo's inverse dynamics gives the joint torques
that the stance foot's wrench leaves to the joints. The run scores those torques
against the model's limits, the centre of pressure against the foot, and the
friction the foot needs. Slope enters as a tilted gravity in the ground frame;
a step-up as a higher landing point for the swing foot.

Not modelled: double support, impact at touchdown, lateral sway, a controller,
and anything that can make the real robot fall.
"""
from dataclasses import dataclass

import mujoco
import numpy as np

from buildbot_payload import model as P

G = 9.81
N_IK = 13          # IK samples across the single-support phase
N_EVAL = 25        # time samples where torques are scored
DEG = 8            # polynomial degree of the smoothing fit


def foot_box(robot, data0):
    """Heel, toe, right and left edges of the sole in the sole point's frame (m), from the contact spheres."""
    m = robot.model
    b, p = robot.feet[0]
    bid = P._bid(m, b)
    pt = P._point(data0, bid, p)
    pts = []
    for g in range(m.ngeom):
        if m.geom_bodyid[g] == bid and m.geom_contype[g]:
            c = data0.geom_xpos[g] - pt
            r = m.geom_size[g][0]
            pts.append((c[0] - r, c[0] + r, c[1] - r, c[1] + r))
    a = np.array(pts)
    return a[:, 0].min(), a[:, 1].max(), a[:, 2].min(), a[:, 3].max()


def lipm_x(L, T, zc, t):
    """COM x relative to the stance foot at times t, for the symmetric single-support orbit with the
    centre of pressure under the foot (x from -L/2 to +L/2 in T seconds)."""
    Tc = np.sqrt(zc / G)
    a = L / 2
    v0 = a / Tc / np.tanh(T / (2 * Tc))
    return -a * np.cosh(t / Tc) + Tc * v0 * np.sinh(t / Tc)


def min_jerk(s):
    return 10 * s ** 3 - 15 * s ** 4 + 6 * s ** 5


@dataclass
class Setup:
    robot: object
    d0: object
    stance: int = 0

    def __post_init__(self):
        m = self.robot.model
        self.feet = [(P._bid(m, b), p) for b, p in self.robot.feet]
        self.hands = [(P._bid(m, b), p) for b, p in self.robot.hands["palm"]]
        self.S = P._point(self.d0, *self.feet[self.stance])
        sw = P._point(self.d0, *self.feet[1 - self.stance])
        self.ysep = -0.15  # step width: foot centres this far apart sideways (my choice)
        self.quat = []
        for b, _ in self.feet:
            q = np.zeros(4)
            mujoco.mju_mat2Quat(q, self.d0.xmat[b])
            self.quat.append(q)
        self.M = float(m.body_subtreemass[1])
        # the H1 has a pitch-only ankle: its feet roll with the leg, so the foot's roll is left free in the IK
        self.roll_free = not any("ankle_roll" in (mujoco.mj_id2name(m, mujoco.mjtObj.mjOBJ_JOINT, j) or "")
                                 for j in range(m.njnt))
        self.box = foot_box(self.robot, self.d0)


def ik(su, tgt, mass, q_init, iters=240):
    """Stance foot pinned, swing foot at tgt['swing'] (rel. to the stance sole), hands at tgt['hand'] = (x, z)
    rel. to the stance sole, combined COM at tgt['com_x'] ahead of it and over it sideways."""
    m = su.robot.model
    d = mujoco.MjData(m)
    d.qpos[:] = q_init
    hinge = m.jnt_type == mujoco.mjtJoint.mjJNT_HINGE
    lo, hi, adr = m.jnt_range[:, 0], m.jnt_range[:, 1], m.jnt_qposadr
    swing = su.S + np.array(tgt["swing"])
    hx, hz = tgt["hand"]
    hw = su.robot.half_width
    hand_tgt = [np.array([su.S[0] + hx, su.S[1] + hw, hz]), np.array([su.S[0] + hx, su.S[1] - hw, hz])]
    com_xy = su.S[:2] + np.array([tgt["com_x"], 0.0])
    fixed = [su.S, swing]
    order = [su.stance, 1 - su.stance]
    q0 = su.d0.qpos.copy()

    def residual(q):
        d.qpos[:] = q
        mujoco.mj_kinematics(m, d)
        mujoco.mj_comPos(m, d)
        rows, errs = [], []
        for k, tp in zip(order, fixed):
            b, p = su.feet[k]
            jp, jr = P._jac(m, d, b, p)
            cq = np.zeros(4)
            mujoco.mju_mat2Quat(cq, d.xmat[b])
            eo = np.zeros(3)
            mujoco.mju_subQuat(eo, su.quat[k], cq)
            eo = d.xmat[b].reshape(3, 3) @ eo
            if su.roll_free:  # drop the roll about the forward axis
                jr, eo = jr[1:], eo[1:]
            rows += [10 * jp, 10 * jr]
            errs += [10 * (tp - P._point(d, b, p)), 10 * eo]
        jh = []
        for (b, p), t in zip(su.hands, hand_tgt):
            jp, _ = P._jac(m, d, b, p)
            jh.append(jp)
            rows.append(jp)
            errs.append(t - P._point(d, b, p))
        jc = np.zeros((3, m.nv))
        mujoco.mj_jacSubtreeCom(m, d, jc, 1)
        hp = [P._point(d, b, p) for b, p in su.hands]
        com = (su.M * d.subtree_com[1] + mass / 2 * (hp[0] + hp[1])) / (su.M + mass)
        jcom = (su.M * jc + mass / 2 * (jh[0] + jh[1])) / (su.M + mass)
        rows.append(5 * jcom[:2])
        errs.append(5 * (com_xy - com[:2]))
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
    for w in (0.03, 0.003, 0.0003):
        q = P._lm(q, w, iters // 3, residual, cost, clip, m)
    J, e = residual(q)
    res = float(np.linalg.norm(e))
    return q.copy(), res


def com_z(su, q, mass):
    m = su.robot.model
    d = mujoco.MjData(m)
    d.qpos[:] = q
    mujoco.mj_kinematics(m, d)
    mujoco.mj_comPos(m, d)
    hp = [P._point(d, b, p) for b, p in su.hands]
    return float((su.M * d.subtree_com[1][2] + mass / 2 * (hp[0][2] + hp[1][2])) / (su.M + mass))


def trajectory(su, L, T, mass, hand=(0.3, 0.6), rise=0.0, clear=0.05, q_start=None):
    """IK at N_IK instants of the single-support phase. Returns (times, qs, worst IK residual, zc)."""
    zc = com_z(su, su.d0.qpos, mass) - su.S[2]
    ts = np.linspace(0, T, N_IK)
    q0 = su.d0.qpos if q_start is None else q_start
    for _ in range(2):  # second pass uses the COM height the first pass found
        xs = lipm_x(L, T, zc, ts)
        qs = [None] * N_IK
        res = np.zeros(N_IK)
        mid = N_IK // 2
        for order in (range(mid, N_IK), range(mid - 1, -1, -1)):
            prev = q0 if order[0] == mid else qs[mid]
            for k in order:
                s = ts[k] / T
                sw = [-L + 2 * L * min_jerk(s), su.ysep, rise * min_jerk(s) + clear * np.sin(np.pi * s) ** 2]
                qs[k], res[k] = ik(su, {"swing": sw, "hand": (xs[k] + hand[0], hand[1]), "com_x": xs[k]}, mass, prev)
                prev = qs[k]
        zc = float(np.mean([com_z(su, q, mass) for q in qs])) - su.S[2]
    return ts, qs, float(res.max()), zc


def smooth(su, ts, qs, n=N_EVAL):
    """Tangent-space polynomial fit of the IK poses. Returns eval times, q, qvel, qacc and the fit's worst error (rad or m)."""
    m = su.robot.model
    qref = qs[len(qs) // 2]
    dl = np.zeros((len(qs), m.nv))
    for i, q in enumerate(qs):
        mujoco.mj_differentiatePos(m, dl[i], 1.0, qref, q)
    T = ts[-1]
    u = ts / T
    co = np.polynomial.polynomial.polyfit(u, dl, DEG)           # (DEG+1, nv)
    fit = np.polynomial.polynomial.polyval(u, co).T
    err = float(np.abs(fit - dl).max())
    te = np.linspace(0, T, n)
    ue = te / T
    c1 = np.polynomial.polynomial.polyder(co)
    c2 = np.polynomial.polynomial.polyder(c1)
    dv = np.polynomial.polynomial.polyval(ue, co).T
    v = np.polynomial.polynomial.polyval(ue, c1).T / T
    a = np.polynomial.polynomial.polyval(ue, c2).T / T ** 2
    qe = np.zeros((n, m.nq))
    for i in range(n):
        qe[i] = qref
        mujoco.mj_integratePos(m, qe[i], dv[i], 1.0)
    return te, qe, v, a, err


def hand_mid(su, q):
    m = su.robot.model
    d = mujoco.MjData(m)
    d.qpos[:] = q
    mujoco.mj_kinematics(m, d)
    return np.mean([P._point(d, b, p) for b, p in su.hands], axis=0)


@dataclass
class Score:
    ok: bool
    ik_res: float
    fit_err: float
    ratio: float          # peak |tau| / limit over joints and time
    worst: str
    zmp_margin: float     # smallest distance of the centre of pressure from the sole's edge (m); < 0 is outside
    mu: float             # friction the stance foot needs: max |Fxy| / Fz
    work: float           # positive joint work over the phase (J)
    fz_min: float
    zc: float


def score(su, L, T, mass, slope_deg=0.0, rise=0.0, clear=0.05, hand=(0.3, 0.6), q_start=None):
    """Torques along one single-support phase of a step of length L (m) in T (s) carrying `mass` kg."""
    m = su.robot.model
    ts, qs, res, zc = trajectory(su, L, T, mass, hand, rise, clear, q_start)
    te, qe, v, a, ferr = smooth(su, ts, qs)
    th = np.radians(slope_deg)
    gvec = np.array([-G * np.sin(th), 0.0, -G * np.cos(th)])
    saved = m.opt.gravity.copy()
    m.opt.gravity[:] = gvec
    try:
        lim = P.torque_limits(m)
        dd = mujoco.MjData(m)
        h = T / 400
        # hand acceleration from the smoothed trajectory, by central differences in time
        acc_hand = []
        for i in range(len(te)):
            pts = []
            for dt in (-h, 0.0, h):
                q = qe[i].copy()
                mujoco.mj_integratePos(m, q, v[i] * dt + 0.5 * a[i] * dt * dt, 1.0)
                pts.append(hand_mid(su, q))
            acc_hand.append((pts[0] - 2 * pts[1] + pts[2]) / h ** 2)
        ratios, taus, fz, mus, margins = [], [], [], [], []
        b, p = su.feet[su.stance]
        x0, x1, y0, y1 = su.box
        for i in range(len(te)):
            dd.qpos[:] = qe[i]
            dd.qvel[:] = v[i]
            dd.qacc[:] = a[i]
            mujoco.mj_inverse(m, dd)
            rhs = dd.qfrc_inverse.copy()
            for bh, ph in su.hands:
                jp, _ = P._jac(m, dd, bh, ph)
                rhs -= jp.T @ (mass * (gvec - acc_hand[i]) / 2)
            Jf = np.vstack(P._jac(m, dd, b, p))
            f = np.linalg.solve(Jf[:, :6].T, rhs[:6])
            tau = rhs - Jf.T @ f
            tau[:6] = 0.0
            r = np.where(np.isfinite(lim), np.abs(tau) / lim, 0.0)
            ratios.append(r)
            taus.append(tau)
            # the ground force is perpendicular to the ground in the tilted frame's z: f[2]
            fzi = f[2]
            fz.append(fzi)
            mus.append(float(np.hypot(f[0], f[1]) / max(fzi, 1e-9)))
            if fzi > 1e-6:
                cx, cy = -f[4] / fzi, f[3] / fzi  # centre of pressure from the moment about the sole point
                margins.append(min(cx - x0, x1 - cx, cy - y0, y1 - cy))
            else:
                margins.append(-1.0)
        R = np.array(ratios)
        k = int(np.argmax(R.max(axis=0)))
        jid = int(np.flatnonzero(m.jnt_dofadr == k)[0])
        worst = mujoco.mj_id2name(m, mujoco.mjtObj.mjOBJ_JOINT, jid)
        tau_a = np.array(taus)
        pw = np.maximum(tau_a[:, 6:] * v[:, 6:], 0.0).sum(axis=1)
        work = float(np.sum((pw[1:] + pw[:-1]) / 2 * np.diff(te)))
    finally:
        m.opt.gravity[:] = saved
    zm = float(min(margins))
    ok = res < 5e-3 and float(R.max()) <= 1.0 and zm >= 0.0 and min(fz) > 0
    return Score(ok, res, ferr, float(R.max()), worst, zm, float(max(mus)), work, float(min(fz)), zc), qs
