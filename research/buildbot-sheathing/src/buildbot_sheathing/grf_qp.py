"""Milestone 32: the ground reaction a balance controller would choose, and what it does to backlash.

Milestones 30 and 31 split the static load between the feet by least squares over a free 6-D wrench
at one point per foot. A real sole pushes only through its contact patch. Here each foot pushes
through the contact points of the Menagerie model's own collision geoms (the G1's four 5 mm sole
spheres, both ends of each of the H1's three sole capsules), each with a 3-D force ``f_i`` that is
unilateral and inside a friction pyramid:

    f_iz >= 0,   |f_ix| <= mu f_iz,   |f_iy| <= mu f_iz      (floor normal +z)

so the centre of pressure stays inside the sole's convex hull. The floating base must balance:

    Jc[:, :6]^T f = h[:6],        h = qfrc_bias - (tool weight and press, as generalised forces)

and the actuated torques are ``tau = h[6:] - Jc[:, 6:]^T f``, affine in ``f``. A joint whose subtree
holds no foot (the waist, the arms) gets a torque no choice of ``f`` changes.

Three controllers pick ``f``:

* ``force``: min ||f||^2 (the usual whole-body-control regulariser);
* ``torque``: min ||tau_legs||^2 + 1e-6 ||f||^2;
* ``hold``: ``torque`` plus ``s_j tau_j >= tau_f`` on chosen leg joints (``s_j`` = +1 or -1), which
  keeps each of them on one side of its gear backlash.

A feasibility LP (HiGHS) finds the largest common margin ``m`` with ``s_j tau_j >= m``; the QPs are
solved with SLSQP from a feasible start and their constraint residuals are checked. Units: metres,
newtons, newton metres.
"""
import numpy as np

G = 9.81
REG = 1e-6
SLACK = 1e-6


def contact_points(m, d, robot):
    """World positions of the sole contact points, with their body ids: a list of (bid, xyz)."""
    import mujoco
    pts = []
    for b, _ in robot.feet:
        bid = mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_BODY, b)
        for g in range(m.ngeom):
            if m.geom_bodyid[g] != bid or m.geom_contype[g] == 0:
                continue
            c, R, size = d.geom_xpos[g].copy(), d.geom_xmat[g].reshape(3, 3), m.geom_size[g]
            down = np.array([0.0, 0.0, -size[0]])
            if m.geom_type[g] == mujoco.mjtGeom.mjGEOM_SPHERE:
                pts.append((bid, c + down))
            elif m.geom_type[g] == mujoco.mjtGeom.mjGEOM_CAPSULE:
                for sgn in (-1.0, 1.0):
                    pts.append((bid, c + sgn * size[1] * R[:, 2] + down))
            else:
                raise ValueError(f"sole geom type {m.geom_type[g]} not handled")
    return pts


def contact_jacobian(m, d, pts):
    """(3k x nv) stacked translational Jacobians of the contact points."""
    import mujoco
    rows = []
    for bid, p in pts:
        jp = np.zeros((3, m.nv))
        mujoco.mj_jac(m, d, jp, None, p, bid)
        rows.append(jp)
    return np.vstack(rows)


def generalised_load(robot, qpos, tool_kg, press, t, grip="palm"):
    """``h`` (nv): qfrc_bias minus the tool's weight (split between the hands) and the wall's
    reaction ``-press`` along x at the nose (offset ``t`` from the right hand), as in
    ``backlash.static_torques``. Also returns the MjData at ``qpos``."""
    import mujoco
    from buildbot_payload import model as P
    m = robot.model
    d = mujoco.MjData(m)
    d.qpos[:] = qpos
    mujoco.mj_forward(m, d)
    load = np.zeros(m.nv)
    hands = robot.hands[grip]
    for b, p in hands:
        jp, _ = P._jac(m, d, P._bid(m, b), p)
        load += jp.T @ np.array([0, 0, -tool_kg * G / 2])
    bh, ph = hands[1]
    jp, jr = P._jac(m, d, P._bid(m, bh), ph)
    f = np.array([-press, 0.0, 0.0])
    load += jp.T @ f + jr.T @ np.cross(np.asarray(t, float), f)
    return d.qfrc_bias.copy() - load, d


