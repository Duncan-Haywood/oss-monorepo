"""Nailing sheathing with a stock humanoid: how hard can it push, and how exactly must it place?

Two questions on top of `buildbot_payload`'s whole-body static model:

* `push_limit`: the largest horizontal force the standing robot can press a hand-held tool into
  a wall with, for a tool at (reach x, height z). The robot leans so that the ground reaction
  line passes through the middle of the feet, every joint stays inside its torque limit, and
  the feet do not slip for a friction coefficient mu.
* `tip_sigma`: the standard deviation of the tool tip in the wall plane (lateral y, vertical z)
  that independent Gaussian joint-angle errors produce, through the Jacobian of the tip with
  the feet planted.

`schedule` writes the nails of one 4x8 sheet (6 in on the edges, 12 in in the field) with the
window each must land in; `sheet_success` turns tip standard deviations into the chance a
whole sheet is nailed inside its windows.
"""
from dataclasses import dataclass
from math import erf, sqrt

import mujoco
import numpy as np

from buildbot_payload import model as P

G = P.G
IN = 0.0254
STUD_FACE = 1.5 * IN                 # dressed 2x width (m)
NAIL_D = 0.131 * IN                  # 8d common nail shank diameter (m)
EDGE_MIN = 0.375 * IN                # nail at least this far in from a panel edge (m)
SHEET = (48 * IN, 96 * IN)           # 4 x 8 ft: width (y), height (z)
SPACING = 16 * IN                    # stud spacing on centre


def _bid(model, name):
    return mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY, name)


def ground_wrench(robot, qpos, ext, grip="palm"):
    """Joint torques and ground wrench holding the robot still with a force `ext` (N, 3-vector)
    split equally between its two hand points, on top of gravity. Returns (Static-like tuple)."""
    m = robot.model
    d = mujoco.MjData(m)
    d.qpos[:] = qpos
    mujoco.mj_forward(m, d)
    bias = d.qfrc_bias.copy()
    load = np.zeros(m.nv)
    for b, p in robot.hands[grip]:
        jp, _ = P._jac(m, d, P._bid(m, b), p)
        load += jp.T @ (np.asarray(ext, float) / 2)
    Jc = np.vstack([np.vstack(P._jac(m, d, P._bid(m, b), p)) for b, p in robot.feet])
    f, *_ = np.linalg.lstsq(Jc[:, :6].T, bias[:6] - load[:6], rcond=None)
    tau = bias - load - Jc.T @ f
    tau[:6] = 0.0
    lim = P.torque_limits(m)
    ratio = np.where(np.isfinite(lim), np.abs(tau) / lim, 0.0)
    return tau, ratio, f


def check_push(robot, d0, hand_xz, tool_kg, force, mu, grip="palm", q_init=None):
    """(feasible, qpos, ratio) for pressing `force` N horizontally into a wall with the tool."""
    m = robot.model
    weight = (float(m.body_subtreemass[1]) + tool_kg) * G
    z = hand_xz[1]
    # moment balance about the middle of the feet: the CoM leans forward by F z / W
    dx = force * z / weight
    p = P.pose(robot, d0, hand_xz, tool_kg, grip, q_init, com_dx=dx)
    ext = np.array([-force, 0.0, -tool_kg * G])
    tau, ratio, f = ground_wrench(robot, p.qpos, ext, grip)
    fz = f[2] + f[8]
    fx = f[0] + f[6]
    slip_ok = fz > 0 and abs(fx) <= mu * fz
    ok = p.ok and float(ratio.max()) <= 1.0 and min(f[2], f[8]) > 0 and slip_ok
    k = int(np.argmax(ratio))
    jid = int(np.flatnonzero(m.jnt_dofadr == k)[0])
    why = "reach" if not p.ok else ("slip" if not slip_ok else mujoco.mj_id2name(m, mujoco.mjtObj.mjOBJ_JOINT, jid))
    return ok, p.qpos, why


def push_limit(robot, d0, hand_xz, tool_kg, mu, grip="palm", hi=400.0, tol=1.0):
    """Largest horizontal push (N, both hands together) at hand_xz; (None, why) if even 0 N fails."""
    ok, q, why = check_push(robot, d0, hand_xz, tool_kg, 0.0, mu, grip)
    if not ok:
        return None, why
    lo = 0.0
    while hi - lo > tol:
        mid = (lo + hi) / 2
        ok, q2, w2 = check_push(robot, d0, hand_xz, tool_kg, mid, mu, grip, q)
        if ok:
            lo, q = mid, q2
        else:
            hi, why = mid, w2
    return lo, why


