"""Milestone 34: deflection under the press, from the joints' elastic windup.

Milestones 30-33 treated every joint as rigid apart from its backlash gap. A real joint also twists
elastically under load. Two springs sit in each joint:

* the **servo** (stiffness ``kp``, Unitree's published PD gains, ``humanoid.GAINS``). It sees only
  torque the controller does not feed forward, e.g. the mass of a magazine the model does not know.
  Its deflection is a joint-encoder reading away from the set point, so a robot that re-targets on its
  encoders can remove it.
* the **transmission** (torsional stiffness ``k_t``, gearbox and output structure). If the joint's
  encoder sits on the motor side, the windup ``tau / k_t`` is invisible to the controller. No published
  ``k_t`` exists for the G1's or H1's joints, so it is swept.

A joint loaded by an actuator torque change ``dtau`` deflects by ``-dtau / k`` (the link gives way to the
external load that the extra torque balances; the same sign convention as ``pose_range.held_bias``).

**The nose during the press.** The nailer fires when the press reaches its contact-trip force, which
milestone 30 took as anywhere in 25-50 N. Between the nose touching the sheet and the shot, the press
grows and the joints wind up further. A nose *free* to slide (the convention of milestones 29-33) would
carry that windup straight into the nail's entry point. Along the wall normal the press is force-controlled:
whatever the windup does along x, the controller closes it with a commanded motion along x, so x is left
free. In the wall plane a nose *stuck* by friction cannot translate: the sheet pushes back with a
tangential reaction ``lam`` (y, z) at the nose, the joints settle to

    dq = -K^-1 dtau + K^-1 A_t^T lam,   with  A_t dq = 0   (A_t: the nose's y and z translation rows)

so ``lam = (A_t K^-1 A_t^T)^-1 A_t K^-1 dtau``, and the in-plane windup survives only as a *rotation* of the
tool about the nose, which moves the nail's tip at the depth point (``B dq``). The nose stays stuck while
|lam| is within ``mu`` times the press. With the same ``k`` on every joint, ``lam`` does not depend on ``k``
at all, so whether the nose sticks is a property of the pose and the press, not of the gearbox. Units:
metres, radians, newtons, newton metres.
"""
import math

import numpy as np

from .backlash import tool_rows
from .tool_lean import DEPTH_CHECK, AxisError, ToolError


def free_windup(dtau, k):
    """Joint deflection (rad) of an unconstrained arm: -dtau / k (k scalar or per joint)."""
    return -np.asarray(dtau, float) / np.asarray(k, float)


def nose_rows(jp, jr, L, depth=DEPTH_CHECK):
    """(A, B): 3 x n rows of the nose point and the depth point, a tool length L along +x."""
    t = np.array([L, 0.0, 0.0])
    return tool_rows(jp, jr, t), tool_rows(jp, jr, t + np.array([depth, 0.0, 0.0]))


def stuck_windup(dtau, k, A):
    """Joint deflection with the nose stuck in the wall plane (A[1:3] dq = 0), and the tangential
    reaction lam (N, robot frame y along the wall, z up) the sheet supplies. Returns (dq, lam)."""
    kinv = 1.0 / np.broadcast_to(np.asarray(k, float), np.shape(dtau))
    d0 = -kinv * np.asarray(dtau, float)
    At = A[1:3]
    M = (At * kinv) @ At.T
    lam = np.linalg.solve(M, -At @ d0)
    return d0 + kinv * (At.T @ lam), lam


def sticks(lam, f_n, mu):
    """True if the tangential reaction lam (y, z) is within mu times the press f_n."""
    return bool(math.hypot(lam[0], lam[1]) <= mu * f_n)


def friction_limited(dtau, k, A, mu):
    """Joint deflection when the sheet can supply at most mu times the press. The reaction grows with the
    press from zero at contact, as the press does, so their ratio r = |lam| / F is fixed: the nose sticks if
    r <= mu and otherwise slides, the sheet holding back the fraction s = mu / r of the stuck reaction
    (taken along the stuck reaction's direction). The nose then moves (1 - s) of the free windup.
    Returns (dq, s). ``dtau`` is per newton of press."""
    d0 = free_windup(dtau, k)
    dq, lam = stuck_windup(dtau, k, A)
    r = math.hypot(lam[0], lam[1])
    s = 1.0 if r <= mu else mu / r
    return d0 + s * (dq - d0), s


def offsets(A, B, dq):
    """Nose (surface) and depth-point offsets along y and z: {'y': (s, d), 'z': (s, d)}."""
    a, b = A @ dq, B @ dq
    return {"y": (float(a[1]), float(b[1])), "z": (float(a[2]), float(b[2]))}


def with_scatter(err, span):
    """``err`` (``ToolError``) plus a press-driven scatter: the offsets ``span`` (from ``offsets``, the
    change over the whole press window) times a press uniform over the window, centred. Added to each
    axis as a Gaussian of the uniform's variance (span^2 / 12), fully correlated between surface and
    depth; the y-z correlation is dropped because ``ToolError`` draws the axes independently."""
    def ax(e, sp):
        vs = e.s_surf ** 2 + sp[0] ** 2 / 12.0
        vd = e.s_depth ** 2 + sp[1] ** 2 / 12.0
        c = e.rho * e.s_surf * e.s_depth + sp[0] * sp[1] / 12.0
        ss, sd = math.sqrt(vs), math.sqrt(vd)
        rho = c / (ss * sd) if ss > 0 and sd > 0 else 1.0
        return AxisError(ss, sd, max(-1.0, min(1.0, rho)), e.mu_s, e.mu_d)
    return ToolError(ax(err.y, span["y"]), ax(err.z, span["z"]), err.s_lean, err.depth)
