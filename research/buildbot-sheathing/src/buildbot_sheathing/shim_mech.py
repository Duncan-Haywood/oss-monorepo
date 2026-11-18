"""Milestone 28: the shim as a mechanism. How closely can a robot plumb a seated sheet?

Milestones 10, 12, 13 and 27 plumb the seated sheet by lifting its low bottom corner ("the shim")
and credit that with a corner-height residual of 0.5 mm. The sheet sits on the ledger and turns
about its other bottom corner, so the lift needed is h = |theta| W for the tilt theta that the
ledger and the panel leave (milestone 5's draws). Two ways to set h:

* **a shim stack**: fixed-thickness plastic horseshoe shims (1/16, 1/8 and 1/4 in; supplier
  listings), so h is rounded to the nearest multiple of the thinnest step (``stack_residual``);
* **a driven wedge**: a tapered composite shim (8 in long, 1/16 to 5/16 in thick, so a slope of
  0.25 / 8 = 1:32; supplier listings) pushed between the sheet's bottom edge and the ledger, toward
  the wall. The lift is the slope times the wedge's travel, so the wedge divides the hand's
  stick-slip overshoot (milestone 27) by 32.

Wedge statics (``wedge_force``): the wedge is massless, flat on the ledger (friction mu2) and
inclined at alpha under the sheet's edge (friction mu1). The sheet turns about its far bottom
corner, so the wedge carries m g / 2 plus the wall friction that resists the turn: the press F_n at
a fraction ``rho`` of the sheet width from the pivot gives mu_w F_n rho at the corner, and when the
wedge is driven in, its own horizontal push H into the wall adds mu_w H. Moving in (s = +1) or out
(s = -1), with N1 the normal force on the incline:

    vertical on the sheet   N1 (cos a - s mu1 sin a) = m g / 2 + s mu_w (F_n rho + [s = 1] H)
    horizontal on the sheet H = N1 (sin a + s mu1 cos a)
    push on the wedge       P = N1 sin a + s mu1 N1 cos a + s mu2 N1 (cos a - s mu1 sin a)

P > 0 pushes; for s = -1 a negative P is a pull, and the wedge is self-locking when backing it out
needs a pull (P_out < 0). A driven-out wedge's H pulls the sheet's foot off the wall; the press
is assumed to hold it (reported, not modelled).

Wedge dynamics: a push-only hand is a force source (milestone 27, H103's G1 poses within 2%), so
one tap is ``slide_mech.tap_closed`` with the breakaway and sliding forces above and, as the mass,
the hand's own effective mass along the push (the sheet's reflected inertia, I tan^2 a / W^2, is
grams). ``wedge_loop`` taps in or out until the height is within tolerance. Units: SI.
"""
import math

import numpy as np

from . import ledger as L
from . import slide_mech as S

IN = L.IN
G = L.G
W, H, MASS = L.W, L.H, L.MASS
STEP_STACK = 1 / 16 * IN                       # thinnest horseshoe shim
WEDGE_LEN = 8 * IN
WEDGE_T = (1 / 16 * IN, 5 / 16 * IN)           # thin and thick ends
SLOPE = (WEDGE_T[1] - WEDGE_T[0]) / WEDGE_LEN  # tan alpha = 1/32
I_PIVOT = MASS * (W * W + H * H) / 3           # sheet about a bottom corner, in its plane


def lift_needed(theta, w=W):
    """Corner lift (m) that plumbs a sheet tilted theta (rad), turning about the high corner."""
    return np.abs(np.asarray(theta, float)) * w


def stack_residual(h, step=STEP_STACK):
    """Height left (m, needed minus set) after the lift h is set by a stack of shims of one step.
    The robot stacks the nearest whole number of steps (none when h < step / 2)."""
    h = np.asarray(h, float)
    return h - step * np.round(h / step)


def wedge_force(s, mu1, mu2, mu_w, f_n=S.F_N, rho=0.5, slope=SLOPE, m=MASS):
    """Push P (N, + toward the wall) to move the wedge in (s = +1) or out (s = -1) at constant speed,
    the vertical load V on it and the horizontal push H on the sheet. Returns dict(P, V, H, N1)."""
    a = math.atan(slope)
    ca, sa = math.cos(a), math.sin(a)
    base = m * G / 2 + s * mu_w * f_n * rho
    if s > 0:
        den = ca - mu1 * sa - mu_w * (sa + mu1 * ca)
    else:
        den = ca + mu1 * sa
    if den <= 0:
        return {"P": math.inf, "V": math.inf, "H": math.inf, "N1": math.inf}
    n1 = base / den
    v = n1 * (ca - s * mu1 * sa)
    h = n1 * (sa + s * mu1 * ca)
    p = n1 * sa + s * mu1 * n1 * ca + s * mu2 * v
    return {"P": p, "V": v, "H": h, "N1": n1}


