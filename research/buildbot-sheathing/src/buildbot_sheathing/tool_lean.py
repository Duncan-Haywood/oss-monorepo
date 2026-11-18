"""Milestone 29: the nailer's length and the nail's lean.

Every clean-sheet figure up to milestone 28 drew the tool error as ``buildbot-fasten``'s 0.9 mm: the
G1's 11-bit joint quantisation carried to the *hand point*, one Gaussian per nail, with the nail a
point on the sheathing surface. Two things were left out:

* **the nailer's length.** The nose that sets where the nail enters sits a length ``L`` ahead of the
  grip, so the hand's rotation error moves it: delta p_nose = delta p_hand + omega x (L n), with n the
  unit vector from the hand into the wall (+x here, as in ``buildbot-fasten``);
* **the nail's lean.** The nail must stay inside the stud (or plate) for ``P_REQ`` = 10 shank
  diameters past the sheathing (milestone 2's ``Band``), so the bound set by the framing member is
  checked at a depth ``DEPTH_CHECK`` = 7/16 in + 10 D = 44.4 mm below the surface, where a nail
  leaning by alpha sits ``DEPTH_CHECK * tan(alpha)`` off its entry point. The panel-edge bound stays
  at the surface.

A joint error dq therefore gives, per nail and per axis (y along the wall, z up), a *surface* offset
a . dq and a *depth* offset b . dq, with

    a_y = J_y + L Jw_z,     b_y = J_y + (L + D) Jw_z
    a_z = J_z - L Jw_y,     b_z = J_z - (L + D) Jw_y

(J the hand point's translation rows, Jw its rotation rows, both with the feet planted). For
independent joint errors of sigma_q the pair is bivariate normal with sigma_s = sigma_q |a|,
sigma_d = sigma_q |b| and correlation a . b / (|a| |b|). An independent lean (the tool's own aim, a
nail deflecting in the wood) adds ``D tan(N(0, s_lean))`` to the depth offset only.

``ToolError`` draws these pairs; ``tack.simulate(tool=...)`` uses them (the panel-edge bound sees
the surface draw, the stud or plate bounds the depth draw). Units: metres and radians.
"""
import math
from dataclasses import dataclass

import numpy as np

from .asbuilt import D_NAIL, SHEATHING

P_REQ = 10 * D_NAIL                  # penetration the band requires inside the member (milestone 2)
DEPTH_CHECK = SHEATHING + P_REQ      # 44.4 mm: where the member's bound is checked


def quant_sigma(bits):
    """Joint-angle error (rad, 1 sigma) of a sensor of ``bits`` bits: step / sqrt(12)."""
    return 2 * math.pi / 2 ** bits / math.sqrt(12)


@dataclass
class AxisError:
    s_surf: float          # surface offset sigma (m)
    s_depth: float         # depth offset sigma (m), joint errors only
    rho: float             # their correlation
    mu_s: float = 0.0      # fixed surface offset (m): a bias calibration left (milestone 31)
    mu_d: float = 0.0      # fixed depth offset (m)


@dataclass
class ToolError:
    y: AxisError
    z: AxisError
    s_lean: float = 0.0    # independent nail lean (rad, 1 sigma, each axis)
    depth: float = DEPTH_CHECK

    def draw(self, rng, shape, axis="y"):
        """(surface, depth) offsets (m), arrays of ``shape``."""
        e = self.y if axis == "y" else self.z
        z1 = rng.normal(0.0, 1.0, shape)
        z2 = rng.normal(0.0, 1.0, shape)
        s = e.s_surf * z1 + e.mu_s
        d = e.s_depth * (e.rho * z1 + math.sqrt(max(0.0, 1 - e.rho ** 2)) * z2) + e.mu_d
        if self.s_lean > 0:
            d = d + self.depth * np.tan(rng.normal(0.0, self.s_lean, shape))
        return s, d

    def with_lean(self, s_lean):
        return ToolError(self.y, self.z, s_lean, self.depth)


def point_model(s_robot, s_lean=0.0):
    """The old model (one Gaussian at the surface, the same offset at depth) plus a lean."""
    e = AxisError(s_robot, s_robot, 1.0)
    return ToolError(e, e, s_lean)


def from_jacobian(jp, jr, sigma_q, L, depth=DEPTH_CHECK, s_lean=0.0):
    """ToolError from the hand's translation (3 x n) and rotation (3 x n) Jacobians over the
    actuated joints (feet planted), a tool length ``L`` (m) and joint error ``sigma_q`` (rad)."""
    def axis(t, w, sign):
        a = t + sign * L * w
        b = t + sign * (L + depth) * w
        na, nb = float(np.linalg.norm(a)), float(np.linalg.norm(b))
        rho = float(a @ b / (na * nb)) if na > 0 and nb > 0 else 1.0
        return AxisError(sigma_q * na, sigma_q * nb, rho)
    return ToolError(axis(jp[1], jr[2], +1), axis(jp[2], jr[1], -1), s_lean, depth)


def hand_jacobians(robot, d0, hand_xz, tool_kg, grip="palm"):
    """Translation and rotation Jacobians (3 x n_act each) of the right hand point, feet planted
    (``buildbot_fasten.model.tip_jacobian`` with the rotation rows kept). None if no pose."""
    import mujoco
    from buildbot_payload import model as P
    m = robot.model
    p = P.pose(robot, d0, hand_xz, tool_kg, grip)
    if not p.ok:
        return None
    d = mujoco.MjData(m)
    d.qpos[:] = p.qpos
    mujoco.mj_forward(m, d)
    Jc = np.vstack([np.vstack(P._jac(m, d, P._bid(m, b), pt)) for b, pt in robot.feet])
    bh, ph = robot.hands[grip][1]
    jp, jr = P._jac(m, d, P._bid(m, bh), ph)
    act = np.arange(6, m.nv)
    dbase = -np.linalg.pinv(Jc[:, :6]) @ Jc[:, act]
    return jp[:, act] + jp[:, :6] @ dbase, jr[:, act] + jr[:, :6] @ dbase


def p_window(lo_s, hi_d, err, n=400000, seed=0):
    """One nail, aimed at 0: P(surface >= lo_s and depth <= hi_d), Monte Carlo (checks the draw)."""
    rng = np.random.default_rng(seed)
    s, d = err.draw(rng, n)
    return float(np.mean((s >= lo_s) & (d <= hi_d)))


def p_window_exact(lo_s, hi_d, e):
    """The same probability from the bivariate normal (no independent lean)."""
    from scipy.stats import multivariate_normal
    cov = [[e.s_surf ** 2, -e.rho * e.s_surf * e.s_depth], [-e.rho * e.s_surf * e.s_depth, e.s_depth ** 2]]
    # P(s >= lo, d <= hi) = P(-s <= -lo, d <= hi)
    return float(multivariate_normal(mean=[0, 0], cov=cov, allow_singular=True).cdf([-lo_s, hi_d]))
