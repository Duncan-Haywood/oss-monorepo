"""Milestone 30: gear backlash at the nailer's nose, and which joints gravity and the press preload.

Milestone 29 carried each joint's 11-bit quantisation (one sigma, the same for every joint) to a nose a
length L ahead of the hand on its push axis. Two things generalise it here:

* **a general tool offset.** A real nailer's handle sits off its drive axis, so the nose is at
  ``t = L n + r`` from the grip (n the unit vector into the wall, +x; r perpendicular to it). A joint
  error dq moves the nose by ``(Jp - [t]x Jw) dq`` and the shank's depth point (``t + D n``) by the
  same with ``t + D n``. At r = 0 the rows are milestone 29's ``a`` and ``b``.
* **a per-joint sigma.** Quantisation adds ``step^2 / 12`` to every joint's variance. Backlash of a
  total gap ``b`` adds a random error only on a joint that is *loose*: one whose static torque is not
  held against one side of the gap at every nail. A loose joint sits anywhere in the gap
  (uniform, variance ``b^2 / 12``); a held joint sits at the same side each time, a fixed bias that a
  tool-point calibration removes (no random part).

A joint counts as held when its static torque keeps one sign, with magnitude at least ``tau_f``, over
the whole range of press forces ``[F_lo, F_hi]`` it sees at the moment of firing. The static torques
come from MuJoCo (feet planted, ground reaction re-solved by least squares, as in
``buildbot_payload.model.torques``): gravity on the links, the nailer's weight split between the hands,
and the wall's reaction ``-F n`` at the nose carried to the right hand as a force and a moment.

Units: metres, radians, newtons.
"""
import math

import numpy as np

from .tool_lean import DEPTH_CHECK, AxisError, ToolError

ARCMIN = math.pi / (180 * 60)
G = 9.81


def skew(t):
    return np.array([[0.0, -t[2], t[1]], [t[2], 0.0, -t[0]], [-t[1], t[0], 0.0]])


def tool_rows(jp, jr, t):
    """Rows (3 x n) mapping joint errors to the displacement of the point at offset ``t`` from the hand."""
    return jp - skew(np.asarray(t, float)) @ jr


def from_rows(jp, jr, sigmas, L, r=(0.0, 0.0), depth=DEPTH_CHECK, s_lean=0.0):
    """ToolError with per-joint sigmas (array, rad) and a tool offset L along +x plus r = (r_y, r_z)."""
    sig = np.broadcast_to(np.asarray(sigmas, float), (jp.shape[1],))
    t = np.array([L, r[0], r[1]])
    A = tool_rows(jp, jr, t)
    B = tool_rows(jp, jr, t + np.array([depth, 0.0, 0.0]))

    def axis(k):
        a, b = A[k] * sig, B[k] * sig
        na, nb = float(np.linalg.norm(a)), float(np.linalg.norm(b))
        rho = float(a @ b / (na * nb)) if na > 0 and nb > 0 else 1.0
        return AxisError(na, nb, rho)
    return ToolError(axis(1), axis(2), s_lean, depth)


def joint_sigmas(quant, gap, loose):
    """Per-joint sigma: quantisation (scalar) and a uniform gap of total width ``gap`` on loose joints."""
    loose = np.asarray(loose, bool)
    return np.sqrt(quant ** 2 + np.where(loose, gap ** 2 / 12.0, 0.0))


def held(tau_lo, tau_hi, tau_f):
    """Joints whose torque keeps one sign with |tau| >= tau_f at both ends of the press range.
    The torque is linear in the press force, so checking the two ends covers the range."""
    tau_lo, tau_hi = np.asarray(tau_lo), np.asarray(tau_hi)
    return (np.sign(tau_lo) == np.sign(tau_hi)) & (np.abs(tau_lo) >= tau_f) & (np.abs(tau_hi) >= tau_f)


def static_torques(robot, qpos, tool_kg, press, t, grip="palm"):
    """Actuated-joint static torques (N m) at ``qpos``: gravity, the tool's weight split between the
    hands, and the wall's reaction ``-press`` (N, along x) at the nose (offset ``t`` from the right hand)."""
    import mujoco
    from buildbot_payload import model as P
    m = robot.model
    d = mujoco.MjData(m)
    d.qpos[:] = qpos
    mujoco.mj_forward(m, d)
    bias = d.qfrc_bias.copy()
    load = np.zeros(m.nv)
    hands = robot.hands[grip]
    for b, p in hands:
        jp, _ = P._jac(m, d, P._bid(m, b), p)
        load += jp.T @ np.array([0, 0, -tool_kg * G / 2])
    bh, ph = hands[1]
    jp, jr = P._jac(m, d, P._bid(m, bh), ph)
    f = np.array([-press, 0.0, 0.0])
    load += jp.T @ f + jr.T @ np.cross(np.asarray(t, float), f)
    Jc = np.vstack([np.vstack(P._jac(m, d, P._bid(m, b), pt)) for b, pt in robot.feet])
    fc, *_ = np.linalg.lstsq(Jc[:, :6].T, bias[:6] - load[:6], rcond=None)
    tau = bias - load - Jc.T @ fc
    return tau[6:]


def joint_names(robot):
    import mujoco
    m = robot.model
    out = []
    for k in range(6, m.nv):
        jid = int(np.flatnonzero(m.jnt_dofadr == k)[0])
        out.append(mujoco.mj_id2name(m, mujoco.mjtObj.mjOBJ_JOINT, jid))
    return out


def p_window_uniform(lo_s, hi_d, jp, jr, quant, gap, loose, L, r=(0.0, 0.0), n=200000, seed=0):
    """One nail along y: P(surface >= lo_s and depth <= hi_d) with Gaussian quantisation and *uniform*
    backlash per joint, Monte Carlo (checks the Gaussian ToolError built by ``from_rows``)."""
    rng = np.random.default_rng(seed)
    nj = jp.shape[1]
    t = np.array([L, r[0], r[1]])
    a = tool_rows(jp, jr, t)[1]
    b = tool_rows(jp, jr, t + np.array([DEPTH_CHECK, 0.0, 0.0]))[1]
    dq = rng.normal(0.0, quant, (n, nj))
    dq += np.where(np.asarray(loose, bool), rng.uniform(-gap / 2, gap / 2, (n, nj)), 0.0)
    s, d = dq @ a, dq @ b
    return float(np.mean((s >= lo_s) & (d <= hi_d)))