class Contact:
    """The affine map from contact forces to actuated torques at one pose and press."""

    def __init__(self, h, Jc, mu):
        self.h, self.Jc, self.mu = h, Jc, mu
        self.k = Jc.shape[0] // 3
        self.Aeq = Jc[:, :6].T                     # 6 x 3k
        self.beq = h[:6]
        self.T = -Jc[:, 6:].T                       # tau = tau0 + T f
        self.tau0 = h[6:]
        rows = []
        for i in range(self.k):
            for ax in (0, 1):
                for sgn in (1.0, -1.0):
                    r = np.zeros(3 * self.k)
                    r[3 * i + ax], r[3 * i + 2] = sgn, -mu
                    rows.append(r)               # sgn f_ax - mu f_z <= 0
            r = np.zeros(3 * self.k)
            r[3 * i + 2] = -1.0
            rows.append(r)                       # -f_z <= 0
        self.Ain = np.array(rows)

    def tau(self, f):
        return self.tau0 + self.T @ f

    def residuals(self, f):
        """(max |base imbalance| in N or N m, max cone violation in N)."""
        return float(np.max(np.abs(self.Aeq @ f - self.beq))), float(max(0.0, np.max(self.Ain @ f)))


def margin_lp(c, legs, signs, cap=1e3):
    """Largest m with signs_j tau_j >= m on joints ``legs`` (indices into tau), the base balanced and
    the forces in the cones. Returns (m, f) or (None, None) if the cones cannot balance the base."""
    from scipy.optimize import linprog
    n = 3 * c.k
    legs, signs = np.asarray(legs, int), np.asarray(signs, float)
    # variables x = (f, m); maximise m: minimise -m
    cost = np.zeros(n + 1)
    cost[-1] = -1.0
    A1 = np.hstack([c.Ain, np.zeros((c.Ain.shape[0], 1))])
    b1 = np.zeros(c.Ain.shape[0])
    if len(legs):
        # m - s_j (tau0_j + T_j f) <= 0
        A2 = np.hstack([-(signs[:, None] * c.T[legs]), np.ones((len(legs), 1))])
        b2 = signs * c.tau0[legs]
        A, b = np.vstack([A1, A2]), np.concatenate([b1, b2])
    else:
        A, b = A1, b1
    Aeq = np.hstack([c.Aeq, np.zeros((6, 1))])
    bounds = [(None, None)] * n + [(-cap, cap)]
    r = linprog(cost, A_ub=A, b_ub=b, A_eq=Aeq, b_eq=c.beq, bounds=bounds, method="highs")
    if r.status != 0:
        return None, None
    return float(r.x[-1]), r.x[:n]


