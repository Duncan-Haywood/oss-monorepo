"""Milestone 37: a held-joint preload against the wrist sensor's floor (milestone 36).

Milestone 36 found that a compensator reading a wrist F/T sensor still mispredicts a joint whose torque
sits within a few hundredths of a newton metre of the holding threshold ``tau_f``: any sensor error moves
it across, and half a gap is subtracted (or left) that should not be. Two remedies:

* **preload** (``margin_rows``, ``solve_margin``): a balance controller has a choice of ground reaction
  (milestone 32), so it can command every leg joint's torque at each press end at least ``m`` from
  ``tau_f``, on the side the joint is already on: up to ``tau_f + m`` if ``|tau| >= tau_f``, else down
  to ``|tau| <= tau_f - m``. The waist and arm torques do not depend on the ground reaction, so a
  preload cannot move them.
* **hedge** (``hedged_bias``): the compensator subtracts a quarter gap, not half, on a joint whose planned
  ``|tau|`` is within ``g`` of ``tau_f`` at either end (and one-signed over the press range), so a flip
  in either direction costs a quarter gap instead of half.

The robot's torques under the true load follow from ``settle``: the controller plans its contact forces
``f_plan`` from the measured load; under the true load the base is out of balance by
``beq - Aeq f_plan``, and the contact forces change by the smallest amount that restores it
(``pinv(Aeq)``). That is a stand-in for the joint-level feedback, not a measurement.
Units: newtons, newton metres, radians.
"""
import numpy as np

from .backlash import held
from .pose_range import held_bias

SLACK = 1e-6


def margin_rows(tau_nom, idx, tau_f):
    """Constraint rows for a preload, from the nominal torques ``tau_nom`` on joints ``idx``.

    Returns (rows, kappa, d): the constraint ``kappa_r * tau[rows_r] + d_r >= m`` for each r. A joint at
    or above tau_f gives one row (sign(tau) tau - tau_f >= m); one below gives two
    (tau_f - tau >= m and tau_f + tau >= m)."""
    rows, kap, d = [], [], []
    for j in idx:
        t = float(tau_nom[j])
        if abs(t) >= tau_f:
            rows.append(j); kap.append(np.sign(t)); d.append(-tau_f)
        else:
            rows += [j, j]; kap += [-1.0, 1.0]; d += [tau_f, tau_f]
    return np.asarray(rows, int), np.asarray(kap, float), np.asarray(d, float)


def margin_lp(c, rows, kap, d, cap=1e3):
    """Largest common t with kappa tau[rows] + d >= t, base balanced, forces in the cones: (t, f)."""
    from scipy.optimize import linprog
    n = 3 * c.k
    cost = np.zeros(n + 1)
    cost[-1] = -1.0
    A1 = np.hstack([c.Ain, np.zeros((c.Ain.shape[0], 1))])
    # t - kappa (tau0 + T f) - d <= 0
    A2 = np.hstack([-(kap[:, None] * c.T[rows]), np.ones((len(rows), 1))])
    b2 = kap * c.tau0[rows] + d
    A, b = np.vstack([A1, A2]), np.concatenate([np.zeros(A1.shape[0]), b2])
    Aeq = np.hstack([c.Aeq, np.zeros((6, 1))])
    r = linprog(cost, A_ub=A, b_ub=b, A_eq=Aeq, b_eq=c.beq, bounds=[(None, None)] * n + [(-cap, cap)],
                method="highs")
    if r.status != 0:
        return None, None
    return float(r.x[-1]), r.x[:n]


def solve_margin(c, legs, rows, kap, d, m, reg=1e-6):
    """min ||tau_legs||^2 + reg ||f||^2 with every margin row at least ``m``; returns f or None."""
    from scipy.optimize import minimize
    t, f0 = margin_lp(c, rows, kap, d)
    if t is None or t < m + SLACK:
        return None
    n = 3 * c.k
    legs = np.asarray(legs, int)
    TL = c.T[legs]
    H = TL.T @ TL + reg * np.eye(n)
    g = TL.T @ c.tau0[legs]
    tgt = m + SLACK
    cons = [{"type": "eq", "fun": lambda f: c.Aeq @ f - c.beq, "jac": lambda f: c.Aeq},
            {"type": "ineq", "fun": lambda f: -(c.Ain @ f), "jac": lambda f: -c.Ain},
            {"type": "ineq", "fun": lambda f: kap * c.tau(f)[rows] + d - tgt,
             "jac": lambda f: kap[:, None] * c.T[rows]}]
    r = minimize(lambda f: 0.5 * f @ H @ f + g @ f, f0, jac=lambda f: H @ f + g, constraints=cons,
                 method="SLSQP", options={"maxiter": 500, "ftol": 1e-12})
    f = r.x
    eq, cone = c.residuals(f)
    viol = float(max(0.0, np.max(m - (kap * c.tau(f)[rows] + d))))
    if eq < 1e-6 and cone < 1e-6 and viol < 1e-6:
        return f
    return f0                                    # the LP's point meets every row at t >= m


