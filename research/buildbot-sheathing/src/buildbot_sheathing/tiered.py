"""Milestone 45: a two-tier (hold-first) joint preload.

Milestone 37's preload (``preload.margin_rows``, ``margin_lp``, ``solve_margin``) asks every leg joint for
the same margin ``m`` from the holding threshold ``tau_f``. Where the stance caps that common margin
(milestone 44: 0.033 N m at the H1's (1.4 m, -0.15 m)), the joint that crosses its friction band under a
sensor error is a hold-set joint whose margin was the common one. A tiered preload gives the hold-set rows
their own, larger margin and lets the other leg rows take what is left:

* ``tier_lp``: the largest common margin ``t`` on a chosen subset of rows (``top``), every other row kept
  at or above its own floor, base balanced, forces in the cones.
* ``solve_tiered``: the controller's QP (least squared leg torque) with a per-row margin target.

Units: newtons, newton metres.
"""
import numpy as np

SLACK = 1e-6


def tier_lp(c, rows, kap, d, top, floor, cap=1e3):
    """(t, f): max t with kappa_r tau[rows_r] + d_r >= t for r in ``top`` and >= floor_r for the other
    rows; (None, None) if infeasible. ``top`` is a boolean mask over the rows, ``floor`` an array."""
    from scipy.optimize import linprog
    top = np.asarray(top, bool)
    floor = np.asarray(floor, float)
    n = 3 * c.k
    cost = np.zeros(n + 1)
    cost[-1] = -1.0
    A1 = np.hstack([c.Ain, np.zeros((c.Ain.shape[0], 1))])
    G = -(kap[:, None] * c.T[rows])              # -(margin's f part)
    h = kap * c.tau0[rows] + d                   # margin's constant part
    A2 = np.hstack([G, top[:, None].astype(float)])          # t - margin <= 0 on the top rows
    b2 = np.where(top, h, h - floor)                          # floor - margin <= 0 on the rest
    A, b = np.vstack([A1, A2]), np.concatenate([np.zeros(A1.shape[0]), b2])
    Aeq = np.hstack([c.Aeq, np.zeros((6, 1))])
    r = linprog(cost, A_ub=A, b_ub=b, A_eq=Aeq, b_eq=c.beq, bounds=[(None, None)] * n + [(-cap, cap)],
                method="highs")
    if r.status != 0:
        return None, None
    return float(r.x[-1]), r.x[:n]


def solve_tiered(c, legs, rows, kap, d, m, reg=1e-6):
    """min ||tau_legs||^2 + reg ||f||^2 with row r's margin at least m[r]; returns f or None."""
    from scipy.optimize import linprog, minimize
    m = np.asarray(m, float)
    n = 3 * c.k
    # feasibility (and a start point): every row at least its target
    G = kap[:, None] * c.T[rows]
    h = kap * c.tau0[rows] + d
    tgt = m + SLACK
    r0 = linprog(np.zeros(n), A_ub=np.vstack([c.Ain, -G]), b_ub=np.concatenate([np.zeros(c.Ain.shape[0]), h - tgt]),
                 A_eq=c.Aeq, b_eq=c.beq, bounds=[(None, None)] * n, method="highs")
    if r0.status != 0:
        return None
    f0 = r0.x
    legs = np.asarray(legs, int)
    TL = c.T[legs]
    H = TL.T @ TL + reg * np.eye(n)
    g = TL.T @ c.tau0[legs]
    cons = [{"type": "eq", "fun": lambda f: c.Aeq @ f - c.beq, "jac": lambda f: c.Aeq},
            {"type": "ineq", "fun": lambda f: -(c.Ain @ f), "jac": lambda f: -c.Ain},
            {"type": "ineq", "fun": lambda f: G @ f + h - tgt, "jac": lambda f: G}]
    r = minimize(lambda f: 0.5 * f @ H @ f + g @ f, f0, jac=lambda f: H @ f + g, constraints=cons,
                 method="SLSQP", options={"maxiter": 500, "ftol": 1e-12})
    f = r.x
    eq, cone = c.residuals(f)
    viol = float(max(0.0, np.max(m - (G @ f + h))))
    if eq < 1e-6 and cone < 1e-6 and viol < 1e-6:
        return f
    return f0                                    # the LP's point meets every row's target


def row_mask(rows, subset):
    """Boolean mask over margin rows: True where the row's joint is in ``subset``."""
    s = set(int(j) for j in subset)
    return np.array([int(j) in s for j in rows], bool)