def solve(c, kind, legs, signs=None, tau_f=0.2, hold_idx=None):
    """Contact forces for controller ``kind`` ('force', 'torque' or 'hold'); returns (f, info) with
    f None when infeasible. ``legs`` are the indices (into tau) of the leg joints, whose squared torque
    'torque' and 'hold' minimise; 'hold' keeps ``hold_idx`` (default: all of ``legs``) on the sides
    ``signs``."""
    from scipy.optimize import minimize
    n = 3 * c.k
    legs = np.asarray(legs, int)
    hidx = legs if hold_idx is None else np.asarray(hold_idx, int)
    m0, f0 = margin_lp(c, hidx if kind == "hold" else [], signs if kind == "hold" else [])
    if f0 is None:
        return None, {"feasible": False, "margin": None}
    if kind == "hold" and m0 < tau_f + SLACK:
        return None, {"feasible": False, "margin": m0}
    if kind == "force":
        H, g = np.eye(n), np.zeros(n)
    else:
        TL = c.T[legs]
        H = TL.T @ TL + REG * np.eye(n)
        g = TL.T @ c.tau0[legs]
    cons = [{"type": "eq", "fun": lambda f: c.Aeq @ f - c.beq, "jac": lambda f: c.Aeq},
            {"type": "ineq", "fun": lambda f: -(c.Ain @ f), "jac": lambda f: -c.Ain}]
    if kind == "hold":
        s = np.asarray(signs, float)
        tgt = tau_f + SLACK                      # so the held test (>= tau_f) is not lost to rounding
        cons.append({"type": "ineq", "fun": lambda f: s * c.tau(f)[hidx] - tgt,
                     "jac": lambda f: s[:, None] * c.T[hidx]})
    r = minimize(lambda f: 0.5 * f @ H @ f + g @ f, f0, jac=lambda f: H @ f + g, constraints=cons,
                 method="SLSQP", options={"maxiter": 500, "ftol": 1e-12})
    f = r.x
    eq, cone = c.residuals(f)
    hold_v = 0.0
    if kind == "hold":
        hold_v = float(max(0.0, np.max(tau_f - np.asarray(signs) * c.tau(f)[hidx])))
    ok = eq < 1e-6 and cone < 1e-6 and hold_v < 1e-6
    if not ok:                                   # fall back to the LP's feasible point
        f = f0
        eq, cone = c.residuals(f)
    return f, {"feasible": True, "margin": m0, "qp_ok": bool(ok), "eq": eq, "cone": cone,
               "status": int(r.status)}


def cop(c, pts):
    """Centre of pressure (x, y) of the ground reaction that balances the base. With every contact point
    at the same height the net wrench fixes it, whatever the split, so any balancing ``f`` gives it."""
    f, *_ = np.linalg.lstsq(c.Aeq, c.beq, rcond=None)
    fz = f[2::3]
    P = np.array([p for _, p in pts])
    return float(P[:, 0] @ fz / fz.sum()), float(P[:, 1] @ fz / fz.sum())


def sole_centre_x(pts):
    P = np.array([p for _, p in pts])
    return float((P[:, 0].min() + P[:, 0].max()) / 2)


def press_window(robot, qpos, tool_kg, t, mu, start, top=300.0, iters=30):
    """(lowest, highest) press (N) the cones can balance at ``qpos``, bisected outwards from ``start``
    (which must balance; else None). A pose leaned into the wall falls forward below the window and
    tips back above it."""
    def ok(F):
        h, d = generalised_load(robot, qpos, tool_kg, F, t)
        c = Contact(h, contact_jacobian(robot.model, d, contact_points(robot.model, d, robot)), mu)
        return margin_lp(c, [], [])[1] is not None
    if not ok(start):
        return None

    def edge(a, b):                              # ok(a) true; find the boundary towards b
        if ok(b):
            return b
        for _ in range(iters):
            mid = (a + b) / 2
            a, b = (mid, b) if ok(mid) else (a, mid)
        return a
    return edge(start, 0.0), edge(start, top)


def leaned_pose(robot, data0, hand_xz, tool_kg, press, t, dy=0.0, iters=6):
    """IK pose whose centre of pressure under ``press`` sits at the middle of the sole along x (the robot
    leans into the wall, ``com_dx`` > 0), found by secant steps on ``com_dx``. Returns (pose, com_dx, cop_x)."""
    from buildbot_payload import model as P

    def err(dx):
        p = P.pose(robot, data0, hand_xz, tool_kg, "palm", com_dx=dx, dy=dy)
        h, d = generalised_load(robot, p.qpos, tool_kg, press, t)
        pts = contact_points(robot.model, d, robot)
        c = Contact(h, contact_jacobian(robot.model, d, pts), 0.5)
        x = cop(c, pts)[0]
        return x - sole_centre_x(pts), p, x
    x0, x1 = 0.0, 0.05
    e0, p, cx = err(x0)
    e1, p, cx = err(x1)
    for _ in range(iters):
        if abs(e1) < 5e-4 or e1 == e0:
            break
        x0, x1, e0 = x1, x1 - e1 * (x1 - x0) / (e1 - e0), e1
        e1, p, cx = err(x1)
    return p, x1, cx