def tip_jacobian(robot, d0, hand_xz, tool_kg, grip="palm"):
    """d(tip y, z) / d(joint angle) for the actuated joints, feet planted, and the pose used.

    The tip is the right hand point. A joint-angle error moves the floating base so that both
    feet stay where they are in the least-squares sense (a pseudo-inverse of the foot Jacobian).
    """
    m = robot.model
    p = P.pose(robot, d0, hand_xz, tool_kg, grip)
    if not p.ok:
        return None, p
    d = mujoco.MjData(m)
    d.qpos[:] = p.qpos
    mujoco.mj_forward(m, d)
    Jc = np.vstack([np.vstack(P._jac(m, d, P._bid(m, b), pt)) for b, pt in robot.feet])  # 12 x nv
    bh, ph = robot.hands[grip][1]
    jp, _ = P._jac(m, d, P._bid(m, bh), ph)
    act = np.arange(6, m.nv)
    dbase = -np.linalg.pinv(Jc[:, :6]) @ Jc[:, act]               # base motion per joint motion
    tip = jp[:, act] + jp[:, :6] @ dbase                          # 3 x n_act
    return tip, p


def tip_sigma(tip, sigma_q):
    """(sigma_y, sigma_z) in metres for independent joint errors of `sigma_q` radians."""
    return float(sigma_q * np.linalg.norm(tip[1])), float(sigma_q * np.linalg.norm(tip[2]))


# ---- the nailing schedule ---------------------------------------------------------------

@dataclass
class Nail:
    y: float          # across the sheet (m)
    z: float          # up the sheet (m)
    cls: str          # window class
    axis: str         # coordinate the window limits: "y" (stud under it) or "z" (plate under it)
    half: float       # half-width of the window (m)


def band(face, kind):
    """(centre, half-width) in metres of the band a nail centre may land in, measured from the
    sheet edge into the sheet, over a member `face` wide. The nail's own radius stays on the
    member and, at a panel edge, EDGE_MIN stays clear of it.

    kind "centre": the sheet edge runs down the member's centre line (a joint shared with the
    next sheet), so only the half-face under this sheet is available.
    kind "flush": the edge is flush with the member's near side, so the whole face is.
    kind "open": no edge (field nail); measured from the member's near side.
    """
    r = NAIL_D / 2
    lo = EDGE_MIN if kind != "open" else r
    hi = (face / 2 if kind == "centre" else face) - r
    return (lo + hi) / 2, (hi - lo) / 2


def schedule():
    """Nails of one 4x8 sheet standing on end: 6 in on the edges, 12 in in the field.

    Vertical edges sit on the centre of a stud (a joint shared with the next sheet). The bottom
    edge is flush with a single 2x plate, the top edge with a double plate (3 in face). Field
    nails sit on the two intermediate studs at 16 in and 32 in and can land anywhere on the
    stud face. Each nail is placed at the centre of its window.
    """
    w, h = SHEET
    nails = []
    c, hw = band(STUD_FACE, "centre")
    for k in range(0, 17):                                   # left and right joints, every 6 in
        for y in (c, w - c):
            nails.append(Nail(y, k * 6 * IN, "joint", "y", hw))
    cb, hb = band(STUD_FACE, "flush")
    ct, ht = band(2 * STUD_FACE, "flush")
    for k in range(1, 8):                                    # bottom and top edges
        nails.append(Nail(k * 6 * IN, cb, "bottom plate", "z", hb))
        nails.append(Nail(k * 6 * IN, h - ct, "top plate", "z", ht))
    cf, hf = band(STUD_FACE, "open")
    for ys in (SPACING, 2 * SPACING):                        # field: studs centred at 16 and 32 in
        for k in range(1, 8):
            nails.append(Nail(ys + cf - STUD_FACE / 2, k * 12 * IN, "field", "y", hf))
    return nails


def nail_success(half, sigma):
    """P(|error| <= half) for a zero-mean Gaussian error."""
    if sigma <= 0:
        return 1.0
    return erf(half / (sigma * sqrt(2)))


def sheet_success(nails, sigma_y, sigma_z):
    """Chance every nail of a sheet lands inside its window, errors independent per nail."""
    p = 1.0
    for n in nails:
        p *= nail_success(n.half, sigma_y if n.axis == "y" else sigma_z)
    return p


def required_sigma(nails, target=0.95, axis_ratio=1.0):
    """Largest tip standard deviation (m) with a whole-sheet success >= target, when
    sigma_z = axis_ratio * sigma_y. Bisection."""
    lo, hi = 1e-6, 0.1
    for _ in range(60):
        mid = (lo + hi) / 2
        if sheet_success(nails, mid, axis_ratio * mid) >= target:
            lo = mid
        else:
            hi = mid
    return lo