def wedge_taps(mu_s, ratio, mu_w_s=None, f_n=S.F_N, rho=0.5, slope=SLOPE):
    """Breakaway and sliding force magnitudes (N) to drive the wedge in and to back it out, with
    every face at mu_s (static) and ratio * mu_s (kinetic); mu_w_s defaults to mu_s.
    Returns {"in": (F_s, F_k), "out": (F_s, F_k)}; an out entry is None if the wedge is not
    self-locking (it backs out under the sheet's weight alone)."""
    mw = mu_s if mu_w_s is None else mu_w_s
    out = {}
    for name, s in (("in", 1), ("out", -1)):
        fs = s * wedge_force(s, mu_s, mu_s, mw, f_n, rho, slope)["P"]
        fk = s * wedge_force(s, ratio * mu_s, ratio * mu_s, ratio * mw, f_n, rho, slope)["P"]
        out[name] = (fs, fk) if fk > 0 else None
    return out


def reflected_mass(slope=SLOPE, i_pivot=I_PIVOT, w=W):
    """The sheet's turning inertia felt along the wedge's travel (kg)."""
    return i_pivot * slope * slope / (w * w)


def wedge_loop(e0, forces, tau, d_det, m, fdot=200.0, cv_s=0.1, tol=0.02e-3, slope=SLOPE,
               max_taps=400, seed=1):
    """Set the corner height with the wedge. e0: height errors (m, + means the corner is too high).

    Each tap drives the wedge in (e < 0) or backs it out (e > 0) with ``slide_mech.tap_closed``
    on the hand's effective mass m; breakaway varies tap to tap by 1 + N(0, cv_s) (kept above the
    sliding force). Travel x changes the height by slope * x. The robot stops once |e| is within
    max(tol, half the last tap's height change). Returns dict(e, taps, travel, capped), ``capped``
    marking sheets still outside tolerance after ``max_taps``."""
    rng = np.random.default_rng(seed)
    e = np.asarray(e0, float).copy()
    n = e.size
    lim = np.full(n, tol)
    taps = np.zeros(n, int)
    travel = np.zeros(n)
    for _ in range(max_taps):
        act = np.flatnonzero(np.abs(e) > lim)
        if act.size == 0:
            break
        for i in act:
            fs, fk = forces["in"] if e[i] < 0 else forces["out"]
            fs_i = max(fs * (1 + cv_s * rng.standard_normal()), 1.01 * fk)
            d = S.tap_closed(fs_i, fk, tau, d_det, fdot, m)
            dh = slope * d
            e[i] += dh if e[i] < 0 else -dh
            lim[i] = max(tol, dh / 2)
            taps[i] += 1
            travel[i] += d
    return {"e": e, "taps": taps, "travel": travel, "capped": np.abs(e) > lim}


def mu_drivable(push, rho=0.5, lo=0.0, hi=1.0, tol=1e-4):
    """Largest common friction coefficient (every face) at which the wedge's breakaway push is at
    most ``push`` (N), by bisection; 0.0 if even frictionless faces need more."""
    if wedge_force(1, lo, lo, lo, rho=rho)["P"] > push:
        return 0.0
    while hi - lo > tol:
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if wedge_force(1, mid, mid, mid, rho=rho)["P"] <= push else (lo, mid)
    return lo


def effective_mass(rob, qpos, hand=1, axis=0):
    """One hand's effective mass (kg) along a robot-frame axis (0 = x, toward the wall) with the feet
    planted and every actuated joint free (stock PD gains are soft; milestone 27): the inverse of
    j M_a^-1 j^T, with M_a the whole body's mass matrix reduced to the actuated joints through the
    base motion that keeps the soles fixed (``humanoid.hand_jacobian``'s constraint)."""
    import mujoco
    from buildbot_payload import model as P
    m = rob.model
    d = mujoco.MjData(m)
    d.qpos[:] = qpos
    mujoco.mj_forward(m, d)
    Mf = np.zeros((m.nv, m.nv))
    try:
        mujoco.mj_fullM(m, d, Mf)            # MuJoCo 4
    except TypeError:
        mujoco.mj_fullM(m, Mf, d.qM)         # MuJoCo 3
    Jf = np.vstack([np.vstack(P._jac(m, d, P._bid(m, b), p)) for b, p in rob.feet])
    base = -np.linalg.pinv(Jf[:, :6]) @ Jf[:, 6:]
    T = np.vstack([base, np.eye(m.nv - 6)])
    Ma = T.T @ Mf @ T
    b, p = rob.hands["palm"][hand]
    jp, _ = P._jac(m, d, P._bid(m, b), p)
    j = (jp @ T)[axis]
    return float(1.0 / (j @ np.linalg.solve(Ma, j)))