def settle(c_true, f_plan):
    """Contact forces after the robot settles under the true load: f_plan plus the min-norm change that
    balances the base (``c_true.Aeq`` equals the plan's; only ``beq`` differs)."""
    return f_plan + np.linalg.pinv(c_true.Aeq) @ (c_true.beq - c_true.Aeq @ f_plan)


def hedged_bias(tau_lo, tau_hi, tau_f, gap, g):
    """The compensator's bias (rad) with a hedge band g: ``held_bias``, except a quarter gap (against the
    sign) on a one-signed joint whose |tau| is within g of tau_f at either end."""
    lo, hi = np.asarray(tau_lo, float), np.asarray(tau_hi, float)
    b = held_bias(lo, hi, tau_f, gap)
    if g <= 0:
        return b
    one = np.sign(lo) == np.sign(hi)
    near = (np.abs(np.abs(lo) - tau_f) < g) | (np.abs(np.abs(hi) - tau_f) < g)
    band = one & near
    return np.where(band, -np.sign(hi) * gap / 4.0, b)


def flips(t, t_hat, tau_f):
    """Joints whose held status or side differs between the robot's torques t and the plan t_hat."""
    h, hh = held(t[0], t[1], tau_f), held(t_hat[0], t_hat[1], tau_f)
    return (h != hh) | (h & hh & (np.sign(t[1]) != np.sign(t_hat[1])))


def reachable_states(t_lo, t_hi, r_lo, r_hi, tau_f):
    """Per joint, which held states the robot can reach when its torque at each press end lies anywhere in
    ``[t - r, t + r]`` (the ends taken independently, so the list is exact for independent ends and a superset
    otherwise). Returns three boolean arrays: held positive, held negative, free (milestone 56)."""
    lo0, hi0 = np.asarray(t_lo, float) - r_lo, np.asarray(t_lo, float) + r_lo
    lo1, hi1 = np.asarray(t_hi, float) - r_hi, np.asarray(t_hi, float) + r_hi
    pos = (hi0 >= tau_f) & (hi1 >= tau_f)
    neg = (lo0 <= -tau_f) & (lo1 <= -tau_f)
    inside = ((lo0 < tau_f) & (hi0 > -tau_f)) | ((lo1 < tau_f) & (hi1 > -tau_f))
    split = ((hi0 > 0) & (lo1 < 0)) | ((lo0 < 0) & (hi1 > 0))
    return pos, neg, inside | split


def flip_cost(t_lo, t_hi, r_lo, r_hi, tau_f, gap, w):
    """Per-joint worst change of the nose residual (same units as ``w`` times radians) a backlash flip can make
    when the torque at each end may move by up to ``r``: ``|w_j| max |hb - hb_planned|`` over the reachable held
    states, hb the ``held_bias`` term (-gap/2 held positive, +gap/2 held negative, 0 free). The sum over joints
    bounds the backlash part of the residual by the triangle inequality, because the residual is linear in the
    joint error. Joints whose band holds no other state cost 0 (milestone 56)."""
    gap = np.broadcast_to(np.asarray(gap, float), np.shape(t_lo))
    hb0 = held_bias(t_lo, t_hi, tau_f, gap)
    pos, neg, free = reachable_states(t_lo, t_hi, r_lo, r_hi, tau_f)
    d = np.zeros_like(hb0)
    for ok, hb in ((pos, -gap / 2.0), (neg, gap / 2.0), (free, np.zeros_like(gap))):
        d = np.where(ok, np.maximum(d, np.abs(hb - hb0)), d)
    return np.abs(np.asarray(w, float)) * d
